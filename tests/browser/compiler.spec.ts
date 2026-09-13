import { expect, test, type Page } from '@playwright/test';
import {
  createServer,
  defaultClientConditions,
  defaultServerConditions,
  type ViteDevServer,
} from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileLessonDraft,
  createDoubaoSpeechProvider,
  createFfmpegAudioProcessor,
  parseLessonDraft,
  type CompiledLesson,
} from '../../packages/content-generator/index.ts';
import { spokenText } from '../../packages/lesson-schema/index.ts';

let server: ViteDevServer,
  cacheRoot: string,
  url: string,
  compiled: CompiledLesson;
test.beforeAll(async () => {
  // This isolated React host uses the actual public player and the full compiler.
  // Transport fixtures replace billing only; real FFmpeg/MP3/native playback run.
  const draft = parseLessonDraft(
    JSON.parse(
      await readFile(
        new URL(
          '../../packages/content-generator/examples/temperature.draft.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
  const audio = createFfmpegAudioProcessor();
  const responses = await Promise.all(
    draft.segments.map(async (segment) => {
      const words = Array.from(spokenText(segment.text), (word, index) => ({
        word,
        startTime: 0.2 + index * 0.16,
        endTime: 0.29 + index * 0.16,
      }));
      const encoded = await audio.encodeMp3(
        Buffer.alloc(Math.round((words.at(-1)!.endTime + 1) * 24000) * 2),
      );
      return {
        text: segment.text,
        packet: {
          code: 0,
          data: encoded.audio.toString('base64'),
          sentence: { words },
        },
      };
    }),
  );
  cacheRoot = await mkdtemp(join(tmpdir(), 'learn-anything-compiler-browser-'));
  const speech = createDoubaoSpeechProvider({
    config: {
      apiKey: 'test-only-not-a-real-key',
      resourceId: 'test',
      speaker: 'test',
      speechRate: 0,
    },
    cacheRoot,
    allowSynthesis: true,
    fetcher: async (_url, init) => {
      const {
        req_params: { text },
      } = JSON.parse(init!.body as string);
      const packet = responses.find(
        (response) => response.text === text,
      )!.packet;
      return new Response(
        `data: ${JSON.stringify(packet)}\n\ndata: {"code":20000000,"data":null}\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
  });
  compiled = await compileLessonDraft(draft, {
    speech,
    audio,
    resources: { audio: '/narration.mp3', captions: '/captions.vtt' },
  });
  server = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    configFile: false,
    cacheDir: join(cacheRoot, 'vite'),
    resolve: {
      conditions: ['learn-anything-source', ...defaultClientConditions],
    },
    ssr: {
      resolve: {
        conditions: ['learn-anything-source', ...defaultServerConditions],
      },
    },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      {
        name: 'compiled-lesson-test-host',
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (request.url === '/') {
              response.setHeader('Content-Type', 'text/html');
              response.end(
                '<!doctype html><html lang="zh-CN"><body style="margin:0"><div id="root"></div><script type="module" src="/compiler-fixture.ts"></script></body></html>',
              );
            } else if (request.url === '/narration.mp3') {
              response.setHeader('Content-Type', 'audio/mpeg');
              response.setHeader('Accept-Ranges', 'bytes');
              const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
              const start = range ? Number(range[1]) : 0;
              const end = range?.[2]
                ? Math.min(Number(range[2]), compiled.audio.length - 1)
                : compiled.audio.length - 1;
              if (start > end || start >= compiled.audio.length) {
                response.statusCode = 416;
                response.end();
                return;
              }
              if (range) {
                response.statusCode = 206;
                response.setHeader(
                  'Content-Range',
                  `bytes ${start}-${end}/${compiled.audio.length}`,
                );
              }
              response.setHeader('Content-Length', end - start + 1);
              response.end(compiled.audio.subarray(start, end + 1));
            } else if (request.url === '/captions.vtt') {
              response.setHeader('Content-Type', 'text/vtt');
              response.end(compiled.captionsVtt);
            } else next();
          });
        },
        resolveId(id) {
          return id === '/compiler-fixture.ts' ? '\0compiler-fixture' : null;
        },
        load(id) {
          if (id !== '\0compiler-fixture') return null;
          return `import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ClassroomPlayer } from '@learn-anything/lesson-player';
import '@learn-anything/lesson-player/styles.css';
createRoot(document.getElementById('root')).render(createElement(ClassroomPlayer, { lesson: ${compiled.lessonJson} }));`;
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing isolated test server');
  url = `http://127.0.0.1:${address.port}/`;
});
test.afterAll(async () => {
  await server?.close();
  if (cacheRoot) await rm(cacheRoot, { recursive: true, force: true });
});
async function ready(page: Page) {
  await page.goto(url);
  await expect(page.locator('main')).toHaveAttribute(
    'data-classroom-ready',
    'true',
  );
  await expect(page.locator('main')).toHaveAttribute(
    'data-lesson-id',
    'temperature-rise',
  );
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
}
async function seek(page: Page, time: number) {
  await page.locator('audio').evaluate((audio, time) => {
    (audio as HTMLAudioElement).currentTime = time;
  }, time);
  await expect
    .poll(async () =>
      Number(await page.locator('main').getAttribute('data-classroom-time')),
    )
    .toBeCloseTo(time, 4);
}
async function frame(page: Page) {
  const options = {
    animations: 'disabled',
    caret: 'hide',
    style: '.player-dock{visibility:hidden!important}',
  } as const;
  await page.mouse.move(5, 5);
  await page.evaluate(() => document.fonts.ready);
  let before = await page.locator('.paper-board').screenshot(options);
  for (let index = 0; index < 12; index++) {
    await page.waitForTimeout(70);
    const after = await page.locator('.paper-board').screenshot(options);
    if (after.equals(before)) return after;
    before = after;
  }
  throw new Error('Compiled lesson board did not settle');
}
test('compiled material plays as real MP3, with board and plot actions at returned phrase boundaries', async ({
  page,
}) => {
  await ready(page);
  expect(
    await page
      .locator('audio')
      .evaluate((audio) => (audio as HTMLAudioElement).duration),
  ).toBeCloseTo(compiled.lesson.duration, 1);
  const highlight = compiled.lesson.events.find(
    (event) => event.type === 'visual' && event.action === 'highlight',
  )!;
  await seek(page, highlight.at - 0.01);
  await expect(page.locator('[data-highlight="2"]')).toHaveCount(0);
  await seek(page, highlight.at + 0.01);
  await expect(page.locator('[data-highlight="2"]')).toHaveCount(1);
  await expect(page.locator('[data-plot-through="2"]')).toHaveCount(1);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
    )
    .toBeGreaterThan(highlight.at + 0.15);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await page
    .locator('audio')
    .evaluate((audio) => (audio as HTMLAudioElement).currentTime);
  const pausedImage = await frame(page);
  await page.waitForTimeout(200);
  expect(await frame(page)).toEqual(pausedImage);
  expect(
    await page
      .locator('audio')
      .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
  ).toBe(paused);
});
test('compiled output restores exactly after seek, restart and reload in an independent React host', async ({
  page,
}) => {
  await ready(page);
  const summary = compiled.lesson.events.find(
    (event) => event.type === 'board.write' && event.item.id === 'summary',
  )!;
  const time = summary.at + 0.9;
  await seek(page, time);
  await expect(page.locator('[aria-label="20 → 40 → 60°C"]')).toHaveCount(1);
  await expect(page.locator('[aria-label="起点：20°C"]')).toHaveCount(0);
  const image = await frame(page);
  await seek(page, 0.5);
  await seek(page, time);
  expect(await frame(page)).toEqual(image);
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await seek(page, time);
  expect(await frame(page)).toEqual(image);
  await page.reload();
  await expect(page.locator('main')).toHaveAttribute(
    'data-classroom-ready',
    'true',
  );
  await seek(page, time);
  expect(await frame(page)).toEqual(image);
});
