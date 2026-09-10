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
  array: number[];
  target: number;
  chapters: Chapter[];
  narration: NarrationCue[];
  events: TimelineEvent[];
};

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

export type HandwritingFrame = {
  characterProgress: number[];
  writingProgress: number;
  underlineProgress: number;
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
  }, INITIAL_FRAME);
}

export function activeNarrationIndex(lesson: LessonSpec, time: number): number {
  return lesson.narration.findLastIndex((cue) => cue.at <= time);
}

export function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, '0')}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function handwritingAt(item: BoardItem, time: number): HandwritingFrame {
  const characterCount = Array.from(item.text).length;
  const secondsPerCharacter = Math.max(
    0.085,
    Math.min(0.13, 3.2 / characterCount),
  );
  const writingDuration = characterCount * secondsPerCharacter;
  const fullWritingDuration = writingDuration + 0.27;

  return {
    characterProgress: Array.from({ length: characterCount }, (_, index) =>
      clamp01((time - item.at - index * secondsPerCharacter) / 0.27),
    ),
    writingProgress: clamp01((time - item.at) / fullWritingDuration),
    underlineProgress: clamp01(
      (time - item.at - fullWritingDuration) / 0.55,
    ),
  };
}
