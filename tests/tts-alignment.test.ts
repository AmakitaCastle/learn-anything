import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  frameAt,
  handwritingAt,
  presentationAt,
  type LessonSpec,
} from '../lib/lesson.ts';
import { alignBinarySearch } from '../lib/tts/alignment.ts';

const source = JSON.parse(
  readFileSync(
    new URL('../public/lessons/binary-search.json', import.meta.url),
    'utf8',
  ),
) as LessonSpec;
const active = JSON.parse(
  readFileSync(
    new URL('../public/lessons/binary-search-doubao.json', import.meta.url),
    'utf8',
  ),
) as LessonSpec;
const normalize = (text: string) => text.replace(/[\p{P}\p{Z}\s]/gu, '');
const text = normalize(source.narration.map((cue) => cue.text).join(''));
function fixture() {
  return [
    {
      sentence: {
        words: Array.from(text, (word, index) => ({
          word,
          startTime: 0.1 + index * 0.2,
          endTime: 0.29 + index * 0.2,
          confidence: index === 0 ? 0.2 : 0.9,
        })),
      },
    },
  ];
}

void test('semantic anchors match actual word starts, not global duration scaling', () => {
  const original = structuredClone(source);
  const { lesson, vtt, lowConfidenceWords } = alignBinarySearch(
    source,
    fixture(),
    100,
  );
  const expected =
    0.1 + Array.from(text.slice(0, text.indexOf('正好是二十三'))).length * 0.2;
  assert.equal(
    lesson.events.find((event) => event.type === 'array.found')?.at,
    expected,
  );
  assert.notEqual(expected, (53.2 / source.duration) * 100);
  assert.equal(presentationAt(lesson, source.duration), 100);
  assert.equal(lesson.captions, '/lessons/binary-search-doubao-zh.vtt');
  assert.equal(vtt.split(' --> ').length - 1, source.narration.length);
  assert.match(vtt, /00:01:40.000/);
  assert.equal(lowConfidenceWords.length, 1);
  assert.deepEqual(source, original);
  assert.deepEqual(alignBinarySearch(source, fixture(), 100).lesson, lesson);
});

void test('missing, corrupt, duplicate, overlapping and mismatched alignments fail closed', () => {
  assert.throws(() => alignBinarySearch(source, [], 100), /没有返回/);
  assert.throws(() => alignBinarySearch(source, fixture(), NaN), /时长/);
  for (const mutate of [
    (words: ReturnType<typeof fixture>[0]['sentence']['words']) => words.pop(),
    (words: ReturnType<typeof fixture>[0]['sentence']['words']) => {
      words[0].startTime = -1;
    },
    (words: ReturnType<typeof fixture>[0]['sentence']['words']) => {
      words[0].endTime = 101;
    },
    (words: ReturnType<typeof fixture>[0]['sentence']['words']) => {
      words[0].endTime = words[0].startTime;
    },
    (words: ReturnType<typeof fixture>[0]['sentence']['words']) => {
      words[0].word = '错';
    },
    (words: ReturnType<typeof fixture>[0]['sentence']['words']) => {
      words[1].startTime = words[0].startTime;
    },
    (words: ReturnType<typeof fixture>[0]['sentence']['words']) => {
      words.push(words[0]);
    },
  ]) {
    const metadata = fixture();
    mutate(metadata[0].sentence.words);
    assert.throws(() => alignBinarySearch(source, metadata, 100));
  }
  const invalidSource = structuredClone(source);
  invalidSource.narration[3].at = 80;
  assert.throws(
    () => alignBinarySearch(invalidSource, fixture(), 100),
    /顺序冲突/,
  );
  assert.throws(() => alignBinarySearch(active, fixture(), 100), /原始课程/);
});

void test('active lesson keeps the original choreography but uses bounded new audio timings', () => {
  assert.equal(active.duration, 77.016);
  assert.equal(active.audio, '/audio/binary-search-doubao-zh.mp3');
  assert.equal(active.events.length, source.events.length);
  assert.ok(active.timingMap && active.timingMap.length === 24);
  let previous = -1;
  active.events.forEach((event, index) => {
    assert.deepEqual(
      { ...event, at: source.events[index].at },
      source.events[index],
    );
    assert.equal(event.at, presentationAt(active, source.events[index].at));
    assert.ok(event.at >= previous && event.at <= active.duration);
    previous = event.at;
  });
  for (const cue of active.narration)
    assert.ok(cue.at >= 0 && cue.at < active.duration);
  for (const item of frameAt(active, active.duration).board) {
    const ink = handwritingAt(item, active.duration);
    assert.equal(
      ink.writingProgress,
      1,
      `${item.id} must finish before audio ends`,
    );
    assert.equal(ink.underlineProgress, 1, `${item.id} underline must finish`);
  }
  assert.equal(
    presentationAt(source, 12),
    12,
    'legacy course remains supported',
  );
});
