import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseLessonDraft,
  compileLessonDraft,
  compileAlignedLessonDraft,
  createDoubaoSpeechProvider,
  type LessonDraft,
  type AlignedDraftSegment,
  type LessonAudioProcessor,
} from '@learn-anything/content-generator';
import {
  phraseRange,
  spokenText,
  validateBuiltinVisuals,
} from '@learn-anything/lesson-schema';
import { alignedSegment } from '../packages/content-generator/tts/segment-alignment.ts';
import { waterCycleDraft } from '@learn-anything/content-generator/examples/water-cycle';

const temperature = JSON.parse(
  await readFile(
    new URL(
      '../packages/content-generator/examples/temperature.draft.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
// Deliberately nonuniform word times, unlike guessed character-count timing.
function measured(draft: LessonDraft): AlignedDraftSegment[] {
  return draft.segments.map((segment) => {
    let cursor = 0.31;
    const words = Array.from(spokenText(segment.text), (word, index) => {
      const startTime = cursor;
      cursor += index % 2 ? 0.17 : 0.041;
      return {
        word,
        startTime,
        endTime: cursor,
        confidence: index === 0 ? 0.4 : 0.99,
      };
    });
    return {
      id: segment.id,
      text: segment.text,
      duration: cursor + 0.47,
      metadata: [{ sentence: { words } }],
    };
  });
}
const fakeAudio = (segments: AlignedDraftSegment[]): LessonAudioProcessor => {
  let index = 0;
  return {
    async decodeMp3() {
      return Buffer.alloc(Math.round(segments[index++].duration * 24000) * 2);
    },
    async encodeMp3(pcm) {
      return {
        audio: Buffer.from('joined-mp3-fixture'),
        duration: pcm.length / 48000,
      };
    },
  };
};

void test('one uniform JSON format compiles water flow and a different temperature plot without topic callbacks', () => {
  for (const draft of [waterCycleDraft, parseLessonDraft(temperature)]) {
    const segments = measured(draft);
    const result = compileAlignedLessonDraft(draft, segments);
    assert.equal(result.lesson.id, draft.id);
    assert.equal(result.lesson.narration.length, draft.segments.length);
    assert.equal(
      result.lesson.events.length,
      draft.events.length + draft.segments.length,
    );
    const index = draft.events.findIndex((event) => event.when.phrase);
    const authored = draft.events[index];
    const segmentIndex = draft.segments.findIndex(
      (segment) => segment.id === authored.when.segment,
    );
    const alignment = alignedSegment(
      segments[segmentIndex].text,
      segments[segmentIndex].metadata,
      segments[segmentIndex].duration,
    );
    const expected =
      result.report.segments[segmentIndex].start +
      alignment.at(authored.when.phrase!);
    assert.equal(
      result.report.anchors.find(
        (anchor) => anchor.target === `events.${index}`,
      )!.at,
      expected,
    );
    assert.ok(result.captionsVtt.startsWith('WEBVTT'));
    assert.ok(
      !result.lessonJson.includes('$time') &&
        !result.lessonJson.includes('"when"'),
    );
    validateBuiltinVisuals(result.lesson);
    assert.deepEqual(compileAlignedLessonDraft(draft, segments), result);
  }
});

void test('multi-diagram process example preserves intermediate steps and cleans up only after use', async () => {
  const draft = parseLessonDraft(
    JSON.parse(
      await readFile(
        new URL('../examples/heating-rate/process.draft.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const { lesson } = compileAlignedLessonDraft(draft, measured(draft));
  assert.deepEqual(
    lesson.visuals.map((visual) => visual.grammar),
    ['plot', 'flow'],
  );
  const writes = lesson.events.filter((event) => event.type === 'board.write');
  const at = (id: string) => writes.find((event) => event.item.id === id)!.at;
  assert.ok(at('data1') < at('delta1'));
  assert.ok(at('delta1') < at('rate1'));
  assert.ok(at('delta2') < at('rate2'));
  assert.ok(at('rate1') < at('compare') && at('rate2') < at('compare'));
  assert.ok(at('compare') < at('boundary'));
  assert.ok(at('boundary') < at('conclusion'));
  const removeFirstDelta = lesson.events.find(
    (event) => event.type === 'board.remove' && event.id === 'delta1',
  )!;
  assert.ok(removeFirstDelta.at > at('rate1'));
  let visible = 0;
  let maxVisible = 0;
  for (const event of lesson.events) {
    if (event.type === 'board.write') visible++;
    if (event.type === 'board.remove') visible--;
    maxVisible = Math.max(maxVisible, visible);
  }
  assert.ok(writes.length > 6 && maxVisible <= 6);
  validateBuiltinVisuals(lesson);
});

void test('axis configuration survives generic Draft to LessonSpec compilation', () => {
  const input = structuredClone(temperature);
  const config = input.visuals[0].config;
  config.points = [
    { x: -1, y: -200 },
    { x: 0, y: 0 },
    { x: 1, y: 200 },
  ];
  config.xAxis = { min: -1, max: 1, ticks: [-1, 0, 1] };
  config.yAxis = { min: -200, max: 200, ticks: [-200, 0, 200] };
  config.grid = true;
  const draft = parseLessonDraft(input);
  const compiled = compileAlignedLessonDraft(draft, measured(draft));
  assert.deepEqual(compiled.lesson.visuals[0].config, config);
  assert.deepEqual(JSON.parse(compiled.lessonJson).visuals[0].config, config);
  validateBuiltinVisuals(compiled.lesson);
});

void test('anchors support exact phrase start/end, Unicode, repeated phrases and explicit editorial offsets', () => {
  const draft = parseLessonDraft({
    ...temperature,
    segments: [{ id: 'start', label: '重复词', text: '水😀水。' }],
    visuals: [],
    events: [
      {
        type: 'board.write',
        when: {
          segment: 'start',
          phrase: '水',
          occurrence: 2,
          edge: 'end',
          offset: 0.2,
        },
        item: { id: 'water', text: '水' },
      },
    ],
  });
  const segments = measured(draft);
  const alignment = alignedSegment(
    segments[0].text,
    segments[0].metadata,
    segments[0].duration,
  );
  assert.equal(alignment.at('😀'), 0.351);
  assert.equal(alignment.span('水', 2).end, 0.562);
  assert.equal(
    compileAlignedLessonDraft(draft, segments).lesson.events.at(-1)!.at,
    0.762,
  );
  assert.throws(() => phraseRange('水水', '水'), /不唯一/);
  assert.throws(() => phraseRange('水水', '水', 3), /超出范围/);
});

void test('full compiler calls the actual speech adapter, caches results and compiles their returned timing metadata', async () => {
  const cacheRoot = await mkdtemp(
    join(tmpdir(), 'learn-anything-compiler-cache-'),
  );
  try {
    const draft = parseLessonDraft(temperature),
      segments = measured(draft);
    let calls = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      assert.equal(typeof init!.body, 'string');
      const body = JSON.parse(init!.body as string);
      const index = draft.segments.findIndex(
        (segment) => segment.text === body.req_params.text,
      );
      assert.ok(index >= 0);
      assert.equal(body.req_params.audio_params.enable_subtitle, true);
      calls++;
      const packet = {
        code: 0,
        data: Buffer.from(`mp3-${index}`).toString('base64'),
        ...segments[index].metadata[0],
      };
      return new Response(
        `data: ${JSON.stringify(packet)}\n\ndata: {"code":20000000,"data":null}\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      );
    };
    const config = {
      apiKey: 'fixture-secret-not-in-artifacts',
      resourceId: 'fixture-resource',
      speaker: 'fixture-speaker',
      speechRate: 0,
    };
    const result = await compileLessonDraft(draft, {
      audio: fakeAudio(segments),
      speech: createDoubaoSpeechProvider({
        config,
        cacheRoot,
        fetcher,
        allowSynthesis: true,
      }),
    });
    assert.equal(calls, 2);
    assert.equal(result.audio.toString(), 'joined-mp3-fixture');
    assert.equal(
      result.report.segments[1].start,
      result.report.segments[0].duration + 0.15,
    );
    assert.equal(result.report.segments[0].lowConfidenceWords.length, 1);
    assert.ok(!JSON.stringify(result).includes(config.apiKey));
    const cached = await compileLessonDraft(draft, {
      audio: fakeAudio(segments),
      speech: createDoubaoSpeechProvider({
        config: { ...config, apiKey: 'changed-key' },
        cacheRoot,
        fetcher,
      }),
    });
    assert.deepEqual(cached, result);
    assert.equal(calls, 2);
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
});

void test('invalid materials, unsupported actions, unsafe data, references and resources fail before any speech request', async () => {
  let calls = 0;
  const speech = {
    async synthesize() {
      calls++;
      throw new Error('must not request speech');
    },
  };
  const invalid = [
    { ...temperature, draftVersion: 'wrong' },
    { ...temperature, seconds: 10 },
    { ...temperature, segments: [] },
    {
      ...temperature,
      segments: [temperature.segments[0], temperature.segments[0]],
    },
    { ...temperature, events: [{ ...temperature.events[0], at: 4 }] },
    {
      ...temperature,
      events: [{ ...temperature.events[0], when: { segment: 'unknown' } }],
    },
    {
      ...temperature,
      events: [
        {
          ...temperature.events[0],
          when: { segment: 'start', phrase: '不存在' },
        },
      ],
    },
    {
      ...temperature,
      events: [
        {
          ...temperature.events[0],
          item: { id: 'bad', text: '<script>alert(1)</script>' },
        },
      ],
    },
    {
      ...temperature,
      visuals: [{ ...temperature.visuals[0], grammar: 'unregistered' }],
    },
    {
      ...temperature,
      events: [
        {
          type: 'visual',
          when: { segment: 'start' },
          visualId: 'temperature',
          action: 'explode',
          payload: {},
        },
      ],
    },
    {
      ...temperature,
      events: [
        {
          type: 'visual',
          when: { segment: 'start' },
          visualId: 'temperature',
          action: 'reveal',
          payload: { index: 900 },
        },
      ],
    },
    {
      ...waterCycleDraft,
      visuals: [
        {
          ...waterCycleDraft.visuals[0],
          config: { nodes: [{ id: 'n', label: 'node', at: 3 }], edges: [] },
        },
      ],
    },
    {
      ...temperature,
      visuals: [
        {
          ...temperature.visuals[0],
          config: JSON.parse('{"constructor":{},"points":[]}'),
        },
      ],
    },
    {
      ...temperature,
      events: [
        { type: 'board.remove', when: { segment: 'start' }, id: 'missing' },
      ],
    },
  ];
  for (const value of invalid)
    await assert.rejects(() => compileLessonDraft(value, { speech }));
  await assert.rejects(() =>
    compileLessonDraft(temperature, {
      speech,
      resources: { audio: 'javascript:alert(1)' },
    }),
  );
  await assert.rejects(() =>
    compileLessonDraft(temperature, { speech, pauseBetweenSegments: -1 }),
  );
  assert.equal(calls, 0);
});

void test('missing/mismatched real timestamps, reorder, corrupt PCM and final duration mismatch never produce artifacts', async () => {
  const draft = parseLessonDraft(temperature),
    segments = measured(draft);
  assert.throws(() => compileAlignedLessonDraft(draft, []));
  assert.throws(
    () => compileAlignedLessonDraft(draft, [...segments].reverse()),
    /顺序/,
  );
  assert.throws(() =>
    compileAlignedLessonDraft(draft, [
      { ...segments[0], metadata: [] },
      segments[1],
    ]),
  );
  assert.throws(
    () => compileAlignedLessonDraft(draft, segments, { duration: 100 }),
    /时长/,
  );
  const negative = {
    ...draft,
    events: [{ ...draft.events[0], when: { segment: 'start', offset: -1 } }],
  };
  assert.throws(() => compileAlignedLessonDraft(negative, segments), /偏移/);
  let calls = 0;
  const speech = {
    async synthesize() {
      calls++;
      return { audio: Buffer.from('mp3'), metadata: [], logId: null };
    },
  };
  await assert.rejects(() =>
    compileLessonDraft(draft, { speech, audio: fakeAudio(segments) }),
  );
  assert.equal(calls, 1); // Do not bill subsequent segments after a bad first response.
  await assert.rejects(() =>
    compileLessonDraft(draft, {
      speech,
      audio: {
        ...fakeAudio(segments),
        async decodeMp3() {
          return Buffer.alloc(3);
        },
      },
    }),
  );
});

void test('state transitions and array events use shared contracts in the same compiler, without renderer dependencies', () => {
  const base = {
    ...temperature,
    segments: [temperature.segments[0]],
    events: [],
  };
  const state = parseLessonDraft({
    ...base,
    visuals: [
      {
        id: 's',
        grammar: 'state-transition',
        config: {
          nodes: [
            { id: 'cold', label: '冷' },
            { id: 'warm', label: '热' },
          ],
          edges: [{ id: 'heat', from: 'cold', to: 'warm' }],
        },
      },
    ],
    events: [
      {
        type: 'visual',
        when: { segment: 'start' },
        visualId: 's',
        action: 'enter',
        payload: { id: 'cold' },
      },
      {
        type: 'visual',
        when: { segment: 'start', phrase: '四十度' },
        visualId: 's',
        action: 'transition',
        payload: { id: 'heat' },
      },
    ],
  });
  assert.equal(
    compileAlignedLessonDraft(state, measured(state)).lesson.visuals[0].grammar,
    'state-transition',
  );
  const invalid = structuredClone(state);
  invalid.events.shift();
  assert.throws(() => parseLessonDraft(invalid), /起点/);
  const array = parseLessonDraft({
    ...base,
    visuals: [
      {
        id: 'a',
        grammar: 'array-search',
        config: {
          values: [20, 40, 60],
          valuesAt: { $time: { segment: 'start' } },
          stagger: 0.2,
          scanStart: { $time: { segment: 'start' } },
          scanEnd: { $time: { segment: 'start', edge: 'end' } },
          trail: [],
          trailAt: { $time: { segment: 'start' } },
          trailStep: 0.4,
        },
      },
    ],
    events: [
      {
        type: 'visual',
        when: { segment: 'start', phrase: '四十度' },
        visualId: 'a',
        action: 'window',
        payload: { low: 0, mid: 1, high: 2 },
      },
      {
        type: 'visual',
        when: { segment: 'start', edge: 'end' },
        visualId: 'a',
        action: 'found',
        payload: { index: 1 },
      },
    ],
  });
  const result = compileAlignedLessonDraft(array, measured(array));
  assert.equal(result.lesson.visuals[0].grammar, 'array-search');
  assert.ok(!result.lessonJson.includes('$time'));
});

void test('generic CLI preflights different JSON topics with no credentials, network calls or audio tool requirement', () => {
  for (const topic of ['water-cycle', 'temperature']) {
    const output = execFileSync(
      process.execPath,
      [
        '--conditions=learn-anything-source',
        '--experimental-strip-types',
        'scripts/compile-lesson.ts',
        '--draft',
        `packages/content-generator/examples/${topic}.draft.json`,
      ],
      {
        cwd: new URL('../', import.meta.url),
        encoding: 'utf8',
        env: { PATH: process.env.PATH, NODE_ENV: 'test' },
      },
    );
    assert.match(output, /材料有效/);
    assert.match(output, /仅预检/);
  }
});

void test('same returned word boundary keeps author order, not guessed character chronology', () => {
  const draft = parseLessonDraft({
    ...temperature,
    segments: [{ id: 'start', label: '同一个词', text: '先后' }],
    visuals: [
      {
        id: 's',
        grammar: 'state-transition',
        config: {
          nodes: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          edges: [{ id: 'next', from: 'a', to: 'b' }],
        },
      },
    ],
    events: [
      {
        type: 'visual',
        when: { segment: 'start', phrase: '后' },
        visualId: 's',
        action: 'enter',
        payload: { id: 'a' },
      },
      {
        type: 'visual',
        when: { segment: 'start', phrase: '先' },
        visualId: 's',
        action: 'transition',
        payload: { id: 'next' },
      },
    ],
  });
  const result = compileAlignedLessonDraft(draft, [
    {
      id: 'start',
      text: '先后',
      duration: 1,
      metadata: [
        {
          sentence: { words: [{ word: '先后', startTime: 0.2, endTime: 0.5 }] },
        },
      ],
    },
  ]);
  assert.deepEqual(
    result.lesson.events
      .filter((event) => event.type === 'visual')
      .map((event) => event.at),
    [0.2, 0.2],
  );
  const reversed = { ...draft, events: [...draft.events].reverse() };
  assert.throws(
    () =>
      compileAlignedLessonDraft(reversed, [
        {
          id: 'start',
          text: '先后',
          duration: 1,
          metadata: [
            {
              sentence: {
                words: [{ word: '先后', startTime: 0.2, endTime: 0.5 }],
              },
            },
          ],
        },
      ]),
    /起点/,
  );
});

void test('missing audio tools fail before speech synthesis and duplicate board removal is rejected', async () => {
  let calls = 0;
  const draft = parseLessonDraft(temperature),
    segments = measured(draft);
  await assert.rejects(
    () =>
      compileLessonDraft(draft, {
        speech: {
          async synthesize() {
            calls++;
            throw new Error('unexpected');
          },
        },
        audio: {
          ...fakeAudio(segments),
          async prepare() {
            throw new Error('missing tools');
          },
        },
      }),
    /missing tools/,
  );
  assert.equal(calls, 0);
  const duplicate = structuredClone(draft);
  duplicate.events.push({
    type: 'board.remove',
    when: { segment: 'rise', edge: 'end' },
    id: 'initial',
  });
  assert.throws(
    () => compileAlignedLessonDraft(duplicate, segments),
    /重复删除/,
  );
});

void test('cache-only provider never spends on a cache miss and alignment reports keep only known word fields', async () => {
  const cacheRoot = await mkdtemp(join(tmpdir(), 'learn-anything-cache-only-'));
  try {
    let calls = 0;
    const speech = createDoubaoSpeechProvider({
      config: {
        apiKey: 'fixture-key',
        resourceId: 'fixture-resource',
        speaker: 'fixture-speaker',
        speechRate: 0,
      },
      cacheRoot,
      fetcher: async () => {
        calls++;
        throw new Error('not expected');
      },
    });
    await assert.rejects(
      () => speech.synthesize(parseLessonDraft(temperature).segments[0]),
      /缺少语音缓存/,
    );
    assert.equal(calls, 0);
    const draft = parseLessonDraft(temperature),
      segments = measured(draft);
    const word = (
      segments[0].metadata[0].sentence as { words: Record<string, unknown>[] }
    ).words[0];
    word.secret = 'not-for-report';
    const report = compileAlignedLessonDraft(draft, segments).report;
    assert.ok(!JSON.stringify(report).includes('not-for-report'));
    assert.deepEqual(Object.keys(report.segments[0].lowConfidenceWords[0]), [
      'word',
      'startTime',
      'endTime',
      'confidence',
    ]);
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
});
