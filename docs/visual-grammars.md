# 如何新增动画语法

课程只能引用注册的语法 ID 与纯 JSON，不能携带 React 组件或执行脚本。插件是开发者编写并受审查的代码，不是模型输出。

## 最小定义

```tsx
import { number } from '@learn-anything/lesson-schema';
import {
  createVisualRegistry, registerGrammar, type VisualGrammar,
  ClassroomPlayer,
} from '@learn-anything/lesson-player';
import { defaultVisualRegistry } from '@learn-anything/lesson-player/grammars';
import '@learn-anything/lesson-player/styles.css';

const counter: VisualGrammar<null, { value: number }, number> = {
  id: 'counter',
  parseConfig: () => null,
  parseEvent(action, input) {
    if (action !== 'set') throw new Error('未知事件');
    return number(input, 0, 100);
  },
  initial: () => ({ value: 0 }),
  reduce: (_state, event) => ({ value: event.payload }),
  Renderer: ({ state }) => <p>{state.value}</p>,
};

const registry = createVisualRegistry([
  ...defaultVisualRegistry.values(), registerGrammar(counter),
]);
// <ClassroomPlayer lesson={lesson} registry={registry} />
```

这是接口教学 fixture，不是有教学质量承诺的概念动画。生产语法应通过变化解释概念。

对应课程数据：

```json
{
  "visuals": [{ "id": "count", "grammar": "counter", "config": null }],
  "events": [{
    "at": 2, "type": "visual", "visualId": "count",
    "action": "set", "payload": 3
  }]
}
```

以上是字段片段，需要放入完整的 `LessonSpec 0.1.0`。

## 插件约束

1. `parseConfig` 校验配置与时刻范围，`parseEvent` 校验动作、负载和引用。
2. `initial` 返回可克隆的状态，不持有音频、DOM、全局对象或订阅。
3. `reduce` 不修改传入状态/配置，返回新状态；输入已冻结。
4. `Renderer` 只由 `config/state/time` 推导画面。动画进度使用 `clamp((time - event.at) / duration)`，不启动独立 RAF、计时器或有历史依赖的随机抖动。
5. React 自动转义文本，禁止 `dangerouslySetInnerHTML`、`eval` 和动态执行课程脚本。
6. 新语法要附固定 fixture、初始/中间/结束状态、逆向 seek、重复渲染、无效输入与真实浏览器暂停/恢复检查。

实现参考 `packages/lesson-player/grammars/graph.tsx`、`array-search.tsx` 和 `plot.tsx`。`tests/visual-grammars.test.ts` 加载实际语法而非替代实现，`tests/browser/classroom-engine.spec.ts` 检查同一课堂组件上的不同轨道。

## plot：数据坐标与刻度

`plot` 通用配置可在 `LessonDraft.visuals[].config` 或已编译 `LessonSpec` 中使用：

```json
{
  "points": [{ "x": 0, "y": 20 }, { "x": 1, "y": 40 }, { "x": 2, "y": 50 }],
  "xLabel": "时间（分钟）",
  "yLabel": "温度（摄氏度）",
  "xAxis": { "min": 0, "max": 2, "ticks": [0, 1, 2] },
  "yAxis": { "min": 0, "max": 60, "ticks": [0, 20, 40, 60] },
  "grid": true
}
```

`xAxis/yAxis` 是可选配置，省略时仍使用旧课程的 0–100 范围，保证原数据点位置不变，但自动绘制刻度。每个轴的 `min/max` 也可省略，分别默认 0/100；省略 `ticks` 时按范围生成确定性的 1/2/2.5/5/10 系列步长刻度。`grid` 默认 false。这些字段是数据配置，不是时间锚点，编译器保留并预检，播放器负责坐标变换和刻度绘制；无须为不同主题新增 Renderer 或编译回调。

坐标端点必须是有限数，范围为 ±1e9，跨度至少 1e-9 且必须满足数值精度；`max > min`。自定义刻度需 1–21 个有限数，严格递增、不重复且在范围内。数据点必须在对应轴范围内，横坐标严格递增。支持负数、小数和大于 100 的真实单位。轴线、刻度与可选网格从开头显示，曲线 reveal/highlight 继续沿语音时间轴执行。
