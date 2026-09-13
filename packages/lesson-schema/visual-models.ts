// Pure animation contracts shared by compiler and renderer; no playback/UI dependencies.
import {
  identifier,
  list,
  number,
  point,
  record,
  text,
  type Json,
  type Point,
  type LessonSpec,
} from './index.ts';
export type VisualModel<C = unknown, S = unknown, P = unknown> = {
  id: string;
  parseConfig(input: Json, duration: number): C;
  parseEvent(action: string, payload: Json, config: C): P;
  initial(config: C): S;
  reduce(
    state: S,
    event: { at: number; action: string; payload: P },
    config: C,
  ): S;
};
export type GraphConfig = {
  nodes: { id: string; label: string; position: Point; at: number }[];
  edges: { id: string; from: string; to: string }[];
};
export type GraphState = {
  active: string | null;
  activeAt: number;
  visited: string[];
  edges: Record<string, number>;
};
export function parseGraph(input: Json, duration: number): GraphConfig {
  const value = record(input);
  const nodes = list(value.nodes, 30).map((value, index, nodes) => {
    const node = record(value);
    return {
      id: identifier(node.id),
      label: text(node.label, 120),
      position: node.position
        ? point(node.position)
        : { x: 15 + (index / Math.max(1, nodes.length - 1)) * 70, y: 50 },
      at: number(node.at ?? 0, 0, duration),
    };
  });
  if (
    !nodes.length ||
    new Set(nodes.map((node) => node.id)).size !== nodes.length
  )
    throw new Error('图示节点为空或重复。');
  const edges = list(value.edges, 100).map((value) => {
    const edge = record(value);
    const from = identifier(edge.from),
      to = identifier(edge.to);
    if (
      !nodes.some((node) => node.id === from) ||
      !nodes.some((node) => node.id === to)
    )
      throw new Error('图示连线引用未知节点。');
    return { id: identifier(edge.id), from, to };
  });
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length)
    throw new Error('图示连线重复。');
  return { nodes, edges };
}
const initial = (): GraphState => ({
  active: null,
  activeAt: 0,
  visited: [],
  edges: {},
});
export const flowModel: VisualModel<GraphConfig, GraphState, { id: string }> = {
  id: 'flow',
  parseConfig: parseGraph,
  initial,
  parseEvent(action, input, config) {
    const id = identifier(record(input).id);
    if (action === 'activate' && config.nodes.some((node) => node.id === id))
      return { id };
    if (action === 'connect' && config.edges.some((edge) => edge.id === id))
      return { id };
    throw new Error('未注册流程事件或未知节点/连线。');
  },
  reduce(state, event) {
    if (event.action === 'connect')
      return {
        ...state,
        edges: { ...state.edges, [event.payload.id]: event.at },
      };
    return {
      ...state,
      active: event.payload.id,
      activeAt: event.at,
      visited: [...new Set([...state.visited, event.payload.id])],
    };
  },
};
export const stateTransitionModel: VisualModel<
  GraphConfig,
  GraphState,
  { id: string }
> = {
  id: 'state-transition',
  parseConfig: parseGraph,
  initial,
  parseEvent(action, input, config) {
    const id = identifier(record(input).id);
    if (action === 'enter' && config.nodes.some((node) => node.id === id))
      return { id };
    if (action === 'transition' && config.edges.some((edge) => edge.id === id))
      return { id };
    throw new Error('未注册状态转换事件或未知状态/转换。');
  },
  reduce(state, event, config) {
    const edge = config.edges.find((edge) => edge.id === event.payload.id);
    const id = event.action === 'enter' ? event.payload.id : edge!.to;
    if (event.action === 'transition' && state.active !== edge!.from)
      throw new Error('状态转换的起点与当前状态不一致。');
    return {
      active: id,
      activeAt: event.at,
      visited: [...new Set([...state.visited, id])],
      edges:
        event.action === 'transition'
          ? { ...state.edges, [edge!.id]: event.at }
          : state.edges,
    };
  },
};
export type PlotAxis = { min: number; max: number; ticks: number[] };
export type PlotConfig = {
  points: Point[];
  xLabel: string;
  yLabel: string;
  xAxis: PlotAxis;
  yAxis: PlotAxis;
  grid: boolean;
};

// Legacy plot data uses 0–100 layout coordinates. Explicit axes opt into
// actual data units without changing old courses' point positions.
export function parsePlotAxis(input: unknown): PlotAxis {
  const value = input === undefined ? {} : record(input);
  if (Object.keys(value).some((key) => !['min', 'max', 'ticks'].includes(key)))
    throw new Error('坐标轴包含未知字段。');
  const min = number(value.min === undefined ? 0 : value.min, -1e9, 1e9);
  const max = number(value.max === undefined ? 100 : value.max, -1e9, 1e9);
  if (max - min < 1e-9)
    throw new Error('坐标轴 max 必须大于 min，范围至少为 1e-9。');
  if (max - min < Number.EPSILON * Math.max(Math.abs(min), Math.abs(max)) * 16)
    throw new Error('坐标轴范围过小，超出数值精度。');
  let ticks: number[];
  if (value.ticks !== undefined) {
    ticks = list(value.ticks, 21).map((tick) => number(tick, min, max));
    if (
      !ticks.length ||
      ticks.some((tick, index) => index > 0 && tick <= ticks[index - 1])
    )
      throw new Error('坐标刻度必须非空、递增且不重复。');
  } else {
    const roughStep = (max - min) / 4;
    const power = 10 ** Math.floor(Math.log10(roughStep));
    const step =
      [1, 2, 2.5, 5, 10].find((factor) => factor * power >= roughStep)! * power;
    const first = Math.ceil(min / step);
    const last = Math.floor(max / step);
    ticks = Array.from({ length: Math.max(0, last - first + 1) }, (_, index) =>
      Number(
        ((first + index) * step).toFixed(
          Math.max(0, 1 - Math.floor(Math.log10(step))),
        ),
      ),
    ).filter((tick) => tick >= min && tick <= max);
    if (!ticks.length) ticks = [min, max];
  }
  return { min, max, ticks };
}
export type PlotState = {
  through: number;
  revealAt: number;
  highlight: number | null;
};
export const plotModel: VisualModel<PlotConfig, PlotState, { index: number }> =
  {
    id: 'plot',
    parseConfig(input) {
      const value = record(input);
      const xAxis = parsePlotAxis(value.xAxis);
      const yAxis = parsePlotAxis(value.yAxis);
      if (value.grid !== undefined && typeof value.grid !== 'boolean')
        throw new Error('曲线 grid 必须是布尔值。');
      const points = list(value.points, 500).map((value) => {
        const point = record(value);
        return {
          x: number(point.x, xAxis.min, xAxis.max),
          y: number(point.y, yAxis.min, yAxis.max),
        };
      });
      if (points.length < 2) throw new Error('曲线至少需要两个采样点。');
      for (let index = 1; index < points.length; index++)
        if (points[index].x <= points[index - 1].x)
          throw new Error('曲线横坐标必须递增。');
      return {
        points,
        xLabel: text(value.xLabel, 100),
        yLabel: text(value.yLabel, 100),
        xAxis,
        yAxis,
        grid: value.grid === true,
      };
    },
    parseEvent(action, input, config) {
      const index = number(record(input).index, 0, config.points.length - 1);
      if (!Number.isInteger(index) || !['reveal', 'highlight'].includes(action))
        throw new Error('曲线事件或采样点无效。');
      return { index };
    },
    initial: () => ({ through: 0, revealAt: 0, highlight: null }),
    reduce(state, event) {
      return event.action === 'reveal'
        ? { ...state, through: event.payload.index, revealAt: event.at }
        : { ...state, highlight: event.payload.index };
    },
  };
export type ArrayConfig = {
  values: number[];
  valuesAt: number;
  stagger: number;
  scanStart: number;
  scanEnd: number;
  trail: number[];
  trailAt: number;
  trailStep: number;
};
export type ArrayState = {
  low: number | null;
  mid: number | null;
  high: number | null;
  windowAt: number;
  discarded: number[];
  discardAt: number;
  found: number | null;
  foundAt: number;
  focus: string;
};
export type ArrayPayload = {
  low?: number;
  mid?: number;
  high?: number;
  indices?: number[];
  index?: number;
  target?: string;
};
const integer = (value: unknown, length: number) => {
  const result = number(value, 0, length - 1);
  if (!Number.isInteger(result)) throw new Error('数组索引必须是整数。');
  return result;
};
export const arraySearchModel: VisualModel<
  ArrayConfig,
  ArrayState,
  ArrayPayload
> = {
  id: 'array-search',
  parseConfig(input: Json, duration: number) {
    const value = record(input);
    const values = list(value.values, 100).map((value) =>
      number(value, -1e9, 1e9),
    );
    if (!values.length) throw new Error('数组不能为空。');
    const scanStart = number(value.scanStart, 0, duration);
    const scanEnd = number(value.scanEnd, scanStart + 0.001, duration);
    return {
      values,
      valuesAt: number(value.valuesAt, 0, duration),
      stagger: number(value.stagger, 0, 1),
      scanStart,
      scanEnd,
      trail: list(value.trail, 20).map((value) => number(value, -1e12, 1e12)),
      trailAt: number(value.trailAt, 0, duration),
      trailStep: number(value.trailStep, 0, 2),
    };
  },
  parseEvent(action, input, config) {
    const value = record(input);
    switch (action) {
      case 'window': {
        const low = integer(value.low, config.values.length),
          mid = integer(value.mid, config.values.length),
          high = integer(value.high, config.values.length);
        if (low > mid || mid > high) throw new Error('数组窗口边界错误。');
        return { low, mid, high };
      }
      case 'discard':
        return {
          indices: list(value.indices, 100).map((value) =>
            integer(value, config.values.length),
          ),
        };
      case 'found':
        return { index: integer(value.index, config.values.length) };
      case 'focus':
        return { target: text(value.target, 100) };
      default:
        throw new Error('未注册的数组动画事件。');
    }
  },
  initial: () => ({
    low: null,
    mid: null,
    high: null,
    windowAt: 0,
    discarded: [],
    discardAt: 0,
    found: null,
    foundAt: 0,
    focus: 'intro',
  }),
  reduce(state, event) {
    switch (event.action) {
      case 'window':
        return {
          ...state,
          low: event.payload.low!,
          mid: event.payload.mid!,
          high: event.payload.high!,
          windowAt: event.at,
        };
      case 'discard':
        return {
          ...state,
          discarded: [
            ...new Set([...state.discarded, ...event.payload.indices!]),
          ],
          discardAt: event.at,
        };
      case 'found':
        return { ...state, found: event.payload.index!, foundAt: event.at };
      case 'focus':
        return { ...state, focus: event.payload.target! };
      default:
        return state;
    }
  },
};

// Type erasure stays at the registry boundary; each model validates before reducing.
export const builtinVisualModels: ReadonlyMap<string, VisualModel> = new Map(
  [flowModel, stateTransitionModel, plotModel, arraySearchModel].map(
    (model) => [model.id, model as unknown as VisualModel],
  ),
);
export function validateBuiltinVisuals(
  lesson: LessonSpec,
  options: { checkState?: boolean } = {},
): void {
  const visuals = lesson.visuals.map((visual) => {
    const model = builtinVisualModels.get(visual.grammar);
    if (!model) throw new Error('未注册动画语法：' + visual.grammar);
    const config = model.parseConfig(visual.config, lesson.duration);
    return { id: visual.id, model, config, state: model.initial(config) };
  });
  for (const event of lesson.events) {
    if (event.type !== 'visual') continue;
    const visual = visuals.find((visual) => visual.id === event.visualId);
    if (!visual) throw new Error('事件引用未知动画。');
    const payload = visual.model.parseEvent(
      event.action,
      event.payload,
      visual.config,
    );
    if (options.checkState !== false)
      visual.state = visual.model.reduce(
        visual.state,
        { ...event, payload },
        visual.config,
      );
  }
}
