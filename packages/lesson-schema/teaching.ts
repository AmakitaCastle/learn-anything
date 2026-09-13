import {
  identifier,
  list,
  number,
  record,
  text,
  type LessonSpec,
} from './index.ts';
import { spokenText } from './anchors.ts';

export type TeachingWord = { text: string; at: number; endAt: number };
export type TeachingEmphasis = { start: number; end: number; at: number };
export type TeachingSegment = {
  id: string;
  label: string;
  text: string;
  at: number;
  endAt: number;
  visualId?: string;
  words: TeachingWord[];
  emphasis: TeachingEmphasis[];
  boardIds: string[];
  markIds: string[];
};

export function parseTeaching(
  value: unknown,
  lesson: Pick<
    LessonSpec,
    'duration' | 'chapters' | 'narration' | 'visuals' | 'events'
  >,
): TeachingSegment[] {
  const teaching = list(value, 100).map((value, index): TeachingSegment => {
    const input = record(value);
    const id = identifier(input.id);
    const source = text(input.text, 2000);
    const at = number(input.at, 0, lesson.duration);
    const endAt = number(input.endAt, at, lesson.duration);
    if (
      endAt <= at ||
      id !== lesson.chapters[index]?.id ||
      at !== lesson.chapters[index]?.at ||
      source !== lesson.narration[index]?.text
    )
      throw new Error('全文板书与旁白或章节不一致。');
    const visualId =
      input.visualId === undefined ? undefined : identifier(input.visualId);
    if (visualId && !lesson.visuals.some((visual) => visual.id === visualId))
      throw new Error('全文板书引用未知图示。');
    const words = list(input.words, 2000).map((value): TeachingWord => {
      const word = record(value);
      const start = number(word.at, at, endAt);
      const end = number(word.endAt, start, endAt);
      if (end <= start) throw new Error('全文板书词时间戳无效。');
      return { text: text(word.text), at: start, endAt: end };
    });
    if (
      !words.length ||
      words.map((word) => spokenText(word.text)).join('') !==
        spokenText(source) ||
      words.some((word, i) => i > 0 && word.at < words[i - 1].endAt - 0.0001)
    )
      throw new Error('全文板书词时间戳与文稿不一致。');
    const length = Array.from(source).length;
    const emphasis = list(input.emphasis, 8).map((value): TeachingEmphasis => {
      const mark = record(value);
      const start = number(mark.start, 0, length - 1);
      const end = number(mark.end, start + 1, length);
      if (!Number.isInteger(start) || !Number.isInteger(end))
        throw new Error('重点文字范围无效。');
      return { start, end, at: number(mark.at, at, endAt) };
    });
    const ids = (value: unknown, type: 'board.write' | 'board.mark') =>
      list(value, 5000).map((value) => {
        const id = identifier(value);
        if (
          !lesson.events.some(
            (event) =>
              event.type === type &&
              (event.type === 'board.write' ? event.item.id : event.mark.id) ===
                id,
          )
        )
          throw new Error('全文板书引用未知板书或标记。');
        return id;
      });
    return {
      id,
      label: text(input.label),
      text: source,
      at,
      endAt,
      ...(visualId ? { visualId } : {}),
      words,
      emphasis,
      boardIds: ids(input.boardIds, 'board.write'),
      markIds: ids(input.markIds, 'board.mark'),
    };
  });
  if (
    teaching.length !== lesson.narration.length ||
    teaching.length !== lesson.chapters.length ||
    lesson.visuals.some(
      (visual) => !teaching.some((segment) => segment.visualId === visual.id),
    )
  )
    throw new Error('每张图示必须配有完整旁白板书。');
  for (const segment of teaching) {
    if (
      segment.emphasis.some(
        (mark, index) =>
          index > 0 && mark.start < segment.emphasis[index - 1].end,
      )
    )
      throw new Error('重点文字范围无效。');
    const lines = teachingLines(segment);
    if (
      lines.flatMap((line) => line.emphasis).length !==
        segment.emphasis.length ||
      lines.some((line) =>
        line.emphasis.some(
          (mark) =>
            spokenText(
              Array.from(line.text).slice(mark.start, mark.end).join(''),
            ) === spokenText(line.text),
        ),
      )
    )
      throw new Error('重点不能覆盖整句或跨句。');
  }
  return teaching;
}

export type TeachingLine = {
  id: string;
  text: string;
  at: number;
  timing: { at: number; endAt: number }[];
  emphasis: TeachingEmphasis[];
};

// Word boundaries are measured. Within a multi-character word we interpolate;
// punctuation follows the preceding spoken character and never consumes speech.
export function teachingLines(segment: TeachingSegment): TeachingLine[] {
  const chars = Array.from(segment.text);
  const spokenTiming = segment.words.flatMap((word) => {
    const count = Array.from(spokenText(word.text)).length;
    return Array.from({ length: count }, (_, index) => ({
      at: word.at + ((word.endAt - word.at) * index) / count,
      endAt: word.at + ((word.endAt - word.at) * (index + 1)) / count,
    }));
  });
  let cursor = 0;
  let previous = segment.at;
  const timing = chars.map((char) => {
    if (spokenText(char)) {
      const value = spokenTiming[cursor++];
      previous = value.endAt;
      return value;
    }
    return { at: previous, endAt: previous };
  });
  const ranges = sentenceRanges(segment.text);
  return ranges.map((range, index) => ({
    id: `${segment.id}-sentence-${index}`,
    text: chars.slice(range.start, range.end).join(''),
    at:
      index === 0
        ? segment.at
        : timing[
            range.start +
              Math.max(
                0,
                chars
                  .slice(range.start, range.end)
                  .findIndex((char) => Boolean(spokenText(char))),
              )
          ].at,
    timing: timing.slice(range.start, range.end),
    emphasis: segment.emphasis
      .filter((mark) => mark.start >= range.start && mark.end <= range.end)
      .map((mark) => ({
        ...mark,
        start: mark.start - range.start,
        end: mark.end - range.start,
      })),
  }));
}

export function sentenceRanges(text: string): { start: number; end: number }[] {
  const chars = Array.from(text);
  const ranges: { start: number; end: number }[] = [];
  let start = 0;
  for (let index = 0; index < chars.length; index++) {
    const boundary =
      /[。！？!?\n]/u.test(chars[index]) ||
      (chars[index] === '.' &&
        (index === chars.length - 1 || /\s/u.test(chars[index + 1])));
    if (!boundary) continue;
    while (
      index + 1 < chars.length &&
      /[。！？!?\s”’」』]/u.test(chars[index + 1])
    )
      index++;
    ranges.push({ start, end: index + 1 });
    start = index + 1;
  }
  if (start < chars.length) ranges.push({ start, end: chars.length });
  return ranges;
}
