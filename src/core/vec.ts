export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export function vec2(x: number, z: number): Vec2 {
  return { x, z };
}

export function add2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function sub2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z };
}

export function scale2(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, z: a.z * s };
}

export function dot2(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

export function cross2(a: Vec2, b: Vec2): number {
  return a.x * b.z - a.z * b.x;
}

export function length2(a: Vec2): number {
  return Math.hypot(a.x, a.z);
}

export function distance2(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/** Wrap an angle into -PI..PI. */
export function wrapAngle(angle: number): number {
  const wrapped = (angle + Math.PI) % (Math.PI * 2);
  return wrapped < 0 ? wrapped + Math.PI : wrapped - Math.PI;
}

/** Smallest signed difference `to - from`, in -PI..PI. */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

export function lerpAngle(from: number, to: number, t: number): number {
  return wrapAngle(from + angleDelta(from, to) * t);
}

/** Unit forward vector on XZ for `heading` (0 faces down -Z; positive turns left). */
export function headingForward(heading: number): Vec2 {
  return { x: -Math.sin(heading), z: -Math.cos(heading) };
}

/** Unit right vector on XZ for `heading` (0 points along +X). */
export function headingRight(heading: number): Vec2 {
  return { x: Math.cos(heading), z: -Math.sin(heading) };
}

/** Heading angle from `from` toward `to` matching `headingForward`. */
export function headingTo(from: Vec2, to: Vec2): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

export function closestPointOnSegment(
  point: Vec2,
  a: Vec2,
  b: Vec2,
): { readonly point: Vec2; readonly t: number; readonly distSq: number } {
  const ab = sub2(b, a);
  const lenSq = dot2(ab, ab);
  const t = lenSq > 0 ? clamp(dot2(sub2(point, a), ab) / lenSq, 0, 1) : 0;
  const closest = lerp2(a, b, t);
  const diff = sub2(point, closest);
  return { point: closest, t, distSq: dot2(diff, diff) };
}

/**
 * If motion `p0 -> p1` crosses gate `left -> right` in the forward direction,
 * returns the fraction `0 < t <= 1` along `p0 -> p1` where the crossing happened.
 */
export function forwardGateCrossing(p0: Vec2, p1: Vec2, left: Vec2, right: Vec2): number | null {
  const move = sub2(p1, p0);
  const gate = sub2(right, left);
  const denom = cross2(move, gate);
  // Positive `denom` means crossing from behind the gate to in front of it.
  if (denom <= 1e-9) return null;
  const diff = sub2(left, p0);
  const t = cross2(diff, gate) / denom;
  if (t <= 0 || t > 1) return null;
  const u = cross2(diff, move) / denom;
  if (u < 0 || u > 1) return null;
  return t;
}
