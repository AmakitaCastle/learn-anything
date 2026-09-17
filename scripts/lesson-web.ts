import { randomBytes } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  createLessonDraftProvider,
  readLessonDraftProviderConfig,
} from '@learn-anything/lesson-draft-generator';
import {
  createDoubaoSpeechProvider,
  createFfmpegAudioProcessor,
  createTegakiHandwritingProvider,
  readDoubaoConfig,
} from '@learn-anything/content-generator';
import { parseLesson } from '@learn-anything/lesson-schema';
import { runLessonWorkflow, topicBrief } from './lesson-workflow.ts';
import { formatLessonTaskError } from './lesson-errors.ts';
import { prepareDemoLesson } from './lesson-demo.ts';
import { openLessonBrowser, startLessonViewer } from './lesson-viewer.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const terminalPhases = new Set(['complete', 'error', 'cancelled']);

export type LessonWebFile = { bytes: Buffer; type: string };
export type LessonWebRequest =
  | { mode: 'demo' }
  | {
      mode: 'generate';
      topic: string;
      audience: string;
      segmentCount: number;
      targetDurationSeconds: number;
      confirmExternalRequest: true;
    };
export type LessonWebSetupStatus = {
  model: boolean;
  speech: boolean;
  ffmpeg: boolean;
  ready: boolean;
};
export type LessonWebProgress = {
  phase:
    | 'queued'
    | 'prepare'
    | 'draft'
    | 'compile'
    | 'player'
    | 'complete'
    | 'error'
    | 'cancelled';
  progress: number;
  message: string;
};
export type LessonWebResult = {
  viewerUrl: string;
  output: string;
  duration: number;
  close(): Promise<void>;
};
export type LessonWebDependencies = {
  status(): Promise<LessonWebSetupStatus>;
  run(
    input: LessonWebRequest,
    context: {
      signal: AbortSignal;
      onProgress(progress: LessonWebProgress): void;
    },
  ): Promise<LessonWebResult>;
};

const mime: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  json: 'application/json; charset=utf-8',
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('课程请求无效。');
  return value as Record<string, unknown>;
}

export function parseLessonWebRequest(value: unknown): LessonWebRequest {
  const input = object(value);
  if (input.mode === 'demo') return { mode: 'demo' };
  if (input.mode !== 'generate') throw new Error('课程请求无效。');
  if (input.confirmExternalRequest !== true)
    throw new Error('需要确认模型和语音请求。');
  if (
    typeof input.topic !== 'string' ||
    typeof input.audience !== 'string' ||
    !Number.isInteger(input.segmentCount) ||
    !Number.isInteger(input.targetDurationSeconds)
  )
    throw new Error('课程参数无效。');
  const brief = topicBrief(input.topic.trim(), {
    audience: input.audience.trim(),
    segmentCount: input.segmentCount as number,
    targetDurationSeconds: input.targetDurationSeconds as number,
  });
  return {
    mode: 'generate',
    topic: brief.topic,
    audience: brief.audience,
    segmentCount: brief.segmentCount!,
    targetDurationSeconds: brief.targetDurationSeconds!,
    confirmExternalRequest: true,
  };
}

export async function lessonWebSetupStatus(
  env: Record<string, string | undefined> = process.env,
): Promise<LessonWebSetupStatus> {
  const model = [
    'LESSON_LLM_PROVIDER',
    'LESSON_LLM_MODEL',
    'LESSON_LLM_API_KEY',
  ].every((name) => Boolean(env[name]?.trim()));
  let speech = false;
  try {
    readDoubaoConfig(env);
    speech = true;
  } catch {
    // Keep configuration details and validation errors out of the browser.
  }
  let ffmpeg = false;
  try {
    await createFfmpegAudioProcessor().prepare?.();
    ffmpeg = true;
  } catch {
    // The browser only needs a bounded availability flag, never raw tool output.
  }
  return { model, speech, ffmpeg, ready: model && speech && ffmpeg };
}

async function generatedLesson(
  input: Extract<LessonWebRequest, { mode: 'generate' }>,
  context: Parameters<LessonWebDependencies['run']>[1],
): Promise<LessonWebResult> {
  const speechConfig = readDoubaoConfig(process.env);
  const provider = createLessonDraftProvider(
    readLessonDraftProviderConfig(process.env),
  );
  let compiledSegments = 0;
  const result = await runLessonWorkflow(
    {
      brief: topicBrief(input.topic, {
        audience: input.audience,
        segmentCount: input.segmentCount,
        targetDurationSeconds: input.targetDurationSeconds,
      }),
    },
    { outputRoot: resolve(root, 'outputs/runs') },
    {
      provider,
      speech: createDoubaoSpeechProvider({
        config: speechConfig,
        cacheRoot: resolve(root, 'outputs/tts/doubao'),
        allowSynthesis: true,
        fetcher: (url, init) =>
          fetch(url, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, context.signal])
              : context.signal,
          }),
        onSegment: ({ source }) => {
          compiledSegments++;
          context.onProgress({
            phase: 'compile',
            progress: Math.min(82, 54 + compiledSegments * 4),
            message:
              source === 'cache'
                ? `正在复用第 ${compiledSegments} 段语音缓存…`
                : `正在合成第 ${compiledSegments} 段语音…`,
          });
        },
      }),
      audio: createFfmpegAudioProcessor(),
      handwriting: createTegakiHandwritingProvider({
        cacheRoot: resolve(root, 'outputs/handwriting'),
        fontUrl: '/lesson-assets/handwriting.ttf',
      }),
      signal: context.signal,
      onStage(stage) {
        if (stage === 'prepare')
          context.onProgress({
            phase: 'prepare',
            progress: 8,
            message: '正在检查本地音频工具和任务输入…',
          });
        if (stage === 'draft')
          context.onProgress({
            phase: 'draft',
            progress: 24,
            message: '正在生成并校验课程材料…',
          });
        if (stage === 'compile')
          context.onProgress({
            phase: 'compile',
            progress: 52,
            message: '正在编译语音、板书、动画和字幕…',
          });
        if (stage === 'saved')
          context.onProgress({
            phase: 'player',
            progress: 88,
            message: '课程已保存，正在准备播放器…',
          });
      },
    },
  );
  context.signal.throwIfAborted();
  const viewer = await startLessonViewer(result.directory);
  if (context.signal.aborted) {
    await viewer.close();
    context.signal.throwIfAborted();
  }
  return {
    viewerUrl: viewer.url,
    output: relative(root, result.directory),
    duration: result.duration,
    close: () => viewer.close(),
  };
}

async function demoLesson(
  context: Parameters<LessonWebDependencies['run']>[1],
): Promise<LessonWebResult> {
  context.onProgress({
    phase: 'player',
    progress: 72,
    message: '正在准备内置示例课程…',
  });
  const demo = await prepareDemoLesson();
  try {
    const lesson = parseLesson(
      JSON.parse(await readFile(join(demo.directory, 'lesson.json'), 'utf8')),
    );
    const viewer = await startLessonViewer(demo.directory);
    return {
      viewerUrl: viewer.url,
      output: '内置示例（不写入 outputs）',
      duration: lesson.duration,
      async close() {
        await viewer.close();
        await demo.close();
      },
    };
  } catch (error) {
    await demo.close();
    throw error;
  }
}

const defaultDependencies: LessonWebDependencies = {
  status: lessonWebSetupStatus,
  run(input, context) {
    return input.mode === 'demo'
      ? demoLesson(context)
      : generatedLesson(input, context);
  },
};

async function bundledFiles(directory: string, prefix = '') {
  const files = new Map<string, LessonWebFile>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) {
      for (const [name, file] of await bundledFiles(
        join(directory, entry.name),
        key + '/',
      ))
        files.set(name, file);
    } else if (entry.isFile()) {
      files.set(key, {
        bytes: await readFile(join(directory, entry.name)),
        type: mime[entry.name.split('.').at(-1)!] ?? 'application/octet-stream',
      });
    }
  }
  return files;
}

async function buildWebFrontend() {
  const directory = await mkdtemp(join(tmpdir(), 'learn-anything-web-'));
  try {
    const { build } = await import('vite');
    await build({
      configFile: false,
      root: fileURLToPath(new URL('../web', import.meta.url)),
      base: './',
      envDir: false,
      publicDir: false,
      logLevel: 'silent',
      resolve: {
        conditions: [
          'learn-anything-source',
          'module',
          'browser',
          'production',
        ],
      },
      define: { 'process.env.NODE_ENV': '"production"' },
      oxc: { jsx: { runtime: 'automatic', development: false } },
      css: { postcss: { plugins: [] } },
      build: { outDir: directory, emptyOutDir: false, sourcemap: false },
    });
    return { directory, files: await bundledFiles(directory) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function readJsonBody(request: AsyncIterable<Buffer | string>) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 16 * 1024) throw new Error('请求内容过长。');
  }
  return JSON.parse(body);
}

function json(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
) {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'Content-Type': mime.json,
    'Content-Length': bytes.length,
  });
  response.end(bytes);
}

type JobSnapshot = LessonWebProgress & {
  id: string;
  viewerUrl?: string;
  output?: string;
  duration?: number;
};
type WebJob = {
  snapshot: JobSnapshot;
  controller: AbortController;
  listeners: Set<ServerResponse>;
};

export async function startLessonWebApp(
  options: {
    port?: number;
    token?: string;
    files?: Map<string, LessonWebFile>;
    dependencies?: LessonWebDependencies;
  } = {},
): Promise<{ url: string; close(): Promise<void> }> {
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Web 端口无效。');
  const token = options.token ?? randomBytes(16).toString('hex');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(token))
    throw new Error('Web 访问标识无效。');
  const prefix = `/${token}/`;
  const dependencies = options.dependencies ?? defaultDependencies;
  const bundle = options.files
    ? { directory: undefined, files: options.files }
    : await buildWebFrontend();
  let currentJob: WebJob | undefined;
  let currentResult: LessonWebResult | undefined;
  let task: Promise<void> | undefined;

  const snapshot = (job: WebJob) => JSON.stringify(job.snapshot);
  const publish = (job: WebJob) => {
    const payload = `event: status\ndata: ${snapshot(job)}\n\n`;
    for (const listener of job.listeners) {
      try {
        listener.write(payload);
        if (terminalPhases.has(job.snapshot.phase)) listener.end();
      } catch {
        job.listeners.delete(listener);
      }
    }
    if (terminalPhases.has(job.snapshot.phase)) job.listeners.clear();
  };
  const update = (job: WebJob, progress: LessonWebProgress) => {
    job.snapshot = { ...job.snapshot, ...progress };
    publish(job);
  };
  const run = (job: WebJob, input: LessonWebRequest) => {
    task = (async () => {
      try {
        if (currentResult) {
          await currentResult.close();
          currentResult = undefined;
        }
        const result = await dependencies.run(input, {
          signal: job.controller.signal,
          onProgress: (progress) => update(job, progress),
        });
        currentResult = result;
        job.snapshot = {
          id: job.snapshot.id,
          phase: 'complete',
          progress: 100,
          message:
            input.mode === 'demo'
              ? '示例课程已准备好。'
              : '课程已生成，请预览并人工复核内容与听感。',
          viewerUrl: result.viewerUrl,
          output: result.output,
          duration: result.duration,
        };
        publish(job);
      } catch (error) {
        update(job, {
          phase: job.controller.signal.aborted ? 'cancelled' : 'error',
          progress: job.controller.signal.aborted ? job.snapshot.progress : 100,
          message: job.controller.signal.aborted
            ? '生成已取消；已经保存的中间材料不会删除。'
            : formatLessonTaskError(error),
        });
      }
    })();
    void task.finally(() => {
      task = undefined;
    });
  };

  const server = createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Frame-Options', 'DENY');
    const address = server.address();
    if (
      !address ||
      typeof address === 'string' ||
      request.headers.host !== `127.0.0.1:${address.port}`
    ) {
      response.writeHead(403).end();
      return;
    }
    const origin = `http://127.0.0.1:${address.port}`;
    const pathname = request.url?.split('?')[0] ?? '';
    if (!pathname.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    const resource = pathname.slice(prefix.length);
    const sameOriginMutation = () => {
      if (request.headers.origin && request.headers.origin !== origin) {
        response.writeHead(403).end();
        return false;
      }
      return true;
    };
    if (resource === 'api/status' && request.method === 'GET') {
      void dependencies
        .status()
        .then((status) => json(response, 200, status))
        .catch(() =>
          json(response, 503, {
            model: false,
            speech: false,
            ffmpeg: false,
            ready: false,
          }),
        );
      return;
    }
    if (resource === 'api/jobs' && request.method === 'POST') {
      if (!sameOriginMutation()) return;
      if (!request.headers['content-type']?.startsWith('application/json')) {
        response.writeHead(415).end();
        return;
      }
      void (async () => {
        try {
          if (currentJob && !terminalPhases.has(currentJob.snapshot.phase)) {
            json(response, 409, {
              error: '已有课程正在生成，请等待完成或先取消。',
            });
            return;
          }
          const input = parseLessonWebRequest(await readJsonBody(request));
          const id = randomBytes(12).toString('hex');
          const job: WebJob = {
            snapshot: {
              id,
              phase: 'queued',
              progress: 2,
              message:
                input.mode === 'demo'
                  ? '正在载入内置示例…'
                  : '任务已创建，准备检查环境…',
            },
            controller: new AbortController(),
            listeners: new Set(),
          };
          currentJob = job;
          json(response, 202, { id });
          run(job, input);
        } catch {
          json(response, 400, {
            error: '课程参数无效，请检查主题、受众、时长和段落数。',
          });
        }
      })();
      return;
    }
    const events = /^api\/jobs\/([a-f0-9]{24})\/events$/.exec(resource);
    if (events && request.method === 'GET') {
      if (!currentJob || currentJob.snapshot.id !== events[1]) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.write(`event: status\ndata: ${snapshot(currentJob)}\n\n`);
      if (terminalPhases.has(currentJob.snapshot.phase)) {
        response.end();
        return;
      }
      currentJob.listeners.add(response);
      request.once('close', () => currentJob?.listeners.delete(response));
      return;
    }
    const cancel = /^api\/jobs\/([a-f0-9]{24})$/.exec(resource);
    if (cancel && request.method === 'DELETE') {
      if (!sameOriginMutation()) return;
      if (!currentJob || currentJob.snapshot.id !== cancel[1]) {
        response.writeHead(404).end();
        return;
      }
      if (!terminalPhases.has(currentJob.snapshot.phase))
        currentJob.controller.abort();
      json(response, 202, { cancelled: true });
      return;
    }
    if (resource.startsWith('api/')) {
      response.writeHead(404).end();
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const file = bundle.files.get(resource || 'index.html');
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Content-Type', file.type);
    response.setHeader('Content-Length', file.bytes.length);
    response.end(request.method === 'HEAD' ? undefined : file.bytes);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    if (bundle.directory)
      await rm(bundle.directory, { recursive: true, force: true });
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Web 启动失败。');
  let closed = false;
  return {
    url: `http://127.0.0.1:${address.port}${prefix}`,
    async close() {
      if (closed) return;
      closed = true;
      currentJob?.controller.abort();
      await task?.catch(() => undefined);
      await currentResult?.close();
      for (const listener of currentJob?.listeners ?? []) listener.end();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      if (bundle.directory)
        await rm(bundle.directory, { recursive: true, force: true });
    },
  };
}

export function parseLessonWebCommand(args: string[]) {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    options: {
      port: { type: 'string', default: '0' },
      'no-open': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const port = Number(parsed.values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Web 端口无效。');
  return { port, noOpen: parsed.values['no-open'], help: parsed.values.help };
}

async function main(args = process.argv.slice(2)) {
  const options = parseLessonWebCommand(args);
  if (options.help) {
    console.log(
      `本地 Web Demo\n\n  npm run web\n  npm run web -- --no-open\n  npm run web -- --port 4318\n\n服务只监听 127.0.0.1；密钥仍从 .env.local 读取。`,
    );
    return;
  }
  const app = await startLessonWebApp({ port: options.port });
  const lifecycle = new AbortController();
  const stop = () => lifecycle.abort();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    console.log(`learnAnything Web：${app.url}`);
    console.log('服务只在本机运行。终端按 Ctrl+C 退出，生成的课程文件保留。');
    if (!options.noOpen)
      await openLessonBrowser(app.url).catch(() =>
        console.log('无法自动打开浏览器，请打开上面的地址。'),
      );
    if (!lifecycle.signal.aborted)
      await new Promise<void>((resolve) =>
        lifecycle.signal.addEventListener('abort', () => resolve(), {
          once: true,
        }),
      );
  } finally {
    await app.close();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(() => {
    console.error('Web Demo 启动失败，请检查依赖、端口和项目目录。');
    process.exitCode = 1;
  });
