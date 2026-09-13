import { expect, test, type Page } from '@playwright/test';
import lesson from '../../public/lessons/heating-full-board.json' with { type: 'json' };

async function ready(page: Page) {
  await page.goto('/examples/full-board');
  await expect(page.locator('main')).toHaveAttribute(
    'data-classroom-ready',
    'true',
  );
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((node: HTMLAudioElement) => node.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await page.evaluate(() => document.fonts.ready);
}
async function seek(page: Page, time: number) {
  const paused = await page
    .locator('audio')
    .evaluate((node: HTMLAudioElement) => node.paused);
  await page.locator('audio').evaluate((node: HTMLAudioElement, time) => {
    node.currentTime = time;
  }, time);
  await expect
    .poll(async () => {
      const actual = Number(
        await page.locator('main').getAttribute('data-classroom-time'),
      );
      return paused
        ? Math.abs(actual - time) < 0.001
        : actual >= time && actual < time + 1;
    })
    .toBe(true);
}
async function currentVisible(page: Page) {
  await expect
    .poll(() =>
      page.locator('.narration-line[aria-current="step"]').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight - 138;
      }),
    )
    .toBe(true);
}

test('full narration is retained beside each diagram and only selected phrases are circled', async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator('[data-visual-id="temperature"]')).toHaveCount(1);
  await expect(page.locator('[data-visual-id="reasoning"]')).toHaveCount(0);
  await expect(page.locator('.narration-line')).toHaveCount(1);
  await seek(page, lesson.duration - 0.001);
  await expect(page.locator('[data-visual-id]')).toHaveCount(2);
  for (const segment of lesson.teaching) {
    const written = await page
      .locator(
        `[data-teaching-segment="${segment.id}"] .narration-line .handwritten-line`,
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('aria-label')).join(''),
      );
    expect(written).toBe(segment.text);
  }
  await expect(page.locator('.phrase-circle')).toHaveCount(7);
  expect(await page.locator('.phrase-circle').count()).toBeLessThan(
    await page.locator('.narration-line').count(),
  );
  for (const group of await page.locator('.teaching-group').all()) {
    await expect(group.locator('[data-visual-id]')).toHaveCount(1);
    expect(await group.locator('.narration-line').count()).toBeGreaterThan(0);
  }
  await page.screenshot({
    path: 'test-results/full-board-final.png',
    fullPage: true,
  });
});

test('playback follows the current group, manual review suspends scrolling, and resume restores it', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await seek(page, lesson.teaching[2].at + 0.3);
  await expect(
    page.locator('[data-teaching-group="visual-reasoning"]'),
  ).toHaveAttribute('data-current', 'true');
  await expect(page.locator('.teaching-board')).toHaveAttribute(
    'data-following',
    'true',
  );
  await currentVisible(page);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(200);
  await page.mouse.wheel(0, -1000);
  await expect(page.locator('.teaching-board')).toHaveAttribute(
    'data-following',
    'false',
  );
  await expect(
    page.getByRole('button', { name: '暂停', exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: '回到当前讲解' }).click();
  await expect(page.locator('.teaching-board')).toHaveAttribute(
    'data-following',
    'true',
  );
  await currentVisible(page);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await seek(page, lesson.teaching[1].at + 0.3);
  await expect(
    page.locator('[data-teaching-group="visual-temperature"]'),
  ).toHaveAttribute('data-current', 'true');
  await expect(page.locator('[data-visual-id="reasoning"]')).toHaveCount(0);
  await currentVisible(page);
});

test('speech-controlled strokes and circles restore the same paused frame after seeking', async ({
  page,
}) => {
  await ready(page);
  const time = lesson.teaching[0].emphasis[0].at + 0.3;
  await seek(page, time);
  const writing = page.locator('[data-teaching-segment="question"]');
  await page.evaluate(() => document.fonts.ready);
  const first = await writing.screenshot({ animations: 'disabled' });
  await seek(page, lesson.teaching[2].at + 1);
  await seek(page, time);
  expect(await writing.screenshot({ animations: 'disabled' })).toEqual(first);
});

test('future emphasis is invisible and seeking restores zero, partial and complete circles', async ({
  page,
}) => {
  await ready(page);
  const at = lesson.teaching[0].emphasis[0].at;
  await seek(page, at - 0.05);
  const circle = page
    .locator('[data-teaching-segment="question"] .phrase-circle path')
    .first();
  await expect(circle).toHaveAttribute('d', '');
  await seek(page, at + 0.325);
  const partial = await circle.getAttribute('d');
  expect(partial).toMatch(/^M/u);
  await seek(page, at + 0.7);
  const complete = await circle.getAttribute('d');
  expect(complete).not.toBe(partial);
  expect(complete).toMatch(/51 3$/u);
  await seek(page, at - 0.05);
  await expect(circle).toHaveAttribute('d', '');
});

test('long narration wraps without horizontal overflow on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await seek(page, lesson.duration - 0.001);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  for (const line of await page.locator('.narration-line').all())
    expect(
      await line.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
});

test('playing continues current handwriting without redrawing completed narration canvases', async ({
  page,
}) => {
  await ready(page);
  await seek(page, lesson.teaching[2].at + 0.3);
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  const counts = await page.evaluate(async () => {
    const completed = new Set(
      document.querySelectorAll(
        '[data-teaching-segment="question"] .narration-line canvas',
      ),
    );
    const original = Object.getOwnPropertyDescriptor(
      CanvasRenderingContext2D.prototype,
      'clearRect',
    )!.value as CanvasRenderingContext2D['clearRect'];
    let previousDraws = 0;
    let currentDraws = 0;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (completed.has(this.canvas)) previousDraws++;
      else currentDraws++;
      return original.apply(this, args);
    };
    try {
      const audio = document.querySelector('audio')!;
      const start = audio.currentTime;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
      return {
        previousDraws,
        currentDraws,
        advanced: audio.currentTime > start,
        watched: completed.size,
      };
    } finally {
      CanvasRenderingContext2D.prototype.clearRect = original;
    }
  });
  expect(counts.watched).toBeGreaterThan(0);
  expect(counts.advanced).toBe(true);
  expect(counts.currentDraws).toBeGreaterThan(0);
  expect(counts.previousDraws).toBe(0);
});
