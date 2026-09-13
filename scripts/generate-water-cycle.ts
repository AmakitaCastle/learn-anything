import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  compileLessonDraft,
  createDoubaoSpeechProvider,
  readDoubaoConfig,
} from '@learn-anything/content-generator';
import { waterCycleDraft } from '@learn-anything/content-generator/examples/water-cycle';
const root = fileURLToPath(new URL('../', import.meta.url));
async function artifact(target: string, data: string | Buffer) {
  try {
    await writeFile(target, data, { flag: 'wx' });
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== 'EEXIST'
    )
      throw error;
    const hash = (value: string | Buffer) =>
      createHash('sha256').update(value).digest('hex');
    if (hash(await readFile(target)) !== hash(data))
      throw new Error('已有不同版本，未覆盖。');
  }
}
async function main() {
  const { values } = parseArgs({
    options: {
      generate: { type: 'boolean', default: false },
      cached: { type: 'boolean', default: false },
    },
  });
  if (values.generate && values.cached)
    throw new Error('请选择 generate 或 cached。');
  console.log('水循环：' + waterCycleDraft.segments.length + ' 个语义片段。');
  if (!values.generate && !values.cached) {
    console.log('仅预检，不调用语音接口。');
    waterCycleDraft.segments.forEach((segment) =>
      console.log(segment.label + '：' + segment.text),
    );
    return;
  }
  const compiled = await compileLessonDraft(waterCycleDraft, {
    speech: createDoubaoSpeechProvider({
      config: readDoubaoConfig(process.env),
      cacheRoot: join(root, 'outputs/tts/doubao'),
      allowSynthesis: values.generate,
      onSegment: (status) =>
        console.log(
          (status.source === 'cache'
            ? '复用片段缓存：'
            : '生成片段（可能消耗额度）：') + status.id,
        ),
    }),
    resources: {
      audio: '/audio/water-cycle-zh.mp3',
      captions: '/lessons/water-cycle-zh.vtt',
    },
  });
  const reportJson = JSON.stringify(compiled.report, null, 2) + '\n';
  const key = createHash('sha256')
    .update(compiled.lessonJson)
    .update(compiled.audio)
    .update(compiled.captionsVtt)
    .update(reportJson)
    .digest('hex');
  const build = join(root, 'outputs/compiled/water-cycle', key);
  await mkdir(build, { recursive: true });
  await artifact(join(build, 'lesson.json'), compiled.lessonJson);
  await artifact(join(build, 'narration.mp3'), compiled.audio);
  await artifact(join(build, 'captions.vtt'), compiled.captionsVtt);
  await artifact(join(build, 'alignment.json'), reportJson);
  await artifact(join(root, 'public/audio/water-cycle-zh.mp3'), compiled.audio);
  await artifact(
    join(root, 'public/lessons/water-cycle-zh.vtt'),
    compiled.captionsVtt,
  );
  await artifact(
    join(root, 'public/lessons/water-cycle.json'),
    compiled.lessonJson,
  );
  console.log(
    '通用编译完成：' +
      compiled.lesson.duration +
      ' 秒；旧课未修改，人工听感核对仍待完成。',
  );
}
main().catch(() => {
  console.error(
    '水循环材料编译失败，请检查材料、语音配置、缓存或本地音频工具；不自动重试，未覆盖不同的已有产物。',
  );
  process.exitCode = 1;
});
