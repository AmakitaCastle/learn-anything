import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  createLessonDraftProvider,
  importLessonDraft,
  parseLessonBrief,
  readLessonDraftProviderConfig,
} from '@learn-anything/lesson-draft-generator';
import {
  createDoubaoSpeechProvider,
  createFfmpegAudioProcessor,
  createTegakiHandwritingProvider,
  readDoubaoConfig,
} from '@learn-anything/content-generator';
import {
  readWorkflowFile,
  runLessonWorkflow,
  topicBrief,
  type LessonWorkflowInput,
} from './lesson-workflow.ts';
import { openLessonBrowser, startLessonViewer } from './lesson-viewer.ts';
import { formatLessonTaskError } from './lesson-errors.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const help = `一条命令：备课 → 编译 → 本地播放

  npm run lesson -- "水循环" --generate
  npm run lesson -- --brief examples/briefs/water-cycle.json --generate
  npm run lesson -- --draft path/to/lesson.draft.json --cached
  npm run lesson -- --play outputs/runs/<id>/<run>

不带 --generate / --cached 时仅离线预检。
--generate 明确允许文本模型及缺失语音缓存的付费请求。
--cached 仅用于已有材料，不请求文本模型，不合成缺失语音。
--audience 受众、--segments 1–20、--duration 15–1800、--id 标识（仅主题输入）。
--repair-attempts 0–2：额外材料修复次数，默认 0。
--json-mode false / --token-limit-field max_tokens：兼容文本模型端点。
--max-output-tokens 正整数：可选输出上限；默认不设上限，使用接口默认值（Anthropic 默认 8192）。
--output 新目录、--no-play 只保存课程、--no-open 不自动打开浏览器。
--port 端口：默认自动选空闲端口，只监听 127.0.0.1。
播放器启动后在终端按 Ctrl+C 退出，课程文件保留。`;

export function parseLessonCommand(args: string[]) {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      topic: { type: 'string' },
      brief: { type: 'string' },
      draft: { type: 'string' },
      play: { type: 'string' },
      generate: { type: 'boolean', default: false },
      cached: { type: 'boolean', default: false },
      audience: { type: 'string' },
      segments: { type: 'string' },
      duration: { type: 'string' },
      id: { type: 'string' },
      output: { type: 'string' },
      port: { type: 'string', default: '0' },
      'no-play': { type: 'boolean', default: false },
      'no-open': { type: 'boolean', default: false },
      'repair-attempts': { type: 'string', default: '0' },
      'json-mode': { type: 'string', default: 'true' },
      'token-limit-field': { type: 'string', default: 'max_completion_tokens' },
      'max-output-tokens': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const values = parsed.values;
  if (values.help)
    return {
      values,
      topic: undefined,
      port: 0,
      repairs: 0,
      maxOutputTokens: undefined,
      checkOnly: true,
    };
  if (
    parsed.positionals.length > 1 ||
    (parsed.positionals.length && values.topic)
  )
    throw new Error('主题输入重复。');
  const topic = values.topic ?? parsed.positionals[0];
  if (
    [topic, values.brief, values.draft, values.play].filter(
      (value) => value !== undefined,
    ).length !== 1
  )
    throw new Error('请选择主题、需求文件、人工材料或已编译课程中的一个。');
  if (values.generate && values.cached)
    throw new Error('生成和缓存模式不能同时使用。');
  if (values.cached && !values.draft) throw new Error('缓存模式需要已有材料。');
  if (
    values.play &&
    (values.generate ||
      values.cached ||
      values.output ||
      values['no-play'] ||
      values['repair-attempts'] !== '0')
  )
    throw new Error('重播模式不能生成、编译或修改输出。');
  if (
    !topic &&
    [values.audience, values.segments, values.duration, values.id].some(
      (value) => value !== undefined,
    )
  )
    throw new Error('备课参数只适用于主题输入。');
  const port = Number(values.port),
    repairs = Number(values['repair-attempts']);
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    !Number.isInteger(repairs) ||
    repairs < 0 ||
    repairs > 2
  )
    throw new Error('端口或修复次数无效。');
  if (repairs && (!values.generate || values.draft))
    throw new Error('材料修复仅适用于明确的模型生成。');
  if (
    !['true', 'false'].includes(values['json-mode']!) ||
    !['max_completion_tokens', 'max_tokens'].includes(
      values['token-limit-field']!,
    )
  )
    throw new Error('模型兼容选项无效。');
  const maxOutputTokens =
    values['max-output-tokens'] === undefined
      ? undefined
      : Number(values['max-output-tokens']);
  if (
    maxOutputTokens !== undefined &&
    (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0)
  )
    throw new Error('输出 token 上限必须为正整数。');
  return {
    values,
    topic,
    port,
    repairs,
    maxOutputTokens,
    checkOnly: !values.generate && !values.cached && !values.play,
  };
}

export async function main(args = process.argv.slice(2)) {
  if (!args.length) {
    console.log(help);
    return;
  }
  const { values, topic, port, repairs, maxOutputTokens, checkOnly } =
    parseLessonCommand(args);
  if (values.help) {
    console.log(help);
    return;
  }
  let input: LessonWorkflowInput | undefined;
  if (!values.play) {
    input = values.draft
      ? { draft: await readWorkflowFile(values.draft) }
      : {
          brief: values.brief
            ? parseLessonBrief(await readWorkflowFile(values.brief))
            : topicBrief(topic!, {
                id: values.id,
                audience: values.audience,
                ...(values.segments === undefined
                  ? {}
                  : { segmentCount: Number(values.segments) }),
                ...(values.duration === undefined
                  ? {}
                  : { targetDurationSeconds: Number(values.duration) }),
              }),
        };
    if ('draft' in input) importLessonDraft(input.draft);
    if (checkOnly) {
      console.log(
        '输入有效。仅离线预检：不请求模型或语音、不处理音频、不写文件、不启动播放器。',
      );
      console.log(
        '加 --generate 串联生成、编译和播放；已有材料可加 --cached 只复用语音缓存。',
      );
      return;
    }
  }
  const lifecycle = new AbortController();
  const stop = () => lifecycle.abort();
  // Keep listeners until cleanup: bundler signal handlers must not re-raise
  // the signal while this invocation is still closing its server/temp files.
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  let viewer: Awaited<ReturnType<typeof startLessonViewer>> | undefined;
  try {
    let directory = values.play ? resolve(values.play) : undefined;
    if (input) {
      // Validate both configurations and audio tools before any billable work.
      const requiredFields = [
        'DOUBAO_SPEECH_API_KEY',
        'DOUBAO_TTS_RESOURCE_ID',
        'DOUBAO_TTS_SPEAKER',
        ...('brief' in input
          ? ['LESSON_LLM_PROVIDER', 'LESSON_LLM_MODEL', 'LESSON_LLM_API_KEY']
          : []),
      ];
      const missing = requiredFields.filter(
        (field) => !process.env[field]?.trim(),
      );
      if (missing.length) {
        // Field names are fixed by this host; no credential values are printed.
        console.error(`请在 .env.local 中填写：${missing.join('、')}。`);
        throw new Error('服务配置缺失。');
      }
      const speechConfig = readDoubaoConfig(process.env);
      const provider =
        'brief' in input
          ? createLessonDraftProvider({
              ...readLessonDraftProviderConfig(process.env),
              maxOutputTokens,
              jsonMode: values['json-mode'] === 'true',
              tokenLimitField: values['token-limit-field'] as
                | 'max_completion_tokens'
                | 'max_tokens',
            })
          : undefined;
      console.log(
        values.generate
          ? '允许模型备课及缺失缓存时的语音合成（可能消耗额度）；不自动重试或切换供应商。'
          : '仅复用语音缓存；缓存缺失会停止，不调用付费接口。',
      );
      const result = await runLessonWorkflow(
        input,
        {
          outputRoot: resolve(root, 'outputs/runs'),
          output: values.output,
          maxRepairAttempts: repairs,
        },
        {
          provider,
          speech: createDoubaoSpeechProvider({
            config: speechConfig,
            cacheRoot: resolve(root, 'outputs/tts/doubao'),
            allowSynthesis: values.generate,
            fetcher: (url, init) =>
              fetch(url, {
                ...init,
                signal: init?.signal
                  ? AbortSignal.any([init.signal, lifecycle.signal])
                  : lifecycle.signal,
              }),
            onSegment: ({ id, source }) =>
              console.log(
                `${source === 'cache' ? '复用语音缓存' : '合成语音'}：${id}`,
              ),
          }),
          audio: createFfmpegAudioProcessor(),
          handwriting: createTegakiHandwritingProvider({
            cacheRoot: resolve(root, 'outputs/handwriting'),
            fontUrl: '/lesson-assets/handwriting.ttf',
          }),
          signal: lifecycle.signal,
          onStage(stage, path) {
            if (stage === 'prepare') console.log('1/4 检查本地音频工具…');
            if (stage === 'draft')
              console.log(
                `2/4 ${values.draft ? '导入材料' : '模型备课'}…\n本次目录：${path}`,
              );
            if (stage === 'compile')
              console.log('3/4 编译语音、板书、动画、字幕和手写资源…');
          },
        },
      );
      directory = result.directory;
      console.log(
        `课程已保存：${directory}\n实测时长 ${result.duration} 秒；知识、听感和低置信度词仍需人工复核。`,
      );
      if (values['no-play']) return;
    }
    if (lifecycle.signal.aborted) return;
    console.log('4/4 启动本地播放器…');
    viewer = await startLessonViewer(directory!, { port });
    if (lifecycle.signal.aborted) return;
    console.log(
      `播放器：${viewer.url}\n浏览器中点击“播放”开始。终端按 Ctrl+C 退出，课程文件保留。`,
    );
    if (!values['no-open'])
      await openLessonBrowser(viewer.url).catch(() =>
        console.log('无法自动打开浏览器，请打开上面的地址。'),
      );
    if (!lifecycle.signal.aborted)
      await new Promise<void>((resolve) =>
        lifecycle.signal.addEventListener('abort', () => resolve(), {
          once: true,
        }),
      );
  } finally {
    await viewer?.close();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    // Do not echo env, provider responses, arbitrary arguments or filesystem errors.
    console.error(formatLessonTaskError(error));
    console.error(
      '若已保存 lesson.draft.json，可用 --draft <文件> --generate 继续编译；若已保存 lesson.json，可用 --play <目录> 打开。使用 --help 查看命令。',
    );
    process.exitCode = 1;
  });
