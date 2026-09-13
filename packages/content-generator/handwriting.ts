import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseHandwritingBundle,
  type HandwritingBundle,
  type LessonDraft,
} from '@learn-anything/lesson-schema';
import {
  DEFAULT_OPTIONS,
  parseFont,
  processGlyph,
} from './vendor/tegaki-generator.mjs';

export type HandwritingResources = {
  bundle: HandwritingBundle;
  font: Buffer;
  missing: string[];
};
export interface LessonHandwritingProvider {
  generate(draft: LessonDraft): Promise<HandwritingResources>;
}
export function lessonHandwritingCharacters(draft: LessonDraft): string[] {
  // ASCII uses the player's bundled Caveat. Collect visible course content,
  // including graph labels and the entire narration in full-board lessons.
  const texts: string[] = [
    draft.title,
    draft.eyebrow,
    draft.presentation.diagramTitle,
    draft.presentation.notesTitle,
  ];
  if (draft.boardMode === 'full-narration')
    draft.segments.forEach((segment) =>
      texts.push(segment.text, segment.label),
    );
  for (const event of draft.events)
    if (event.type === 'board.write') texts.push(event.item.text);
  const collect = (value: unknown): void => {
    if (typeof value === 'string') texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(collect);
  };
  draft.visuals.forEach((visual) => collect(visual.config));
  return [
    ...new Set(
      Array.from(texts.join('').normalize('NFC')).filter(
        (char) => !/[\s\u0020-\u007e]/u.test(char),
      ),
    ),
  ].sort();
}
export function createTegakiHandwritingProvider(
  options: { fontPath?: string; cacheRoot?: string; fontUrl?: string } = {},
): LessonHandwritingProvider {
  return {
    async generate(draft) {
      const font = await readFile(
        options.fontPath ??
          fileURLToPath(new URL('./fonts/ma-shan-zheng.ttf', import.meta.url)),
      );
      const fontHash = createHash('sha256')
        .update(font)
        .digest('hex')
        .slice(0, 16);
      const key = `${fontHash}-tegaki-0.22.1-round-400`;
      const cache = join(
        options.cacheRoot ?? join(tmpdir(), 'learn-anything-handwriting'),
        key,
      );
      await mkdir(cache, { recursive: true });
      const bytes = Uint8Array.from(font).buffer;
      const parsed = await parseFont(bytes);
      const bundle: HandwritingBundle = {
        version: 0,
        family: `lesson-handwriting-${fontHash}`,
        fontUrl: options.fontUrl ?? `/fonts/handwriting-${fontHash}.ttf`,
        lineCap: 'round',
        unitsPerEm: parsed.unitsPerEm,
        ascender: parsed.ascender,
        descender: parsed.descender,
        glyphData: {},
      };
      const missing: string[] = [];
      const chars = lessonHandwritingCharacters(draft);
      if (chars.length > 2000) throw new Error('课程手写字数超过限制。');
      for (const char of chars) {
        const path = join(cache, `${char.codePointAt(0)!.toString(16)}.json`);
        let cached: string | undefined;
        try {
          cached = await readFile(path, 'utf8');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        if (cached !== undefined) {
          const data = JSON.parse(cached);
          if (data === null) {
            missing.push(char);
            continue;
          }
          const checked = parseHandwritingBundle({
            ...bundle,
            glyphData: { [char]: data },
          });
          bundle.glyphData[char] = checked.glyphData[char];
          continue;
        }
        const result = processGlyph(parsed, char, {
          ...DEFAULT_OPTIONS,
          lineCap: 'round',
        });
        if (!result) {
          missing.push(char);
          await writeFile(path, 'null', { flag: 'wx' }).catch((error) => {
            if (error.code !== 'EEXIST') throw error;
          });
          continue;
        }
        const last = result.strokesFontUnits.at(-1);
        const glyph = {
          w: result.advanceWidth,
          t: last
            ? Math.round((last.delay + last.animationDuration) * 1000) / 1000
            : 0,
          s: result.strokesFontUnits.map((stroke) => ({
            p: stroke.points.map((p) => [p.x, p.y, p.width]),
            d: stroke.delay,
            a: stroke.animationDuration,
            ...(stroke.priority && stroke.priority < 0
              ? { r: stroke.priority }
              : {}),
          })),
        };
        const checked = parseHandwritingBundle({
          ...bundle,
          glyphData: { [char]: glyph },
        });
        bundle.glyphData[char] = checked.glyphData[char];
        await writeFile(path, JSON.stringify(checked.glyphData[char]), {
          flag: 'wx',
        }).catch((error) => {
          if (error.code !== 'EEXIST') throw error;
        });
      }
      return { bundle: parseHandwritingBundle(bundle), font, missing };
    },
  };
}
