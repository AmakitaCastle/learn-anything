import ClassroomDemo from '../../../examples/classroom-demo';
import {
  waterFlowLesson,
  waterStateLesson,
} from '../../../examples/water-cycle/lesson';
const catalog = { flow: waterFlowLesson, state: waterStateLesson };
export default function FlowExample() {
  return (
    <ClassroomDemo
      catalog={catalog}
      choices={[
        { value: 'flow', label: '水循环路径' },
        { value: 'state', label: '位置与状态' },
      ]}
    />
  );
}
