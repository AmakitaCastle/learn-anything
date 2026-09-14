'use client';
import { createContext, useContext, useMemo, useEffect, memo } from 'react';
import { createBundle, ensureFontFace, type TegakiBundle } from 'tegaki/core';
import { TegakiRenderer } from 'tegaki';
import latin from 'tegaki/fonts/caveat';
import chinese from '../fonts/bundle.ts';
import { handwritingAt } from '../timing.ts';
import {
  HANDWRITING_TIMING,
  handwritingRunProgress,
  handwritingRuns,
  speechHandwritingProgress,
  type HandwritingRun,
} from '../handwriting.ts';
import type {
  BoardItem,
  BoardMark,
  Region,
  HandwritingBundle,
} from '@learn-anything/lesson-schema';

export { latin as latinHandwritingBundle };
export type ClassroomTheme = 'light' | 'dark';
const ThemeContext = createContext<ClassroomTheme>('light');
const FontContext = createContext<{
  chinese: TegakiBundle;
  latin: TegakiBundle;
  defaultChinese: TegakiBundle;
}>({ chinese, latin, defaultChinese: chinese });
export { chinese as defaultChineseHandwritingBundle };
export function HandwritingProvider({
  bundle,
  theme = 'light',
  chineseFont,
  latinFont = latin,
  children,
}: {
  bundle?: HandwritingBundle;
  theme?: ClassroomTheme;
  chineseFont?: TegakiBundle;
  latinFont?: TegakiBundle;
  children: React.ReactNode;
}) {
  const font = useMemo(
    () => (bundle ? createBundle(bundle) : chinese),
    [bundle],
  );
  useEffect(() => {
    void Promise.all([
      ensureFontFace(font),
      ensureFontFace(chineseFont ?? font),
      ensureFontFace(latin),
      ensureFontFace(latinFont),
    ]).catch(() => undefined);
  }, [font, chineseFont, latinFont]);
  const context = useMemo(
    () => ({
      chinese: chineseFont ?? font,
      latin: latinFont,
      defaultChinese: font,
    }),
    [chineseFont, font, latinFont],
  );
  return (
    <ThemeContext.Provider value={theme}>
      <FontContext.Provider value={context}>{children}</FontContext.Provider>
    </ThemeContext.Provider>
  );
}
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
// Completed runs keep their canvas: a ticking audio clock must not redraw
// every stroke in every previously spoken sentence.
const InkRun = memo(function InkRun({
  run,
  font,
  progress,
}: {
  run: HandwritingRun;
  font: TegakiBundle;
  progress: number;
}) {
  return (
    <TegakiRenderer
      as="span"
      aria-hidden="true"
      className="tegaki-text"
      data-handwriting-script={run.script}
      font={font}
      shaper={false}
      time={{ mode: 'controlled', unit: 'progress', value: progress }}
      timing={HANDWRITING_TIMING}
      effects={{
        pressureWidth: { strength: 0.42 },
        taper: { startLength: 0.06, endLength: 0.1 },
      }}
      quality={{ smoothing: true, pixelRatio: 1.25, segmentSize: 1.6 }}
    >
      {run.text}
    </TegakiRenderer>
  );
});
// Existing SVG labels keep their reveal behavior. Custom typography uses the
// matching script font rather than applying a Latin font to Chinese labels.
export function TeachingSvgSpans({ children }: { children: string }) {
  const fonts = useContext(FontContext);
  if (fonts.chinese === fonts.defaultChinese && fonts.latin === latin)
    return <>{children}</>;
  const runs: { text: string; family: string }[] = [];
  for (const char of Array.from(children)) {
    const isLatin = /^[\u0020-\u007e]$/u.test(char);
    const selected = isLatin ? fonts.latin : fonts.chinese;
    const fallback = isLatin ? latin : fonts.defaultChinese;
    const family =
      char in selected.glyphData ? selected.family : fallback.family;
    const last = runs.at(-1);
    if (last?.family === family) last.text += char;
    else runs.push({ text: char, family });
  }
  return (
    <>
      {runs.map((run, i) => (
        <tspan key={i} style={{ fontFamily: `"${run.family}", cursive` }}>
          {run.text}
        </tspan>
      ))}
    </>
  );
}
export function TeachingSvgText({
  children,
  ...props
}: React.SVGProps<SVGTextElement> & { children: string }) {
  return (
    <text {...props}>
      <TeachingSvgSpans>{children}</TeachingSvgSpans>
    </text>
  );
}

export function HandwrittenLine({
  item,
  time,
  underline = item.underline ?? false,
  speechTiming,
}: {
  item: BoardItem;
  time: number;
  underline?: boolean;
  speechTiming?: { at: number; endAt: number }[];
}) {
  const {
    chinese: font,
    latin: selectedLatin,
    defaultChinese,
  } = useContext(FontContext);
  const theme = useContext(ThemeContext);
  const ink = handwritingAt(item, time);
  const schedule = useMemo(
    () =>
      handwritingRuns(item.text, font, selectedLatin, {
        chinese: defaultChinese,
        latin,
      }),
    [item.text, font, selectedLatin, defaultChinese],
  );
  // The bundled Chinese paths are a course-specific subset. Other courses
  // must still render their text; missing paths use deterministic progressive
  // handwritten-font fallback, never an invisible or suddenly complete line.
  return (
    <span className="handwritten-line" aria-label={item.text}>
      <span className="handwriting-runs" aria-hidden="true">
        {schedule.runs.map((run, index) =>
          run.script === 'fallback' ? (
            <span
              key={`${index}-fallback`}
              data-handwriting-script="fallback"
              style={{
                fontFamily: `"${font.family}", var(--font-hand, 'Kaiti SC'), cursive`,
              }}
            >
              {Array.from(run.text).map((char, index) => (
                <span
                  key={index}
                  className="handwriting-fallback"
                  style={{
                    opacity: speechTiming
                      ? speechTiming[run.start + index].endAt ===
                        speechTiming[run.start + index].at
                        ? Number(time >= speechTiming[run.start + index].at)
                        : clamp01(
                            (time - speechTiming[run.start + index].at) /
                              (speechTiming[run.start + index].endAt -
                                speechTiming[run.start + index].at || 0.001),
                          )
                      : clamp01(
                          handwritingRunProgress(
                            run,
                            ink.writingProgress,
                            schedule.duration,
                          ) *
                            Array.from(run.text).length -
                            index,
                        ),
                  }}
                >
                  {char}
                </span>
              ))}
            </span>
          ) : (
            <InkRun
              key={`${index}-${run.script}-${theme}-${font.family}-${selectedLatin.family}`}
              run={run}
              font={
                run.script === 'latin'
                  ? selectedLatin
                  : run.script === 'latin-default'
                    ? latin
                    : run.script === 'chinese-default'
                      ? defaultChinese
                      : font
              }
              progress={
                speechTiming
                  ? speechHandwritingProgress(run, speechTiming, time)
                  : handwritingRunProgress(
                      run,
                      ink.writingProgress,
                      schedule.duration,
                    )
              }
            />
          ),
        )}
      </span>
      {underline && (
        <svg
          className="handwritten-underline"
          viewBox="0 0 240 12"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M3 7 C46 2, 78 10, 118 6 S198 4, 237 7"
            pathLength="1"
            style={{ strokeDashoffset: 1 - ink.underlineProgress }}
          />
        </svg>
      )}
    </span>
  );
}
export function HandDrawnX({ progress }: { progress: number }) {
  return (
    <svg className="discard-mark" viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M13 18 C36 37, 61 64, 88 84"
        pathLength="1"
        style={{ strokeDashoffset: 1 - clamp01(progress * 2) }}
      />
      <path
        d="M87 15 C67 39, 36 62, 12 87"
        pathLength="1"
        style={{ strokeDashoffset: 1 - clamp01(progress * 2 - 1) }}
      />
    </svg>
  );
}
export function HandDrawnCircle({ progress }: { progress: number }) {
  return (
    <svg className="found-circle" viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M53 7 C82 8, 95 25, 92 52 C89 79, 72 94, 46 92 C19 91, 5 72, 8 45 C11 19, 29 6, 53 7 Z"
        pathLength="1"
        style={{ strokeDashoffset: 1 - progress }}
      />
    </svg>
  );
}
export function BoardMarks({
  marks,
  region,
  time,
}: {
  marks: BoardMark[];
  region: Region;
  time: number;
}) {
  return (
    <svg
      className="board-marks"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-label="板书标记"
    >
      {marks
        .filter((mark) => mark.region === region)
        .map((mark) => {
          const [a, b, c] = mark.points;
          const progress = clamp01((time - mark.at) / 0.8);
          const style = { strokeDashoffset: 1 - progress };
          if (mark.kind === 'highlight')
            return (
              <rect
                key={mark.id}
                data-mark={mark.id}
                x={Math.min(a.x, b.x)}
                y={Math.min(a.y, b.y)}
                width={Math.abs(a.x - b.x)}
                height={Math.abs(a.y - b.y)}
                className="board-highlight"
                style={{ opacity: progress * 0.35 }}
              />
            );
          if (mark.kind === 'circle')
            return (
              <ellipse
                key={mark.id}
                data-mark={mark.id}
                cx={(a.x + b.x) / 2}
                cy={(a.y + b.y) / 2}
                rx={Math.abs(a.x - b.x) / 2}
                ry={Math.abs(a.y - b.y) / 2}
                pathLength="1"
                style={style}
              />
            );
          const path =
            mark.kind === 'curve'
              ? `M${a.x} ${a.y} Q${b.x} ${b.y} ${c.x} ${c.y}`
              : `M${a.x} ${a.y} L${b.x} ${b.y}`;
          return (
            <g key={mark.id} data-mark={mark.id}>
              <path d={path} pathLength="1" style={style} />
              {mark.kind === 'arrow' && (
                <path
                  d={`M${b.x - 2} ${b.y - 2} L${b.x} ${b.y} L${b.x - 2} ${b.y + 2}`}
                  transform={`rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI} ${b.x} ${b.y})`}
                  style={{ opacity: progress }}
                />
              )}
            </g>
          );
        })}
    </svg>
  );
}
export function BoardRenderer({
  items,
  marks = [],
  time,
}: {
  items: BoardItem[];
  marks?: BoardMark[];
  time: number;
}) {
  return (
    <div
      className="board-notes"
      aria-live="polite"
      style={
        items.some((item) => item.position) || marks.length
          ? { minHeight: 360 }
          : undefined
      }
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`board-note tone-${item.tone}${item.kind === 'formula' ? ' board-formula' : ''}`}
          style={
            {
              '--order': index,
              ...(item.position
                ? {
                    position: 'absolute',
                    left: `${item.position.x}%`,
                    top: `${item.position.y}%`,
                  }
                : {}),
            } as React.CSSProperties
          }
        >
          <HandwrittenLine item={item} time={time} />
        </div>
      ))}
      <BoardMarks marks={marks} region="notes" time={time} />
    </div>
  );
}
