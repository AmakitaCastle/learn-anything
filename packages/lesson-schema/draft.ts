import {
  identifier,
  json,
  list,
  number,
  parseLesson,
  record,
  text,
  validateBuiltinVisuals,
  type Json,
  type TimelineEvent,
} from './index.ts';
import {
  builtinCapabilities,
  capabilityTimeField,
  validateCapabilityDraft,
  type CapabilityRegistry,
} from './capabilities.ts';
import { phraseRange, spokenText } from './anchors.ts';
import { sentenceRanges } from './teaching.ts';

export type LessonAnchor = {
  segment: string;
  phrase?: string;
  edge?: 'start' | 'end';
  occurrence?: number;
  // Deliberate small editorial lead/lag, not a guessed absolute audio time.
  offset?: number;
};
export type DraftEvent = TimelineEvent extends infer E
  ? E extends TimelineEvent
    ? E extends { type: 'chapter' }
      ? never
      : Omit<E, 'at'> & { when: LessonAnchor }
    : never
  : never;
export type LessonDraft = {
  draftVersion: '0.1.0';
  id: string;
  title: string;
  // Optional {duration} token is filled from the measured final audio duration.
  eyebrow: string;
  boardMode?: 'full-narration';
  segments: {
    id: string;
    label: string;
    text: string;
    visualId?: string;
    emphasis?: { phrase: string; occurrence?: number }[];
  }[];
  presentation: {
    diagramTitle: string;
    notesTitle: string;
    titleAt?: LessonAnchor;
    metaAt?: LessonAnchor;
    diagramTitleAt?: LessonAnchor;
    notesTitleAt?: LessonAnchor;
    ruleAt?: LessonAnchor;
  };
  // Timing fields in config use { $time: LessonAnchor }, never final seconds.
  visuals: { id: string; grammar: string; config: Json }[];
  events: DraftEvent[];
};

export const presentationTimes = [
  'titleAt',
  'metaAt',
  'diagramTitleAt',
  'notesTitleAt',
  'ruleAt',
] as const;
function keys(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error('课程材料包含未知字段。');
}
export function parseAnchor(value: unknown): LessonAnchor {
  const input = record(value);
  keys(input, ['segment', 'phrase', 'edge', 'occurrence', 'offset']);
  if (
    input.edge !== undefined &&
    input.edge !== 'start' &&
    input.edge !== 'end'
  )
    throw new Error('锚点 edge 只能是 start 或 end。');
  const occurrence =
    input.occurrence === undefined
      ? undefined
      : number(input.occurrence, 1, 2000);
  if (
    occurrence !== undefined &&
    (!Number.isInteger(occurrence) || input.phrase === undefined)
  )
    throw new Error('occurrence 必须是短语的正整数序号。');
  return {
    segment: identifier(input.segment),
    ...(input.phrase !== undefined ? { phrase: text(input.phrase) } : {}),
    ...(input.edge !== undefined
      ? { edge: input.edge as 'start' | 'end' }
      : {}),
    ...(occurrence !== undefined ? { occurrence } : {}),
    ...(input.offset !== undefined
      ? { offset: number(input.offset, -5, 5) }
      : {}),
  };
}

export function resolveDraftConfig(
  value: Json,
  grammar: string,
  resolve: (
    anchor: LessonAnchor,
    path: (string | number)[],
    preflight: number,
  ) => number,
  path: (string | number)[] = [],
  capabilities: CapabilityRegistry = builtinCapabilities,
): Json {
  const field = capabilityTimeField(capabilities, grammar, path);
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    '$time' in value
  ) {
    if (Object.keys(value).length !== 1 || !field)
      throw new Error('$time 只能用于已支持的动画时间字段。');
    return resolve(parseAnchor(value.$time), path, field?.preflight ?? 0);
  }
  if (field)
    throw new Error('动画时间字段必须使用 $time 语义锚点，不能预填秒数。');
  if (Array.isArray(value))
    return value.map((child, index) =>
      resolveDraftConfig(
        child,
        grammar,
        resolve,
        [...path, index],
        capabilities,
      ),
    );
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        resolveDraftConfig(
          child,
          grammar,
          resolve,
          [...path, key],
          capabilities,
        ),
      ]),
    );
  return value;
}

export function parseLessonDraft(
  value: unknown,
  capabilities: CapabilityRegistry = builtinCapabilities,
): LessonDraft {
  const input = record(value);
  keys(input, [
    'draftVersion',
    'id',
    'title',
    'eyebrow',
    'segments',
    'presentation',
    'visuals',
    'events',
    'boardMode',
  ]);
  if (input.draftVersion !== '0.1.0') throw new Error('不支持的课程材料版本。');
  if (input.boardMode !== undefined && input.boardMode !== 'full-narration')
    throw new Error('不支持的板书模式。');
  const segments = list(input.segments, 100).map((value) => {
    const segment = record(value);
    keys(segment, ['id', 'label', 'text', 'visualId', 'emphasis']);
    const narration = text(segment.text, 2000);
    if (narration !== narration.trim() || !spokenText(narration))
      throw new Error('旁白不能为空或带首尾空白。');
    return {
      id: identifier(segment.id),
      label: text(segment.label),
      text: narration,
      ...(segment.visualId === undefined
        ? {}
        : { visualId: identifier(segment.visualId) }),
      ...(segment.emphasis === undefined
        ? {}
        : {
            emphasis: list(segment.emphasis, 8).map((value) => {
              const mark = record(value);
              keys(mark, ['phrase', 'occurrence']);
              const phrase = text(mark.phrase, 40);
              const occurrence =
                mark.occurrence === undefined
                  ? undefined
                  : number(mark.occurrence, 1, 2000);
              phraseRange(narration, phrase, occurrence);
              if (spokenText(phrase) === spokenText(narration))
                throw new Error('重点只能选择局部文字。');
              return {
                phrase,
                ...(occurrence === undefined ? {} : { occurrence }),
              };
            }),
          }),
    };
  });
  if (
    !segments.length ||
    new Set(segments.map((segment) => segment.id)).size !== segments.length
  )
    throw new Error('旁白片段为空或标识重复。');
  for (const segment of segments) {
    const chars = Array.from(segment.text);
    const indices = chars.flatMap((char, index) =>
      spokenText(char) ? [index] : [],
    );
    const ranges = sentenceRanges(segment.text);
    const marks = (segment.emphasis ?? [])
      .map((mark) => {
        const range = phraseRange(segment.text, mark.phrase, mark.occurrence);
        const start = indices[range.start];
        const end = indices[range.end - 1] + 1;
        const sentence = ranges.find(
          (range) => range.start <= start && range.end >= end,
        );
        if (
          !sentence ||
          spokenText(chars.slice(sentence.start, sentence.end).join('')) ===
            spokenText(mark.phrase)
        )
          throw new Error('重点不能覆盖整句或跨句。');
        return { start, end };
      })
      .sort((a, b) => a.start - b.start);
    if (
      marks.some(
        (mark, index) => index > 0 && mark.start < marks[index - 1].end,
      )
    )
      throw new Error('重点文字范围无效。');
  }
  const check = (anchor: LessonAnchor) => {
    const segment = segments.find((segment) => segment.id === anchor.segment);
    if (!segment) throw new Error('锚点引用未知旁白片段。');
    if (anchor.phrase !== undefined)
      phraseRange(segment.text, anchor.phrase, anchor.occurrence);
    return anchor;
  };
  const presentation = record(input.presentation);
  keys(presentation, ['diagramTitle', 'notesTitle', ...presentationTimes]);
  const times = Object.fromEntries(
    presentationTimes.flatMap((key) =>
      presentation[key] === undefined
        ? []
        : [[key, check(parseAnchor(presentation[key]))]],
    ),
  );
  const visuals = list(input.visuals, 20).map((value) => {
    const visual = record(value);
    keys(visual, ['id', 'grammar', 'config']);
    return {
      id: identifier(visual.id),
      grammar: identifier(visual.grammar),
      config: json(visual.config),
    };
  });
  const whens: LessonAnchor[] = [];
  if (
    segments.some(
      (segment) =>
        segment.visualId &&
        !visuals.some((visual) => visual.id === segment.visualId),
    )
  )
    throw new Error('旁白片段引用未知图示。');
  if (
    input.boardMode === 'full-narration' &&
    visuals.some(
      (visual) => !segments.some((segment) => segment.visualId === visual.id),
    )
  )
    throw new Error('每张图示必须配有完整旁白板书。');
  const eventData = list(input.events, 5000).map((value) => {
    const event = record(value);
    const fields =
      event.type === 'board.write'
        ? ['item']
        : event.type === 'board.mark'
          ? ['mark']
          : event.type === 'board.remove'
            ? ['id']
            : event.type === 'visual'
              ? ['visualId', 'action', 'payload']
              : [];
    if (!fields.length)
      throw new Error('材料包含不支持的事件；章节由旁白片段自动生成。');
    keys(event, ['type', 'when', ...fields]);
    whens.push(check(parseAnchor(event.when)));
    const { when: _when, ...data } = event;
    return { ...data, at: 0 };
  });
  // Structural preflight only: these zero-time placeholders are never emitted
  // as a compiled timeline. Real timestamps are required by the compiler.
  const scaffold = parseLesson({
    schemaVersion: '0.1.0',
    id: input.id,
    title: input.title,
    eyebrow: input.eyebrow,
    duration: 7200,
    audio: '/audio/preflight.mp3',
    chapters: segments.map((segment) => ({
      id: segment.id,
      label: segment.label,
      at: 0,
    })),
    narration: [],
    presentation: {
      ...presentation,
      titleAt: 0,
      metaAt: 0,
      diagramTitleAt: 0,
      notesTitleAt: 0,
      ruleAt: 0,
    },
    visuals: visuals.map((visual) => ({
      ...visual,
      config: resolveDraftConfig(
        visual.config,
        visual.grammar,
        (anchor, _path, preflight) => {
          check(anchor);
          return preflight;
        },
        [],
        capabilities,
      ),
    })),
    events: eventData,
  });
  // Word groups and explicit offsets can change ordering. Do not guess state
  // chronology from character positions; reduce only after real timestamps.
  validateBuiltinVisuals(scaffold, {
    checkState: false,
    registry: capabilities,
  });
  validateCapabilityDraft(scaffold, capabilities);
  if (
    input.boardMode === 'full-narration' &&
    scaffold.events.some(
      (event, index) =>
        event.type === 'visual' &&
        segments.find((segment) => segment.id === whens[index].segment)
          ?.visualId !== event.visualId,
    )
  )
    throw new Error('图示动作与本段旁白关联不一致。');
  const written = new Set(
    scaffold.events.flatMap((event) =>
      event.type === 'board.write'
        ? [event.item.id]
        : event.type === 'board.mark'
          ? [event.mark.id]
          : [],
    ),
  );
  if (
    scaffold.events.some(
      (event) => event.type === 'board.remove' && !written.has(event.id),
    )
  )
    throw new Error('板书删除动作引用未知内容。');
  return {
    draftVersion: '0.1.0',
    id: scaffold.id,
    title: scaffold.title,
    eyebrow: scaffold.eyebrow,
    ...(input.boardMode === 'full-narration'
      ? { boardMode: 'full-narration' as const }
      : {}),
    segments,
    presentation: {
      diagramTitle: scaffold.presentation.diagramTitle,
      notesTitle: scaffold.presentation.notesTitle,
      ...times,
    },
    visuals,
    events: scaffold.events.map((event, index) => {
      const { at: _at, ...data } = event;
      return { ...data, when: whens[index] } as DraftEvent;
    }),
  };
}
