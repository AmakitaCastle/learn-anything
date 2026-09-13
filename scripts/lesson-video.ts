import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  access,
  link,
  lstat,
  mkdtemp,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { parseLesson } from '@learn-anything/lesson-schema';
import { startLessonViewer } from './lesson-viewer.ts';

export const VIDEO_RATIOS = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '1:1': { width: 1080, height: 1080 },
} as const;
export type VideoRatio = keyof typeof VIDEO_RATIOS;
export type VideoExportOptions = {
  output: string;
  aspectRatio: VideoRatio;
  fps: number;
};
export class VideoExportError extends Error {}

export function videoExportOptions(input: {
  output: string;
  aspectRatio?: string;
  fps?: string | number;
}): VideoExportOptions {
  const ratio = input.aspectRatio ?? '16:9';
  if (!Object.hasOwn(VIDEO_RATIOS, ratio))
    throw new VideoExportError('视频比例仅支持 16:9、9:16、1:1。');
  const fps = input.fps === undefined ? 24 : Number(input.fps);
  if (!Number.isInteger(fps) || fps < 1 || fps > 60)
    throw new VideoExportError('视频帧率必须是 1–60 的整数。');
  if (
    !input.output.trim() ||
    /[\\/]$/.test(input.output) ||
    extname(input.output).toLowerCase() !== '.mp4'
  )
    throw new VideoExportError('视频输出需要指定新的 .mp4 文件。');
  return {
    output: resolve(input.output),
    aspectRatio: ratio as VideoRatio,
    fps,
  };
}
const run = promisify(execFile);
const cancelled = () =>
  new VideoExportError('视频导出已取消；已保存课程保留。');
function check(signal?: AbortSignal) {
  if (signal?.aborted) throw cancelled();
}
async function ensureNewOutput(output: string) {
  try {
    await lstat(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new VideoExportError('无法访问视频输出文件。');
  }
  throw new VideoExportError('视频输出已存在，请选择新文件；不会覆盖。');
}

// Run before billable generation if export was requested. Keep the existing
// playback-only demo independent of FFmpeg and the Chromium installation.
export async function prepareVideoExport(
  input: VideoExportOptions,
  signal?: AbortSignal,
) {
  const options = videoExportOptions(input);
  check(signal);
  await ensureNewOutput(options.output);
  try {
    if (!(await stat(dirname(options.output))).isDirectory())
      throw new Error('directory');
    await access(dirname(options.output), constants.W_OK);
    await run('ffmpeg', ['-hide_banner', '-version'], {
      timeout: 10000,
      signal,
    });
    await run('ffprobe', ['-hide_banner', '-version'], {
      timeout: 10000,
      signal,
    });
    const { stdout } = await run('ffmpeg', ['-hide_banner', '-encoders'], {
      timeout: 10000,
      signal,
    });
    if (!/\blibx264\b/.test(stdout)) throw new Error('encoder');
  } catch {
    check(signal);
    throw new VideoExportError(
      '导出需要 FFmpeg（含 libx264）、FFprobe 和已存在的输出目录。',
    );
  }
  try {
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch({ headless: true, timeout: 10000 });
    await browser.close();
  } catch {
    check(signal);
    throw new VideoExportError(
      '导出需要 Chromium，请运行 npx playwright install chromium（Linux 可加 --with-deps）。',
    );
  }
  check(signal);
}

export async function exportLessonVideo(
  directory: string,
  input: VideoExportOptions,
  dependencies: {
    signal?: AbortSignal;
    onProgress?: (frame: number, total: number) => void;
  } = {},
) {
  const options = videoExportOptions(input);
  const { signal } = dependencies;
  await prepareVideoExport(options, signal);
  const lesson = parseLesson(
    JSON.parse(await readFile(join(directory, 'lesson.json'), 'utf8')),
  );
  const audioPath = resolve(directory, 'narration.mp3');
  try {
    const { stdout } = await run(
      'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file',
        '-f',
        'mp3',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=duration',
        '-of',
        'json',
        audioPath,
      ],
      { timeout: 10000, signal },
    );
    const duration = Number(JSON.parse(stdout).streams?.[0]?.duration);
    if (
      !Number.isFinite(duration) ||
      Math.abs(duration - lesson.duration) > 0.3
    )
      throw new Error('duration');
  } catch {
    check(signal);
    throw new VideoExportError(
      '课程音频缺失或时长与时间轴不一致，请重新编译。',
    );
  }
  check(signal);
  const temporary = await mkdtemp(
    join(dirname(options.output), '.lesson-video-'),
  );
  const encoded = join(temporary, 'video.mp4');
  let viewer: Awaited<ReturnType<typeof startLessonViewer>> | undefined;
  let browser: import('@playwright/test').Browser | undefined;
  let encoder: ReturnType<typeof spawn> | undefined;
  let encodingDone: Promise<boolean> | undefined;
  let forceStop: ReturnType<typeof setTimeout> | undefined;
  const stopEncoder = () => {
    if (!encoder || encoder.exitCode !== null) return;
    encoder.kill('SIGTERM');
    forceStop ??= setTimeout(() => encoder?.kill('SIGKILL'), 5000);
    forceStop.unref();
  };
  const abort = () => {
    stopEncoder();
    void browser?.close().catch(() => undefined);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    viewer = await startLessonViewer(directory);
    check(signal);
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch({ headless: true, timeout: 10000 });
    check(signal);
    const page = await browser.newPage({
      viewport: VIDEO_RATIOS[options.aspectRatio],
      deviceScaleFactor: 1,
      locale: 'zh-CN',
      colorScheme: 'light',
    });
    let renderFailed = false;
    page.on('pageerror', () => {
      renderFailed = true;
    });
    // Only the closed local viewer's assets may load. Course data never
    // enables network access, remote fonts, arbitrary file paths or scripts.
    await page.route('**/*', (route) =>
      route.request().url().startsWith(viewer!.url)
        ? route.continue()
        : route.abort(),
    );
    await page.goto(viewer.url + '?video=1');
    await page.waitForFunction(() => Boolean(window.lessonVideo));
    encoder = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-n',
        '-protocol_whitelist',
        'file,pipe',
        '-f',
        'image2pipe',
        '-framerate',
        String(options.fps),
        '-vcodec',
        'png',
        '-i',
        'pipe:0',
        '-protocol_whitelist',
        'file',
        '-f',
        'mp3',
        '-i',
        audioPath,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-af',
        'apad',
        '-t',
        String(lesson.duration),
        '-movflags',
        '+faststart',
        encoded,
      ],
      { stdio: ['pipe', 'ignore', 'ignore'] },
    );
    encodingDone = new Promise<boolean>((done) => {
      encoder!.once('error', () => done(false));
      encoder!.once('close', (code) => done(code === 0));
    });
    encoder.stdin!.on('error', () => undefined);
    const total = Math.ceil(lesson.duration * options.fps);
    for (let index = 0; index < total; index++) {
      check(signal);
      await page.evaluate(
        (seconds) => window.lessonVideo!.render(seconds),
        index / options.fps,
      );
      if (renderFailed) throw new Error('render');
      const png = await page.screenshot({ type: 'png', caret: 'hide' });
      // Await each write: no unbounded frame queue when the encoder is slower.
      await new Promise<void>((done, fail) =>
        encoder!.stdin!.write(png, (error) => (error ? fail(error) : done())),
      );
      dependencies.onProgress?.(index + 1, total);
    }
    encoder.stdin!.end();
    if (!(await encodingDone)) throw new Error('encoding');
    check(signal);
    // Atomic publication without overwrite, including another exporter racing
    // for the same filename. Temp output lives on the destination filesystem.
    await link(encoded, options.output);
    return {
      output: options.output,
      ...VIDEO_RATIOS[options.aspectRatio],
      duration: lesson.duration,
      fps: options.fps,
    };
  } catch (error) {
    check(signal);
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new VideoExportError('视频输出已存在，请选择新文件；不会覆盖。');
    if (error instanceof VideoExportError) throw error;
    throw new VideoExportError(
      '视频导出失败，请检查课程资源、Chromium、FFmpeg 和输出目录；已保存课程保留。',
    );
  } finally {
    signal?.removeEventListener('abort', abort);
    if (encoder && encoder.exitCode === null) {
      stopEncoder();
      await encodingDone;
    }
    clearTimeout(forceStop);
    await browser?.close();
    await viewer?.close();
    await rm(temporary, { recursive: true, force: true });
  }
}
