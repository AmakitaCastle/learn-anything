import { expect, test, type Page, type TestInfo } from '@playwright/test';
import data from '../../public/lessons/water-cycle.json' with { type: 'json' };
async function ready(page: Page, url = '/examples/flow') {
  await page.goto(url);
  await expect(page.locator('main')).toHaveAttribute(
    'data-classroom-ready',
    'true',
  );
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((audio) => (audio as HTMLAudioElement).muted),
    )
    .toBe(true);
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
  await page.mouse.move(5, 5);
  await page.evaluate(() => document.fonts.ready);
  const options = {
    animations: 'disabled',
    caret: 'hide',
    style:
      '.player-dock,.player-dock *,.example-switch,.example-switch *{visibility:hidden!important;transition:none!important}',
  } as const;
  let previous = await page.locator('.paper-board').screenshot(options);
  for (let index = 0; index < 12; index++) {
    await page.waitForTimeout(70);
    const current = await page.locator('.paper-board').screenshot(options);
    if (current.equals(previous)) return current;
    previous = current;
  }
  throw new Error('Water cycle board did not settle');
}
async function same(
  page: Page,
  expected: Buffer,
  info: TestInfo,
  label: string,
) {
  const actual = await frame(page);
  if (!actual.equals(expected)) {
    await info.attach(`${label}-expected`, {
      body: expected,
      contentType: 'image/png',
    });
    await info.attach(`${label}-actual`, {
      body: actual,
      contentType: 'image/png',
    });
  }
  expect(actual.equals(expected), label).toBe(true);
}
test('the homepage and current example use a new water-cycle lesson and matching voice', async ({
  page,
}) => {
  for (const url of ['/', '/examples/flow']) {
    await ready(page, url);
    await expect(page.locator('main')).toHaveAttribute(
      'data-lesson-id',
      'water-cycle',
    );
    await expect(page.locator('audio')).toHaveAttribute(
      'src',
      '/audio/water-cycle-zh.mp3',
    );
    await expect(page.locator('.number-array')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('二分查找');
    expect(
      await page
        .locator('audio')
        .evaluate((audio) => (audio as HTMLAudioElement).duration),
    ).toBeCloseTo(data.duration, 1);
  }
  await expect(page.getByLabel('示例课程').locator('option')).toHaveText([
    '水循环路径',
    '位置与状态',
  ]);
});
test('water-cycle speech, board and animation freeze and restore together', async ({
  page,
}, info) => {
  await ready(page);
  const transition = data.events.find(
    (event) =>
      event.type === 'visual' &&
      event.action === 'activate' &&
      'payload' in event &&
      event.payload.id === 'precipitation',
  )!.at;
  const time = transition + 0.6;
  await seek(page, time);
  await expect(page.locator('[data-node="precipitation"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.locator('[aria-label="降水：雨或雪落回地面"]')).toHaveCount(
    1,
  );
  const image = await frame(page);
  await seek(page, 2);
  await seek(page, time);
  await same(page, image, info, 'seek restore');
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await seek(page, time);
  await same(page, image, info, 'restart restore');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
    )
    .toBeGreaterThan(time + 0.2);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await page
      .locator('audio')
      .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
    pausedImage = await frame(page);
  await page.waitForTimeout(250);
  await same(page, pausedImage, info, 'pause freeze');
  expect(
    await page
      .locator('audio')
      .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
  ).toBe(paused);
  await seek(page, 60);
  await expect(page.locator('.board-note')).toHaveCount(8);
  await page.screenshot({ path: info.outputPath('water-cycle-preview.png') });
});
test('water-cycle state view is data-only and resets cleanly when switched during playback', async ({
  page,
}, info) => {
  await ready(page);
  await seek(page, 36.6);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByLabel('示例课程').selectOption('state');
  await expect(page.locator('main')).toHaveAttribute(
    'data-lesson-id',
    'water-cycle-state',
  );
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
    )
    .toBe(0);
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((audio) => (audio as HTMLAudioElement).paused),
    )
    .toBe(true);
  await expect(page.locator('.board-note')).toHaveCount(0);
  await seek(page, 36.6);
  await expect(page.locator('[data-node="precipitation"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.locator('[data-grammar="state-transition"]')).toHaveCount(
    1,
  );
  const image = await frame(page);
  await seek(page, 2);
  await seek(page, 36.6);
  await same(page, image, info, 'state seek restore');
});
