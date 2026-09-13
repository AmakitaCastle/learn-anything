import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  parseLesson,
  parseLessonDraft,
  spokenText,
  teachingLines,
} from '@learn-anything/lesson-schema';
import { compileAlignedLessonDraft } from '@learn-anything/content-generator';
import { lessonHandwritingCharacters } from '../packages/content-generator/handwriting.ts';

const raw = JSON.parse(
  readFileSync(
    new URL('../examples/heating-rate/full-board.draft.json', import.meta.url),
    'utf8',
  ),
);
function compile() {
  const draft = parseLessonDraft(raw);
  const measured = draft.segments.map((segment) => {
    let cursor = 0.2;
    const words = Array.from(spokenText(segment.text), (word, index) => {
      const startTime = cursor;
      cursor += index % 2 ? 0.09 : 0.17;
      return { word, startTime, endTime: cursor };
    });
    return {
      id: segment.id,
      text: segment.text,
      metadata: [{ sentence: { words } }],
      duration: cursor + 0.2,
    };
  });
  return { draft, measured, ...compileAlignedLessonDraft(draft, measured) };
}
void test('every narration character is retained, speech boundaries are preserved, and each diagram has text', () => {
  const { draft, measured, lesson } = compile();
  assert.deepEqual(
    lesson.teaching!.map((segment) => segment.text),
    draft.segments.map((segment) => segment.text),
  );
  lesson.teaching!.forEach((segment, index) => {
    const lines = teachingLines(segment);
    assert.equal(lines.map((line) => line.text).join(''), segment.text);
    assert.equal(
      segment.words[0].at,
      segment.at + measured[index].metadata[0].sentence.words[0].startTime,
    );
    assert.ok(lines.length > 1);
    assert.ok(lines[1].at > lines[0].at);
    assert.equal(
      lines.flatMap((line) => line.emphasis).length,
      segment.emphasis.length,
    );
  });
  for (const visual of lesson.visuals)
    assert.ok(
      lesson.teaching!.some((segment) => segment.visualId === visual.id),
    );
  assert.deepEqual(parseLesson(JSON.parse(JSON.stringify(lesson))), lesson);
  assert.ok(lessonHandwritingCharacters(draft).includes('每'));
});

void test('unpaired diagrams, unknown references, whole sentences, overlapping and cross-sentence emphasis fail before compilation', () => {
  const unpaired = structuredClone(raw);
  unpaired.segments[2].visualId = 'temperature';
  assert.throws(() => parseLessonDraft(unpaired), /每张图示/);
  const unknown = structuredClone(raw);
  unknown.segments[0].visualId = 'missing';
  assert.throws(() => parseLessonDraft(unknown), /未知图示/);
  const { lesson } = compile();
  const badWords = structuredClone(lesson);
  badWords.teaching![0].words[0].text = '错';
  assert.throws(() => parseLesson(badWords), /时间戳与文稿/);
  for (const emphasis of [
    [{ phrase: '温度一直升高，就说明升得越来越快吗' }],
    [{ phrase: '温度有多高，和温度升得多快' }, { phrase: '温度有多高' }],
    [{ phrase: '不一定。温度有多高' }],
  ]) {
    const invalid = structuredClone(raw);
    invalid.segments[0].emphasis = emphasis;
    assert.throws(() => parseLessonDraft(invalid), /重点/);
  }
});

void test('sentence splitting preserves decimals, quotes, whitespace and all original characters', () => {
  const source = '值是 1.5。 “为什么？” Yes. Next!';
  const words = Array.from(spokenText(source), (text, index) => ({
    text,
    at: index,
    endAt: index + 0.5,
  }));
  const lines = teachingLines({
    id: 'mixed',
    label: 'mixed',
    text: source,
    at: 0,
    endAt: words.length,
    words,
    emphasis: [],
    boardIds: [],
    markIds: [],
  });
  assert.equal(lines.map((line) => line.text).join(''), source);
  assert.equal(lines.length, 4);
  assert.ok(lines[0].text.includes('1.5'));
});
