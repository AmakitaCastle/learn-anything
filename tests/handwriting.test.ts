import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { computeTimeline, type TegakiBundle } from 'tegaki/core';
import caveat from 'tegaki/fonts/caveat';

import {
  HANDWRITING_TIMING,
  handwritingRunProgress,
  handwritingRuns,
  isLatinHandwritingCharacter,
} from '../lib/handwriting.ts';
import { type LessonSpec } from '../lib/lesson.ts';

const chinese: TegakiBundle = {
  family: 'Ma Shan Zheng Tegaki 0a5055c7',
  lineCap: 'round',
  fontUrl: '',
  fontFaceCSS: '',
  unitsPerEm: 1000,
  ascender: 880,
  descender: -120,
  glyphData: JSON.parse(
    readFileSync(
      new URL('../lib/tegaki-font/glyphData.json', import.meta.url),
      'utf8',
    ),
  ),
};
const lesson: LessonSpec = JSON.parse(
  readFileSync(
    new URL('../public/lessons/binary-search-doubao.json', import.meta.url),
    'utf8',
  ),
);

void test('mixed handwriting selects Caveat only for Latin, numbers and half-width symbols', () => {
  const schedule = handwritingRuns('中间值 = 23，找到', chinese, caveat);
  assert.deepEqual(
    schedule.runs.map(({ text, script }) => ({ text, script })),
    [
      { text: '中间值', script: 'chinese' },
      { text: ' = 23', script: 'latin' },
      { text: '，找到', script: 'chinese' },
    ],
  );
  assert.equal(
    schedule.runs.map((run) => run.text).join(''),
    '中间值 = 23，找到',
  );
  assert.deepEqual(
    handwritingRuns('low = mid + 1', chinese, caveat).runs.map(
      (run) => run.script,
    ),
    ['latin'],
  );
  assert.deepEqual(
    handwritingRuns('推导过程', chinese, caveat).runs.map((run) => run.script),
    ['chinese'],
  );
});

void test('mixed runs draw sequentially instead of restarting their progress together', () => {
  const schedule = handwritingRuns('中间值 = 23，找到', chinese, caveat);
  const [first, middle, last] = schedule.runs;
  assert.ok(first && middle && last);
  const sample = (time: number) =>
    schedule.runs.map((run) =>
      handwritingRunProgress(run, time / schedule.duration, schedule.duration),
    );

  const before = sample(first.duration / 2);
  assert.ok(before[0]! > 0 && before[0]! < 1);
  assert.deepEqual(before.slice(1), [0, 0]);
  const during = sample(middle.offset + middle.duration / 2);
  assert.equal(during[0], 1);
  assert.ok(during[1]! > 0 && during[1]! < 1);
  assert.equal(during[2], 0);
  assert.ok(last.offset >= middle.offset + middle.duration - 1e-10);
  assert.deepEqual(sample(schedule.duration), [1, 1, 1]);
  assert.deepEqual(sample(-1), [0, 0, 0]);
  assert.deepEqual(sample(middle.offset + middle.duration / 2), during);
});

void test('a missing character never disables strokes for the rest of the line', () => {
  const result = handwritingRuns('中温 = 23', chinese, caveat);
  assert.deepEqual(
    result.runs.map(({ text, script }) => ({ text, script })),
    [
      { text: '中', script: 'chinese' },
      { text: '温', script: 'fallback' },
      { text: ' = 23', script: 'latin' },
    ],
  );
  assert.deepEqual(
    result.runs.map((run) => run.start),
    [0, 1, 2],
  );
  assert.ok(result.duration > 0);
  for (const run of result.runs) {
    assert.equal(handwritingRunProgress(run, 0, result.duration), 0);
    assert.equal(handwritingRunProgress(run, 1, result.duration), 1);
  }
});

void test('Chinese-only strokes and timing remain unchanged, without mutating the font bundle', () => {
  const original = structuredClone(chinese.glyphData);
  const schedule = handwritingRuns('目标若存在，一定在内', chinese, caveat);
  assert.equal(
    schedule.duration,
    computeTimeline('目标若存在，一定在内', chinese, HANDWRITING_TIMING)
      .totalDuration,
  );
  assert.equal(schedule.runs.length, 1);
  assert.equal(
    handwritingRunProgress(schedule.runs[0]!, 0.4, schedule.duration),
    0.4,
  );
  handwritingRuns('目标值 23', chinese, caveat);
  assert.deepEqual(chinese.glyphData, original);
});

void test('the selected font covers every animated lesson character', () => {
  const animatedText = [
    lesson.title,
    `${lesson.eyebrow.replace(' · ', ' ')} 目标值 ${lesson.target}`,
    `在有序数组中找 ${lesson.target}`,
    'lowmidhigh推导过程',
    ...lesson.array.map(String),
    ...lesson.events
      .filter((event) => event.type === 'board.write')
      .map((event) => event.text),
  ].join('');
  const missing = Array.from(new Set(Array.from(animatedText)))
    .filter((character) => !/\s/u.test(character))
    .filter(
      (character) =>
        !(
          character in
          (isLatinHandwritingCharacter(character, caveat) ? caveat : chinese)
            .glyphData
        ),
    );
  assert.deepEqual(missing, []);
});

void test('empty text and whitespace-only runs have bounded deterministic progress', () => {
  assert.deepEqual(handwritingRuns('', chinese, caveat), {
    runs: [],
    duration: 0,
  });
  const schedule = handwritingRuns(' ', chinese, caveat);
  assert.equal(schedule.duration, 0);
  assert.equal(handwritingRunProgress(schedule.runs[0]!, 1, 0), 1);
});
