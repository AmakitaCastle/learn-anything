import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { parseLesson } from '@learn-anything/lesson-schema';
import { prepareDemoLesson } from '../../scripts/lesson-demo.ts';
import {
  startLessonWebApp,
  type LessonWebDependencies,
} from '../../scripts/lesson-web.ts';
import { startLessonViewer } from '../../scripts/lesson-viewer.ts';

test('web demo creates a lesson from the page and embeds the real classroom player', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const dependencies: LessonWebDependencies = {
    async status() {
      return { model: true, speech: true, ffmpeg: true, ready: true };
    },
    async run(input, context) {
      context.onProgress({
        phase: input.mode === 'demo' ? 'player' : 'draft',
        progress: 64,
        message: '正在准备浏览器测试课程…',
      });
      const demo = await prepareDemoLesson();
      try {
        const lesson = parseLesson(
          JSON.parse(
            await readFile(join(demo.directory, 'lesson.json'), 'utf8'),
          ),
        );
        const viewer = await startLessonViewer(demo.directory);
        return {
          viewerUrl: viewer.url,
          output:
            input.mode === 'demo'
              ? '内置示例（不写入 outputs）'
              : 'outputs/runs/browser-fixture',
          duration: lesson.duration,
          async close() {
            await viewer.close();
            await demo.close();
          },
        };
      } catch (error) {
        await demo.close();
        throw error;
      }
    },
  };
  const app = await startLessonWebApp({ dependencies });
  try {
    await page.goto(app.url);
    await expect(
      page.getByRole('heading', { name: /把一个问题/ }),
    ).toBeVisible();
    await expect(page.getByText('已就绪')).toHaveCount(3);
    await page.getByRole('button', { name: '先看示例' }).click();
    await expect(
      page.getByRole('heading', { name: '这堂课准备好了。' }),
    ).toBeVisible();
    await expect(
      page
        .frameLocator('iframe[title="生成课程播放器"]')
        .locator('.classroom-shell'),
    ).toHaveAttribute('data-classroom-ready', 'true');
    await expect(page.getByRole('link', { name: '课程 JSON' })).toHaveAttribute(
      'href',
      /lesson\.json$/,
    );

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '生成一堂课' }).click();
    await expect(page.getByText('outputs/runs/browser-fixture')).toBeVisible();
    await expect(
      page
        .frameLocator('iframe[title="生成课程播放器"]')
        .locator('.classroom-shell'),
    ).toHaveAttribute('data-classroom-ready', 'true');

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('body')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole('button', { name: '生成一堂课' }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});
