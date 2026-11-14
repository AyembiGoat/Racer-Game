import type { Vec2 } from '../vec';
import { clamp } from '../vec';
import type { OpenWorldRuntime } from './build';
import { carColliderContact, carObb } from './collision';
import { queryGrid } from './grid';
import type { GridQueryScratch } from './grid';
import { classifySurface, closestSegmentHit, padHit } from './roads';
import type { PavedHit } from './roads';
import type { Aabb, CarContact, Collider, WorldSurface } from './types';

export const MAX_SURFACE_QUERY_RADIUS = 36;

export function collidersNear(
  runtime: OpenWorldRuntime,
  area: Aabb,
  scratch: GridQueryScratch = runtime.colliderScratch,
): readonly Collider[] {
  const indices = queryGrid(runtime.colliderGrid, area, scratch);
  return indices.map((index) => runtime.colliders[index]).filter((c): c is Collider => !!c);
}

/** All overlapping contacts for a car pose. Broad-phase candidates are narrow-phased. */
export function carContactsAt(
  runtime: OpenWorldRuntime,
  position: Vec2,
  heading: number,
  padding = 0,
): CarContact[] {
  const base = carObb(position, heading);
  const car =
    padding === 0 ? base : { ...base, halfX: base.halfX + padding, halfZ: base.halfZ + padding };
  const reach = Math.hypot(car.halfX, car.halfZ);
  const area = {
    minX: position.x - reach,
    maxX: position.x + reach,
    minZ: position.z - reach,
    maxZ: position.z + reach,
  };
  const candidates = collidersNear(runtime, area);
  const contacts: CarContact[] = [];
  for (const collider of candidates) {
    const contact = carColliderContact(car, collider);
    if (contact) contacts.push(contact);
  }
  return contacts;
}

export function deepestContact(contacts: readonly CarContact[]): CarContact | null {
  let deepest: CarContact | null = null;
  for (const contact of contacts) {
    if (!deepest || contact.depth > deepest.depth) deepest = contact;
  }
  return deepest;
}

export function poseClear(
  runtime: OpenWorldRuntime,
  position: Vec2,
  heading: number,
  padding = 0,
): boolean {
  return carContactsAt(runtime, position, heading, padding).length === 0;
}

/** Nearest paved road or pad, including off-road distances up to `maxDistance`. */
export function nearestPaved(
  runtime: OpenWorldRuntime,
  position: Vec2,
  maxDistance = MAX_SURFACE_QUERY_RADIUS,
): PavedHit | null {
  const area = {
    minX: position.x - maxDistance,
    maxX: position.x + maxDistance,
    minZ: position.z - maxDistance,
    maxZ: position.z + maxDistance,
  };
  const candidates = queryGrid(runtime.roadGrid, area, runtime.roadScratch);
  const roadHit = closestSegmentHit(runtime.roads, runtime.roadSegments, candidates, position);
  const pad = padHit(runtime.junctions, position);

  let roadPaved: PavedHit | null = null;
  if (roadHit) {
    const gap = Math.max(0, roadHit.distance - roadHit.segment.halfWidth);
    if (gap <= maxDistance) {
      roadPaved = {
        kind: 'road',
        distance: roadHit.distance,
        gap,
        halfWidth: roadHit.segment.halfWidth,
        road: runtime.roads[roadHit.segment.roadIndex],
        segment: roadHit,
        arc: roadHit.arc,
        side: roadHit.side,
      };
    }
  }
  if (!pad) return roadPaved;
  if (!roadPaved || pad.gap < roadPaved.gap - 1e-6) return pad;
  return roadPaved;
}

export function surfaceAt(
  runtime: OpenWorldRuntime,
  position: Vec2,
  carHalfWidth: number,
): WorldSurface {
  return classifySurface(nearestPaved(runtime, position), carHalfWidth);
}

/** Closest point on any paved centreline, for recovery and route helpers. */
export function nearestRoadPoint(
  runtime: OpenWorldRuntime,
  position: Vec2,
): { readonly point: Vec2; readonly distance: number; readonly roadId: string } | null {
  const area = runtime.worldAabb;
  const candidates = queryGrid(runtime.roadGrid, area, runtime.roadScratch);
  const hit = closestSegmentHit(runtime.roads, runtime.roadSegments, candidates, position);
  if (!hit) return null;
  return {
    point: hit.point,
    distance: hit.distance,
    roadId: runtime.roads[hit.segment.roadIndex]?.spec.id ?? '',
  };
}

export function insideBounds(runtime: OpenWorldRuntime, position: Vec2, margin = 0): boolean {
  const { bounds } = runtime.spec;
  return (
    position.x >= bounds.minX + margin &&
    position.x <= bounds.maxX - margin &&
    position.z >= bounds.minZ + margin &&
    position.z <= bounds.maxZ - margin
  );
}

export function clampToBounds(runtime: OpenWorldRuntime, position: Vec2, margin = 0.4): Vec2 {
  const { bounds } = runtime.spec;
  return {
    x: clamp(position.x, bounds.minX + margin, bounds.maxX - margin),
    z: clamp(position.z, bounds.minZ + margin, bounds.maxZ - margin),
  };
}
