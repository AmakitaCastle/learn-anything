import { loadLessonVisualRegistry } from '../capabilities/player.ts';
import { createRoot } from 'react-dom/client';
import { ClassroomPlayer } from '@learn-anything/lesson-player';
import { parseLesson } from '@learn-anything/lesson-schema';
import '@learn-anything/lesson-player/styles.css';
import './styles.css';
import {
  DEFAULT_FONTS,
  parseFontSelection,
  type ChineseFontLoader,
} from '@learn-anything/lesson-player/fonts';

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
  const params = new URLSearchParams(location.search);
  const loadChineseFont: ChineseFontLoader = async (id) => {
    const response = await fetch(`./fonts/${id}.json`);
    if (!response.ok) throw new Error('字体载入失败。');
    return response.json();
  };
  if (params.get('video') === '1') {
    const { mountVideo } = await import('./export');
    const theme = new URLSearchParams(location.search).get('theme') ?? 'light';
    if (theme !== 'light' && theme !== 'dark')
      throw new Error('视频配色无效。');
    const fonts = parseFontSelection({
      chinese: params.get('font-chinese') ?? DEFAULT_FONTS.chinese,
      latin: params.get('font-latin') ?? DEFAULT_FONTS.latin,
    });
    await mountVideo(root, lesson, registry, theme, fonts, loadChineseFont);
  } else {
    const saved = await fetch('./font-preferences.json');
    const initialFonts = saved.ok
      ? parseFontSelection(await saved.json())
      : { ...DEFAULT_FONTS };
    root.render(
      <ClassroomPlayer
        lesson={lesson}
        registry={registry}
        initialFonts={initialFonts}
        loadChineseFont={loadChineseFont}
        onFontSelectionChange={async (fonts) => {
          const response = await fetch('./font-preferences.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fonts),
          });
          if (!response.ok) throw new Error('无法保存字体偏好。');
        }}
      />,
    );
  }
}
load().catch(() =>
  root.render(<p role="alert">课程载入失败，请检查终端输出并重新打开课程。</p>),
);
