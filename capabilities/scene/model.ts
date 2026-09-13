import {
  defineCapability,
  record,
  list,
  identifier,
  text,
  number,
  point,
  type Point,
  type Json,
} from '@learn-anything/lesson-schema';

export type SceneElement = {
  id: string;
  kind:
    | 'person'
    | 'phone'
    | 'message'
    | 'thought'
    | 'card'
    | 'region'
    | 'text'
    | 'token'
    | 'document';
  label: string;
  position: Point;
  width: number;
  height: number;
  tone: 'ink' | 'blue' | 'amber' | 'rose' | 'green' | 'muted';
};
export type SceneConfig = {
  elements: SceneElement[];
  relations: {
    id: string;
    from: string;
    to: string;
    label: string;
    kind: 'arrow' | 'line' | 'opposition';
  }[];
};
type Tween<T> = { from: T; to: T; at: number; duration: number };
export type SceneState = {
  elements: Record<
    string,
    {
      position: Tween<Point>;
      opacity: Tween<number>;
      emphasis: Tween<number>;
      regionId: string | null;
    }
  >;
  relations: Record<string, Tween<number>>;
  camera: Tween<{ x: number; y: number; scale: number }>;
};
export type SceneEvent = {
  id?: string;
  position?: Point;
  duration: number;
  active?: boolean;
  regionId?: string;
  camera?: { x: number; y: number; scale: number };
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function tweenProgress(
  tween: { at: number; duration: number },
  time: number,
) {
  const p =
    tween.duration === 0
      ? Number(time >= tween.at)
      : clamp((time - tween.at) / tween.duration);
  return p * p * (3 - 2 * p);
}
export function scalarAt(tween: Tween<number>, time: number) {
  return tween.from + (tween.to - tween.from) * tweenProgress(tween, time);
}
export function positionAt(tween: Tween<Point>, time: number): Point {
  const p = tweenProgress(tween, time);
  return {
    x: tween.from.x + (tween.to.x - tween.from.x) * p,
    y: tween.from.y + (tween.to.y - tween.from.y) * p,
  };
}
export function cameraAt(tween: SceneState['camera'], time: number) {
  return {
    ...positionAt(tween, time),
    scale:
      tween.from.scale +
      (tween.to.scale - tween.from.scale) * tweenProgress(tween, time),
  };
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('场景包含未知字段。');
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T))
    throw new Error('场景元素或关系类型无效。');
  return value as T;
}
const kinds = [
  'person',
  'phone',
  'message',
  'thought',
  'card',
  'region',
  'text',
  'token',
  'document',
] as const;
const tones = ['ink', 'blue', 'amber', 'rose', 'green', 'muted'] as const;
const fixed = <T>(value: T): Tween<T> => ({
  from: value,
  to: value,
  at: 0,
  duration: 0,
});

export const sceneModel = defineCapability<SceneConfig, SceneState, SceneEvent>(
  {
    id: 'scene',
    version: '1.0.0',
    draft: {
      instructions: `scene：通用二维情境与概念动画。用于人物处境、对话、叙事、观点冲突、归属与边界。内容由数据组合，不按课程标题选择模板。
config {elements:[{id,kind,label,position:{x,y},width?,height?,tone?}],relations?:[{id,from,to,label?,kind?:"arrow"|"line"|"opposition"}]}。
kind 可用 person/phone/message/thought/card/region/text/token/document；tone 可用 ink/blue/amber/rose/green/muted。坐标与尺寸均为0–100画布百分比，position为中心。width默认：region42，其他18；height默认：region72，person30，其他16。元素最多60，关系最多100。region可表示阵营、归属、范围、空间区域；卡片表达判断或行动，气泡表达话语或想法。区域先出现，其他元素放在区域内留出间距，不堆叠长文字。
所有元素初始隐藏。show/hide {id,duration?:0.6}；move {id,position:{x,y},duration?:0.8}；group {id,regionId,position?:{x,y},duration?:0.8}，regionId引用region元素，位置是绝对画布中心坐标，省略时移到区域中心；emphasize {id,active?:true,duration?:0.6}；connect/disconnect {id:关系ID,duration?:0.8}；camera {position:{x,y},scale:0.5–3,duration?:0.8}。duration是动作时长0–10秒，不是触发时刻；所有动作以when绑定旁白，config不使用$time。
先展示具体情境，再让关系、位置、归属或关注点发生解释性的变化。动画应展示文字难表达的过程，避免只是文字卡片依次出现。关系连接已声明元素，随元素移动。可用多个scene实例分别讲不同情境，不把整堂课塞进一张拥挤的场景。`,
    },
    parseConfig(input: Json) {
      const value = record(input);
      keys(value, ['elements', 'relations']);
      const elements = list(value.elements, 60).map((input) => {
        const v = record(input);
        keys(v, ['id', 'kind', 'label', 'position', 'width', 'height', 'tone']);
        const kind = choice(v.kind, kinds);
        return {
          id: identifier(v.id),
          kind,
          label: text(v.label, 120),
          position: point(v.position),
          width: number(v.width ?? (kind === 'region' ? 42 : 18), 3, 90),
          height: number(
            v.height ?? (kind === 'region' ? 72 : kind === 'person' ? 30 : 16),
            3,
            90,
          ),
          tone: choice(v.tone ?? 'ink', tones),
        };
      });
      if (
        !elements.length ||
        new Set(elements.map((e) => e.id)).size !== elements.length
      )
        throw new Error('场景元素为空或标识重复。');
      const relations = list(value.relations ?? [], 100).map((input) => {
        const v = record(input);
        keys(v, ['id', 'from', 'to', 'label', 'kind']);
        const from = identifier(v.from),
          to = identifier(v.to);
        if (
          from === to ||
          !elements.some((e) => e.id === from) ||
          !elements.some((e) => e.id === to)
        )
          throw new Error('场景关系引用未知或相同元素。');
        return {
          id: identifier(v.id),
          from,
          to,
          label: v.label === undefined ? '' : text(v.label, 60),
          kind: choice(v.kind ?? 'arrow', [
            'arrow',
            'line',
            'opposition',
          ] as const),
        };
      });
      if (new Set(relations.map((e) => e.id)).size !== relations.length)
        throw new Error('场景关系标识重复。');
      return { elements, relations };
    },
    parseEvent(action, input, config) {
      const v = record(input);
      const duration = number(v.duration ?? 0.8, 0, 10);
      if (action === 'camera') {
        keys(v, ['position', 'scale', 'duration']);
        return {
          duration,
          camera: { ...point(v.position), scale: number(v.scale, 0.5, 3) },
        };
      }
      const allowed: Record<string, string[]> = {
        show: ['id', 'duration'],
        hide: ['id', 'duration'],
        move: ['id', 'position', 'duration'],
        group: ['id', 'regionId', 'position', 'duration'],
        emphasize: ['id', 'active', 'duration'],
        connect: ['id', 'duration'],
        disconnect: ['id', 'duration'],
      };
      if (!Object.hasOwn(allowed, action)) throw new Error('未注册场景动作。');
      keys(v, allowed[action]);
      const id = identifier(v.id);
      if (action === 'connect' || action === 'disconnect') {
        if (!config.relations.some((r) => r.id === id))
          throw new Error('场景动作引用未知关系。');
        return { id, duration };
      }
      if (!config.elements.some((e) => e.id === id))
        throw new Error('场景动作引用未知元素。');
      if (action === 'group') {
        const regionId = identifier(v.regionId),
          region = config.elements.find((e) => e.id === regionId);
        if (!region || region.kind !== 'region' || regionId === id)
          throw new Error('场景分组引用无效区域。');
        return {
          id,
          regionId,
          position:
            v.position === undefined ? region.position : point(v.position),
          duration,
        };
      }
      if (
        action === 'emphasize' &&
        v.active !== undefined &&
        typeof v.active !== 'boolean'
      )
        throw new Error('场景强调状态无效。');
      return {
        id,
        duration,
        ...(action === 'move' ? { position: point(v.position) } : {}),
        ...(action === 'emphasize' ? { active: v.active !== false } : {}),
      };
    },
    initial(config) {
      return {
        elements: Object.fromEntries(
          config.elements.map((e) => [
            e.id,
            {
              position: fixed(e.position),
              opacity: fixed(0),
              emphasis: fixed(0),
              regionId: null,
            },
          ]),
        ),
        relations: Object.fromEntries(
          config.relations.map((r) => [r.id, fixed(0)]),
        ),
        camera: fixed({ x: 50, y: 50, scale: 1 }),
      };
    },
    reduce(state, event) {
      const { payload: p, at, action } = event;
      const scalar = (old: Tween<number>, to: number): Tween<number> => ({
        from: scalarAt(old, at),
        to,
        at,
        duration: p.duration,
      });
      if (action === 'camera')
        return {
          ...state,
          camera: {
            from: cameraAt(state.camera, at),
            to: p.camera!,
            at,
            duration: p.duration,
          },
        };
      if (action === 'connect' || action === 'disconnect')
        return {
          ...state,
          relations: {
            ...state.relations,
            [p.id!]: scalar(
              state.relations[p.id!],
              Number(action === 'connect'),
            ),
          },
        };
      const current = state.elements[p.id!];
      const updated =
        action === 'move' || action === 'group'
          ? {
              ...current,
              position: {
                from: positionAt(current.position, at),
                to: p.position!,
                at,
                duration: p.duration,
              },
              regionId: action === 'group' ? p.regionId! : null,
            }
          : action === 'emphasize'
            ? {
                ...current,
                emphasis: scalar(current.emphasis, Number(p.active)),
              }
            : {
                ...current,
                opacity: scalar(current.opacity, Number(action === 'show')),
              };
      return { ...state, elements: { ...state.elements, [p.id!]: updated } };
    },
  },
);
