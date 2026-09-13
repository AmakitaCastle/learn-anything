export function lessonNarration(
  input: unknown,
  mode: 'preview' | 'lesson',
): { text: string; cues: { originalAt: number; text: string }[] } {
  if (
    !input ||
    typeof input !== 'object' ||
    !('narration' in input) ||
    !Array.isArray(input.narration) ||
    !input.narration.length
  ) {
    throw new Error('课程缺少旁白片段。');
  }
  const cues = input.narration.map((cue: unknown) => {
    if (
      !cue ||
      typeof cue !== 'object' ||
      !('text' in cue) ||
      typeof cue.text !== 'string' ||
      !cue.text.trim() ||
      !('at' in cue) ||
      typeof cue.at !== 'number' ||
      !Number.isFinite(cue.at) ||
      cue.at < 0
    ) {
      throw new Error('课程旁白片段格式错误。');
    }
    return { originalAt: cue.at, text: cue.text.trim() };
  });
  const selected = mode === 'preview' ? cues.slice(0, 3) : cues;
  return { text: selected.map((cue) => cue.text).join('\n'), cues: selected };
}
