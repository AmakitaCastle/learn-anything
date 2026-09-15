// Node-only project: no React, browser rendering or playback-clock dependency.
export {
  createTegakiHandwritingProvider,
  generateHandwritingCharacters,
  type HandwritingOptions,
  lessonHandwritingCharacters,
  type LessonHandwritingProvider,
  type HandwritingResources,
} from './handwriting.ts';
export {
  parseLessonDraft,
  type LessonDraft,
  type LessonAnchor,
  type DraftEvent,
} from '@learn-anything/lesson-schema';
export {
  compileLessonDraft,
  compileAlignedLessonDraft,
  type LessonSpeechProvider,
  type CompiledLesson,
  type CompileReport,
  type DraftArtifacts,
  type AlignedDraftSegment,
  type DraftCompileOptions,
} from './compiler.ts';
export {
  createFfmpegAudioProcessor,
  type LessonAudioProcessor,
} from './audio.ts';
export { createDoubaoSpeechProvider } from './tts/provider.ts';
export {
  createLessonArtifacts,
  type LessonArtifacts,
  type DraftGenerator,
} from './artifacts.ts';
export {
  alignedSegment,
  spokenText,
  type AlignedWord,
} from './tts/segment-alignment.ts';
export { cachedSpeech, saveSpeech } from './tts/cache.ts';
export {
  readDoubaoConfig,
  speechCacheKey,
  synthesizeDoubao,
  type DoubaoConfig,
  type SpeechResult,
} from './tts/doubao.ts';
