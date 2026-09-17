import type { Json, LessonSpec } from './index.ts';
import { identifier, text } from './index.ts';
import {
  flowModel,
  stateTransitionModel,
  plotModel,
  arraySearchModel,
  type VisualModel,
} from './visual-models.ts';

export type VisualCapability<
  C = unknown,
  S = unknown,
  P = unknown,
> = VisualModel<C, S, P> & {
  version: string;
  draft: {
    instructions: string;
    // '*' matches an array index. Only explicitly declared fields accept $time.
    timeFields?: { path: string[]; preflight?: number }[];
    validate?: (config: C, events: { action: string; payload: P }[]) => void;
  };
};
export type CapabilityRegistry = ReadonlyMap<string, VisualCapability>;
export function defineCapability<C, S, P>(
  capability: VisualCapability<C, S, P>,
): VisualCapability {
  identifier(capability.id);
  if (!/^\d+\.\d+\.\d+$/.test(capability.version))
    throw new Error('能力包版本无效。');
  text(capability.draft.instructions, 20000);
  for (const field of capability.draft.timeFields ?? []) {
    if (
      !field.path.length ||
      field.path.some((part) => typeof part !== 'string' || !part.length)
    )
      throw new Error('能力包时间字段无效。');
    if (
      field.preflight !== undefined &&
      (!Number.isFinite(field.preflight) ||
        field.preflight < 0 ||
        field.preflight > 7200)
    )
      throw new Error('能力包预检时间无效。');
  }
  // Validation remains typed inside the capability, erasure only at registration.
  return capability as unknown as VisualCapability;
}
export function createCapabilityRegistry(
  definitions: VisualCapability[],
): CapabilityRegistry {
  const registry = new Map<string, VisualCapability>();
  for (const definition of definitions) {
    if (registry.has(definition.id)) throw new Error('能力包标识重复。');
    registry.set(definition.id, defineCapability(definition));
  }
  return registry;
}
export function capabilityTimeField(
  registry: CapabilityRegistry,
  grammar: string,
  path: (string | number)[],
) {
  return registry
    .get(grammar)
    ?.draft.timeFields?.find(
      (field) =>
        field.path.length === path.length &&
        field.path.every((part, i) =>
          part === '*' ? typeof path[i] === 'number' : part === path[i],
        ),
    );
}
const graphTimes = [{ path: ['nodes', '*', 'at'] }];
export const builtinCapabilities = createCapabilityRegistry([
  defineCapability({
    ...flowModel,
    version: '1.0.0',
    draft: {
      instructions:
        'flow：流程、因果链与条件分支。config {nodes:[{id,label,position?:{x,y},at?:{$time:锚点}}],edges:[{id,from,to}]}。节点最多30，坐标0–100。activate {id:节点ID}；connect {id:边ID}。节点和连线按讲解逐步出现。if/else、命中/未命中、存在/不存在等互斥情况必须从共同判断节点分叉，不能把两条分支首尾串联。',
      timeFields: graphTimes,
    },
  }),
  defineCapability({
    ...stateTransitionModel,
    version: '1.0.0',
    draft: {
      instructions:
        'state-transition：同一对象随时间依次发生的状态及切换。config {nodes:[{id,label,position?:{x,y},at?:{$time:锚点}}],edges:[{id,from,to}]}。enter {id:节点ID}；transition {id:边ID}。先enter，再沿当前状态的出边转换。不要用于 if/else、命中/未命中、存在/不存在等互斥分支或普通操作步骤；这些情况使用 flow。',
      timeFields: graphTimes,
      validate(_config, events) {
        if (
          events.some((e) => e.action === 'transition') &&
          !events.some((e) => e.action === 'enter')
        )
          throw new Error('状态转换缺少 enter 起点。');
      },
    },
  }),
  defineCapability({
    ...plotModel,
    version: '1.0.0',
    draft: {
      instructions:
        'plot：量的变化与数据比较。config {points:[{x,y}],xLabel,yLabel,xAxis?:{min,max,ticks?},yAxis?:{min,max,ticks?},grid?:boolean}。至少两点，x严格递增；默认坐标轴0–100，非此范围必须定义轴；ticks递增且在范围内。数据来自资料或明确为教学示例。reveal/highlight {index:从0开始的点索引}。',
    },
  }),
  defineCapability({
    ...arraySearchModel,
    version: '1.0.0',
    draft: {
      instructions:
        'array-search：数组查找。config {values:[数字],valuesAt:{$time:锚点},stagger:0.1,scanStart:{$time:锚点},scanEnd:{$time:锚点},trail:[数字],trailAt:{$time:锚点},trailStep:0.2}。scanEnd 锚点严格晚于 scanStart。window {low,mid,high}；discard {indices:[索引]}；found {index}；focus {target:文本}。',
      timeFields: ['valuesAt', 'scanStart', 'scanEnd', 'trailAt'].map(
        (key) => ({ path: [key], preflight: key === 'scanEnd' ? 1 : 0 }),
      ),
    },
  }),
]);

export function validateCapabilityDraft(
  lesson: LessonSpec,
  registry: CapabilityRegistry,
): void {
  for (const visual of lesson.visuals) {
    const capability = registry.get(visual.grammar);
    if (!capability) throw new Error('未注册动画语法：' + visual.grammar);
    const config = capability.parseConfig(
      visual.config as Json,
      lesson.duration,
    );
    const events = lesson.events.flatMap((event) =>
      event.type === 'visual' && event.visualId === visual.id
        ? [
            {
              action: event.action,
              payload: capability.parseEvent(
                event.action,
                event.payload,
                config,
              ),
            },
          ]
        : [],
    );
    capability.draft.validate?.(config, events);
  }
}
