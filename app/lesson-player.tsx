'use client';
import { loadLessonVisualRegistry } from '../capabilities/player.ts';
import type { VisualRegistry } from '@learn-anything/lesson-player/runtime';
import { useEffect, useRef, useState } from 'react';
import {
  ClassroomPlayer,
  type ClassroomHandle,
} from '@learn-anything/lesson-player';
import type { LessonSpec } from '@learn-anything/lesson-schema';
// Demo integration only. The reusable player never registers global tools.
export default function LessonPlayer({ lesson }: { lesson: LessonSpec }) {
  const ref = useRef<ClassroomHandle>(null);
  const [loaded, setLoaded] = useState<{
    lesson: LessonSpec;
    registry: VisualRegistry;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<LessonSpec | null>(null);
  const registry = loaded?.lesson === lesson ? loaded.registry : null;
  useEffect(() => {
    let active = true;
    loadLessonVisualRegistry(lesson.visuals.map((visual) => visual.grammar))
      .then((value) => {
        if (active) setLoaded({ lesson, registry: value });
      })
      .catch(() => {
        if (active) setFailedFor(lesson);
      });
    return () => {
      active = false;
    };
  }, [lesson]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
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
          execute(input: unknown) {
            const seconds =
              input && typeof input === 'object' && 'seconds' in input
                ? input.seconds
                : null;
            if (
              typeof seconds !== 'number' ||
              !Number.isFinite(seconds) ||
              seconds < 0 ||
              seconds > lesson.duration
            )
              throw new Error('跳转时间超出课堂范围。');
            ref.current?.seek(seconds);
            return {
              seconds,
              chapterId: lesson.chapters.findLast(
                (chapter) => chapter.at <= seconds,
              )?.id,
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [lesson]);
  if (failedFor === lesson)
    return <p role="alert">课程绘制能力载入失败，请刷新页面。</p>;
  if (!registry) return <output>正在准备课程画面…</output>;
  return <ClassroomPlayer ref={ref} lesson={lesson} registry={registry} />;
}
