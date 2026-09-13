import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { LessonSpec } from '@learn-anything/content-generator/legacy-lesson';
import { alignBinarySearch } from '@learn-anything/content-generator/tts/alignment';
import { cachedSpeech } from '@learn-anything/content-generator/tts/cache';
import { lessonNarration } from '@learn-anything/content-generator/tts/narration';

async function main() {
  const { values } = parseArgs({ options: { cache: { type: 'string' } } });
  if (!values.cache || !/^[a-f0-9]{64}$/.test(values.cache)) {
    throw new Error('请提供 --cache 加 64 位缓存标识。此命令不调用语音接口。');
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const audioPath = await cachedSpeech(
    `${root}outputs/tts/doubao/`,
    values.cache,
  );
  if (!audioPath) throw new Error('找不到完整音频缓存。');
  const source = JSON.parse(
    await readFile(`${root}public/lessons/binary-search.json`, 'utf8'),
  ) as LessonSpec;
  const manifest = JSON.parse(
    await readFile(join(dirname(audioPath), 'manifest.json'), 'utf8'),
  );
  if (
    manifest.mode !== 'lesson' ||
    manifest.text !== lessonNarration(source, 'lesson').text ||
    !Array.isArray(manifest.providerMetadata)
  ) {
    throw new Error('缓存不是本课完整讲稿，停止对齐。');
  }
  const duration = Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        audioPath,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  execFileSync('ffmpeg', ['-v', 'error', '-i', audioPath, '-f', 'null', '-'], {
    stdio: 'pipe',
  });
  const result = alignBinarySearch(source, manifest.providerMetadata, duration);
  const report = {
    schemaVersion: 1,
    provider: 'doubao',
    method: 'provider-word-timestamps',
    duration,
    audioSha256: manifest.audioSha256,
    wordCount: result.wordCount,
    timingMap: result.lesson.timingMap,
    lowConfidenceWords: result.lowConfidenceWords,
    humanReview: 'pending',
    note: '语义锚点采用接口返回时间戳；装饰动画在锚点间插值。低置信度片段需要人工试听核对。',
  };
  // Immutable versioned artifacts: preserve the old audio/spec/captions and
  // refuse to overwrite a different previously aligned version.
  async function artifact(path: string, data: string | Buffer) {
    try {
      await writeFile(path, data, { flag: 'wx' });
    } catch (error) {
      if (
        !(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'EEXIST'
        )
      )
        throw error;
      const hash = (value: string | Buffer) =>
        createHash('sha256').update(value).digest('hex');
      if (hash(await readFile(path)) !== hash(data))
        throw new Error(`已有不同版本，未覆盖：${path}`);
    }
  }
  await artifact(
    `${root}public/audio/binary-search-doubao-zh.mp3`,
    await readFile(audioPath),
  );
  await artifact(
    `${root}public/lessons/binary-search-doubao-zh.vtt`,
    result.vtt,
  );
  await artifact(
    `${root}public/lessons/binary-search-doubao.json`,
    JSON.stringify(result.lesson, null, 2) + '\n',
  );
  await artifact(
    `${root}outputs/tts/doubao/${values.cache}/alignment.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    `整课对齐完成：${duration} 秒，${result.wordCount} 个词时间戳，${result.lesson.timingMap?.length} 个语义/边界锚点。`,
  );
  console.log(
    `低置信度词 ${result.lowConfidenceWords.length} 个，已写入 alignment.json 供人工核对。`,
  );
  console.log('旧课堂资源保留；页面需明确切换到 binary-search-doubao.json。');
}

main().catch(() => {
  console.error(
    '对齐失败：请检查缓存、时间戳、已有版本及本地 ffmpeg/ffprobe；未调用云端接口。',
  );
  process.exitCode = 1;
});
