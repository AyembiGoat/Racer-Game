import type { Track } from '../track';
import { analyseTrackWaypoints, gateAcrossTrack } from '../track';
import type { Vec2 } from '../vec';
import { distance2, headingTo } from '../vec';

const ROAD_WIDTH = 12;
const VERGE_WIDTH = 4.5;
const CORRIDOR_WIDTH = ROAD_WIDTH + VERGE_WIDTH * 2;

/**
 * Control points for Club Circuit (counter-clockwise):
 *   150 m start/finish straight -> Paddock Left -> flowing left-right Esses ->
 *   Oak Tree Left -> West straight -> Hairpin Left -> Back Straight -> Final Sweeper.
 */
const CONTROL_POINTS: readonly Vec2[] = [
  { x: 90, z: 62 },
  { x: 90, z: 18 },
  { x: 90, z: -38 },
  { x: 90, z: -84 },
  { x: 54, z: -128 },
  { x: 4, z: -124 },
  { x: -34, z: -88 },
  { x: -80, z: -98 },
  { x: -112, z: -52 },
  { x: -108, z: 16 },
  { x: -102, z: 82 },
  { x: -54, z: 118 },
  { x: 18, z: 118 },
  { x: 74, z: 104 },
];

function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z:
      0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

/** Sample the closed spline densely, then resample at uniform spacing (~3.5 m). */
function buildUniformWaypoints(spacingMetres = 3.5): Vec2[] {
  const count = CONTROL_POINTS.length;
  const dense: Vec2[] = [];
  const subSteps = 24;

  for (let i = 0; i < count; i++) {
    const p0 = CONTROL_POINTS[(i - 1 + count) % count];
    const p1 = CONTROL_POINTS[i];
    const p2 = CONTROL_POINTS[(i + 1) % count];
    const p3 = CONTROL_POINTS[(i + 2) % count];
    if (!p0 || !p1 || !p2 || !p3) continue;
    for (let s = 0; s < subSteps; s++) {
      dense.push(catmullRom(p0, p1, p2, p3, s / subSteps));
    }
  }

  const cumulative: number[] = [0];
  let totalLength = 0;
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % dense.length];
    if (!a || !b) continue;
    totalLength += distance2(a, b);
    cumulative.push(totalLength);
  }

  const sampleCount = Math.max(64, Math.round(totalLength / spacingMetres));
  const uniform: Vec2[] = [];
  let cursor = 0;
  for (let i = 0; i < sampleCount; i++) {
    const targetDist = (i * totalLength) / sampleCount;
    while (cursor < dense.length - 1 && (cumulative[cursor + 1] ?? totalLength) < targetDist) {
      cursor += 1;
    }
    const startDist = cumulative[cursor] ?? 0;
    const endDist = cumulative[cursor + 1] ?? totalLength;
    const a = dense[cursor];
    const b = dense[(cursor + 1) % dense.length];
    if (!a || !b) continue;
    const span = endDist - startDist;
    const ratio = span > 1e-6 ? (targetDist - startDist) / span : 0;
    uniform.push({
      x: a.x + (b.x - a.x) * ratio,
      z: a.z + (b.z - a.z) * ratio,
    });
  }

  return uniform;
}

const waypoints = buildUniformWaypoints();
const { curvatures, kerbs } = analyseTrackWaypoints(waypoints);

function gateAtFraction(fraction: number) {
  const index = Math.floor(fraction * waypoints.length) % waypoints.length;
  const curr = waypoints[index] ?? { x: 0, z: 0 };
  const next = waypoints[(index + 1) % waypoints.length] ?? { x: 0, z: -1 };
  return gateAcrossTrack(curr, headingTo(curr, next), CORRIDOR_WIDTH);
}

export const clubCircuit: Track = {
  name: 'Club Circuit',
  waypoints,
  curvatures,
  kerbs,
  roadWidth: ROAD_WIDTH,
  vergeWidth: VERGE_WIDTH,
  spawn: {
    position: { x: 90, z: 8 },
    heading: 0,
  },
  checkpoints: [
    gateAtFraction(0.28),
    gateAtFraction(0.54),
    gateAtFraction(0.78),
    // Start/finish line on the main straight facing -Z.
    gateAcrossTrack({ x: 90, z: 0 }, 0, CORRIDOR_WIDTH),
  ],
};
