import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createServer,
  defaultClientConditions,
  defaultServerConditions,
} from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LessonSpec } from '../packages/lesson-schema/index.ts';
import {
  classroomAt,
  prepareLesson,
  type VisualRegistry,
} from '../packages/lesson-player/runtime.ts';

void test('real built-in grammars validate, reduce, render and replay independently of binary search', async () => {
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
    cacheDir: 'outputs/test-runtime/vite-cache',
    server: { middlewareMode: true, hmr: false },
    oxc: { jsx: { runtime: 'automatic' } },
  });
  try {
    const grammars = await server.ssrLoadModule(
      '/packages/visual-grammars/index.ts',
    );
    const registry = grammars.defaultVisualRegistry as VisualRegistry;
    const graph = {
      nodes: [
        { id: 'input', label: 'Input' },
        { id: 'output', label: 'Output' },
      ],
      edges: [{ id: 'send', from: 'input', to: 'output' }],
    };
    const cases = [
      {
        grammar: 'flow',
        config: graph,
        actions: [
          ['activate', { id: 'input' }],
          ['connect', { id: 'send' }],
          ['activate', { id: 'output' }],
        ],
        selector: 'data-node="output"',
      },
      {
        grammar: 'state-transition',
        config: graph,
        actions: [
          ['enter', { id: 'input' }],
          ['transition', { id: 'send' }],
        ],
        selector: 'data-active="true"',
      },
      {
        grammar: 'plot',
        config: {
          points: [
            { x: 0, y: 100 },
            { x: 50, y: 40 },
            { x: 100, y: 0 },
          ],
          xLabel: 'time',
          yLabel: 'value',
        },
        actions: [
          ['reveal', { index: 2 }],
          ['highlight', { index: 2 }],
        ],
        selector: 'data-plot-through="2"',
      },
      {
        grammar: 'plot',
        config: {
          points: [
            { x: -2, y: 200 },
            { x: 0, y: 0 },
            { x: 2, y: -200 },
          ],
          xLabel: 'position',
          yLabel: 'value',
          xAxis: { min: -2, max: 2, ticks: [-2, 0, 2] },
          yAxis: { min: -200, max: 200, ticks: [-200, 0, 200] },
          grid: true,
        },
        actions: [
          ['reveal', { index: 2 }],
          ['highlight', { index: 2 }],
        ],
        selector: 'points="50,50 310,175 570,300"',
      },
      {
        grammar: 'array-search',
        config: {
          values: [1, 4, 4, 7, 10],
          valuesAt: 0,
          stagger: 0.1,
          scanStart: 0,
          scanEnd: 1,
          trail: [8, 4, 2],
          trailAt: 5,
          trailStep: 0.5,
        },
        actions: [
          ['window', { low: 1, mid: 2, high: 4 }],
          ['discard', { indices: [0] }],
          ['found', { index: 2 }],
        ],
        selector: 'found-circle',
      },
    ];
    const base = {
      schemaVersion: '0.1.0',
      id: 'other-topic',
      title: 'Independent topic',
      eyebrow: 'Fixture',
      duration: 10,
      audio: '/audio/fixture.mp3',
      chapters: [{ id: 'start', label: 'Start', at: 0 }],
      narration: [{ at: 0, text: 'An independent script.' }],
      presentation: {
        titleAt: 0,
        metaAt: 0,
        diagramTitleAt: 0,
        notesTitleAt: 0,
        ruleAt: 0,
        diagramTitle: 'Diagram',
        notesTitle: 'Notes',
      },
    };
    for (const entry of cases) {
      const lesson = {
        ...base,
        visuals: [
          { id: 'visual', grammar: entry.grammar, config: entry.config },
        ],
        events: entry.actions.map(([action, payload], index) => ({
          at: index + 1,
          type: 'visual',
          visualId: 'visual',
          action,
          payload,
        })),
      } as LessonSpec;
      const original = structuredClone(lesson),
        prepared = prepareLesson(lesson, registry);
      const render = (time: number) => {
        const visual = classroomAt(prepared, time).visuals[0];
        return renderToStaticMarkup(
          createElement(visual.grammar.Renderer, {
            config: visual.config,
            state: visual.state,
            time,
          }),
        );
      };
      const expected = render(4);
      assert.ok(expected.includes(entry.selector));
      if (entry.grammar === 'plot') {
        assert.ok(expected.includes('data-plot-axis="x"'));
        assert.ok(expected.includes('data-plot-axis="y"'));
      }
      for (const time of [0, 2, 10, 4, 0, 4]) render(time);
      assert.equal(
        render(4),
        expected,
        `${entry.grammar} must replay deterministically`,
      );
      assert.deepEqual(lesson, original);
      const invalid = structuredClone(lesson);
      invalid.events[0] = {
        at: 1,
        type: 'visual',
        visualId: 'visual',
        action: 'unknown',
        payload: {},
      };
      assert.throws(() => prepareLesson(invalid, registry));
    }
    const invalidState = {
      ...base,
      visuals: [{ id: 'visual', grammar: 'state-transition', config: graph }],
      events: [
        {
          at: 1,
          type: 'visual',
          visualId: 'visual',
          action: 'transition',
          payload: { id: 'send' },
        },
      ],
    };
    assert.throws(() => prepareLesson(invalidState, registry), /起点/);
    const board = await server.ssrLoadModule(
      '/packages/board-renderer/index.tsx',
    );
    const marks = ['arrow', 'curve', 'circle', 'underline', 'highlight'].map(
      (kind, index) => ({
        id: kind,
        kind,
        at: 1,
        region: 'notes',
        points:
          kind === 'curve'
            ? [
                { x: 10, y: 10 },
                { x: 30, y: 30 },
                { x: 80, y: 20 },
              ]
            : [
                { x: 10 + index, y: 10 },
                { x: 80, y: 40 },
              ],
      }),
    );
    const html = renderToStaticMarkup(
      createElement(board.BoardMarks, { marks, region: 'notes', time: 2 }),
    );
    marks.forEach((mark) => assert.ok(html.includes(`data-mark="${mark.id}"`)));
    const downArrow = renderToStaticMarkup(
      createElement(board.BoardMarks, {
        marks: [
          {
            id: 'down',
            kind: 'arrow',
            at: 0,
            region: 'notes',
            points: [
              { x: 40, y: 10 },
              { x: 40, y: 80 },
            ],
          },
        ],
        region: 'notes',
        time: 2,
      }),
    );
    assert.ok(
      downArrow.includes('rotate(90 40 80)'),
      'arrow heads must follow the configured direction',
    );
    const fallback = renderToStaticMarkup(
      createElement(board.HandwrittenLine, {
        item: {
          id: 'unknown-glyphs',
          text: '细胞传递信息',
          tone: 'plain',
          at: 0,
        },
        time: 1,
      }),
    );
    assert.ok(
      fallback.includes('handwriting-fallback'),
      'other Chinese content must remain visible',
    );
  } finally {
    await server.close();
  }
});
