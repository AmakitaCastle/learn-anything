export type BoardTone =
  | 'plain'
  | 'muted'
  | 'accent'
  | 'strong'
  | 'danger'
  | 'success'
  | 'label';

export type Chapter = {
  id: string;
  label: string;
  at: number;
};

export type NarrationCue = {
  at: number;
  text: string;
};

export type TimelineEvent =
  | { at: number; type: 'chapter'; chapterId: string }
  | { at: number; type: 'focus'; target: string }
  | {
      at: number;
      type: 'board.write';
      id: string;
      text: string;
      tone: BoardTone;
    }
  | {
      at: number;
      type: 'array.window';
      low: number;
      mid: number;
      high: number;
    }
  | { at: number; type: 'array.discard'; indices: number[] }
  | { at: number; type: 'array.found'; index: number };

export type LessonSpec = {
  schemaVersion: '0.0.1';
  id: string;
  title: string;
  eyebrow: string;
  duration: number;
  audio: string;
  captions?: string;
  // Original visual choreography mapped to the new audio's semantic anchors.
  timingMap?: { sourceAt: number; at: number; anchor: string }[];
  array: number[];
  target: number;
  chapters: Chapter[];
  narration: NarrationCue[];
  events: TimelineEvent[];
};

export function presentationAt(lesson: LessonSpec, sourceAt: number): number {
  const map = lesson.timingMap;
  if (!map?.length) return sourceAt;
  if (sourceAt <= map[0].sourceAt) return map[0].at;
  for (let index = 1; index < map.length; index++) {
    const right = map[index];
    const left = map[index - 1];
    if (sourceAt <= right.sourceAt) {
      return (
        left.at +
        ((sourceAt - left.sourceAt) / (right.sourceAt - left.sourceAt)) *
          (right.at - left.at)
      );
    }
  }
  return map[map.length - 1].at;
}

export type BoardItem = {
  at: number;
  id: string;
  text: string;
  tone: BoardTone;
};

export type LessonFrame = {
  chapterId: string;
  focus: string;
  low: number | null;
  mid: number | null;
  high: number | null;
  discarded: number[];
  found: number | null;
  board: BoardItem[];
};

const INITIAL_FRAME: LessonFrame = {
  chapterId: 'question',
  focus: 'intro',
  low: null,
  mid: null,
  high: null,
  discarded: [],
  found: null,
  board: [],
};

export function frameAt(lesson: LessonSpec, time: number): LessonFrame {
  const initialFrame: LessonFrame = {
    ...INITIAL_FRAME,
    discarded: [],
    board: [],
  };
  return lesson.events.reduce<LessonFrame>((frame, event) => {
    if (event.at > time) return frame;

    switch (event.type) {
      case 'chapter':
        return { ...frame, chapterId: event.chapterId };
      case 'focus':
        return { ...frame, focus: event.target };
      case 'board.write':
        return {
          ...frame,
          board: [
            ...frame.board.filter((item) => item.id !== event.id),
            { at: event.at, id: event.id, text: event.text, tone: event.tone },
          ],
        };
      case 'array.window':
        return {
          ...frame,
          low: event.low,
          mid: event.mid,
          high: event.high,
        };
      case 'array.discard':
        return {
          ...frame,
          discarded: Array.from(
            new Set([...frame.discarded, ...event.indices]),
          ),
        };
      case 'array.found':
        return { ...frame, found: event.index };
      default:
        return frame;
    }
  }, initialFrame);
}

export function activeNarrationIndex(lesson: LessonSpec, time: number): number {
  return lesson.narration.findLastIndex((cue) => cue.at <= time);
}
