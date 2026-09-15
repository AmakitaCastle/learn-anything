export const CHINESE_FONTS = [
  { id: 'ma-shan-zheng', label: '马善政 · 毛笔' },
  { id: 'xiaolai', label: '小赖 · 硬笔' },
  { id: 'wenkai', label: '霞鹜文楷 · 楷书' },
] as const;
export const LATIN_FONTS = [
  { id: 'caveat', label: 'Caveat · 随手写' },
  { id: 'klee-one', label: 'Klee One · 规整手写' },
  { id: 'parisienne', label: 'Parisienne · 连笔' },
] as const;
export type ChineseFontId = (typeof CHINESE_FONTS)[number]['id'];
export type LatinFontId = (typeof LATIN_FONTS)[number]['id'];
export type FontSelection = { chinese: ChineseFontId; latin: LatinFontId };
export const DEFAULT_FONTS: Readonly<FontSelection> = {
  chinese: 'ma-shan-zheng',
  latin: 'caveat',
};
export function parseFontSelection(input: unknown): FontSelection {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('字体选择无效。');
  const { chinese, latin } = input as Record<string, unknown>;
  if (!CHINESE_FONTS.some((font) => font.id === chinese))
    throw new Error('中文字体仅支持 ma-shan-zheng、xiaolai、wenkai。');
  if (!LATIN_FONTS.some((font) => font.id === latin))
    throw new Error('英文／数字字体仅支持 caveat、klee-one、parisienne。');
  return { chinese, latin } as FontSelection;
}
