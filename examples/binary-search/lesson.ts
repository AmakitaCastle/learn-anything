import type { LessonSpec as LegacyLesson } from '../../lib/lesson.ts';
import { presentationAt } from '../../lib/lesson.ts';
import type {
  LessonSpec,
  TimelineEvent,
} from '../../packages/lesson-schema/index.ts';
export function binarySearchLesson(source: LegacyLesson): LessonSpec {
  const at = (seconds: number) => presentationAt(source, seconds);
  const events = source.events.map((event): TimelineEvent => {
    if (event.type === 'chapter') return event;
    if (event.type === 'board.write')
      return {
        at: event.at,
        type: 'board.write',
        item: {
          id: event.id,
          text: event.text,
          tone: event.tone,
          underline: ['invariant-rule', 'complexity'].includes(event.id),
        },
      };
    let action: string, payload: Record<string, string | number | number[]>;
    switch (event.type) {
      case 'focus':
        action = 'focus';
        payload = { target: event.target };
        break;
      case 'array.window':
        action = 'window';
        payload = { low: event.low, mid: event.mid, high: event.high };
        break;
      case 'array.discard':
        action = 'discard';
        payload = { indices: event.indices };
        break;
      case 'array.found':
        action = 'found';
        payload = { index: event.index };
        break;
    }
    return {
      at: event.at,
      type: 'visual',
      visualId: 'search',
      action,
      payload,
    };
  });
  return {
    schemaVersion: '0.1.0',
    id: source.id,
    title: source.title,
    eyebrow: `${source.eyebrow.replace(' · ', ' ')} 目标值 ${source.target}`,
    duration: source.duration,
    audio: source.audio,
    captions: source.captions ?? '/lessons/binary-search-zh.vtt',
    chapters: source.chapters,
    narration: source.narration,
    events,
    presentation: {
      titleAt: at(0.15),
      metaAt: at(1.9),
      diagramTitleAt: at(2.45),
      notesTitleAt: at(0.8),
      ruleAt: at(1.5),
      diagramTitle: `在有序数组中找 ${source.target}`,
      notesTitle: '推导过程',
    },
    visuals: [
      {
        id: 'search',
        grammar: 'array-search',
        config: {
          values: source.array,
          valuesAt: at(3),
          stagger: at(3.23) - at(3),
          scanStart: at(7.852),
          scanEnd: at(17.088),
          trail: [1000000, 500000, 250000, 125000, 1],
          trailAt: at(76.2),
          trailStep: at(76.75) - at(76.2),
        },
      },
    ],
  };
}
