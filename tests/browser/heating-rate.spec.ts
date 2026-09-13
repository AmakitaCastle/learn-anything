import { expect, test } from '@playwright/test';
import lesson from '../../public/lessons/heating-rate.json' with { type: 'json' };

test('LLM draft compiled heating lesson loads, plays and restores final board', async ({
  page,
}) => {
  await page.goto('/examples/heating-rate');
  const audio = page.locator('audio');
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.readyState))
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.duration))
    .toBeCloseTo(52.092, 1);
  await expect(page.locator('[data-classroom-ready="true"]')).toBeVisible();
  await expect(page.locator('[data-plot-axis="x"] text')).toHaveText([
    '0',
    '1',
    '2',
  ]);
  await expect(page.locator('[data-plot-axis="y"] text')).toHaveText([
    '0',
    '20',
    '40',
    '60',
  ]);
  await expect(page.locator('.plot-grid path')).toHaveCount(7);
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.muted))
    .toBe(true);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
    .toBeGreaterThan(0.2);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const firstWrite = lesson.events.find(
    (event) => event.type === 'board.write',
  )!;
  const firstTime = firstWrite.at + 0.4;
  await audio.evaluate((node: HTMLAudioElement, time) => {
    node.currentTime = time;
  }, firstTime);
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
    .toBeCloseTo(firstTime, 2);
  const firstBoard = page.locator('.board-note').first();
  await expect(
    firstBoard.locator('[data-handwriting-script="chinese"] canvas'),
  ).not.toHaveCount(0);
  // A symbol fallback must not turn the Chinese in this same line into text fades.
  await expect(firstBoard.locator('.handwriting-fallback')).toHaveText(['≠']);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.fonts).some(
          (font) =>
            font.family.includes('lesson-handwriting-') &&
            font.status === 'loaded',
        ),
      ),
    )
    .toBe(true);
  const partial = await firstBoard.screenshot();
  expect(await firstBoard.screenshot()).toEqual(partial); // paused strokes stay frozen
  await page.screenshot({
    path: 'test-results/heating-rate-handwriting-partial.png',
    fullPage: true,
  });
  await audio.evaluate((node: HTMLAudioElement, time) => {
    node.currentTime = time;
  }, firstTime + 1.5);
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
    .toBeCloseTo(firstTime + 1.5, 2);
  expect(await firstBoard.screenshot()).not.toEqual(partial); // ink changes, not just DOM text
  await audio.evaluate((node: HTMLAudioElement, time) => {
    node.currentTime = time;
  }, firstTime);
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
    .toBeCloseTo(firstTime, 2);
  expect(await firstBoard.screenshot()).toEqual(partial); // identical partial strokes after seek
  await page.getByRole('slider').press('End');
  await expect(
    page.locator('.board-note').filter({ hasText: '温度升高 ≠ 升温加快' }),
  ).toBeVisible();
  await expect(page.locator('.board-note')).toHaveCount(6);
  await expect(page.locator('[data-plot-through="2"]')).toHaveAttribute(
    'points',
    '50,216.66666666666669 310,133.33333333333334 570,91.66666666666666',
  );
  await expect(
    page.locator('.board-note').filter({ hasText: '0 分钟：20°C' }),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: 'test-results/heating-rate-final.png',
    fullPage: true,
  });
  await page.getByRole('slider').press('Home');
  await expect(page.locator('.board-note')).toHaveCount(0);
  await expect(page.locator('[data-plot-axis="x"] text')).toHaveText([
    '0',
    '1',
    '2',
  ]);
  await page.getByRole('slider').press('End');
  await expect(page.locator('.board-note')).toHaveCount(6);
});
