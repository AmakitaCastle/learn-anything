'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, SkipBack, Volume2, VolumeX } from 'lucide-react';
import { TegakiRenderer } from 'tegaki';

import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';
import handwritingBundle from '@/lib/tegaki-font/bundle';
import {
  activeNarrationIndex,
  formatTime,
  frameAt,
  handwritingAt,
  type BoardItem,
  type LessonSpec,
} from '@/lib/lesson';

type LessonPlayerProps = {
  lesson: LessonSpec;
};

const SPEEDS = [0.75, 1, 1.25, 1.5];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function HandwrittenLine({
  item,
  time,
  underline = false,
}: {
  item: BoardItem;
  time: number;
  underline?: boolean;
}) {
  const handwriting = handwritingAt(item, time);

  return (
    <span className="handwritten-line" aria-label={item.text}>
      <TegakiRenderer
        as="span"
        aria-hidden="true"
        className="tegaki-text"
        font={handwritingBundle}
        time={{
          mode: 'controlled',
          value: handwriting.writingProgress,
          unit: 'progress',
        }}
        timing={{
          glyphGap: 0.035,
          wordGap: 0.08,
          lineGap: 0.12,
          deferDots: false,
        }}
        effects={{
          pressureWidth: { strength: 0.42 },
          taper: { startLength: 0.06, endLength: 0.1 },
          wobble: { amplitude: 0.28, frequency: 6, mode: 'noise' },
        }}
        quality={{ smoothing: true, pixelRatio: 1.25, segmentSize: 1.6 }}
      >
        {item.text}
      </TegakiRenderer>
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
            style={{ strokeDashoffset: 1 - handwriting.underlineProgress }}
          />
        </svg>
      )}
    </span>
  );
}

function HandDrawnX({ progress }: { progress: number }) {
  const first = clamp01(progress * 2);
  const second = clamp01(progress * 2 - 1);
  return (
    <svg className="discard-mark" viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M13 18 C36 37, 61 64, 88 84"
        pathLength="1"
        style={{ strokeDashoffset: 1 - first }}
      />
      <path
        d="M87 15 C67 39, 36 62, 12 87"
        pathLength="1"
        style={{ strokeDashoffset: 1 - second }}
      />
    </svg>
  );
}

function HandDrawnCircle({ progress }: { progress: number }) {
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

export default function LessonPlayer({ lesson }: LessonPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastTimeRef = useRef(0);
  const seekActionRef = useRef<(nextTime: number) => void>(() => undefined);
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);

  const frame = useMemo(() => frameAt(lesson, time), [lesson, time]);
  const narrationIndex = activeNarrationIndex(lesson, time);
  const discardAt =
    lesson.events.find((event) => event.type === 'array.discard')?.at ?? 0;
  const foundAt =
    lesson.events.find((event) => event.type === 'array.found')?.at ?? 0;
  const activeWindowEvent = lesson.events.findLast(
    (event) => event.type === 'array.window' && event.at <= time,
  );
  const windowAt = activeWindowEvent?.at ?? 0;
  const windowInk = activeWindowEvent ? clamp01((time - windowAt) / 0.8) : 0;
  const windowStart =
    frame.low === 4 ? (4 / lesson.array.length) * windowInk : 0;

  useEffect(() => {
    if (!isPlaying) return;
    let animationFrame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const nextTime = audio.currentTime;
      lastTimeRef.current = nextTime;
      setTime(nextTime);
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying]);

  const play = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime >= lesson.duration - 0.15) {
      audio.currentTime = 0;
      lastTimeRef.current = 0;
      setTime(0);
    }
    audio.playbackRate = speed;
    await audio.play();
    setIsPlaying(true);
  };

  const pause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) pause();
    else void play();
  };

  const seekTo = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(nextTime, lesson.duration));
    audio.currentTime = clamped;
    lastTimeRef.current = clamped;
    setTime(clamped);
  };

  const restart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    lastTimeRef.current = 0;
    setTime(0);
    setIsPlaying(false);
  };

  const changeSpeed = (nextSpeed: number) => {
    setSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  useEffect(() => {
    seekActionRef.current = seekTo;
  });

  useEffect(() => {
    const modelContext = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: {
              name: string;
              title: string;
              description: string;
              inputSchema: object;
              annotations: {
                readOnlyHint: boolean;
                untrustedContentHint: boolean;
              };
              execute: (input: unknown) => unknown;
            },
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;

    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(
      modelContext.registerTool(
        {
          name: 'navigate_lesson',
          title: '跳转课程',
          description: '把动态课程跳转到指定秒数，并重建当时的动画和板书状态。',
          inputSchema: {
            type: 'object',
            properties: {
              seconds: { type: 'number', minimum: 0, maximum: lesson.duration },
            },
            required: ['seconds'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            if (
              typeof input !== 'object' ||
              input === null ||
              typeof (input as { seconds?: unknown }).seconds !== 'number'
            ) {
              throw new TypeError('seconds 必须是数字');
            }
            const seconds = (input as { seconds: number }).seconds;
            if (
              !Number.isFinite(seconds) ||
              seconds < 0 ||
              seconds > lesson.duration
            ) {
              throw new RangeError(
                `seconds 必须在 0 到 ${lesson.duration} 之间`,
              );
            }
            seekActionRef.current(seconds);
            return {
              seconds,
              chapterId: frameAt(lesson, seconds).chapterId,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [lesson]);

  return (
    <main className="classroom-shell">
      <audio
        ref={audioRef}
        src={lesson.audio}
        preload="auto"
        muted={muted}
        onEnded={() => {
          setTime(lesson.duration);
          setIsPlaying(false);
        }}
      >
        <track
          kind="captions"
          src="/lessons/binary-search-zh.vtt"
          srcLang="zh-CN"
          label="中文"
        />
      </audio>

      <section className="paper-board" aria-label="二分查找全屏手写板">
        <header className="paper-heading">
          <h1>
            <HandwrittenLine
              item={{
                at: 0.15,
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
                at: 1.9,
                id: 'lesson-meta',
                text: `${lesson.eyebrow.replace(' · ', ' ')} 目标值 ${lesson.target}`,
                tone: 'plain',
              }}
              time={time}
            />
          </div>
        </header>

        <div className="board-flow">
          <section className="board-diagram" aria-label="二分查找手绘图示">
            <div className="stage-topline">
              <HandwrittenLine
                item={{
                  at: 2.45,
                  id: 'search-space-title',
                  text: `在有序数组中找 ${lesson.target}`,
                  tone: 'label',
                }}
                time={time}
              />
            </div>

            <div className={`array-scene focus-${frame.focus}`}>
              {frame.focus === 'linear' && (
                <div
                  className="linear-scanner"
                  style={{
                    left: `${clamp01((time - 7.852) / 9.236) * 86}%`,
                    opacity: clamp01((time - 7.852) / 0.32),
                  }}
                />
              )}
              <div className="pointer-row" aria-hidden="true">
                {lesson.array.map((value, index) => (
                  <div key={`pointer-${value}`}>
                    {frame.low === index && (
                      <span
                        className="pointer low"
                        style={
                          {
                            '--pointer-ink': clamp01((time - windowAt) / 0.45),
                          } as React.CSSProperties
                        }
                      >
                        <HandwrittenLine
                          item={{
                            at: windowAt,
                            id: `low-${windowAt}`,
                            text: 'low',
                            tone: 'label',
                          }}
                          time={time}
                        />
                      </span>
                    )}
                    {frame.mid === index && (
                      <span
                        className="pointer mid"
                        style={
                          {
                            '--pointer-ink': clamp01(
                              (time - (windowAt + 0.18)) / 0.45,
                            ),
                          } as React.CSSProperties
                        }
                      >
                        <HandwrittenLine
                          item={{
                            at: windowAt + 0.18,
                            id: `mid-${windowAt}`,
                            text: 'mid',
                            tone: 'label',
                          }}
                          time={time}
                        />
                      </span>
                    )}
                    {frame.high === index && (
                      <span
                        className="pointer high"
                        style={
                          {
                            '--pointer-ink': clamp01(
                              (time - (windowAt + 0.36)) / 0.45,
                            ),
                          } as React.CSSProperties
                        }
                      >
                        <HandwrittenLine
                          item={{
                            at: windowAt + 0.36,
                            id: `high-${windowAt}`,
                            text: 'high',
                            tone: 'label',
                          }}
                          time={time}
                        />
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="number-array">
                {lesson.array.map((value, index) => {
                  const isDiscarded = frame.discarded.includes(index);
                  const isFound = frame.found === index;
                  const appearAt = 3 + index * 0.23;
                  const appear = clamp01((time - appearAt) / 0.48);
                  const discardInk = clamp01((time - discardAt) / 0.7);
                  const opacity =
                    appear * (isDiscarded ? 1 - discardInk * 0.72 : 1);
                  return (
                    <div
                      key={value}
                      className={[
                        'number-cell',
                        isDiscarded ? 'is-discarded' : '',
                      ].join(' ')}
                      style={{
                        opacity,
                        clipPath: `inset(0 ${100 - appear * 100}% 0 0)`,
                      }}
                    >
                      <span className="cell-index">{index}</span>
                      <strong>
                        <HandwrittenLine
                          item={{
                            at: appearAt,
                            id: `value-${value}`,
                            text: String(value),
                            tone: 'plain',
                          }}
                          time={time}
                        />
                      </strong>
                      {isDiscarded && <HandDrawnX progress={discardInk} />}
                      {isFound && (
                        <HandDrawnCircle
                          progress={clamp01((time - foundAt) / 0.9)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {activeWindowEvent && (
                <div
                  className="range-bracket"
                  aria-hidden="true"
                  style={{ paddingLeft: `${windowStart * 100}%` }}
                >
                  <span style={{ '--ink': windowInk } as React.CSSProperties} />
                </div>
              )}
            </div>

            {frame.focus === 'scale' && (
              <div className="halving-trail" aria-label="范围逐步减半">
                {[1_000_000, 500_000, 250_000, 125_000, 1].map(
                  (value, index) => (
                    <span
                      key={value}
                      style={
                        {
                          '--step': index,
                          opacity: clamp01(
                            (time - (76.2 + index * 0.55)) / 0.38,
                          ),
                          clipPath: `inset(0 ${100 - clamp01((time - (76.2 + index * 0.55)) / 0.38) * 100}% 0 0)`,
                        } as React.CSSProperties
                      }
                    >
                      {value.toLocaleString('en-US')}
                    </span>
                  ),
                )}
              </div>
            )}
          </section>

          <section className="board-writing" aria-label="逐步手写推导">
            <div className="board-header">
              <HandwrittenLine
                item={{
                  at: 0.8,
                  id: 'derivation-title',
                  text: '推导过程',
                  tone: 'accent',
                }}
                time={time}
                underline
              />
            </div>
            <div
              className="chalk-rule"
              style={
                { '--ink': clamp01((time - 1.5) / 0.75) } as React.CSSProperties
              }
            />
            <div className="board-notes" aria-live="polite">
              {frame.board.map((item, index) => (
                <div
                  key={item.id}
                  className={`board-note tone-${item.tone}`}
                  style={{ '--order': index } as React.CSSProperties}
                >
                  <HandwrittenLine
                    item={item}
                    time={time}
                    underline={
                      item.id === 'invariant-rule' || item.id === 'complexity'
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="player-dock" aria-label="课程播放控制">
        <div className="timeline-control">
          <div className="timeline-meta">
            <span>{formatTime(time)}</span>
            <span className="narration-state">
              {lesson.chapters.find(
                (chapter) => chapter.id === frame.chapterId,
              )?.label ?? `${narrationIndex + 1} / ${lesson.narration.length}`}
            </span>
            <span>{formatTime(lesson.duration)}</span>
          </div>
          <Slider
            aria-label="课程进度"
            min={0}
            max={lesson.duration}
            step={0.05}
            value={[time]}
            onValueChange={(value) =>
              seekTo(Array.isArray(value) ? (value[0] ?? 0) : value)
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
            onClick={restart}
            aria-label="重新开始"
            title="重新开始"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={() => seekTo(time - 10)}
            aria-label="后退十秒"
            title="后退十秒"
          >
            <SkipBack aria-hidden="true" />
            <span className="skip-number">10</span>
          </Button>
          <button
            type="button"
            className={isPlaying ? 'play-toggle is-playing' : 'play-toggle'}
            onClick={togglePlay}
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            <span className="play-icon" aria-hidden="true" />
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={() => setMuted((value) => !value)}
            aria-label={muted ? '打开声音' : '关闭声音'}
            title={muted ? '打开声音' : '关闭声音'}
          >
            {muted ? (
              <VolumeX aria-hidden="true" />
            ) : (
              <Volume2 aria-hidden="true" />
            )}
          </Button>
          <NativeSelect
            aria-label="播放速度"
            value={speed}
            onChange={(event) => changeSpeed(Number(event.target.value))}
          >
            {SPEEDS.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value}×
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </section>
    </main>
  );
}
