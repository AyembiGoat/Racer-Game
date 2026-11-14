import type { DrivingSurface } from './car';
import type { Vec2 } from './vec';
import {
  angleDelta,
  closestPointOnSegment,
  cross2,
  distance2,
  headingRight,
  headingTo,
  scale2,
  sub2,
} from './vec';

export interface Checkpoint {
  readonly left: Vec2;
  readonly right: Vec2;
}

export interface KerbSides {
  readonly left: boolean;
  readonly right: boolean;
}

export interface Track {
  readonly name: string;
  /** Closed loop of evenly spaced centreline points in driving order. */
  readonly waypoints: readonly Vec2[];
  /** Signed curvature (rad/m) at each waypoint: positive curves left, negative curves right. */
  readonly curvatures: readonly number[];
  /** Which edges have red-and-white concrete kerbs at each waypoint. */
  readonly kerbs: readonly KerbSides[];
  /** Asphalt width between white edge lines, in metres. */
  readonly roadWidth: number;
  /** Grass run-off width between each road edge and the steel barrier, in metres. */
  readonly vergeWidth: number;
  readonly spawn: {
    readonly position: Vec2;
    readonly heading: number;
  };
  /** Ordered gates around the loop; the last gate is the start/finish line. */
  readonly checkpoints: readonly Checkpoint[];
}

export interface TrackProjection {
  readonly point: Vec2;
  readonly segmentIndex: number;
  readonly segmentT: number;
  readonly distance: number;
  /** Signed lateral offset from centreline: negative is left, positive is right. */
  readonly signedOffset: number;
}

/** Closest point on the closed track centreline to `position`. */
export function projectOntoTrack(track: Track, position: Vec2): TrackProjection {
  const count = track.waypoints.length;
  let bestPoint = position;
  let bestIndex = 0;
  let bestT = 0;
  let bestDistSq = Number.POSITIVE_INFINITY;
  let bestSign = 1;

  for (let i = 0; i < count; i++) {
    const a = track.waypoints[i];
    const b = track.waypoints[(i + 1) % count];
    if (!a || !b) continue;
    const hit = closestPointOnSegment(position, a, b);
    if (hit.distSq < bestDistSq) {
      bestDistSq = hit.distSq;
      bestPoint = hit.point;
      bestIndex = i;
      bestT = hit.t;
      const tangent = sub2(b, a);
      const offset = sub2(position, hit.point);
      // For forward `(0, -1)` and right `(+1, 0)`, `cross2(offset, tangent) = ox*(-1) - 0 = -ox`,
      // so `cross2(tangent, offset) = tx*oz - tz*ox = -(-1)*ox = +ox` (positive on the right).
      bestSign = cross2(tangent, offset) >= 0 ? 1 : -1;
    }
  }

  const distance = Math.sqrt(bestDistSq);
  return {
    point: bestPoint,
    segmentIndex: bestIndex,
    segmentT: bestT,
    distance,
    signedOffset: distance * bestSign,
  };
}

/** Which surface the car's outer tyres are riding on at `projection`. */
export function surfaceAtProjection(
  track: Track,
  projection: TrackProjection,
  carHalfWidth: number,
): DrivingSurface {
  const halfRoad = track.roadWidth / 2;
  const outerWheelEdge = projection.distance + carHalfWidth * 0.8;
  const kerb = track.kerbs[projection.segmentIndex];
  const onKerbedSide = projection.signedOffset < 0 ? (kerb?.left ?? false) : (kerb?.right ?? false);

  if (onKerbedSide && outerWheelEdge >= halfRoad - 0.15 && projection.distance <= halfRoad + 0.6) {
    return 'kerb';
  }
  if (projection.distance > halfRoad) {
    return 'grass';
  }
  return 'tarmac';
}

/** Point `aheadMetres` forward along the closed centreline from `projection`. */
export function pointAheadOnTrack(
  track: Track,
  projection: TrackProjection,
  aheadMetres: number,
): Vec2 {
  const count = track.waypoints.length;
  let index = projection.segmentIndex;
  let current = projection.point;
  let remaining = Math.max(0, aheadMetres);

  for (let guard = 0; guard <= count * 2 && remaining > 0; guard++) {
    const next = track.waypoints[(index + 1) % count];
    if (!next) break;
    const segRemaining = distance2(current, next);
    if (remaining <= segRemaining && segRemaining > 1e-6) {
      const ratio = remaining / segRemaining;
      return {
        x: current.x + (next.x - current.x) * ratio,
        z: current.z + (next.z - current.z) * ratio,
      };
    }
    remaining -= segRemaining;
    current = next;
    index = (index + 1) % count;
  }

  return current;
}

/** Build a gate perpendicular to `heading` spanning the full corridor between barriers. */
export function gateAcrossTrack(centre: Vec2, heading: number, corridorWidth: number): Checkpoint {
  const halfSpan = corridorWidth / 2 + 1.5;
  const right = headingRight(heading);
  return {
    left: sub2(centre, scale2(right, halfSpan)),
    right: { x: centre.x + right.x * halfSpan, z: centre.z + right.z * halfSpan },
  };
}

/** Compute signed curvature and inside/exit kerb flags for a closed loop of waypoints. */
export function analyseTrackWaypoints(waypoints: readonly Vec2[]): {
  readonly curvatures: number[];
  readonly kerbs: KerbSides[];
} {
  const n = waypoints.length;
  const curvatures: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = waypoints[(i - 1 + n) % n];
    const curr = waypoints[i];
    const next = waypoints[(i + 1) % n];
    if (!prev || !curr || !next) {
      curvatures.push(0);
      continue;
    }
    const hIn = headingTo(prev, curr);
    const hOut = headingTo(curr, next);
    const ds = (distance2(prev, curr) + distance2(curr, next)) * 0.5;
    curvatures.push(ds > 1e-4 ? angleDelta(hIn, hOut) / ds : 0);
  }

  // Inside apex kerbs wherever a bend is sharper than a gentle kink, plus outside
  // exit kerbs for a short stretch coming out of the corner.
  const apexThreshold = 0.0085;
  const kerbs: KerbSides[] = Array.from({ length: n }, () => ({ left: false, right: false }));
  for (let i = 0; i < n; i++) {
    const k = curvatures[i] ?? 0;
    const prevCornerLeft =
      (curvatures[(i - 3 + n) % n] ?? 0) > apexThreshold * 1.35 ||
      (curvatures[(i - 5 + n) % n] ?? 0) > apexThreshold * 1.35;
    const prevCornerRight =
      (curvatures[(i - 3 + n) % n] ?? 0) < -apexThreshold * 1.35 ||
      (curvatures[(i - 5 + n) % n] ?? 0) < -apexThreshold * 1.35;

    kerbs[i] = {
      left: k > apexThreshold || prevCornerRight,
      right: k < -apexThreshold || prevCornerLeft,
    };
  }

  return { curvatures, kerbs };
}
