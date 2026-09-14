import { flushSync } from 'react-dom';
import type { Root } from 'react-dom/client';
import {
  ClassroomSurface,
  prepareLesson,
  type LessonSpec,
  type VisualRegistry,
  type ClassroomTheme,
} from '@learn-anything/lesson-player';
import {
  HandwritingProvider,
  latinHandwritingBundle,
} from '@learn-anything/lesson-player/board';
import './export.css';

export type VideoFrameBridge = {
  duration: number;
  render(seconds: number): Promise<void>;
};
declare global {
  interface Window {
    lessonVideo?: VideoFrameBridge;
  }
}

// The renderer uses the same deterministic classroom state and handwriting
// as playback, but no audio timer, dock, manual scroll or wall-clock recording.
export async function mountVideo(
  root: Root,
  lesson: LessonSpec,
  registry: VisualRegistry,
  theme: ClassroomTheme = 'light',
) {
  const prepared = prepareLesson(lesson, registry);
  const bridge: VideoFrameBridge = {
    duration: lesson.duration,
    async render(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > lesson.duration)
        throw new Error('视频帧时间无效。');
      flushSync(() =>
        root.render(
          <HandwritingProvider bundle={lesson.handwriting} theme={theme}>
            <main
              className="classroom-shell video-frame"
              data-theme={theme}
              data-video-time={seconds}
              style={
                {
                  '--font-hand-latin': `"${latinHandwritingBundle.family}"`,
                } as React.CSSProperties
              }
            >
              <div className="video-content">
                <ClassroomSurface prepared={prepared} time={seconds} video />
              </div>
            </main>
          </HandwritingProvider>,
        ),
      );
      // Allow glyph measurement and canvas effects to commit before capture.
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const content = document.querySelector<HTMLElement>('.video-content')!;
      content.style.transform = 'none';
      const padding = 24;
      const width = Math.max(content.offsetWidth, content.scrollWidth);
      const height = Math.max(content.offsetHeight, content.scrollHeight);
      const scale = Math.min(
        1,
        (window.innerWidth - padding * 2) / width,
        (window.innerHeight - padding * 2) / height,
      );
      content.style.transform = `scale(${scale})`;
      content.style.left = `${(window.innerWidth - width * scale) / 2}px`;
      content.style.top = `${(window.innerHeight - height * scale) / 2}px`;
    },
  };
  await bridge.render(0);
  window.lessonVideo = bridge;
}
