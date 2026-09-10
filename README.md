# learnAnything — Golden Demo

`v0.0.1` 用一堂 87 秒的二分查找微课，验证语音、动态板书和概念动画能否组成同一段可控制、可恢复的课堂体验。

## 现在可以体验什么

- 固定中文旁白是课堂的唯一时钟。
- 数组、指针和推导文字都写在同一张全屏点阵纸上，不再分成“动画区”和“板书区”。
- 文字由 Tegaki 按真实笔画路径逐笔写出，并使用只覆盖本课用字的中文手写字体包；只有标题和关键结论带手绘下划线，指针线、区间线、圈选和删除叉线也都按课堂时间轴逐步落笔。
- 旁白会连续讲完；预测问题作为讲解中的思考提示，不打断播放，也不弹出选择题。
- 支持播放、暂停、后退十秒、拖动进度、倍速、静音和重新开始。
- 跳转到任意时间时，画面由 `lesson.json` 中已经发生的事件重新归并，不依赖之前的播放历史。

## 本地运行

```bash
npm install
npm run dev
```

开发检查：

```bash
npm test
npm run lint
npm run build
```

## 关键文件

```text
app/lesson-player.tsx                 课堂播放器与交互
lib/lesson.ts                         LessonSpec v0 类型与确定性状态归并器
lib/tegaki-font/                      本课专用 Tegaki 中文笔画与字体包
public/lessons/binary-search.json     手工课程规格和时间轴事件
public/audio/binary-search-zh.mp3     固定中文旁白（87.009 秒）
tests/lesson-timeline.test.ts          时间轴恢复与重播测试
```

## Golden Demo 的边界

这一阶段刻意不包含 AI 备课、文件上传、RAG、账户、数据库、学习画像、数字人或复杂 3D。当前目标是先证明一堂动态课程值得看完，并验证统一时间轴的技术路径。

## 当前协议

`LessonSpec v0` 只允许受约束的课程数据：章节、旁白片段、互动节点和已注册事件。播放器不会执行课程数据中的 HTML、JavaScript 或任意动画代码。

课堂状态满足：

```text
Classroom(t)
  = Voice(t)
  + BoardState(t)
  + AnimationState(t)
  + AttentionState(t)
```

语音的 `currentTime` 决定 `t`。每个字当前写到哪一笔、线条画了多长，均由 `t` 计算；暂停语音会冻结正在书写的字，拖动进度则重新计算 `BoardState(t)` 与 `AnimationState(t)`。
