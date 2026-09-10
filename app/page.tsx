import LessonPlayer from '@/app/lesson-player';
import lessonData from '@/public/lessons/binary-search.json';
import type { LessonSpec } from '@/lib/lesson';

const lesson = lessonData as LessonSpec;

export default function Home() {
  return <LessonPlayer lesson={lesson} />;
}
