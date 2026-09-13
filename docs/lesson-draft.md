# 统一课程材料与通用编译

流水线现在是：**`lesson-draft-generator` 生成／导入 `LessonDraft 0.1.0` → `compileLessonDraft()` → MP3、`LessonSpec 0.1.0` 和 VTT → `lesson-player`**。材料类型、运行时校验和内置动画的纯数据规则在共享 `lesson-schema`；语音、音频处理和编译在 `content-generator`。播放器不理解文稿、不调用模型、不读密钥。

上游现已增加独立的[材料生成模块](./lesson-draft-generator.md)，支持多模型协议和人工导入。全文板书模式会直接把旁白编译为逐句板书；动画选择、图文关联及重点仍由上游指定，编译器不自动设计任意图示。规则与示例见[全文板书与图文跟随](./full-board.md)。

## 材料单写什么

| 字段 | 用途 |
| --- | --- |
| `draftVersion` | 固定 `"0.1.0"`，区别于编译产物的 `schemaVersion` |
| `id/title/eyebrow` | 课程标识和标题；`eyebrow` 可用 `{duration}` 填入实测总秒数 |
| `boardMode` | 新备课使用 `"full-narration"`，全文自动进入板书；旧材料可省略 |
| `segments` | 按顺序列出 `{id,label,text,visualId?,emphasis?}`；自动生成章节和字幕，全文模式还生成图文板书 |
| `presentation` | 图区／板书区标题，以及可选的标题呈现锚点 |
| `visuals` | 已注册动画的 `{id,grammar,config}`；只能包含数据 |
| `events` | `board.write/board.mark/board.remove/visual` 动作，每个动作带 `when` |

旁白每段最多 2000 字符、最多 100 段。片段 ID、动画 ID 必须唯一。课程最多两小时，文本、坐标、事件数量和配置嵌套均有边界校验。材料不接受直接填入事件 `at`、任意脚本或 React 组件。章节由片段自动生成，不在材料动作中重复手写。

完整模板：

- `packages/content-generator/examples/water-cycle.draft.json`：六段中文旁白、八条板书、流程节点和连线。
- `packages/content-generator/examples/temperature.draft.json`：另一主题的温度曲线，包含公式、点高亮、板书删除和箭头。

## 动作怎样配合哪句话

```json
{
  "type": "board.write",
  "when": { "segment": "evaporation", "phrase": "变成水蒸气" },
  "item": { "id": "evaporation", "text": "蒸发：液态水 → 水蒸气", "tone": "accent" }
}
```

`when` 是 `LessonAnchor`：

- `segment`：引用哪段旁白，必填。
- `phrase`：这段里的短语；省略表示整个片段。
- `edge`：`start`（默认）或 `end`，对应短语的首词起点／末词终点；没有短语时对应片段实测起点／终点。
- `occurrence`：重复短语的第几次，从 1 开始；未指定而短语重复时明确报错。
- `offset`：可选的 -5～5 秒编辑提前／延后；不是最终绝对时间。越过整课音频边界会报错。

匹配忽略标点与空白，支持 Unicode。时间取语音返回的真实词时间戳：短语落在一个多字词内时使用该词的起止边界，不插值猜测字内时间。缺少短语、重复但未指定次数、时间戳缺失／重叠／越界、返回文本与旁白不一致时均拒绝编译，不按字符数估时。

标题时机和动画配置中的时间也可绑定旁白：

```json
{
  "id": "evaporation",
  "label": "蒸发",
  "position": { "x": 25, "y": 27 },
  "at": { "$time": { "segment": "evaporation" } }
}
```

`$time` 只允许用于 `flow/state-transition` 的 `nodes[].at`，以及 `array-search` 的 `valuesAt/scanStart/scanEnd/trailAt`。这些字段不能预填绝对秒数。`stagger/trailStep` 是动画自身的间隔，不是语音锚点。流程节点省略 `at` 表示从开头可见；`plot` 的点列是预先给定的数据，不含配置级语音秒数。

标题的 `titleAt/metaAt/diagramTitleAt/notesTitleAt/ruleAt` 接收普通 `LessonAnchor`，不使用 `$time`；省略时从第一段开头呈现。

## 当前可编译的动画

| grammar | 动作 |
| --- | --- |
| `flow` | `activate {id}`、`connect {id}` |
| `state-transition` | `enter {id}`、`transition {id}`；转换必须从当前状态出发 |
| `plot` | `reveal {index}`、`highlight {index}` |
| `array-search` | `window {low,mid,high}`、`discard {indices}`、`found {index}`、`focus {target}` |

编译器和默认播放器共用同一组配置解析、动作解析和状态转换规则。未知 grammar／动作或节点、连线、索引引用错误，在语音请求前进行材料预检；实际时间确定后还会复核动作顺序。当前通用编译器只接收这四类内置 grammar；播放器的自定义插件能力仍保留，但自定义材料编译规则须另行扩展共享协议。

## 在程序里编译

```ts
import {
  compileLessonDraft, createDoubaoSpeechProvider, readDoubaoConfig,
} from '@learn-anything/content-generator';

const compiled = await compileLessonDraft(draftJson, {
  speech: createDoubaoSpeechProvider({
    config: readDoubaoConfig(process.env),
    cacheRoot: '/absolute/cache/directory',
    allowSynthesis: true, // 明确允许缓存缺失时调用接口；默认 false
  }),
  resources: { audio: '/audio/lesson.mp3', captions: '/lessons/lesson.vtt' },
  pauseBetweenSegments: 0.15, // 默认值，按 24kHz PCM 采样量量化
});
// compiled.audio: 连续 MP3 的 Buffer
// compiled.lesson / lessonJson: 可直接交给播放器的课程协议／JSON
// compiled.captionsVtt: VTT 字幕
// compiled.report: 实测时长、词数量、低置信度词、每个锚点最终时间
// 调用者保存资源，并让 resources 地址可被播放宿主读取。
```

完整入口先校验材料／资源，再检查默认音频工具，然后依次合成或复用缓存，解码为 24kHz 单声道 16-bit PCM，以实测采样量定位片段；通过真实词时间戳编译动作，合并 PCM、编码并检查最终 MP3 时长，输出纯数据课程和字幕。最终 MP3 与 PCM 总时长允许不超过 0.1 秒的容器差异；事件不会按该差异缩放。相同时间的动作保持材料顺序。板书不能在出现前删除或重复删除。

默认音频适配器需要本地 `ffmpeg` 和 `ffprobe`，在首次语音请求前检查可用性。构建模块不需要它们。`speech` 和 `audio` 都是可注入接口；其他语音服务须将实际词时间戳转换成 `metadata[].sentence.words[]` 中的 `word/startTime/endTime`，单位秒。禁止用估算时间伪造该输入。

已有实测片段和元数据时可调用 `compileAlignedLessonDraft(draft, measuredSegments, options)`，只执行纯编译、不再次请求语音或编码音频。它仍要求文稿、片段顺序、真实词时间戳和实测时长一致。原 `createLessonArtifacts(compiledLesson)` 保留为已经编译好的 `LessonSpec` 的校验／序列化接口，不能代替文稿编译。

## 本地命令

```bash
# 只检查材料；不需要密钥／音频工具，不合成、不写产物
npm run lesson:compile -- --draft packages/content-generator/examples/water-cycle.draft.json

# 只复用已有缓存；缓存缺失就失败，不自动花额度
npm run lesson:compile -- --draft packages/content-generator/examples/water-cycle.draft.json --cached

# 明确允许合成；配置放在忽略的 .env.local，不要发到聊天或前端
npm run lesson:compile -- --draft path/to/lesson.draft.json --generate
```

产物默认位于忽略的 `outputs/compiled/<id>/<内容标识>/`，包含 `lesson.json/narration.mp3/captions.vtt/alignment.json`。`--output` 可指定另一个目录；已有不同文件不会覆盖。默认资源地址为 `/audio/<id>.mp3`、`/lessons/<id>.vtt`，也可用 `--audio-url/--captions-url` 配置。产物目录不是自动托管地址，集成应用须把 MP3、VTT 放到对应资源路径。

`npm run tts:water-cycle -- --cached` 现在同样使用这个通用编译器，再接入当前 Demo 的公共资源。当前缓存编译与原公开水循环 JSON、VTT、MP3 逐字节一致，未调用付费接口。旧 `compileWaterCycle()` 仅保留历史调用兼容，不作为新课程入口。

## 验收边界

通用编译现已增加按课程用字生成的 Tegaki 手写资源，宿主也需托管产物中的字体文件，详见[手写资源与播放器接入](./handwriting-resources.md)。这不是 LLM 生成动画代码。原中文子集保持不变，缺字按片段回退；生成字形的绘制路径不保证规范汉字笔顺。

编译技术正确不等于知识正确或声音自然。`report.humanReview` 仍标为 `pending`，保留低置信度词供人工复核。覆盖全部 Unicode 的笔画库、更多学科教学效果和自定义动画编译不在编译模块交付内；LLM 材料生成是上游独立模块，验收边界另见其文档。
