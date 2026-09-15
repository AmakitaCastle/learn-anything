import { fileURLToPath } from 'node:url';
import { generateHandwritingCharacters } from '@learn-anything/content-generator';
import type { LessonSpec, ChineseFontId } from '@learn-anything/lesson-schema';
export function lessonFontCharacters(lesson: LessonSpec): string[] {
  const texts: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === 'string') texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value))
        if (key !== 'handwriting') collect(child);
  };
  collect(lesson);
  return [
    ...new Set(
      Array.from(texts.join('').normalize('NFC')).filter(
        (char) => !/[\s\u0020-\u007e]/u.test(char),
      ),
    ),
  ].sort();
}
export function builtinChineseFontPath(
  id: Exclude<ChineseFontId, 'ma-shan-zheng'>,
) {
  if (id !== 'xiaolai' && id !== 'wenkai') throw new Error('内置字体无效。');
  return fileURLToPath(new URL(`../assets/fonts/${id}.ttf`, import.meta.url));
}
export async function generateLessonFont(
  lesson: LessonSpec,
  id: Exclude<ChineseFontId, 'ma-shan-zheng'>,
  fontUrl: string,
) {
  return generateHandwritingCharacters(lessonFontCharacters(lesson), {
    fontPath: builtinChineseFontPath(id),
    cacheRoot: fileURLToPath(
      new URL('../outputs/handwriting', import.meta.url),
    ),
    fontUrl,
  });
}
