import { CAR_TUNING } from '../car';
import type { Vec2 } from '../vec';
import { clamp, dot2, scale2, sub2 } from '../vec';
import type { Aabb, CarContact, Collider } from './types';

/** Car simulation footprint. Slightly wider than the body so mirrors clear walls. */
export const CAR_FOOTPRINT = {
  halfLength: CAR_TUNING.length / 2,
  halfWidth: CAR_TUNING.width / 2 + 0.09,
} as const;

export interface Obb {
  readonly center: Vec2;
  readonly halfX: number;
  readonly halfZ: number;
  /** Direction of local +X in XZ radians. */
  readonly angle: number;
}

export interface Axes {
  readonly x: Vec2;
  readonly z: Vec2;
}

/** Unit axes for a box angle. Local +Z is local +X rotated 90° toward +Z. */
export function obbAxes(angle: number): Axes {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: { x: c, z: s }, z: { x: -s, z: c } };
}

/** Car footprint as an oriented box whose local +X is the nose direction. */
export function carObb(position: Vec2, heading: number): Obb {
  const forward = { x: -Math.sin(heading), z: -Math.cos(heading) };
  return {
    center: position,
    halfX: CAR_FOOTPRINT.halfLength,
    halfZ: CAR_FOOTPRINT.halfWidth,
    angle: Math.atan2(forward.z, forward.x),
  };
}

export function boxAabb(shape: {
  readonly center: Vec2;
  readonly halfX: number;
  readonly halfZ: number;
  readonly angle: number;
}): Aabb {
  const axes = obbAxes(shape.angle);
  const extentX = Math.abs(axes.x.x) * shape.halfX + Math.abs(axes.z.x) * shape.halfZ;
  const extentZ = Math.abs(axes.x.z) * shape.halfX + Math.abs(axes.z.z) * shape.halfZ;
  return {
    minX: shape.center.x - extentX,
    maxX: shape.center.x + extentX,
    minZ: shape.center.z - extentZ,
    maxZ: shape.center.z + extentZ,
  };
}

export function colliderAabb(collider: Collider): Aabb {
  const shape = collider.shape;
  if (shape.type === 'circle') {
    return {
      minX: shape.center.x - shape.radius,
      maxX: shape.center.x + shape.radius,
      minZ: shape.center.z - shape.radius,
      maxZ: shape.center.z + shape.radius,
    };
  }
  return boxAabb(shape);
}

export function aabbOverlaps(a: Aabb, b: Aabb): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxZ < b.minZ || b.maxZ < a.minZ);
}

export function aabbAround(center: Vec2, padding: number): Aabb {
  return {
    minX: center.x - padding,
    maxX: center.x + padding,
    minZ: center.z - padding,
    maxZ: center.z + padding,
  };
}

/** Support point of an OBB furthest along `direction`. */
export function supportPoint(obb: Obb, direction: Vec2): Vec2 {
  const axes = obbAxes(obb.angle);
  const sx = Math.sign(dot2(axes.x, direction)) || 1;
  const sz = Math.sign(dot2(axes.z, direction)) || 1;
  return {
    x: obb.center.x + axes.x.x * obb.halfX * sx + axes.z.x * obb.halfZ * sz,
    z: obb.center.z + axes.x.z * obb.halfX * sx + axes.z.z * obb.halfZ * sz,
  };
}

function projectRadius(obb: Obb, axis: Vec2): number {
  const axes = obbAxes(obb.angle);
  return Math.abs(dot2(axes.x, axis)) * obb.halfX + Math.abs(dot2(axes.z, axis)) * obb.halfZ;
}

/**
 * Separating-axis overlap between two boxes.
 * Returns the minimum translation that moves `a` out of `b`, with a normal
 * pointing from `b` toward `a`, or null when they are apart. Touching counts as
 * apart so a car resting against a wall is not reported as penetrating.
 */
export function obbContact(
  a: Obb,
  b: Obb,
  id: string,
  sourceId: string,
  kind: CarContact['kind'],
): CarContact | null {
  const axesA = obbAxes(a.angle);
  const axesB = obbAxes(b.angle);
  const axes = [axesA.x, axesA.z, axesB.x, axesB.z];
  const delta = sub2(a.center, b.center);

  let bestDepth = Number.POSITIVE_INFINITY;
  let bestAxis: Vec2 | null = null;
  for (const axis of axes) {
    const distance = Math.abs(dot2(delta, axis));
    const overlap = projectRadius(a, axis) + projectRadius(b, axis) - distance;
    if (overlap <= 1e-9) return null;
    if (overlap < bestDepth) {
      bestDepth = overlap;
      bestAxis = axis;
    }
  }
  if (!bestAxis) return null;

  const facing = dot2(delta, bestAxis) >= 0 ? 1 : -1;
  const normal = scale2(bestAxis, facing);
  const contactPoint = supportPoint(a, scale2(normal, -1));
  return { colliderId: id, sourceId, kind, normal, depth: bestDepth, point: contactPoint };
}

/** Contact between the car footprint and a circle, normal away from the circle. */
export function circleContact(
  car: Obb,
  center: Vec2,
  radius: number,
  id: string,
  sourceId: string,
  kind: CarContact['kind'],
): CarContact | null {
  const axes = obbAxes(car.angle);
  const relative = sub2(center, car.center);
  const localX = dot2(relative, axes.x);
  const localZ = dot2(relative, axes.z);
  const clampX = clamp(localX, -car.halfX, car.halfX);
  const clampZ = clamp(localZ, -car.halfZ, car.halfZ);
  const closest = {
    x: car.center.x + axes.x.x * clampX + axes.z.x * clampZ,
    z: car.center.z + axes.x.z * clampX + axes.z.z * clampZ,
  };
  const offset = sub2(closest, center);
  const distance = Math.hypot(offset.x, offset.z);

  if (distance >= radius) return null;
  if (distance < 1e-6) {
    // Centre is inside the box. Push out through the nearest face.
    const faceX = car.halfX - Math.abs(localX);
    const faceZ = car.halfZ - Math.abs(localZ);
    if (faceX < faceZ) {
      const sign = localX >= 0 ? 1 : -1;
      return {
        colliderId: id,
        sourceId,
        kind,
        normal: scale2(axes.x, sign),
        depth: radius + faceX,
        point: closest,
      };
    }
    const sign = localZ >= 0 ? 1 : -1;
    return {
      colliderId: id,
      sourceId,
      kind,
      normal: scale2(axes.z, sign),
      depth: radius + faceZ,
      point: closest,
    };
  }

  const normal = scale2(offset, 1 / distance);
  return { colliderId: id, sourceId, kind, normal, depth: radius - distance, point: closest };
}

export function carColliderContact(car: Obb, collider: Collider): CarContact | null {
  const shape = collider.shape;
  if (shape.type === 'circle') {
    return circleContact(
      car,
      shape.center,
      shape.radius,
      collider.id,
      collider.sourceId,
      collider.kind,
    );
  }
  return obbContact(
    car,
    {
      center: shape.center,
      halfX: shape.halfX,
      halfZ: shape.halfZ,
      angle: shape.angle,
    },
    collider.id,
    collider.sourceId,
    collider.kind,
  );
}

export function unionAabb(a: Aabb, b: Aabb): Aabb {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

export function expandAabb(a: Aabb, padding: number): Aabb {
  return {
    minX: a.minX - padding,
    maxX: a.maxX + padding,
    minZ: a.minZ - padding,
    maxZ: a.maxZ + padding,
  };
}

/** AABB swept by the car footprint between two centres, padded for the body. */
export function sweptCarAabb(from: Vec2, to: Vec2, heading: number): Aabb {
  const car = carObb(from, heading);
  const start = boxAabb(car);
  const end = boxAabb({ ...car, center: to });
  return unionAabb(start, end);
}
