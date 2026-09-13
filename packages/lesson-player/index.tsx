'use client';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RotateCcw, SkipBack, Volume2, VolumeX } from 'lucide-react';
import {
  Button,
  NativeSelect,
  NativeSelectOption,
  Slider,
} from './controls.tsx';
import { formatTime } from './timing.ts';
import {
  BoardMarks,
  BoardRenderer,
  HandwrittenLine,
  HandwritingProvider,
  clamp01,
  latinHandwritingBundle,
} from './board/index.tsx';
import { defaultVisualRegistry } from './grammars/index.ts';
import {
  ClassroomClock,
  initialPlayback,
  type PlaybackSnapshot,
} from './clock.ts';
import {
  classroomAt,
  prepareLesson,
  type PreparedLesson,
  type VisualRegistry,
} from './runtime.ts';
import type { LessonSpec } from '@learn-anything/lesson-schema';
import { TeachingBoard } from './teaching-board.tsx';
export { ClassroomClock, classroomAt, prepareLesson };
export { createVisualRegistry, registerGrammar } from './runtime.ts';
export type {
  VisualGrammar,
  VisualProps,
  VisualRegistry,
  ClassroomFrame,
} from './runtime.ts';
export type { LessonSpec, TimelineEvent } from '@learn-anything/lesson-schema';
export type { PlaybackSnapshot } from './clock.ts';
export type ClassroomHandle = {
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  restart(): void;
  setSpeed(speed: number): void;
  setMuted(muted: boolean): void;
  getSnapshot(): PlaybackSnapshot | null;
};
export type ClassroomPlayerProps = {
  lesson: LessonSpec;
  registry?: VisualRegistry;
  onPlaybackChange?: (snapshot: PlaybackSnapshot) => void;
};
export function ClassroomSurface({
  prepared,
  time,
  playing = false,
}: {
  prepared: PreparedLesson;
  time: number;
  playing?: boolean;
}) {
  const frame = classroomAt(prepared, time),
    { lesson } = prepared,
    p = lesson.presentation;
  return (
    <section className="paper-board" aria-label={`${lesson.title}全屏手写板`}>
      <header className="paper-heading">
        <h1>
          <HandwrittenLine
            item={{
              at: p.titleAt,
              id: 'lesson-title',
              text: lesson.title,
              tone: 'accent',
            }}
            time={time}
            underline
          />
        </h1>
        <div className="paper-meta">
          <HandwrittenLine
            item={{
              at: p.metaAt,
              id: 'lesson-meta',
              text: lesson.eyebrow,
              tone: 'plain',
            }}
            time={time}
          />
        </div>
      </header>
      {lesson.teaching ? (
        <TeachingBoard prepared={prepared} time={time} playing={playing} />
      ) : (
        <div className="board-flow">
          <section className="board-diagram" aria-label={p.diagramTitle}>
            <div className="stage-topline">
              <HandwrittenLine
                item={{
                  at: p.diagramTitleAt,
                  id: 'diagram-title',
                  text: p.diagramTitle,
                  tone: 'label',
                }}
                time={time}
              />
            </div>
            {frame.visuals.map((visual) => (
              <div
                key={visual.id}
                data-visual-id={visual.id}
                data-grammar={visual.grammar.id}
              >
                <visual.grammar.Renderer
                  config={visual.config}
                  state={visual.state}
                  time={time}
                />
              </div>
            ))}
            <BoardMarks marks={frame.marks} region="diagram" time={time} />
          </section>
          <section className="board-writing" aria-label="逐步手写推导">
            <div className="board-header">
              <HandwrittenLine
                item={{
                  at: p.notesTitleAt,
                  id: 'notes-title',
                  text: p.notesTitle,
                  tone: 'accent',
                }}
                time={time}
                underline
              />
            </div>
            <div
              className="chalk-rule"
              style={
                {
                  '--ink': clamp01((time - p.ruleAt) / 0.75),
                } as React.CSSProperties
              }
            />
            <BoardRenderer
              items={frame.board}
              marks={frame.marks.filter((mark) => mark.region === 'notes')}
              time={time}
            />
          </section>
        </div>
      )}
    </section>
  );
}
const PreparedPlayer = forwardRef<
  ClassroomHandle,
  {
    prepared: PreparedLesson;
    onPlaybackChange?: ClassroomPlayerProps['onPlaybackChange'];
  }
>(function PreparedPlayer({ prepared, onPlaybackChange }, ref) {
  const { lesson } = prepared;
  const audioRef = useRef<HTMLAudioElement>(null),
    clockRef = useRef<ClassroomClock | null>(null),
    callbackRef = useRef(onPlaybackChange);
  useEffect(() => {
    callbackRef.current = onPlaybackChange;
  }, [onPlaybackChange]);
  const [playback, setPlayback] = useState(() =>
    initialPlayback(lesson.duration),
  );
  const frame = useMemo(
    () => classroomAt(prepared, playback.time),
    [prepared, playback.time],
  );
  useEffect(() => {
    if (!audioRef.current) return;
    const clock = new ClassroomClock(audioRef.current, lesson.duration, {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
    });
    clockRef.current = clock;
    const unsubscribe = clock.subscribe((snapshot) => {
      setPlayback(snapshot);
      callbackRef.current?.(snapshot);
    });
    return () => {
      unsubscribe();
      clock.destroy();
      clockRef.current = null;
    };
  }, [lesson]);
  useImperativeHandle(
    ref,
    () => ({
      play: async () => {
        await clockRef.current?.play();
      },
      pause: () => clockRef.current?.pause(),
      seek: (seconds) => clockRef.current?.seek(seconds),
      restart: () => clockRef.current?.restart(),
      setSpeed: (speed) => clockRef.current?.setSpeed(speed),
      setMuted: (muted) => clockRef.current?.setMuted(muted),
      getSnapshot: () => clockRef.current?.getSnapshot() ?? null,
    }),
    [],
  );
  return (
    <HandwritingProvider bundle={lesson.handwriting}>
      <main
        className="classroom-shell"
        data-lesson-id={lesson.id}
        data-classroom-time={playback.time}
        data-classroom-ready={playback.ready}
        data-board-mode={lesson.teaching ? 'full-narration' : undefined}
        style={
          {
            '--font-hand-latin': `"${latinHandwritingBundle.family}"`,
          } as React.CSSProperties
        }
      >
        <audio ref={audioRef} src={lesson.audio} preload="auto">
          <track
            kind="captions"
            src={lesson.captions}
            srcLang="zh-CN"
            label="中文"
          />
        </audio>
        <ClassroomSurface
          prepared={prepared}
          time={playback.time}
          playing={playback.playing}
        />
        {playback.error && (
          <p role="alert" className="classroom-error">
            {playback.error}
          </p>
        )}
        <section className="player-dock" aria-label="课程播放控制">
          <div className="timeline-control">
            <div className="timeline-meta">
              <span>{formatTime(playback.time)}</span>
              <span className="narration-state">
                {lesson.chapters.find(
                  (chapter) => chapter.id === frame.chapterId,
                )?.label ??
                  `${frame.narrationIndex + 1} / ${lesson.narration.length}`}
              </span>
              <span>{formatTime(lesson.duration)}</span>
            </div>
            <Slider
              aria-label="课程进度"
              min={0}
              max={lesson.duration}
              step={0.05}
              value={[playback.time]}
              onValueChange={(value) =>
                clockRef.current?.seek(
                  Array.isArray(value) ? (value[0] ?? 0) : value,
                )
              }
            />
            <div className="chapter-ticks" aria-hidden="true">
              {lesson.chapters.slice(1).map((chapter) => (
                <span
                  key={chapter.id}
                  style={{ left: `${(chapter.at / lesson.duration) * 100}%` }}
                />
              ))}
            </div>
          </div>
          <div className="controls-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={() => clockRef.current?.restart()}
              aria-label="重新开始"
              title="重新开始"
            >
              <RotateCcw aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={() => clockRef.current?.seek(playback.time - 10)}
              aria-label="后退十秒"
              title="后退十秒"
            >
              <SkipBack aria-hidden="true" />
              <span className="skip-number">10</span>
            </Button>
            <button
              type="button"
              disabled={Boolean(playback.error)}
              className={
                playback.playing ? 'play-toggle is-playing' : 'play-toggle'
              }
              onClick={() =>
                playback.playing
                  ? clockRef.current?.pause()
                  : void clockRef.current?.play()
              }
              aria-label={playback.playing ? '暂停' : '播放'}
            >
              <span className="play-icon" aria-hidden="true" />
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              onClick={() => clockRef.current?.setMuted(!playback.muted)}
              aria-label={playback.muted ? '打开声音' : '关闭声音'}
              title={playback.muted ? '打开声音' : '关闭声音'}
            >
              {playback.muted ? (
                <VolumeX aria-hidden="true" />
              ) : (
                <Volume2 aria-hidden="true" />
              )}
            </Button>
            <NativeSelect
              aria-label="播放速度"
              value={playback.speed}
              onChange={(event) =>
                clockRef.current?.setSpeed(Number(event.target.value))
              }
            >
              {[0.75, 1, 1.25, 1.5].map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}×
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </section>
      </main>
    </HandwritingProvider>
  );
});
export const ClassroomPlayer = forwardRef<
  ClassroomHandle,
  ClassroomPlayerProps
>(function ClassroomPlayer(
  { lesson, registry = defaultVisualRegistry, onPlaybackChange },
  ref,
) {
  const result = useMemo(() => {
    try {
      return prepareLesson(lesson, registry);
    } catch {
      return null;
    }
  }, [lesson, registry]);
  if (!result)
    return (
      <p role="alert" className="classroom-error">
        课程数据或动画语法无效，无法播放。
      </p>
    );
  return (
    <PreparedPlayer
      key={JSON.stringify(result.lesson)}
      ref={ref}
      prepared={result}
      onPlaybackChange={onPlaybackChange}
    />
  );
});
