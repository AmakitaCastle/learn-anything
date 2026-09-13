import LessonPlayer from '../../lesson-player';
import data from '../../../public/lessons/heating-rate.json' with { type: 'json' };
import { parseLesson } from '../../../packages/lesson-schema/index';

const lesson = parseLesson(data);

export default function HeatingRateExample() {
  return <LessonPlayer lesson={lesson} />;
}
