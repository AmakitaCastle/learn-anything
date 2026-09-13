# 可扩展的板书与动画能力包

新增一种表现方式的目标是：**增加一个能力包目录，在 `capabilities/index.ts` 注册一次**。同一能力的新主题或新组合只新增 `LessonDraft` 数据。

## 一份注册，贯通整条流水线

```text
capabilities/index.ts（宿主唯一注册入口）
  ├─ lessonCapabilities → 备课的能力说明、材料校验、语义时间编译
  └─ loadRenderer      → 网页示例与独立终端播放器的绘制注册
```

三个业务模块保持独立，只依赖 `lesson-schema` 定义的能力协议，通过参数接收能力表。CLI 导入纯规则，不执行 React／JSX；浏览器准备播放器时只加载本课引用的绘制入口。课程只携带 JSON 和已注册能力 ID，不执行课程生成的代码。

现有四种内置能力提供默认兼容行为。宿主在它们基础上注册 `scene`，未来的新能力继续在同一个入口加入。`packages/lesson-player` 单独使用时仍提供原来的四种默认语法，外部宿主通过 `registry` 接入扩展。

## 能力包目录

参照 `capabilities/scene/`：

```text
capabilities/<name>/
  model.ts       数据校验、初始状态、纯状态变化、备课说明、时间字段
  renderer.tsx   只从 config / state / time 推导画面
  index.ts       导出纯能力描述和延迟加载的绘制入口
  README.md      表达任务、动作规则、材料示例和边界
```

能力协议在 `packages/lesson-schema/capabilities.ts`。`defineCapability()` 定义：

| 字段                         | 用途                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| `id` / `version`             | 稳定的能力标识与实现版本                                            |
| `draft.instructions`         | 选择场景、配置格式、合法动作与使用示例；自动进入模型提示            |
| `draft.timeFields`           | 配置中的语义时间路径，如 `['nodes', '*', 'at']`；`*` 只匹配数组下标 |
| `draft.validate`             | 可选的材料整体检查；不根据猜测的词时间判断动作先后                  |
| `parseConfig` / `parseEvent` | 配置、负载及引用校验                                                |
| `initial` / `reduce`         | 可克隆的初始状态与纯事件归并                                        |
| `loadRenderer`               | 能力包 `index.ts` 提供的浏览器绘制入口                              |

`timeFields[].preflight` 指定材料预检时的占位时间，默认 0；需要大小关系的字段可声明不同占位值。编译器替换为实测语音词边界后再次检查真实动作顺序。只有明确声明的字段接受 `$time`，配置不能直接填写这些字段的秒数。动作依旧通过 `when` 绑定旁白，`duration` 只是动画持续时长。

`draft.validate` 的 config 和事件已通过各自校验。它用于存在性等结构约束，不能把材料事件顺序当作最终时间顺序。能力包的验证错误在手工解析时可直接查看；模型生成报告对未知诊断仍使用安全的通用提示。

## 新增步骤

1. 在自己的目录实现模型、绘制入口、说明和示例。纯入口只延迟 import `renderer.tsx`，避免 CLI 加载 JSX。
2. 在 `capabilities/index.ts` import 并把包加入 `capabilityPacks`，按 `registerPack(sceneCapability)` 的方式注册。
3. 增加该能力的 fixture 和有意义的检查：非法配置、引用、时间字段，以及暂停／逆向跳转／重播后的画面。

不用修改备课的能力枚举或总提示、编译器中的主题分支、播放器事件分发及控件。增加底层协议或播放器布局能力属于另一类变更，需要相应修改核心；这个扩展入口覆盖当前图示区域中的新板书与动画表现。

## 独立模块宿主

```ts
const capabilities = createCapabilityRegistry([
  ...builtinCapabilities.values(),
  customCapability,
]);

const imported = importLessonDraft(data, capabilities);
const generated = await generateLessonDraft(brief, { provider, capabilities });
const compiled = await compileLessonDraft(generated.draft, {
  speech,
  audio,
  capabilities,
});
```

`parseLessonBrief()`、`buildLessonDraftPrompt()`、`parseLessonDraftOutput()`、`parseLessonDraft()` 也接受能力表。播放器接收由相同能力包模型与绘制入口构成的 `VisualRegistry`，见 `capabilities/player.ts`。未提供参数时使用兼容的内置能力表；未知能力在生成／编译／本地重播预检时失败。

## 绘制约束

- 状态与配置只包含可克隆数据，不持有 DOM、音频、订阅或外部状态。
- `reduce` 不修改输入，播放状态由事件和目标时间重建。
- 动画进度由课堂时间计算，不启动独立时钟或依赖历史播放的随机动作。
- 新动画在已有运动途中被另一动作打断时，从那个时刻的姿态继续；`scene` 的插值实现可作参考。
- 文字自动转义。外部图片、视频或专用素材需要由新能力明确定义校验与资源管理，当前 `scene` 使用内置矢量形状。
- 版本是能力实现的描述；当前课程格式没有锁定能力版本。改变既有数据语义时使用新的能力 ID，或显式实现兼容解析，不能假定旧课程自动兼容。

## 验证样例

`scene` 不判断课程标题，不包含《课题分离》的专用逻辑。该课在 `examples/task-separation/lesson.draft.json` 中组合人物、手机、气泡、归属区域与卡片，按旁白展示发送消息、猜测、划分边界、归还课题的过程。

`tests/capabilities.test.ts` 验证全链路注入和实际绘制，也用另一主题检查同一场景能力；`tests/browser/scene.spec.ts` 通过真正 MP3 与浏览器验证运动冻结、途中姿态、后退、刷新、重播与窄屏。浏览器自动检查使用合成词时间及静音 MP3；人工示例可以复用真实语音缓存。
