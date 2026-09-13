# 豆包语音接入：先生成，再发布

当前接入采用 Node 离线生成流程，不在浏览器内实时请求 TTS，也不暴露可被外部滥用的付费生成端点。首页已按用户要求换为约 65 秒的水循环课，新旁白生成与对齐见[水循环说明](./water-cycle.md)。此前约 77 秒的二分查找配音、已对齐课程和旧版 87 秒资源均保留，归档页面位于 `/examples/binary-search`。没有发布到外网。

## 1. 账号与配置

合成、缓存与对齐实现现在属于独立 `packages/content-generator/tts/` 项目，原 `lib/tts/` 保留兼容转出口。根脚本仍是演示应用的离线集成入口；播放器不依赖生成项目。各自构建与数据交接见[子项目架构](./module-architecture.md)。

在[豆包语音控制台](https://console.volcengine.com/speech/new/setting/apikeys)开通语音合成试用、获取**语音 API Key**，并在控制台试听、选择一个具体音色。方舟的文本模型 API Key、火山账号的 AK/SK 均不能直接代替语音 API Key。

参照根目录 `.env.example`，在项目根目录新建 `.env.local`：

```dotenv
DOUBAO_SPEECH_API_KEY=在本地填写你的语音密钥
DOUBAO_TTS_RESOURCE_ID=seed-tts-2.0
DOUBAO_TTS_SPEAKER=在控制台选择并复制完整的音色ID
DOUBAO_TTS_SPEECH_RATE=0
```

模型资源 ID 必须与账号开通的服务及音色版本匹配。示例为 2.0，不代表每个账号已获得该服务权限。没有预选音色；必须试听后填写具体 speaker ID。语速范围是 -50～100 的整数，0 表示正常；它与播放时的倍速是两件事。

`.env.local` 已被 Git 忽略。不要把密钥发到聊天、提交到仓库、写到 `public/`，或使用 `NEXT_PUBLIC_` / `VITE_` 前缀暴露给浏览器。脚本只在 Node 进程读取配置，浏览器构建没有导入该适配器。

## 2. 先预检，再生成短段试听

在项目目录运行（Node >= 22.13）：

```bash
npm run tts:preview
npm run tts:preview -- --generate
```

第一条只显示讲稿与字符数，不需要密钥、不调用接口。第二条实际调用接口：首次可能消耗免费额度或产生费用，请先确认控制台的试用余额及后付费设置。默认取现有课程前三个旁白片段，不改讲稿；实际时长以音频为准，不承诺固定的试听秒数。

生成结果输出到忽略的 `outputs/tts/doubao/<内容哈希>/`：

- `audio.mp3`：试听或后续制作使用的音频。
- `manifest.json`：讲稿、音色、参数、音频校验值，以及服务返回的可选元数据；不包含密钥。

使用本地音频播放器打开输出路径即可试听。重点检查自然度、问题语气，以及 `low`、`mid`、`high` 和数字的读法。当前只发送基础语速参数，没有擅自加入某些音色不支持的情绪或风格指令。

同一讲稿、音色、模型资源及语速再次生成时会复用完整且校验通过的本地缓存，不请求服务。改变这些参数会产生新缓存。脚本不自动重试；网络失败后再次手动运行可能产生额外费用。并发运行多个生成进程不保证去重，请串行使用。

## 3. 声音满意后生成整课

```bash
npm run tts:lesson
npm run tts:lesson -- --generate
npm run tts:lesson -- --generate --subtitles
```

每次仅生成一份连续 MP3。本阶段应用保守限制为最多 2000 字符，足够现有微课；不是厂商接口最大长度。无密钥或音色配置时会明确提示，并且不发起请求。`--subtitles` 会请求 `req_params.audio_params.enable_subtitle`；当前配置的真实接口已返回 `sentence.words` 的 `word/startTime/endTime/confidence`。不同模型/音色不保证支持，缺少有效词时间戳时对齐流程会停止。开启此选项会使用不同缓存，不覆盖已确认的试听音频。

## 4. 不能直接替换旧课堂音频

新音频与旧音频不保证同样的 87 秒时长。缓存清单中的 `sourceCues.originalAt` **只是旧课堂的时间参考**，不是新音频时间戳；原始合成清单保留 `alignmentStatus: pending`，后续对齐结果独立写入 `alignment.json`。

本课对齐脚本需要本地 `ffmpeg` 和 `ffprobe`，不调用云端接口、不消耗语音额度：

```bash
npm run tts:align -- --cache a85d802897b31aef3aef5ca06cc1f5fe1063862c98996ad14d2b9422796b372a
```

缓存标识取自生成命令输出。当前命令对应已生成的整课版本。脚本先校验音频 SHA-256、实际时长和解码、完整讲稿覆盖、词时间戳范围/重叠、锚点唯一性和顺序；缺失或不一致时拒绝对齐。输出：

- `public/audio/binary-search-doubao-zh.mp3`：新版本音频。
- `public/lessons/binary-search-doubao.json`：新版本课程和 24 个语义/边界映射锚点。
- `public/lessons/binary-search-doubao-zh.vtt`：与十段旁白起点对应的字幕。
- 缓存目录 `alignment.json`：词数量、实际时长、校验值、锚点和低置信度词清单，不包含密钥。

“二十三比十三大”“正好是二十三”“目标如果存在”等节点采用接口返回的词起点；装饰性标题、扫描和规模动画在邻近锚点之间插值。书写仍按笔画逐步完成，不声称每一笔都与单词逐帧对齐。这是固定二分查找课程的编辑锚点，不是通用 AI 备课编译器。

生成器不自动切换页面，也不会覆盖不同的既有新版本资源。当前 `app/page.tsx` 已明确导入新课程。恢复旧版只需改回 `@/public/lessons/binary-search.json`；播放器会回退到旧字幕和原时间轴。

时间戳是服务生成的对齐结果，不等于人工验证。当前共有 34 个词置信度低于 0.5（包含一处置信度为 0 的“不变量”短句），已在报告中标记 `humanReview: pending`。必须人工试听核对整课听感、发音和这些片段后，再决定是否对外发布。最初的 TTS 切换轮只更新了浏览器回归采样点；随后 2026-09-12 的课堂能力封装已执行并通过实际 Chromium 的播放、暂停、跳转、重播和画面恢复检查，详见[课堂能力验收](./classroom-capability.md#本次验收记录)。这些交互检查不替代人工听感和低置信度时间戳核对。

## 验证与排障

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

接口回归测试使用本地模拟响应，覆盖 SSE 跨包、空音频控制消息、音频拼接、错误与缓存，不消耗云端额度。

2026-09-12 已验证真实账号短段合成（100 字符、20.448 秒），用户确认试听音色；整课随后合成一次（385 字符、77.016 秒），得到 313 个词时间戳，讲稿覆盖和 MP3 解码检查通过，字幕和板书已按语义锚点更新。再次对齐只使用本地缓存，不重复合成。整课人工同步验收仍待完成。

- 缺少配置：在项目根目录 `.env.local` 填写对应字段。
- HTTP 401/403：确认使用语音 API Key，且服务已开通。
- 业务错误：检查额度、音色 ID 与模型资源 ID 是否匹配，必要时在控制台查看调用记录。
- 响应中断/超时：不保存半成品，不自动重试。
- 缓存损坏：手动移走报错的具体缓存目录再生成；脚本不会覆盖已有音频。

实现依据：[官方 V3 HTTP/SSE 接口文档](https://www.volcengine.com/docs/6561/1598757)和[字节跳动官方调用示例](https://github.com/bytedance/agentkit-samples/blob/main/skills/byted-text-to-speech/scripts/text_to_speech.py)。目前使用新版语音 API Key 鉴权，不支持旧版 AppID/Access Token 配置。
