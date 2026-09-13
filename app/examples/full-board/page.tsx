import LessonPlayer from '../../lesson-player';
import data from '../../../public/lessons/heating-full-board.json' with { type: 'json' };
import { parseLesson } from '../../../packages/lesson-schema/index';

const lesson = parseLesson(data);
export default function FullBoardExample() {
  return <LessonPlayer lesson={lesson} />;
}
