import { createBundle, ensureFontFace, type TegakiBundle } from 'tegaki/core';
import caveat from 'tegaki/fonts/caveat';
import {
  parseHandwritingBundle,
  type ChineseFontId,
  type LatinFontId,
  type HandwritingBundle,
} from '@learn-anything/lesson-schema';
export {
  CHINESE_FONTS,
  LATIN_FONTS,
  DEFAULT_FONTS,
  parseFontSelection,
  type ChineseFontId,
  type LatinFontId,
  type FontSelection,
} from '@learn-anything/lesson-schema';
export type ChineseFontLoader = (
  id: Exclude<ChineseFontId, 'ma-shan-zheng'>,
) => Promise<HandwritingBundle>;
const chineseCache = new Map<string, Promise<TegakiBundle>>();
const fontAttempts = new Map<string, number>();
async function preparePresetFont(input: TegakiBundle) {
  const originalUrl = input.fontUrl;
  const attempt = fontAttempts.get(originalUrl) ?? 0;
  let fontUrl = originalUrl;
  if (attempt && !originalUrl.startsWith('data:')) {
    const url = new URL(originalUrl, location.href);
    url.searchParams.set('font-retry', String(attempt));
    fontUrl = url.href;
  }
  const font = fontUrl === originalUrl ? input : { ...input, fontUrl };
  try {
    await ensureFontFace(font);
  } catch (error) {
    // Tegaki caches failed font requests; a retry needs a new request URL.
    fontAttempts.set(originalUrl, attempt + 1);
    throw error;
  }
  return font;
}
const latinCache = new Map<string, Promise<TegakiBundle>>();
export async function loadChineseFont(
  id: Exclude<ChineseFontId, 'ma-shan-zheng'>,
  loader?: ChineseFontLoader,
): Promise<TegakiBundle> {
  if (id !== 'xiaolai' && id !== 'wenkai')
    throw new Error('中文字体选择无效。');
  // Host loaders contain course-specific coverage, never share across lessons.
  if (loader) {
    return preparePresetFont(
      createBundle(parseHandwritingBundle(await loader(id))),
    );
  }
  let pending = chineseCache.get(id);
  if (!pending) {
    pending = (async () => {
      const loaded =
        id === 'xiaolai'
          ? await import('./fonts/choices/xiaolai.ts')
          : await import('./fonts/choices/wenkai.ts');
      return preparePresetFont(createBundle(loaded.default));
    })();
    chineseCache.set(id, pending);
    void pending.catch(() => chineseCache.delete(id));
  }
  return pending;
}
export async function loadLatinFont(id: LatinFontId): Promise<TegakiBundle> {
  if (id !== 'caveat' && id !== 'klee-one' && id !== 'parisienne')
    throw new Error('英文／数字字体选择无效。');
  if (id === 'caveat') {
    return preparePresetFont(caveat);
  }
  let pending = latinCache.get(id);
  if (!pending) {
    pending = (async () => {
      const loaded =
        id === 'klee-one'
          ? await import('tegaki/fonts/klee-one')
          : await import('tegaki/fonts/parisienne');
      return preparePresetFont(loaded.default);
    })();
    latinCache.set(id, pending);
    void pending.catch(() => latinCache.delete(id));
  }
  return pending;
}
