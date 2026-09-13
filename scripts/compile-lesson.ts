import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  parseLessonDraft,
  compileLessonDraft,
  createDoubaoSpeechProvider,
  readDoubaoConfig,
  createTegakiHandwritingProvider,
} from '@learn-anything/content-generator';

async function artifact(path: string, data: string | Buffer) {
  try {
    await writeFile(path, data, { flag: 'wx' });
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
    if (hash(await readFile(path)) !== hash(data))
      throw new Error(
        '输出目录已有不同产物，请选择新的 --output 目录；未覆盖。',
      );
  }
}
async function main() {
  const { values } = parseArgs({
    options: {
      draft: { type: 'string' },
      output: { type: 'string' },
      cached: { type: 'boolean', default: false },
      generate: { type: 'boolean', default: false },
      'audio-url': { type: 'string' },
      'captions-url': { type: 'string' },
    },
  });
  if (!values.draft) throw new Error('请用 --draft 指定课程材料 JSON 文件。');
  if (values.cached && values.generate)
    throw new Error('--cached 和 --generate 只能选择一个。');
  const draft = parseLessonDraft(
    JSON.parse(await readFile(resolve(values.draft), 'utf8')),
  );
  console.log(
    `材料有效：${draft.title}；${draft.segments.length} 个旁白片段，${draft.events.length} 个板书／动画动作。`,
  );
  if (!values.cached && !values.generate) {
    console.log(
      '仅预检，不调用语音接口、不处理音频、不写产物；--cached 仅复用缓存，--generate 明确允许合成。',
    );
    return;
  }
  const compiled = await compileLessonDraft(draft, {
    handwriting: createTegakiHandwritingProvider({
      cacheRoot: resolve('outputs/handwriting'),
    }),
    speech: createDoubaoSpeechProvider({
      config: readDoubaoConfig(process.env),
      cacheRoot: resolve('outputs/tts/doubao'),
      allowSynthesis: values.generate,
      onSegment: (status) =>
        console.log(
          `${status.source === 'cache' ? '复用缓存' : '调用语音接口（可能消耗额度，不自动重试）'}：${status.id}`,
        ),
    }),
    ...(values['audio-url'] || values['captions-url']
      ? {
          resources: {
            audio: values['audio-url'] ?? `/audio/${draft.id}.mp3`,
            captions: values['captions-url'] ?? `/lessons/${draft.id}.vtt`,
          },
        }
      : {}),
  });
  const reportJson = JSON.stringify(compiled.report, null, 2) + '\n';
  const key = createHash('sha256')
    .update(compiled.lessonJson)
    .update(compiled.audio)
    .update(compiled.captionsVtt)
    .update(reportJson)
    .digest('hex')
    .slice(0, 16);
  const directory = resolve(
    values.output ?? join('outputs/compiled', draft.id, key),
  );
  await mkdir(directory, { recursive: true });
  await artifact(join(directory, 'lesson.json'), compiled.lessonJson);
  await artifact(join(directory, 'narration.mp3'), compiled.audio);
  await artifact(join(directory, 'captions.vtt'), compiled.captionsVtt);
  await artifact(join(directory, 'alignment.json'), reportJson);
  if (compiled.handwritingFont)
    await artifact(
      join(directory, 'handwriting.ttf'),
      compiled.handwritingFont,
    );
  if (compiled.report.handwriting)
    console.log(
      `手写资源：${compiled.report.handwriting.glyphCount} 个字形；缺失字符：${compiled.report.handwriting.missing.join('') || '无'}。字体资源地址：${compiled.lesson.handwriting!.fontUrl}`,
    );
  console.log(
    `编译完成：${compiled.lesson.duration} 秒；产物位于 ${directory}。试听与低置信度词人工核对仍待完成。`,
  );
}
main().catch((error) => {
  // Library errors are sanitized; never serialize request/env/provider objects.
  console.error(
    error instanceof Error && !/key|secret|token|api/i.test(error.message)
      ? error.message
      : '编译失败，请检查材料、语音配置、缓存或音频工具；不自动重试。',
  );
  process.exitCode = 1;
});
