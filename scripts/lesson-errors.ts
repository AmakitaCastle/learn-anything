import {
  LessonDraftGenerationError,
  formatLessonDraftError,
} from '@learn-anything/lesson-draft-generator';
import { VideoExportError } from './lesson-video.ts';

// Only fixed adapter messages and bounded numeric status codes may be shown.
// Never print arbitrary exceptions, response bodies, environment or headers.
const messages = new Set([
  '音频时长无效。',
  '词时间戳无效。',
  '词时间戳超出音频或无效。',
  '时间戳与讲稿不一致。',
  '时间戳重叠。',
  '语音服务未返回音频。',
  '语音服务没有返回音频，未保存文件。',
  '语音请求未完成，请检查网络；不会自动重试以免重复计费。',
  '语音服务未返回预期的 SSE 响应，请检查接口与权限。',
  '语音合成超时，未保存音频。',
  '语音响应中断，未保存音频；不会自动重试。',
  '语音响应不是有效的 SSE JSON 数据。',
  '缓存文稿或词时间戳与材料不一致。',
  '已有语音缓存不可用，请手动移走对应缓存目录后重试。',
  '已有语音缓存损坏，请手动移走对应缓存目录后重试。',
  '缺少语音缓存；确认后开启 allowSynthesis 才会调用语音接口。',
  '数字不在允许范围内。',
  '课程音频时长与实测片段总长不一致。',
  '语义锚点偏移超出课程音频。',
  '全文板书与旁白或章节不一致。',
  '全文板书词时间戳无效。',
  '全文板书词时间戳与文稿不一致。',
  '本地音频处理失败，请检查 FFmpeg/FFprobe 和音频文件。',
  '编码后的音频时长与实测采样不一致。',
  '课程任务已取消。',
]);

export function formatLessonTaskError(error: unknown): string {
  if (error instanceof VideoExportError)
    return `课程任务失败：${error.message}`;
  if (error instanceof LessonDraftGenerationError)
    return formatLessonDraftError(error);
  const message = error instanceof Error ? error.message : '';
  if (
    messages.has(message) ||
    /^语音请求失败（HTTP [1-5]\d{2}），请检查语音密钥与服务权限。$/.test(
      message,
    ) ||
    /^语音合成失败(?:（错误码 \d{1,10}）)?，请检查语音权限、额度和音色版本。$/.test(
      message,
    )
  )
    return `课程任务失败：${message}未自动重试或覆盖已有课程。`;
  return '课程任务失败。检查输入、.env.local 中的文本模型／语音配置、FFmpeg 和输出目录。未自动重试或覆盖已有课程。';
}
