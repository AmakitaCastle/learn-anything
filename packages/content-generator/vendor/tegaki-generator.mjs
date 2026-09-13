// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/commands/generate.ts
import opentype from "opentype.js";

// packages/content-generator/vendor/bundle-version.mjs
var BUNDLE_VERSION = 0;

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/commands/generate.ts
import * as z from "zod/v4";

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/constants.ts
var DEFAULT_RESOLUTION = 400;
var DEFAULT_FONT_FAMILY = "Caveat";
var BEZIER_TOLERANCE = 0.5;
var RDP_TOLERANCE = 1.5;
var BITMAP_PADDING = 0.05;
var SPUR_LENGTH_RATIO = 0.08;
var SMOOTH_KINK_MIN_ANGLE = 155;
var TRACE_LOOKBACK = 12;
var TRACE_CURVATURE_BIAS = 0.5;
var SMOOTH_KINK_THRESHOLD = 0.15;
var MERGE_THRESHOLD_RATIO = 0.08;
var JUNCTION_CROSSING_COS = -0.7;
var JUNCTION_ALIGNMENT_COS = 0.5;
var ORIENT_X_WEIGHT = 2;
var JUNCTION_CLEANUP_MAX_ITERATIONS = 5;
var DISTANCE_TRANSFORM_METHOD = "chamfer";
var SKELETON_METHOD = "zhang-suen";
var VORONOI_SAMPLING_INTERVAL = 2;
var THIN_MAX_ITERATIONS = 25;
var DRAWING_SPEED = 3e3;
var STROKE_PAUSE = 0.15;
function shortHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function charsHash(chars) {
  return shortHash([.../* @__PURE__ */ new Set([...chars])].sort().join(""));
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/font/enumerate-variants.ts
function enumerateVariantGlyphIds(font, chars) {
  const ancestor = /* @__PURE__ */ new Map();
  for (const ch of chars) {
    const gid = font.charToGlyphIndex(ch);
    if (gid === 0) continue;
    if (!ancestor.has(gid)) ancestor.set(gid, ch);
  }
  const gsub = font.tables.gsub;
  if (gsub?.lookups) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const lookup of gsub.lookups) {
        for (const subtable of lookup.subtables ?? []) {
          if (walkSubtable(lookup.lookupType, subtable, ancestor)) changed = true;
        }
      }
    }
  }
  const variants = /* @__PURE__ */ new Map();
  for (const [gid, clusterChar] of ancestor) {
    if (gid === 0) continue;
    variants.set(gid, { gid, clusterChar });
  }
  return variants;
}
function coverageIndex(coverage, gid) {
  if (!coverage) return -1;
  if (coverage.format === 1 && coverage.glyphs) {
    return coverage.glyphs.indexOf(gid);
  }
  if (coverage.format === 2 && coverage.ranges) {
    for (const r of coverage.ranges) {
      if (gid >= r.start && gid <= r.end) return r.index + (gid - r.start);
    }
  }
  return -1;
}
function setAncestor(ancestor, gid, ch) {
  if (gid === 0 || ancestor.has(gid)) return false;
  ancestor.set(gid, ch);
  return true;
}
function walkSubtable(lookupType, st, ancestor) {
  if (lookupType === 7 && st.extension && st.extensionLookupType !== void 0) {
    return walkSubtable(st.extensionLookupType, st.extension, ancestor);
  }
  switch (lookupType) {
    case 1:
      return walkSingleSub(st, ancestor);
    case 2:
      return walkMultipleSub(st, ancestor);
    case 3:
      return walkAlternateSub(st, ancestor);
    case 4:
      return walkLigatureSub(st, ancestor);
    default:
      return false;
  }
}
function walkSingleSub(st, ancestor) {
  let changed = false;
  const cov = st.coverage;
  if (!cov) return false;
  const gids = expandCoverage(cov);
  for (const inGid of gids) {
    const cp = ancestor.get(inGid);
    if (cp === void 0) continue;
    let outGid;
    if (st.substFormat === 1 && st.deltaGlyphId !== void 0) {
      outGid = inGid + st.deltaGlyphId & 65535;
    } else if (st.substFormat === 2 && st.substitute) {
      const idx = coverageIndex(cov, inGid);
      outGid = st.substitute[idx];
    }
    if (outGid !== void 0 && setAncestor(ancestor, outGid, cp)) changed = true;
  }
  return changed;
}
function walkMultipleSub(st, ancestor) {
  let changed = false;
  const cov = st.coverage;
  if (!cov || !st.sequences) return false;
  for (const inGid of expandCoverage(cov)) {
    const cp = ancestor.get(inGid);
    if (cp === void 0) continue;
    const idx = coverageIndex(cov, inGid);
    const seq = st.sequences[idx];
    if (!seq) continue;
    for (const outGid of seq) {
      if (setAncestor(ancestor, outGid, cp)) changed = true;
    }
  }
  return changed;
}
function walkAlternateSub(st, ancestor) {
  let changed = false;
  const cov = st.coverage;
  if (!cov || !st.alternateSets) return false;
  for (const inGid of expandCoverage(cov)) {
    const cp = ancestor.get(inGid);
    if (cp === void 0) continue;
    const idx = coverageIndex(cov, inGid);
    const alts = st.alternateSets[idx];
    if (!alts) continue;
    for (const outGid of alts) {
      if (setAncestor(ancestor, outGid, cp)) changed = true;
    }
  }
  return changed;
}
function walkLigatureSub(st, ancestor) {
  let changed = false;
  const cov = st.coverage;
  if (!cov || !st.ligatureSets) return false;
  for (const firstGid of expandCoverage(cov)) {
    const idx = coverageIndex(cov, firstGid);
    const set = st.ligatureSets[idx];
    if (!set) continue;
    for (const lig of set) {
      const firstCp = ancestor.get(firstGid);
      if (firstCp === void 0) continue;
      let allKnown = true;
      for (const comp of lig.components) {
        if (!ancestor.has(comp)) {
          allKnown = false;
          break;
        }
      }
      if (!allKnown) continue;
      if (setAncestor(ancestor, lig.ligGlyph, firstCp)) changed = true;
    }
  }
  return changed;
}
function expandCoverage(coverage) {
  const out = [];
  if (coverage.format === 1 && coverage.glyphs) {
    out.push(...coverage.glyphs);
  } else if (coverage.format === 2 && coverage.ranges) {
    for (const r of coverage.ranges) {
      for (let g = r.start; g <= r.end; g++) out.push(g);
    }
  }
  return out;
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/font/hb-shaper.ts
import { Blob, Face, Feature, Font, Buffer as HbBuffer, shape } from "harfbuzzjs";
async function getGsubFeatures(fontBuffer) {
  const blob = new Blob(fontBuffer);
  const face = new Face(blob, 0);
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const tag of face.getTableFeatureTags("GSUB")) {
    if (tag === "aalt" || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/font/parse.ts
function inferLineCap(font) {
  const os2 = font.tables.os2;
  const cjkBits = 1 << 17 | 1 << 18 | 1 << 24 | 1 << 27;
  if (os2?.ulUnicodeRange2 && os2.ulUnicodeRange2 & cjkBits) return "round";
  if (os2?.panose) {
    const familyKind = os2.panose[0] ?? 0;
    if (familyKind === 3) return "round";
    if (familyKind === 2 && os2.panose.some((v, i) => i > 0 && v !== 0)) return "butt";
  }
  if (os2?.sFamilyClass && os2.sFamilyClass >> 8 === 10) return "round";
  const name = (font.names.fontFamily?.en ?? "").toLowerCase();
  if (/\b(hand|script|cursive|brush|marker|chalk|crayon|writing|handwrit)/i.test(name)) return "round";
  return "round";
}
function extractGlyphById(font, glyphId) {
  if (glyphId <= 0 || glyphId >= font.numGlyphs) return null;
  const glyph = font.glyphs.get(glyphId);
  if (!glyph || glyph.index === 0) return null;
  const path = glyph.getPath(0, 0, font.unitsPerEm);
  const bb = glyph.getBoundingBox();
  const commands = path.commands.map((cmd) => {
    const base = { type: cmd.type, x: 0, y: 0 };
    if ("x" in cmd) base.x = cmd.x;
    if ("y" in cmd) base.y = cmd.y;
    if ("x1" in cmd) base.x1 = cmd.x1;
    if ("y1" in cmd) base.y1 = cmd.y1;
    if ("x2" in cmd) base.x2 = cmd.x2;
    if ("y2" in cmd) base.y2 = cmd.y2;
    return base;
  });
  return {
    // Variant glyphs have no single source character; use the glyph name as a
    // human-readable stand-in. Downstream code that cares about the character
    // should consult `unicode` (which we set to the first unicode mapping if
    // any, else 0).
    char: glyph.name ?? "",
    unicode: glyph.unicode ?? 0,
    advanceWidth: glyph.advanceWidth ?? 0,
    boundingBox: { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 },
    commands,
    pathString: path.toPathData(2)
  };
}
function extractGlyph(font, char, extraFonts) {
  let glyph = font.charToGlyph(char);
  let activeFont = font;
  if ((!glyph || glyph.index === 0) && extraFonts) {
    for (const f of extraFonts) {
      const g = f.charToGlyph(char);
      if (g && g.index !== 0) {
        glyph = g;
        activeFont = f;
        break;
      }
    }
  }
  if (!glyph || glyph.index === 0) return null;
  const path = glyph.getPath(0, 0, activeFont.unitsPerEm);
  const bb = glyph.getBoundingBox();
  const commands = path.commands.map((cmd) => {
    const base = { type: cmd.type, x: 0, y: 0 };
    if ("x" in cmd) base.x = cmd.x;
    if ("y" in cmd) base.y = cmd.y;
    if ("x1" in cmd) base.x1 = cmd.x1;
    if ("y1" in cmd) base.y1 = cmd.y1;
    if ("x2" in cmd) base.x2 = cmd.x2;
    if ("y2" in cmd) base.y2 = cmd.y2;
    return base;
  });
  return {
    char,
    unicode: char.codePointAt(0),
    advanceWidth: glyph.advanceWidth ?? 0,
    boundingBox: { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 },
    commands,
    pathString: path.toPathData(2)
  };
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/bezier.ts
function computePathBBox(subPaths) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const path of subPaths) {
    for (const p of path) {
      if (p.x < x1) x1 = p.x;
      if (p.y < y1) y1 = p.y;
      if (p.x > x2) x2 = p.x;
      if (p.y > y2) y2 = p.y;
    }
  }
  return { x1, y1, x2, y2 };
}
function distSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function subdivideQuadratic(p0, p1, p2, tolerance, result) {
  const mid = {
    x: 0.25 * p0.x + 0.5 * p1.x + 0.25 * p2.x,
    y: 0.25 * p0.y + 0.5 * p1.y + 0.25 * p2.y
  };
  const linearMid = midpoint(p0, p2);
  if (distSq(mid, linearMid) < tolerance * tolerance) {
    result.push(p2);
  } else {
    const q0 = midpoint(p0, p1);
    const q1 = midpoint(p1, p2);
    subdivideQuadratic(p0, q0, mid, tolerance, result);
    subdivideQuadratic(mid, q1, p2, tolerance, result);
  }
}
function subdivideCubic(p0, p1, p2, p3, tolerance, result) {
  const mid = {
    x: 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x,
    y: 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y
  };
  const linearMid = midpoint(p0, p3);
  if (distSq(mid, linearMid) < tolerance * tolerance) {
    result.push(p3);
  } else {
    const q0 = midpoint(p0, p1);
    const q1 = midpoint(p1, p2);
    const q2 = midpoint(p2, p3);
    const r0 = midpoint(q0, q1);
    const r1 = midpoint(q1, q2);
    const s = midpoint(r0, r1);
    subdivideCubic(p0, q0, r0, s, tolerance, result);
    subdivideCubic(s, r1, q2, p3, tolerance, result);
  }
}
function flattenPath(commands, tolerance = BEZIER_TOLERANCE) {
  const subPaths = [];
  let current = [];
  let cursor = { x: 0, y: 0 };
  let subPathStart = { x: 0, y: 0 };
  for (const cmd of commands) {
    switch (cmd.type) {
      case "M":
        if (current.length > 0) subPaths.push(current);
        current = [{ x: cmd.x, y: cmd.y }];
        cursor = { x: cmd.x, y: cmd.y };
        subPathStart = { ...cursor };
        break;
      case "L":
        current.push({ x: cmd.x, y: cmd.y });
        cursor = { x: cmd.x, y: cmd.y };
        break;
      case "Q":
        subdivideQuadratic(cursor, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x, y: cmd.y }, tolerance, current);
        cursor = { x: cmd.x, y: cmd.y };
        break;
      case "C":
        subdivideCubic(cursor, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x2, y: cmd.y2 }, { x: cmd.x, y: cmd.y }, tolerance, current);
        cursor = { x: cmd.x, y: cmd.y };
        break;
      case "Z":
        if (current.length > 0) {
          current.push({ ...subPathStart });
          subPaths.push(current);
          current = [];
        }
        cursor = { ...subPathStart };
        break;
    }
  }
  if (current.length > 0) subPaths.push(current);
  return subPaths;
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/font-units.ts
var round2 = (n) => Math.round(n * 100) / 100;
var round3 = (n) => Math.round(n * 1e3) / 1e3;
function toFontUnits(strokes, transform, drawingSpeed, strokePause) {
  const scale = transform.scaleX;
  let timeOffset = 0;
  return strokes.map((s, i) => {
    const length = round2(s.length / scale);
    const animationDuration = Math.max(round3(length / drawingSpeed), 1e-3);
    const delay = round3(timeOffset);
    timeOffset += animationDuration + (i < strokes.length - 1 ? strokePause : 0);
    return {
      ...s,
      length,
      animationDuration,
      delay,
      points: s.points.map((p) => ({
        x: round2(p.x / transform.scaleX + transform.offsetX),
        y: round2(p.y / transform.scaleY + transform.offsetY),
        t: round3(p.t),
        width: round2(p.width / scale)
      }))
    };
  });
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/rasterize.ts
function rasterize(subPaths, boundingBox, resolution = DEFAULT_RESOLUTION) {
  const bboxW = boundingBox.x2 - boundingBox.x1;
  const bboxH = boundingBox.y2 - boundingBox.y1;
  if (bboxW <= 0 || bboxH <= 0) {
    return {
      bitmap: new Uint8Array(resolution * resolution),
      width: resolution,
      height: resolution,
      transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
    };
  }
  const padX = bboxW * BITMAP_PADDING;
  const padY = bboxH * BITMAP_PADDING;
  const minX = boundingBox.x1 - padX;
  const minY = boundingBox.y1 - padY;
  const totalW = bboxW + 2 * padX;
  const totalH = bboxH + 2 * padY;
  const scale = Math.min(resolution / totalW, resolution / totalH);
  const w = Math.ceil(totalW * scale);
  const h = Math.ceil(totalH * scale);
  const bitmap = new Uint8Array(w * h);
  const scaleX = scale;
  const scaleY = scale;
  const offsetX = minX;
  const offsetY = minY;
  const edges = [];
  for (const path of subPaths) {
    for (let i = 0; i < path.length - 1; i++) {
      const p1x = (path[i].x - offsetX) * scaleX;
      const p1y = (path[i].y - offsetY) * scaleY;
      const p2x = (path[i + 1].x - offsetX) * scaleX;
      const p2y = (path[i + 1].y - offsetY) * scaleY;
      if (p1y === p2y) continue;
      const direction = p1y > p2y ? 1 : -1;
      edges.push({ x1: p1x, y1: p1y, x2: p2x, y2: p2y, direction });
    }
  }
  for (let y = 0; y < h; y++) {
    const scanY = y + 0.5;
    const intersections = [];
    for (const edge of edges) {
      const yMin = Math.min(edge.y1, edge.y2);
      const yMax = Math.max(edge.y1, edge.y2);
      if (scanY < yMin || scanY >= yMax) continue;
      const t = (scanY - edge.y1) / (edge.y2 - edge.y1);
      const x = edge.x1 + t * (edge.x2 - edge.x1);
      intersections.push({ x, direction: edge.direction });
    }
    intersections.sort((a, b) => a.x - b.x);
    let winding = 0;
    let nextIdx = 0;
    for (let x = 0; x < w; x++) {
      const pixelCenter = x + 0.5;
      while (nextIdx < intersections.length && intersections[nextIdx].x <= pixelCenter) {
        winding += intersections[nextIdx].direction;
        nextIdx++;
      }
      if (winding !== 0) {
        bitmap[y * w + x] = 1;
      }
    }
  }
  return { bitmap, width: w, height: h, transform: { scaleX, scaleY, offsetX, offsetY } };
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/rtl.ts
function isRtlCodepoint(cp) {
  if (cp >= 1424 && cp <= 1535) return true;
  if (cp >= 1536 && cp <= 2303) return true;
  if (cp >= 64336 && cp <= 65023) return true;
  if (cp >= 65136 && cp <= 65279) return true;
  return false;
}
function isRtlChar(char) {
  if (!char) return false;
  const cp = char.codePointAt(0);
  return cp != null && isRtlCodepoint(cp);
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/trace.ts
var DX = [0, 1, 1, 1, 0, -1, -1, -1];
var DY = [-1, -1, 0, 1, 1, 1, 0, -1];
function getNeighbors(x, y, skeleton, width, height) {
  const neighbors = [];
  for (let i = 0; i < 8; i++) {
    const nx = x + DX[i];
    const ny = y + DY[i];
    if (nx >= 0 && nx < width && ny >= 0 && ny < height && skeleton[ny * width + nx]) {
      neighbors.push({ x: nx, y: ny });
    }
  }
  return neighbors;
}
function degree(x, y, skeleton, width, height) {
  return getNeighbors(x, y, skeleton, width, height).length;
}
function traceChain(startX, startY, skeleton, visited, width, height, lookback, curvatureBias) {
  const chain = [{ x: startX, y: startY }];
  visited[startY * width + startX] = 1;
  let cx = startX;
  let cy = startY;
  while (true) {
    const neighbors = getNeighbors(cx, cy, skeleton, width, height);
    const unvisited = neighbors.filter((n) => !visited[n.y * width + n.x]);
    if (unvisited.length === 0) {
      const visitedJunction = neighbors.find((n) => visited[n.y * width + n.x] && degree(n.x, n.y, skeleton, width, height) >= 3);
      if (visitedJunction) chain.push(visitedJunction);
      break;
    }
    let next;
    if (chain.length >= 2 && unvisited.length > 1) {
      const { dirX, dirY } = estimateDirection(chain, cx, cy, lookback, curvatureBias);
      if (shouldStopAtJunction(unvisited, cx, cy, dirX, dirY, skeleton, visited, width, height, lookback)) {
        break;
      }
      next = pickStraightest(unvisited, cx, cy, dirX, dirY, skeleton, visited, width, height, lookback);
    } else if (unvisited.length === 1) {
      next = unvisited[0];
    } else {
      next = unvisited.find((n) => degree(n.x, n.y, skeleton, width, height) <= 2) ?? unvisited[0];
    }
    visited[next.y * width + next.x] = 1;
    chain.push(next);
    cx = next.x;
    cy = next.y;
    if (degree(cx, cy, skeleton, width, height) <= 1) break;
  }
  return chain;
}
function estimateDirection(chain, cx, cy, lookback, curvatureBias) {
  const n = chain.length;
  const windowSize = Math.min(n - 1, lookback);
  if (windowSize < 4 || curvatureBias === 0) {
    const prev = chain[n - 1 - windowSize];
    return { dirX: cx - prev.x, dirY: cy - prev.y };
  }
  const halfSize = Math.floor(windowSize / 2);
  const midPoint = chain[n - 1 - halfSize];
  const oldPoint = chain[n - 1 - windowSize];
  const oldDirX = midPoint.x - oldPoint.x;
  const oldDirY = midPoint.y - oldPoint.y;
  const recentDirX = cx - midPoint.x;
  const recentDirY = cy - midPoint.y;
  return {
    dirX: recentDirX + curvatureBias * (recentDirX - oldDirX),
    dirY: recentDirY + curvatureBias * (recentDirY - oldDirY)
  };
}
function pickStraightest(candidates, cx, cy, dirX, dirY, skeleton, visited, width, height, lookback) {
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
  let best = candidates[0];
  let bestCos = -2;
  for (const c of candidates) {
    const ahead = peekAhead(cx, cy, c, skeleton, visited, width, height, lookback);
    const cdx = ahead.x - cx;
    const cdy = ahead.y - cy;
    const cLen = Math.sqrt(cdx * cdx + cdy * cdy);
    if (dirLen === 0 || cLen === 0) continue;
    const cos = (dirX * cdx + dirY * cdy) / (dirLen * cLen);
    if (cos > bestCos) {
      bestCos = cos;
      best = c;
    }
  }
  return best;
}
function peekAhead(cx, cy, start, skeleton, visited, width, height, steps) {
  let px = cx;
  let py = cy;
  let x = start.x;
  let y = start.y;
  for (let step = 0; step < steps; step++) {
    const neighbors = getNeighbors(x, y, skeleton, width, height);
    const forward = neighbors.filter((n) => (n.x !== px || n.y !== py) && !visited[n.y * width + n.x]);
    if (forward.length === 0) break;
    const dx = x - px;
    const dy = y - py;
    let nextP = forward[0];
    if (forward.length > 1 && (dx !== 0 || dy !== 0)) {
      const dLen = Math.sqrt(dx * dx + dy * dy);
      let bestC = -2;
      for (const f of forward) {
        const fdx = f.x - x;
        const fdy = f.y - y;
        const fLen = Math.sqrt(fdx * fdx + fdy * fdy);
        if (fLen === 0) continue;
        const c = (dx * fdx + dy * fdy) / (dLen * fLen);
        if (c > bestC) {
          bestC = c;
          nextP = f;
        }
      }
    }
    px = x;
    py = y;
    x = nextP.x;
    y = nextP.y;
  }
  return { x, y };
}
function shouldStopAtJunction(unvisited, cx, cy, dirX, dirY, skeleton, visited, width, height, lookback) {
  if (unvisited.length < 2) return false;
  const branchDirs = [];
  for (const b of unvisited) {
    const ahead = peekAhead(cx, cy, b, skeleton, visited, width, height, lookback);
    const dx = ahead.x - cx;
    const dy = ahead.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) branchDirs.push({ dx: dx / len, dy: dy / len });
  }
  let hasStraightPair = false;
  for (let i = 0; i < branchDirs.length && !hasStraightPair; i++) {
    for (let j = i + 1; j < branchDirs.length; j++) {
      const cos = branchDirs[i].dx * branchDirs[j].dx + branchDirs[i].dy * branchDirs[j].dy;
      if (cos < JUNCTION_CROSSING_COS) {
        hasStraightPair = true;
        break;
      }
    }
  }
  if (!hasStraightPair) return false;
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
  if (dirLen === 0) return true;
  const ndx = dirX / dirLen;
  const ndy = dirY / dirLen;
  let maxAlign = -2;
  for (const bd of branchDirs) {
    const align = ndx * bd.dx + ndy * bd.dy;
    if (align > maxAlign) maxAlign = align;
  }
  return maxAlign < JUNCTION_ALIGNMENT_COS;
}
function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex2 = point.x - lineStart.x;
    const ey2 = point.y - lineStart.y;
    return Math.sqrt(ex2 * ex2 + ey2 * ey2);
  }
  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq;
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  const ex = point.x - projX;
  const ey = point.y - projY;
  return Math.sqrt(ex * ex + ey * ey);
}
function rdpSimplify(points, tolerance = RDP_TOLERANCE) {
  if (points.length <= 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const dist3 = perpendicularDistance(points[i], first, last);
    if (dist3 > maxDist) {
      maxDist = dist3;
      maxIdx = i;
    }
  }
  if (maxDist > tolerance) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), tolerance);
    const right = rdpSimplify(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}
function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function mergePolylines(polylines, threshold) {
  if (polylines.length <= 1) return polylines;
  const used = new Uint8Array(polylines.length);
  const merged = [];
  for (let i = 0; i < polylines.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    let chain = [...polylines[i]];
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < polylines.length; j++) {
        if (used[j]) continue;
        const other = polylines[j];
        const chainStart = chain[0];
        const chainEnd = chain[chain.length - 1];
        const otherStart = other[0];
        const otherEnd = other[other.length - 1];
        if (dist(chainEnd, otherStart) < threshold) {
          chain = [...chain, ...other.slice(1)];
        } else if (dist(chainEnd, otherEnd) < threshold) {
          chain = [...chain, ...[...other].reverse().slice(1)];
        } else if (dist(chainStart, otherEnd) < threshold) {
          chain = [...other, ...chain.slice(1)];
        } else if (dist(chainStart, otherStart) < threshold) {
          chain = [...[...other].reverse(), ...chain.slice(1)];
        } else {
          continue;
        }
        used[j] = 1;
        changed = true;
      }
    }
    merged.push(chain);
  }
  return merged;
}
function smoothJunctionKinks(polyline, lookback, curvatureBias, minAngle = SMOOTH_KINK_MIN_ANGLE * Math.PI / 180) {
  if (polyline.length <= 2) return polyline;
  const result = [polyline[0]];
  for (let i = 1; i < polyline.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = polyline[i];
    const next = polyline[i + 1];
    const ax = prev.x - curr.x;
    const ay = prev.y - curr.y;
    const bx = next.x - curr.x;
    const by = next.y - curr.y;
    const magA = Math.sqrt(ax * ax + ay * ay);
    const magB = Math.sqrt(bx * bx + by * by);
    if (magA === 0 || magB === 0) {
      continue;
    }
    const cosAngle = (ax * bx + ay * by) / (magA * magB);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    if (angle >= minAngle) {
      continue;
    }
    if (result.length >= 3) {
      const { dirX, dirY } = estimateDirection(result, prev.x, prev.y, lookback, curvatureBias);
      const predLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (predLen > 0) {
        const skipX = next.x - prev.x;
        const skipY = next.y - prev.y;
        const skipLen = Math.sqrt(skipX * skipX + skipY * skipY);
        const toCurrX = curr.x - prev.x;
        const toCurrY = curr.y - prev.y;
        const toCurrLen = Math.sqrt(toCurrX * toCurrX + toCurrY * toCurrY);
        if (skipLen > 0 && toCurrLen > 0) {
          const cosSkip = (dirX * skipX + dirY * skipY) / (predLen * skipLen);
          const cosThrough = (dirX * toCurrX + dirY * toCurrY) / (predLen * toCurrLen);
          if (cosSkip - cosThrough > SMOOTH_KINK_THRESHOLD) {
            continue;
          }
        }
      }
    }
    if (result.length >= 2) {
      const prevPrev = result[result.length - 2];
      const withX = curr.x - prev.x;
      const withY = curr.y - prev.y;
      const withLen = Math.sqrt(withX * withX + withY * withY);
      const withoutX = next.x - prev.x;
      const withoutY = next.y - prev.y;
      const withoutLen = Math.sqrt(withoutX * withoutX + withoutY * withoutY);
      const inX = prev.x - prevPrev.x;
      const inY = prev.y - prevPrev.y;
      const inLen = Math.sqrt(inX * inX + inY * inY);
      if (inLen > 0 && withLen > 0 && withoutLen > 0) {
        const cosWithCurr = (inX * withX + inY * withY) / (inLen * withLen);
        const cosWithout = (inX * withoutX + inY * withoutY) / (inLen * withoutLen);
        if (cosWithout - cosWithCurr > SMOOTH_KINK_THRESHOLD) {
          continue;
        }
      }
    }
    result.push(curr);
  }
  result.push(polyline[polyline.length - 1]);
  return result;
}
function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}
function traceAndSimplify(skeleton, width, height, rdpTolerance = RDP_TOLERANCE, spurMinLength, lookback = TRACE_LOOKBACK, curvatureBias = TRACE_CURVATURE_BIAS, rtl = false) {
  const visited = new Uint8Array(width * height);
  const polylines = [];
  const endpoints = [];
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!skeleton[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (degree(x, y, skeleton, width, height) === 1) {
        endpoints.push({ x, y });
      }
    }
  }
  let lastEnd = { x: rtl ? maxX : minX, y: (minY + maxY) / 2 };
  while (true) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < endpoints.length; i++) {
      const ep2 = endpoints[i];
      if (visited[ep2.y * width + ep2.x]) continue;
      const d = dist(ep2, lastEnd);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const ep = endpoints[bestIdx];
    const chain = traceChain(ep.x, ep.y, skeleton, visited, width, height, lookback, curvatureBias);
    if (chain.length > 1) {
      const startDist = dist(chain[0], lastEnd);
      const endDist = dist(chain[chain.length - 1], lastEnd);
      if (endDist < startDist) {
        chain.reverse();
      }
      polylines.push(chain);
      lastEnd = chain[chain.length - 1];
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!skeleton[y * width + x] || visited[y * width + x]) continue;
      const chain = traceChain(x, y, skeleton, visited, width, height, lookback, curvatureBias);
      if (chain.length >= 1) polylines.push(chain);
    }
  }
  const mergeThreshold = Math.max(width, height) * MERGE_THRESHOLD_RATIO;
  const mergedPolylines = mergePolylines(polylines, mergeThreshold);
  const smoothed = mergedPolylines.map((p) => smoothJunctionKinks(p, lookback, curvatureBias));
  const effectiveSpurMin = spurMinLength ?? Math.min(Math.round(Math.max(width, height) * SPUR_LENGTH_RATIO), 10);
  const pruned = smoothed.filter((p) => {
    if (pathLength(p) >= effectiveSpurMin) return true;
    const pStart = p[0];
    const pEnd = p[p.length - 1];
    const isConnected = smoothed.some((other) => {
      if (other === p) return false;
      const oStart = other[0];
      const oEnd = other[other.length - 1];
      return dist(pStart, oStart) < mergeThreshold || dist(pStart, oEnd) < mergeThreshold || dist(pEnd, oStart) < mergeThreshold || dist(pEnd, oEnd) < mergeThreshold;
    });
    return !isConnected;
  });
  return pruned.map((p) => rdpSimplify(p, rdpTolerance));
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/voronoi-medial-axis.ts
import { Delaunay } from "d3-delaunay";
function voronoiMedialAxis(subPaths, _bbox, transform, bitmapWidth, bitmapHeight, samplingInterval = 2) {
  const boundary = sampleBoundary(subPaths, transform, samplingInterval);
  if (boundary.length < 3) {
    return { polylines: [], widths: [] };
  }
  const coords = boundary.flatMap((p) => [p.x, p.y]);
  const delaunay = new Delaunay(coords);
  const voronoi = delaunay.voronoi([0, 0, bitmapWidth, bitmapHeight]);
  const edges = extractInsideEdges(voronoi, boundary, subPaths, transform);
  if (edges.length === 0) {
    return { polylines: [], widths: [] };
  }
  return traceGraph(edges, boundary, subPaths, transform);
}
function sampleBoundary(subPaths, transform, interval) {
  const points = [];
  for (const path of subPaths) {
    if (path.length < 2) continue;
    let accumulated = 0;
    const first = toBitmapSpace(path[0], transform);
    points.push(first);
    for (let i = 1; i < path.length; i++) {
      const prev = toBitmapSpace(path[i - 1], transform);
      const curr = toBitmapSpace(path[i], transform);
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (segLen === 0) continue;
      accumulated += segLen;
      while (accumulated >= interval) {
        accumulated -= interval;
        const t = 1 - accumulated / segLen;
        points.push({
          x: prev.x + dx * t,
          y: prev.y + dy * t
        });
      }
    }
  }
  return points;
}
function toBitmapSpace(p, transform) {
  return {
    x: (p.x - transform.offsetX) * transform.scaleX,
    y: (p.y - transform.offsetY) * transform.scaleY
  };
}
function extractInsideEdges(voronoi, _boundary, subPaths, transform) {
  const edges = [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < voronoi.delaunay.points.length / 2; i++) {
    const cell = voronoi.cellPolygon(i);
    if (!cell) continue;
    for (let j = 0; j < cell.length - 1; j++) {
      const [ax, ay] = cell[j];
      const [bx, by] = cell[j + 1];
      const key = edgeKey(ax, ay, bx, by);
      if (seen.has(key)) continue;
      seen.add(key);
      const a = { x: ax, y: ay };
      const b = { x: bx, y: by };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (isInsideShape(mid, subPaths, transform)) {
        if (isInsideShape(a, subPaths, transform) && isInsideShape(b, subPaths, transform)) {
          edges.push({ a, b });
        }
      }
    }
  }
  return edges;
}
function edgeKey(ax, ay, bx, by) {
  const rax = Math.round(ax * 10);
  const ray = Math.round(ay * 10);
  const rbx = Math.round(bx * 10);
  const rby = Math.round(by * 10);
  if (rax < rbx || rax === rbx && ray < rby) {
    return `${rax},${ray}-${rbx},${rby}`;
  }
  return `${rbx},${rby}-${rax},${ray}`;
}
function isInsideShape(point, subPaths, transform) {
  let winding = 0;
  const px = point.x;
  const py = point.y;
  for (const path of subPaths) {
    for (let i = 0; i < path.length - 1; i++) {
      const ax = (path[i].x - transform.offsetX) * transform.scaleX;
      const ay = (path[i].y - transform.offsetY) * transform.scaleY;
      const bx = (path[i + 1].x - transform.offsetX) * transform.scaleX;
      const by = (path[i + 1].y - transform.offsetY) * transform.scaleY;
      if (ay <= py) {
        if (by > py) {
          if (cross(ax, ay, bx, by, px, py) > 0) winding++;
        }
      } else {
        if (by <= py) {
          if (cross(ax, ay, bx, by, px, py) < 0) winding--;
        }
      }
    }
  }
  return winding !== 0;
}
function cross(ax, ay, bx, by, px, py) {
  return (bx - ax) * (py - ay) - (px - ax) * (by - ay);
}
function pointKey(p) {
  return `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;
}
function traceGraph(edges, boundary, subPaths, transform) {
  const adj = /* @__PURE__ */ new Map();
  function getOrCreate(p) {
    const key = pointKey(p);
    if (!adj.has(key)) {
      adj.set(key, { point: p, neighbors: /* @__PURE__ */ new Set() });
    }
    return key;
  }
  for (const { a, b } of edges) {
    const ka = getOrCreate(a);
    const kb = getOrCreate(b);
    adj.get(ka).neighbors.add(kb);
    adj.get(kb).neighbors.add(ka);
  }
  contractShortEdges(adj, 2);
  pruneShortSpurs(adj, boundary, subPaths, transform);
  const visitedEdges = /* @__PURE__ */ new Set();
  const polylines = [];
  const widths = [];
  const allNodes = [...adj.keys()];
  allNodes.sort((a, b) => {
    const da = adj.get(a).neighbors.size;
    const db = adj.get(b).neighbors.size;
    if (da === 1 && db !== 1) return -1;
    if (da !== 1 && db === 1) return 1;
    if (da >= 3 && db < 3) return -1;
    if (da < 3 && db >= 3) return 1;
    return 0;
  });
  for (const start of allNodes) {
    const node = adj.get(start);
    if (!node || node.neighbors.size === 0) continue;
    for (const firstNeighbor of node.neighbors) {
      const edgeKey2 = `${start}-${firstNeighbor}`;
      if (visitedEdges.has(edgeKey2)) continue;
      const chain = [node.point];
      let prev = start;
      let curr = firstNeighbor;
      visitedEdges.add(`${prev}-${curr}`);
      visitedEdges.add(`${curr}-${prev}`);
      while (true) {
        const currNode = adj.get(curr);
        if (!currNode) break;
        chain.push(currNode.point);
        if (currNode.neighbors.size !== 2) break;
        let next = null;
        for (const n of currNode.neighbors) {
          if (n !== prev) {
            next = n;
            break;
          }
        }
        if (!next || visitedEdges.has(`${curr}-${next}`)) break;
        visitedEdges.add(`${curr}-${next}`);
        visitedEdges.add(`${next}-${curr}`);
        prev = curr;
        curr = next;
      }
      if (chain.length >= 2) {
        let chainLen = 0;
        for (let i = 1; i < chain.length; i++) {
          const dx = chain[i].x - chain[i - 1].x;
          const dy = chain[i].y - chain[i - 1].y;
          chainLen += Math.sqrt(dx * dx + dy * dy);
        }
        if (chainLen < 2) continue;
        const chainWidths = chain.map((p) => nearestBoundaryDist(p, boundary) * 2);
        polylines.push(chain);
        widths.push(chainWidths);
      }
    }
  }
  return { polylines, widths };
}
function contractShortEdges(adj, threshold) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const [keyA, nodeA] of adj) {
      for (const keyB of nodeA.neighbors) {
        const nodeB = adj.get(keyB);
        if (!nodeB) continue;
        const dx = nodeA.point.x - nodeB.point.x;
        const dy = nodeA.point.y - nodeB.point.y;
        if (Math.sqrt(dx * dx + dy * dy) >= threshold) continue;
        const keepKey = nodeA.neighbors.size >= nodeB.neighbors.size ? keyA : keyB;
        const removeKey = keepKey === keyA ? keyB : keyA;
        const keepNode = adj.get(keepKey);
        const removeNode = adj.get(removeKey);
        for (const n of removeNode.neighbors) {
          if (n === keepKey) continue;
          const neighbor = adj.get(n);
          if (!neighbor) continue;
          neighbor.neighbors.delete(removeKey);
          if (n !== keepKey) {
            neighbor.neighbors.add(keepKey);
            keepNode.neighbors.add(n);
          }
        }
        keepNode.neighbors.delete(removeKey);
        keepNode.neighbors.delete(keepKey);
        adj.delete(removeKey);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
}
function pruneShortSpurs(adj, boundary, _subPaths, _transform) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, node] of adj) {
      if (node.neighbors.size !== 1) continue;
      let length = 0;
      let curr = key;
      let prev = "";
      const chain = [curr];
      while (true) {
        const cn = adj.get(curr);
        if (!cn) break;
        let next = null;
        for (const n of cn.neighbors) {
          if (n !== prev) {
            next = n;
            break;
          }
        }
        if (!next) break;
        const nextNode = adj.get(next);
        if (!nextNode) break;
        const dx = nextNode.point.x - cn.point.x;
        const dy = nextNode.point.y - cn.point.y;
        length += Math.sqrt(dx * dx + dy * dy);
        if (nextNode.neighbors.size >= 3) {
          const localWidth = nearestBoundaryDist(nextNode.point, boundary) * 2;
          if (length < localWidth * 1.5) {
            for (const c of chain) {
              const cNode = adj.get(c);
              if (cNode) {
                for (const n of cNode.neighbors) {
                  adj.get(n)?.neighbors.delete(c);
                }
                adj.delete(c);
              }
            }
            nextNode.neighbors.delete(curr);
            changed = true;
          }
          break;
        }
        if (nextNode.neighbors.size <= 1) break;
        prev = curr;
        curr = next;
        chain.push(curr);
      }
    }
  }
}
function nearestBoundaryDist(p, boundary) {
  let minDist = Infinity;
  for (const b of boundary) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = dx * dx + dy * dy;
    if (d < minDist) minDist = d;
  }
  return Math.sqrt(minDist);
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/skeletonize/cleanup.ts
var DX2 = [0, 1, 1, 1, 0, -1, -1, -1];
var DY2 = [-1, -1, 0, 1, 1, 1, 0, -1];
function degree2(x, y, skel, w, h) {
  let count = 0;
  for (let i = 0; i < 8; i++) {
    const nx = x + DX2[i];
    const ny = y + DY2[i];
    if (nx >= 0 && nx < w && ny >= 0 && ny < h && skel[ny * w + nx]) count++;
  }
  return count;
}
function restoreErasedComponents(bitmap, skeleton, dt, width, height) {
  const labels = new Int32Array(width * height);
  let nextLabel = 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!bitmap[idx] || labels[idx]) continue;
      const label = nextLabel++;
      const queue = [idx];
      labels[idx] = label;
      while (queue.length > 0) {
        const ci = queue.pop();
        const cx = ci % width;
        const cy = (ci - cx) / width;
        for (let d = 0; d < 8; d++) {
          const nx = cx + DX2[d];
          const ny = cy + DY2[d];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = ny * width + nx;
          if (bitmap[ni] && !labels[ni]) {
            labels[ni] = label;
            queue.push(ni);
          }
        }
      }
    }
  }
  const hasSkeleton = new Uint8Array(nextLabel);
  const bestIdx = new Int32Array(nextLabel).fill(-1);
  const bestDt = new Float32Array(nextLabel);
  for (let i = 0; i < bitmap.length; i++) {
    const label = labels[i];
    if (!label) continue;
    if (skeleton[i]) hasSkeleton[label] = 1;
    if (dt[i] > bestDt[label]) {
      bestDt[label] = dt[i];
      bestIdx[label] = i;
    }
  }
  for (let label = 1; label < nextLabel; label++) {
    if (!hasSkeleton[label] && bestIdx[label] >= 0) {
      skeleton[bestIdx[label]] = 1;
    }
  }
}
function cleanJunctionClusters(skeleton, dt, width, height, thin, maxIterations = JUNCTION_CLEANUP_MAX_ITERATIONS) {
  let current = skeleton;
  for (let iter = 0; iter < maxIterations; iter++) {
    const result = collapseClusterPass(current, dt, width, height);
    if (!result) break;
    current = thin(result, width, height);
  }
  return current;
}
function collapseClusterPass(skeleton, dt, width, height) {
  const result = new Uint8Array(skeleton);
  const isJunction = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (result[y * width + x] && degree2(x, y, result, width, height) >= 3) {
        isJunction[y * width + x] = 1;
      }
    }
  }
  const visited = new Uint8Array(width * height);
  let foundCluster = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isJunction[y * width + x] || visited[y * width + x]) continue;
      const cluster = [];
      const queue = [{ x, y }];
      visited[y * width + x] = 1;
      while (queue.length > 0) {
        const curr = queue.shift();
        const idx = curr.y * width + curr.x;
        cluster.push({ x: curr.x, y: curr.y, idx });
        for (let i = 0; i < 8; i++) {
          const nx = curr.x + DX2[i];
          const ny = curr.y + DY2[i];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (isJunction[nIdx] && !visited[nIdx]) {
            visited[nIdx] = 1;
            queue.push({ x: nx, y: ny });
          }
        }
      }
      if (cluster.length <= 1) continue;
      foundCluster = true;
      let bestIdx = cluster[0].idx;
      let bestDt = dt[bestIdx];
      for (const p of cluster) {
        if (dt[p.idx] > bestDt) {
          bestDt = dt[p.idx];
          bestIdx = p.idx;
        }
      }
      const arms = [];
      const clusterSet = new Set(cluster.map((p) => p.idx));
      for (const p of cluster) {
        for (let i = 0; i < 8; i++) {
          const nx = p.x + DX2[i];
          const ny = p.y + DY2[i];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (result[nIdx] && !clusterSet.has(nIdx)) {
            arms.push({ x: nx, y: ny });
          }
        }
      }
      for (const p of cluster) {
        result[p.idx] = 0;
      }
      result[bestIdx] = 1;
      const bestX = bestIdx % width;
      const bestY = (bestIdx - bestX) / width;
      for (const arm of arms) {
        bresenham(result, bestX, bestY, arm.x, arm.y, width);
      }
    }
  }
  return foundCluster ? result : null;
}
function bresenham(bitmap, x0, y0, x1, y1, width) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0;
  let cy = y0;
  while (true) {
    bitmap[cy * width + cx] = 1;
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/skeletonize/guo-hall.ts
function guoHallThin(bitmap, width, height) {
  const result = new Uint8Array(bitmap);
  const get = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return result[y * width + x];
  };
  let changed = true;
  while (changed) {
    changed = false;
    const toDelete1 = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (result[y * width + x] === 0) continue;
        const p2 = get(x, y - 1);
        const p3 = get(x + 1, y - 1);
        const p4 = get(x + 1, y);
        const p5 = get(x + 1, y + 1);
        const p6 = get(x, y + 1);
        const p7 = get(x - 1, y + 1);
        const p8 = get(x - 1, y);
        const p9 = get(x - 1, y - 1);
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9];
        let C = 0;
        for (let i = 0; i < 8; i++) {
          if (seq[i] === 0 && seq[(i + 1) % 8] === 1) C++;
        }
        if (C !== 1) continue;
        const n1 = (p9 | p2) + (p3 | p4) + (p5 | p6) + (p7 | p8);
        const n2 = (p2 | p3) + (p4 | p5) + (p6 | p7) + (p8 | p9);
        const N = Math.min(n1, n2);
        if (N < 2 || N > 3) continue;
        if ((p2 | p3) & (p6 | p7)) continue;
        toDelete1.push(y * width + x);
      }
    }
    for (const idx of toDelete1) {
      result[idx] = 0;
      changed = true;
    }
    const toDelete2 = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (result[y * width + x] === 0) continue;
        const p2 = get(x, y - 1);
        const p3 = get(x + 1, y - 1);
        const p4 = get(x + 1, y);
        const p5 = get(x + 1, y + 1);
        const p6 = get(x, y + 1);
        const p7 = get(x - 1, y + 1);
        const p8 = get(x - 1, y);
        const p9 = get(x - 1, y - 1);
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9];
        let C = 0;
        for (let i = 0; i < 8; i++) {
          if (seq[i] === 0 && seq[(i + 1) % 8] === 1) C++;
        }
        if (C !== 1) continue;
        const n1 = (p9 | p2) + (p3 | p4) + (p5 | p6) + (p7 | p8);
        const n2 = (p2 | p3) + (p4 | p5) + (p6 | p7) + (p8 | p9);
        const N = Math.min(n1, n2);
        if (N < 2 || N > 3) continue;
        if ((p4 | p5) & (p8 | p9)) continue;
        toDelete2.push(y * width + x);
      }
    }
    for (const idx of toDelete2) {
      result[idx] = 0;
      changed = true;
    }
  }
  return result;
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/skeletonize/lee.ts
function buildRemovalLUT() {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const p2 = i >> 0 & 1;
    const p3 = i >> 1 & 1;
    const p4 = i >> 2 & 1;
    const p5 = i >> 3 & 1;
    const p6 = i >> 4 & 1;
    const p7 = i >> 5 & 1;
    const p8 = i >> 6 & 1;
    const p9 = i >> 7 & 1;
    const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
    if (B < 2 || B > 6) continue;
    const seq = [p2, p3, p4, p5, p6, p7, p8, p9];
    let A = 0;
    for (let j = 0; j < 8; j++) {
      if (seq[j] === 0 && seq[(j + 1) % 8] === 1) A++;
    }
    if (A !== 1) continue;
    lut[i] = 1;
  }
  return lut;
}
function encodeNeighborhood(x, y, bitmap, width, height) {
  let code = 0;
  if (y > 0 && bitmap[(y - 1) * width + x]) code |= 1;
  if (y > 0 && x < width - 1 && bitmap[(y - 1) * width + x + 1]) code |= 2;
  if (x < width - 1 && bitmap[y * width + x + 1]) code |= 4;
  if (y < height - 1 && x < width - 1 && bitmap[(y + 1) * width + x + 1]) code |= 8;
  if (y < height - 1 && bitmap[(y + 1) * width + x]) code |= 16;
  if (y < height - 1 && x > 0 && bitmap[(y + 1) * width + x - 1]) code |= 32;
  if (x > 0 && bitmap[y * width + x - 1]) code |= 64;
  if (y > 0 && x > 0 && bitmap[(y - 1) * width + x - 1]) code |= 128;
  return code;
}
var REMOVAL_LUT = buildRemovalLUT();
var BORDER_DIRS = [
  { dx: 0, dy: -1 },
  // N
  { dx: 1, dy: -1 },
  // NE
  { dx: 1, dy: 0 },
  // E
  { dx: 1, dy: 1 },
  // SE
  { dx: 0, dy: 1 },
  // S
  { dx: -1, dy: 1 },
  // SW
  { dx: -1, dy: 0 },
  // W
  { dx: -1, dy: -1 }
  // NW
];
function leeThin(bitmap, width, height) {
  const result = new Uint8Array(bitmap);
  let changed = true;
  while (changed) {
    changed = false;
    for (const dir of BORDER_DIRS) {
      const toDelete = [];
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          if (result[idx] === 0) continue;
          const nx = x + dir.dx;
          const ny = y + dir.dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && result[ny * width + nx] !== 0) continue;
          const neighbors = encodeNeighborhood(x, y, result, width, height);
          if (REMOVAL_LUT[neighbors]) {
            toDelete.push(idx);
          }
        }
      }
      for (const idx of toDelete) {
        result[idx] = 0;
        changed = true;
      }
    }
  }
  return result;
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/skeletonize/medial-axis.ts
function medialAxisThin(bitmap, dt, width, height) {
  const result = new Uint8Array(bitmap);
  const pixels = [];
  for (let i = 0; i < result.length; i++) {
    if (result[i]) {
      pixels.push({ idx: i, dt: dt[i] });
    }
  }
  pixels.sort((a, b) => a.dt - b.dt);
  for (const { idx } of pixels) {
    if (!result[idx]) continue;
    const x = idx % width;
    const y = (idx - x) / width;
    const deg = degree2(x, y, result, width, height);
    if (deg <= 1) continue;
    if (isSimplePoint(x, y, result, width, height)) {
      result[idx] = 0;
    }
  }
  return result;
}
function isSimplePoint(x, y, bitmap, width, height) {
  const get = (nx, ny) => {
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) return 0;
    return bitmap[ny * width + nx];
  };
  const p2 = get(x, y - 1);
  const p3 = get(x + 1, y - 1);
  const p4 = get(x + 1, y);
  const p5 = get(x + 1, y + 1);
  const p6 = get(x, y + 1);
  const p7 = get(x - 1, y + 1);
  const p8 = get(x - 1, y);
  const p9 = get(x - 1, y - 1);
  const seq = [p2, p3, p4, p5, p6, p7, p8, p9];
  let transitions = 0;
  for (let i = 0; i < 8; i++) {
    if (seq[i] === 0 && seq[(i + 1) % 8] === 1) transitions++;
  }
  return transitions === 1;
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/skeletonize/morphological.ts
function morphologicalThin(bitmap, width, height, maxIterations) {
  const result = new Uint8Array(bitmap);
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (const dir of BORDER_DIRS) {
      const toDelete = [];
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          if (result[idx] === 0) continue;
          const nx = x + dir.dx;
          const ny = y + dir.dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && result[ny * width + nx] !== 0) continue;
          const neighbors = encodeNeighborhood(x, y, result, width, height);
          if (REMOVAL_LUT[neighbors]) {
            toDelete.push(idx);
          }
        }
      }
      for (const idx of toDelete) {
        result[idx] = 0;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/skeletonize/zhang-suen.ts
function zhangSuenThin(bitmap, width, height) {
  const result = new Uint8Array(bitmap);
  const get = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return result[y * width + x];
  };
  let changed = true;
  while (changed) {
    changed = false;
    const toDelete1 = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (result[y * width + x] === 0) continue;
        const p2 = get(x, y - 1);
        const p3 = get(x + 1, y - 1);
        const p4 = get(x + 1, y);
        const p5 = get(x + 1, y + 1);
        const p6 = get(x, y + 1);
        const p7 = get(x - 1, y + 1);
        const p8 = get(x - 1, y);
        const p9 = get(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9];
        let A = 0;
        for (let i = 0; i < 8; i++) {
          if (seq[i] === 0 && seq[(i + 1) % 8] === 1) A++;
        }
        if (A !== 1) continue;
        if (p2 * p4 * p6 !== 0) continue;
        if (p4 * p6 * p8 !== 0) continue;
        toDelete1.push(y * width + x);
      }
    }
    for (const idx of toDelete1) {
      result[idx] = 0;
      changed = true;
    }
    const toDelete2 = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (result[y * width + x] === 0) continue;
        const p2 = get(x, y - 1);
        const p3 = get(x + 1, y - 1);
        const p4 = get(x + 1, y);
        const p5 = get(x + 1, y + 1);
        const p6 = get(x, y + 1);
        const p7 = get(x - 1, y + 1);
        const p8 = get(x - 1, y);
        const p9 = get(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9];
        let A = 0;
        for (let i = 0; i < 8; i++) {
          if (seq[i] === 0 && seq[(i + 1) % 8] === 1) A++;
        }
        if (A !== 1) continue;
        if (p2 * p4 * p8 !== 0) continue;
        if (p2 * p6 * p8 !== 0) continue;
        toDelete2.push(y * width + x);
      }
    }
    for (const idx of toDelete2) {
      result[idx] = 0;
      changed = true;
    }
  }
  return result;
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/skeletonize/index.ts
function skeletonize({ subPaths, pathBBox, raster, inverseDT, options, rtl = false }) {
  if (options.skeletonMethod === "voronoi") {
    const v = voronoiMedialAxis(subPaths, pathBBox, raster.transform, raster.width, raster.height, options.voronoiSamplingInterval);
    const skeleton2 = new Uint8Array(raster.width * raster.height);
    for (const pl of v.polylines) {
      for (const p of pl) {
        const px = Math.round(p.x);
        const py = Math.round(p.y);
        if (px >= 0 && px < raster.width && py >= 0 && py < raster.height) {
          skeleton2[py * raster.width + px] = 1;
        }
      }
    }
    return { skeleton: skeleton2, polylines: v.polylines, widths: v.widths };
  }
  const thinFns = {
    "zhang-suen": zhangSuenThin,
    "guo-hall": guoHallThin,
    lee: leeThin,
    thin: (bmp, w, h) => morphologicalThin(bmp, w, h, options.thinMaxIterations)
  };
  const thinFn = thinFns[options.skeletonMethod] ?? zhangSuenThin;
  let skeleton;
  if (options.skeletonMethod === "medial-axis") {
    skeleton = medialAxisThin(raster.bitmap, inverseDT, raster.width, raster.height);
  } else {
    const raw = thinFn(raster.bitmap, raster.width, raster.height);
    skeleton = cleanJunctionClusters(raw, inverseDT, raster.width, raster.height, thinFn, options.junctionCleanupIterations);
  }
  restoreErasedComponents(raster.bitmap, skeleton, inverseDT, raster.width, raster.height);
  const spurMinLength = Math.min(Math.round(Math.max(raster.width, raster.height) * options.spurLengthRatio), 10);
  const polylines = traceAndSimplify(
    skeleton,
    raster.width,
    raster.height,
    options.rdpTolerance,
    spurMinLength,
    options.traceLookback,
    options.curvatureBias,
    rtl
  );
  return { skeleton, polylines };
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/width.ts
function computeDistanceTransform(bitmap, width, height, method) {
  if ((method ?? DISTANCE_TRANSFORM_METHOD) === "chamfer") {
    return computeChamferDT(bitmap, width, height);
  }
  return computeEuclideanDT(bitmap, width, height);
}
function computeChamferDT(bitmap, width, height) {
  const dist3 = new Float32Array(width * height);
  const INF = width + height;
  for (let i = 0; i < bitmap.length; i++) {
    dist3[i] = bitmap[i] ? 0 : INF;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (dist3[idx] === 0) continue;
      if (y > 0) dist3[idx] = Math.min(dist3[idx], dist3[(y - 1) * width + x] + 1);
      if (x > 0) dist3[idx] = Math.min(dist3[idx], dist3[y * width + (x - 1)] + 1);
      if (y > 0 && x > 0) dist3[idx] = Math.min(dist3[idx], dist3[(y - 1) * width + (x - 1)] + Math.SQRT2);
      if (y > 0 && x < width - 1) dist3[idx] = Math.min(dist3[idx], dist3[(y - 1) * width + (x + 1)] + Math.SQRT2);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const idx = y * width + x;
      if (dist3[idx] === 0) continue;
      if (y < height - 1) dist3[idx] = Math.min(dist3[idx], dist3[(y + 1) * width + x] + 1);
      if (x < width - 1) dist3[idx] = Math.min(dist3[idx], dist3[y * width + (x + 1)] + 1);
      if (y < height - 1 && x < width - 1) dist3[idx] = Math.min(dist3[idx], dist3[(y + 1) * width + (x + 1)] + Math.SQRT2);
      if (y < height - 1 && x > 0) dist3[idx] = Math.min(dist3[idx], dist3[(y + 1) * width + (x - 1)] + Math.SQRT2);
    }
  }
  return dist3;
}
function computeEuclideanDT(bitmap, width, height) {
  const INF = 1e20;
  const size = width * height;
  const d = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    d[i] = bitmap[i] ? 0 : INF;
  }
  const maxDim = Math.max(width, height);
  const v = new Int32Array(maxDim);
  const z2 = new Float32Array(maxDim + 1);
  const f = new Float32Array(maxDim);
  const out = new Float32Array(maxDim);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = d[y * width + x];
    edt1d(f, out, height, v, z2);
    for (let y = 0; y < height; y++) d[y * width + x] = out[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = d[y * width + x];
    edt1d(f, out, width, v, z2);
    for (let x = 0; x < width; x++) d[y * width + x] = out[x];
  }
  for (let i = 0; i < size; i++) {
    d[i] = Math.sqrt(d[i]);
  }
  return d;
}
function edt1d(f, out, n, v, z2) {
  v[0] = 0;
  z2[0] = -1e20;
  z2[1] = 1e20;
  let k = 0;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      const vk = v[k];
      s = (f[q] + q * q - (f[vk] + vk * vk)) / (2 * q - 2 * vk);
      if (s > z2[k]) break;
      k--;
    }
    k++;
    v[k] = q;
    z2[k] = s;
    z2[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z2[k + 1] < q) k++;
    const vk = v[k];
    const dq = q - vk;
    out[q] = dq * dq + f[vk];
  }
}
function computeInverseDistanceTransform(bitmap, width, height, method) {
  const inverted = new Uint8Array(bitmap.length);
  for (let i = 0; i < bitmap.length; i++) {
    inverted[i] = bitmap[i] ? 0 : 1;
  }
  return computeDistanceTransform(inverted, width, height, method);
}
function getStrokeWidth(x, y, inverseDT, width) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const idx = ry * width + rx;
  const radius = inverseDT[idx] ?? 0;
  return radius * 2;
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/processing/stroke-order.ts
var DOT_DIAG_RATIO = 0.15;
var DOT_ISOLATION_RATIO = 0.04;
function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function pathLength2(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}
function orientPolyline(points, rtl = false) {
  if (points.length < 2) return points;
  const start = points[0];
  const end = points[points.length - 1];
  const xWeight = rtl ? -ORIENT_X_WEIGHT : ORIENT_X_WEIGHT;
  if (dist2(start, end) < 5) {
    if (points.length === 2) return [start];
    let bestIdx = 0;
    let bestX = points[0].x;
    let bestY = points[0].y;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const better = rtl ? p.x > bestX || p.x === bestX && p.y < bestY : p.x < bestX || p.x === bestX && p.y < bestY;
      if (better) {
        bestX = p.x;
        bestY = p.y;
        bestIdx = i;
      }
    }
    if (bestIdx !== 0) {
      return [...points.slice(bestIdx), ...points.slice(1, bestIdx + 1)];
    }
    return points;
  }
  const startScore = start.y + start.x * xWeight;
  const endScore = end.y + end.x * xWeight;
  if (endScore < startScore) {
    return [...points].reverse();
  }
  return points;
}
function orderStrokes(polylines, inverseDT, bitmapWidth, _connectionThreshold = 3, precomputedWidths, rtl = false) {
  if (polylines.length === 0) return [];
  const strokes = [];
  for (let order = 0; order < polylines.length; order++) {
    const polyline = polylines[order];
    const oriented = orientPolyline(polyline, rtl);
    const totalLen = pathLength2(oriented);
    const origIdx = precomputedWidths ? polylines.indexOf(polyline) : -1;
    const pWidths = origIdx >= 0 ? precomputedWidths[origIdx] : null;
    let cumLen = 0;
    const points = oriented.map((p, i) => {
      if (i > 0) {
        cumLen += dist2(oriented[i - 1], p);
      }
      const t = totalLen > 0 ? cumLen / totalLen : 0;
      const isReversed = oriented !== polyline && oriented[0] !== polyline[0];
      const widthIdx = isReversed ? oriented.length - 1 - i : i;
      const width = pWidths ? pWidths[widthIdx] ?? 1 : inverseDT ? getStrokeWidth(p.x, p.y, inverseDT, bitmapWidth) : 1;
      return { x: p.x, y: p.y, t, width };
    });
    strokes.push({ points, order, length: totalLen, animationDuration: 0, delay: 0 });
  }
  const multiPointStrokes = strokes.filter((s) => s.points.length > 1);
  if (multiPointStrokes.length > 0) {
    const avgWidth = multiPointStrokes.reduce((sum, s) => sum + s.points.reduce((ps, p) => ps + p.width, 0) / s.points.length, 0) / multiPointStrokes.length;
    for (const s of strokes) {
      if (s.points.length === 1) {
        s.points[0].width = Math.round(avgWidth * 100) / 100;
      }
    }
  }
  classifyDots(strokes);
  reorderByPriority(strokes);
  return strokes;
}
function strokeBBox(s) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of s.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
function bboxDiag(b) {
  const dx = b.maxX - b.minX;
  const dy = b.maxY - b.minY;
  return Math.sqrt(dx * dx + dy * dy);
}
function bboxGap(a, b) {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
  return Math.sqrt(dx * dx + dy * dy);
}
function classifyDots(strokes) {
  if (strokes.length < 2) return;
  const boxes = strokes.map(strokeBBox);
  let glyphMinX = Infinity;
  let glyphMinY = Infinity;
  let glyphMaxX = -Infinity;
  let glyphMaxY = -Infinity;
  for (const b of boxes) {
    if (b.minX < glyphMinX) glyphMinX = b.minX;
    if (b.minY < glyphMinY) glyphMinY = b.minY;
    if (b.maxX > glyphMaxX) glyphMaxX = b.maxX;
    if (b.maxY > glyphMaxY) glyphMaxY = b.maxY;
  }
  const glyphDiag = Math.sqrt((glyphMaxX - glyphMinX) ** 2 + (glyphMaxY - glyphMinY) ** 2);
  if (glyphDiag <= 0) return;
  const maxDotDiag = glyphDiag * DOT_DIAG_RATIO;
  const isolationThreshold = glyphDiag * DOT_ISOLATION_RATIO;
  for (let i = 0; i < strokes.length; i++) {
    const diag = bboxDiag(boxes[i]);
    if (diag > maxDotDiag) continue;
    let isolated = true;
    for (let j = 0; j < strokes.length; j++) {
      if (j === i) continue;
      if (bboxGap(boxes[i], boxes[j]) <= isolationThreshold) {
        isolated = false;
        break;
      }
    }
    if (isolated) strokes[i].priority = -1;
  }
}
function reorderByPriority(strokes) {
  const hasPriority = strokes.some((s) => (s.priority ?? 0) < 0);
  if (!hasPriority) return;
  strokes.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.order - b.order);
  for (let i = 0; i < strokes.length; i++) strokes[i].order = i;
}

// ../../../../../../private/tmp/learn-anything-tegaki-y2Bryi/upstream/packages/generator/src/commands/generate.ts
var pipelineOptionsSchema = z.object({
  resolution: z.number().default(DEFAULT_RESOLUTION).describe("Bitmap resolution for skeletonization").meta({ flags: "r" }),
  skeletonMethod: z.enum(["zhang-suen", "guo-hall", "medial-axis", "lee", "thin", "voronoi"]).default(SKELETON_METHOD).describe("Skeletonization algorithm"),
  lineCap: z.enum(["auto", "round", "butt", "square"]).default("auto").describe("Stroke line cap style (auto infers from font properties)").meta({ flags: "l" }),
  bezierTolerance: z.number().default(BEZIER_TOLERANCE).describe("Bezier curve flattening tolerance"),
  rdpTolerance: z.number().default(RDP_TOLERANCE).describe("Ramer-Douglas-Peucker simplification tolerance"),
  spurLengthRatio: z.number().default(SPUR_LENGTH_RATIO).describe("Minimum spur length as fraction of bitmap size"),
  mergeThresholdRatio: z.number().default(MERGE_THRESHOLD_RATIO).describe("Merge threshold as fraction of bitmap size"),
  traceLookback: z.number().default(TRACE_LOOKBACK).describe("Lookback window for junction direction estimation"),
  curvatureBias: z.number().default(TRACE_CURVATURE_BIAS).describe("Curvature extrapolation weight at junctions"),
  thinMaxIterations: z.number().default(THIN_MAX_ITERATIONS).describe("Max iterations for morphological thinning"),
  junctionCleanupIterations: z.number().default(JUNCTION_CLEANUP_MAX_ITERATIONS).describe("Max iterations for junction cluster cleanup"),
  dtMethod: z.enum(["euclidean", "chamfer"]).default(DISTANCE_TRANSFORM_METHOD).describe("Distance transform algorithm"),
  voronoiSamplingInterval: z.number().default(VORONOI_SAMPLING_INTERVAL).describe("Voronoi boundary sampling interval"),
  drawingSpeed: z.number().default(DRAWING_SPEED).describe("Drawing speed in font units per second"),
  strokePause: z.number().default(STROKE_PAUSE).describe("Pause duration in seconds between strokes"),
  disabledFeatures: z.array(z.string()).default([]).describe("OpenType GSUB feature tags to exclude from the generated bundle (default: include every feature the font declares)")
});
var DEFAULT_OPTIONS = pipelineOptionsSchema.parse({});
var generateArgsSchema = pipelineOptionsSchema.extend({
  family: z.string().default(DEFAULT_FONT_FAMILY).describe("Google Fonts family name"),
  output: z.string().optional().describe("Output folder path for the font bundle").meta({ flags: "o" }),
  chars: z.union([z.boolean(), z.string()]).default(false).describe("Characters to process. `true` processes every glyph in the font, `false` uses the default character set.").meta({ flags: "c" }),
  force: z.boolean().default(false).describe("Re-download font even if cached").meta({ flags: "f" }),
  debug: z.boolean().default(false).describe("Output intermediate steps (bitmap, skeleton, trace, animation SVGs)").meta({ flags: "d" })
});
async function parseFont(buffer, extraBuffers, requestedFamily) {
  const font = opentype.parse(buffer);
  const extraFonts = extraBuffers?.map((b) => opentype.parse(b));
  const featureLists = await Promise.all([buffer, ...extraBuffers ?? []].map(getGsubFeatures));
  const seen = /* @__PURE__ */ new Set();
  const features = [];
  for (const list of featureLists) {
    for (const tag of list) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      features.push(tag);
    }
  }
  return {
    family: font.names.fontFamily?.en ?? requestedFamily ?? "Unknown",
    style: font.names.fontSubfamily?.en ?? "Regular",
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    lineCap: inferLineCap(font),
    font,
    extraFonts: extraFonts?.length ? extraFonts : void 0,
    features
  };
}
function processGlyph(fontInfo, char, options) {
  const rawGlyph = extractGlyph(fontInfo.font, char, fontInfo.extraFonts);
  if (!rawGlyph) return null;
  return runPipeline(fontInfo, rawGlyph.char, rawGlyph, options, isRtlChar(char));
}
function processGlyphById(fontInfo, glyphId, options, subsetIndex = 0, rtl = false) {
  const font = subsetIndex === 0 ? fontInfo.font : fontInfo.extraFonts?.[subsetIndex - 1];
  if (!font) return null;
  const rawGlyph = extractGlyphById(font, glyphId);
  if (!rawGlyph) return null;
  return runPipeline(fontInfo, rawGlyph.char, rawGlyph, options, rtl);
}
function runPipeline(fontInfo, char, rawGlyph, options, rtl = false) {
  const lineCap = options.lineCap === "auto" ? fontInfo.lineCap : options.lineCap;
  const subPaths = flattenPath(rawGlyph.commands, options.bezierTolerance);
  const pathBBox = computePathBBox(subPaths);
  const raster = rasterize(subPaths, pathBBox, options.resolution);
  const inverseDT = computeInverseDistanceTransform(raster.bitmap, raster.width, raster.height, options.dtMethod);
  const { skeleton, polylines, widths } = skeletonize({ subPaths, pathBBox, raster, inverseDT, options, rtl });
  const strokes = orderStrokes(polylines, inverseDT, raster.width, 3, widths, rtl);
  const strokesFontUnits = toFontUnits(strokes, raster.transform, options.drawingSpeed, options.strokePause);
  return {
    char,
    unicode: rawGlyph.unicode,
    advanceWidth: rawGlyph.advanceWidth,
    boundingBox: rawGlyph.boundingBox,
    pathString: rawGlyph.pathString,
    lineCap,
    ascender: fontInfo.ascender,
    descender: fontInfo.descender,
    subPaths,
    pathBBox,
    bitmap: raster.bitmap,
    bitmapWidth: raster.width,
    bitmapHeight: raster.height,
    transform: raster.transform,
    skeleton,
    inverseDT,
    polylines,
    strokes,
    strokesFontUnits
  };
}
function toCompactStroke(s) {
  const out = {
    p: s.points.map((p) => [p.x, p.y, p.width]),
    d: s.delay,
    a: s.animationDuration
  };
  if (s.priority && s.priority < 0) out.r = s.priority;
  return out;
}
function toCompactGlyph(result) {
  const { strokesFontUnits } = result;
  const last = strokesFontUnits[strokesFontUnits.length - 1];
  const totalAnimationDuration = last ? Math.round((last.delay + last.animationDuration) * 1e3) / 1e3 : 0;
  return {
    w: result.advanceWidth,
    t: totalAnimationDuration,
    s: strokesFontUnits.map(toCompactStroke)
  };
}
async function extractTegakiBundle(input) {
  const {
    fontBuffer,
    fontFileName,
    chars: charsStr,
    options,
    onProgress,
    extraFontBuffers,
    requestedFamily,
    subset = true,
    fullFontBuffer,
    fullFontFileName
  } = input;
  const fontInfo = await parseFont(fontBuffer, extraFontBuffers, requestedFamily);
  const lineCap = options.lineCap === "auto" ? fontInfo.lineCap : options.lineCap;
  onProgress?.(`Processing ${fontInfo.family} ${fontInfo.style} (${fontInfo.unitsPerEm} units/em, ${lineCap} caps)`, 0);
  const output = {
    font: {
      family: fontInfo.family,
      style: fontInfo.style,
      unitsPerEm: fontInfo.unitsPerEm,
      ascender: fontInfo.ascender,
      descender: fontInfo.descender,
      lineCap
    },
    glyphs: {}
  };
  const chars = [...charsStr.normalize("NFC")];
  let processed = 0;
  let skipped = 0;
  const glyphResults = {};
  for (const char of chars) {
    const result = processGlyph(fontInfo, char, options);
    if (!result) {
      skipped++;
      continue;
    }
    glyphResults[char] = result;
    const { strokesFontUnits, polylines, transform } = result;
    const skeletonFontUnits = polylines.map(
      (pl) => pl.map((p) => ({
        x: Math.round((p.x / transform.scaleX + transform.offsetX) * 100) / 100,
        y: Math.round((p.y / transform.scaleY + transform.offsetY) * 100) / 100
      }))
    );
    const totalLength = Math.round(strokesFontUnits.reduce((sum, s) => sum + s.length, 0) * 100) / 100;
    const last = strokesFontUnits[strokesFontUnits.length - 1];
    const totalAnimationDuration = last ? Math.round((last.delay + last.animationDuration) * 1e3) / 1e3 : 0;
    output.glyphs[char] = {
      char: result.char,
      unicode: result.unicode,
      advanceWidth: result.advanceWidth,
      boundingBox: result.boundingBox,
      path: result.pathString,
      skeleton: skeletonFontUnits,
      strokes: strokesFontUnits,
      totalLength,
      totalAnimationDuration
    };
    processed++;
    onProgress?.(`Processing glyph "${char}"`, processed / chars.length);
  }
  const glyphResultsById = {};
  const variantCompact = {};
  const bundleFeatures = fontInfo.features.filter((f) => !options.disabledFeatures.includes(f));
  if (bundleFeatures.length > 0) {
    onProgress?.(`Discovering ligature/alternate glyphs...`);
    const variantIds = enumerateVariantGlyphIds(fontInfo.font, chars);
    const total = variantIds.size;
    let i = 0;
    for (const { gid, clusterChar } of variantIds.values()) {
      const result = processGlyphById(fontInfo, gid, options, 0, isRtlChar(clusterChar));
      i++;
      if (!result) continue;
      glyphResultsById[String(gid)] = result;
      variantCompact[String(gid)] = toCompactGlyph(result);
      onProgress?.(`Processing variant glyph #${gid}`, total === 0 ? void 0 : i / total);
    }
  }
  const files = [];
  files.push({ path: fontFileName, content: new Uint8Array(fontBuffer) });
  const glyphDataMap = {};
  for (const glyph of Object.values(output.glyphs)) {
    glyphDataMap[glyph.char] = {
      w: glyph.advanceWidth,
      t: glyph.totalAnimationDuration,
      s: glyph.strokes.map(toCompactStroke)
    };
  }
  files.push({ path: "glyphData.json", content: JSON.stringify(glyphDataMap) });
  const hasVariants = Object.keys(variantCompact).length > 0;
  if (hasVariants) {
    files.push({ path: "glyphDataById.json", content: JSON.stringify(variantCompact) });
  }
  const bundleFamily = subset ? `${fontInfo.family} Tegaki ${charsHash(charsStr)}` : fontInfo.family;
  const fullFamily = subset ? fontInfo.family : void 0;
  if (subset && fullFontBuffer && fullFontFileName) {
    files.push({ path: fullFontFileName, content: new Uint8Array(fullFontBuffer) });
  }
  files.push({
    path: "bundle.ts",
    content: generateGlyphsModule({
      fontFileName,
      fontFamily: bundleFamily,
      fullFamily,
      fullFontFileName: subset && fullFontFileName ? fullFontFileName : void 0,
      lineCap,
      unitsPerEm: fontInfo.unitsPerEm,
      ascender: fontInfo.ascender,
      descender: fontInfo.descender,
      hasVariants,
      features: hasVariants && bundleFeatures.length > 0 ? bundleFeatures : void 0
    })
  });
  return {
    fontOutput: output,
    glyphResults,
    glyphResultsById,
    files,
    stats: { processed, skipped, variants: Object.keys(glyphResultsById).length }
  };
}
function generateGlyphsModule(args) {
  const { fontFileName, fontFamily, fullFamily, fullFontFileName, lineCap, unitsPerEm, ascender, descender, hasVariants, features } = args;
  const esc = (s) => s.replace(/'/g, "\\'");
  const hasFull = fullFamily && fullFontFileName;
  const imports = [`import fontUrl from './${fontFileName}' with { type: 'url' };`];
  if (hasFull) imports.push(`import fullFontUrl from './${fullFontFileName}' with { type: 'url' };`);
  imports.push(`import glyphData from './glyphData.json' with { type: 'json' };`);
  if (hasVariants) imports.push(`import glyphDataById from './glyphDataById.json' with { type: 'json' };`);
  const fontFaceRules = [`@font-face { font-family: '${esc(fontFamily)}'; src: url(\${fontUrl}); }`];
  if (hasFull) fontFaceRules.push(`@font-face { font-family: '${esc(fullFamily)}'; src: url(\${fullFontUrl}); }`);
  const props = [
    `  version: ${BUNDLE_VERSION},`,
    `  family: '${esc(fontFamily)}',`,
    ...hasFull ? [`  fullFamily: '${esc(fullFamily)}',`] : [],
    `  lineCap: '${lineCap}',`,
    `  fontUrl,`,
    ...hasFull ? [`  fullFontUrl,`] : [],
    `  fontFaceCSS: \`${fontFaceRules.join(" ")}\`,`,
    `  unitsPerEm: ${unitsPerEm},`,
    `  ascender: ${ascender},`,
    `  descender: ${descender},`,
    `  glyphData,`,
    ...hasVariants ? [`  glyphDataById,`] : [],
    ...features?.length ? [`  features: ${JSON.stringify(features)},`] : []
  ];
  return `// Auto-generated by Tegaki. Do not edit manually.
${imports.join("\n")}

const bundle = {
${props.join("\n")}
} as const;

export default bundle;
`;
}
export {
  DEFAULT_OPTIONS,
  extractTegakiBundle,
  generateArgsSchema,
  parseFont,
  processGlyph,
  processGlyphById
};
