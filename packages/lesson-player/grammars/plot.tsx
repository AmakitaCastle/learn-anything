'use client';
import {
  plotModel,
  type PlotConfig,
  type PlotState,
  type Point,
} from '@learn-anything/lesson-schema';
import { clamp01 } from '../board/index.tsx';
import type { VisualGrammar } from '../runtime.ts';
export const plot: VisualGrammar<PlotConfig, PlotState, { index: number }> = {
  ...plotModel,
  Renderer({ config, state, time }) {
    const x = (value: number) =>
      50 +
      ((value - config.xAxis.min) / (config.xAxis.max - config.xAxis.min)) *
        520;
    const y = (value: number) =>
      300 -
      ((value - config.yAxis.min) / (config.yAxis.max - config.yAxis.min)) *
        250;
    const transform = (point: Point) => ({ x: x(point.x), y: y(point.y) });
    const label = (value: number) => String(Object.is(value, -0) ? 0 : value);
    const points = config.points.slice(0, state.through + 1).map(transform);
    const highlight =
      state.highlight === null
        ? null
        : transform(config.points[state.highlight]);
    return (
      <svg
        className="grammar-plot"
        viewBox="0 0 640 360"
        aria-label="数据变化曲线"
      >
        {config.grid && (
          <g className="plot-grid" aria-hidden="true">
            {config.xAxis.ticks.map((tick) => (
              <path key={`x-${tick}`} d={`M${x(tick)} 50 V300`} />
            ))}
            {config.yAxis.ticks.map((tick) => (
              <path key={`y-${tick}`} d={`M50 ${y(tick)} H570`} />
            ))}
          </g>
        )}
        <path className="plot-axes" d="M50 40 V300 H590" />
        <g className="plot-ticks" data-plot-axis="x">
          {config.xAxis.ticks.map((tick) => (
            <g key={tick} data-tick={tick}>
              <path d={`M${x(tick)} 300 v6`} />
              <text x={x(tick)} y="322" textAnchor="middle">
                {label(tick)}
              </text>
            </g>
          ))}
        </g>
        <g className="plot-ticks" data-plot-axis="y">
          {config.yAxis.ticks.map((tick) => (
            <g key={tick} data-tick={tick}>
              <path d={`M44 ${y(tick)} h6`} />
              <text
                x="38"
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {label(tick)}
              </text>
            </g>
          ))}
        </g>
        <text x="320" y="352" textAnchor="middle">
          {config.xLabel}
        </text>
        <text x="15" y="30">
          {config.yLabel}
        </text>
        {points.length > 1 && (
          <polyline
            data-plot-through={state.through}
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
            pathLength="1"
            style={{
              strokeDashoffset: 1 - clamp01((time - state.revealAt) / 0.8),
            }}
          />
        )}
        {highlight && (
          <circle
            data-highlight={state.highlight}
            cx={highlight.x}
            cy={highlight.y}
            r="7"
          />
        )}
      </svg>
    );
  },
};
