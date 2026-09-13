import data from '../../public/lessons/binary-search-doubao.json' with { type: 'json' };
import { binarySearchLesson } from '../binary-search/lesson.ts';
import type { LessonSpec as LegacyLesson } from '../../lib/lesson';
import type {
  Json,
  LessonSpec,
  TimelineEvent,
} from '../../packages/lesson-schema/index';

// A second presentation using ONLY public lesson data and the same player.
// Reuses the approved narration; no extra paid synthesis is required.
const original = binarySearchLesson(data as LegacyLesson);
const cue = (index: number) => original.narration[index].at;
const nodes = [
  {
    id: 'question',
    label: '先换一个问题',
    position: { x: 17, y: 28 },
    at: 0.5,
  },
  {
    id: 'compare',
    label: '比较中间值',
    position: { x: 50, y: 28 },
    at: cue(2),
  },
  {
    id: 'discard',
    label: '排除左半边',
    position: { x: 83, y: 28 },
    at: cue(3),
  },
  {
    id: 'move',
    label: 'low = mid + 1',
    position: { x: 83, y: 72 },
    at: cue(4),
  },
  { id: 'found', label: '找到目标', position: { x: 50, y: 72 }, at: cue(6) },
  {
    id: 'invariant',
    label: '保留不变量',
    position: { x: 17, y: 72 },
    at: cue(7),
  },
];
const edges = nodes
  .slice(1)
  .map((node, index) => ({
    id: `edge-${index}`,
    from: nodes[index].id,
    to: node.id,
  }));
const steps = [
  0,
  cue(3),
  original.events.find(
    (event) => event.type === 'visual' && event.action === 'discard',
  )!.at,
  cue(5),
  original.events.find(
    (event) => event.type === 'visual' && event.action === 'found',
  )!.at,
  cue(7),
];
const visuals: TimelineEvent[] = nodes.flatMap((node, index) => [
  ...(index
    ? [
        {
          at: steps[index],
          type: 'visual' as const,
          visualId: 'flow',
          action: 'connect',
          payload: { id: edges[index - 1].id },
        },
      ]
    : []),
  {
    at: steps[index],
    type: 'visual' as const,
    visualId: 'flow',
    action: 'activate',
    payload: { id: node.id },
  },
]);
export const searchFlowLesson: LessonSpec = {
  ...original,
  id: 'search-flow',
  title: '二分查找：从问题到答案',
  eyebrow: '流程视角 · 77 秒',
  presentation: {
    ...original.presentation,
    diagramTitle: '查找过程',
    notesTitle: '推导过程',
  },
  visuals: [{ id: 'flow', grammar: 'flow', config: { nodes, edges } as Json }],
  events: [
    ...original.events.filter((event) => event.type !== 'visual'),
    ...visuals,
  ].sort((a, b) => a.at - b.at),
};
