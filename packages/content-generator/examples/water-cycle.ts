import type { LessonSpec, TimelineEvent } from '@learn-anything/lesson-schema';
import draft from './water-cycle.draft.json' with { type: 'json' };
import { parseLessonDraft } from '@learn-anything/lesson-schema';
export const waterCycleDraft = parseLessonDraft(draft);
export const waterCycleSegments = waterCycleDraft.segments;
export type SegmentTiming = {
  start: number;
  duration: number;
  at(phrase: string): number;
};
// Archived compatibility entry. New lessons use compileLessonDraft + JSON materials.
export function compileWaterCycle(
  timings: SegmentTiming[],
  duration: number,
): LessonSpec {
  if (timings.length !== waterCycleSegments.length)
    throw new Error('旁白片段不完整。');
  const at = (index: number, phrase: string) =>
    timings[index].start + timings[index].at(phrase);
  const stages = {
    evaporation: at(1, '变成水蒸气'),
    condensation: at(2, '凝结成小水滴'),
    precipitation: at(3, '落下'),
    collection: at(4, '汇入河流和湖泊'),
  };
  const events: TimelineEvent[] = waterCycleSegments.map((segment, index) => ({
    at: timings[index].start,
    type: 'chapter',
    chapterId: segment.id,
  }));
  const write = (
    time: number,
    id: string,
    text: string,
    tone: 'plain' | 'accent' | 'strong' | 'label',
    underline = false,
  ) =>
    events.push({
      at: time,
      type: 'board.write',
      item: { id, text, tone, underline },
    });
  write(at(0, '雨水从哪里来'), 'question', '雨水从哪里来？', 'label');
  write(stages.evaporation, 'evaporation', '蒸发：液态水 → 水蒸气', 'accent');
  write(at(1, '并不需要'), 'boiling', '蒸发不需要先烧开', 'plain');
  write(stages.condensation, 'condensation', '凝结：水蒸气 → 小水滴', 'accent');
  write(at(2, '云不是'), 'cloud', '云里有小水滴，也可能有冰晶', 'plain');
  write(
    stages.precipitation,
    'precipitation',
    '降水：雨或雪落回地面',
    'accent',
  );
  write(stages.collection, 'collection', '汇集：地表水与地下水', 'accent');
  write(
    at(5, '记住四个过程'),
    'summary',
    '位置与状态改变，水不断循环',
    'strong',
    true,
  );
  events.push({
    at: 0,
    type: 'visual',
    visualId: 'water',
    action: 'activate',
    payload: { id: 'collection' },
  });
  const transitions = [
    ['evaporation', 'rise'],
    ['condensation', 'cool'],
    ['precipitation', 'fall'],
    ['collection', 'return'],
  ] as const;
  for (const [stage, edge] of transitions)
    events.push(
      {
        at: stages[stage],
        type: 'visual',
        visualId: 'water',
        action: 'connect',
        payload: { id: edge },
      },
      {
        at: stages[stage],
        type: 'visual',
        visualId: 'water',
        action: 'activate',
        payload: { id: stage },
      },
    );
  return {
    schemaVersion: '0.1.0',
    id: 'water-cycle',
    title: '一滴水的旅行',
    eyebrow: `自然科学 · 水循环 · ${Math.round(duration)} 秒`,
    duration,
    audio: '/audio/water-cycle-zh.mp3',
    captions: '/lessons/water-cycle-zh.vtt',
    chapters: waterCycleSegments.map((segment, index) => ({
      id: segment.id,
      label: segment.label,
      at: timings[index].start,
    })),
    narration: waterCycleSegments.map((segment, index) => ({
      at: timings[index].start,
      text: segment.text,
    })),
    presentation: {
      titleAt: 0.15,
      metaAt: 1.9,
      diagramTitleAt: 2.45,
      notesTitleAt: 0.8,
      ruleAt: 1.5,
      diagramTitle: '一条常见的水循环路径',
      notesTitle: '4 个过程',
    },
    visuals: [
      {
        id: 'water',
        grammar: 'flow',
        config: {
          nodes: [
            {
              id: 'evaporation',
              label: '蒸发',
              position: { x: 25, y: 27 },
              at: timings[1].start,
            },
            {
              id: 'condensation',
              label: '凝结',
              position: { x: 75, y: 27 },
              at: timings[2].start,
            },
            {
              id: 'precipitation',
              label: '降水',
              position: { x: 75, y: 73 },
              at: timings[3].start,
            },
            {
              id: 'collection',
              label: '地表与地下',
              position: { x: 25, y: 73 },
              at: 0.5,
            },
          ],
          edges: [
            { id: 'rise', from: 'collection', to: 'evaporation' },
            { id: 'cool', from: 'evaporation', to: 'condensation' },
            { id: 'fall', from: 'condensation', to: 'precipitation' },
            { id: 'return', from: 'precipitation', to: 'collection' },
          ],
        },
      },
    ],
    events: events.sort((a, b) => a.at - b.at),
  };
}
