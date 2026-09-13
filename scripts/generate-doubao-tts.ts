import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { cachedSpeech, saveSpeech } from '@learn-anything/content-generator/tts/cache';
import {
  readDoubaoConfig,
  speechCacheKey,
  synthesizeDoubao,
} from '@learn-anything/content-generator/tts/doubao';
import { lessonNarration } from '@learn-anything/content-generator/tts/narration';

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'preview' },
      generate: { type: 'boolean', default: false },
      subtitles: { type: 'boolean', default: false },
    },
  });
  if (values.mode !== 'preview' && values.mode !== 'lesson') {
    throw new Error('--mode 只能是 preview 或 lesson。');
  }
  const source = new URL(
    '../public/lessons/binary-search.json',
    import.meta.url,
  );
  const narration = lessonNarration(
    JSON.parse(await readFile(source, 'utf8')),
    values.mode,
  );
  const characters = Array.from(narration.text).length;
  console.log(
    `${values.mode === 'preview' ? '短段试听' : '整课旁白'}：${characters} 字符，${narration.cues.length} 个原始旁白片段。`,
  );
  if (!values.generate) {
    console.log(
      '当前仅预检，不请求接口、不消耗额度。配置 .env.local 后加 --generate 才实际生成。',
    );
    console.log(narration.text);
    return;
  }
  const config = readDoubaoConfig(process.env);
  config.subtitles = values.subtitles;
  const key = speechCacheKey(narration.text, config);
  const root = fileURLToPath(
    new URL('../outputs/tts/doubao/', import.meta.url),
  );
  const cached = await cachedSpeech(root, key);
  if (cached) {
    console.log(`复用本地缓存，没有请求语音接口：\n${cached}`);
    return;
  }
  console.log('开始合成；本次请求可能消耗试用额度或产生费用，不会自动重试。');
  const result = await synthesizeDoubao(narration.text, config);
  const audioPath = await saveSpeech(root, key, result.audio, {
    schemaVersion: 1,
    provider: 'doubao',
    createdAt: new Date().toISOString(),
    mode: values.mode,
    text: narration.text,
    speaker: config.speaker,
    resourceId: config.resourceId,
    speechRate: config.speechRate,
    subtitlesRequested: config.subtitles,
    logId: result.logId,
    providerMetadata: result.metadata,
    sourceCues: narration.cues,
    alignmentStatus: 'pending',
    note: 'originalAt 仅用于参考旧课堂，不是新音频时间戳；禁止直接替换旧音频。',
  });
  console.log(`音频已生成，正式课堂未修改：\n${audioPath}`);
  console.log('先试听，再测实际时长、核对发音，并重新对齐字幕与板书后发布。');
}

main().catch((error: unknown) => {
  // Do not dump stacks, response bodies, environment variables or request headers.
  console.error(error instanceof Error ? error.message : '语音生成失败。');
  process.exitCode = 1;
});
