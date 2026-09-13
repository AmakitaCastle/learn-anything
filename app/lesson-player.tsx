'use client';
import { useEffect, useRef } from 'react';
import {
  ClassroomPlayer,
  type ClassroomHandle,
} from '@learn-anything/lesson-player';
import type { LessonSpec } from '@learn-anything/lesson-schema';
// Demo integration only. The reusable player never registers global tools.
export default function LessonPlayer({ lesson }: { lesson: LessonSpec }) {
  const ref = useRef<ClassroomHandle>(null);
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
  return <ClassroomPlayer ref={ref} lesson={lesson} />;
}
