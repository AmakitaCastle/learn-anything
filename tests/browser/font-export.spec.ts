import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import { expect, test } from '@playwright/test';
import {
  createFfmpegAudioProcessor,
  createTegakiHandwritingProvider,
} from '@learn-anything/content-generator';
import {
  CHINESE_FONTS,
  LATIN_FONTS,
  spokenText,
  type FontSelection,
} from '@learn-anything/lesson-schema';
import { runLessonWorkflow } from '../../scripts/lesson-workflow.ts';
import {
  exportLessonVideo,
  VIDEO_RATIOS,
  videoExportOptions,
} from '../../scripts/lesson-video.ts';
import { startLessonViewer } from '../../scripts/lesson-viewer.ts';
import {
  readFontPreferences,
  writeFontPreferences,
} from '../../scripts/font-preferences.ts';
const run = promisify(execFile);

test('saved playback fonts and independent overrides produce real matching MP4 frames in all ratios', async ({
  page,
}) => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'learn-font-export-'));
  const preferencePath = join(directory, 'prefs', 'fonts.json');
  let viewer: Awaited<ReturnType<typeof startLessonViewer>> | undefined;
  try {
    const draft = JSON.parse(
      await readFile(
        new URL(
          '../../packages/content-generator/examples/temperature.draft.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    draft.title = '温度变化 ABC 123';
    draft.visuals[0].config.xLabel = '时间 t';
    draft.boardMode = 'full-narration';
    draft.segments.forEach((segment: { visualId: string }) => {
      segment.visualId = draft.visuals[0].id;
    });
    const audio = createFfmpegAudioProcessor();
    const fixture = await audio.encodeMp3(Buffer.alloc(2 * 48000));
    const result = await runLessonWorkflow(
      { draft },
      { outputRoot: directory },
      {
        audio,
        handwriting: createTegakiHandwritingProvider({
          fontUrl: '/lesson-assets/handwriting.ttf',
        }),
        speech: {
          async synthesize(segment) {
            const words = Array.from(spokenText(segment.text));
            return {
              audio: fixture.audio,
              logId: null,
              metadata: [
                {
                  sentence: {
                    words: words.map((word, i) => ({
                      word,
                      startTime: (i * 1.9) / words.length,
                      endTime: ((i + 1) * 1.9) / words.length,
                    })),
                  },
                },
              ],
            };
          },
        },
      },
    );
    const original = await readFile(join(result.directory, 'lesson.json'));
    let i = 0;
    for (const [ratio, size] of Object.entries(VIDEO_RATIOS)) {
      const fonts: FontSelection = {
        chinese: CHINESE_FONTS[i].id,
        latin: LATIN_FONTS[i].id,
      };
      const saved: FontSelection =
        i === 0
          ? { chinese: CHINESE_FONTS[2].id, latin: LATIN_FONTS[2].id }
          : fonts;
      await writeFontPreferences(saved, preferencePath);
      const output = join(directory, `${i}.mp4`);
      const exported = await exportLessonVideo(
        result.directory,
        videoExportOptions({
          output,
          aspectRatio: ratio,
          fps: 2,
          ...(i === 0
            ? { chineseFont: fonts.chinese, latinFont: fonts.latin }
            : {}),
        }),
        { preferencePath },
      );
      expect(exported.fonts).toEqual(fonts);
      expect(await readFontPreferences(preferencePath)).toEqual(saved);
      const probe = JSON.parse(
        (
          await run('ffprobe', [
            '-v',
            'error',
            '-show_streams',
            '-of',
            'json',
            output,
          ])
        ).stdout,
      );
      const video = probe.streams.find(
        (stream: { codec_type: string }) => stream.codec_type === 'video',
      );
      expect([video.width, video.height, video.codec_name]).toEqual([
        size.width,
        size.height,
        'h264',
      ]);
      expect(
        probe.streams.find(
          (stream: { codec_type: string }) => stream.codec_type === 'audio',
        ).codec_name,
      ).toBe('aac');
      const decoded = PNG.sync.read(
        (
          await run(
            'ffmpeg',
            [
              '-v',
              'error',
              '-i',
              output,
              '-vf',
              'select=eq(n\\,2)',
              '-frames:v',
              '1',
              '-f',
              'image2pipe',
              '-vcodec',
              'png',
              'pipe:1',
            ],
            { encoding: 'buffer', maxBuffer: 10000000 },
          )
        ).stdout,
      );
      viewer = await startLessonViewer(result.directory, { preferencePath });
      await page.setViewportSize(size);
      await page.goto(
        viewer.url +
          '?' +
          new URLSearchParams({
            video: '1',
            'font-chinese': fonts.chinese,
            'font-latin': fonts.latin,
          }),
      );
      await page.waitForFunction(() => Boolean(window.lessonVideo));
      await page.evaluate(async () => {
        await window.lessonVideo!.render(1);
      });
      const reference = PNG.sync.read(await page.screenshot());
      expect([decoded.width, decoded.height]).toEqual([
        reference.width,
        reference.height,
      ]);
      let difference = 0,
        ink = 0;
      for (let p = 0; p < decoded.data.length; p += 4) {
        for (let channel = 0; channel < 3; channel++)
          difference += Math.abs(
            decoded.data[p + channel] - reference.data[p + channel],
          );
        if (decoded.data[p] < 150) ink++;
      }
      expect(ink).toBeGreaterThan(300);
      expect(difference / (decoded.width * decoded.height * 3)).toBeLessThan(2);
      const partial = await page.screenshot();
      await page.evaluate(async () => {
        await window.lessonVideo!.render(1.5);
      });
      expect(await page.screenshot()).not.toEqual(partial);
      await page.evaluate(async () => {
        await window.lessonVideo!.render(1);
      });
      expect(await page.screenshot()).toEqual(partial);
      await viewer.close();
      viewer = undefined;
      i++;
    }
    expect(await readFile(join(result.directory, 'lesson.json'))).toEqual(
      original,
    );
    // Playback preferences survive a new server and port. The write endpoint
    // rejects arbitrary font names, cross-origin writes and oversized bodies.
    viewer = await startLessonViewer(result.directory, { preferencePath });
    await page.goto(viewer.url);
    await expect(page.locator('main')).toHaveAttribute(
      'data-chinese-font',
      CHINESE_FONTS[2].id,
    );
    const endpoint = viewer.url + 'font-preferences.json';
    expect(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://other.example',
          },
          body: JSON.stringify({ chinese: 'wenkai', latin: 'caveat' }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chinese: '__proto__', latin: 'caveat' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'x'.repeat(2048),
        })
      ).status,
    ).toBe(413);
    await page.locator('.font-settings summary').click();
    await page.route('**/fonts/xiaolai.ttf', (route) => route.abort());
    await page
      .getByRole('combobox', { name: '中文字体', exact: true })
      .selectOption(CHINESE_FONTS[1].id);
    await expect(page.getByRole('alert')).toContainText('字体载入失败');
    await expect(page.locator('main')).toHaveAttribute(
      'data-chinese-font',
      CHINESE_FONTS[2].id,
    );
    await page.unroute('**/fonts/xiaolai.ttf');
    await page
      .getByRole('combobox', { name: '中文字体', exact: true })
      .selectOption(CHINESE_FONTS[1].id);
    await expect(page.locator('main')).toHaveAttribute(
      'data-chinese-font',
      CHINESE_FONTS[1].id,
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page
      .getByRole('combobox', { name: '中文字体', exact: true })
      .selectOption(CHINESE_FONTS[0].id);
    await expect
      .poll(async () => (await readFontPreferences(preferencePath)).chinese)
      .toBe(CHINESE_FONTS[0].id);
  } finally {
    await viewer?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
