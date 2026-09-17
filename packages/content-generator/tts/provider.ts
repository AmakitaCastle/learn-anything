import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LessonSpeechProvider } from '../compiler.ts';
import { cachedSpeech, saveSpeech } from './cache.ts';
import {
  speechCacheKey,
  synthesizeDoubao,
  type DoubaoConfig,
  type SpeechResult,
} from './doubao.ts';

export function createDoubaoSpeechProvider(options: {
  config: DoubaoConfig;
  cacheRoot: string;
  // Default is safe offline reuse. A cache miss never silently spends credits.
  allowSynthesis?: boolean;
  fetcher?: typeof fetch;
  onSegment?: (status: { id: string; source: 'cache' | 'synthesis' }) => void;
}): LessonSpeechProvider {
  const config = { ...options.config, subtitles: true };
  return {
    async synthesize(segment): Promise<SpeechResult> {
      const key = speechCacheKey(segment.text, config);
      let path = await cachedSpeech(options.cacheRoot, key);
      if (!path) {
        if (!options.allowSynthesis)
          throw new Error(
            '缺少语音缓存；确认后开启 allowSynthesis 才会调用语音接口。',
          );
        options.onSegment?.({ id: segment.id, source: 'synthesis' });
        const result = await synthesizeDoubao(
          segment.text,
          config,
          options.fetcher,
        );
        path = await saveSpeech(options.cacheRoot, key, result.audio, {
          schemaVersion: 1,
          provider: config.endpoint ? 'doubao-compatible' : 'doubao',
          mode: 'lesson-draft-segment',
          text: segment.text,
          speaker: config.speaker,
          resourceId: config.resourceId,
          speechRate: config.speechRate,
          providerMetadata: result.metadata,
          createdAt: new Date().toISOString(),
        });
      } else options.onSegment?.({ id: segment.id, source: 'cache' });
      const manifest = JSON.parse(
        await readFile(join(dirname(path), 'manifest.json'), 'utf8'),
      );
      if (
        manifest.text !== segment.text ||
        !Array.isArray(manifest.providerMetadata)
      )
        throw new Error('缓存文稿或词时间戳与材料不一致。');
      return {
        audio: await readFile(path),
        metadata: manifest.providerMetadata,
        logId: null,
      };
    },
  };
}

export const createDoubaoCompatibleSpeechProvider = createDoubaoSpeechProvider;
