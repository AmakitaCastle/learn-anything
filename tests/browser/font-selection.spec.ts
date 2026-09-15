import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { CHINESE_FONTS, LATIN_FONTS } from '@learn-anything/lesson-schema';

const capture = {
  style: '.player-dock { visibility: hidden !important; }',
  animations: 'disabled' as const,
};
async function ready(page: Page) {
  await page.goto('/examples/binary-search');
  await expect(page.locator('main')).toHaveAttribute(
    'data-classroom-ready',
    'true',
  );
  await expect(page.locator('main')).toHaveAttribute(
    'data-font-loading',
    'false',
  );
}
async function seek(page: Page, time: number) {
  await page.locator('audio').evaluate((audio: HTMLAudioElement, time) => {
    audio.currentTime = time;
  }, time);
  await expect
    .poll(async () =>
      Number(await page.locator('main').getAttribute('data-classroom-time')),
    )
    .toBeCloseTo(time, 3);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function fonts(page: Page, chinese: string, latin: string) {
  await page.locator('.font-settings').evaluate((node: HTMLDetailsElement) => {
    node.open = true;
  });
  await page
    .getByRole('combobox', { name: '中文字体', exact: true })
    .selectOption(chinese);
  await page
    .getByRole('combobox', { name: '英文和数字字体', exact: true })
    .selectOption(latin);
  await expect(page.locator('main')).toHaveAttribute(
    'data-chinese-font',
    chinese,
  );
  await expect(page.locator('main')).toHaveAttribute('data-latin-font', latin);
  await expect(page.locator('main')).toHaveAttribute(
    'data-font-loading',
    'false',
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
}
test('all nine font pairs preserve partial writing, pause, reverse seek and persisted reload', async ({
  page,
}) => {
  test.setTimeout(60000);
  await ready(page);
  const controlFonts = () =>
    page
      .locator(
        '.timeline-meta, .narration-state, .skip-number, select[aria-label="播放速度"]',
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).fontFamily),
      );
  const originalControlFonts = await controlFonts();
  let defaultFrame: Buffer | undefined;
  const titleFrames = new Set<string>();
  for (const chinese of CHINESE_FONTS) {
    for (const latin of LATIN_FONTS) {
      await seek(page, 21.15);
      await fonts(page, chinese.id, latin.id);
      expect(await controlFonts()).toEqual(originalControlFonts);
      // Font selection must leave the same real paused audio position intact.
      expect(
        await page
          .locator('audio')
          .evaluate((audio: HTMLAudioElement) => [
            audio.currentTime,
            audio.paused,
            audio.playbackRate,
          ]),
      ).toEqual([21.15, true, 1]);
      await seek(page, 21.15);
      const frame = await page.locator('.paper-board').screenshot(capture);
      if (!defaultFrame) defaultFrame = frame;
      if (latin.id === 'caveat') {
        await mkdir('outputs/previews/font-selection', { recursive: true });
        await page.screenshot({
          path: `outputs/previews/font-selection/${chinese.id}.png`,
        });
        titleFrames.add(
          (await page.locator('h1').screenshot()).toString('base64'),
        );
      }
      await page.waitForTimeout(180);
      expect(await page.locator('.paper-board').screenshot(capture)).toEqual(
        frame,
      );
      await seek(page, 48);
      await seek(page, 21.15);
      expect(await page.locator('.paper-board').screenshot(capture)).toEqual(
        frame,
      );
      await page.getByRole('button', { name: '重新开始', exact: true }).click();
      await seek(page, 21.15);
      expect(await page.locator('.paper-board').screenshot(capture)).toEqual(
        frame,
      );
    }
  }
  expect(titleFrames.size).toBe(3);
  await page.reload();
  await expect(page.locator('main')).toHaveAttribute(
    'data-chinese-font',
    CHINESE_FONTS[2].id,
  );
  await expect(page.locator('main')).toHaveAttribute(
    'data-latin-font',
    LATIN_FONTS[2].id,
  );
  await fonts(page, CHINESE_FONTS[0].id, LATIN_FONTS[0].id);
  await seek(page, 21.15);
  expect(await page.locator('.paper-board').screenshot(capture)).toEqual(
    defaultFrame,
  );
});
test('switching during playback preserves speed and mute, draws forward, and fits a narrow screen', async ({
  page,
}) => {
  await ready(page);
  await page
    .getByRole('combobox', { name: '播放速度', exact: true })
    .selectOption('1.5');
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await seek(page, 21);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await fonts(page, CHINESE_FONTS[2].id, LATIN_FONTS[1].id);
  const audio = await page
    .locator('audio')
    .evaluate((audio: HTMLAudioElement) => ({
      time: audio.currentTime,
      paused: audio.paused,
      muted: audio.muted,
      speed: audio.playbackRate,
    }));
  expect(audio.time).toBeGreaterThan(21);
  expect(audio.paused).toBe(false);
  expect(audio.muted).toBe(true);
  expect(audio.speed).toBe(1.5);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const chinese of CHINESE_FONTS) {
    await fonts(page, chinese.id, LATIN_FONTS[2].id);
    await seek(page, 70);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole('combobox', { name: '中文字体', exact: true }),
    ).toBeInViewport();
  }
});
test('a failed font load retains previous handwriting and blocked preference storage still allows switching', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('storage denied');
    };
  });
  await ready(page);
  await seek(page, 21.15);
  await page.route('**/*wenkai*', (route) => route.abort());
  await page.locator('.font-settings summary').click();
  await page
    .getByRole('combobox', { name: '中文字体', exact: true })
    .selectOption(CHINESE_FONTS[2].id);
  await expect(page.getByRole('alert')).toContainText('字体载入失败');
  await expect(page.locator('main')).toHaveAttribute(
    'data-chinese-font',
    CHINESE_FONTS[0].id,
  );
  await page.unroute('**/*wenkai*');
  await fonts(page, CHINESE_FONTS[1].id, LATIN_FONTS[2].id);
  await seek(page, 21.15);
  await page.route('**/*klee-one*.ttf', (route) => route.abort());
  await page
    .getByRole('combobox', { name: '英文和数字字体', exact: true })
    .selectOption('klee-one');
  await expect(page.getByRole('alert')).toContainText('字体载入失败');
  await page.unroute('**/*klee-one*.ttf');
  await fonts(page, CHINESE_FONTS[1].id, 'klee-one');
  await seek(page, 21.15);
});
