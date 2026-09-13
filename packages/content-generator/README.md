# @learn-anything/content-generator

课程编译默认生成并缓存可见课程用字的 Tegaki 手写数据，返回 `lesson.handwriting`、`handwritingFont` 与资源地址；宿主保存字体后，播放器可逐笔呈现新中文。缺字报告及注入／关闭方式见[通用手写资源](../../docs/handwriting-resources.md)。本功能复用固定的官方生成管线，不包含浏览器渲染器。

独立 Node.js 课程资源编译子项目，与课堂播放项目互不依赖。职责口径是：上游 LLM／人工生成文稿材料，本项目将材料编译成课程资源，`lesson-player` 播放编译产物。本包不负责 AI 创作文稿；TTS、音频制作、字幕和时间轴对齐属于编译阶段，不移入播放器。

已实现 `LessonDraft 0.1.0` 统一材料、输入校验和 `compileLessonDraft()` 通用入口：材料 → 语音／缓存 → 实测音频与词锚点 → 连续 MP3、课程 JSON、VTT。水循环流程与温度曲线材料由同一套编译逻辑处理，不需要主题编译回调。上游现由独立的 [lesson-draft-generator](../lesson-draft-generator/README.md) 提供多模型材料生成与人工导入，本包不依赖它。完整格式、锚点、命令与边界见[课程材料与通用编译](../../docs/lesson-draft.md)。

公开接口包括：

- `LessonDraft/LessonAnchor/DraftEvent`、`parseLessonDraft()`：共享的材料类型和运行时预检。
- `compileLessonDraft(draft, {speech,audio?,resources?,pauseBetweenSegments?})`：完整编译，返回 `audio`、`lesson`、`lessonJson`、`captionsVtt`、`resources` 和实测对齐 `report`。
- `compileAlignedLessonDraft()`：已有真实词时间戳和实测片段时长时的确定性编译，不请求语音。
- `createDoubaoSpeechProvider()`：缓存适配器；默认只读缓存，明确 `allowSynthesis: true` 才允许缺失时合成。
- `createFfmpegAudioProcessor()`：可替换的默认音频适配器；实际执行需要 FFmpeg／FFprobe，在语音请求前检查可用性。
- `createLessonArtifacts(compiledLesson)`：按共享协议校验，返回 `lesson`、`lessonJson`、`captionsVtt` 和 `resources`。
- `readDoubaoConfig/synthesizeDoubao/speechCacheKey`：Node-only 语音 Provider。
- `cachedSpeech/saveSpeech`：本地内容缓存。
- `alignedSegment/spokenText`：真实词时间戳与语义锚点。
- `DraftGenerator<Input, Draft>`：保留兼容的预留类型；新材料生成使用上游 `LessonDraftProvider/generateLessonDraft()`，不表示本包必须调用 LLM 写稿。

```ts
import { createLessonArtifacts } from '@learn-anything/content-generator';
const artifacts = createLessonArtifacts(compiledLesson);
// 调用者保存 artifacts.lessonJson / artifacts.captionsVtt，并提供对应音频。
```

`compiledLesson` 必须已经是编译后的 `LessonSpec`。这个接口仅校验／序列化产物，不能直接接收普通文稿并自动生成完整课堂。

新课程使用 `compileLessonDraft()`，不把普通文稿传给 `createLessonArtifacts()`。板书和动画事件以 `when: {segment,phrase?,edge?,occurrence?,offset?}` 绑定旁白，配置时间使用 `$time` 标记。时间取真实词边界，不猜测字内时间；短语缺失、不唯一、动作不支持或时间戳不匹配时拒绝编译。

在仓库根目录安装依赖后：

```bash
npm run build -w @learn-anything/lesson-schema
npm run build -w @learn-anything/content-generator
npm run typecheck -w @learn-anything/content-generator
```

本目录内也可直接运行 `npm run build`。无需 React、浏览器、API Key 或 FFmpeg 即可构建模块。实际合成需服务配置；默认音频适配器负责编码／拼接，集成调用者负责保存产物。注入其他 `LessonAudioProcessor` 不需要默认 FFmpeg 工具；这些不是构建步骤。

`./examples/water-cycle` 导出人工材料 `waterCycleDraft`；`./examples/water-cycle.draft.json` 可直接交给上游或通用编译器。旧 `compileWaterCycle()` 仅兼容历史调用；`./legacy-lesson` 和旧课对齐子入口用于归档迁移。输出只能包含数据，不输出可执行动画代码。

目前是 private workspace，未发布到 npm。更多见[模块架构](../../docs/module-architecture.md)和[豆包接入](../../docs/tts-doubao.md)。禁止在前端导入本包或打包 API Key。
