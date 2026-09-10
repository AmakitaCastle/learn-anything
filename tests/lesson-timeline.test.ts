import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  frameAt,
  handwritingAt,
  type LessonSpec,
} from '../lib/lesson.ts';

const lesson = JSON.parse(
  readFileSync(new URL('../public/lessons/binary-search.json', import.meta.url), 'utf8'),
) as LessonSpec;

void test('timeline events are ordered and stay inside the audio duration', () => {
  let previous = -1;
  for (const event of lesson.events) {
    assert.ok(event.at >= previous, `event at ${event.at} is out of order`);
    assert.ok(event.at <= lesson.duration, `event at ${event.at} exceeds duration`);
    previous = event.at;
  }
});

void test('the first comparison frames the full search window', () => {
  const frame = frameAt(lesson, 23.845);
  assert.equal(frame.low, 0);
  assert.equal(frame.mid, 3);
  assert.equal(frame.high, 6);
  assert.equal(lesson.array[frame.mid], 13);
});

void test('discarding the left half is restored from time alone', () => {
  const frame = frameAt(lesson, 31.2);
  assert.deepEqual(frame.discarded, [0, 1, 2, 3]);
  assert.ok(frame.board.some((item) => item.id === 'discard'));
});

void test('the second window finds the target', () => {
  const frame = frameAt(lesson, 53.2);
  assert.deepEqual([frame.low, frame.mid, frame.high], [4, 5, 6]);
  assert.equal(frame.found, 5);
  assert.equal(lesson.array[frame.found], lesson.target);
});

void test('the final board retains the invariant and complexity', () => {
  const frame = frameAt(lesson, lesson.duration);
  assert.ok(frame.board.some((item) => item.id === 'invariant-rule'));
  assert.ok(frame.board.some((item) => item.id === 'complexity'));
});

void test('seeking and replaying are deterministic', () => {
  for (const at of [0, 12, 23.845, 31.2, 40.658, 53.2, 66.8, 82, 87.009]) {
    assert.deepEqual(frameAt(lesson, at), frameAt(lesson, at));
  }
  const beginning = frameAt(lesson, 0);
  frameAt(lesson, 82);
  assert.deepEqual(frameAt(lesson, 0), beginning);
});

void test('handwriting is drawn progressively from the lesson clock', () => {
  const item = frameAt(lesson, 1.4).board[0];
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
