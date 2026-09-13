import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  createServer,
  defaultClientConditions,
  defaultServerConditions,
} from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  defineCapability,
  createCapabilityRegistry,
  parseLessonDraft,
  spokenText,
  number,
  record,
  type LessonDraft,
  type LessonSpec,
} from '@learn-anything/lesson-schema';
import {
  buildLessonDraftPrompt,
  generateLessonDraft,
} from '@learn-anything/lesson-draft-generator';
import {
  compileAlignedLessonDraft,
  compileLessonDraft,
} from '@learn-anything/content-generator';
import {
  prepareLesson,
  classroomAt,
  createVisualRegistry,
  registerGrammar,
} from '@learn-anything/lesson-player/runtime';
import { lessonCapabilities } from '../capabilities/index.ts';
import {
  sceneModel,
  positionAt,
  scalarAt,
  type SceneState,
} from '../capabilities/scene/model.ts';

function measured(draft: LessonDraft) {
  return draft.segments.map((segment) => ({
    id: segment.id,
    text: segment.text,
    duration: Array.from(spokenText(segment.text)).length * 0.15 + 1,
    metadata: [
      {
        sentence: {
          words: Array.from(spokenText(segment.text), (word, i) => ({
            word,
            startTime: i * 0.15,
            endTime: (i + 1) * 0.15,
          })),
        },
      },
    ],
  }));
}
const rawScene = JSON.parse(
  await readFile(
    new URL('../examples/task-separation/lesson.draft.json', import.meta.url),
    'utf8',
  ),
);

void test('one injected capability supplies generation, config time fields, preflight, compilation and player state', async () => {
  const counter = defineCapability({
    id: 'counter-fixture',
    version: '1.0.0',
    draft: {
      instructions:
        'Counter fixture with an anchored deadline and a set action.',
      timeFields: [{ path: ['deadline'], preflight: 1 }],
    },
    parseConfig(input) {
      return { deadline: number(record(input).deadline, 0, 7200) };
    },
    parseEvent(action, input) {
      if (action !== 'set') throw new Error('Unknown counter action');
      return number(input, 0, 100);
    },
    initial: () => ({ value: 0 }),
    reduce: (_state, event) => ({ value: event.payload }),
  });
  const capabilities = createCapabilityRegistry([
    ...lessonCapabilities.values(),
    counter,
  ]);
  const raw = {
    draftVersion: '0.1.0',
    boardMode: 'full-narration',
    id: 'custom-counter',
    title: 'Custom',
    eyebrow: 'Fixture',
    segments: [
      {
        id: 'start',
        label: 'Start',
        text: '先看看，再设置数值。',
        visualId: 'count',
      },
    ],
    presentation: { diagramTitle: 'Count', notesTitle: 'Notes' },
    visuals: [
      {
        id: 'count',
        grammar: counter.id,
        config: {
          deadline: {
            $time: { segment: 'start', phrase: '设置数值', edge: 'end' },
          },
        },
      },
    ],
    events: [
      {
        type: 'visual',
        visualId: 'count',
        action: 'set',
        payload: 7,
        when: { segment: 'start', phrase: '设置数值' },
      },
    ],
  };
  const brief = {
    id: raw.id,
    topic: '计数',
    audience: '学生',
    segmentCount: 1,
    allowedGrammars: [counter.id],
  };
  const prompt = buildLessonDraftPrompt(brief, capabilities);
  assert.match(prompt.system, /Counter fixture/);
  assert.match(prompt.system, /deadline/);
  assert.ok(!prompt.system.includes('scene v1.0.0'));
  assert.equal(
    buildLessonDraftPrompt(
      { ...brief, allowedGrammars: undefined },
      capabilities,
    ).brief.allowedGrammars!.length,
    6,
  );
  const generated = await generateLessonDraft(brief, {
    capabilities,
    provider: {
      id: 'fixture',
      model: 'fixture',
      async generate(request) {
        assert.match(request.system, /Counter fixture/);
        return { text: JSON.stringify(raw) };
      },
    },
  });
  const compiled = compileAlignedLessonDraft(
    generated.draft,
    measured(generated.draft),
    { capabilities },
  );
  assert.ok(!compiled.lessonJson.includes('$time'));
  assert.ok(
    number(record(compiled.lesson.visuals[0].config).deadline, 0, 7200) >
      compiled.lesson.events[0].at,
  );
  const registry = createVisualRegistry([
    registerGrammar({
      ...counter,
      Renderer: ({ state }) =>
        createElement('p', null, String((state as { value: number }).value)),
    }),
  ]);
  const prepared = prepareLesson(compiled.lesson, registry);
  assert.deepEqual(classroomAt(prepared, 0).visuals[0].state, { value: 0 });
  assert.deepEqual(
    classroomAt(prepared, compiled.lesson.duration).visuals[0].state,
    { value: 7 },
  );
  const invalid = structuredClone(raw);
  invalid.visuals[0].config.deadline = 1 as never;
  assert.throws(() => parseLessonDraft(invalid, capabilities), /语义锚点/);
  assert.throws(() => createCapabilityRegistry([counter, counter]), /重复/);
  assert.throws(() => parseLessonDraft(raw), /已支持|未注册/);
});

void test('scene example preserves all narration, binds movements to spoken phrases, and fails before speech for invalid data', async () => {
  const draft = parseLessonDraft(rawScene, lessonCapabilities);
  assert.deepEqual(
    draft.segments.map((s) => s.text),
    rawScene.segments.map((s: { text: string }) => s.text),
  );
  const compiled = compileAlignedLessonDraft(draft, measured(draft), {
    capabilities: lessonCapabilities,
  });
  assert.equal(compiled.lesson.visuals.length, 4);
  assert.equal(compiled.lesson.teaching!.length, 6);
  assert.ok(
    compiled.lesson.events.some(
      (e) => e.type === 'visual' && e.action === 'group',
    ),
  );
  assert.ok(
    !compiled.lessonJson.includes('$time') &&
      !compiled.lessonJson.includes('"when"'),
  );
  for (const mutate of [
    (d: typeof rawScene) => {
      d.events[0].payload.id = 'missing';
    },
    (d: typeof rawScene) => {
      d.events[0].payload.duration = -1;
    },
    (d: typeof rawScene) => {
      d.events[0].payload.src = 'https://example.com/image.svg';
    },
    (d: typeof rawScene) => {
      d.events[0].action = 'execute';
    },
    (d: typeof rawScene) => {
      d.visuals[0].config.elements[0].kind = 'html';
    },
    (d: typeof rawScene) => {
      d.visuals[0].config.relations[0].to = 'missing';
    },
    (d: typeof rawScene) => {
      d.events.find(
        (e: { action: string }) => e.action === 'group',
      ).payload.regionId = 'choice';
    },
  ]) {
    const bad = structuredClone(rawScene);
    mutate(bad);
    let billed = false;
    await assert.rejects(
      compileLessonDraft(bad, {
        capabilities: lessonCapabilities,
        speech: {
          async synthesize() {
            billed = true;
            throw new Error('Unexpected speech');
          },
        },
        handwriting: false,
      }),
    );
    assert.equal(billed, false);
  }
});

void test('scene tracks interpolate from the current pose when movement, fading and emphasis overlap', () => {
  const config = sceneModel.parseConfig(
    {
      elements: [
        {
          id: 'actor',
          kind: 'person',
          label: 'Actor',
          position: { x: 0, y: 50 },
        },
      ],
    },
    10,
  );
  let state = sceneModel.initial(config) as SceneState;
  const act = (at: number, action: string, payload: unknown) => {
    state = sceneModel.reduce(
      state,
      {
        at,
        action,
        payload: sceneModel.parseEvent(action, payload as never, config),
      },
      config,
    ) as SceneState;
  };
  act(0, 'show', { id: 'actor', duration: 4 });
  act(0, 'move', { id: 'actor', position: { x: 100, y: 50 }, duration: 4 });
  act(2, 'move', { id: 'actor', position: { x: 0, y: 50 }, duration: 2 });
  act(2, 'hide', { id: 'actor', duration: 2 });
  act(2, 'emphasize', { id: 'actor', duration: 2 });
  assert.equal(positionAt(state.elements.actor.position, 2).x, 50);
  assert.equal(positionAt(state.elements.actor.position, 3).x, 25);
  assert.equal(positionAt(state.elements.actor.position, 4).x, 0);
  assert.equal(scalarAt(state.elements.actor.opacity, 2), 0.5);
  assert.equal(scalarAt(state.elements.actor.opacity, 3), 0.25);
  assert.equal(scalarAt(state.elements.actor.emphasis, 3), 0.5);
  act(4, 'show', { id: 'actor', duration: 0 });
  assert.equal(scalarAt(state.elements.actor.opacity, 4), 1);
});

void test('actual registered scene renderer reconstructs hidden, intermediate, grouped and final poses on reverse seek', async () => {
  const server = await createServer({
    configFile: false,
    resolve: {
      conditions: ['learn-anything-source', ...defaultClientConditions],
    },
    ssr: {
      resolve: {
        conditions: ['learn-anything-source', ...defaultServerConditions],
      },
    },
    server: { middlewareMode: true, hmr: false, ws: false },
    oxc: { jsx: { runtime: 'automatic' } },
  });
  try {
    const { loadLessonVisualRegistry } = await server.ssrLoadModule(
      '/capabilities/player.ts',
    );
    const registry = await loadLessonVisualRegistry();
    assert.deepEqual([...registry.keys()], [...lessonCapabilities.keys()]);
    const draft = parseLessonDraft(rawScene, lessonCapabilities);
    const { lesson } = compileAlignedLessonDraft(draft, measured(draft), {
      capabilities: lessonCapabilities,
    });
    const prepared = prepareLesson(lesson, registry);
    const htmlAt = (t: number) =>
      classroomAt(prepared, t)
        .visuals.map((v) =>
          renderToStaticMarkup(
            createElement(v.grammar.Renderer, {
              config: v.config,
              state: v.state,
              time: t,
            }),
          ),
        )
        .join('');
    const first = htmlAt(0);
    assert.match(first, /data-scene-opacity="0.000"/);
    const grouped = htmlAt(lesson.duration);
    assert.match(grouped, /data-scene-region="theirs"/);
    assert.match(grouped, /data-scene-relation="sent"/);
    const middle = htmlAt(lesson.duration / 2);
    assert.notEqual(middle, first);
    htmlAt(lesson.duration);
    assert.equal(htmlAt(lesson.duration / 2), middle);
    assert.equal(htmlAt(0), first);
    assert.equal(htmlAt(lesson.duration), grouped);
    // Another subject uses the very same pack and renderer.
    const other: LessonSpec = {
      ...lesson,
      id: 'literature-fixture',
      teaching: undefined,
      visuals: [
        {
          id: 'characters',
          grammar: 'scene',
          config: {
            elements: [
              {
                id: 'a',
                kind: 'person',
                label: 'Narrator',
                position: { x: 20, y: 50 },
              },
              {
                id: 'b',
                kind: 'person',
                label: 'Reader',
                position: { x: 80, y: 50 },
              },
            ],
            relations: [
              { id: 'conflict', from: 'a', to: 'b', kind: 'opposition' },
            ],
          },
        },
      ],
      events: [
        {
          at: 1,
          type: 'visual',
          visualId: 'characters',
          action: 'show',
          payload: { id: 'a' },
        },
        {
          at: 1,
          type: 'visual',
          visualId: 'characters',
          action: 'show',
          payload: { id: 'b' },
        },
        {
          at: 2,
          type: 'visual',
          visualId: 'characters',
          action: 'connect',
          payload: { id: 'conflict' },
        },
        {
          at: 3,
          type: 'visual',
          visualId: 'characters',
          action: 'camera',
          payload: { position: { x: 50, y: 50 }, scale: 1.2 },
        },
      ],
    };
    const pose = classroomAt(prepareLesson(other, registry), 4).visuals[0];
    assert.match(
      renderToStaticMarkup(
        createElement(pose.grammar.Renderer, {
          config: pose.config,
          state: pose.state,
          time: 4,
        }),
      ),
      /Narrator|Narr/,
    );
  } finally {
    await server.close();
  }
});
