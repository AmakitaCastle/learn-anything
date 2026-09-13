import { loadLessonVisualRegistry } from '../capabilities/player.ts';
import { createRoot } from 'react-dom/client';
import { ClassroomPlayer } from '@learn-anything/lesson-player';
import { parseLesson } from '@learn-anything/lesson-schema';
import '@learn-anything/lesson-player/styles.css';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
async function load() {
  const response = await fetch('./lesson.json');
  if (!response.ok) throw new Error('课程载入失败。');
  const lesson = parseLesson(await response.json());
  document.title = `${lesson.title} · learnAnything`;
  // Font paths come from the compiled lesson, never environment configuration.
  if (lesson.handwriting) {
    const font = new FontFace(
      lesson.handwriting.family,
      `url("${lesson.handwriting.fontUrl}")`,
    );
    await font.load();
    document.fonts.add(font);
    document.documentElement.style.setProperty(
      '--font-hand',
      `"${lesson.handwriting.family}"`,
    );
  }
  const registry = await loadLessonVisualRegistry(
    lesson.visuals.map((visual) => visual.grammar),
  );
  root.render(<ClassroomPlayer lesson={lesson} registry={registry} />);
}
load().catch(() =>
  root.render(<p role="alert">课程载入失败，请检查终端输出并重新打开课程。</p>),
);
