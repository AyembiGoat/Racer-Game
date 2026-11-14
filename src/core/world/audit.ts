import type { Vec2 } from '../vec';
import { distance2 } from '../vec';
import type { OpenWorldRuntime } from './build';
import { aabbOverlaps, colliderAabb } from './collision';
import { exhaustiveCellIndices, gridStats, queryGrid, createGridQueryScratch } from './grid';
import { carContactsAt, insideBounds, nearestPaved, poseClear, surfaceAt } from './query';
import type { Aabb, Collider } from './types';

export interface RecoveryReport {
  readonly id: string;
  readonly clear: boolean;
  readonly paved: boolean;
  readonly insideBounds: boolean;
  readonly nearestColliderMetres: number;
}

export interface BarrierAudit {
  readonly id: string;
  readonly points: number;
  readonly colliders: number;
  readonly maxSegmentMetres: number;
  readonly minSegmentMetres: number;
}

export interface OpenWorldAudit {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly colliderCount: number;
  readonly colliderCounts: Readonly<Record<string, number>>;
  readonly gridCells: number;
  readonly occupiedCells: number;
  readonly maxPerCell: number;
  readonly duplicateIds: readonly string[];
  readonly invalidShapes: readonly string[];
  readonly missingSources: readonly string[];
  readonly missingColliders: readonly string[];
  readonly missingFromGrid: readonly string[];
  readonly broadPhaseMismatches: number;
  readonly spawn: RecoveryReport;
  readonly recoveries: readonly RecoveryReport[];
  readonly barriers: readonly BarrierAudit[];
  readonly unpavedRoadSamples: number;
  readonly blockedRoadPoses: readonly string[];
  readonly obstructingProps: readonly string[];
  readonly disconnectedRoadEnds: readonly string[];
  readonly unpavedJunctions: readonly string[];
  readonly outOfBoundsColliders: readonly string[];
}

function sourceIds(runtime: OpenWorldRuntime): Set<string> {
  const ids = new Set<string>();
  for (const barrier of runtime.barriers) ids.add(barrier.spec.id);
  for (const building of runtime.buildings) ids.add(building.id);
  for (const tree of runtime.trees) ids.add(tree.id);
  for (const rock of runtime.spec.rocks) ids.add(rock.id);
  for (const prop of runtime.spec.props) ids.add(prop.id);
  return ids;
}

function nearbyColliderDistance(runtime: OpenWorldRuntime, position: Vec2): number {
  const reach = 12;
  const area = {
    minX: position.x - reach,
    maxX: position.x + reach,
    minZ: position.z - reach,
    maxZ: position.z + reach,
  };
  const indices = queryGrid(
    runtime.colliderGrid,
    area,
    createGridQueryScratch(runtime.colliders.length),
  );
  let closest = Number.POSITIVE_INFINITY;
  for (const index of indices) {
    const collider = runtime.colliders[index];
    if (!collider) continue;
    const shape = collider.shape;
    if (shape.type === 'circle') {
      closest = Math.min(closest, distance2(position, shape.center) - shape.radius);
    } else {
      const c = Math.cos(shape.angle);
      const s = Math.sin(shape.angle);
      const dx = position.x - shape.center.x;
      const dz = position.z - shape.center.z;
      const localX = Math.max(0, Math.abs(dx * c + dz * s) - shape.halfX);
      const localZ = Math.max(0, Math.abs(-dx * s + dz * c) - shape.halfZ);
      closest = Math.min(closest, Math.hypot(localX, localZ));
    }
  }
  return Number.isFinite(closest) ? closest : 99;
}

function recoveryReport(
  runtime: OpenWorldRuntime,
  point: { id: string; position: Vec2; heading: number },
): RecoveryReport {
  return {
    id: point.id,
    clear: carContactsAt(runtime, point.position, point.heading).length === 0,
    paved: surfaceAt(runtime, point.position, 0.86) === 'tarmac',
    insideBounds: insideBounds(runtime, point.position, 1),
    nearestColliderMetres: Math.round(nearbyColliderDistance(runtime, point.position) * 100) / 100,
  };
}

function deterministicAreas(bounds: Aabb, count: number): Aabb[] {
  const areas: Aabb[] = [];
  let seed = 0x2f6e2b1;
  const rand = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489917);
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const x = bounds.minX + rand() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rand() * (bounds.maxZ - bounds.minZ);
    const half = 2 + rand() * 22;
    areas.push({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });
  }
  return areas;
}

/**
 * Deterministic full audit of the open-world collision and surface data.
 * Run in tests and from the debug overlay; it allocates and is never called
 * from the fixed simulation loop.
 */
export function auditOpenWorld(runtime: OpenWorldRuntime): OpenWorldAudit {
  const errors: string[] = [];
  const colliders = runtime.colliders;
  const counts: Record<string, number> = {
    barrier: 0,
    building: 0,
    tree: 0,
    rock: 0,
    prop: 0,
    'world-edge': 0,
  };

  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const invalidShapes: string[] = [];
  const outOfBoundsColliders: string[] = [];
  for (const collider of colliders) {
    counts[collider.kind] = (counts[collider.kind] ?? 0) + 1;
    if (seen.has(collider.id)) duplicateIds.push(collider.id);
    seen.add(collider.id);
    const shape = collider.shape;
    const boxValid =
      shape.type === 'box' &&
      Number.isFinite(shape.halfX) &&
      Number.isFinite(shape.halfZ) &&
      Number.isFinite(shape.angle) &&
      shape.halfX > 0 &&
      shape.halfZ > 0;
    const circleValid =
      shape.type === 'circle' &&
      Number.isFinite(shape.radius) &&
      shape.radius > 0 &&
      Number.isFinite(shape.center.x) &&
      Number.isFinite(shape.center.z);
    const circleFinite =
      shape.type === 'circle' ||
      (Number.isFinite(shape.center.x) && Number.isFinite(shape.center.z));
    if (!(shape.type === 'box' ? boxValid : circleValid) || !circleFinite) {
      invalidShapes.push(collider.id);
    }
    const aabb = colliderAabb(collider);
    if (!Number.isFinite(aabb.minX) || aabb.maxX <= aabb.minX || aabb.maxZ <= aabb.minZ) {
      invalidShapes.push(collider.id);
    }
    const bounds = runtime.spec.bounds;
    if (
      aabb.minX < bounds.minX - 1 ||
      aabb.maxX > bounds.maxX + 1 ||
      aabb.minZ < bounds.minZ - 1 ||
      aabb.maxZ > bounds.maxZ + 1
    ) {
      outOfBoundsColliders.push(collider.id);
    }
  }

  const sources = sourceIds(runtime);
  const missingSources = colliders
    .filter((collider) => !sources.has(collider.sourceId))
    .map((collider) => collider.id);

  // Every solid map object must contribute at least one collider.
  const bySource = new Map<string, Collider[]>();
  for (const collider of colliders) {
    const list = bySource.get(collider.sourceId) ?? [];
    list.push(collider);
    bySource.set(collider.sourceId, list);
  }
  const missingColliders: string[] = [];
  for (const barrier of runtime.barriers) {
    if (barrier.colliders.length === 0) missingColliders.push(barrier.spec.id);
  }
  for (const building of runtime.buildings) {
    if (building.solid && !bySource.has(building.id)) missingColliders.push(building.id);
  }
  for (const tree of runtime.trees) {
    if (!bySource.has(tree.id)) missingColliders.push(tree.id);
  }
  for (const rock of runtime.spec.rocks) {
    if (!bySource.has(rock.id)) missingColliders.push(rock.id);
  }
  for (const prop of runtime.spec.props) {
    if (prop.solid && !bySource.has(prop.id)) missingColliders.push(prop.id);
  }

  // Grid completeness: every collider whose AABB overlaps a cell must be in it.
  const missingFromGrid: string[] = [];
  for (let index = 0; index < colliders.length; index++) {
    const collider = colliders[index];
    if (!collider) continue;
    const aabb = colliderAabb(collider);
    const found = exhaustiveCellIndices(runtime.colliderGrid, aabb);
    if (!found.includes(index)) missingFromGrid.push(collider.id);
  }

  // Broad phase must never miss anything an exhaustive AABB scan would find.
  const scratch = createGridQueryScratch(colliders.length);
  let broadPhaseMismatches = 0;
  for (const area of deterministicAreas(runtime.worldAabb, 160)) {
    const queried = new Set(queryGrid(runtime.colliderGrid, area, scratch));
    for (let index = 0; index < colliders.length; index++) {
      const collider = colliders[index];
      if (!collider) continue;
      const overlaps = aabbOverlaps(colliderAabb(collider), area);
      if (overlaps && !queried.has(index)) broadPhaseMismatches += 1;
    }
  }

  const stats = gridStats(runtime.colliderGrid);
  const spawn = recoveryReport(runtime, {
    id: 'spawn',
    position: runtime.spec.spawn.position,
    heading: runtime.spec.spawn.heading,
  });
  const recoveries = runtime.spec.recoveryPoints.map((point) => recoveryReport(runtime, point));

  const barrierReports: BarrierAudit[] = runtime.barriers.map((barrier) => {
    let maxSegment = 0;
    let minSegment = Number.POSITIVE_INFINITY;
    for (let i = 1; i < barrier.points.length; i++) {
      const a = barrier.points[i - 1];
      const b = barrier.points[i];
      if (!a || !b) continue;
      const length = distance2(a, b);
      maxSegment = Math.max(maxSegment, length);
      minSegment = Math.min(minSegment, length);
    }
    return {
      id: barrier.spec.id,
      points: barrier.points.length,
      colliders: barrier.colliders.length,
      maxSegmentMetres: Math.round(maxSegment * 100) / 100,
      minSegmentMetres: Number.isFinite(minSegment) ? Math.round(minSegment * 100) / 100 : 0,
    };
  });

  let unpavedRoadSamples = 0;
  for (const road of runtime.roads) {
    for (const point of road.points) {
      if (surfaceAt(runtime, point, 0) !== 'tarmac') unpavedRoadSamples += 1;
    }
  }
  const unpavedJunctions: string[] = [];
  for (const junction of runtime.junctions) {
    if (surfaceAt(runtime, junction.center, 0) !== 'tarmac') unpavedJunctions.push(junction.id);
  }

  const obstructingProps: string[] = [];
  for (const rock of runtime.spec.rocks) {
    const paved = nearestPaved(runtime, rock.position, 80);
    if (!paved || paved.gap < rock.radius + 0.25) obstructingProps.push(rock.id);
  }
  const propExtent: Record<string, number> = {
    'water-tower': 2.4,
    silo: 2.2,
    'fuel-tank': 1.4,
    windsock: 0.4,
    sign: 0.25,
    bollard: 0.3,
  };
  for (const prop of runtime.spec.props) {
    if (!prop.solid) continue;
    const paved = nearestPaved(runtime, prop.position, 80);
    const extent = (propExtent[prop.kind] ?? 1) * prop.scale;
    if (!paved || paved.gap < extent + 0.25) obstructingProps.push(prop.id);
  }

  const blockedRoadPoses: string[] = [];
  for (const road of runtime.roads) {
    for (let i = 0; i < road.points.length; i += 8) {
      const point = road.points[i];
      const tangent = road.tangents[i];
      if (!point || !tangent) continue;
      const heading = Math.atan2(-tangent.x, -tangent.z);
      if (!poseClear(runtime, point, heading, 0.02)) {
        blockedRoadPoses.push(`${road.spec.id}:${i}`);
      }
    }
  }

  const disconnectedRoadEnds: string[] = [];
  for (const road of runtime.roads) {
    if (road.spec.closed) continue;
    for (const [label, point] of [
      ['start', road.points[0]],
      ['end', road.points[road.points.length - 1]],
    ] as const) {
      if (!point) continue;
      const hit = nearestPaved(runtime, point, 30);
      if (!hit || hit.gap > 0.02) {
        disconnectedRoadEnds.push(`${road.spec.id}:${label}`);
      }
    }
  }

  if (duplicateIds.length) errors.push(`${duplicateIds.length} duplicate collider ids`);
  if (invalidShapes.length) errors.push(`${invalidShapes.length} invalid collider shapes`);
  if (missingSources.length) errors.push(`${missingSources.length} colliders without a source`);
  if (missingColliders.length)
    errors.push(`${missingColliders.length} solid sources without colliders`);
  if (missingFromGrid.length)
    errors.push(`${missingFromGrid.length} colliders missing from the grid`);
  if (broadPhaseMismatches) errors.push(`${broadPhaseMismatches} broad-phase false negatives`);
  if (!spawn.clear) errors.push('Spawn intersects a solid');
  if (!spawn.paved) errors.push('Spawn is not on pavement');
  if (!spawn.insideBounds) errors.push('Spawn is outside world bounds');
  for (const recovery of recoveries) {
    if (!recovery.clear) errors.push(`Recovery ${recovery.id} intersects a solid`);
    if (!recovery.paved) errors.push(`Recovery ${recovery.id} is not on pavement`);
    if (!recovery.insideBounds) errors.push(`Recovery ${recovery.id} is outside bounds`);
  }
  for (const barrier of barrierReports) {
    if (barrier.maxSegmentMetres > 8.01) {
      errors.push(`Barrier ${barrier.id} has a ${barrier.maxSegmentMetres} m gap in its chain`);
    }
    if (barrier.colliders !== barrier.points - 1) {
      errors.push(`Barrier ${barrier.id} collider count does not match its chain`);
    }
  }
  if (unpavedRoadSamples) errors.push(`${unpavedRoadSamples} road centre samples are not paved`);
  if (blockedRoadPoses.length) {
    errors.push(`${blockedRoadPoses.length} car poses on road centrelines are blocked`);
  }
  if (obstructingProps.length) {
    errors.push(`${obstructingProps.length} solid rocks or props intrude on asphalt`);
  }
  if (unpavedJunctions.length) errors.push(`${unpavedJunctions.length} junctions are not paved`);
  if (disconnectedRoadEnds.length) {
    errors.push(`${disconnectedRoadEnds.length} road ends are not connected to pavement`);
  }
  if (outOfBoundsColliders.length) {
    errors.push(`${outOfBoundsColliders.length} colliders extend outside world bounds`);
  }

  return {
    ok: errors.length === 0,
    errors,
    colliderCount: colliders.length,
    colliderCounts: counts,
    gridCells: stats.cells,
    occupiedCells: stats.occupiedCells,
    maxPerCell: stats.maxPerCell,
    duplicateIds,
    invalidShapes: [...new Set(invalidShapes)],
    missingSources,
    missingColliders,
    missingFromGrid,
    broadPhaseMismatches,
    spawn,
    recoveries,
    barriers: barrierReports,
    unpavedRoadSamples,
    blockedRoadPoses,
    obstructingProps,
    disconnectedRoadEnds,
    unpavedJunctions,
    outOfBoundsColliders,
  };
}
