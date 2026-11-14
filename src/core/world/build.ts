import type { Vec2 } from '../vec';
import { distance2 } from '../vec';
import { buildUniformGrid, createGridQueryScratch, queryGrid } from './grid';
import type { GridQueryScratch, UniformGrid } from './grid';
import { buildRoadSegments, sampleRoad } from './roads';
import type { RoadSegment } from './roads';
import type {
  Aabb,
  BarrierSpec,
  BuildingSpec,
  Collider,
  JunctionSpec,
  OpenWorldSpec,
  RoadPath,
  TreeSpec,
} from './types';

/** Starting offset beyond the asphalt edge for road-parallel barriers, in metres. */
const COLLIDER_SEGMENT_METRES = 6;
const BARRIER_OVERLAP = 0.35;
const TREE_SPACING = 3.2;

export interface BuiltBarrier {
  readonly spec: BarrierSpec;
  /** Chain vertices shared by the collider boxes and the rendered rail. */
  readonly points: readonly Vec2[];
  readonly colliders: readonly Collider[];
}

export interface OpenWorldRuntime {
  readonly spec: OpenWorldSpec;
  readonly roads: readonly RoadPath[];
  readonly roadsById: ReadonlyMap<string, RoadPath>;
  readonly junctions: readonly JunctionSpec[];
  readonly barriers: readonly BuiltBarrier[];
  readonly buildings: readonly BuildingSpec[];
  readonly trees: readonly TreeSpec[];
  readonly colliders: readonly Collider[];
  readonly colliderGrid: UniformGrid;
  readonly colliderAabbs: readonly Aabb[];
  readonly roadSegments: readonly RoadSegment[];
  readonly roadGrid: UniformGrid;
  readonly worldAabb: Aabb;
  readonly colliderScratch: GridQueryScratch;
  readonly roadScratch: GridQueryScratch;
}

/** Deterministic 0..1 generator; never shares global state. */
function seededRandom(seed: number): () => number {
  let value = (seed | 0) ^ 0x9e3779b9;
  return () => {
    value = Math.imul(value ^ (value >>> 15), 2246822519);
    value = Math.imul(value ^ (value >>> 13), 3266489917);
    return ((value ^= value >>> 16) >>> 0) / 4294967296;
  };
}

function nearestSampleIndex(road: RoadPath, point: Vec2): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  road.points.forEach((sample, index) => {
    const d = distance2(sample, point);
    if (d < bestDist) {
      bestDist = d;
      best = index;
    }
  });
  return best;
}

function roadEdgePoints(barrier: BarrierSpec, roadsById: ReadonlyMap<string, RoadPath>): Vec2[] {
  const source = barrier.source;
  if (source.type !== 'road-edge') return [];
  const road = roadsById.get(source.roadId);
  if (!road) throw new Error(`Barrier ${barrier.id} references missing road ${source.roadId}`);
  const start = nearestSampleIndex(road, source.from);
  const end = nearestSampleIndex(road, source.to);
  const count = road.points.length;

  // Closed roads take the shorter arc; open roads always follow their saved
  // driving order so `from` -> `to` cannot silently select the wrong half.
  let step: number;
  let steps: number;
  if (road.spec.closed) {
    const forwardSteps = (end - start + count) % count;
    const backwards = forwardSteps === 0 ? count : count - forwardSteps;
    step = forwardSteps <= backwards ? 1 : -1;
    steps = Math.min(forwardSteps, backwards);
  } else {
    step = end >= start ? 1 : -1;
    steps = Math.abs(end - start);
  }

  const sideSign = source.side === 'right' ? 1 : -1;
  const result: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const index = (start + step * i + count * Math.abs(step)) % count;
    const point = road.points[index];
    const normal = road.normals[index];
    if (!point || !normal) continue;
    const lateral = road.spec.width / 2 + source.offset;
    result.push({
      x: point.x + normal.x * lateral * sideSign,
      z: point.z + normal.z * lateral * sideSign,
    });
  }
  return result;
}

function resamplePolyline(points: readonly Vec2[], spacing: number): Vec2[] {
  const first = points[0];
  if (points.length < 2 || !first) return points.map((point) => ({ ...point }));
  const result: Vec2[] = [{ ...first }];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const length = distance2(a, b);
    if (length < 1e-6) continue;
    // Every vertex is kept so corners stay sharp, and each span is resampled
    // from its own start so consecutive points are never further apart than
    // `spacing` (the interval never straddles a corner).
    for (let travelled = spacing; travelled < length - 0.05; travelled += spacing) {
      const t = travelled / length;
      result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
    const tail = result[result.length - 1];
    if (!tail || distance2(tail, b) > 0.05) result.push({ ...b });
  }
  return result;
}

function barrierColliders(spec: BarrierSpec, points: readonly Vec2[]): Collider[] {
  const colliders: Collider[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const length = distance2(a, b);
    if (length < 0.05) continue;
    colliders.push({
      id: `${spec.id}:${i}`,
      sourceId: spec.id,
      category: spec.category ?? 'solid',
      kind: spec.category === 'boundary' ? 'world-edge' : 'barrier',
      height: spec.height,
      shape: {
        type: 'box',
        center: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
        halfX: length / 2 + BARRIER_OVERLAP,
        halfZ: spec.thickness / 2,
        angle: Math.atan2(b.z - a.z, b.x - a.x),
      },
    });
  }
  return colliders;
}

function buildBarrier(spec: BarrierSpec, roadsById: ReadonlyMap<string, RoadPath>): BuiltBarrier {
  const raw =
    spec.source.type === 'road-edge' ? roadEdgePoints(spec, roadsById) : spec.source.points;
  const points =
    spec.source.type === 'road-edge' ? raw : resamplePolyline(raw, COLLIDER_SEGMENT_METRES);
  return { spec, points, colliders: barrierColliders(spec, points) };
}

function buildingCollider(spec: BuildingSpec): Collider | null {
  if (!spec.solid) return null;
  return {
    id: `${spec.id}:walls`,
    sourceId: spec.id,
    category: 'solid',
    kind: 'building',
    height: spec.wallHeight,
    shape: {
      type: 'box',
      center: spec.center,
      halfX: spec.size.x / 2,
      halfZ: spec.size.z / 2,
      angle: spec.angle,
    },
  };
}

function pointInBuilding(point: Vec2, spec: BuildingSpec, padding: number): boolean {
  const dx = point.x - spec.center.x;
  const dz = point.z - spec.center.z;
  const c = Math.cos(spec.angle);
  const s = Math.sin(spec.angle);
  const localX = dx * c + dz * s;
  const localZ = -dx * s + dz * c;
  return (
    Math.abs(localX) <= spec.size.x / 2 + padding && Math.abs(localZ) <= spec.size.z / 2 + padding
  );
}

function propColliders(spec: OpenWorldSpec): Collider[] {
  const colliders: Collider[] = [];
  for (const prop of spec.props) {
    if (!prop.solid) continue;
    const addCircle = (center: Vec2, radius: number, height: number, suffix: string) => {
      colliders.push({
        id: `${prop.id}:${suffix}`,
        sourceId: prop.id,
        category: 'solid',
        kind: 'prop',
        height,
        shape: { type: 'circle', center, radius },
      });
    };
    if (prop.kind === 'water-tower') {
      const reach = 4.6 * prop.scale;
      const height = 32 * prop.scale;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        addCircle(
          {
            x:
              prop.position.x +
              sx * reach * Math.cos(prop.angle) -
              sz * reach * Math.sin(prop.angle),
            z:
              prop.position.z +
              sx * reach * Math.sin(prop.angle) +
              sz * reach * Math.cos(prop.angle),
          },
          0.55 * prop.scale,
          height,
          `leg-${sx}-${sz}`,
        );
      }
      continue;
    }
    if (prop.kind === 'silo') {
      addCircle(prop.position, 2.6 * prop.scale, 18 * prop.scale, 'body');
    } else if (prop.kind === 'fuel-tank') {
      addCircle(prop.position, 1.6 * prop.scale, 3.2 * prop.scale, 'body');
    } else if (prop.kind === 'bollard') {
      addCircle(prop.position, 0.18, 0.9, 'post');
    } else if (prop.kind === 'sign') {
      addCircle(prop.position, 0.16, 2.5, 'post');
    } else {
      addCircle(prop.position, 0.16, 4.5, 'post');
    }
  }
  return colliders;
}

function distancePointToBarrier(point: Vec2, points: readonly Vec2[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const lengthSq = abx * abx + abz * abz;
    const t =
      lengthSq > 1e-9
        ? Math.min(1, Math.max(0, ((point.x - a.x) * abx + (point.z - a.z) * abz) / lengthSq))
        : 0;
    const dx = point.x - (a.x + abx * t);
    const dz = point.z - (a.z + abz * t);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

/**
 * Plant trees from the declarative zones, rejecting candidates that touch roads,
 * pads, buildings, barriers, props, other trees or the world boundary. The
 * accepted positions become the single source of truth for trunks and meshes.
 */
function growTrees(
  spec: OpenWorldSpec,
  roadSegments: readonly RoadSegment[],
  roadGrid: UniformGrid,
  buildings: readonly BuildingSpec[],
  barriers: readonly BuiltBarrier[],
  propsColliders: readonly Collider[],
): TreeSpec[] {
  const trees: TreeSpec[] = spec.trees.map((tree) => ({ ...tree }));
  const roadScratch = createGridQueryScratch(roadSegments.length);
  const bounds = spec.bounds;

  for (const zone of spec.treeZones) {
    const random = seededRandom(zone.seed);
    const minX = zone.center.x - zone.size.x / 2;
    const minZ = zone.center.z - zone.size.z / 2;
    let accepted = 0;
    let attempts = 0;
    while (accepted < zone.count && attempts < zone.count * 8) {
      attempts += 1;
      const point = {
        x: minX + random() * zone.size.x,
        z: minZ + random() * zone.size.z,
      };
      if (
        point.x < bounds.minX + 14 ||
        point.x > bounds.maxX - 14 ||
        point.z < bounds.minZ + 14 ||
        point.z > bounds.maxZ - 14
      ) {
        continue;
      }
      const area = {
        minX: point.x - 24,
        maxX: point.x + 24,
        minZ: point.z - 24,
        maxZ: point.z + 24,
      };
      const nearbySegments = queryGrid(roadGrid, area, roadScratch);
      let tooCloseToRoad = false;
      for (const index of nearbySegments) {
        const segment = roadSegments[index];
        if (!segment) continue;
        const ax = segment.a.x;
        const az = segment.a.z;
        const bx = segment.b.x;
        const bz = segment.b.z;
        const lengthSq = (bx - ax) ** 2 + (bz - az) ** 2;
        const t =
          lengthSq > 1e-9
            ? Math.min(
                1,
                Math.max(0, ((point.x - ax) * (bx - ax) + (point.z - az) * (bz - az)) / lengthSq),
              )
            : 0;
        const dx = point.x - (ax + (bx - ax) * t);
        const dz = point.z - (az + (bz - az) * t);
        if (Math.hypot(dx, dz) < segment.halfWidth + zone.roadClearance) {
          tooCloseToRoad = true;
          break;
        }
      }
      if (tooCloseToRoad) continue;

      let blocked = false;
      for (const pad of spec.junctions) {
        if (distance2(point, pad.center) < pad.radius + zone.roadClearance - 2) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      for (const building of buildings) {
        if (pointInBuilding(point, building, 5)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      for (const barrier of barriers) {
        if (distancePointToBarrier(point, barrier.points) < 5) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      for (const collider of propsColliders) {
        const shape = collider.shape;
        if (distance2(point, shape.center) < (shape.type === 'circle' ? shape.radius : 2) + 5) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      for (const tree of trees) {
        if (distance2(point, tree.position) < TREE_SPACING) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      for (const recovery of spec.recoveryPoints) {
        if (distance2(point, recovery.position) < 12) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const variant = Math.floor(random() * 3);
      trees.push({
        id: `${zone.id}-${accepted}`,
        position: point,
        scale: zone.minScale + random() * (zone.maxScale - zone.minScale),
        variant: (variant % 3) as 0 | 1 | 2,
      });
      accepted += 1;
    }
  }
  return trees;
}

export function buildOpenWorld(spec: OpenWorldSpec): OpenWorldRuntime {
  const roads = spec.roads.map(sampleRoad);
  const roadsById = new Map(roads.map((road) => [road.spec.id, road]));
  const roadSegments = buildRoadSegments(roads);
  const worldAabb: Aabb = {
    minX: spec.bounds.minX,
    maxX: spec.bounds.maxX,
    minZ: spec.bounds.minZ,
    maxZ: spec.bounds.maxZ,
  };
  const roadGrid = buildUniformGrid(
    roadSegments.map((segment) => ({ aabb: segment.aabb })),
    worldAabb,
    32,
  );

  const barriers = spec.barriers.map((barrier) => buildBarrier(barrier, roadsById));
  const propsColliders = propColliders(spec);
  const trees = growTrees(spec, roadSegments, roadGrid, spec.buildings, barriers, propsColliders);

  const colliders: Collider[] = [];
  for (const barrier of barriers) colliders.push(...barrier.colliders);
  for (const building of spec.buildings) {
    const collider = buildingCollider(building);
    if (collider) colliders.push(collider);
  }
  for (const tree of trees) {
    colliders.push({
      id: `${tree.id}:trunk`,
      sourceId: tree.id,
      category: 'solid',
      kind: 'tree',
      height: 3.2 * tree.scale,
      shape: {
        type: 'circle',
        center: tree.position,
        radius: 0.42 * tree.scale,
      },
    });
  }
  for (const rock of spec.rocks) {
    colliders.push({
      id: `${rock.id}:body`,
      sourceId: rock.id,
      category: 'solid',
      kind: 'rock',
      height: rock.height,
      shape: { type: 'circle', center: rock.position, radius: rock.radius * 0.94 },
    });
  }
  colliders.push(...propsColliders);

  const seen = new Set<string>();
  for (const collider of colliders) {
    if (seen.has(collider.id)) throw new Error(`Duplicate collider id ${collider.id}`);
    seen.add(collider.id);
  }

  const colliderAabbs: Aabb[] = colliders.map((collider) => {
    const shape = collider.shape;
    if (shape.type === 'circle') {
      return {
        minX: shape.center.x - shape.radius,
        maxX: shape.center.x + shape.radius,
        minZ: shape.center.z - shape.radius,
        maxZ: shape.center.z + shape.radius,
      };
    }
    const c = Math.abs(Math.cos(shape.angle));
    const s = Math.abs(Math.sin(shape.angle));
    const extentX = c * shape.halfX + s * shape.halfZ;
    const extentZ = s * shape.halfX + c * shape.halfZ;
    return {
      minX: shape.center.x - extentX,
      maxX: shape.center.x + extentX,
      minZ: shape.center.z - extentZ,
      maxZ: shape.center.z + extentZ,
    };
  });

  const colliderGrid = buildUniformGrid(
    colliderAabbs.map((aabb) => ({ aabb })),
    worldAabb,
    24,
  );

  return {
    spec,
    roads,
    roadsById,
    junctions: spec.junctions,
    barriers,
    buildings: spec.buildings,
    trees,
    colliders,
    colliderGrid,
    colliderAabbs,
    roadSegments,
    roadGrid,
    worldAabb,
    colliderScratch: createGridQueryScratch(colliders.length),
    roadScratch: createGridQueryScratch(roadSegments.length),
  };
}
