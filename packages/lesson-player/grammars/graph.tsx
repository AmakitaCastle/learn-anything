'use client';
import {
  flowModel,
  stateTransitionModel,
  type GraphConfig,
  type GraphState,
} from '@learn-anything/lesson-schema';
export {
  parseGraph,
  type GraphConfig,
  type GraphState,
} from '@learn-anything/lesson-schema';
import { clamp01, HandwrittenLine } from '../board/index.tsx';
import type { VisualProps } from '../runtime.ts';

const compactHorizontalGap = 23;
const sameRowGap = 18;

export function graphNeedsCompactNodes(config: GraphConfig): boolean {
  return config.nodes.some((node, index) =>
    config.nodes.slice(index + 1).some(
      (other) =>
        Math.abs(node.position.y - other.position.y) < sameRowGap &&
        Math.abs(node.position.x - other.position.x) < compactHorizontalGap,
    ),
  );
}

export function GraphRenderer({
  config,
  state,
  time,
}: VisualProps<GraphConfig, GraphState>) {
  const compact = graphNeedsCompactNodes(config);
  return (
    <div
      className="grammar-graph"
      data-node-layout={compact ? 'compact' : 'regular'}
      aria-label="流程与状态图"
    >
      <svg
        viewBox="0 0 640 360"
        preserveAspectRatio="none"
        aria-label="信息流动连线"
      >
        {config.edges.map((edge) => {
          const a = config.nodes.find(
            (node) => node.id === edge.from,
          )!.position;
          const b = config.nodes.find((node) => node.id === edge.to)!.position;
          const appearedAt = state.edges[edge.id];
          if (appearedAt === undefined) return null;
          const progress = clamp01((time - appearedAt) / 0.8);
          const ax = a.x * 6.4,
            ay = a.y * 3.6,
            bx = b.x * 6.4,
            by = b.y * 3.6;
          const angle = Math.atan2(by - ay, bx - ax),
            length = Math.hypot(bx - ax, by - ay);
          const start = Math.min(55, length / 4),
            end = Math.min(60, length / 4);
          const x = bx - Math.cos(angle) * end,
            y = by - Math.sin(angle) * end;
          return (
            <g key={edge.id} data-edge={edge.id}>
              <path
                d={`M${ax + Math.cos(angle) * start} ${ay + Math.sin(angle) * start} L${x} ${y}`}
                pathLength="1"
                style={{ strokeDashoffset: 1 - progress }}
              />
              <path
                d={`M${x - Math.cos(angle - 0.5) * 9} ${y - Math.sin(angle - 0.5) * 9} L${x} ${y} L${x - Math.cos(angle + 0.5) * 9} ${y - Math.sin(angle + 0.5) * 9}`}
                style={{ opacity: progress }}
              />
              <circle
                cx={ax + (bx - ax) * progress}
                cy={ay + (by - ay) * progress}
                r="4"
                style={{ opacity: progress > 0 && progress < 1 ? 1 : 0 }}
              />
            </g>
          );
        })}
      </svg>
      {config.nodes.map((node) => (
        <div
          key={node.id}
          data-node={node.id}
          data-active={state.active === node.id}
          className={`grammar-node${state.active === node.id ? ' is-active' : ''}${state.visited.includes(node.id) ? ' is-visited' : ''}`}
          style={{
            left: `clamp(var(--graph-node-half), ${node.position.x}%, calc(100% - var(--graph-node-half)))`,
            top: `${node.position.y}%`,
            opacity: clamp01((time - node.at) / 0.5),
          }}
        >
          <HandwrittenLine
            item={{ id: node.id, at: node.at, text: node.label, tone: 'plain' }}
            time={time}
          />
        </div>
      ))}
    </div>
  );
}
export const flow = { ...flowModel, Renderer: GraphRenderer };
export const stateTransition = {
  ...stateTransitionModel,
  Renderer: GraphRenderer,
};
