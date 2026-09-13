import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from '@playwright/test';
import {
  createFfmpegAudioProcessor,
  createTegakiHandwritingProvider,
} from '@learn-anything/content-generator';
import { spokenText } from '@learn-anything/lesson-schema';
import { runLessonWorkflow } from '../../scripts/lesson-workflow.ts';
import {
  exportLessonVideo,
  VIDEO_RATIOS,
  videoExportOptions,
} from '../../scripts/lesson-video.ts';
import { startLessonViewer } from '../../scripts/lesson-viewer.ts';

const run = promisify(execFile);
test('real MP4 export has selected dimensions, H.264, AAC, aligned duration and deterministic fitted frames', async ({
  page,
}) => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'learn-video-browser-'));
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
    draft.boardMode = 'full-narration';
    draft.segments.forEach((segment: { visualId?: string }) => {
      segment.visualId = draft.visuals[0].id;
    });
    const audio = createFfmpegAudioProcessor();
    const fixture = await audio.encodeMp3(Buffer.alloc(2 * 48000));
    const result = await runLessonWorkflow(
      { draft },
      { outputRoot: directory },
      {
        audio,
        handwriting: createTegakiHandwritingProvider({
          cacheRoot: join(directory, 'fonts'),
          fontUrl: '/lesson-assets/handwriting.ttf',
        }),
        speech: {
          async synthesize(segment) {
            const words = Array.from(spokenText(segment.text));
            return {
              audio: fixture.audio,
              logId: null,
              metadata: [
                {
                  sentence: {
                    words: words.map((word, index) => ({
                      word,
                      startTime: (index * 1.9) / words.length,
                      endTime: ((index + 1) * 1.9) / words.length,
                    })),
                  },
                },
              ],
            };
          },
        },
      },
    );
    for (const [ratio, size] of Object.entries(VIDEO_RATIOS)) {
      const output = join(directory, ratio.replace(':', '-') + '.mp4');
      if (ratio === '9:16') {
        const { stdout } = await run(
          process.execPath,
          [
            '--conditions=learn-anything-source',
            '--experimental-strip-types',
            'scripts/lesson.ts',
            '--play',
            result.directory,
            '--export-video',
            output,
            '--aspect-ratio',
            ratio,
            '--fps',
            '2',
          ],
          { timeout: 60000 },
        );
        expect(stdout).toContain('视频已保存');
      } else {
        await exportLessonVideo(
          result.directory,
          videoExportOptions({ output, aspectRatio: ratio, fps: 2 }),
        );
      }
      const { stdout } = await run('ffprobe', [
        '-v',
        'error',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        output,
      ]);
      const info = JSON.parse(stdout);
      const video = info.streams.find(
        (stream: { codec_type: string }) => stream.codec_type === 'video',
      );
      const sound = info.streams.find(
        (stream: { codec_type: string }) => stream.codec_type === 'audio',
      );
      expect(video.codec_name).toBe('h264');
      expect(video.width).toBe(size.width);
      expect(video.height).toBe(size.height);
      expect(video.pix_fmt).toBe('yuv420p');
      expect(video.avg_frame_rate).toBe('2/1');
      expect(sound.codec_name).toBe('aac');
      expect(
        Math.abs(Number(info.format.duration) - result.duration),
      ).toBeLessThan(0.55);
      expect(Math.abs(Number(sound.duration) - result.duration)).toBeLessThan(
        0.05,
      );
      const decoded = await run(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          output,
          '-vf',
          'select=eq(n\\,6)',
          '-frames:v',
          '1',
          '-f',
          'image2pipe',
          '-vcodec',
          'png',
          'pipe:1',
        ],
        { encoding: 'buffer', maxBuffer: 10000000 },
      );
      const pixels = PNG.sync.read(decoded.stdout);
      let ink = 0;
      for (let index = 0; index < pixels.data.length; index += 4)
        if (pixels.data[index] < 150 && pixels.data[index + 1] < 150) ink++;
      expect(ink).toBeGreaterThan(1000); // Real decoded frames, not a blank MP4.
    }
    viewer = await startLessonViewer(result.directory);
    await page.setViewportSize(VIDEO_RATIOS['9:16']);
    await page.goto(viewer.url + '?video=1');
    await page.waitForFunction(() => Boolean(window.lessonVideo));
    await page.evaluate(() =>
      window.lessonVideo!.render(window.lessonVideo!.duration),
    );
    expect(await page.locator('audio').count()).toBe(0);
    expect(await page.locator('.player-dock').count()).toBe(0);
    expect(await page.locator('.teaching-group').count()).toBe(1);
    expect(await page.locator('.teaching-writing > section').count()).toBe(1);
    const bounds = await page.locator('.video-content').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(23);
    expect(bounds!.y).toBeGreaterThanOrEqual(23);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(697);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1257);
    const final = await page.screenshot();
    await page.evaluate(() => window.lessonVideo!.render(0));
    await page.evaluate(() =>
      window.lessonVideo!.render(window.lessonVideo!.duration),
    );
    expect(await page.screenshot()).toEqual(final);

    const controller = new AbortController();
    const cancelledOutput = join(directory, 'cancelled.mp4');
    await expect(
      exportLessonVideo(
        result.directory,
        videoExportOptions({ output: cancelledOutput, fps: 2 }),
        {
          signal: controller.signal,
          onProgress() {
            controller.abort();
          },
        },
      ),
    ).rejects.toThrow(/已取消/);
    const files = await readdir(directory);
    expect(files).not.toContain('cancelled.mp4');
    expect(files.some((file) => file.startsWith('.lesson-video-'))).toBe(false);
    const raced = join(directory, 'raced.mp4');
    await expect(
      exportLessonVideo(
        result.directory,
        videoExportOptions({ output: raced, fps: 2 }),
        {
          onProgress(frame, total) {
            if (frame === total)
              writeFileSync(raced, 'other-video', { flag: 'wx' });
          },
        },
      ),
    ).rejects.toThrow(/已存在/);
    expect(await readFile(raced, 'utf8')).toBe('other-video');
    const lessonFile = join(result.directory, 'lesson.json');
    const original = await readFile(lessonFile, 'utf8');
    await writeFile(
      lessonFile,
      JSON.stringify({
        ...JSON.parse(original),
        duration: result.duration + 5,
      }),
    );
    await expect(
      exportLessonVideo(
        result.directory,
        videoExportOptions({ output: join(directory, 'mismatch.mp4') }),
      ),
    ).rejects.toThrow(/时长/);
    expect(await readdir(directory)).not.toContain('mismatch.mp4');
  } finally {
    await viewer?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
