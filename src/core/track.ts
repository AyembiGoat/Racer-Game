import type { Vec2 } from './vec';
import { closestPointOnSegment, distance2, headingRight, scale2, sub2 } from './vec';

export interface Checkpoint {
  readonly left: Vec2;
  readonly right: Vec2;
}

export interface Track {
  readonly name: string;
  /** Closed loop of centreline points in driving order. */
  readonly waypoints: readonly Vec2[];
  /** Road width between inner and outer barriers, in metres. */
  readonly roadWidth: number;
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
}

/** Closest point on the closed track centreline to `position`. */
export function projectOntoTrack(track: Track, position: Vec2): TrackProjection {
  const count = track.waypoints.length;
  let bestPoint = position;
  let bestIndex = 0;
  let bestT = 0;
  let bestDistSq = Number.POSITIVE_INFINITY;

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
    }
  }

  return {
    point: bestPoint,
    segmentIndex: bestIndex,
    segmentT: bestT,
    distance: Math.sqrt(bestDistSq),
  };
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

/** Build a gate perpendicular to `heading` across `roadWidth` (with a small barrier margin). */
export function gateAcrossTrack(centre: Vec2, heading: number, roadWidth: number): Checkpoint {
  const halfSpan = roadWidth / 2 + 1.5;
  const right = headingRight(heading);
  return {
    left: sub2(centre, scale2(right, halfSpan)),
    right: { x: centre.x + right.x * halfSpan, z: centre.z + right.z * halfSpan },
  };
}
