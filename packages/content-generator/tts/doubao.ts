// Node-only adapter. Never import this module into the classroom client.
import { createHash, randomUUID } from 'node:crypto';

export const DOUBAO_TTS_ENDPOINT =
  'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse';
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;
const MAX_EVENT_CHARACTERS = 4 * 1024 * 1024;
class SpeechProtocolError extends Error {}

export type DoubaoConfig = {
  apiKey: string;
  resourceId: string;
  speaker: string;
  speechRate: number;
  subtitles?: boolean;
};

export type SpeechResult = {
  audio: Buffer;
  // Preserve optional provider timing/usage fields without guessing their units.
  metadata: Record<string, unknown>[];
  logId: string | null;
};

export function readDoubaoConfig(
  env: Record<string, string | undefined>,
): DoubaoConfig {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value || /[\r\n]/.test(value)) {
      throw new Error(`请在 .env.local 中填写有效的 ${name}。`);
    }
    return value;
  };
  const speechRate = Number(env.DOUBAO_TTS_SPEECH_RATE ?? '0');
  if (!Number.isInteger(speechRate) || speechRate < -50 || speechRate > 100) {
    throw new Error('DOUBAO_TTS_SPEECH_RATE 必须是 -50 到 100 的整数。');
  }
  return {
    apiKey: required('DOUBAO_SPEECH_API_KEY'),
    resourceId: required('DOUBAO_TTS_RESOURCE_ID'),
    speaker: required('DOUBAO_TTS_SPEAKER'),
    speechRate,
  };
}

export function speechRequest(text: string, config: DoubaoConfig) {
  const trimmed = text.trim();
  // Conservative application limit, not a claimed provider maximum.
  if (!trimmed || Array.from(trimmed).length > 2000) {
    throw new Error('本阶段每次合成支持 1～2000 字符，请先缩短讲稿。');
  }
  return {
    user: { uid: 'learn-anything' },
    req_params: {
      text: trimmed,
      speaker: config.speaker,
      sample_rate: 24000,
      audio_params: {
        format: 'mp3',
        bit_rate: 128000,
        speech_rate: config.speechRate,
        loudness_rate: 0,
        ...(config.subtitles ? { enable_subtitle: true } : {}),
      },
    },
  };
}

export function speechCacheKey(text: string, config: DoubaoConfig): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        adapterVersion: 1,
        endpoint: DOUBAO_TTS_ENDPOINT,
        resourceId: config.resourceId,
        request: speechRequest(text, config),
      }),
    )
    .digest('hex');
}

export function safeLogId(value: string | null): string | null {
  return value && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}

export async function readSpeechStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Pick<SpeechResult, 'audio' | 'metadata'>> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunks: Buffer[] = [];
  const metadata: Record<string, unknown>[] = [];
  let pending = '';
  let eventLines: string[] = [];
  let receivedBytes = 0;
  let eventCharacters = 0;
  let completed = false;

  const event = () => {
    if (!eventLines.length) return;
    if (completed)
      throw new SpeechProtocolError('语音响应在结束标记后仍包含数据。');
    let packet: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(eventLines.join('\n'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error();
      }
      packet = parsed as Record<string, unknown>;
    } catch {
      throw new SpeechProtocolError('语音响应不是有效的 SSE JSON 数据。');
    }
    eventLines = [];
    eventCharacters = 0;
    const code = packet.code;
    if (code !== 0 && code !== 20000000) {
      const suffix =
        typeof code === 'number' && Number.isInteger(code)
          ? `（错误码 ${code}）`
          : '';
      // Never echo raw messages; they can contain credentials/request content.
      throw new SpeechProtocolError(
        `语音合成失败${suffix}，请检查语音权限、额度和音色版本。`,
      );
    }
    // Control/metadata packets may explicitly use data=null. The official
    // client skips empty data; do not try to decode it as an audio packet.
    if (
      packet.data !== undefined &&
      packet.data !== null &&
      packet.data !== ''
    ) {
      if (
        typeof packet.data !== 'string' ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          packet.data,
        )
      ) {
        const dataType = Array.isArray(packet.data)
          ? 'array'
          : typeof packet.data;
        throw new SpeechProtocolError(
          `语音响应包含无效的 Base64 音频（code=${code}, data类型=${dataType}）。`,
        );
      }
      const audio = Buffer.from(packet.data, 'base64');
      if (audio.toString('base64') !== packet.data) {
        throw new SpeechProtocolError('语音响应包含非规范的 Base64 音频。');
      }
      chunks.push(audio);
    }
    const fields = Object.fromEntries(
      ['sentence', 'audio_info', 'usage', 'subtitle', 'subtitles']
        .filter((key) => key in packet)
        .map((key) => [key, packet[key]]),
    );
    if (Object.keys(fields).length) metadata.push(fields);
    if (code === 20000000) completed = true;
  };
  const line = (value: string) => {
    if (!value) {
      event();
    } else if (value.startsWith('data:')) {
      const data = value.slice(5).replace(/^ /, '');
      eventCharacters += data.length;
      if (eventCharacters > MAX_EVENT_CHARACTERS)
        throw new SpeechProtocolError('语音响应事件过大。');
      eventLines.push(data);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_RESPONSE_BYTES)
        throw new SpeechProtocolError('语音响应超过本地大小限制。');
      pending += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = pending.indexOf('\n')) !== -1) {
        line(pending.slice(0, end).replace(/\r$/, ''));
        pending = pending.slice(end + 1);
      }
      if (pending.length > MAX_EVENT_CHARACTERS)
        throw new SpeechProtocolError('语音响应行过大。');
    }
    pending += decoder.decode();
    if (pending) line(pending.replace(/\r$/, ''));
    event();
    if (!chunks.length || chunks.every((chunk) => chunk.length === 0)) {
      throw new SpeechProtocolError('语音服务没有返回音频，未保存文件。');
    }
    // The official sample accepts code=0 packets through normal EOF as well
    // as code=20000000. Transport errors and malformed tails still fail.
    return { audio: Buffer.concat(chunks), metadata };
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function synthesizeDoubao(
  text: string,
  config: DoubaoConfig,
  fetcher: typeof fetch = fetch,
): Promise<SpeechResult> {
  const request = speechRequest(text, config);
  // Revalidate callers too; invalid/missing credentials must not reach fetch.
  readDoubaoConfig({
    DOUBAO_SPEECH_API_KEY: config.apiKey,
    DOUBAO_TTS_RESOURCE_ID: config.resourceId,
    DOUBAO_TTS_SPEAKER: config.speaker,
    DOUBAO_TTS_SPEECH_RATE: String(config.speechRate),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    let response: Response;
    try {
      response = await fetcher(DOUBAO_TTS_ENDPOINT, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': config.apiKey,
          'X-Api-Resource-Id': config.resourceId,
          'X-Api-Request-Id': randomUUID(),
        },
        body: JSON.stringify(request),
      });
    } catch {
      throw new Error('语音请求未完成，请检查网络；不会自动重试以免重复计费。');
    }
    const logId = safeLogId(response.headers.get('x-tt-logid'));
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error(
        `语音请求失败（HTTP ${response.status}），请检查语音密钥与服务权限。`,
      );
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/event-stream')) {
      await response.body.cancel().catch(() => {});
      throw new Error('语音服务未返回预期的 SSE 响应，请检查接口与权限。');
    }
    try {
      return { ...(await readSpeechStream(response.body)), logId };
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error('语音合成超时，未保存音频。');
      // Stream transport errors can carry arbitrary upstream messages.
      if (error instanceof SpeechProtocolError) throw error;
      throw new Error('语音响应中断，未保存音频；不会自动重试。');
    }
  } finally {
    clearTimeout(timer);
  }
}
