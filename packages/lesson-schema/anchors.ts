// Text matching only. Actual time always comes from returned speech word spans.
export const spokenText = (text: string) =>
  text.replace(/[\p{P}\p{Z}\s]/gu, '');

export function phraseRange(text: string, phrase: string, occurrence?: number) {
  const source = Array.from(spokenText(text));
  const match = Array.from(spokenText(phrase));
  if (!match.length) throw new Error('语义锚点为空。');
  const starts: number[] = [];
  for (let index = 0; index <= source.length - match.length; index++) {
    if (
      match.every((character, offset) => source[index + offset] === character)
    )
      starts.push(index);
  }
  if (!starts.length) throw new Error('语义锚点缺失。');
  if (occurrence === undefined && starts.length !== 1)
    throw new Error('语义锚点不唯一，请指定 occurrence（从 1 开始）。');
  if (
    occurrence !== undefined &&
    (!Number.isInteger(occurrence) ||
      occurrence < 1 ||
      occurrence > starts.length)
  )
    throw new Error('语义锚点 occurrence 超出范围。');
  const start = starts[(occurrence ?? 1) - 1];
  return { start, end: start + match.length };
}
