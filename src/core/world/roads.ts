import type { Vec2 } from '../vec';
import { closestPointOnSegment, distance2 } from '../vec';
import type { Aabb, JunctionSpec, RoadPath, RoadSpec, WorldSurface } from './types';

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

function densePoints(points: readonly Vec2[], closed: boolean): Vec2[] {
  const count = points.length;
  const dense: Vec2[] = [];
  const spans = closed ? count : count - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = closed ? points[(i - 1 + count) % count] : points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[(i + 1) % count];
    const p3 = closed ? points[(i + 2) % count] : points[Math.min(count - 1, i + 2)];
    if (!p0 || !p1 || !p2 || !p3) continue;
    const spanLength = distance2(p1, p2);
    const subSteps = Math.max(8, Math.min(48, Math.ceil(spanLength / 1.5)));
    for (let s = 0; s < subSteps; s++) {
      dense.push(catmullRom(p0, p1, p2, p3, s / subSteps));
    }
  }
  if (!closed) {
    const last = points[points.length - 1];
    if (last) dense.push(last);
  }
  return dense;
}

/** Sample a spline at even arc-length spacing and annotate tangents and normals. */
export function sampleRoad(spec: RoadSpec): RoadPath {
  const spacing = spec.spacing ?? 4;
  const dense = densePoints(spec.controlPoints, spec.closed);
  const count = dense.length;

  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const a = dense[i];
    const b = spec.closed ? dense[(i + 1) % count] : dense[i + 1];
    if (!a || !b) continue;
    total += distance2(a, b);
    cumulative.push(total);
  }
  if (total <= 1e-3) throw new Error(`Road ${spec.id} has no length`);

  // For closed roads the sample count is round(total/spacing); for open roads
  // include both endpoints exactly.
  const points: Vec2[] = [];
  if (spec.closed) {
    const sampleCount = Math.max(8, Math.round(total / spacing));
    let cursor = 0;
    for (let i = 0; i < sampleCount; i++) {
      const target = (i * total) / sampleCount;
      while (cursor < count - 1 && (cumulative[cursor + 1] ?? total) < target) cursor += 1;
      const startDist = cumulative[cursor] ?? 0;
      const endDist = cumulative[cursor + 1] ?? total;
      const a = dense[cursor];
      const b = dense[(cursor + 1) % count];
      if (!a || !b) continue;
      const span = endDist - startDist;
      const ratio = span > 1e-6 ? (target - startDist) / span : 0;
      points.push({ x: a.x + (b.x - a.x) * ratio, z: a.z + (b.z - a.z) * ratio });
    }
  } else {
    const sampleCount = Math.max(2, Math.round(total / spacing) + 1);
    let cursor = 0;
    for (let i = 0; i < sampleCount; i++) {
      const target = (i * total) / (sampleCount - 1);
      while (cursor < count - 2 && (cumulative[cursor + 1] ?? total) < target) cursor += 1;
      const startDist = cumulative[cursor] ?? 0;
      const endDist = cumulative[cursor + 1] ?? total;
      const a = dense[cursor];
      const b = dense[(cursor + 1) % count];
      if (!a || !b) continue;
      const span = endDist - startDist;
      const ratio = span > 1e-6 ? (target - startDist) / span : 0;
      points.push({ x: a.x + (b.x - a.x) * ratio, z: a.z + (b.z - a.z) * ratio });
    }
  }

  const n = points.length;
  const tangents: Vec2[] = [];
  const normals: Vec2[] = [];
  const arcLengths: number[] = [0];
  let length = 0;
  for (let i = 0; i < n; i++) {
    const prev = points[spec.closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = points[spec.closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    if (!prev || !next) continue;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    tangents.push({ x: dx / len, z: dz / len });
    normals.push({ x: -dz / len, z: dx / len });
    const current = points[i];
    const following = spec.closed ? points[(i + 1) % n] : points[i + 1];
    if (current && following) length += distance2(current, following);
    arcLengths.push(length);
  }

  return {
    spec,
    points,
    normals,
    tangents,
    arcLengths,
    totalLength: length,
  };
}

export interface RoadSegment {
  readonly roadIndex: number;
  readonly a: Vec2;
  readonly b: Vec2;
  readonly length: number;
  readonly halfWidth: number;
  readonly arcStart: number;
  readonly aabb: Aabb;
  readonly kerbLeft: boolean;
  readonly kerbRight: boolean;
}

function kerbOn(road: RoadPath, arc: number, side: 'left' | 'right'): boolean {
  const ranges = road.spec.kerbs;
  if (!ranges) return false;
  for (const range of ranges) {
    if (arc < range.start || arc > range.end) continue;
    if (range.side === 'both' || range.side === side) return true;
  }
  return false;
}

/** Segment representation used for surface queries and the route graph. */
export function buildRoadSegments(roads: readonly RoadPath[]): RoadSegment[] {
  const segments: RoadSegment[] = [];
  roads.forEach((road, roadIndex) => {
    const n = road.points.length;
    const spans = road.spec.closed ? n : n - 1;
    const halfWidth = road.spec.width / 2;
    for (let i = 0; i < spans; i++) {
      const a = road.points[i];
      const b = road.points[(i + 1) % n];
      if (!a || !b) continue;
      const length = distance2(a, b);
      if (length < 1e-4) continue;
      const arcStart = road.arcLengths[i] ?? 0;
      const arcMid = arcStart + length / 2;
      const minX = Math.min(a.x, b.x) - halfWidth;
      const maxX = Math.max(a.x, b.x) + halfWidth;
      const minZ = Math.min(a.z, b.z) - halfWidth;
      const maxZ = Math.max(a.z, b.z) + halfWidth;
      segments.push({
        roadIndex,
        a,
        b,
        length,
        halfWidth,
        arcStart,
        aabb: { minX, maxX, minZ, maxZ },
        kerbLeft: kerbOn(road, arcMid, 'left'),
        kerbRight: kerbOn(road, arcMid, 'right'),
      });
    }
  });
  return segments;
}

export interface RoadSegmentHit {
  readonly segmentIndex: number;
  readonly segment: RoadSegment;
  readonly distance: number;
  readonly side: 'left' | 'right';
  readonly arc: number;
  readonly point: Vec2;
}

/** Closest road centreline hit within `segments`, or null. */
export function closestSegmentHit(
  roads: readonly RoadPath[],
  segments: readonly RoadSegment[],
  candidates: readonly number[],
  position: Vec2,
): RoadSegmentHit | null {
  let best: RoadSegmentHit | null = null;
  for (const index of candidates) {
    const segment = segments[index];
    if (!segment) continue;
    const hit = closestPointOnSegment(position, segment.a, segment.b);
    if (best && hit.distSq >= best.distance * best.distance - 1e-9) continue;
    const road = roads[segment.roadIndex];
    if (!road) continue;
    const offset = { x: position.x - hit.point.x, z: position.z - hit.point.z };
    const tangent = { x: segment.b.x - segment.a.x, z: segment.b.z - segment.a.z };
    const signed = tangent.x * offset.z - tangent.z * offset.x;
    const distance = Math.sqrt(hit.distSq);
    const arc = segment.arcStart + hit.t * segment.length;
    best = {
      segmentIndex: index,
      segment,
      distance,
      side: signed >= 0 ? 'right' : 'left',
      arc: road.spec.closed ? arc % road.totalLength : Math.min(arc, road.totalLength),
      point: hit.point,
    };
  }
  return best;
}

export interface PavedHit {
  readonly kind: 'road' | 'pad';
  readonly distance: number;
  /** Metres beyond the paved edge; zero while over asphalt. */
  readonly gap: number;
  readonly halfWidth: number;
  readonly road?: RoadPath | undefined;
  readonly segment?: RoadSegmentHit | undefined;
  readonly pad?: JunctionSpec | undefined;
  readonly arc: number;
  readonly side: 'left' | 'right' | 'none';
}

export function padHit(pads: readonly JunctionSpec[], position: Vec2): PavedHit | null {
  let best: PavedHit | null = null;
  for (const pad of pads) {
    const distance = distance2(position, pad.center);
    const gap = Math.max(0, distance - pad.radius);
    if (best && gap >= best.gap) continue;
    best = {
      kind: 'pad',
      distance,
      gap,
      halfWidth: pad.radius,
      pad,
      arc: 0,
      side: 'none',
    };
  }
  return best;
}

/**
 * Deterministic surface classification from the car's outer tyre edge.
 * Kerbs only exist inside a painted corner span, matching the rendered kerbs.
 */
export function classifySurface(paved: PavedHit | null, carHalfWidth: number): WorldSurface {
  if (!paved) return 'grass';
  const outerWheelEdge = paved.distance + carHalfWidth * 0.8;
  if (outerWheelEdge <= paved.halfWidth + 0.02) return 'tarmac';
  if (paved.kind === 'road' && paved.segment) {
    const kerb =
      paved.side === 'left' ? paved.segment.segment.kerbLeft : paved.segment.segment.kerbRight;
    if (
      kerb &&
      paved.distance <= paved.halfWidth + 0.6 &&
      outerWheelEdge >= paved.halfWidth - 0.15
    ) {
      return 'kerb';
    }
  }
  return 'grass';
}
