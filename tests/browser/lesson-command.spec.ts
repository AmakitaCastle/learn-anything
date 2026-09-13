import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from '@playwright/test';
import { createLessonDraftProvider } from '@learn-anything/lesson-draft-generator';
import {
  createFfmpegAudioProcessor,
  createTegakiHandwritingProvider,
} from '@learn-anything/content-generator';
import { spokenText } from '@learn-anything/lesson-schema';
import {
  runLessonWorkflow,
  topicBrief,
} from '../../scripts/lesson-workflow.ts';
import { startLessonViewer } from '../../scripts/lesson-viewer.ts';

test('terminal pipeline opens a standalone real MP3 classroom with pause, seek, replay and reload recovery', async ({
  page,
}) => {
  test.setTimeout(60000);
  const directory = await mkdtemp(
    join(tmpdir(), 'learn-anything-browser-command-'),
  );
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
    const audio = createFfmpegAudioProcessor();
    const fixture = await audio.encodeMp3(Buffer.alloc(4 * 48000));
    const result = await runLessonWorkflow(
      { brief: topicBrief('温度变化', { id: draft.id, segmentCount: 2 }) },
      { outputRoot: directory },
      {
        provider: createLessonDraftProvider(
          {
            protocol: 'openai-compatible',
            model: 'fixture',
            apiKey: 'fixture-only-not-a-real-key',
          },
          {
            fetch: async () =>
              Response.json({
                choices: [
                  {
                    finish_reason: 'stop',
                    message: { content: JSON.stringify(draft) },
                  },
                ],
              }),
          },
        ),
        audio,
        handwriting: createTegakiHandwritingProvider({
          cacheRoot: join(directory, 'handwriting-cache'),
          fontUrl: '/lesson-assets/handwriting.ttf',
        }),
        // Transport fixture, synthetic timestamps and silent encoded MP3; no live speech/model requests.
        speech: {
          async synthesize(segment) {
            return {
              audio: fixture.audio,
              logId: null,
              metadata: [
                {
                  sentence: {
                    words: Array.from(
                      spokenText(segment.text),
                      (word, index) => ({
                        word,
                        startTime: index * 0.1,
                        endTime: (index + 1) * 0.1,
                      }),
                    ),
                  },
                },
              ],
            };
          },
        },
      },
    );
    viewer = await startLessonViewer(result.directory);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(viewer.url);
    const shell = page.locator('.classroom-shell');
    await expect(shell).toHaveAttribute('data-classroom-ready', 'true');
    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(document.fonts)
            .filter(
              (font) =>
                font.family.includes('lesson-handwriting') ||
                font.family.includes('Caveat Tegaki'),
            )
            .every((font) => font.status === 'loaded'),
        ),
      )
      .toBe(true);
    await page.getByRole('button', { name: '关闭声音', exact: true }).click();
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator('audio')
          .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
      )
      .toBeGreaterThan(0.3);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    const paused = await page
      .locator('audio')
      .evaluate((audio) => (audio as HTMLAudioElement).currentTime);
    await page.waitForTimeout(300);
    expect(
      await page
        .locator('audio')
        .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
    ).toBe(paused);
    const slider = page.getByRole('slider');
    await slider.press('End');
    await expect(shell).toHaveAttribute(
      'data-classroom-time',
      String(result.duration),
    );
    const board = page.locator('.paper-board');
    const screenshotOptions = {
      animations: 'disabled',
      caret: 'hide',
      style: '.player-dock { visibility: hidden !important; }',
    } as const;
    const final = await board.screenshot(screenshotOptions);
    await slider.press('Home');
    await expect(shell).toHaveAttribute('data-classroom-time', '0');
    await slider.press('End');
    expect(await board.screenshot(screenshotOptions)).toEqual(final);
    await page.reload();
    await expect(shell).toHaveAttribute('data-classroom-ready', 'true');
    await slider.press('End');
    expect(await board.screenshot(screenshotOptions)).toEqual(final);
    expect(errors).toEqual([]);
  } finally {
    await viewer?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
