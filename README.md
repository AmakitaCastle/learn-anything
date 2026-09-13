# learnAnything — 模块化课堂

当前流水线是 **`lesson-draft-generator` 生成／导入材料 → `content-generator` 编译 → `lesson-player` 播放编译产物**。三个业务模块分别构建、互不依赖，只共享 `lesson-schema` 的 `LessonDraft/LessonSpec 0.1.0` 数据协议。新增上游模块支持 OpenAI 兼容、Anthropic、Gemini 三种协议、自定义模型适配器及人工材料；编译模块仍负责 TTS、真实词时间戳、MP3、课程 JSON 和 VTT，播放器只消费产物。当前是同仓 npm workspaces，未发布 npm 包。入口、配置与命令见[材料生成模块](./docs/lesson-draft-generator.md)、[材料与通用编译](./docs/lesson-draft.md)和[子项目架构](./docs/module-architecture.md)。材料生成已完成离线接口验证，真实供应商账号联调和教学质量仍待验证。

项目已从 Golden Demo 推进到可复用课堂能力的封装：`ClassroomPlayer` 接收课程数据与固定音频，把语音、动态板书和概念动画作为同一段可控制、可恢复的体验播放。首页已换为约 65 秒的《一滴水的旅行》水循环课：使用新旁白、新板书和新动画数据，而非给二分查找换标题。

本地 `/examples/flow` 可切换水循环路径与水的位置/状态两个视角，使用同一个课堂组件和这份新旁白。播放不需要 API Key，也不实时调用语音服务。旧二分查找课及四种语法视角保留在 `/examples/binary-search`，只作为回归示例，不再是首页。新课的生成、对齐和字形边界见[水循环示例说明](./docs/water-cycle.md)。

复用接口、输入输出、验收与边界见[课堂能力说明](./docs/classroom-capability.md)，新增动画见[动画语法扩展指南](./docs/visual-grammars.md)。

## 终端一条命令

完成首次依赖安装及 `.env.local` 的文本模型／语音配置后，在项目目录运行：

```bash
npm run lesson -- "水循环" --generate
```

自动备课、编译 MP3／课程／字幕／手写资源、启动本地播放器并打开浏览器；点击“播放”即可学习。无需手动搬文件或改网页。`--generate` 明确允许可能消耗额度的接口请求；不带此标志默认只预检。

已有材料可用 `--draft <文件> --cached` 离线复用语音缓存；课程保存后可用 `--play <目录>` 直接打开。按 Ctrl+C 关闭本地服务，课程文件保留。完整首次配置、参数及失败恢复见[终端使用指南](./docs/terminal-lesson.md)。

## 现在可以体验什么

课程编译现已支持 [通用手写资源生成](./docs/handwriting-resources.md)：按课程用字生成和缓存 Tegaki 中文动画资源，播放器读取资源逐笔书写；缺字仅局部回退，不再整行淡入。已接入升温课，旧课资源保留。

新增 [LLM 生成材料的升温曲线课](./examples/heating-rate/README.md)：`/examples/heating-rate`，展示本次模型生成的 `LessonDraft 0.1.0` 经现有编译器生成语音、课程规格和字幕后播放动态板书；不改变现有首页，也不代表已接入自动备课服务。

新备课默认把旁白全文逐句写入板书，每张图关联对应讲解，页面自动跟随当前区块；手动回看时暂停跟随，并只圈出局部重点。可播放示例：`/examples/full-board`。格式、交互和旧课升级方法见[全文板书与图文跟随](./docs/full-board.md)。

- 固定中文旁白是课堂的唯一时钟。
- 水循环节点、流动连线和讲解要点写在同一张全屏点阵纸上。
- 原字形包内的文字由 Tegaki 按笔画路径写出，英文/数字使用 Caveat；新主题中缺少笔画数据的中文采用现有手写字体逐字渐显。中文原字库没有修改，不把逐字渐显冒充完整中文笔画动画。关键结论的下划线和概念连线也由课堂时间决定。
- 保留真实笔压和收笔效果，不添加随机笔迹抖动，保证重新挂载后的手写画面也能稳定恢复。
- 旁白会连续讲完；预测问题作为讲解中的思考提示，不自动暂停，也不弹出选择题，学习者可以随时手动暂停思考。
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
npm run typecheck
npm run build
```

只构建子项目、检查模块边界与仓库外复用：

```bash
npm run build:modules
npm run typecheck:modules
npm run test:modules
```

单独构建某个项目的命令见[材料生成项目](./packages/lesson-draft-generator/README.md)、[播放项目](./packages/lesson-player/README.md)与[课程编译项目](./packages/content-generator/README.md)。

浏览器回归检查（首次需要安装测试浏览器）：

```bash
npx playwright install chromium
npm run test:browser
```

测试会自动启动专用的 `127.0.0.1:4173` 本地服务，结束后关闭，不复用已有服务。覆盖真实音频播放、暂停、进度跳转、后退十秒、倍速、静音、重置和预测节点连续播放。

如果同一项目已有开发服务正在运行，可用 `VINEXT_NO_DEV_LOCK=1 npm run test:browser` 启动独立测试服务，不中断原来的页面。

视觉回归固定为 1280×720、DPR 1 的无头 Chromium，在同一次运行中比较直接跳转、前后跳转、重置和页面重载后的板书像素，不依赖跨平台通用的 PNG 基准。测试等待字体与 Canvas 稳定，失败时保存截图和 trace 到忽略的 `test-results/`。更换平台或浏览器后的像素差异不属于本阶段的一致性承诺，参见 [Playwright 视觉比较说明](https://playwright.dev/docs/test-snapshots)。

## 关键文件

```text
packages/lesson-player/               独立播放项目：组件、时钟、板书、动画、字体与 CSS
packages/lesson-schema/               LessonDraft / LessonSpec、锚点和共用动画规则
packages/content-generator/          独立编译项目：统一材料、TTS、音频、锚点与课程产物
packages/lesson-draft-generator/     独立上游项目：备课需求、模型适配、人工导入与材料校验
packages/lesson-player/board/         手写、分步公式、箭头/曲线/圈选/下划线/高亮
packages/lesson-player/grammars/      数组、流程、状态转换、曲线注册语法
examples/                            课程数据、旧课适配层与最小语法示例
app/lesson-player.tsx                 Demo 的网页工具集成
lib/                                 旧调用兼容转出口；新实现属于各自子项目
packages/lesson-player/fonts/        保持原样的 Tegaki 中文笔画与字体包
packages/content-generator/examples/*.draft.json    可直接读取的课程材料单
examples/water-cycle/                集成演示课程与状态视角数据
public/lessons/water-cycle.json       当前水循环课程：真实音频时间轴
public/audio/water-cycle-zh.mp3       当前新旁白（65.478 秒）
public/lessons/binary-search-doubao.json  归档二分查找课：语义锚点对齐时间轴
public/audio/binary-search-doubao-zh.mp3  保留的二分查找旁白（77.016 秒）
public/lessons/binary-search.json     原始手工课程，用于对齐和旧版恢复
public/audio/binary-search-zh.mp3     保留的旧版旁白（87.009 秒）
packages/content-generator/tts/      语音适配、缓存与语义锚点对齐
scripts/align-doubao-lesson.ts        本地对齐输出，不请求云端接口
scripts/generate-lesson-draft.ts     上游预检／显式模型生成／人工材料导入
tests/lesson-timeline.test.ts          时间轴恢复与重播测试
tests/handwriting.test.ts              混排字体覆盖与顺序书写测试
tests/browser/lesson-player.spec.ts   播放器交互与像素级恢复测试
playwright.config.ts                 固定浏览器环境与专用测试服务
```

## 字体设置

中文板书的字体和笔画现在由播放项目的 `packages/lesson-player/fonts/` 自带，原 `lib/tegaki-font/` 保留兼容入口和校验参考；字形、笔画和字体文件保持原样。英文、数字及有笔画数据的半角公式符号使用 [Tegaki 内置的 Caveat 字体包](https://github.com/gkurt/tegaki#built-in-fonts)，在 `packages/lesson-player/board/index.tsx` 中导入；缺少 Caveat 笔画数据的符号（如方括号）保留原字体，不退化成突然显示的普通文字。角标、播放时间和倍速等普通文字通过 `--font-hand-latin` 共用已加载的 Caveat 字体，不额外下载一份字体。中文旁白状态等普通中文文字仍继承原来的 `--font-hand` 设置。

以后更换英文手写体时，只需替换板书模块中的英文字体包导入，播放器中的普通文字会自动使用该字体包的家族名；中文字体包保持不变。更换后运行上面的浏览器回归检查，验证混排、暂停和拖动恢复。

## 豆包语音生成

已接入服务端离线 TTS 生成脚本：支持短段试听、整课 MP3 和本地内容缓存。参照 `.env.example` 配置忽略的 `.env.local`。通用命令 `npm run lesson:compile -- --draft <材料.json>` 默认预检，加 `--cached` 只复用缓存，加 `--generate` 才允许合成。水循环集成命令 `npm run tts:water-cycle` 也使用通用编译器；加 `-- --cached` 只复用缓存，加 `-- --generate` 才允许合成。不带 `--generate` 不调用付费接口；原课试听和整课生成脚本仍保留。

账号配置、试听、缓存与切换流程见[豆包语音接入说明](./docs/tts-doubao.md)。水循环沿用已确认音色，按六个语义片段生成并缓存；用实测 PCM 时长合并，词时间戳驱动事件，MP3 与字幕同步输出。没有发布到外网；整课听感和低置信度词仍需人工核对。

## 保留的 Demo 边界

当前播放器不包含 AI 备课；离线备课属于独立 `lesson-draft-generator`。课堂能力仍不包含文件上传、RAG、账户、数据库、学习画像、数字人或复杂 3D。原 Demo 用来证明动态讲解和统一时间轴，当前封装进一步验证只更换课程数据就能复用播放器。

原课体验以[项目路线图的第一阶段](./learnAnything：从动态讲课#3-第一阶段golden-demo)为准；预测节点采用连续讲解，不要求自动暂停或答题交互。引擎抽象对应第二阶段，具体交付与尚未完成的范围见[课堂能力说明](./docs/classroom-capability.md)。

## 当前协议

公共 `LessonSpec 0.1.0` 只允许受约束的课程数据：章节、旁白、板书和已注册动画事件。旧版 `0.0.1` 保留在 TTS 对齐与原课资源中，通过示例适配层进入播放器，不把数组字段继续当成公共协议的必填项。播放器不会执行课程数据中的 HTML、JavaScript 或任意动画代码。

课堂状态满足：

```text
Classroom(t)
  = Voice(t)
  + BoardState(t)
  + AnimationState(t)
  + AttentionState(t)
```

语音的 `currentTime` 决定 `t`。每个字当前写到哪一笔、线条画了多长，均由 `t` 计算；暂停语音会冻结正在书写的字，拖动进度则重新计算 `BoardState(t)` 与 `AnimationState(t)`。
