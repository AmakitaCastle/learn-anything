import type { BoardItem } from '@learn-anything/lesson-schema';

export type HandwritingFrame = {
  characterProgress: number[];
  writingProgress: number;
  underlineProgress: number;
};

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
    underlineProgress: clamp01((time - item.at - fullWritingDuration) / 0.55),
  };
}
