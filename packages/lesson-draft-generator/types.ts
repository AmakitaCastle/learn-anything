import type { LessonDraft } from '@learn-anything/lesson-schema';

export const draftGrammars = [
  'flow',
  'state-transition',
  'plot',
  'array-search',
] as const;
export type DraftGrammar = (typeof draftGrammars)[number];
export type LessonBrief = {
  id: string;
  topic: string;
  audience: string;
  language?: string;
  objectives?: string[];
  sourceMaterial?: string;
  segmentCount?: number;
  // Editorial goal only. The compiler measures the actual audio duration.
  targetDurationSeconds?: number;
  allowedGrammars?: DraftGrammar[];
};
export type DraftMessage = { role: 'user' | 'assistant'; content: string };
export type DraftModelRequest = {
  system: string;
  messages: DraftMessage[];
  signal?: AbortSignal;
};
export type DraftModelResponse = {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};
// Implement this interface to add another protocol, SDK or local model.
export interface LessonDraftProvider {
  readonly id: string;
  readonly model: string;
  generate(request: DraftModelRequest): Promise<DraftModelResponse>;
}
export type DraftGenerationResult = {
  draft: LessonDraft;
  draftJson: string;
  report: {
    source: 'manual' | 'llm';
    attempts: number;
    provider?: string;
    model?: string;
    usage?: { inputTokens?: number; outputTokens?: number };
    humanReview: 'pending';
  };
};
export type DraftErrorCode =
  | 'invalid-input'
  | 'invalid-output'
  | 'provider-error'
  | 'aborted';
export type DraftDiagnostic = {
  reason:
    | 'http'
    | 'timeout'
    | 'network'
    | 'truncated'
    | 'refused'
    | 'non-text'
    | 'empty-output'
    | 'invalid-response'
    | 'response-too-large'
    | 'validation'
    | 'aborted';
  httpStatus?: number;
  validationMessage?: string;
};
export class LessonDraftGenerationError extends Error {
  readonly code: DraftErrorCode;
  readonly attempts: number;
  readonly diagnostic?: DraftDiagnostic;
  constructor(
    code: DraftErrorCode,
    message: string,
    attempts = 0,
    diagnostic?: DraftDiagnostic,
  ) {
    super(message);
    this.code = code;
    this.attempts = attempts;
    this.diagnostic = diagnostic;
    this.name = 'LessonDraftGenerationError';
  }
}
