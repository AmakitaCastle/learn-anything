import data from '../../public/lessons/water-cycle.json' with { type: 'json' };
import type {
  Json,
  LessonSpec,
  TimelineEvent,
} from '../../packages/lesson-schema/index';
export const waterFlowLesson = data as LessonSpec;
const labels: Record<string, string> = {
  collection: '地表与地下的水',
  evaporation: '水蒸气',
  condensation: '小水滴与冰晶',
  precipitation: '雨或雪',
};
const graph = waterFlowLesson.visuals[0].config as {
  nodes: {
    id: string;
    label: string;
    position: { x: number; y: number };
    at: number;
  }[];
  edges: { id: string; from: string; to: string }[];
};
export const waterStateLesson: LessonSpec = {
  ...waterFlowLesson,
  id: 'water-cycle-state',
  presentation: {
    ...waterFlowLesson.presentation,
    diagramTitle: '水的位置与状态在改变',
  },
  visuals: [
    {
      id: 'water',
      grammar: 'state-transition',
      config: {
        ...graph,
        nodes: graph.nodes.map((node) => ({ ...node, label: labels[node.id] })),
      } as Json,
    },
  ],
  events: waterFlowLesson.events.flatMap((event): TimelineEvent[] => {
    if (event.type !== 'visual') return [event];
    if (event.action === 'connect') return [{ ...event, action: 'transition' }];
    return event.at === 0 ? [{ ...event, action: 'enter' }] : [];
  }),
};
