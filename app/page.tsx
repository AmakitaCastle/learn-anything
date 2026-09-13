import LessonPlayer from '@/app/lesson-player';
import { waterFlowLesson } from '../examples/water-cycle/lesson';

export default function Home() {
  return <LessonPlayer lesson={waterFlowLesson} />;
}
