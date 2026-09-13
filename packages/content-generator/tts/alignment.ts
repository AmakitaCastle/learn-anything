import { presentationAt, type LessonSpec } from '../legacy-lesson.ts';

type Word = {
  word: string;
  startTime: number;
  endTime: number;
  confidence?: number;
};

const normalize = (text: string) => text.replace(/[\p{P}\p{Z}\s]/gu, '');

// These are editorial anchors for this fixed Golden Demo, not a generic
// lesson compiler. Phrase matches must be unique in the exact spoken script.
const boardAnchors: [number, string][] = [
  [1.4, '一个已经排好序'],
  [12, '但数组越长'],
  [18.6, '目标在中间值'],
  [27.8, '二十三比十三大'],
  [31.2, '都不可能是答案'],
  [42, 'mid 的右边一格'],
  [53.2, '正好是二十三'],
  [59.4, '而是每次开始前'],
  [61.2, '目标如果存在'],
  [66.8, '比较一次'],
  [76.2, '最多只要'],
  [77.4, '大约二十次比较'],
  [82, '而是因为每一步'],
];

export function alignBinarySearch(
  source: LessonSpec,
  metadata: Record<string, unknown>[],
  duration: number,
) {
  if (source.id !== 'binary-search-why-half' || source.timingMap) {
    throw new Error('请使用未对齐的二分查找原始课程。');
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('无效的音频实际时长。');
  }
  const words: Word[] = [];
  for (const packet of metadata) {
    const sentence = packet.sentence;
    if (!sentence || typeof sentence !== 'object' || !('words' in sentence))
      continue;
    if (!Array.isArray(sentence.words)) throw new Error('无效的词时间戳列表。');
    for (const value of sentence.words) {
      if (
        !value ||
        typeof value.word !== 'string' ||
        !normalize(value.word) ||
        !Number.isFinite(value.startTime) ||
        !Number.isFinite(value.endTime) ||
        value.startTime < 0 ||
        value.endTime <= value.startTime ||
        value.endTime > duration
      ) {
        throw new Error('词时间戳无效或超出实际音频时长，停止对齐。');
      }
      words.push(value as Word);
    }
  }
  words.sort((a, b) => a.startTime - b.startTime);
  if (!words.length)
    throw new Error('接口没有返回有效词时间戳，不能切换课堂。');
  for (let index = 1; index < words.length; index++) {
    // Float32 timestamps can have microsecond rounding differences.
    if (words[index].startTime < words[index - 1].endTime - 0.0001) {
      throw new Error('词时间戳重叠或重复，停止对齐。');
    }
  }
  const text = normalize(source.narration.map((cue) => cue.text).join(''));
  const spoken = words.map((word) => normalize(word.word)).join('');
  if (spoken !== text)
    throw new Error('时间戳文本与整课讲稿不一致，停止对齐。');
  const characters = words.flatMap((word) =>
    Array.from(normalize(word.word), () => word),
  );
  const phraseAt = (phrase: string) => {
    const match = normalize(phrase);
    const offset = text.indexOf(match);
    if (offset < 0 || text.indexOf(match, offset + 1) !== -1) {
      throw new Error(`语义锚点缺失或不唯一：${phrase}`);
    }
    return characters[Array.from(text.slice(0, offset)).length].startTime;
  };
  const timingMap = [
    { sourceAt: 0, at: 0, anchor: 'audio-start' },
    ...source.narration.slice(1).map((cue) => ({
      sourceAt: cue.at,
      at: phraseAt(cue.text),
      anchor: cue.text,
    })),
    ...boardAnchors.map(([sourceAt, anchor]) => ({
      sourceAt,
      at: phraseAt(anchor),
      anchor,
    })),
    { sourceAt: source.duration, at: duration, anchor: 'audio-end' },
  ].sort((a, b) => a.sourceAt - b.sourceAt);
  for (let index = 1; index < timingMap.length; index++) {
    if (
      timingMap[index].sourceAt <= timingMap[index - 1].sourceAt ||
      timingMap[index].at <= timingMap[index - 1].at
    ) {
      throw new Error('语义锚点顺序冲突，停止对齐。');
    }
  }
  const lesson = { ...structuredClone(source), duration, timingMap };
  lesson.eyebrow = `计算机科学 · ${Math.round(duration)} 秒`;
  lesson.audio = '/audio/binary-search-doubao-zh.mp3';
  lesson.captions = '/lessons/binary-search-doubao-zh.vtt';
  lesson.events = source.events.map((event) => ({
    ...event,
    at: presentationAt(lesson, event.at),
  }));
  lesson.chapters = source.chapters.map((chapter) => ({
    ...chapter,
    at: presentationAt(lesson, chapter.at),
  }));
  lesson.narration = source.narration.map((cue) => ({
    ...cue,
    at: presentationAt(lesson, cue.at),
  }));
  const stamp = (seconds: number) => {
    const milliseconds = Math.round(seconds * 1000);
    return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
  };
  const vtt =
    'WEBVTT\n\n' +
    lesson.narration
      .map(
        (cue, index) =>
          `${index + 1}\n${stamp(cue.at)} --> ${stamp(lesson.narration[index + 1]?.at ?? duration)}\n${cue.text}\n`,
      )
      .join('\n');
  return {
    lesson,
    vtt,
    wordCount: words.length,
    // Provider alignments are not human-reviewed. Surface low confidence,
    // rather than representing every returned word as precision ground truth.
    lowConfidenceWords: words
      .filter(
        (word) => typeof word.confidence === 'number' && word.confidence < 0.5,
      )
      .map(({ word, startTime, endTime, confidence }) => ({
        word,
        startTime,
        endTime,
        confidence,
      })),
  };
}
