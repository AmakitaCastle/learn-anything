import { computeTimeline, type TegakiBundle } from 'tegaki/core';

export const HANDWRITING_TIMING = {
  glyphGap: 0.035,
  wordGap: 0.08,
  lineGap: 0.12,
  deferDots: false,
} as const;

export function isLatinHandwritingCharacter(
  character: string,
  latin: TegakiBundle,
): boolean {
  return (
    /^[\u0020-\u007e]$/u.test(character) &&
    (/\s/u.test(character) || character in latin.glyphData)
  );
}

export type HandwritingRun = {
  text: string;
  script:
    | 'chinese'
    | 'latin'
    | 'chinese-default'
    | 'latin-default'
    | 'fallback';
  start: number;
  offset: number;
  duration: number;
  glyphs: { index: number; offset: number; duration: number }[];
};

export function handwritingRuns(
  text: string,
  chinese: TegakiBundle,
  latin: TegakiBundle,
  defaults?: { chinese: TegakiBundle; latin: TegakiBundle },
): { runs: HandwritingRun[]; duration: number } {
  const characters = Array.from(text);
  const groups: {
    text: string;
    script: HandwritingRun['script'];
    start: number;
  }[] = [];
  characters.forEach((character, index) => {
    const script = isLatinHandwritingCharacter(character, latin)
      ? 'latin'
      : /^[\u0020-\u007e]$/u.test(character) &&
          defaults &&
          isLatinHandwritingCharacter(character, defaults.latin)
        ? 'latin-default'
        : character in chinese.glyphData
          ? 'chinese'
          : defaults && character in defaults.chinese.glyphData
            ? 'chinese-default'
            : 'fallback';
    const previous = groups.at(-1);
    if (previous?.script === script) previous.text += character;
    else groups.push({ text: character, script, start: index });
  });

  // This composite is only for scheduling, never for rendering: each renderer
  // must use its matching font outlines and metrics. Chinese glyphs stay intact.
  const glyphData = {
    ...defaults?.chinese.glyphData,
    ...chinese.glyphData,
    ...Object.fromEntries(
      Object.entries(defaults?.latin.glyphData ?? {}).filter(
        ([character]) =>
          defaults && isLatinHandwritingCharacter(character, defaults.latin),
      ),
    ),
    ...Object.fromEntries(
      Object.entries(latin.glyphData).filter(([character]) =>
        isLatinHandwritingCharacter(character, latin),
      ),
    ),
  };
  const timeline = computeTimeline(
    text,
    { ...chinese, glyphData },
    HANDWRITING_TIMING,
  );
  const runs = groups.map(({ text: runText, script, start }) => {
    const local = computeTimeline(
      runText,
      script === 'latin'
        ? latin
        : script === 'latin-default'
          ? defaults!.latin
          : script === 'chinese-default'
            ? defaults!.chinese
            : chinese,
      HANDWRITING_TIMING,
    );
    return {
      text: runText,
      script,
      start,
      offset:
        timeline.entries.find((entry) => entry.graphemeIndex === start)
          ?.offset ?? 0,
      duration: local.totalDuration,
      glyphs: local.entries.map((entry) => ({
        index: entry.graphemeIndex,
        offset: entry.offset,
        duration: entry.duration,
      })),
    };
  });

  return { runs, duration: timeline.totalDuration };
}

export function speechHandwritingProgress(
  run: HandwritingRun,
  timing: { at: number; endAt: number }[],
  time: number,
): number {
  const local = timing.slice(
    run.start,
    run.start + Array.from(run.text).length,
  );
  if (!local.length || time < local[0].at) return 0;
  if (time >= local.at(-1)!.endAt) return 1;
  let drawn = 0;
  local.forEach((span, index) => {
    if (time < span.at) return;
    const progress =
      span.endAt === span.at
        ? 1
        : Math.max(0, Math.min(1, (time - span.at) / (span.endAt - span.at)));
    const glyph = run.glyphs.find((glyph) => glyph.index === index);
    if (glyph)
      drawn = Math.max(drawn, glyph.offset + glyph.duration * progress);
  });
  return run.duration === 0
    ? 1
    : Math.max(0, Math.min(1, drawn / run.duration));
}

export function handwritingRunProgress(
  run: HandwritingRun,
  writingProgress: number,
  totalDuration: number,
): number {
  if (writingProgress >= 1) return 1;
  const time = writingProgress * totalDuration;
  if (run.duration === 0) return time >= run.offset ? 1 : 0;
  return Math.max(0, Math.min(1, (time - run.offset) / run.duration));
}
