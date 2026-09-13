import type { ComponentType } from 'react';
import {
  parseLesson,
  type BoardItem,
  type BoardMark,
  type LessonSpec,
  type VisualModel,
} from '@learn-anything/lesson-schema';

export type VisualProps<C = unknown, S = unknown> = {
  config: C;
  state: S;
  time: number;
};
export type VisualGrammar<C = unknown, S = unknown, P = unknown> = VisualModel<
  C,
  S,
  P
> & {
  Renderer: ComponentType<VisualProps<C, S>>;
};
// The erasure is confined to registration. Each definition validates its data
// before it can reach its typed reducer or renderer.
export type RegisteredGrammar = VisualGrammar<unknown, unknown, unknown>;
export function registerGrammar<C, S, P>(
  grammar: VisualGrammar<C, S, P>,
): RegisteredGrammar {
  return grammar as unknown as RegisteredGrammar;
}
export type VisualRegistry = ReadonlyMap<string, RegisteredGrammar>;
export function createVisualRegistry(
  definitions: RegisteredGrammar[],
): VisualRegistry {
  const registry = new Map<string, RegisteredGrammar>();
  for (const definition of definitions) {
    if (registry.has(definition.id))
      throw new Error(`动画语法重复：${definition.id}`);
    registry.set(definition.id, definition);
  }
  return registry;
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
type PreparedVisual = {
  id: string;
  grammar: RegisteredGrammar;
  config: unknown;
  initial: unknown;
};
export type PreparedLesson = {
  lesson: LessonSpec;
  visuals: PreparedVisual[];
  visualPayloads: ReadonlyMap<number, unknown>;
};
export function prepareLesson(
  input: unknown,
  registry: VisualRegistry,
): PreparedLesson {
  const lesson = freeze(parseLesson(input));
  const visuals = lesson.visuals.map((visual) => {
    const grammar = registry.get(visual.grammar);
    if (!grammar) throw new Error(`未注册动画语法：${visual.grammar}`);
    const config = freeze(grammar.parseConfig(visual.config, lesson.duration));
    return {
      id: visual.id,
      grammar,
      config,
      initial: freeze(grammar.initial(config)),
    };
  });
  const visualPayloads = new Map<number, unknown>();
  lesson.events.forEach((event, index) => {
    if (event.type !== 'visual') return;
    const visual = visuals.find((visual) => visual.id === event.visualId)!;
    visualPayloads.set(
      index,
      freeze(
        visual.grammar.parseEvent(event.action, event.payload, visual.config),
      ),
    );
  });
  const prepared = { lesson, visuals, visualPayloads };
  // Validate stateful transitions across the complete course before mounting.
  classroomAt(prepared, lesson.duration);
  return prepared;
}
export type ClassroomFrame = {
  time: number;
  chapterId: string;
  narrationIndex: number;
  board: BoardItem[];
  marks: BoardMark[];
  visuals: {
    id: string;
    state: unknown;
    config: unknown;
    grammar: RegisteredGrammar;
  }[];
};
export function classroomAt(
  prepared: PreparedLesson,
  seconds: number,
): ClassroomFrame {
  if (!Number.isFinite(seconds)) throw new Error('课堂时间必须是有限数字。');
  const time = Math.max(0, Math.min(seconds, prepared.lesson.duration));
  const frame: ClassroomFrame = {
    time,
    chapterId: prepared.lesson.chapters[0].id,
    narrationIndex: prepared.lesson.narration.findLastIndex(
      (cue) => cue.at <= time,
    ),
    board: [],
    marks: [],
    visuals: prepared.visuals.map((visual) => ({
      ...visual,
      state: freeze(structuredClone(visual.initial)),
    })),
  };
  prepared.lesson.events.forEach((event, index) => {
    if (event.at > time) return;
    switch (event.type) {
      case 'chapter':
        frame.chapterId = event.chapterId;
        break;
      case 'board.write':
        frame.board = frame.board.filter((item) => item.id !== event.item.id);
        frame.board.push({ ...structuredClone(event.item), at: event.at });
        break;
      case 'board.mark':
        frame.marks = frame.marks.filter((mark) => mark.id !== event.mark.id);
        frame.marks.push({ ...structuredClone(event.mark), at: event.at });
        break;
      case 'board.remove':
        frame.board = frame.board.filter((item) => item.id !== event.id);
        frame.marks = frame.marks.filter((mark) => mark.id !== event.id);
        break;
      case 'visual': {
        const visual = frame.visuals.find(
          (visual) => visual.id === event.visualId,
        )!;
        visual.state = freeze(
          visual.grammar.reduce(
            visual.state,
            {
              at: event.at,
              action: event.action,
              payload: prepared.visualPayloads.get(index),
            },
            visual.config,
          ),
        );
        break;
      }
    }
  });
  return frame;
}
