import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';
import { writeFile } from 'node:fs/promises';
async function ready(page: Page, navigate = true) {
  if (navigate) await page.goto('/examples/binary-search?view=flow');
  await expect(
    page.getByRole('button', { name: '播放', exact: true }),
  ).toBeVisible();
  // Wait for the client clock and handlers, not merely server-rendered controls.
  await expect(page.locator('main')).toHaveAttribute(
    'data-classroom-ready',
    'true',
  );
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((audio) => (audio as HTMLAudioElement).readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() =>
      page.evaluate(() =>
        ['Caveat Tegaki', 'Ma Shan Zheng Tegaki'].every((name) =>
          Array.from(document.fonts).some(
            (font) => font.family.includes(name) && font.status === 'loaded',
          ),
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((audio) => (audio as HTMLAudioElement).muted),
    )
    .toBe(true);
}
async function seek(page: Page, time: number) {
  await page.locator('audio').evaluate((audio, time) => {
    (audio as HTMLAudioElement).currentTime = time;
  }, time);
  await expect
    .poll(() => page.locator('.timeline-meta > span').first().textContent())
    .toBe(
      `${Math.floor(time / 60)}:${String(Math.floor(time) % 60).padStart(2, '0')}`,
    );
  await expect
    .poll(async () =>
      Number(await page.locator('main').getAttribute('data-classroom-time')),
    )
    .toBeCloseTo(time, 4);
}
async function capture(page: Page) {
  await page.mouse.move(5, 5);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    for (let index = 0; index < 6; index++)
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
  });
  const board = page.locator('.paper-board');
  const options = {
    animations: 'disabled',
    caret: 'hide',
    style:
      '.player-dock,.player-dock *,.example-switch,.example-switch *{visibility:hidden!important;transition:none!important}',
  } as const;
  let previous = await board.screenshot(options);
  for (let index = 0; index < 20; index++) {
    await page.waitForTimeout(50);
    const next = await board.screenshot(options);
    if (previous.equals(next)) return next;
    previous = next;
  }
  throw Error('paused board did not settle');
}
async function same(
  before: Buffer,
  after: Buffer,
  info: TestInfo,
  label: string,
) {
  const a = PNG.sync.read(before),
    b = PNG.sync.read(after);
  expect([b.width, b.height]).toEqual([a.width, a.height]);
  let changed = 0,
    minX = a.width,
    minY = a.height,
    maxX = 0,
    maxY = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (!a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4))) {
      changed++;
      const x = (i / 4) % a.width,
        y = Math.floor(i / 4 / a.width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  if (changed) {
    await writeFile(info.outputPath(`${label}-before.png`), before);
    await writeFile(info.outputPath(`${label}-after.png`), after);
  }
  expect(
    changed,
    `${label}: changed pixels ${minX},${minY} to ${maxX},${maxY}`,
  ).toBe(0);
}
test('flow uses the same real audio clock and deterministic board without array code', async ({
  page,
}, info) => {
  await ready(page);
  await seek(page, 36.1);
  await expect(page.locator('[data-grammar="flow"]')).toHaveCount(1);
  await expect(page.locator('.number-array')).toHaveCount(0);
  await expect(page.locator('[data-node="move"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  const before = await capture(page);
  await seek(page, 10);
  await seek(page, 36.1);
  const after = await capture(page);
  await same(before, after, info, 'seek');
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await seek(page, 36.1);
  await same(before, await capture(page), info, 'restart');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('audio')
        .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
    )
    .toBeGreaterThan(36.3);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await page
      .locator('audio')
      .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
    image = await capture(page);
  await page.waitForTimeout(250);
  await same(image, await capture(page), info, 'pause');
  expect(
    await page
      .locator('audio')
      .evaluate((audio) => (audio as HTMLAudioElement).currentTime),
  ).toBe(paused);
});
test('course replacement resets the old playback and all tracks', async ({
  page,
}) => {
  await ready(page);
  await seek(page, 50);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.getByLabel('示例课程').selectOption('array');
  await expect(page.locator('main')).toHaveAttribute(
    'data-lesson-id',
    'binary-search-why-half',
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
  await expect(
    page.locator('.board-note,.found-circle,.grammar-node'),
  ).toHaveCount(0);
  await page.getByLabel('示例课程').selectOption('flow');
  await seek(page, 50);
  await expect(page.locator('[data-node="found"]')).toHaveAttribute(
    'data-active',
    'true',
  );
});
for (const [selection, grammar, time, selector] of [
  ['state', 'state-transition', 50, '[data-node="found"][data-active="true"]'],
  ['plot', 'plot', 66, '[data-plot-through="4"]'],
] as const) {
  test(`${grammar} is a registered data-driven track with repeatable seek`, async ({
    page,
  }, info) => {
    await ready(page);
    await page.getByLabel('示例课程').selectOption(selection);
    await seek(page, time);
    await expect(page.locator(`[data-grammar="${grammar}"]`)).toHaveCount(1);
    await expect(page.locator(selector)).toHaveCount(1);
    const image = await capture(page);
    await seek(page, 10);
    await seek(page, time);
    await same(image, await capture(page), info, 'seek');
    await page.reload();
    await ready(page, false);
    await page.getByLabel('示例课程').selectOption(selection);
    await expect(page.locator(`[data-grammar="${grammar}"]`)).toHaveCount(1);
    await seek(page, time);
    await same(image, await capture(page), info, 'reload');
  });
}
test('the Demo navigation tool delegates to the public classroom API', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const target = window as Window & {
      classroomTool?: { execute(input: unknown): unknown };
      classroomSignal?: AbortSignal;
    };
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(
          tool: { name: string; execute(input: unknown): unknown },
          options: { signal: AbortSignal },
        ) {
          if (tool.name === 'navigate_lesson') {
            target.classroomTool = tool;
            target.classroomSignal = options.signal;
          }
        },
      },
    });
  });
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean((window as Window & { classroomTool?: unknown }).classroomTool),
      ),
    )
    .toBe(true);
  const result = await page.evaluate(() =>
    (
      window as Window & {
        classroomTool?: { execute(input: unknown): unknown };
      }
    ).classroomTool?.execute({ seconds: 50 }),
  );
  expect(result).toMatchObject({ seconds: 50 });
  await expect
    .poll(async () =>
      Number(await page.locator('main').getAttribute('data-classroom-time')),
    )
    .toBe(50);
  await expect(page.locator('[data-node="collection"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  expect(
    await page.evaluate(() => {
      try {
        (
          window as Window & {
            classroomTool?: { execute(input: unknown): unknown };
          }
        ).classroomTool?.execute({ seconds: -1 });
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
});
