// Node-only: semantic anchors from real speech metadata, never guessed timing.
import { phraseRange, spokenText } from '@learn-anything/lesson-schema';
export { spokenText } from '@learn-anything/lesson-schema';
export type AlignedWord = {
  word: string;
  startTime: number;
  endTime: number;
  confidence?: number;
};
export function alignedSegment(
  text: string,
  metadata: Record<string, unknown>[],
  duration: number,
) {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('音频时长无效。');
  const words: AlignedWord[] = [];
  for (const packet of metadata) {
    const sentence = packet.sentence;
    if (!sentence || typeof sentence !== 'object' || !('words' in sentence))
      continue;
    if (!Array.isArray(sentence.words)) throw new Error('词时间戳无效。');
    for (const value of sentence.words) {
      if (!value || typeof value.word !== 'string' || !value.word.trim())
        throw new Error('词时间戳无效。');
      // Some voices return quotes/punctuation as separate subtitle tokens.
      // They carry no spoken characters and must not enter speech alignment.
      // Original punctuation is preserved by the narration/teaching renderer.
      if (!spokenText(value.word)) continue;
      if (
        !Number.isFinite(value.startTime) ||
        !Number.isFinite(value.endTime) ||
        value.startTime < 0 ||
        value.endTime <= value.startTime ||
        value.endTime > duration + 0.05
      ) {
        throw new Error('词时间戳超出音频或无效。');
      }
      words.push({
        word: value.word,
        startTime: value.startTime,
        endTime: value.endTime,
        ...(typeof value.confidence === 'number' &&
        Number.isFinite(value.confidence)
          ? { confidence: value.confidence }
          : {}),
      });
    }
  }
  words.sort((a, b) => a.startTime - b.startTime);
  if (
    !words.length ||
    words.map((word) => spokenText(word.word)).join('') !== spokenText(text)
  )
    throw new Error('时间戳与讲稿不一致。');
  for (let index = 1; index < words.length; index++)
    if (words[index].startTime < words[index - 1].endTime - 0.0001)
      throw new Error('时间戳重叠。');
  const characters = words.flatMap((word) =>
    Array.from(spokenText(word.word), () => word),
  );
  return {
    duration,
    words,
    at: (phrase: string, occurrence?: number) =>
      characters[phraseRange(text, phrase, occurrence).start].startTime,
    span: (phrase: string, occurrence?: number) => {
      const range = phraseRange(text, phrase, occurrence);
      return {
        start: characters[range.start].startTime,
        end: characters[range.end - 1].endTime,
      };
    },
  };
}
