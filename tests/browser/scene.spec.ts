import { expect, test } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseLessonDraft, spokenText } from '@learn-anything/lesson-schema';
import {
  compileAlignedLessonDraft,
  createFfmpegAudioProcessor,
} from '@learn-anything/content-generator';
import { lessonCapabilities } from '../../capabilities/index.ts';
import { startLessonViewer } from '../../scripts/lesson-viewer.ts';

// Uses portable material, synthetic word timings and an actual silent MP3.
// No environment configuration or user speech cache is needed.
test('scene classroom freezes motion and rebuilds identical mid-motion poses after reverse seek and reload', async ({
  page,
}) => {
  test.setTimeout(60000);
  const directory = await mkdtemp(
    join(tmpdir(), 'learn-anything-scene-browser-'),
  );
  let viewer: Awaited<ReturnType<typeof startLessonViewer>> | undefined;
  try {
    const raw = JSON.parse(
      await readFile(
        new URL(
          '../../examples/task-separation/lesson.draft.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const draft = parseLessonDraft(raw, lessonCapabilities);
    const measured = draft.segments.map((segment) => ({
      id: segment.id,
      text: segment.text,
      duration: Array.from(spokenText(segment.text)).length * 0.1 + 1,
      metadata: [
        {
          sentence: {
            words: Array.from(spokenText(segment.text), (word, i) => ({
              word,
              startTime: i * 0.1,
              endTime: (i + 1) * 0.1,
            })),
          },
        },
      ],
    }));
    const compiled = compileAlignedLessonDraft(draft, measured, {
      capabilities: lessonCapabilities,
    });
    const encoded = await createFfmpegAudioProcessor().encodeMp3(
      Buffer.alloc(Math.round((compiled.lesson.duration * 48000) / 2) * 2),
    );
    await writeFile(join(directory, 'lesson.json'), compiled.lessonJson);
    await writeFile(join(directory, 'narration.mp3'), encoded.audio);
    await writeFile(join(directory, 'captions.vtt'), compiled.captionsVtt);
    viewer = await startLessonViewer(directory);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(viewer.url);
    const shell = page.locator('.classroom-shell');
    await expect(shell).toHaveAttribute('data-classroom-ready', 'true');
    await expect
      .poll(() =>
        page
          .locator('audio')
          .evaluate((a) => (a as HTMLAudioElement).readyState),
      )
      .toBeGreaterThanOrEqual(2);
    await page.evaluate(() => document.fonts.ready);
    const move = compiled.lesson.events.find(
      (e) =>
        e.type === 'visual' &&
        e.visualId === 'unreplied' &&
        e.action === 'group' &&
        (e.payload as { id: string }).id === 'reason',
    )!;
    const time = move.at + 0.5;
    const seek = async (seconds: number) => {
      await page.locator('audio').evaluate((a, t) => {
        (a as HTMLAudioElement).currentTime = t;
      }, seconds);
      await expect
        .poll(async () =>
          Number(await shell.getAttribute('data-classroom-time')),
        )
        .toBeCloseTo(seconds, 4);
    };
    const diagram = page.locator(
      '[data-teaching-group="visual-unreplied"] .teaching-diagram',
    );
    await seek(time);
    await expect(
      diagram.locator('[data-scene-element="reason"]'),
    ).toHaveAttribute('data-scene-region', 'theirs');
    const screenshot = async () => {
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async () => {
        for (let i = 0; i < 6; i++)
          await new Promise<void>((done) =>
            requestAnimationFrame(() => done()),
          );
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      return diagram.screenshot({
        animations: 'disabled',
        caret: 'hide',
        style: '.teaching-diagram {background: #fffdf8 !important;}',
      });
    };
    const mid = await screenshot();
    const transform = await diagram
      .locator('[data-scene-element="reason"]')
      .getAttribute('transform');
    await page.waitForTimeout(250);
    expect(
      await diagram
        .locator('[data-scene-element="reason"]')
        .getAttribute('transform'),
    ).toBe(transform);
    await seek(compiled.lesson.duration);
    await seek(time);
    expect(await screenshot()).toEqual(mid);
    await page.reload();
    await expect(shell).toHaveAttribute('data-classroom-ready', 'true');
    await seek(time);
    expect(await screenshot()).toEqual(mid);
    // Pause active playback during a motion, then verify SVG and audio are frozen.
    await seek(move.at);
    await page.getByRole('button', { name: '关闭声音', exact: true }).click();
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect
      .poll(async () => Number(await shell.getAttribute('data-classroom-time')))
      .toBeGreaterThan(move.at + 0.1);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    const paused = await shell.getAttribute('data-classroom-time');
    const pose = await diagram
      .locator('[data-scene-element="reason"]')
      .getAttribute('transform');
    await page.waitForTimeout(250);
    expect(await shell.getAttribute('data-classroom-time')).toBe(paused);
    expect(
      await diagram
        .locator('[data-scene-element="reason"]')
        .getAttribute('transform'),
    ).toBe(pose);
    // Rewind hides future scene groups; narrow layout keeps the SVG within the page.
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await expect(
      page.locator('[data-teaching-group="visual-unreplied"]'),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await seek(time);
    await expect(diagram).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    // Near the stacked-layout breakpoint the intrinsic SVG is taller than
    // 260px. Its full height must be reserved before the narration starts.
    for (const width of [680, 740, 760, 820]) {
      await page.setViewportSize({ width, height: 900 });
      await seek(time);
      const bounds = await page
        .locator('[data-teaching-group="visual-unreplied"]')
        .evaluate((group) => {
          const diagram = group
            .querySelector('.teaching-diagram')!
            .getBoundingClientRect();
          const svg = group
            .querySelector('[data-visual-id] > svg')!
            .getBoundingClientRect();
          const writing = group
            .querySelector('.teaching-writing')!
            .getBoundingClientRect();
          return {
            diagramBottom: diagram.bottom,
            svgBottom: svg.bottom,
            writingTop: writing.top,
            diagramRight: diagram.right,
            writingLeft: writing.left,
          };
        });
      expect(
        bounds.diagramBottom,
        `diagram must contain SVG at ${width}px`,
      ).toBeGreaterThanOrEqual(bounds.svgBottom - 0.5);
      if (width <= 760)
        expect(
          bounds.writingTop,
          `narration must follow the entire SVG at ${width}px`,
        ).toBeGreaterThanOrEqual(bounds.svgBottom + 19);
      else
        expect(bounds.writingLeft).toBeGreaterThanOrEqual(
          bounds.diagramRight + 27,
        );
    }
    expect(errors).toEqual([]);
  } finally {
    await viewer?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
