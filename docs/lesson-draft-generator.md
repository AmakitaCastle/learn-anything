# 上游材料生成模块

当前链路：`LessonBrief / 人工材料 → lesson-draft-generator → LessonDraft 0.1.0 → content-generator → MP3 + LessonSpec 0.1.0 + VTT → lesson-player`。

新增 `packages/lesson-draft-generator`，只依赖 `lesson-schema`。模块返回材料，不请求 TTS，也不保存或托管文件；根目录脚本负责读配置及保存产物。编译模块仍负责真实音频、词时间戳、手写资源和最终事件顺序校验。播放器不接触模型与密钥。

## 备课需求

`examples/briefs/water-cycle.json` 是可直接使用的需求文件。

| 字段                    | 规则                                                      |
| ----------------------- | --------------------------------------------------------- |
| `id/topic/audience`     | 必填，输出课程 ID 必须与需求一致                          |
| `language`              | 默认 `zh-CN`                                              |
| `objectives`            | 可选学习目标，最多 20 条                                  |
| `sourceMaterial`        | 可选参考文本，最多 50000 字符；作为不可信资料而非系统指令 |
| `segmentCount`          | 默认 6，范围 1–20；生成后强制核对                         |
| `targetDurationSeconds` | 可选 15–1800 秒，仅指导篇幅；实际时长由编译器测量         |
| `allowedGrammars`       | 默认四种内置语法，可缩小范围；不适合画图可仅生成板书      |

材料协议、短语锚点与动画数据规则见[LessonDraft 格式](./lesson-draft.md)。提示合同要求输出可朗读旁白、分步板书、纯数据动画和来自旁白的短语锚点。资料隔离是提示层防护，不承诺完全抵抗提示注入；调用者应审核资料和知识，不向模型提供密钥或无权外发的内容。

## 板书过程与多图设计

提示版本 `0.4.0` 默认使用全文板书：完整旁白逐句、随语音逐字书写，已讲过的全文保留。模型指定每段的 `visualId` 和局部 `emphasis`；每张图必须有对应完整讲解，纯文字课不要求额外的 `board.write`。新生成材料缺少全文模式、图文关联或图示动作会被拒绝。整句、跨句与重叠重点也会被拒绝。

复杂概念通常拆成 2–4 个互补图；每段围绕一张图，多个段可以关联同一图，图数不能超过讲解段数。旁白需要包含完整条件、操作、中间结果和结论，不能因为全文展示而省略推导。播放器将图文成组排列，跟随当前讲解滚动；用户回看时暂停自动跟随。

可播放示例：`/examples/full-board`。字段、时间精度、交互规则和旧课升级见[全文板书与图文跟随](./full-board.md)。图数与教学质量仍需人工审稿；协议校验不能保证每个重点选得恰当。

## 多供应商配置

复制 `.env.example` 对应配置到忽略的 `.env.local`，文本模型配置与豆包语音配置独立。

```dotenv
LESSON_LLM_PROVIDER=openai-compatible
LESSON_LLM_MODEL=账号支持的模型ID
LESSON_LLM_API_KEY=在本地填写
LESSON_LLM_BASE_URL=https://api.openai.com/v1
```

| 协议                | 默认根地址                                         | 接口与认证                                                             |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `openai-compatible` | `https://api.openai.com/v1`                        | `/chat/completions`，Bearer，默认 JSON mode 与 `max_completion_tokens` |
| `anthropic`         | `https://api.anthropic.com/v1`                     | `/messages`，`x-api-key`、版本头与 `max_tokens`                        |
| `gemini`            | `https://generativelanguage.googleapis.com/v1beta` | `/models/<model>:generateContent`，`x-goog-api-key`、JSON MIME         |

实现合同分别核对 [OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat)、[Anthropic Messages API](https://platform.claude.com/docs/en/api/messages/create) 和 [Gemini GenerateContent API](https://ai.google.dev/api/generate-content)。本模块采用可跨厂商使用的 JSON mode 加本地完整校验，不把 JSON mode 等同于完整协议保证，也未实现供应商专属的 strict JSON Schema 功能。

DeepSeek、方舟文本模型、Qwen 等若所选端点兼容 Chat Completions，可保持 `openai-compatible`，换根地址、凭证和模型。兼容性取决于端点与模型，不代表每个厂商的全部模型已经实测。根地址包含 `/v1` 等版本路径，不再附加动作路径。Azure 等特殊认证、不同消息协议或本地 SDK 实现 `LessonDraftProvider`，不修改编译器。

不预设会过时的模型 ID，也不复用 `DOUBAO_SPEECH_API_KEY` 作为方舟文本模型凭证。部分兼容端点需 `tokenLimitField: 'max_tokens'`；不支持 JSON mode 时设 `jsonMode: false`，本地协议校验仍不会放宽。`openai-compatible` 和 `gemini` 默认不发送输出 token 上限，交由服务端决定；这不表示模型可以无限输出，某些服务端默认值反而较小。Anthropic Messages 要求 `max_tokens`，为兼容既有调用默认使用 8192。程序接口可用 `maxOutputTokens`，两个备课命令可用 `--max-output-tokens <正整数>` 显式指定预算；本地不设固定数值上限，实际支持范围由供应商验证。`--token-limit-field` 只选择字段名称，未指定预算时不会使兼容协议自动传入额度。请求超时仍为 120 秒，不主动设置可能与模型冲突的 temperature。

例如 [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) 当前说明：默认开启思考模式，未指定 `max_tokens` 时，非思考模式默认 8K，思考模式默认 64K（最高思考强度默认 128K）。这些是供应商默认值，可能随模型与接口更新；省略项目上限后仍可能遇到服务端截断或本地请求超时。

端点配置只能由可信宿主管理，不允许终端用户随意填地址。默认要求 HTTPS，拒绝 URL 中的凭证、query/hash，拒绝 HTTP 重定向；本地 HTTP 仅在程序接口显式 `allowInsecureLocalhost: true` 时允许回环地址。端点配置校验不是针对任意不可信 URL 的通用 SSRF 防护。密钥不进入前端、课程材料或生成报告。

## 本地命令

日常使用优先选[终端统一入口](./terminal-lesson.md)：`npm run lesson -- "主题" --generate` 会串联备课、编译和本地播放。以下命令用于单独操作上游模块。

```bash
# 离线预检需求，不请求模型、不读模型密钥、不保存文件
npm run lesson:draft -- --brief examples/briefs/water-cycle.json

# 明确请求文本模型；默认一次，不同时生成语音
npm run lesson:draft -- --brief examples/briefs/water-cycle.json --generate

# 显式允许最多一次额外材料修复请求，总请求数最多两次
npm run lesson:draft -- --brief examples/briefs/water-cycle.json --generate --repair-attempts 1

# 兼容端点选项
npm run lesson:draft -- --brief path/to/brief.json --generate --json-mode false --token-limit-field max_tokens

# 导入并校验人工材料，不需要任何模型配置
npm run lesson:draft -- --draft packages/content-generator/examples/temperature.draft.json

# 把生成/导入的 JSON 交给已有编译器；仅预检，不生成语音
npm run lesson:compile -- --draft outputs/drafts/<id>/<hash>/lesson.draft.json
```

默认输出在忽略的 `outputs/drafts/<id>/<材料和报告hash>/`，包含 `lesson.draft.json` 与 `generation.json`。`--output` 可指定目录，不覆盖不同文件。生成材料不会自动复制到播放器或 public，不自动调用付费 TTS；后续语音编译仍须明确 `--generate` 或使用 `--cached`。

## 扩展接口

```ts
import {
  generateLessonDraft,
  type LessonDraftProvider,
} from '@learn-anything/lesson-draft-generator';
const provider: LessonDraftProvider = {
  id: 'my-provider',
  model: 'my-model',
  async generate({ system, messages, signal }) {
    // 调用你的模型 SDK，传入 signal，检查拒绝/截断，返回最终材料文本。
    return { text: await myModelSdk.generate({ system, messages, signal }) };
  },
};
const result = await generateLessonDraft(brief, { provider });
// await compileLessonDraft(result.draft, compileOptions);
```

自定义适配器负责识别拒绝、截断和工具调用，遵守取消信号并限制响应；内置适配器已处理这些情况。`maxRepairAttempts` 默认 0，上限 2；只在材料校验失败时请求完整重写，模型请求失败不重试、不自动换供应商。调用者可按 `LessonDraftGenerationError.code` 区分 `invalid-input/invalid-output/provider-error/aborted`。

## 验收与边界

离线传输夹具覆盖三个协议的认证、消息、token 上限及响应解析，覆盖人工导入、全文模式与图文关联、重点范围、锚点/动作拒绝、备课约束、显式修复、超时、取消、响应大小、错误脱敏、CLI 离线预检和防覆盖。生成结果接入未修改的完整编译器；这里的新增集成使用语音和音频适配器夹具，不冒充真实付费模型或 MP3 合成验证。生产包集成测试同时覆盖仓库外生成模块 → 编译 → 播放器状态还原。

协议校验通过不等于知识正确、语言和受众完全符合要求、教学效果达标。生成报告始终 `humanReview: 'pending'`。实际词边界可能改变动作顺序，最终状态转换、板书删除顺序及音频越界仍以编译器复核为准。人工审稿、真实供应商账号联调、试听、更多主题教学评估、RAG、自动工具检索和新的动画语法不在此次离线验证内。

## 扩展表现能力

生成器通过可注入的 `CapabilityRegistry` 读取允许能力、配置与动作说明，提示不再写死语法清单。仓库宿主额外提供 `scene`，新增包在统一入口注册后自动进入备课范围。独立使用未传能力表时继续提供原四种能力。接口和时间字段规则见[能力包规范](./capability-packs.md)。
