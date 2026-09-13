import {
  parseLessonDraft,
  presentationTimes,
  resolveDraftConfig,
  validateBuiltinVisuals,
  parseHandwritingBundle,
  phraseRange,
  spokenText,
  type LessonAnchor,
  type LessonDraft,
  type TimelineEvent,
} from '@learn-anything/lesson-schema';
import { createLessonArtifacts, type LessonArtifacts } from './artifacts.ts';
import { alignedSegment, type AlignedWord } from './tts/segment-alignment.ts';
import type { SpeechResult } from './tts/doubao.ts';
import {
  createTegakiHandwritingProvider,
  type LessonHandwritingProvider,
} from './handwriting.ts';
import {
  createFfmpegAudioProcessor,
  PCM_BYTES_PER_SECOND,
  type LessonAudioProcessor,
} from './audio.ts';

export interface LessonSpeechProvider {
  synthesize(segment: LessonDraft['segments'][number]): Promise<SpeechResult>;
}
export type AlignedDraftSegment = {
  id: string;
  text: string;
  duration: number;
  metadata: Record<string, unknown>[];
};
export type CompileReport = {
  method: 'speech-word-anchors';
  duration: number;
  decodedDuration: number;
  pauseBetweenSegments: number;
  segments: {
    id: string;
    start: number;
    duration: number;
    wordCount: number;
    lowConfidenceWords: AlignedWord[];
  }[];
  anchors: { target: string; when: LessonAnchor; at: number }[];
  humanReview: 'pending';
  handwriting?: {
    method: 'tegaki-font-skeleton';
    glyphCount: number;
    missing: string[];
  };
};
export type DraftArtifacts = LessonArtifacts & { report: CompileReport };
export type CompiledLesson = DraftArtifacts & {
  audio: Buffer;
  handwritingFont?: Buffer;
};
export type DraftCompileOptions = {
  pauseBetweenSegments?: number;
  resources?: { audio: string; captions?: string };
};

function pauseSeconds(value = 0.15) {
  if (!Number.isFinite(value) || value < 0 || value > 5)
    throw new Error('片段间停顿必须是 0～5 秒。');
  return (
    (Math.round((value * PCM_BYTES_PER_SECOND) / 2) * 2) / PCM_BYTES_PER_SECOND
  );
}

// Common, deterministic compile stage. Inputs must include actual word metadata
// and measured segment durations; no topic-specific callback/rules are accepted.
export function compileAlignedLessonDraft(
  input: unknown,
  segments: AlignedDraftSegment[],
  options: DraftCompileOptions & { duration?: number } = {},
): DraftArtifacts {
  const draft = parseLessonDraft(input);
  const pause = pauseSeconds(options.pauseBetweenSegments);
  if (segments.length !== draft.segments.length)
    throw new Error('实测旁白片段不完整。');
  let cursor = 0;
  const aligned = segments.map((segment, index) => {
    if (
      segment.id !== draft.segments[index].id ||
      segment.text !== draft.segments[index].text
    )
      throw new Error('实测片段顺序或文稿与材料不一致。');
    const alignment = alignedSegment(
      segment.text,
      segment.metadata,
      segment.duration,
    );
    const value = { ...segment, alignment, start: cursor };
    cursor += segment.duration + (index < segments.length - 1 ? pause : 0);
    return value;
  });
  const audioDuration = options.duration ?? cursor;
  if (
    !Number.isFinite(audioDuration) ||
    audioDuration <= 0 ||
    audioDuration > 7200 ||
    Math.abs(audioDuration - cursor) > 0.1
  )
    throw new Error('课程音频时长与实测片段总长不一致。');
  // Encoders may round the measured samples to microseconds. Keep the same
  // endpoint as the segment/anchor timeline for differences at that precision,
  // including floating-point addition drift across multiple segments.
  const duration =
    Math.abs(audioDuration - cursor) <= 0.000001 ? cursor : audioDuration;
  const anchors: CompileReport['anchors'] = [];
  const resolve = (when: LessonAnchor, target: string) => {
    const segment = aligned.find((segment) => segment.id === when.segment)!;
    const span =
      when.phrase === undefined
        ? { start: 0, end: segment.duration }
        : segment.alignment.span(when.phrase, when.occurrence);
    const at =
      segment.start +
      (when.edge === 'end' ? span.end : span.start) +
      (when.offset ?? 0);
    if (!Number.isFinite(at) || at < 0 || at > duration)
      throw new Error('语义锚点偏移超出课程音频。');
    anchors.push({ target, when, at });
    return at;
  };
  const events: TimelineEvent[] = draft.segments.map((segment, index) => ({
    at: aligned[index].start,
    type: 'chapter',
    chapterId: segment.id,
  }));
  for (const [index, event] of draft.events.entries()) {
    const { when, ...data } = event;
    events.push({
      ...data,
      at: resolve(when, `events.${index}`),
    } as TimelineEvent);
  }
  events.sort((a, b) => a.at - b.at); // Stable author order for same-time actions.
  const board = new Set<string>();
  for (const event of events) {
    if (event.type === 'board.write') board.add(event.item.id);
    if (event.type === 'board.mark') board.add(event.mark.id);
    if (event.type === 'board.remove' && !board.delete(event.id))
      throw new Error('板书删除发生在内容出现前或重复删除。');
  }
  const artifacts = createLessonArtifacts({
    schemaVersion: '0.1.0',
    id: draft.id,
    title: draft.title,
    eyebrow: draft.eyebrow.replaceAll(
      '{duration}',
      String(Math.round(duration)),
    ),
    duration,
    audio: options.resources?.audio ?? `/audio/${draft.id}.mp3`,
    captions: options.resources
      ? options.resources.captions
      : `/lessons/${draft.id}.vtt`,
    chapters: draft.segments.map((segment, index) => ({
      id: segment.id,
      label: segment.label,
      at: aligned[index].start,
    })),
    narration: draft.segments.map((segment, index) => ({
      text: segment.text,
      at: aligned[index].start,
    })),
    ...(draft.boardMode !== 'full-narration'
      ? {}
      : {
          teaching: draft.segments.map((segment, index) => {
            const measured = aligned[index];
            const rawIndices = Array.from(segment.text).flatMap(
              (char, index) => (spokenText(char) ? [index] : []),
            );
            return {
              id: segment.id,
              label: segment.label,
              text: segment.text,
              at: measured.start,
              endAt: measured.start + measured.duration,
              ...(segment.visualId ? { visualId: segment.visualId } : {}),
              words: measured.alignment.words.map((word) => ({
                text: word.word,
                at: measured.start + word.startTime,
                endAt:
                  measured.start + Math.min(word.endTime, measured.duration),
              })),
              emphasis: (segment.emphasis ?? [])
                .map((mark) => {
                  const range = phraseRange(
                    segment.text,
                    mark.phrase,
                    mark.occurrence,
                  );
                  return {
                    start: rawIndices[range.start],
                    end: rawIndices[range.end - 1] + 1,
                    at:
                      measured.start +
                      Math.min(
                        measured.alignment.span(mark.phrase, mark.occurrence)
                          .end,
                        measured.duration,
                      ),
                  };
                })
                .sort((a, b) => a.start - b.start),
              boardIds: draft.events.flatMap((event) =>
                event.when.segment === segment.id &&
                event.type === 'board.write'
                  ? [event.item.id]
                  : [],
              ),
              markIds: draft.events.flatMap((event) =>
                event.when.segment === segment.id && event.type === 'board.mark'
                  ? [event.mark.id]
                  : [],
              ),
            };
          }),
        }),
    presentation: {
      diagramTitle: draft.presentation.diagramTitle,
      notesTitle: draft.presentation.notesTitle,
      ...Object.fromEntries(
        presentationTimes.map((key) => [
          key,
          resolve(
            draft.presentation[key] ?? { segment: draft.segments[0].id },
            `presentation.${key}`,
          ),
        ]),
      ),
    },
    visuals: draft.visuals.map((visual) => ({
      ...visual,
      config: resolveDraftConfig(visual.config, visual.grammar, (when, path) =>
        resolve(when, `visuals.${visual.id}.config.${path.join('.')}`),
      ),
    })),
    events,
  });
  validateBuiltinVisuals(artifacts.lesson);
  return {
    ...artifacts,
    report: {
      method: 'speech-word-anchors',
      duration,
      decodedDuration: cursor,
      pauseBetweenSegments: pause,
      segments: aligned.map((segment) => ({
        id: segment.id,
        start: segment.start,
        duration: segment.duration,
        wordCount: segment.alignment.words.length,
        lowConfidenceWords: segment.alignment.words.filter(
          (word) =>
            typeof word.confidence === 'number' && word.confidence < 0.5,
        ),
      })),
      anchors,
      humanReview: 'pending',
    },
  };
}

// Full public entry: material -> speech -> measured PCM -> exact word anchors
// -> joined MP3 + LessonSpec + VTT. Providers/audio tools are replaceable ports.
export async function compileLessonDraft(
  input: unknown,
  options: DraftCompileOptions & {
    speech: LessonSpeechProvider;
    audio?: LessonAudioProcessor;
    handwriting?: LessonHandwritingProvider | false;
  },
): Promise<CompiledLesson> {
  const draft = parseLessonDraft(input); // All material/grammar checks before billing.
  const pause = pauseSeconds(options.pauseBetweenSegments);
  // Validate resource addresses before generating speech too.
  createLessonArtifacts({
    schemaVersion: '0.1.0',
    id: draft.id,
    title: draft.title,
    eyebrow: draft.eyebrow,
    duration: 1,
    audio: options.resources?.audio ?? `/audio/${draft.id}.mp3`,
    captions: options.resources
      ? options.resources.captions
      : `/lessons/${draft.id}.vtt`,
    chapters: [
      { id: draft.segments[0].id, label: draft.segments[0].label, at: 0 },
    ],
    narration: [],
    visuals: [],
    events: [],
    presentation: {
      titleAt: 0,
      metaAt: 0,
      diagramTitleAt: 0,
      notesTitleAt: 0,
      ruleAt: 0,
      diagramTitle: draft.title,
      notesTitle: draft.presentation.notesTitle,
    },
  });
  const audio = options.audio ?? createFfmpegAudioProcessor();
  await audio.prepare?.(); // Detect missing runtime tools before a billable call.
  const generatedHandwriting =
    options.handwriting === false
      ? undefined
      : await (
          options.handwriting ?? createTegakiHandwritingProvider()
        ).generate(draft);
  const handwriting = generatedHandwriting
    ? {
        ...generatedHandwriting,
        bundle: parseHandwritingBundle(generatedHandwriting.bundle),
      }
    : undefined;
  if (handwriting) {
    if (!Buffer.isBuffer(handwriting.font) || !handwriting.font.length)
      throw new Error('手写生成器未返回字体资源。');
  }
  const measured: AlignedDraftSegment[] = [],
    pcm: Buffer[] = [];
  for (const [index, segment] of draft.segments.entries()) {
    const result = await options.speech.synthesize(segment);
    if (!Buffer.isBuffer(result.audio) || !result.audio.length)
      throw new Error('语音服务未返回音频。');
    const decoded = await audio.decodeMp3(result.audio);
    if (!Buffer.isBuffer(decoded) || !decoded.length || decoded.length % 2)
      throw new Error('音频解码没有返回完整 PCM 采样。');
    const duration = decoded.length / PCM_BYTES_PER_SECOND;
    alignedSegment(segment.text, result.metadata, duration); // Fail before next request.
    measured.push({
      id: segment.id,
      text: segment.text,
      duration,
      metadata: result.metadata,
    });
    pcm.push(decoded);
    if (index < draft.segments.length - 1)
      pcm.push(Buffer.alloc(Math.round(pause * PCM_BYTES_PER_SECOND)));
    if (
      pcm.reduce((sum, value) => sum + value.length, 0) >
      PCM_BYTES_PER_SECOND * 7200
    )
      throw new Error('课程时长超过两小时。');
  }
  // Validate timing/state before encoding or returning any publishable artifact.
  compileAlignedLessonDraft(draft, measured, {
    ...options,
    pauseBetweenSegments: pause,
  });
  const encoded = await audio.encodeMp3(Buffer.concat(pcm));
  if (!Buffer.isBuffer(encoded.audio) || !encoded.audio.length)
    throw new Error('音频编码没有返回 MP3。');
  const compiled = compileAlignedLessonDraft(draft, measured, {
    ...options,
    duration: encoded.duration,
    pauseBetweenSegments: pause,
  });
  return {
    ...compiled,
    ...(handwriting
      ? {
          ...createLessonArtifacts({
            ...compiled.lesson,
            handwriting: handwriting.bundle,
          }),
          handwritingFont: handwriting.font,
          report: {
            ...compiled.report,
            handwriting: {
              method: 'tegaki-font-skeleton' as const,
              glyphCount: Object.keys(handwriting.bundle.glyphData).length,
              missing: handwriting.missing,
            },
          },
        }
      : {}),
    audio: encoded.audio,
  };
}
