# 独立主题示例：一滴水的旅行

首页和 `/examples/flow` 已改为水循环，不沿用二分查找的讲稿、音频、板书或数组事件。旧课与资源保留在 `/examples/binary-search`。

## 课堂内容

讲解雨水从哪里来、如何回到地表与地下，并沿一条常见路径说明蒸发、凝结、降水与汇集。两个提醒是：蒸发不需要先把水烧开；云包含小水滴，也可能有冰晶，不是看得见的水蒸气。图示是简化路径，不是完整水文系统。

科学内容参考 [USGS 水循环资料](https://www.usgs.gov/water-science-school/water-cycle)、[凝结说明](https://www.usgs.gov/water-science-school/science/condensation-and-water-cycle)和[蒸发说明](https://www.usgs.gov/water-science-school/science/evaporation-and-water-cycle)。没有复制其原文或插图。

## 新数据与复用边界

- `packages/content-generator/examples/water-cycle.ts`：六个语义讲解片段，以及与明确短语绑定的板书/动画事件。旧 `examples/water-cycle/draft.ts` 是兼容入口。
- `public/lessons/water-cycle.json`：公共 `LessonSpec 0.1.0`，实际时长 65.478 秒。
- `public/audio/water-cycle-zh.mp3` 与 `public/lessons/water-cycle-zh.vtt`：新音频和匹配字幕。
- `examples/water-cycle/lesson.ts`：循环路径 `flow` 与位置/状态 `state-transition` 两个视角，复用同一份新旁白。

两种视角仍调用已有 `ClassroomPlayer` 和注册语法，没有增加 `water-cycle` 专用渲染器、第二条时钟或浏览器 TTS 端点。选择器改为由调用方提供选项；旧课继续通过同一组件运行。新增中文缺少笔画数据时沿用已有手写字体逐字渐显，原中文字形子集与 Caveat 均未替换；不声称已扩展完整中文笔画字库。

## 语音与对齐

沿用此前确认的具体音色，六个片段分别生成并使用原有内容寻址缓存。每段解码为 24 kHz 单声道 PCM，通过样本数测量实际时长，再加入 0.15 秒段间停顿合并、编码为单条 MP3。界面只播放最终 MP3。

章节/字幕起点来自实际合并偏移。蒸发、凝结、降水和汇集事件绑定“变成水蒸气”“凝结成小水滴”“落下”“汇入河流和湖泊”的真实词时间戳，不按字符数量或均分时长估计。共返回 241 个词时间戳，9 个低置信度词留在忽略的对齐报告中，`humanReview: pending`。音色沿用不等于新课所有发音已人工确认，发布前仍须整课试听。

生成入口：

```bash
npm run tts:water-cycle
# 明确生成；已有片段优先复用缓存，不自动重试云端请求
npm run tts:water-cycle -- --generate
```

不带 `--generate` 仅预检，不读取密钥、不调用接口。音频、课程和字幕写入新命名的版本；已有不同内容拒绝覆盖。生成不是 AI 备课或通用课堂编译器发布。

项目拆分后，根生成脚本通过 `@learn-anything/content-generator` 的公开入口调用合成／对齐／示例编译，JSON 与字幕统一由 `createLessonArtifacts()` 产出；播放项目不导入生成代码。细节见[子项目架构](./module-architecture.md)。

## 验证

`tests/water-cycle.test.ts` 检查真实词锚点的输入校验、无数组依赖的新课编译、匹配音频/字幕和非付费预检。`tests/browser/water-cycle.spec.ts` 检查新首页、匹配旁白、两种视角、播放/暂停、跳转/重播恢复和播放中换视角的实例清理。旧字体和二分查找交互测试移到归档地址，未删除回归覆盖。

2026-09-12，本轮结果：42 项单元测试、19 项实际 Chromium 浏览器测试、代码检查、类型检查和生产构建通过。新首页、示例、归档页、MP3 和字幕均返回 HTTP 200。公开资源/产物扫描 348 个文件，未发现配置中的语音密钥。只在本地改动，未发布。

Final sync check：六段音频均已解码、测量时长、核对讲稿与词时间戳；合并偏移重新计算后生成章节、字幕和事件。新课浏览器验证了降水片段的语音主时钟、板书和状态同步，以及逆向跳转、重播、暂停冻结和最终八条板书。整课发音、听感和 9 个低置信度词的人工作业仍为 pending，不把自动交互检查当成人工听感验收。
