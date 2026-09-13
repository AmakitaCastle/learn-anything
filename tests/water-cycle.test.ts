import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { alignedSegment, spokenText } from '../lib/tts/segment-alignment.ts';
import {
  compileWaterCycle,
  waterCycleSegments,
  type SegmentTiming,
} from '../examples/water-cycle/draft.ts';
import { parseLesson } from '../packages/lesson-schema/index.ts';
const metadata = (text: string) => [
  {
    sentence: {
      words: Array.from(spokenText(text), (word, index) => ({
        word,
        startTime: index * 0.1,
        endTime: (index + 1) * 0.1,
      })),
    },
  },
];
void test('segment alignment uses exact returned words, including Unicode and punctuation', () => {
  const alignment = alignedSegment('太阳，加热水。', metadata('太阳加热水'), 1);
  assert.equal(alignment.at('加热'), 0.2);
  assert.throws(() => alignment.at('下雨'));
  assert.throws(() => alignedSegment('水水', metadata('水水'), 1).at('水'));
});
void test('missing, mismatched, overlapping and out-of-bounds speech metadata fails closed', () => {
  assert.throws(() => alignedSegment('太阳', [], 1));
  assert.throws(() => alignedSegment('太阳', metadata('下雨'), 1));
  assert.throws(() => alignedSegment('太阳', metadata('太阳'), 0.01));
  const overlapping = metadata('太阳');
  overlapping[0].sentence.words[1].startTime = 0.01;
  assert.throws(() => alignedSegment('太阳', overlapping, 1));
});
void test('standalone subtitle punctuation is skipped while spoken timing remains strict', () => {
  const words = [
    { word: '『', startTime: 0, endTime: 0.03 },
    { word: 'Redis', startTime: 0.1, endTime: 0.5 },
    { word: '』，', startTime: 0.5, endTime: 0.53 },
    { word: '快。', startTime: 0.6, endTime: 0.9 },
  ];
  const source = [{ sentence: { words } }];
  const alignment = alignedSegment('『Redis』，快。', source, 1);
  assert.deepEqual(alignment.words, [words[1], words[3]]);
  assert.equal(alignment.at('Redis'), 0.1);
  assert.deepEqual(alignment.span('快'), { start: 0.6, end: 0.9 });
  assert.throws(() => alignedSegment('『Redis』，慢。', source, 1), /讲稿/);
  const invalid = structuredClone(source);
  invalid[0].sentence.words[1].endTime = 2;
  assert.throws(() => alignedSegment('『Redis』，快。', invalid, 1), /时间戳/);
  assert.throws(() =>
    alignedSegment('『』', [{ sentence: { words: [words[0]] } }], 1),
  );
});
void test('water cycle compiles a genuinely separate topic with a closed directed path', () => {
  let start = 0;
  const timings: SegmentTiming[] = waterCycleSegments.map((segment) => {
    const duration = Array.from(spokenText(segment.text)).length * 0.1 + 0.2;
    const alignment = alignedSegment(
      segment.text,
      metadata(segment.text),
      duration,
    );
    const timing = { start, duration, at: alignment.at };
    start += duration + 0.15;
    return timing;
  });
  const lesson = parseLesson(compileWaterCycle(timings, start));
  assert.equal(lesson.id, 'water-cycle');
  assert.equal(lesson.narration.length, 6);
  assert.equal(
    lesson.events.filter((event) => event.type === 'board.write').length,
    8,
  );
  assert.ok(!JSON.stringify(lesson).includes('binary-search'));
  assert.ok(!('array' in lesson));
  const event = lesson.events.find(
    (event) =>
      event.type === 'visual' &&
      event.action === 'activate' &&
      event.payload &&
      typeof event.payload === 'object' &&
      'id' in event.payload &&
      event.payload.id === 'evaporation',
  )!;
  assert.equal(event.at, timings[1].start + timings[1].at('变成水蒸气'));
  assert.throws(() => compileWaterCycle([], start));
});
void test('published example contains matching new narration, audio and captions, not legacy voice', () => {
  const lesson = parseLesson(
    JSON.parse(
      readFileSync(
        new URL('../public/lessons/water-cycle.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  assert.deepEqual(
    lesson.narration.map((cue) => cue.text),
    waterCycleSegments.map((segment) => segment.text),
  );
  assert.equal(lesson.audio, '/audio/water-cycle-zh.mp3');
  assert.equal(lesson.captions, '/lessons/water-cycle-zh.vtt');
  const captions = readFileSync(
    new URL('../public/lessons/water-cycle-zh.vtt', import.meta.url),
    'utf8',
  );
  waterCycleSegments.forEach((segment) =>
    assert.ok(captions.includes(segment.text)),
  );
  assert.ok(
    readFileSync(new URL('../public/audio/water-cycle-zh.mp3', import.meta.url))
      .length > 100000,
  );
});
void test('new example generation requires an explicit billable flag and works without credentials in preflight', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--conditions=learn-anything-source',
      '--experimental-strip-types',
      'scripts/generate-water-cycle.ts',
    ],
    {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      env: { PATH: process.env.PATH, NODE_ENV: 'test' },
    },
  );
  assert.match(output, /仅预检/);
  assert.match(output, /水循环/);
});
