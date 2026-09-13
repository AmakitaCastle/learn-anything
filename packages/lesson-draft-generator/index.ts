// Node-only upstream module. No compiler, TTS, playback or application imports.
export { formatLessonDraftError } from './diagnostics.ts';
export {
  generateLessonDraft,
  importLessonDraft,
  parseLessonDraftOutput,
} from './generator.ts';
export {
  buildLessonDraftPrompt,
  parseLessonBrief,
  DRAFT_PROMPT_VERSION,
} from './prompt.ts';
export {
  createLessonDraftProvider,
  readLessonDraftProviderConfig,
  type DraftProviderConfig,
  type DraftProviderProtocol,
} from './providers.ts';
export {
  draftGrammars,
  LessonDraftGenerationError,
  type DraftErrorCode,
  type DraftGrammar,
  type LessonBrief,
  type LessonDraftProvider,
  type DraftMessage,
  type DraftModelRequest,
  type DraftModelResponse,
  type DraftGenerationResult,
} from './types.ts';
export { type LessonDraft } from '@learn-anything/lesson-schema';
