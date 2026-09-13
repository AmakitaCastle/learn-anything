import { asset, identifier, list, number, record } from './index.ts';

// Tegaki v0 compact data only. No generated JS or CSS is accepted.
export type HandwritingGlyph = {
  w: number;
  t: number;
  s: { p: [number, number, number][]; d: number; a: number; r?: number }[];
};
export type HandwritingBundle = {
  version: 0;
  family: string;
  fontUrl: string;
  lineCap: 'round';
  unitsPerEm: number;
  ascender: number;
  descender: number;
  glyphData: Record<string, HandwritingGlyph>;
};
export function parseHandwritingBundle(input: unknown): HandwritingBundle {
  const value = record(input);
  if (value.version !== 0 || value.lineCap !== 'round')
    throw new Error('手写资源版本或笔端无效。');
  const fontUrl = asset(value.fontUrl);
  if (/["'()<>]/.test(fontUrl)) throw new Error('手写字体地址无效。');
  const entries = Object.entries(record(value.glyphData));
  if (entries.length > 2000) throw new Error('手写字数超过限制。');
  let pointCount = 0;
  const glyphData = Object.fromEntries(
    entries.map(([char, input]) => {
      if (Array.from(char).length !== 1)
        throw new Error('手写字形键必须是单个字符。');
      const glyph = record(input);
      const t = number(glyph.t, 0, 600);
      const s = list(glyph.s, 100).map((input) => {
        const stroke = record(input);
        const p = list(stroke.p, 2000).map(
          (input): [number, number, number] => {
            if (!Array.isArray(input) || input.length !== 3)
              throw new Error('手写笔画点无效。');
            if (++pointCount > 200000) throw new Error('手写笔画超过限制。');
            return [
              number(input[0], -65536, 65536),
              number(input[1], -65536, 65536),
              number(input[2], 0, 8192),
            ];
          },
        );
        if (!p.length) throw new Error('手写笔画不能为空。');
        const d = number(stroke.d, 0, 600),
          a = number(stroke.a, 0, 600);
        if (d + a > t + 0.01) throw new Error('手写笔画时长越界。');
        return {
          p,
          d,
          a,
          ...(stroke.r === undefined ? {} : { r: number(stroke.r, -100, 100) }),
        };
      });
      return [char, { w: number(glyph.w, 0, 8192), t, s }];
    }),
  );
  return {
    version: 0,
    family: identifier(value.family),
    fontUrl,
    lineCap: 'round',
    unitsPerEm: number(value.unitsPerEm, 100, 8192),
    ascender: number(value.ascender, 0, 8192),
    descender: number(value.descender, -8192, 0),
    glyphData,
  };
}
