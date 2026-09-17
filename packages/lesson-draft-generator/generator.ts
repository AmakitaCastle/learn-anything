import {
  parseLessonDraft,
  phraseRange,
  sentenceRanges,
  spokenText,
  type LessonDraft,
  type CapabilityRegistry,
} from '@learn-anything/lesson-schema';
import { buildLessonDraftPrompt } from './prompt.ts';
import { validationDiagnostic } from './diagnostics.ts';
import {
  LessonDraftGenerationError,
  type DraftGenerationResult,
  type DraftGrammar,
  type DraftMessage,
  type LessonDraftProvider,
} from './types.ts';

function decodeLessonDraftOutput(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length > 1_000_000) throw new Error('模型材料过长。');
    const source = value.trim();
    const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(source);
    try {
      value = JSON.parse(fenced ? fenced[1] : source);
    } catch {
      throw new Error('材料必须是单个完整 JSON 对象。');
    }
  }
  return value;
}

export function parseLessonDraftOutput(
  value: unknown,
  capabilities?: CapabilityRegistry,
): LessonDraft {
  return parseLessonDraft(decodeLessonDraftOutput(value), capabilities);
}

// Emphasis is optional decoration. Drop only marks whose text range is known
// to be a whole sentence, cross a sentence, or overlap another kept mark.
// All other material still goes through the unchanged schema validator.
function removeInvalidGeneratedEmphasis(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const segments = (value as Record<string, unknown>).segments;
  if (!Array.isArray(segments)) return 0;
  let removed = 0;
  for (const segment of segments) {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment))
      continue;
    const item = segment as Record<string, unknown>;
    if (
      typeof item.text !== 'string' ||
      !Array.isArray(item.emphasis) ||
      item.emphasis.length > 8
    )
      continue;
    const chars = Array.from(item.text);
    const indices = chars.flatMap((char, index) =>
      spokenText(char) ? [index] : [],
    );
    const sentences = sentenceRanges(item.text);
    const kept: unknown[] = [];
    const ranges: { start: number; end: number }[] = [];
    for (const mark of item.emphasis) {
      if (!mark || typeof mark !== 'object' || Array.isArray(mark)) {
        kept.push(mark);
        continue;
      }
      const emphasis = mark as Record<string, unknown>;
      if (
        Object.keys(emphasis).some(
          (key) => !['phrase', 'occurrence'].includes(key),
        ) ||
        typeof emphasis.phrase !== 'string' ||
        emphasis.phrase.length > 40 ||
        (emphasis.occurrence !== undefined &&
          (!Number.isInteger(emphasis.occurrence) ||
            (emphasis.occurrence as number) < 1 ||
            (emphasis.occurrence as number) > 2000))
      ) {
        kept.push(mark);
        continue;
      }
      let range: { start: number; end: number };
      try {
        const spoken = phraseRange(
          item.text,
          emphasis.phrase,
          emphasis.occurrence as number | undefined,
        );
        range = {
          start: indices[spoken.start],
          end: indices[spoken.end - 1] + 1,
        };
      } catch {
        kept.push(mark);
        continue;
      }
      const sentence = sentences.find(
        (sentence) =>
          sentence.start <= range.start && sentence.end >= range.end,
      );
      const invalid =
        !sentence ||
        spokenText(chars.slice(sentence.start, sentence.end).join('')) ===
          spokenText(emphasis.phrase) ||
        ranges.some(
          (keptRange) =>
            range.start < keptRange.end && range.end > keptRange.start,
        );
      if (invalid) {
        removed++;
      } else {
        kept.push(mark);
        ranges.push(range);
      }
    }
    if (kept.length) item.emphasis = kept;
    else delete item.emphasis;
  }
  return removed;
}

function parseGeneratedOutput(
  value: string,
  capabilities?: CapabilityRegistry,
): { draft: LessonDraft; removedEmphasis: number } {
  const decoded = decodeLessonDraftOutput(value);
  try {
    return {
      draft: parseLessonDraft(decoded, capabilities),
      removedEmphasis: 0,
    };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      ![
        '重点只能选择局部文字。',
        '重点文字范围无效。',
        '重点不能覆盖整句或跨句。',
      ].includes(error.message)
    )
      throw error;
    const removedEmphasis = removeInvalidGeneratedEmphasis(decoded);
    if (!removedEmphasis) throw error;
    return {
      draft: parseLessonDraft(decoded, capabilities),
      removedEmphasis,
    };
  }
}

function artifacts(
  draft: LessonDraft,
  report: DraftGenerationResult['report'],
): DraftGenerationResult {
  return { draft, draftJson: JSON.stringify(draft, null, 2) + '\n', report };
}
export function importLessonDraft(
  value: unknown,
  capabilities?: CapabilityRegistry,
): DraftGenerationResult {
  try {
    return artifacts(parseLessonDraftOutput(value, capabilities), {
      source: 'manual',
      attempts: 0,
      humanReview: 'pending',
    });
  } catch {
    throw new LessonDraftGenerationError(
      'invalid-input',
      '人工材料不符合 LessonDraft 0.1.0，请用 parseLessonDraftOutput 检查。',
    );
  }
}
function cancelled(signal?: AbortSignal, attempts = 0) {
  if (signal?.aborted)
    throw new LessonDraftGenerationError(
      'aborted',
      '材料生成已取消。',
      attempts,
    );
}
function safeLabel(value: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(value))
    throw new Error('Provider 标识或模型名称无效。');
  return value;
}

export async function generateLessonDraft(
  value: unknown,
  options: {
    provider: LessonDraftProvider;
    capabilities?: CapabilityRegistry;
    maxRepairAttempts?: number;
    signal?: AbortSignal;
  },
): Promise<DraftGenerationResult> {
  let prompt: ReturnType<typeof buildLessonDraftPrompt>;
  let providerId: string;
  let model: string;
  const repairs = options.maxRepairAttempts ?? 0;
  try {
    prompt = buildLessonDraftPrompt(value, options.capabilities);
    providerId = safeLabel(options.provider.id);
    model = safeLabel(options.provider.model);
    if (typeof options.provider.generate !== 'function')
      throw new Error('Provider 缺少生成接口。');
    if (!Number.isInteger(repairs) || repairs < 0 || repairs > 2)
      throw new Error('修复次数无效。');
  } catch {
    throw new LessonDraftGenerationError(
      'invalid-input',
      '备课需求、Provider 或修复次数无效；未调用模型。',
    );
  }
  const messages: DraftMessage[] = [{ role: 'user', content: prompt.user }];
  const usage: { inputTokens?: number; outputTokens?: number } = {};
  for (let attempt = 1; attempt <= repairs + 1; attempt++) {
    cancelled(options.signal, attempt - 1);
    let response;
    try {
      response = await options.provider.generate({
        system: prompt.system,
        messages: messages.map((item) => ({ ...item })),
        signal: options.signal,
      });
      if (!response || typeof response.text !== 'string')
        throw new Error('模型响应无效。');
    } catch (error) {
      cancelled(options.signal, attempt);
      throw new LessonDraftGenerationError(
        'provider-error',
        '模型请求失败、超时、拒绝或输出截断；不自动重试或切换供应商。',
        attempt,
        error instanceof LessonDraftGenerationError
          ? error.diagnostic
          : undefined,
      );
    }
    cancelled(options.signal, attempt);
    for (const key of ['inputTokens', 'outputTokens'] as const) {
      const count = response.usage?.[key];
      if (
        typeof count === 'number' &&
        Number.isSafeInteger(count) &&
        count >= 0
      )
        usage[key] = (usage[key] ?? 0) + count;
    }
    let draft: LessonDraft;
    let removedEmphasis = 0;
    try {
      if (typeof response.text !== 'string')
        throw new Error('模型返回非文本材料。');
      ({ draft, removedEmphasis } = parseGeneratedOutput(
        response.text,
        options.capabilities,
      ));
      if (draft.id !== prompt.brief.id)
        throw new Error('材料 id 必须等于 brief.id。');
      if (draft.segments.length !== prompt.brief.segmentCount)
        throw new Error('材料片段数量必须等于 brief.segmentCount。');
      if (
        draft.visuals.some(
          (visual) =>
            !prompt.brief.allowedGrammars!.includes(
              visual.grammar as DraftGrammar,
            ),
        )
      )
        throw new Error('材料使用了备课需求范围外的动画语法。');
      if (draft.boardMode !== 'full-narration')
        throw new Error('生成材料必须使用全文板书模式。');
      if (
        draft.visuals.some(
          (visual) =>
            !draft.events.some(
              (event) =>
                event.type === 'visual' && event.visualId === visual.id,
            ),
        )
      )
        throw new Error('图示必须安排讲解动作。');
    } catch (error) {
      const diagnostic = validationDiagnostic(error);
      if (
        attempt > repairs ||
        typeof response.text !== 'string' ||
        response.text.length > 1_000_000
      )
        throw new LessonDraftGenerationError(
          'invalid-output',
          '模型材料未通过协议或备课约束校验；未交给编译器。',
          attempt,
          diagnostic,
        );
      // Do not echo arbitrary validator/provider exception text into prompts or logs.
      messages.push(
        { role: 'assistant', content: response.text },
        {
          role: 'user',
          content: `上次输出未通过校验：${diagnostic.validationMessage} 请检查完整 JSON、版本、brief.id、片段数量、全文板书模式、每图的旁白关联与讲解动作、允许语法、局部重点、所有引用及短语锚点，严格按系统合同重新输出完整材料。`,
        },
      );
      continue;
    }
    return artifacts(draft, {
      source: 'llm',
      attempts: attempt,
      provider: providerId,
      model,
      ...(Object.keys(usage).length ? { usage } : {}),
      ...(removedEmphasis ? { removedEmphasis } : {}),
      humanReview: 'pending',
    });
  }
  throw new LessonDraftGenerationError('invalid-output', '材料生成失败。');
}
