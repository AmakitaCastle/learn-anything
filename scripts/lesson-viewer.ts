import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessonCapabilities } from '../capabilities/index.ts';
import {
  validateBuiltinVisuals,
  parseLesson,
} from '@learn-anything/lesson-schema';

type File = { bytes: Buffer; type: string };
const mime: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  ttf: 'font/ttf',
  woff2: 'font/woff2',
  json: 'application/json; charset=utf-8',
  mp3: 'audio/mpeg',
  vtt: 'text/vtt; charset=utf-8',
};
async function bundledFiles(
  directory: string,
  prefix = '',
): Promise<Map<string, File>> {
  const files = new Map<string, File>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory())
      for (const [name, file] of await bundledFiles(
        join(directory, entry.name),
        key + '/',
      ))
        files.set(name, file);
    else if (entry.isFile())
      files.set(key, {
        bytes: await readFile(join(directory, entry.name)),
        type: mime[entry.name.split('.').at(-1)!] ?? 'application/octet-stream',
      });
  }
  return files;
}

// A closed file map, not a directory server. No project files or env are served.
export async function startLessonViewer(
  directory: string,
  options: { port?: number } = {},
): Promise<{ url: string; close(): Promise<void> }> {
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('本地播放器端口无效。');
  const lesson = parseLesson(
    JSON.parse(await readFile(join(directory, 'lesson.json'), 'utf8')),
  );
  validateBuiltinVisuals(lesson, { registry: lessonCapabilities });
  const token = randomBytes(16).toString('hex');
  const prefix = `/${token}/`;
  const courseFiles = new Map<string, File>();
  courseFiles.set('narration.mp3', {
    bytes: await readFile(join(directory, 'narration.mp3')),
    type: mime.mp3,
  });
  if (lesson.captions)
    courseFiles.set('captions.vtt', {
      bytes: await readFile(join(directory, 'captions.vtt')),
      type: mime.vtt,
    });
  if (lesson.handwriting)
    courseFiles.set('handwriting.ttf', {
      bytes: await readFile(join(directory, 'handwriting.ttf')),
      type: mime.ttf,
    });
  const localLesson = parseLesson({
    ...lesson,
    audio: prefix + 'narration.mp3',
    ...(lesson.captions ? { captions: prefix + 'captions.vtt' } : {}),
    ...(lesson.handwriting
      ? {
          handwriting: {
            ...lesson.handwriting,
            fontUrl: prefix + 'handwriting.ttf',
          },
        }
      : {}),
  });
  courseFiles.set('lesson.json', {
    bytes: Buffer.from(JSON.stringify(localLesson)),
    type: mime.json,
  });
  const buildDirectory = await mkdtemp(
    join(tmpdir(), 'learn-anything-viewer-'),
  );
  try {
    // Lazy import: preflight and --no-play do not build a website.
    const { build } = await import('vite');
    await build({
      configFile: false,
      root: fileURLToPath(new URL('../viewer', import.meta.url)),
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
      // The CLI may inherit NODE_ENV=development from its caller. Keep JSX
      // output consistent with the production React runtime bundled here.
      oxc: { jsx: { runtime: 'automatic', development: false } },
      css: { postcss: { plugins: [] } },
      build: { outDir: buildDirectory, emptyOutDir: false, sourcemap: false },
    });
    const files = await bundledFiles(buildDirectory);
    for (const [name, file] of courseFiles) files.set(name, file);
    const server = createServer((request, response) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Cache-Control', 'no-store');
      if (!['GET', 'HEAD'].includes(request.method ?? '')) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const address = server.address();
      if (
        !address ||
        typeof address === 'string' ||
        request.headers.host !== `127.0.0.1:${address.port}`
      ) {
        response.writeHead(403).end();
        return;
      }
      const pathname = request.url?.split('?')[0] ?? '';
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404).end();
        return;
      }
      const file = files.get(
        pathname === prefix ? 'index.html' : pathname.slice(prefix.length),
      );
      if (!file) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader('Content-Type', file.type);
      response.setHeader('Accept-Ranges', 'bytes');
      let start = 0,
        end = file.bytes.length - 1;
      if (request.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (match && (match[1] || match[2])) {
          if (!match[1])
            start = Math.max(0, file.bytes.length - Number(match[2]));
          else {
            start = Number(match[1]);
            if (match[2]) end = Math.min(end, Number(match[2]));
          }
        }
        if (
          !match ||
          !(match[1] || match[2]) ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          start > end ||
          end >= file.bytes.length
        ) {
          response
            .writeHead(416, { 'Content-Range': `bytes */${file.bytes.length}` })
            .end();
          return;
        }
        response.statusCode = 206;
        response.setHeader(
          'Content-Range',
          `bytes ${start}-${end}/${file.bytes.length}`,
        );
      }
      response.setHeader('Content-Length', end - start + 1);
      response.end(
        request.method === 'HEAD'
          ? undefined
          : file.bytes.subarray(start, end + 1),
      );
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('播放器启动失败。');
    let closed = false;
    return {
      url: `http://127.0.0.1:${address.port}${prefix}`,
      async close() {
        if (closed) return;
        closed = true;
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        });
        await rm(buildDirectory, { recursive: true, force: true });
      },
    };
  } catch {
    await rm(buildDirectory, { recursive: true, force: true });
    throw new Error(
      '播放器启动失败，请检查课程文件、依赖或端口；已保存的课程未删除。',
    );
  }
}

export function openLessonBrowser(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1')
    throw new Error('播放器地址无效。');
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'rundll32'
        : 'xdg-open';
  const args =
    process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  return new Promise((resolve, reject) =>
    execFile(command, args, { timeout: 10000 }, (error) =>
      error
        ? reject(new Error('无法自动打开浏览器，请使用终端显示的地址。'))
        : resolve(),
    ),
  );
}
