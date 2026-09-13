import ClassroomDemo from '../../../examples/classroom-demo';
import { searchFlowLesson } from '../../../examples/search-flow/lesson';
import { stateLesson, plotLesson } from '../../../examples/grammar-fixtures';
import { binarySearchLesson } from '../../../examples/binary-search/lesson';
import data from '../../../public/lessons/binary-search-doubao.json';
import type { LessonSpec } from '../../../lib/lesson';
const catalog = {
  array: binarySearchLesson(data as LessonSpec),
  flow: searchFlowLesson,
  state: stateLesson,
  plot: plotLesson,
};
export default async function ArchivedExample({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const view = (await searchParams).view;
  const initial = view && view in catalog ? view : 'array';
  return (
    <ClassroomDemo
      catalog={catalog}
      initial={initial}
      choices={[
        { value: 'array', label: '数组视角' },
        { value: 'flow', label: '流程视角' },
        { value: 'state', label: '状态转换' },
        { value: 'plot', label: '范围曲线' },
      ]}
    />
  );
}
