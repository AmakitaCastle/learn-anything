import data from '../public/lessons/binary-search-doubao.json' with { type: 'json' };
import { binarySearchLesson } from './binary-search/lesson.ts';
import type { LessonSpec as LegacyLesson } from '../lib/lesson.ts';
import type { LessonSpec } from '../packages/lesson-schema/index.ts';
const base = binarySearchLesson(data as LegacyLesson);
const compare = base.chapters[1].at;
const found = base.events.find(
  (event) => event.type === 'visual' && event.action === 'found',
)!.at;
export const stateLesson: LessonSpec = {
  ...base,
  id: 'state-example',
  title: '查找过程：状态转换',
  presentation: { ...base.presentation, diagramTitle: '状态转换' },
  visuals: [
    {
      id: 'state',
      grammar: 'state-transition',
      config: {
        nodes: [
          { id: 'question', label: '问题', at: 0.5 },
          { id: 'compare', label: '比较', at: 10 },
          { id: 'found', label: '找到', at: 40 },
        ],
        edges: [
          { id: 'begin', from: 'question', to: 'compare' },
          { id: 'finish', from: 'compare', to: 'found' },
        ],
      },
    },
  ],
  events: [
    ...base.events.filter((event) => event.type !== 'visual'),
    {
      at: 0,
      type: 'visual' as const,
      visualId: 'state',
      action: 'enter',
      payload: { id: 'question' },
    },
    {
      at: compare,
      type: 'visual' as const,
      visualId: 'state',
      action: 'transition',
      payload: { id: 'begin' },
    },
    {
      at: found,
      type: 'visual' as const,
      visualId: 'state',
      action: 'transition',
      payload: { id: 'finish' },
    },
  ].sort((a, b) => a.at - b.at),
};
const half = base.events.find(
  (event) => event.type === 'board.write' && event.item.id === 'half',
)!.at;
export const plotLesson: LessonSpec = {
  ...base,
  id: 'plot-example',
  title: '查找过程：范围不断减半',
  presentation: { ...base.presentation, diagramTitle: '范围不断减半' },
  visuals: [
    {
      id: 'range',
      grammar: 'plot',
      config: {
        points: [
          { x: 0, y: 100 },
          { x: 25, y: 50 },
          { x: 50, y: 25 },
          { x: 75, y: 12.5 },
          { x: 100, y: 6.25 },
        ],
        xLabel: 'comparisons',
        yLabel: 'remaining %',
      },
    },
  ],
  events: [
    ...base.events.filter((event) => event.type !== 'visual'),
    ...[1, 2, 3, 4].map((index) => ({
      at: half + (index - 1) * 1.3,
      type: 'visual' as const,
      visualId: 'range',
      action: 'reveal',
      payload: { index },
    })),
    {
      at: half + 4,
      type: 'visual' as const,
      visualId: 'range',
      action: 'highlight',
      payload: { index: 4 },
    },
  ].sort((a, b) => a.at - b.at),
};
