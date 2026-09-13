type Point = readonly [number, number];
const start: Point = [51, 3];
const curves: readonly (readonly [Point, Point, Point])[] = [
  [
    [81, 0],
    [99, 9],
    [97, 22],
  ],
  [
    [96, 35],
    [78, 39],
    [48, 37],
  ],
  [
    [18, 39],
    [1, 31],
    [3, 18],
  ],
  [
    [3, 7],
    [22, 0],
    [51, 3],
  ],
];
const mix = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const coordinate = (point: Point) => point.map((n) => +n.toFixed(4)).join(' ');

// Draw only the reached curve. Normalized SVG dashes combined with
// non-scaling-stroke can leak a half-circle at progress=0 after resizing.
export function drawnCirclePath(progress: number): string {
  const reached = Math.max(0, Math.min(1, progress)) * curves.length;
  if (!reached) return '';
  let from = start;
  let path = `M${coordinate(start)}`;
  for (const [index, [a, b, end]] of curves.entries()) {
    const t = Math.min(1, reached - index);
    if (t <= 0) break;
    // De Casteljau subdivision preserves the original cubic exactly.
    const first = mix(from, a, t);
    const second = mix(first, mix(a, b, t), t);
    const to = mix(second, mix(mix(a, b, t), mix(b, end, t), t), t);
    path += ` C${coordinate(first)} ${coordinate(second)} ${coordinate(to)}`;
    from = end;
  }
  return path;
}
