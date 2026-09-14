import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';
import lesson from '../../public/lessons/binary-search-doubao.json' with { type: 'json' };
import { presentationAt, type LessonSpec } from '../../lib/lesson';

const duration = lesson.duration;
const ref = (seconds: number) => presentationAt(lesson as LessonSpec, seconds);
const screenshotOptions = {
  animations: 'disabled',
  caret: 'hide',
  // The fixed dock overlaps this element's screenshot. Its hover/focus state
  // reflects the last user action, not the classroom state at this lesson time.
  style: '.player-dock { visibility: hidden !important; }',
} as const;

async function audioState(page: Page) {
  return page.locator('audio').evaluate((audio) => {
    if (!(audio instanceof HTMLAudioElement))
      throw new Error('The lesson audio element is missing');
    return {
      time: audio.currentTime,
      paused: audio.paused,
      muted: audio.muted,
      speed: audio.playbackRate,
      readyState: audio.readyState,
    };
  });
}

async function currentTime(page: Page) {
  return (await audioState(page)).time;
}

async function readyLesson(page: Page) {
  await expect(
    page.getByRole('button', { name: '播放', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await audioState(page)).readyState)
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.fonts).some(
          (font) =>
            font.family.includes('Ma Shan Zheng Tegaki') &&
            font.status === 'loaded',
        ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.fonts).some(
          (font) =>
            font.family.includes('Caveat Tegaki') && font.status === 'loaded',
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await expect.poll(async () => (await audioState(page)).muted).toBe(true);
}

async function seekTo(page: Page, seconds: number) {
  const slider = page.getByRole('slider');
  if (seconds === duration) {
    await slider.press('End');
  } else {
    const control = page.locator('[data-base-ui-slider-control]');
    const bounds = await control.boundingBox();
    const thumb = await page
      .locator('[data-slot="slider-thumb"]')
      .boundingBox();
    if (!bounds || !thumb)
      throw new Error('The lesson progress control is not visible');
    // Edge-aligned thumbs travel from half a thumb width inside either edge.
    await page.mouse.click(
      bounds.x +
        thumb.width / 2 +
        (seconds / duration) * (bounds.width - thumb.width),
      bounds.y + bounds.height / 2,
    );
    // Pointer coordinates are rounded by the browser. Use real keyboard steps
    // to finish on the intended 0.05-second position, not a nearby partial stroke.
    for (let step = 0; step < 4; step++) {
      const delta = seconds - (await currentTime(page));
      if (Math.abs(delta) < 0.026) break;
      await slider.press(delta > 0 ? 'ArrowRight' : 'ArrowLeft');
    }
  }
  await expect
    .poll(async () => Math.abs((await currentTime(page)) - seconds))
    .toBeLessThan(0.026);
  return currentTime(page);
}

function changedPixels(expected: Buffer, actual: Buffer) {
  const before = PNG.sync.read(expected);
  const after = PNG.sync.read(actual);
  if (before.width !== after.width || before.height !== after.height)
    return Infinity;
  let changed = 0;
  for (let offset = 0; offset < before.data.length; offset += 4) {
    if (
      before.data[offset] !== after.data[offset] ||
      before.data[offset + 1] !== after.data[offset + 1] ||
      before.data[offset + 2] !== after.data[offset + 2] ||
      before.data[offset + 3] !== after.data[offset + 3]
    ) {
      changed++;
    }
  }
  return changed;
}

async function settledBoard(page: Page) {
  const board = page.locator('.paper-board');
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page
        .locator('.tegaki-text canvas')
        .evaluateAll(
          (canvases) =>
            canvases.length > 0 &&
            canvases.every(
              (canvas) =>
                canvas instanceof HTMLCanvasElement &&
                canvas.width > 0 &&
                canvas.height > 0,
            ),
        ),
    )
    .toBe(true);
  let previous = await board.screenshot(screenshotOptions);
  for (let attempt = 0; attempt < 8; attempt++) {
    // Wait for controlled canvas drawing and any resize/font updates to settle.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    const next = await board.screenshot(screenshotOptions);
    if (changedPixels(previous, next) === 0) return next;
    previous = next;
  }
  throw new Error('The paused lesson board did not settle');
}

async function expectSameBoard(
  expected: Buffer,
  actual: Buffer,
  label: string,
  info: TestInfo,
) {
  const changed = changedPixels(expected, actual);
  if (changed !== 0) {
    await info.attach(`${label}-expected`, {
      body: expected,
      contentType: 'image/png',
    });
    await info.attach(`${label}-actual`, {
      body: actual,
      contentType: 'image/png',
    });
  }
  expect(
    changed,
    `${label}: the same lesson time must render the same pixels`,
  ).toBe(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/examples/binary-search');
  await readyLesson(page);
});

test('Caveat is used for English and digits while mixed Chinese keeps its original font', async ({
  page,
}, info) => {
  await seekTo(page, duration);
  const mixed = page.locator('.board-notes [aria-label="中间值 = 23，找到"]');
  const runs = mixed.locator('.tegaki-text');
  await expect(runs).toHaveCount(3);
  await expect(runs.nth(0)).toHaveAttribute(
    'data-handwriting-script',
    'chinese',
  );
  await expect(runs.nth(0)).toHaveCSS('font-family', /Ma Shan Zheng Tegaki/);
  await expect(runs.nth(1)).toHaveAttribute('data-handwriting-script', 'latin');
  await expect(runs.nth(1)).toHaveCSS('font-family', /Caveat Tegaki/);
  await expect(runs.nth(2)).toHaveCSS('font-family', /Ma Shan Zheng Tegaki/);
  await expect(page.locator('.pointer.low .tegaki-text')).toHaveCSS(
    'font-family',
    /Caveat Tegaki/,
  );
  await expect(
    page.locator('.number-cell').nth(5).locator('.tegaki-text'),
  ).toHaveCSS('font-family', /Caveat Tegaki/);

  // Ordinary text shares the already-loaded Caveat face, not a second font.
  const latinFamily = await page
    .locator('.classroom-shell')
    .evaluate((shell) =>
      getComputedStyle(shell).getPropertyValue('--font-hand-latin').trim(),
    );
  expect(latinFamily).not.toBe('');
  for (const selector of [
    '.cell-index',
    '.timeline-meta',
    '.skip-number',
    '.halving-trail span',
    '.controls-center [data-slot="native-select"]',
  ]) {
    const family = await page
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).fontFamily);
    expect(family.split(',')[0]!.replaceAll('"', '').trim()).toBe(
      latinFamily.replaceAll('"', ''),
    );
  }
  await settledBoard(page);
  await page.screenshot({
    path: info.outputPath('font-preview.png'),
    fullPage: true,
  });
});

test('mixed handwriting remains sequential at a partial-stroke seek', async ({
  page,
}) => {
  await seekTo(page, ref(53.2) + 0.4);
  await settledBoard(page);
  const runs = page.locator(
    '.board-notes [aria-label="中间值 = 23，找到"] .tegaki-text',
  );
  const progress = await runs.evaluateAll((elements) =>
    elements.map((element) =>
      Number(getComputedStyle(element).getPropertyValue('--tegaki-progress')),
    ),
  );
  expect(progress).toHaveLength(3);
  expect(progress[0]).toBeGreaterThan(0);
  expect(progress[0]).toBeLessThan(1);
  expect(progress.slice(1)).toEqual([0, 0]);
});

test('handwritten fonts stay within the board on small portrait and landscape screens', async ({
  page,
}) => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await seekTo(page, duration);
    await settledBoard(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    const bounds = await page
      .locator('.board-notes [aria-label="中间值 = 23，找到"]')
      .boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await expect(
      page.getByRole('button', { name: '播放', exact: true }),
    ).toBeVisible();
  }
});

test('progress, back ten seconds, speed, sound and restart use the real audio clock', async ({
  page,
}) => {
  const targetTime = await seekTo(page, ref(53.2) + 0.6);
  const cells = page.locator('.pointer-row > div');
  await expect(cells.nth(4).locator('.pointer.low')).toHaveCount(1);
  await expect(cells.nth(5).locator('.pointer.mid')).toHaveCount(1);
  await expect(cells.nth(6).locator('.pointer.high')).toHaveCount(1);
  await expect(
    page.locator('.number-cell').nth(5).locator('.found-circle'),
  ).toHaveCount(1);
  await expect(
    page.locator('.board-notes [aria-label="中间值 = 23，找到"]'),
  ).toHaveCount(1);

  await page.getByRole('button', { name: '后退十秒', exact: true }).click();
  await expect.poll(() => currentTime(page)).toBeCloseTo(targetTime - 10, 2);
  await expect(page.locator('.found-circle')).toHaveCount(0);

  await page.getByLabel('播放速度', { exact: true }).selectOption('1.5');
  await expect.poll(async () => (await audioState(page)).speed).toBe(1.5);
  await page.getByRole('button', { name: '打开声音', exact: true }).click();
  await expect.poll(async () => (await audioState(page)).muted).toBe(false);
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();

  await seekTo(page, duration);
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await expect.poll(() => currentTime(page)).toBe(0);
  await expect(
    page.locator('.discard-mark, .found-circle, .board-note'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(0.3);
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await expect.poll(() => currentTime(page)).toBe(0);
  await expect.poll(async () => (await audioState(page)).paused).toBe(true);
  await expect(
    page.getByRole('button', { name: '播放', exact: true }),
  ).toBeVisible();
});

test('pause freezes every pixel during handwriting and resume advances the clock', async ({
  page,
}, info) => {
  await seekTo(page, ref(61.2) + 0.3);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(ref(61.2) + 0.5);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const pausedAt = await currentTime(page);
  expect(pausedAt).toBeLessThan(ref(61.2) + 2.3);
  const before = await settledBoard(page);
  // This delay is intentional: observe that paused audio and drawing stay frozen.
  await page.waitForTimeout(350);
  expect(await currentTime(page)).toBe(pausedAt);
  await expectSameBoard(before, await settledBoard(page), 'paused-board', info);

  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(pausedAt + 0.3);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  expect(changedPixels(before, await settledBoard(page))).toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: '播放', exact: true }),
  ).toBeVisible();
});

test('prediction is a continuous narration cue, not an automatic checkpoint', async ({
  page,
}) => {
  await seekTo(page, ref(34));
  await page.getByLabel('播放速度', { exact: true }).selectOption('1.5');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(() => currentTime(page), { timeout: 10_000 })
    .toBeGreaterThan(ref(42.5));
  await expect(
    page.getByRole('button', { name: '暂停', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.checkpoint-layer')).toHaveCount(0);
  await expect(
    page.locator('.board-notes [aria-label="low = mid + 1"]'),
  ).toHaveCount(1);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
});

for (const at of [
  ref(24.1),
  ref(31.8),
  ref(53.2) + 0.4,
  ref(61.2) + 0.6,
  duration,
]) {
  test(`visual replay at ${at}s survives seeks, restart and fresh renderer mounts`, async ({
    page,
  }, info) => {
    const baselineTime = await seekTo(page, at);
    const baseline = await settledBoard(page);

    await seekTo(page, at > ref(50) ? ref(24.1) : duration);
    await seekTo(page, at);
    expect(await currentTime(page)).toBe(baselineTime);
    await expectSameBoard(
      baseline,
      await settledBoard(page),
      'seek-replay',
      info,
    );

    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await seekTo(page, at);
    await expectSameBoard(
      baseline,
      await settledBoard(page),
      'restart-replay',
      info,
    );

    await page.reload();
    await readyLesson(page);
    await seekTo(page, at);
    await expectSameBoard(
      baseline,
      await settledBoard(page),
      'fresh-mount-replay',
      info,
    );
  });
}

test('theme switches completed canvas ink without changing the clock and persists on reload', async ({
  page,
}, info) => {
  await seekTo(page, duration);
  const light = await settledBoard(page);
  const before = await audioState(page);
  const shell = page.locator('.classroom-shell');
  await expect(shell).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: '切换到深色', exact: true }).click();
  await expect(shell).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.locator('.example-switch')).toHaveCSS(
    'background-color',
    'rgb(23, 20, 29)',
  );
  await expect(page.getByLabel('示例课程')).toHaveCSS(
    'color',
    'rgb(255, 255, 255)',
  );
  await expect(page.locator('.paper-heading h1')).toHaveCSS(
    'color',
    'rgb(255, 255, 255)',
  );
  await expect(
    page.getByRole('button', { name: '切换到浅色', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await settledBoard(page);
  // Canvas pixels, not just inherited CSS, must repaint completed handwriting.
  const whitePixels = await page
    .locator('.paper-heading h1 canvas')
    .evaluateAll((elements) => {
      let white = 0;
      for (const element of elements) {
        const canvas = element as HTMLCanvasElement;
        const data = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < data.length; i += 4)
          if (
            data[i] > 220 &&
            data[i + 1] > 220 &&
            data[i + 2] > 220 &&
            data[i + 3] > 128
          )
            white++;
      }
      return white;
    });
  expect(whitePixels).toBeGreaterThan(100);
  expect(await audioState(page)).toEqual(before);
  await page.screenshot({
    path: info.outputPath('dark-theme.png'),
  });
  await page.reload();
  await readyLesson(page);
  await expect(shell).toHaveAttribute('data-theme', 'dark');
  await seekTo(page, duration);
  await page.getByRole('button', { name: '切换到浅色', exact: true }).click();
  await expectSameBoard(
    light,
    await settledBoard(page),
    'theme-roundtrip',
    info,
  );
  await page.reload();
  await readyLesson(page);
  await expect(shell).toHaveAttribute('data-theme', 'light');
});

test('theme switching works on mobile when preference storage is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await readyLesson(page);
  await expect(page.locator('.classroom-shell')).toHaveAttribute(
    'data-theme',
    'light',
  );
  await page.getByRole('button', { name: '切换到深色', exact: true }).click();
  await expect(page.locator('.classroom-shell')).toHaveAttribute(
    'data-theme',
    'dark',
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.getByRole('button', { name: '切换到浅色', exact: true }).click();
  await expect(page.locator('.classroom-shell')).toHaveAttribute(
    'data-theme',
    'light',
  );
});
