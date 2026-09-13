import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  frameAt,
  handwritingAt,
  presentationAt,
  type LessonFrame,
  type LessonSpec,
} from '../lib/lesson.ts';

const lesson = JSON.parse(
  readFileSync(
    new URL('../public/lessons/binary-search-doubao.json', import.meta.url),
    'utf8',
  ),
) as LessonSpec;
const at = (sourceAt: number) => presentationAt(lesson, sourceAt);

const boardIds = [
  'goal',
  'linear',
  'sorted',
  'compare',
  'discard',
  'move',
  'found',
  'invariant',
  'invariant-rule',
  'half',
  'scale',
  'complexity',
];

const frameFixtures = [
  {
    at: 0,
    chapter: 'question',
    focus: 'intro',
    window: [null, null, null],
    discarded: [],
    found: null,
    boardCount: 0,
  },
  {
    at: 12,
    chapter: 'question',
    focus: 'linear',
    window: [null, null, null],
    discarded: [],
    found: null,
    boardCount: 2,
  },
  {
    at: 23.845,
    chapter: 'first-cut',
    focus: 'compare',
    window: [0, 3, 6],
    discarded: [],
    found: null,
    boardCount: 3,
  },
  {
    at: 31.2,
    chapter: 'first-cut',
    focus: 'compare',
    window: [0, 3, 6],
    discarded: [0, 1, 2, 3],
    found: null,
    boardCount: 5,
  },
  {
    at: 40.658,
    chapter: 'prediction',
    focus: 'move-low',
    window: [0, 3, 6],
    discarded: [0, 1, 2, 3],
    found: null,
    boardCount: 5,
  },
  {
    at: 48.646,
    chapter: 'prediction',
    focus: 'new-window',
    window: [4, 5, 6],
    discarded: [0, 1, 2, 3],
    found: null,
    boardCount: 6,
  },
  {
    at: 53.2,
    chapter: 'prediction',
    focus: 'new-window',
    window: [4, 5, 6],
    discarded: [0, 1, 2, 3],
    found: 5,
    boardCount: 7,
  },
  {
    at: 61.2,
    chapter: 'prediction',
    focus: 'invariant',
    window: [4, 5, 6],
    discarded: [0, 1, 2, 3],
    found: 5,
    boardCount: 9,
  },
  {
    at: 66.8,
    chapter: 'invariant',
    focus: 'invariant',
    window: [4, 5, 6],
    discarded: [0, 1, 2, 3],
    found: 5,
    boardCount: 10,
  },
  {
    at: 87.009,
    chapter: 'scale',
    focus: 'scale',
    window: [4, 5, 6],
    discarded: [0, 1, 2, 3],
    found: 5,
    boardCount: 12,
  },
];

function summarize(frame: LessonFrame) {
  return {
    chapter: frame.chapterId,
    focus: frame.focus,
    window: [frame.low, frame.mid, frame.high],
    discarded: frame.discarded,
    found: frame.found,
    board: frame.board.map((item) => item.id),
  };
}

function assertFixture(fixture: (typeof frameFixtures)[number]) {
  assert.deepEqual(
    summarize(frameAt(lesson, at(fixture.at))),
    {
      chapter: fixture.chapter,
      focus: fixture.focus,
      window: fixture.window,
      discarded: fixture.discarded,
      found: fixture.found,
      board: boardIds.slice(0, fixture.boardCount),
    },
    `incorrect frame at ${fixture.at}`,
  );
}

void test('timeline events are ordered and stay inside the audio duration', () => {
  let previous = -1;
  for (const event of lesson.events) {
    assert.ok(event.at >= previous, `event at ${event.at} is out of order`);
    assert.ok(
      event.at <= lesson.duration,
      `event at ${event.at} exceeds duration`,
    );
    previous = event.at;
  }
});

void test('the first comparison frames the full search window', () => {
  const frame = frameAt(lesson, at(23.845));
  assert.equal(frame.low, 0);
  assert.equal(frame.mid, 3);
  assert.equal(frame.high, 6);
  assert.equal(lesson.array[frame.mid], 13);
});

void test('discarding the left half is restored from time alone', () => {
  const frame = frameAt(lesson, at(31.2));
  assert.deepEqual(frame.discarded, [0, 1, 2, 3]);
  assert.ok(frame.board.some((item) => item.id === 'discard'));
});

void test('the second window finds the target', () => {
  const frame = frameAt(lesson, at(53.2));
  assert.deepEqual([frame.low, frame.mid, frame.high], [4, 5, 6]);
  assert.equal(frame.found, 5);
  assert.equal(lesson.array[frame.found], lesson.target);
  assert.equal(
    frame.board.find((item) => item.id === 'found')?.text,
    '中间值 = 23，找到',
  );
});

void test('the final board retains the invariant and complexity', () => {
  const frame = frameAt(lesson, lesson.duration);
  assert.ok(frame.board.some((item) => item.id === 'invariant-rule'));
  assert.ok(frame.board.some((item) => item.id === 'complexity'));
});

void test('seeking and replaying are deterministic', () => {
  const originalLesson = structuredClone(lesson);
  for (const fixtures of [
    frameFixtures,
    [...frameFixtures].reverse(),
    frameFixtures,
  ]) {
    for (const fixture of fixtures) assertFixture(fixture);
  }
  assert.deepEqual(
    lesson,
    originalLesson,
    'seeking must not mutate the lesson',
  );
});

void test('events take effect at their exact boundary, not before it', () => {
  assert.deepEqual(frameAt(lesson, at(31.2) - 0.001).discarded, []);
  assert.deepEqual(frameAt(lesson, at(31.2)).discarded, [0, 1, 2, 3]);
  assert.equal(frameAt(lesson, at(48.646) - 0.001).low, 0);
  assert.equal(frameAt(lesson, at(48.646)).low, 4);
  assert.equal(frameAt(lesson, at(53.2) - 0.001).found, null);
  assert.equal(frameAt(lesson, at(53.2)).found, 5);
});

void test('an earlier returned frame cannot contaminate a replay', () => {
  const beginning = frameAt(lesson, 0);
  beginning.discarded.push(99);
  beginning.board.push({
    at: 0,
    id: 'external',
    text: 'external',
    tone: 'plain',
  });
  for (const fixture of frameFixtures) assertFixture(fixture);
});

void test('handwriting is drawn progressively from the lesson clock', () => {
  const item = frameAt(lesson, at(1.4)).board[0];
  assert.ok(item);

  const notStarted = handwritingAt(item, item.at);
  const inProgress = handwritingAt(item, item.at + 0.7);
  const finished = handwritingAt(item, item.at + 4);

  assert.ok(notStarted.characterProgress.every((value) => value === 0));
  assert.equal(notStarted.writingProgress, 0);
  assert.ok(inProgress.characterProgress.some((value) => value > 0));
  assert.ok(inProgress.characterProgress.some((value) => value < 1));
  assert.ok(inProgress.writingProgress > 0);
  assert.ok(inProgress.writingProgress < 1);
  assert.ok(finished.characterProgress.every((value) => value === 1));
  assert.equal(finished.writingProgress, 1);
  assert.equal(finished.underlineProgress, 1);
  assert.deepEqual(handwritingAt(item, item.at + 0.7), inProgress);
});

void test('the Tegaki bundle covers every animated lesson character', () => {
  const glyphData = JSON.parse(
    readFileSync(
      new URL('../lib/tegaki-font/glyphData.json', import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;
  const animatedText = [
    lesson.title,
    `${lesson.eyebrow.replace(' · ', ' ')} 目标值 ${lesson.target}`,
    `在有序数组中找 ${lesson.target}`,
    'lowmidhigh推导过程',
    ...lesson.events
      .filter((event) => event.type === 'board.write')
      .map((event) => event.text),
    ...lesson.array.map(String),
  ].join('');
  const missing = Array.from(new Set(Array.from(animatedText)))
    .filter((character) => !/\s/u.test(character))
    .filter((character) => !(character in glyphData));

  assert.deepEqual(missing, []);
});
