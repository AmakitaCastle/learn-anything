# @learn-anything/lesson-schema

现在同时提供上游 `LessonDraft 0.1.0`／`LessonAnchor`／材料校验，以及下游 `LessonSpec 0.1.0`／事件校验。内置流程、状态转换、曲线和数组动画的配置／动作／纯状态规则由编译器与播放器共用，不依赖 React、Node Provider 或播放时钟。材料中的语义锚点到音频秒数的换算仍由 `content-generator` 负责，见[统一材料说明](../../docs/lesson-draft.md)。

课堂生产者与播放器之间的共享数据协议：`LessonSpec 0.1.0`、纯 JSON 动画配置与受约束事件、`parseLesson()` 校验。没有 React、TTS Provider 或播放时钟依赖。

全文板书通过可选的 `LessonDraft.boardMode`、片段 `visualId/emphasis` 和 `LessonSpec.teaching` 扩展，旧材料与课程仍可解析。共享 `teachingLines()` 负责保留原文并划分句子；图文配对、词时间戳、局部重点范围均有校验。详见[全文板书](../../docs/full-board.md)。

```bash
npm run build -w @learn-anything/lesson-schema
npm run typecheck -w @learn-anything/lesson-schema
```

协议当前仍在 1.0 之前；变更需要同时验证两个消费者。运行时使用 Node 和浏览器均有的标准 `URL` 做资源校验，不访问页面 DOM。模块架构见[交接说明](../../docs/module-architecture.md)。
