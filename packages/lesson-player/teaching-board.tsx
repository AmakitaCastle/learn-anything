import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  teachingLines,
  type TeachingLine,
  type TeachingSegment,
} from '@learn-anything/lesson-schema';
import {
  BoardMarks,
  BoardRenderer,
  HandwrittenLine,
  clamp01,
} from './board/index.tsx';
import { classroomAt, type PreparedLesson } from './runtime.ts';
import { drawnCirclePath } from './board/circle.ts';

const Sentence = memo(function Sentence({
  line,
  time,
  current,
}: {
  line: TeachingLine;
  time: number;
  current: boolean;
}) {
  const chars = Array.from(line.text);
  const parts: { start: number; end: number; at?: number }[] = [];
  let start = 0;
  for (const mark of line.emphasis) {
    if (start < mark.start) parts.push({ start, end: mark.start });
    parts.push(mark);
    start = mark.end;
  }
  if (start < chars.length) parts.push({ start, end: chars.length });
  return (
    <p
      className="narration-line"
      data-follow-target={line.id}
      aria-current={current ? 'step' : undefined}
    >
      {parts.map((part) => (
        <span
          key={part.start}
          className={
            part.at === undefined
              ? 'speech-phrase'
              : 'speech-phrase speech-emphasis'
          }
        >
          <HandwrittenLine
            item={{
              id: `${line.id}-${part.start}`,
              text: chars.slice(part.start, part.end).join(''),
              at: line.at,
              tone: 'plain',
            }}
            speechTiming={line.timing.slice(part.start, part.end)}
            time={time}
          />
          {part.at !== undefined && (
            <svg
              className="phrase-circle"
              viewBox="0 0 100 40"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d={drawnCirclePath(clamp01((time - part.at) / 0.65))} />
            </svg>
          )}
        </span>
      ))}
    </p>
  );
});

function sentenceTime(line: TeachingLine, time: number): number {
  const completedAt = Math.max(
    ...line.timing.map((span) => span.endAt),
    ...line.emphasis.map((mark) => mark.at + 0.65),
  );
  return Math.min(time, completedAt);
}

export function TeachingBoard({
  prepared,
  time,
  playing,
}: {
  prepared: PreparedLesson;
  time: number;
  playing: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [resume, setResume] = useState(0);
  const segments = prepared.lesson.teaching!;
  const planned = useMemo(
    () =>
      segments.map((segment) => ({ segment, lines: teachingLines(segment) })),
    [segments],
  );
  const current = planned.findLast(({ segment }) => segment.at <= time);
  const currentLine = current?.lines.findLast((line) => line.at <= time);
  const target = currentLine?.id;
  const frame = classroomAt(prepared, time);
  const groups = useMemo(() => {
    const groups: {
      id: string;
      visualId?: string;
      entries: { segment: TeachingSegment; lines: TeachingLine[] }[];
    }[] = [];
    for (const entry of planned) {
      const id = entry.segment.visualId
        ? `visual-${entry.segment.visualId}`
        : `text-${entry.segment.id}`;
      const previous = groups.find((group) => group.id === id);
      if (previous) previous.entries.push(entry);
      else
        groups.push({ id, visualId: entry.segment.visualId, entries: [entry] });
    }
    return groups;
  }, [planned]);

  useEffect(() => {
    const manual = () => setFollowing(false);
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          'button,input,select,[role="slider"],[contenteditable]',
        )
      )
        return;
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          ' ',
        ].includes(event.key)
      )
        manual();
    };
    const onPointer = (event: PointerEvent) => {
      if (event.clientX >= document.documentElement.clientWidth) manual();
    };
    window.addEventListener('wheel', manual, { passive: true });
    window.addEventListener('touchmove', manual, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('wheel', manual);
      window.removeEventListener('touchmove', manual);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  useEffect(() => {
    if (!following || !target) return;
    const line = Array.from(
      container.current?.querySelectorAll<HTMLElement>(
        '[data-follow-target]',
      ) ?? [],
    ).find((element) => element.dataset.followTarget === target);
    if (!line) return;
    const rect = line.getBoundingClientRect();
    const bottom = window.innerHeight - 155;
    if (rect.top >= 30 && rect.bottom <= bottom) return;
    window.scrollTo({
      top: Math.max(0, window.scrollY + rect.top - 70),
      behavior: 'instant',
    });
  }, [target, following, resume, playing]);

  return (
    <div className="teaching-board" ref={container} data-following={following}>
      {groups
        .filter((group) =>
          group.entries.some(({ segment }) => segment.at <= time),
        )
        .map((group) => {
          const visible = group.entries.filter(
            ({ segment }) => segment.at <= time,
          );
          const boardIds = new Set(
            group.entries.flatMap(({ segment }) => segment.boardIds),
          );
          const markIds = new Set(
            group.entries.flatMap(({ segment }) => segment.markIds),
          );
          const visual = frame.visuals.find(
            (visual) => visual.id === group.visualId,
          );
          const marks = frame.marks.filter((mark) => markIds.has(mark.id));
          return (
            <section
              key={group.id}
              className={`teaching-group${visual ? ' has-diagram' : ''}`}
              data-teaching-group={group.id}
              data-current={
                current?.segment.visualId
                  ? current.segment.visualId === group.visualId
                  : current?.segment.id === visible[0].segment.id
              }
            >
              {visual && (
                <div className="teaching-diagram">
                  <div
                    data-visual-id={visual.id}
                    data-grammar={visual.grammar.id}
                  >
                    <visual.grammar.Renderer
                      config={visual.config}
                      state={visual.state}
                      time={time}
                    />
                  </div>
                  <BoardMarks marks={marks} region="diagram" time={time} />
                </div>
              )}
              <div className="teaching-writing" aria-label="完整旁白板书">
                {visible.map(({ segment, lines }) => (
                  <section key={segment.id} data-teaching-segment={segment.id}>
                    <h2>
                      <HandwrittenLine
                        item={{
                          id: `${segment.id}-heading`,
                          text: segment.label,
                          at: segment.at,
                          tone: 'accent',
                        }}
                        time={time}
                      />
                    </h2>
                    {lines
                      .filter((line) => line.at <= time)
                      .map((line) => (
                        <Sentence
                          key={line.id}
                          line={line}
                          time={sentenceTime(line, time)}
                          current={line.id === target}
                        />
                      ))}
                  </section>
                ))}
                <BoardRenderer
                  items={frame.board.filter((item) => boardIds.has(item.id))}
                  marks={marks.filter((mark) => mark.region === 'notes')}
                  time={time}
                />
              </div>
            </section>
          );
        })}
      {!following && (
        <button
          type="button"
          className="resume-follow"
          onClick={() => {
            setFollowing(true);
            setResume((value) => value + 1);
          }}
        >
          回到当前讲解
        </button>
      )}
    </div>
  );
}
