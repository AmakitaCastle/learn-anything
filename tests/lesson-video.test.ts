import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { parseLessonCommand } from '../scripts/lesson.ts';
import {
  VIDEO_RATIOS,
  prepareVideoExport,
  videoExportOptions,
} from '../scripts/lesson-video.ts';

void test('video defaults and presets have exact ratios and even H.264 dimensions', () => {
  assert.deepEqual(videoExportOptions({ output: 'lesson.mp4' }), {
    output: resolve('lesson.mp4'),
    aspectRatio: '16:9',
    fps: 24,
  });
  for (const [ratio, size] of Object.entries(VIDEO_RATIOS)) {
    const [width, height] = ratio.split(':').map(Number);
    assert.equal(size.width * height, size.height * width);
    assert.equal(size.width % 2, 0);
    assert.equal(size.height % 2, 0);
    assert.equal(
      videoExportOptions({
        output: 'lesson.MP4',
        aspectRatio: ratio,
        fps: '30',
      }).fps,
      30,
    );
  }
});
void test('invalid export settings fail before rendering or writing', () => {
  for (const aspectRatio of ['', '4:3', '9/16', '__proto__', 'toString'])
    assert.throws(() =>
      videoExportOptions({ output: 'lesson.mp4', aspectRatio }),
    );
  for (const fps of ['', '0', '-1', '1.5', '61', 'NaN', 'Infinity'])
    assert.throws(() => videoExportOptions({ output: 'lesson.mp4', fps }));
  for (const output of ['', ' ', 'lesson.webm', 'lesson', 'lesson.mp4/'])
    assert.throws(() => videoExportOptions({ output }));
});
void test('CLI exports saved, shipped or explicitly generated courses, never pure preflight', () => {
  for (const mode of [
    ['--play', 'course'],
    ['--demo'],
    ['topic', '--generate'],
    ['--draft', 'draft.json', '--cached'],
  ]) {
    const parsed = parseLessonCommand([
      ...mode,
      '--export-video',
      'lesson.mp4',
      '--aspect-ratio',
      '9:16',
      '--fps',
      '30',
    ]);
    assert.equal(parsed.video?.aspectRatio, '9:16');
    assert.equal(parsed.video?.fps, 30);
    assert.equal(parsed.checkOnly, false);
  }
  assert.equal(parseLessonCommand(['--demo']).video, undefined);
  assert.ok(parseLessonCommand(['topic']).checkOnly);
  for (const args of [
    ['topic', '--export-video', 'lesson.mp4'],
    ['--demo', '--aspect-ratio', '9:16'],
    ['--demo', '--fps', '30'],
    ['--demo', '--export-video', 'lesson.mp4', '--aspect-ratio', '4:3'],
    ['--demo', '--export-video', 'lesson.mp4', '--fps', '100'],
  ])
    assert.throws(() => parseLessonCommand(args));
});
void test('export refuses existing files and dangling symlinks without modifying them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learn-video-existing-'));
  try {
    const output = join(directory, 'original.mp4');
    await writeFile(output, 'original-video');
    await assert.rejects(
      prepareVideoExport(videoExportOptions({ output })),
      /已存在/,
    );
    assert.equal(await readFile(output, 'utf8'), 'original-video');
    const dangling = join(directory, 'dangling.mp4');
    await symlink(join(directory, 'missing.mp4'), dangling);
    await assert.rejects(
      prepareVideoExport(videoExportOptions({ output: dangling })),
      /已存在/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
void test('cancelled export preflight stops before tool launch', async () => {
  await assert.rejects(
    prepareVideoExport(
      videoExportOptions({ output: 'lesson.mp4' }),
      AbortSignal.abort(),
    ),
    /已取消/,
  );
});

void test('missing export tools fail before model configuration or billable work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learn-video-tools-'));
  try {
    const result = spawnSync(
      process.execPath,
      [
        '--conditions=learn-anything-source',
        '--experimental-strip-types',
        'scripts/lesson.ts',
        'topic',
        '--generate',
        '--export-video',
        join(directory, 'new.mp4'),
      ],
      { env: { PATH: directory, NODE_ENV: 'production' }, encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('FFmpeg'));
    assert.ok(!result.stdout.includes('模型备课'));
    assert.ok(!result.stderr.includes('请在 .env.local 中填写'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
