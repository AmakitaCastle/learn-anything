import {
  scalarAt,
  positionAt,
  cameraAt,
  type SceneConfig,
  type SceneState,
  type SceneElement,
} from './model.ts';

const colors = {
  ink: 'var(--scene-ink, #45424c)',
  blue: 'var(--scene-blue, #46788c)',
  amber: 'var(--scene-amber, #b98637)',
  rose: 'var(--scene-rose, #b26476)',
  green: 'var(--scene-green, #58816b)',
  muted: 'var(--scene-muted, #92919a)',
};
const W = 960,
  H = 540;
function Label({
  text,
  width,
  y = 0,
}: {
  text: string;
  width: number;
  y?: number;
}) {
  const chars = Array.from(text);
  const size = Math.min(20, Math.max(13, width / 7));
  const count = Math.max(3, Math.floor(width / size));
  const lines = Array.from(
    { length: Math.ceil(chars.length / count) },
    (_, i) => chars.slice(i * count, (i + 1) * count).join(''),
  );
  return (
    <text
      textAnchor="middle"
      fontSize={size}
      fill="currentColor"
      stroke="none"
      style={{ fontFamily: 'var(--font-hand, "Kaiti SC", cursive)' }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x="0" y={y + (i - (lines.length - 1) / 2) * (size + 5)}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
function Element({ element: e }: { element: SceneElement }) {
  const w = (e.width * W) / 100,
    h = (e.height * H) / 100;
  switch (e.kind) {
    case 'region':
      return (
        <>
          <rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            rx="24"
            fill="currentColor"
            fillOpacity="0.055"
            strokeDasharray="7 7"
          />
          <Label text={e.label} width={w - 28} y={-h / 2 + 28} />
        </>
      );
    case 'person':
      return (
        <>
          <circle
            cy={-h * 0.27}
            r={Math.min(w * 0.18, h * 0.14)}
            fill="currentColor"
            fillOpacity="0.08"
          />
          <path
            d={`M0 ${-h * 0.1} Q-5 ${h * 0.04} 0 ${h * 0.14} M0 ${-h * 0.03} L${-w * 0.25} ${h * 0.08} M0 ${-h * 0.03} L${w * 0.25} ${h * 0.08} M0 ${h * 0.14} L${-w * 0.17} ${h * 0.32} M0 ${h * 0.14} L${w * 0.17} ${h * 0.32}`}
            fill="none"
          />
          <Label text={e.label} width={w} y={h / 2} />
        </>
      );
    case 'phone':
      return (
        <>
          <rect
            x={-w * 0.25}
            y={-h * 0.42}
            width={w * 0.5}
            height={h * 0.72}
            rx="10"
            fill="var(--scene-paper, #fffdf8)"
          />
          <path d={`M${-w * 0.1} ${h * 0.18} h${w * 0.2}`} />
          <Label text={e.label} width={w} y={h * 0.55} />
        </>
      );
    case 'message':
      return (
        <>
          <path
            d={`M${-w / 2 + 14} ${-h / 2} H${w / 2 - 14} Q${w / 2} ${-h / 2} ${w / 2} ${-h / 2 + 14} V${h / 2 - 14} Q${w / 2} ${h / 2} ${w / 2 - 14} ${h / 2} H${-w * 0.25} L${-w * 0.38} ${h / 2 + 15} V${h / 2} H${-w / 2 + 14} Q${-w / 2} ${h / 2} ${-w / 2} ${h / 2 - 14} V${-h / 2 + 14} Q${-w / 2} ${-h / 2} ${-w / 2 + 14} ${-h / 2} Z`}
            fill="var(--scene-paper, #fffdf8)"
          />
          <Label text={e.label} width={w - 20} y={5} />
        </>
      );
    case 'thought':
      return (
        <>
          <ellipse rx={w / 2} ry={h / 2} fill="var(--scene-paper, #fffdf8)" />
          <circle
            cx={-w * 0.27}
            cy={h * 0.55}
            r="5"
            fill="var(--scene-paper, #fffdf8)"
          />
          <circle
            cx={-w * 0.33}
            cy={h * 0.72}
            r="3"
            fill="var(--scene-paper, #fffdf8)"
          />
          <Label text={e.label} width={w - 28} y={5} />
        </>
      );
    case 'text':
      return <Label text={e.label} width={w} y={5} />;
    case 'token':
      return (
        <>
          <ellipse
            rx={w / 2}
            ry={h / 2}
            fill="currentColor"
            fillOpacity="0.08"
          />
          <Label text={e.label} width={w - 20} y={5} />
        </>
      );
    case 'document':
      return (
        <>
          <path
            d={`M${-w / 2} ${-h / 2} H${w / 2 - 20} L${w / 2} ${-h / 2 + 20} V${h / 2} H${-w / 2} Z M${w / 2 - 20} ${-h / 2} V${-h / 2 + 20} H${w / 2}`}
            fill="var(--scene-paper, #fffdf8)"
          />
          <Label text={e.label} width={w - 22} y={5} />
        </>
      );
    default:
      return (
        <>
          <rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            rx="13"
            fill="var(--scene-paper, #fffdf8)"
          />
          <Label text={e.label} width={w - 22} y={5} />
        </>
      );
  }
}
export default function SceneRenderer({
  config,
  state,
  time,
}: {
  config: SceneConfig;
  state: SceneState;
  time: number;
}) {
  const camera = cameraAt(state.camera, time);
  const ordered = [...config.elements].sort(
    (a, b) => Number(b.kind === 'region') - Number(a.kind === 'region'),
  );
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      aria-label="情境与概念动画"
      style={{
        width: '100%',
        height: 'auto',
        display: 'block',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <g
        transform={`translate(${W / 2} ${H / 2}) scale(${camera.scale}) translate(${(-camera.x * W) / 100} ${(-camera.y * H) / 100})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ordered
          .filter((e) => e.kind === 'region')
          .map((e) => (
            <SceneItem key={e.id} element={e} state={state} time={time} />
          ))}
        {config.relations.map((r) => {
          const reveal = scalarAt(state.relations[r.id], time);
          const from = state.elements[r.from],
            to = state.elements[r.to];
          const opacity = Math.min(
            scalarAt(from.opacity, time),
            scalarAt(to.opacity, time),
            reveal,
          );
          const a = positionAt(from.position, time),
            b = positionAt(to.position, time);
          const ax = (a.x * W) / 100,
            ay = (a.y * H) / 100,
            bx = (b.x * W) / 100,
            by = (b.y * H) / 100;
          const angle = Math.atan2(by - ay, bx - ax),
            length = Math.hypot(bx - ax, by - ay);
          const start = Math.min(65, length * 0.22),
            end = Math.min(75, length * 0.25);
          const sx = ax + Math.cos(angle) * start,
            sy = ay + Math.sin(angle) * start;
          const ex = bx - Math.cos(angle) * end,
            ey = by - Math.sin(angle) * end;
          const x = sx + (ex - sx) * reveal,
            y = sy + (ey - sy) * reveal;
          return (
            <g
              key={r.id}
              data-scene-relation={r.id}
              opacity={opacity}
              stroke={r.kind === 'opposition' ? colors.rose : colors.muted}
              fill="none"
            >
              <path
                d={`M${sx} ${sy} L${x} ${y}`}
                strokeDasharray={r.kind === 'opposition' ? '5 5' : undefined}
              />
              {r.kind === 'arrow' && (
                <path
                  d={`M${x - Math.cos(angle - 0.5) * 10} ${y - Math.sin(angle - 0.5) * 10} L${x} ${y} L${x - Math.cos(angle + 0.5) * 10} ${y - Math.sin(angle + 0.5) * 10}`}
                />
              )}
              {r.label && (
                <g
                  transform={`translate(${(ax + bx) / 2} ${(ay + by) / 2 - 14})`}
                  color={colors.ink}
                >
                  <Label text={r.label} width={200} />
                </g>
              )}
            </g>
          );
        })}
        {ordered
          .filter((e) => e.kind !== 'region')
          .map((e) => (
            <SceneItem key={e.id} element={e} state={state} time={time} />
          ))}
      </g>
    </svg>
  );
}
function SceneItem({
  element,
  state,
  time,
}: {
  element: SceneElement;
  state: SceneState;
  time: number;
}) {
  const s = state.elements[element.id],
    p = positionAt(s.position, time),
    opacity = scalarAt(s.opacity, time),
    emphasis = scalarAt(s.emphasis, time);
  return (
    <g
      data-scene-element={element.id}
      data-scene-kind={element.kind}
      data-scene-region={s.regionId ?? ''}
      data-scene-opacity={opacity.toFixed(3)}
      transform={`translate(${(p.x * W) / 100} ${(p.y * H) / 100}) scale(${1 + emphasis * 0.06})`}
      opacity={opacity}
      stroke={colors[element.tone]}
      color={colors[element.tone]}
    >
      {emphasis > 0 && (
        <ellipse
          rx={(element.width * W) / 190}
          ry={(element.height * H) / 170}
          strokeOpacity={emphasis * 0.65}
          fill="currentColor"
          fillOpacity={emphasis * 0.035}
          strokeDasharray="4 5"
        />
      )}
      <Element element={element} />
    </g>
  );
}
