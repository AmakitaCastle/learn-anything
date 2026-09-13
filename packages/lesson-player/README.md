# @learn-anything/lesson-player

独立 React 课堂播放子项目：输入 `LessonSpec 0.1.0` 与固定媒体，输出同步的语音、板书、动画及播放控制。不生成内容、不调用 TTS、不读取密钥。

```tsx
'use client';
import {
  ClassroomPlayer,
  type LessonSpec,
} from '@learn-anything/lesson-player';
import '@learn-anything/lesson-player/styles.css';

export const Classroom = ({ lesson }: { lesson: LessonSpec }) => (
  <ClassroomPlayer lesson={lesson} />
);
```

完整控制接口：`play/pause/seek/restart/setSpeed/setMuted/getSnapshot`，以及 `onPlaybackChange`。扩展动画使用 `registerGrammar` 和 `createVisualRegistry`；默认语法见 `@learn-anything/lesson-player/grammars`。

静态帧可使用 `ClassroomSurface`，传入 `prepareLesson()` 的结果与 `time`；额外传 `video` 时只显示当前讲解段、预留该段完整文本布局且不自动滚动。默认交互播放行为不变。MP4 编码和输出比例由 CLI 宿主实现，不给 React 播放包增加 FFmpeg／Chromium 依赖，见[视频导出](../../docs/video-export.md)。

含 `LessonSpec.teaching` 的课程使用图文成组的全文板书：按词边界逐字书写、保留全文、圈画局部重点并跟随当前讲解滚动。手动回看暂停跟随，点击按钮恢复。无此字段的旧课程保留旧布局，见[全文板书说明](../../docs/full-board.md)。

在仓库根目录安装依赖并构建共享协议后：

```bash
npm run build -w @learn-anything/lesson-schema
npm run build -w @learn-anything/lesson-player
npm run typecheck -w @learn-anything/lesson-player
```

本目录内也可直接运行 `npm run build`。产物为 `dist/` ESM、类型声明；CSS 为单独公开入口。构建不使用根应用的页面框架、Tailwind 或路径别名。React / ReactDOM 是 peer dependency，消费方提供 React 19。

原中文笔画与字体资源在 `fonts/`，英文字母和数字沿用 Tegaki Caveat。可继承宿主的 `--font-hand`；缺少中文路径的字符是字体逐字渐显，并非完整笔画书写。CSS 仅作用于 `.classroom-shell` 内的课堂。

目前是 private workspace，未发布到 npm。独立项目边界和未来拆仓说明见[模块架构](../../docs/module-architecture.md)，功能说明见[课堂能力](../../docs/classroom-capability.md)。
