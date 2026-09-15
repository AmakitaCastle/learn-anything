# 终端一条命令：备课 → 编译 → 播放

三个模块由宿主命令 `npm run lesson` 串联：主题／需求文件 → `lesson-draft-generator` → `LessonDraft 0.1.0` → `content-generator` → MP3、LessonSpec、字幕和手写字体 → 独立网页中的 `lesson-player`。

不需要自己搬运产物、改页面、构建模块或另起网页服务。原首页与示例课程不变，业务模块仍互不依赖。

## 首次准备

在仓库根目录执行 `npm install`。本机需要 Node.js ≥22.13、FFmpeg 和 FFprobe。把 `.env.example` 的配置放入忽略的 `.env.local`：

- `LESSON_LLM_PROVIDER / LESSON_LLM_MODEL / LESSON_LLM_API_KEY`，以及可选的 `LESSON_LLM_BASE_URL`：文本模型备课。
- `DOUBAO_SPEECH_API_KEY / DOUBAO_TTS_RESOURCE_ID / DOUBAO_TTS_SPEAKER / DOUBAO_TTS_SPEECH_RATE`：语音编译。

文本模型和语音模型不是同一份凭证。多供应商端点、兼容参数与限制见[材料生成配置](./lesson-draft-generator.md)。缺配置或本地音频工具时，会在模型请求前停止。密钥只放在本地配置里，不通过命令参数或课程页面传递。

## 日常使用

```bash
# 一条命令，明确允许备课和缺失缓存时的语音合成（可能消耗额度）
npm run lesson -- "水循环" --generate

# 指定受众和篇幅，无需事先写 JSON
npm run lesson -- "二分查找" --audience "刚开始学编程的人" --segments 6 --duration 90 --generate

# 使用详细备课需求，自动生成、编译并打开播放器
npm run lesson -- --brief examples/briefs/water-cycle.json --generate

# 已有人工／模型材料：跳过文本模型，仅复用真实语音缓存
npm run lesson -- --draft packages/content-generator/examples/water-cycle.draft.json --cached

# 已有材料，明确允许缺失缓存时合成语音，不重新备课
npm run lesson -- --draft path/to/lesson.draft.json --generate

# 已生成的课程直接打开，不读模型／语音配置，不重复生成
npm run lesson -- --play outputs/runs/<id>/<run>

# 仅离线预检；不带 --generate 或 --cached，不生成也不打开播放器
npm run lesson -- "水循环"

# 查看帮助
npm run lesson -- --help
```

也可以在任意目录调用，无需先切换目录：

```bash
npm --prefix /Users/castleamakit/Documents/code/ai/learn-anything run lesson -- "水循环" --generate
```

生成后命令自动打开默认浏览器；点击播放器的“播放”开始有声课堂，不强制绕过浏览器自动播放限制。终端持续运行以提供本地音频／字幕／字体；按 Ctrl+C 关闭服务，保存的课程不删除。自动打开浏览器失败时，打开终端显示的地址即可。

## 可选参数

| 参数                                                 | 用途                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--topic`                                            | 与位置参数等效，只能使用一种主题写法                                                                                  |
| `--audience / --segments / --duration / --id`        | 仅主题输入可用；默认零基础普通学习者、6 段、目标 90 秒、主题内容哈希 ID。时长不是实测音频时长                         |
| `--repair-attempts 1`                                | 最多一次额外材料重写请求；默认 0，最多 2，只适用于文本模型生成                                                        |
| `--json-mode false / --token-limit-field max_tokens` | 文本模型兼容端点选项；不会放宽材料校验                                                                                |
| `--max-output-tokens <正整数>`                       | 可选文本输出预算。兼容协议与 Gemini 默认不发送上限，使用服务端默认值；Anthropic 因接口必填默认 8192。模型本身仍有上限 |
| `--output <新目录>`                                  | 指定本次产物目录；已存在目录会在模型请求前被拒绝，不覆盖或追加                                                        |
| `--no-play`                                          | 只生成并保存，不启动播放器                                                                                            |
| `--no-open`                                          | 启动播放器并打印地址，不自动打开浏览器                                                                                |
| `--port <端口>`                                      | 默认自动选择空闲端口；指定端口已占用时失败，不终止其他服务                                                            |
| `--export-video <新文件.mp4>`                        | 导出带旁白的 MP4 后退出，父目录须存在；适用于已保存课程、Demo 或明确的生成／缓存编译模式                              |
| `--aspect-ratio 16:9 / 9:16 / 1:1`                   | 输出比例，默认横屏；须与视频导出一起使用                                                                              |
| `--fps <1–60 整数>`                                  | 视频帧率，默认 24；须与视频导出一起使用                                                                               |

主题、`--brief`、`--draft`、`--play` 必须四选一。`--cached` 仅适用于已有材料；不调用文本模型、不合成缺失语音。模型失败不自动重试或切换供应商；修复请求必须显式允许。

导出时可加 `--export-theme dark` 选择黑底白字（默认 `light` 白底），独立于播放器保存的主题；须与 `--export-video` 一起使用。

导出时可加 `--export-speed 1.5`（0.25–3，默认 1），画面与旁白同步变速并保持音调；输出时长随倍速变化。参数须与 `--export-video` 一起使用，详见[视频导出](./video-export.md)。

## 保存与恢复

默认目录为忽略的 `outputs/runs/<id>/<时间戳-随机标识>/`，包括：

```text
lesson.draft.json   已校验课程材料
generation.json    来源、模型、请求次数、待人工复核标记
narration.mp3      实测拼接语音
captions.vtt       字幕
alignment.json    实测时长、锚点、低置信度词和手写报告
handwriting.ttf   手写字体（启用手写资源时）
lesson.json       最后保存的完整播放协议
```

语音失败后，已经校验的材料保留，不重新花额度备课：

```bash
npm run lesson -- --draft <本次目录>/lesson.draft.json --generate
```

恢复编译创建新的运行目录并复用已合成片段的语音缓存。`lesson.json` 最后保存；未保存它的半成品不会被当成可播放课程。播放器启动失败不会删除课程，可修复依赖或端口后用 `--play <目录>` 重新打开。

若所有语音已合成，可把恢复命令中的 `--generate` 改为 `--cached`，确保缓存缺失时停止而不请求付费接口。终端会显示已识别的音频处理和课程时间轴错误，便于定位失败原因。修订版已修复多段课程结尾因时长精度误差而编译失败的问题。

部分音色会把 `『`、`』，` 等标点单独返回为字幕词。通用对齐器跳过这些无发音字符的条目，保留原文中的标点；实际发音词仍须满足时间范围、顺序和全文匹配校验。终端会显示白名单中的语音 HTTP／业务错误和词时间戳错误，未知异常仍使用通用提示，避免泄露接口返回或配置。

## 本地播放器边界

`viewer/` 是播放器的独立宿主，不引入模型或编译模块。启动时使用 [Vite 的 JavaScript build 接口](https://vite.dev/guide/api-javascript.html#build) 打包页面，不依赖 Demo 网页框架；本地服务只提供封闭列表中的页面、前端资产和当前课程资源，不提供文件目录浏览、源码、环境配置、材料或生成报告。服务只绑定 `127.0.0.1`，使用随机访问路径并校验 Host，支持 MP3 Range 请求，以便播放和 seek。

已保存课程的音频、字幕和字体会在播放时重定位到本次服务，不依赖旧服务端口或公共资源复制。播放器不会调用模型；保存文件仍含课程内容，应按本地资料妥善管理。这个入口是本机离线制作与本地播放工具，不是账户服务、公网部署或 npm 已发布的全局命令。

## 验证

备课失败时，终端现在区分 HTTP 状态（如 401 凭证、402 余额、404 地址／模型、429 限流）、网络错误、请求超时、输出 token 截断、模型拒绝、异常响应及材料校验原因。提示只采用固定原因和白名单校验消息，不输出原始响应、密钥或请求头；错误信息更详细不代表自动重试。若失败，把新的错误类别及 HTTP 状态贴回即可，不要粘贴配置里的密钥。

新增终端／工作流测试涵盖输入模式、离线默认、模型与编译串联、文件防覆盖、缺工具提前失败、半成品保留、人工导入、取消、封闭资源服务、MP3 Range、真实 FFmpeg 编码以及重播进程的退出清理。

实际 Chromium 验证模型传输夹具 → 现有编译器 → 真实编码的静音 MP3 与手写资源 → 独立播放器；覆盖播放、暂停、seek、重播和刷新后的严格画面恢复。合成词时间戳与静音音频仅为测试夹具，不冒充真实模型或 TTS。

本轮另用水循环的六段真实语音缓存执行统一命令并编译保存课程，没有请求付费接口。知识正确性、听感和低置信度词仍需人工复核；新主题的真实供应商账号联调和教学质量不由这次离线验证保证。

## 内置字体选择

中文与英文／数字各支持三款字体，独立选择并保存。视频导出默认沿用 CLI 字体偏好，也可用 `--export-font-chinese`、`--export-font-latin` 单独覆盖，不修改原课程或语音时间轴。详见[字体选择](./font-selection.md)。
