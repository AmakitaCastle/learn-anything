import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { expect, test } from '@playwright/test';

test('shipped CLI demo plays offline without credentials, audio tools or generated caches', async ({
  page,
}) => {
  test.setTimeout(30_000);
  const child = spawn(
    process.execPath,
    [
      '--conditions=learn-anything-source',
      '--experimental-strip-types',
      'scripts/lesson.ts',
      '--demo',
      '--no-open',
    ],
    {
      cwd: new URL('../../', import.meta.url),
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        NODE_ENV: 'development',
        PATH: '/no-audio-tools',
        LESSON_LLM_API_KEY: '',
        DOUBAO_SPEECH_API_KEY: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(
        () => reject(new Error('Demo did not start')),
        20_000,
      );
      child.stdout!.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = /播放器：(http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]+\/)/.exec(
          output,
        );
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Demo exited before startup'));
      });
    });
    const external: string[] = [];
    await page.route('**/*', async (route) => {
      if (new URL(route.request().url()).hostname !== '127.0.0.1') {
        external.push(route.request().url());
        await route.abort();
      } else await route.continue();
    });
    await page.goto(url);
    const shell = page.locator('.classroom-shell');
    await expect(shell).toHaveAttribute('data-classroom-ready', 'true');
    await page.getByRole('button', { name: '关闭声音', exact: true }).click();
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator('audio')
          .evaluate((audio: HTMLAudioElement) => audio.currentTime),
      )
      .toBeGreaterThan(0.3);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    const slider = page.getByRole('slider');
    await slider.press('End');
    await expect(page.locator('.phrase-circle')).toHaveCount(7);
    await expect(page.locator('[data-visual-id]')).toHaveCount(2);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: 'test-results/demo-preview.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await expect(shell).toHaveAttribute('data-classroom-time', '0');
    expect(external).toEqual([]);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
});
