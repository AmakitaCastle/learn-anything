import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parsePlotAxis,
  plotModel,
  parseLessonDraft,
  type Json,
} from '../packages/lesson-schema/index.ts';

const legacy = {
  points: [
    { x: 0, y: 20 },
    { x: 100, y: 50 },
  ],
  xLabel: 'x',
  yLabel: 'y',
};

void test('legacy plots get deterministic default ticks without relocating points', () => {
  const result = plotModel.parseConfig(legacy, 10);
  assert.deepEqual(result.points, legacy.points);
  assert.deepEqual(result.xAxis, {
    min: 0,
    max: 100,
    ticks: [0, 25, 50, 75, 100],
  });
  assert.deepEqual(result.yAxis, result.xAxis);
  assert.equal(result.grid, false);
});

void test('generic axes accept negative, fractional and large actual data units', () => {
  for (const axis of [
    { min: -2, max: 2, ticks: [-2, -1, 0, 1, 2] },
    { min: 0, max: 0.02, ticks: [0, 0.005, 0.01, 0.015, 0.02] },
    { min: 1000, max: 2000, ticks: [1000, 1250, 1500, 1750, 2000] },
  ]) {
    assert.deepEqual(parsePlotAxis({ min: axis.min, max: axis.max }), axis);
    assert.deepEqual(parsePlotAxis(axis), axis);
    const result = plotModel.parseConfig(
      {
        ...legacy,
        xAxis: axis,
        yAxis: axis,
        points: [
          { x: axis.min, y: axis.max },
          { x: axis.max, y: axis.min },
        ],
        grid: true,
      },
      10,
    );
    assert.deepEqual(result.xAxis, axis);
    assert.equal(result.grid, true);
  }
});

void test('invalid axis ranges, ticks, grids and out-of-domain data fail closed', () => {
  for (const axis of [
    null,
    { min: null },
    { min: 2, max: 2 },
    { min: 3, max: 2 },
    { min: -1e10 },
    { max: Infinity },
    { ticks: [] },
    { ticks: [1, 1] },
    { ticks: [2, 1] },
    { ticks: [-1] },
    { ticks: Array.from({ length: 22 }, (_, i) => i) },
    { ticks: ['1'] },
    { unknown: true },
  ]) {
    assert.throws(() => parsePlotAxis(axis));
  }
  assert.throws(() => plotModel.parseConfig({ ...legacy, grid: 'true' }, 10));
  assert.throws(() =>
    plotModel.parseConfig({ ...legacy, xAxis: { min: 0, max: 2 } }, 10),
  );
  assert.throws(() =>
    plotModel.parseConfig(
      {
        ...legacy,
        points: [
          { x: 10, y: 20 },
          { x: 0, y: 30 },
        ],
      },
      10,
    ),
  );
  const config = { ...legacy, yAxis: { min: 0, max: 10 } };
  assert.throws(() =>
    parseLessonDraft({
      draftVersion: '0.1.0',
      id: 'axes',
      title: 'Axes',
      eyebrow: 'Test',
      segments: [{ id: 'start', label: 'Start', text: 'Test.' }],
      presentation: { diagramTitle: 'Plot', notesTitle: 'Notes' },
      visuals: [{ id: 'chart', grammar: 'plot', config: config as Json }],
      events: [],
    }),
  );
});
