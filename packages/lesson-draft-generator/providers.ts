import {
  LessonDraftGenerationError,
  type DraftDiagnostic,
  type DraftModelRequest,
  type DraftModelResponse,
  type LessonDraftProvider,
} from './types.ts';

function failure(
  reason: DraftDiagnostic['reason'],
  httpStatus?: number,
): LessonDraftGenerationError {
  return new LessonDraftGenerationError('provider-error', '模型请求失败。', 0, {
    reason,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  });
}

export type DraftProviderProtocol =
  | 'openai-compatible'
  | 'anthropic'
  | 'gemini';
export type DraftProviderConfig = {
  protocol: DraftProviderProtocol;
  apiKey: string;
  model: string;
  baseUrl?: string;
  // Omit for the server default. Anthropic requires a value and falls back to 8192.
  maxOutputTokens?: number;
  timeoutMs?: number;
  // Some compatible endpoints do not implement JSON mode / modern token limits.
  jsonMode?: boolean;
  tokenLimitField?: 'max_completion_tokens' | 'max_tokens';
  allowInsecureLocalhost?: boolean;
};
const defaults: Record<DraftProviderProtocol, string> = {
  'openai-compatible': 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('模型响应无效。');
  return value as Record<string, unknown>;
}
function token(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
function output(
  text: unknown,
  inputTokens: unknown,
  outputTokens: unknown,
): DraftModelResponse {
  if (typeof text !== 'string' || !text.trim()) throw failure('empty-output');
  return {
    text,
    usage: {
      inputTokens: token(inputTokens),
      outputTokens: token(outputTokens),
    },
  };
}
function parseResponse(
  protocol: DraftProviderProtocol,
  value: unknown,
): DraftModelResponse {
  const data = object(value);
  if (protocol === 'openai-compatible') {
    if (!Array.isArray(data.choices) || data.choices.length !== 1)
      throw new Error('模型响应无效。');
    const choice = object(data.choices[0]);
    const message = object(choice.message);
    if (choice.finish_reason === 'length') throw failure('truncated');
    if (message.refusal || choice.finish_reason === 'content_filter')
      throw failure('refused');
    if (message.tool_calls || choice.finish_reason === 'tool_calls')
      throw failure('non-text');
    if (
      choice.finish_reason !== 'stop' ||
      message.refusal ||
      message.tool_calls
    )
      throw new Error('模型拒绝或输出未完成。');
    const usage = data.usage === undefined ? {} : object(data.usage);
    return output(
      message.content,
      usage.prompt_tokens,
      usage.completion_tokens,
    );
  }
  if (protocol === 'anthropic') {
    if (data.stop_reason === 'max_tokens') throw failure('truncated');
    if (data.stop_reason === 'refusal') throw failure('refused');
    if (data.stop_reason === 'tool_use') throw failure('non-text');
    if (data.stop_reason !== 'end_turn' || !Array.isArray(data.content))
      throw new Error('模型输出未完成。');
    const content = data.content.map(object);
    if (
      content.some(
        (item) =>
          !['text', 'thinking', 'redacted_thinking'].includes(
            String(item.type),
          ),
      )
    )
      throw failure('non-text');
    const usage = data.usage === undefined ? {} : object(data.usage);
    return output(
      content
        .filter((item) => item.type === 'text')
        .map((item) => {
          if (typeof item.text !== 'string') throw new Error('模型响应无效。');
          return item.text;
        })
        .join(''),
      usage.input_tokens,
      usage.output_tokens,
    );
  }
  if (!Array.isArray(data.candidates) || data.candidates.length !== 1)
    throw new Error('模型响应无效。');
  const candidate = object(data.candidates[0]);
  if (candidate.finishReason === 'MAX_TOKENS') throw failure('truncated');
  if (
    ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT'].includes(
      String(candidate.finishReason),
    )
  )
    throw failure('refused');
  if (candidate.finishReason !== 'STOP')
    throw new Error('模型拒绝或输出未完成。');
  const content = object(candidate.content);
  if (!Array.isArray(content.parts)) throw new Error('模型响应无效。');
  const parts = content.parts
    .map(object)
    .filter((part) => part.thought !== true);
  if (parts.some((part) => typeof part.text !== 'string' || part.functionCall))
    throw failure('non-text');
  const usage =
    data.usageMetadata === undefined ? {} : object(data.usageMetadata);
  return output(
    parts.map((part) => part.text).join(''),
    usage.promptTokenCount,
    usage.candidatesTokenCount,
  );
}

// Bounded streaming read, including the body in the request timeout.
async function responseJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw failure(
      response.ok ? 'invalid-response' : 'http',
      response.ok ? undefined : response.status,
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2_000_000) throw failure('response-too-large');
      chunks.push(part.value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw failure('invalid-response');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createLessonDraftProvider(
  config: DraftProviderConfig,
  dependencies: { fetch?: typeof fetch } = {},
): LessonDraftProvider {
  const protocol = config.protocol;
  if (!Object.hasOwn(defaults, protocol)) throw new Error('不支持的模型协议。');
  if (
    typeof config.apiKey !== 'string' ||
    !config.apiKey.trim() ||
    /[\r\n]/.test(config.apiKey)
  )
    throw new Error('模型凭证无效。');
  if (
    typeof config.model !== 'string' ||
    !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(config.model)
  )
    throw new Error('模型名称无效。');
  let url: URL;
  try {
    url = new URL(config.baseUrl ?? defaults[protocol]);
  } catch {
    throw new Error('模型端点地址无效。');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(
        config.allowInsecureLocalhost === true &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ))
  )
    throw new Error('模型端点必须是无凭证的 HTTPS；本地 HTTP 需显式允许。');
  const baseUrl = url.href.replace(/\/$/, '');
  const maxTokens =
    config.maxOutputTokens ?? (protocol === 'anthropic' ? 8192 : undefined);
  const timeoutMs = config.timeoutMs ?? 120000;
  if (
    (config.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(config.maxOutputTokens) ||
        config.maxOutputTokens <= 0)) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 600000 ||
    (config.jsonMode !== undefined && typeof config.jsonMode !== 'boolean') ||
    (config.tokenLimitField !== undefined &&
      !['max_completion_tokens', 'max_tokens'].includes(config.tokenLimitField))
  )
    throw new Error('模型生成选项无效。');
  // Capture primitives; subsequent caller mutations cannot change the destination/key.
  const apiKey = config.apiKey;
  const model = config.model;
  const jsonMode = config.jsonMode ?? true;
  const tokenLimitField = config.tokenLimitField ?? 'max_completion_tokens';
  const transport = dependencies.fetch ?? fetch;
  return {
    id: protocol,
    model,
    async generate(request: DraftModelRequest) {
      const signal = request.signal
        ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);
      if (signal.aborted) throw new Error('模型请求已取消。');
      let endpoint: string;
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      let body: unknown;
      if (protocol === 'openai-compatible') {
        endpoint = `${baseUrl}/chat/completions`;
        headers.authorization = `Bearer ${apiKey}`;
        body = {
          model,
          messages: [
            { role: 'system', content: request.system },
            ...request.messages,
          ],
          ...(maxTokens === undefined ? {} : { [tokenLimitField]: maxTokens }),
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        };
      } else if (protocol === 'anthropic') {
        endpoint = `${baseUrl}/messages`;
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model,
          system: request.system,
          messages: request.messages,
          max_tokens: maxTokens,
        };
      } else {
        endpoint = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
        headers['x-goog-api-key'] = apiKey;
        body = {
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.messages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
          generationConfig: {
            ...(maxTokens === undefined ? {} : { maxOutputTokens: maxTokens }),
            ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        };
      }
      try {
        const response = await transport(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
          redirect: 'error',
        });
        const data = await responseJson(response);
        let result;
        try {
          result = parseResponse(protocol, data);
        } catch (error) {
          throw error instanceof LessonDraftGenerationError
            ? error
            : failure('invalid-response');
        }
        signal.throwIfAborted();
        return result;
      } catch (error) {
        // Never expose response bodies, URLs, headers, credentials or fetch errors.
        if (request.signal?.aborted) throw failure('aborted');
        if (signal.aborted) throw failure('timeout');
        if (error instanceof LessonDraftGenerationError) throw error;
        throw failure('network');
      }
    },
  };
}

// Text-model configuration is deliberately separate from DOUBAO_SPEECH_*.
export function readLessonDraftProviderConfig(
  env: Record<string, string | undefined>,
): DraftProviderConfig {
  const protocol = env.LESSON_LLM_PROVIDER;
  if (
    !protocol ||
    !Object.hasOwn(defaults, protocol) ||
    !env.LESSON_LLM_MODEL ||
    !env.LESSON_LLM_API_KEY
  )
    throw new Error(
      '请配置 LESSON_LLM_PROVIDER、LESSON_LLM_MODEL 和 LESSON_LLM_API_KEY。',
    );
  return {
    protocol: protocol as DraftProviderProtocol,
    model: env.LESSON_LLM_MODEL,
    apiKey: env.LESSON_LLM_API_KEY,
    ...(env.LESSON_LLM_BASE_URL ? { baseUrl: env.LESSON_LLM_BASE_URL } : {}),
  };
}
