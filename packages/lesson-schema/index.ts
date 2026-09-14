export * from './visual-models.ts';
export * from './capabilities.ts';
export * from './draft.ts';
export * from './handwriting.ts';
export * from './teaching.ts';
import { parseTeaching, type TeachingSegment } from './teaching.ts';
import {
  parseHandwritingBundle,
  type HandwritingBundle,
} from './handwriting.ts';
export { phraseRange, spokenText } from './anchors.ts';
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type Tone =
  | 'plain'
  | 'muted'
  | 'accent'
  | 'strong'
  | 'danger'
  | 'success'
  | 'label';
export type Region = 'diagram' | 'notes';
export type Point = { x: number; y: number };
export type BoardItem = {
  id: string;
  text: string;
  at: number;
  tone: Tone;
  kind?: 'text' | 'formula';
  underline?: boolean;
  position?: Point;
};
export type BoardMark = {
  id: string;
  at: number;
  region: Region;
  kind: 'arrow' | 'curve' | 'circle' | 'underline' | 'highlight';
  points: Point[];
};
export type TimelineEvent =
  | { at: number; type: 'chapter'; chapterId: string }
  | { at: number; type: 'board.write'; item: Omit<BoardItem, 'at'> }
  | { at: number; type: 'board.mark'; mark: Omit<BoardMark, 'at'> }
  | { at: number; type: 'board.remove'; id: string }
  | {
      at: number;
      type: 'visual';
      visualId: string;
      action: string;
      payload: Json;
    };
export type LessonSpec = {
  schemaVersion: '0.1.0';
  id: string;
  title: string;
  eyebrow: string;
  duration: number;
  audio: string;
  captions?: string;
  handwriting?: HandwritingBundle;
  chapters: { id: string; label: string; at: number }[];
  narration: { at: number; text: string }[];
  presentation: {
    titleAt: number;
    metaAt: number;
    diagramTitleAt: number;
    notesTitleAt: number;
    ruleAt: number;
    diagramTitle: string;
    notesTitle: string;
  };
  visuals: { id: string; grammar: string; config: Json }[];
  events: TimelineEvent[];
  teaching?: TeachingSegment[];
};

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('需要对象。');
  return value as Record<string, unknown>;
}
export function text(value: unknown, maximum = 2000): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    /<\/?[a-z][^>]*>/iu.test(value) ||
    value.includes('\0')
  ) {
    throw new Error('文本为空、过长或包含不允许的标记。');
  }
  return value;
}
export function number(value: unknown, minimum = 0, maximum = 7200): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error('数字不在允许范围内。');
  }
  return value;
}
export function list(value: unknown, maximum = 5000): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error('列表无效或过长。');
  return value;
}
export function identifier(value: unknown): string {
  const result = text(value, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(result))
    throw new Error('标识只能包含字母、数字、横线和下划线。');
  return result;
}
export function point(value: unknown): Point {
  const item = record(value);
  return { x: number(item.x, 0, 100), y: number(item.y, 0, 100) };
}
export function json(value: unknown, depth = 0): Json {
  if (depth > 12) throw new Error('数据嵌套过深。');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return number(value, -1e12, 1e12);
  if (typeof value === 'string') return text(value, 10000);
  if (Array.isArray(value))
    return list(value, 1000).map((item) => json(item, depth + 1));
  const source = record(value);
  const entries = Object.entries(source);
  if (
    entries.length > 200 ||
    entries.some(([key]) =>
      ['__proto__', 'constructor', 'prototype'].includes(key),
    )
  ) {
    throw new Error('数据字段无效。');
  }
  return Object.fromEntries(
    entries.map(([key, item]) => [key, json(item, depth + 1)]),
  );
}
export function asset(value: unknown): string {
  const result = text(value, 2000);
  if (
    result.startsWith('/') &&
    !result.startsWith('//') &&
    !/[\\\s?#]/.test(result) &&
    !result.split('/').some((part) => part === '..' || part === '.')
  )
    return result;
  const url = new URL(result);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('音频/字幕只能使用本地资源或 HTTPS。');
  return result;
}

export function parseLesson(value: unknown): LessonSpec {
  const input = record(value);
  if (input.schemaVersion !== '0.1.0')
    throw new Error('不支持的课堂协议版本。');
  const duration = number(input.duration, 0.001);
  const at = (value: unknown) => number(value, 0, duration);
  const presentation = record(input.presentation);
  const chapters = list(input.chapters, 100).map((value) => {
    const chapter = record(value);
    return {
      id: identifier(chapter.id),
      label: text(chapter.label),
      at: at(chapter.at),
    };
  });
  if (
    !chapters.length ||
    chapters[0].at !== 0 ||
    new Set(chapters.map((chapter) => chapter.id)).size !== chapters.length
  ) {
    throw new Error('章节需要唯一标识，并从零秒开始。');
  }
  const narration = list(input.narration, 1000).map((value) => {
    const cue = record(value);
    return { at: at(cue.at), text: text(cue.text, 10000) };
  });
  const visuals = list(input.visuals, 20).map((value) => {
    const visual = record(value);
    return {
      id: identifier(visual.id),
      grammar: identifier(visual.grammar),
      config: json(visual.config),
    };
  });
  if (new Set(visuals.map((visual) => visual.id)).size !== visuals.length)
    throw new Error('动画标识重复。');
  const tones = [
    'plain',
    'muted',
    'accent',
    'strong',
    'danger',
    'success',
    'label',
  ];
  const events = list(input.events).map((value): TimelineEvent => {
    const event = record(value);
    const time = at(event.at);
    switch (event.type) {
      case 'chapter': {
        const chapterId = identifier(event.chapterId);
        if (!chapters.some((chapter) => chapter.id === chapterId))
          throw new Error('事件引用未知章节。');
        return { at: time, type: 'chapter', chapterId };
      }
      case 'board.write': {
        const item = record(event.item);
        const tone = item.tone ?? 'plain';
        if (
          typeof tone !== 'string' ||
          !tones.includes(tone) ||
          (item.kind !== undefined &&
            (typeof item.kind !== 'string' ||
              !['text', 'formula'].includes(item.kind))) ||
          (item.underline !== undefined && typeof item.underline !== 'boolean')
        )
          throw new Error('板书样式无效。');
        return {
          at: time,
          type: 'board.write',
          item: {
            id: identifier(item.id),
            text: text(item.text),
            tone: tone as Tone,
            ...(item.kind ? { kind: item.kind as 'text' | 'formula' } : {}),
            ...(item.underline !== undefined
              ? { underline: item.underline as boolean }
              : {}),
            ...(item.position ? { position: point(item.position) } : {}),
          },
        };
      }
      case 'board.mark': {
        const mark = record(event.mark);
        const kinds = ['arrow', 'curve', 'circle', 'underline', 'highlight'];
        if (
          !kinds.includes(String(mark.kind)) ||
          !['notes', 'diagram'].includes(String(mark.region))
        )
          throw new Error('板书图形无效。');
        const points = list(mark.points, 3).map(point);
        if (points.length !== (mark.kind === 'curve' ? 3 : 2))
          throw new Error('板书图形坐标数量不正确。');
        return {
          at: time,
          type: 'board.mark',
          mark: {
            id: identifier(mark.id),
            kind: mark.kind as BoardMark['kind'],
            region: mark.region as Region,
            points,
          },
        };
      }
      case 'board.remove':
        return { at: time, type: 'board.remove', id: identifier(event.id) };
      case 'visual': {
        const visualId = identifier(event.visualId);
        if (!visuals.some((visual) => visual.id === visualId))
          throw new Error('事件引用未知动画。');
        return {
          at: time,
          type: 'visual',
          visualId,
          action: identifier(event.action),
          payload: json(event.payload),
        };
      }
      default:
        throw new Error('课程包含未注册事件。');
    }
  });
  for (const sequence of [chapters, narration, events]) {
    for (let index = 1; index < sequence.length; index++) {
      if (sequence[index].at < sequence[index - 1].at)
        throw new Error('课堂时间轴未排序。');
    }
  }
  return {
    schemaVersion: '0.1.0',
    id: identifier(input.id),
    title: text(input.title),
    eyebrow: text(input.eyebrow),
    duration,
    audio: asset(input.audio),
    ...(input.captions ? { captions: asset(input.captions) } : {}),
    ...(input.handwriting === undefined
      ? {}
      : { handwriting: parseHandwritingBundle(input.handwriting) }),
    chapters,
    narration,
    visuals,
    events,
    ...(input.teaching === undefined
      ? {}
      : {
          teaching: parseTeaching(input.teaching, {
            duration,
            chapters,
            narration,
            visuals,
            events,
          }),
        }),
    presentation: {
      titleAt: at(presentation.titleAt),
      metaAt: at(presentation.metaAt),
      diagramTitleAt: at(presentation.diagramTitleAt),
      notesTitleAt: at(presentation.notesTitleAt),
      ruleAt: at(presentation.ruleAt),
      diagramTitle: text(presentation.diagramTitle),
      notesTitle: text(presentation.notesTitle),
    },
  };
}

export * from './font-selection.ts';
