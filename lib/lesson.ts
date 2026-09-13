// Legacy-course compatibility only. New integrations use LessonSpec 0.1.0.
export * from '../packages/content-generator/legacy-lesson.ts';
export {
  formatTime,
  handwritingAt,
  type HandwritingFrame,
} from '../packages/lesson-player/timing.ts';
