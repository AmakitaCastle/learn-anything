import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  parseLesson,
  type LessonSpec,
} from '../packages/lesson-schema/index.ts';
import {
  classroomAt,
  createVisualRegistry,
  prepareLesson,
  registerGrammar,
} from '../packages/lesson-player/runtime.ts';
import { binarySearchLesson } from '../examples/binary-search/lesson.ts';
const legacy = JSON.parse(
  readFileSync(
    new URL('../public/lessons/binary-search-doubao.json', import.meta.url),
    'utf8',
  ),
);
const custom = registerGrammar({
  id: 'counter',
  parseConfig: () => null,
  parseEvent: (action: string, input: unknown) => {
    if (action !== 'add' || typeof input !== 'number')
      throw new Error('invalid');
    return input;
  },
  initial: () => ({ value: 0 }),
  reduce: (state: { value: number }, event: { payload: number }) => ({
    value: state.value + event.payload,
  }),
  Renderer: () => null,
});
const registry = createVisualRegistry([custom]);
const fixture: LessonSpec = {
  schemaVersion: '0.1.0',
  id: 'independent-topic',
  title: 'A different topic',
  eyebrow: 'Runtime fixture',
  duration: 10,
  audio: '/audio/fixture.mp3',
  chapters: [
    { id: 'start', label: 'Start', at: 0 },
    { id: 'end', label: 'End', at: 8 },
  ],
  narration: [{ at: 0, text: 'An independent script.' }],
  presentation: {
    titleAt: 0,
    metaAt: 0,
    diagramTitleAt: 0,
    notesTitleAt: 0,
    ruleAt: 0,
    diagramTitle: 'Counter',
    notesTitle: 'Notes',
  },
  visuals: [{ id: 'count', grammar: 'counter', config: null }],
  events: [
    {
      at: 1,
      type: 'board.write',
      item: {
        id: 'formula',
        text: 'x = 1',
        tone: 'plain',
        kind: 'formula',
        underline: true,
      },
    },
    { at: 2, type: 'visual', visualId: 'count', action: 'add', payload: 3 },
    {
      at: 3,
      type: 'board.mark',
      mark: {
        id: 'arrow',
        kind: 'arrow',
        region: 'notes',
        points: [
          { x: 10, y: 10 },
          { x: 80, y: 80 },
        ],
      },
    },
    {
      at: 5,
      type: 'board.write',
      item: { id: 'formula', text: 'x = 2', tone: 'accent' },
    },
    { at: 6, type: 'board.remove', id: 'arrow' },
    { at: 8, type: 'chapter', chapterId: 'end' },
  ],
};
void test('new topic and custom grammar work without modifying the player', () => {
  const prepared = prepareLesson(fixture, registry);
  const frame = classroomAt(prepared, 4);
  assert.deepEqual(frame.visuals[0].state, { value: 3 });
  assert.equal(frame.board[0].kind, 'formula');
  assert.equal(frame.marks.length, 1);
  assert.equal(classroomAt(prepared, 7).board[0].text, 'x = 2');
  assert.equal(classroomAt(prepared, 7).marks.length, 0);
  assert.equal(classroomAt(prepared, 10).chapterId, 'end');
});
void test('arbitrary seeks, repeated frames and caller mutations cannot contaminate replay', () => {
  const prepared = prepareLesson(fixture, registry),
    original = structuredClone(fixture);
  for (const time of [0, 2, 4, 10, 4, 0, 10]) {
    const expected = classroomAt(prepared, time),
      actual = classroomAt(prepared, time);
    assert.deepEqual(actual, expected);
    actual.board.push({ id: 'fake', text: 'Fake', at: 0, tone: 'plain' });
    assert.notDeepEqual(classroomAt(prepared, time).board, actual.board);
  }
  assert.deepEqual(fixture, original);
  assert.equal(classroomAt(prepared, -10).time, 0);
  assert.equal(classroomAt(prepared, 20).time, 10);
  assert.throws(() => classroomAt(prepared, NaN));
});
void test('schema and registration fail closed for unsafe or invalid course data', () => {
  for (const change of [
    { schemaVersion: '9.0' },
    { audio: 'javascript:alert(1)' },
    { audio: '/../private.mp3' },
    { title: '<script>run()</script>' },
    { duration: Infinity },
    { visuals: [{ id: 'x', grammar: 'unknown', config: {} }] },
    { events: [{ at: 20, type: 'chapter', chapterId: 'start' }] },
    {
      events: [
        {
          at: 1,
          type: 'visual',
          visualId: 'count',
          action: 'execute-js',
          payload: 'run()',
        },
      ],
    },
    { events: [{ at: 1, type: 'run-script', code: 'run()' }] },
  ])
    assert.throws(() => prepareLesson({ ...fixture, ...change }, registry));
  assert.throws(() => createVisualRegistry([custom, custom]));
  assert.equal(parseLesson(fixture).schemaVersion, '0.1.0');
});
void test('legacy adapter preserves all real cue and board boundaries without leaking array protocol', () => {
  const adapted = binarySearchLesson(legacy);
  assert.equal(adapted.duration, legacy.duration);
  assert.equal(adapted.audio, legacy.audio);
  assert.deepEqual(adapted.narration, legacy.narration);
  assert.deepEqual(adapted.chapters, legacy.chapters);
  assert.equal(adapted.events.length, legacy.events.length);
  adapted.events.forEach((event, index) =>
    assert.equal(event.at, legacy.events[index].at),
  );
  assert.ok(!('array' in adapted));
  assert.ok(adapted.events.every((event) => !event.type.startsWith('array.')));
  assert.equal(
    adapted.events.filter((event) => event.type === 'board.write').length,
    12,
  );
  parseLesson(adapted);
});
void test('a history-dependent mutating plugin is rejected before playback', () => {
  const invalid = registerGrammar({
    id: 'counter',
    parseConfig: () => null,
    parseEvent: () => 1,
    initial: () => ({ value: 0 }),
    reduce: (state: { value: number }) => {
      state.value++;
      return state;
    },
    Renderer: () => null,
  });
  assert.throws(
    () => prepareLesson(fixture, createVisualRegistry([invalid])),
    TypeError,
  );
});
