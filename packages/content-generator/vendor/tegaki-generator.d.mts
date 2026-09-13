export const DEFAULT_OPTIONS: Record<string, unknown>;
export function parseFont(buffer: ArrayBuffer): Promise<{
  unitsPerEm: number; ascender: number; descender: number;
}>;
export function processGlyph(font: Awaited<ReturnType<typeof parseFont>>, char: string, options: Record<string, unknown>): null | {
  advanceWidth: number;
  strokesFontUnits: { points: { x: number; y: number; width: number }[]; delay: number; animationDuration: number; priority?: number }[];
};
