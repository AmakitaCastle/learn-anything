# @learn-anything/lesson-draft-generator

独立 Node.js 上游材料生成模块：备课需求或人工 JSON → 校验后的 `LessonDraft 0.1.0`。仅依赖 `lesson-schema`，不依赖编译器、播放器、React 或应用框架；不生成音频、不执行模型输出、不保存文件。当前是 private workspace，未发布 npm。

支持三个协议适配器：`openai-compatible`、`anthropic`、`gemini`。其他兼容厂商配置 `baseUrl` 和账号可用的模型 ID；其他协议实现 `LessonDraftProvider`。切换文本模型不改变编译器的语音供应商。

```ts
import {
  createLessonDraftProvider,
  generateLessonDraft,
  importLessonDraft,
} from '@learn-anything/lesson-draft-generator';

const provider = createLessonDraftProvider({
  protocol: 'openai-compatible',
  apiKey: process.env.LESSON_LLM_API_KEY!, // 仅服务端
  model: process.env.LESSON_LLM_MODEL!,
  // baseUrl: 'https://供应商的API根地址/v1',
});
const result = await generateLessonDraft(
  {
    id: 'water-cycle-new',
    topic: '水循环',
    audience: '小学高年级学生',
    segmentCount: 6,
    allowedGrammars: ['flow'],
  },
  { provider },
);
// result.draft 可直接传给 compileLessonDraft(result.draft, compileOptions)。
// result.draftJson 是同一协议的 JSON；report.humanReview 始终为 pending。
const manual = importLessonDraft(humanAuthoredJson);
```

人工材料不会请求模型，也不会自动补齐缺失的板书或动画。`parseLessonDraftOutput()` 用于获得具体协议校验错误；接受对象、完整 JSON 文本或单个 JSON 代码围栏，不从解释性文字中猜测提取 JSON。

公开接口：

- `LessonBrief/parseLessonBrief()`：主题、受众、语言、目标、参考资料、片段数量、目标时长和允许语法。
- `buildLessonDraftPrompt()`、`DRAFT_PROMPT_VERSION`：可检查的跨供应商材料合同和备课提示。
- `LessonDraftProvider`：自定义模型扩展接口，统一 `system/messages/signal` 输入与 `text/usage` 输出。
- `createLessonDraftProvider(config, {fetch?})`：三个协议适配器，支持传输注入、输出上限、超时和取消。
- `generateLessonDraft(brief, {provider,maxRepairAttempts?,signal?})`：输出 `draft/draftJson/report`；校验协议、锚点、课程 ID、片段数、语法范围、全文模式及每图的讲解动作。
- `importLessonDraft()`：人工输入 → 同形产物，不强加 LLM 的备课需求约束。
- `readLessonDraftProviderConfig(env)`：显式读取 `LESSON_LLM_*`，不读取或复用语音凭证。
- `LessonDraftGenerationError`：安全错误，含 `code/attempts`，不附原始请求或响应。

默认只请求一次，额外修复次数默认 0，可显式设置 1 或 2（可能增加费用）。只修复未通过校验的材料；HTTP 错误、截断、拒绝、超时不自动重试，不自动切换供应商。报告只包含来源、模型、请求次数及白名单 token 用量，不包含凭证、参考资料或模型思考内容。

`openai-compatible` 和 `gemini` 默认省略输出 token 上限，使用服务端默认值；Anthropic 因协议必填默认使用 8192。可通过 `maxOutputTokens` 或命令行 `--max-output-tokens <正整数>` 显式设置预算。本地不设固定数值上限，模型与供应商仍有自己的限制。

```bash
npm run build -w @learn-anything/lesson-schema
npm run build -w @learn-anything/lesson-draft-generator
npm run typecheck -w @learn-anything/lesson-draft-generator
```

构建与离线测试不需要密钥。详细配置、本地命令、供应商兼容选项和验收边界见[材料生成模块](../../docs/lesson-draft-generator.md)。
