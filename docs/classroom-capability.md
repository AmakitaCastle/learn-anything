# 可复用课堂能力：ClassroomPlayer

对外是一项完整能力：输入已编译课程和固定音频，输出语音、动态板书、概念动画同步运行的课堂。内部保持协议、统一时钟、板书渲染和动画注册四个边界，不把二分查找或语音服务写进播放器。

## 与里程碑的关系

本次推进 `v0.1.0 — Classroom Player` 的引擎抽象。上游 TTS、语义锚点和课堂编译仍属于第三阶段；主题生成课程属于第四阶段。本次不实现 AI 备课、不自动发布、不要求 API Key 才能播放示例，也不是 npm 发布流程。

按用户确认的流水线，LLM／人工先生成文稿材料，`content-generator` 编译材料，播放器只消费编译产物。TTS 和对齐保持在编译阶段，不进入播放器；统一 `LessonDraft` 与 `compileLessonDraft()` 通用入口已实现，见[材料与编译说明](./lesson-draft.md)；LLM 备课由独立 `lesson-draft-generator` 实现，真实模型稳定性与教学质量仍需验证。

```text
已编译 LessonSpec + 音频资源
               ↓
       ClassroomClock（audio.currentTime）
        ├─ 固定音频
        ├─ BoardRenderer
        └─ 已注册 VisualGrammar
               ↓
       可暂停、跳转、重播和恢复的课堂
```

## 文件边界

| 位置 | 职责 |
| --- | --- |
| `packages/lesson-schema/` | `LessonSpec 0.1.0`、受约束的事件和运行时校验 |
| `packages/lesson-player/` | 公共组件、播放控制、统一时钟和确定性状态重建 |
| `packages/lesson-player/board/` | 中英混排手写、分步公式、下划线及图形标记 |
| `packages/lesson-player/grammars/` | 注册式数组、流程、状态转换和曲线轨道 |
| `packages/content-generator/` | 独立上游项目：语音、对齐、课程编译与产物输出 |
| `examples/binary-search/` | 旧课程转新协议；专用内容和旧书写时刻只在这里 |
| `examples/search-flow/` | 第二种纯数据课程：流程视角，无数组协议 |
| `examples/water-cycle/` | 独立自然科学主题：新旁白、板书与循环路径/状态数据 |
| `examples/grammar-fixtures.ts` | 状态转换和范围减半曲线的最小示例数据 |
| `app/lesson-player.tsx` | Demo 的网页工具集成，不是引擎实现 |
| `lib/tts/` | 旧调用的兼容转出口，实现在内容项目内 |

现已按用户要求项目化为两个可独立构建的 npm workspace：播放器自带控件、样式、字体和动画，内容生成使用 Node-only 配置。两者互不依赖，通过共享协议交接。仍未发布 npm 包或拆远程仓库，见[子项目架构](./module-architecture.md)。

## 调用能力

在客户端组件中导入：

```tsx
'use client';
import { useRef } from 'react';
import { ClassroomPlayer, type ClassroomHandle, type LessonSpec }
  from '@learn-anything/lesson-player';
import '@learn-anything/lesson-player/styles.css';

export function MyClassroom({ lesson }: { lesson: LessonSpec }) {
  const classroom = useRef<ClassroomHandle>(null);
  return <ClassroomPlayer ref={classroom} lesson={lesson} />;
}
```

通过工作区命名包调用，并导入播放器独立 CSS。若课程 JSON 位于 `public/`，在服务端读取/导入后把纯数据传入客户端，不从客户端模块直接导入 `public/` 下的资源。

控制接口：

- `play(): Promise<void>`、`pause()`。
- `seek(seconds)`：按音频时间跳转，范围限制在课程内。
- `restart()`：暂停并回到零秒，不残留旧板书/动画状态。
- `setSpeed(speed)`：允许 0.25～3；默认界面提供 0.75、1、1.25、1.5。
- `setMuted(boolean)`。
- `getSnapshot()`：当前时间、时长、播放状态、速度、静音、就绪状态和错误；挂载前为 `null`。
- `onPlaybackChange(snapshot)`：可选的播放状态回调。

更换 `lesson` 后是新的播放实例，旧音频暂停，回到零秒。不同实例各自拥有音频与时钟，不共享播放状态。音频加载失败、播放拒绝或实际时长与课程相差超过 0.3 秒时明确提示错误，不用另一条计时器继续播放无声课堂。

## 输入协议

新公共协议为 `schemaVersion: "0.1.0"`；旧版 `0.0.1` 继续用于原始课程与 TTS 对齐，通过 `binarySearchLesson()` 进入播放器。

必要字段：

- `id/title/eyebrow/duration/audio`，可选 `captions`。
- `chapters`、`narration`：真实音频上的秒数，按时间排列。
- `presentation`：标题、元信息、图示标题、推导标题、分隔线的内容与出现时刻。
- `visuals`：`id`、注册的 `grammar` 和纯 JSON 配置。
- `events`：已编译的真实时间事件，不是旧音频秒数或模型估计。

引擎没有必填的 `array`、`target`、二分查找标题或某个厂商的返回字段。音频/字幕允许本地绝对资源路径或 HTTPS，禁止脚本协议；课程不能包含可执行事件或任意组件代码。动画配置、事件、坐标、索引与引用在开始播放前校验，状态转换也预检完整执行顺序。

## 板书事件

```ts
{ at: 2, type: 'board.write', item: {
  id: 'step-1', text: 'low = mid + 1', tone: 'strong',
  kind: 'formula', underline: true
} }
{ at: 4, type: 'board.mark', mark: {
  id: 'arrow-1', kind: 'arrow', region: 'notes',
  points: [{ x: 10, y: 10 }, { x: 80, y: 40 }]
} }
{ at: 8, type: 'board.remove', id: 'arrow-1' }
```

`board.write` 使用稳定 ID；再次写同一 ID 会更新该条。默认按事件顺序布局，也可配置 `position: {x,y}`。公式是可分步写出的文本式公式，不宣称支持完整 LaTeX 排版。

`board.mark` 支持 `arrow/curve/circle/underline/highlight`，作用域为 `diagram/notes`，坐标范围 0～100。曲线需要起点、控制点和终点三个坐标，其他图形需要两个。图形进度只由传入的课堂时间决定。

原课中文笔画和 Caveat 英文/数字手写保留。当前中文字形包是原课子集：其他课程中没有笔画数据的文字采用按字渐显的手写字体回退，保证可见并可恢复，不冒充真实笔画动画；完整字形扩展另行处理。

## 内置动画语法

| Grammar | 配置 | 事件 |
| --- | --- | --- |
| `array-search` | 任意非空数值数组、显现/扫描时刻、规模轨迹 | `window/discard/found/focus` |
| `flow` | 带位置和显现时刻的节点、带方向的连线 | `activate/connect` |
| `state-transition` | 状态与允许的转换边 | `enter/transition` |
| `plot` | 横坐标递增的采样点、轴标签 | `reveal/highlight` |

所有动画都收到同一个 `time`；不得自己启动计时器。新增语法参考[扩展指南](./visual-grammars.md)。

## 示例与验证

- `/`：水循环新课，新旁白、板书与循环路径。
- `/examples/flow`：水循环；顶部可切换循环路径和位置/状态，验证换课。
- `/examples/binary-search`：原 Golden Demo 归档，保留数组、流程、状态和曲线视角供回归。

水循环是与二分查找无关的完整示例，用新课程数据、新旁白和已有公共组件播放，未增加主题专用动画语法。两个水循环视角共用这份新旁白；归档中的四种二分查找视角共用原旁白。它们不是自动生成所有学科课程的证明。新课生成与对齐边界见[水循环说明](./water-cycle.md)。

```bash
npm test
npm run lint
npm run typecheck
npm run build
VINEXT_NO_DEV_LOCK=1 npm run test:browser
```

单元检查覆盖独立主题、自定义语法、不安全事件拒绝、全部内置语法状态与真实服务端渲染、重播、板书图形和音频时钟。浏览器检查覆盖实际音频控制、手写冻结、不同视角的 seek/重播，以及正在播放时换课后的清理。科学课程的人工教学质量验收、低置信度语音时间戳的人工核对与 npm 发布不在这些自动检查的证明范围内。

## 本次验收记录

2026-09-12，首次课堂能力封装的本地验收已执行（随后更换水循环例子的验收另记在[水循环说明](./water-cycle.md)）：

- 37 项单元测试通过：公共协议、自定义插件、真实内置语法渲染、无效数据拒绝、板书标记、音频时钟和旧课适配。
- 16 项实际 Chromium 浏览器测试通过：播放、暂停、进度跳转、倍速、静音、重播、换课清理、公开控制接口的 Demo 集成，以及画面的像素级恢复。
- 代码检查、类型检查与生产构建通过；生产入口保留 Worker `fetch` 导出。
- 原课中文和 Caveat 英文/数字手写、部分笔画进度、移动屏幕布局通过回归。
- 浏览器使用真实 MP3 时间，测试时静音；课堂画面比较排除浮动控制栏的鼠标悬停/焦点效果，不排除板书或动画内容。
- 本地首页、示例页、MP3 和字幕资源均返回 HTTP 200。未调用额外 TTS、未对外发布。
- 扫描公开资源与构建产物共 340 个文件，未发现配置中的语音密钥。

这是本次可复用能力的工程验收，不是完整第二阶段的跨学科教学质量或开源发布验收。
