import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import caveat from 'tegaki/fonts/caveat';
import type { TegakiBundle } from 'tegaki/core';
import {
  DEFAULT_FONTS,
  CHINESE_FONTS,
  LATIN_FONTS,
  parseFontSelection,
} from '@learn-anything/lesson-schema';
import {
  readFontPreferences,
  writeFontPreferences,
} from '../scripts/font-preferences.ts';
import {
  handwritingRuns,
  handwritingRunProgress,
  speechHandwritingProgress,
} from '../packages/lesson-player/handwriting.ts';
import { videoExportOptions } from '../scripts/lesson-video.ts';
import { parseLessonCommand } from '../scripts/lesson.ts';

void test('only builtin choices are accepted independently, including export preflight', () => {
  for (const chinese of CHINESE_FONTS)
    for (const latin of LATIN_FONTS) {
      const expected = { chinese: chinese.id, latin: latin.id };
      assert.deepEqual(parseFontSelection(expected), expected);
      const options = videoExportOptions({
        output: 'font.mp4',
        chineseFont: chinese.id,
        latinFont: latin.id,
      });
      assert.equal(options.chineseFont, chinese.id);
      assert.equal(options.latinFont, latin.id);
      const cli = parseLessonCommand([
        '--demo',
        '--export-video',
        'font.mp4',
        '--export-font-chinese',
        chinese.id,
        '--export-font-latin',
        latin.id,
      ]);
      assert.equal(cli.video?.chineseFont, chinese.id);
      assert.equal(cli.video?.latinFont, latin.id);
    }
  for (const id of [
    '',
    'https://fonts.example/font.ttf',
    '../font.ttf',
    '__proto__',
    'toString',
  ]) {
    assert.throws(() =>
      videoExportOptions({ output: 'font.mp4', chineseFont: id }),
    );
    assert.throws(() =>
      videoExportOptions({ output: 'font.mp4', latinFont: id }),
    );
  }
  assert.throws(() =>
    parseLessonCommand(['--demo', '--export-font-chinese', 'wenkai']),
  );
});
void test('font preferences survive sessions, recover from corrupt data, and invalid writes preserve previous choice', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learn-font-prefs-'));
  const path = join(directory, 'settings', 'fonts.json');
  try {
    assert.deepEqual(await readFontPreferences(path), DEFAULT_FONTS);
    const choice = { chinese: 'wenkai', latin: 'parisienne' } as const;
    await writeFontPreferences(choice, path);
    assert.deepEqual(await readFontPreferences(path), choice);
    await assert.rejects(
      writeFontPreferences({ ...choice, chinese: '__proto__' } as never, path),
    );
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), choice);
    await writeFile(path, '{broken');
    assert.deepEqual(await readFontPreferences(path), DEFAULT_FONTS);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
void test('missing selected glyphs use default strokes and share deterministic speech progress', () => {
  const defaultChinese = {
    ...caveat,
    glyphData: { 中: caveat.glyphData.A, 文: caveat.glyphData.B },
  };
  const selectedChinese = {
    ...defaultChinese,
    glyphData: { 中: caveat.glyphData.A },
  };
  const selectedLatin: TegakiBundle = {
    ...caveat,
    glyphData: { ...caveat.glyphData },
  };
  delete selectedLatin.glyphData.B;
  const result = handwritingRuns('中文AB☃', selectedChinese, selectedLatin, {
    chinese: defaultChinese,
    latin: caveat,
  });
  assert.deepEqual(
    result.runs.map((run) => [run.text, run.script]),
    [
      ['中', 'chinese'],
      ['文', 'chinese-default'],
      ['A', 'latin'],
      ['B', 'latin-default'],
      ['☃', 'fallback'],
    ],
  );
  const timing = Array.from({ length: 5 }, (_, i) => ({ at: i, endAt: i + 1 }));
  const defaults = result.runs[1];
  assert.equal(speechHandwritingProgress(defaults, timing, 1), 0);
  assert.ok(speechHandwritingProgress(defaults, timing, 1.5) > 0);
  assert.ok(speechHandwritingProgress(defaults, timing, 1.5) < 1);
  assert.equal(speechHandwritingProgress(defaults, timing, 2), 1);
  assert.equal(
    speechHandwritingProgress(defaults, timing, 1.5),
    speechHandwritingProgress(defaults, timing, 1.5),
  );
  for (const run of result.runs) {
    assert.equal(handwritingRunProgress(run, 0, result.duration), 0);
    assert.equal(handwritingRunProgress(run, 1, result.duration), 1);
  }
});
