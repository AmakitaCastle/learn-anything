import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTegakiHandwritingProvider,
  lessonHandwritingCharacters,
} from '../packages/content-generator/handwriting.ts';
import {
  parseLessonDraft,
  parseHandwritingBundle,
} from '../packages/lesson-schema/index.ts';

const draft = parseLessonDraft(
  JSON.parse(
    await readFile(
      new URL('../examples/heating-rate/lesson.draft.json', import.meta.url),
      'utf8',
    ),
  ),
);

void test('official Tegaki generation covers new topic Chinese and reuses character caches', async () => {
  const cacheRoot = await mkdtemp(join(tmpdir(), 'learn-anything-glyph-test-'));
  try {
    const provider = createTegakiHandwritingProvider({ cacheRoot });
    const first = await provider.generate(draft);
    const second = await provider.generate(draft);
    assert.deepEqual(second, first);
    const chars = lessonHandwritingCharacters(draft);
    assert.ok(chars.includes('温') && chars.includes('钟'));
    assert.ok(!chars.includes('2'));
    for (const char of chars.filter((char) => /\p{Script=Han}/u.test(char))) {
      assert.ok(
        first.bundle.glyphData[char].s.length > 0,
        `missing strokes for ${char}`,
      );
    }
    assert.ok(first.font.length > 1000000);
    assert.equal(first.bundle.version, 0);
    const folders = await readdir(cacheRoot);
    assert.equal(folders.length, 1);
    assert.equal(
      (await readdir(join(cacheRoot, folders[0]))).length,
      chars.length,
    );
    const invalid = structuredClone(first.bundle);
    invalid.fontUrl = 'javascript:alert(1)';
    assert.throws(() => parseHandwritingBundle(invalid));
    const wrongVersion = { ...first.bundle, version: 1 };
    assert.throws(() => parseHandwritingBundle(wrongVersion));
    const malformed = structuredClone(first.bundle);
    malformed.glyphData['温'].s[0].p[0][0] = Infinity;
    assert.throws(() => parseHandwritingBundle(malformed));
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
});
