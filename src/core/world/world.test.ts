import { describe, expect, it } from 'vitest';
import { buildOpenWorld } from './build';
import { auditOpenWorld } from './audit';
import { carColliderContact, carObb, colliderAabb, obbContact } from './collision';
import { buildUniformGrid, queryGrid, createGridQueryScratch } from './grid';
import { carContactsAt, nearestPaved, poseClear, surfaceAt } from './query';
import type { Collider } from './types';
import { kestrelValley } from '../worlds/kestrelValley';

const runtime = buildOpenWorld(kestrelValley);

function collider(id: string, kind: Collider['kind'] = 'building'): Collider {
  return {
    id: `${id}:0`,
    sourceId: id,
    kind,
    category: 'solid',
    height: 3,
    shape: {
      type: 'box',
      center: { x: 0, z: 0 },
      halfX: 6,
      halfZ: 2,
      angle: 0,
    },
  };
}

describe('oriented collision', () => {
  it('reports touching as apart and resists from the wall side', () => {
    const wall = { center: { x: 0, z: 0 }, halfX: 10, halfZ: 0.2, angle: 0 };
    const touching = { center: { x: 0, z: 2.375 }, halfX: 2.175, halfZ: 0.95, angle: Math.PI / 2 };
    expect(obbContact(touching, wall, 'w', 'w', 'barrier')).toBeNull();

    const overlapping = { ...touching, center: { x: 0, z: 2.0 } };
    const hit = obbContact(overlapping, wall, 'w', 'w', 'barrier');
    expect(hit).not.toBeNull();
    expect(hit?.depth).toBeCloseTo(0.375, 6);
    expect(hit?.normal.z).toBeCloseTo(1, 6);
    expect(Math.hypot(hit?.normal.x ?? 0, hit?.normal.z ?? 0)).toBeCloseTo(1, 6);
  });

  it('finds the shortest way out of a corner', () => {
    const corner = {
      center: { x: 6, z: 6 },
      halfX: 6,
      halfZ: 6,
      angle: 0,
    };
    const car = { center: { x: 11, z: 11 }, halfX: 2.175, halfZ: 0.95, angle: 0.3 };
    const hit = obbContact(car, corner, 'corner', 'corner', 'building');
    expect(hit).not.toBeNull();
    const moved = {
      ...car,
      center: {
        x: car.center.x + (hit?.normal.x ?? 0) * ((hit?.depth ?? 0) + 0.001),
        z: car.center.z + (hit?.normal.z ?? 0) * ((hit?.depth ?? 0) + 0.001),
      },
    };
    expect(obbContact(moved, corner, 'corner', 'corner', 'building')).toBeNull();
  });

  it('matches a box contact against a translated circle', () => {
    const tree: Collider = {
      id: 'tree:0',
      sourceId: 'tree',
      kind: 'tree',
      category: 'solid',
      height: 4,
      shape: { type: 'circle', center: { x: 0, z: -5 }, radius: 1.2 },
    };
    const car = carObb({ x: 0, z: -2.5 }, 0);
    const hit = carColliderContact(car, tree);
    expect(hit).not.toBeNull();
    expect(hit?.kind).toBe('tree');
    expect(hit?.depth).toBeCloseTo(0.875, 6);
    expect(hit?.normal.z).toBeCloseTo(1, 6);
  });
});

describe('uniform grid', () => {
  it('returns every overlapping collider in deterministic ascending order', () => {
    const colliders: Collider[] = [
      {
        ...collider('a'),
        shape: { type: 'box', center: { x: 0, z: 0 }, halfX: 2, halfZ: 2, angle: 0 },
      },
      {
        ...collider('b'),
        shape: { type: 'box', center: { x: 100, z: 0 }, halfX: 2, halfZ: 2, angle: 0 },
      },
      {
        ...collider('c'),
        shape: { type: 'circle', center: { x: 0.5, z: 0.5 }, radius: 1 },
      },
    ];
    const bounds = { minX: -20, maxX: 120, minZ: -20, maxZ: 20 };
    const grid = buildUniformGrid(
      colliders.map((item) => ({ aabb: colliderAabb(item) })),
      bounds,
      8,
    );
    const scratch = createGridQueryScratch(colliders.length);
    const area = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    const first = queryGrid(grid, area, scratch);
    const second = queryGrid(grid, area, scratch);
    expect(first).toEqual(second);
    expect([...first].sort((x, y) => x - y)).toEqual(first);
    expect(first).toContain(0);
    expect(first).toContain(2);
    expect(first).not.toContain(1);
  });
});

describe('Kestrel Valley surfaces', () => {
  it('classifies road centre, kerb and verge consistently', () => {
    for (const road of runtime.roads) {
      for (let i = 0; i < road.points.length; i += 12) {
        const point = road.points[i];
        if (!point) continue;
        expect(surfaceAt(runtime, point, 0), `${road.spec.id}:${i}`).toBe('tarmac');
      }
    }

    let kerbSamples = 0;
    for (const road of runtime.roads) {
      for (let i = 0; i < road.points.length; i += 2) {
        const point = road.points[i];
        const normal = road.normals[i];
        if (!point || !normal) continue;
        const lateral = road.spec.width / 2 + 0.15;
        for (const sign of [-1, 1]) {
          const probe = {
            x: point.x + normal.x * lateral * sign,
            z: point.z + normal.z * lateral * sign,
          };
          const surface = surfaceAt(runtime, probe, 0.86);
          expect(['tarmac', 'kerb', 'grass']).toContain(surface);
          if (surface === 'kerb') kerbSamples += 1;
        }
      }
    }
    expect(kerbSamples).toBeGreaterThan(0);
  });

  it('is grass far from every road and pad', () => {
    expect(surfaceAt(runtime, { x: -900, z: 700 }, 0.86)).toBe('grass');
    expect(surfaceAt(runtime, { x: 900, z: -700 }, 0.86)).toBe('grass');
  });

  it('reports the paved gap outside the asphalt edge', () => {
    const road = runtime.roads[0];
    expect(road).toBeDefined();
    if (!road) return;
    const point = road.points[10];
    const normal = road.normals[10];
    expect(point && normal).toBeTruthy();
    if (!point || !normal) return;
    const offset = road.spec.width / 2 + 5;
    const hit = nearestPaved(runtime, {
      x: point.x + normal.x * offset,
      z: point.z + normal.z * offset,
    });
    expect(hit?.kind).toBe('road');
    expect(hit?.gap ?? -1).toBeGreaterThan(3);
    expect(hit?.gap ?? 99).toBeLessThan(8);
  });
});

describe('Kestrel Valley collision audit', () => {
  const report = auditOpenWorld(runtime);

  it('passes every structural audit without errors', () => {
    if (!report.ok) console.error(report);
    expect(report.errors).toEqual([]);
  });

  it('covers every solid source and indexes every collider', () => {
    expect(report.colliderCount).toBe(runtime.colliders.length);
    expect(report.missingSources).toEqual([]);
    expect(report.missingColliders).toEqual([]);
    expect(report.missingFromGrid).toEqual([]);
    expect(report.duplicateIds).toEqual([]);
    expect(report.invalidShapes).toEqual([]);
    expect(report.broadPhaseMismatches).toBe(0);
    expect(report.obstructingProps).toEqual([]);
    expect(report.colliderCounts.tree).toBe(runtime.trees.length);
    expect(report.colliderCounts['world-edge']).toBeGreaterThan(0);
  });

  it('keeps the spawn and every recovery point clear and paved', () => {
    expect(report.spawn.clear).toBe(true);
    expect(report.spawn.paved).toBe(true);
    expect(report.spawn.insideBounds).toBe(true);
    expect(report.recoveries.length).toBe(kestrelValley.recoveryPoints.length);
    for (const recovery of report.recoveries) {
      expect(recovery.clear, recovery.id).toBe(true);
      expect(recovery.paved, recovery.id).toBe(true);
      expect(recovery.insideBounds, recovery.id).toBe(true);
      expect(recovery.nearestColliderMetres, recovery.id).toBeGreaterThan(1);
    }
  });

  it('keeps every barrier chain continuous and every lane pose clear', () => {
    for (const barrier of report.barriers) {
      expect(barrier.colliders, barrier.id).toBe(barrier.points - 1);
      expect(barrier.maxSegmentMetres, barrier.id).toBeLessThanOrEqual(8.01);
      expect(barrier.minSegmentMetres, barrier.id).toBeGreaterThan(0);
    }
    expect(report.unpavedRoadSamples).toBe(0);
    expect(report.unpavedJunctions).toEqual([]);
    expect(report.disconnectedRoadEnds).toEqual([]);
    expect(report.blockedRoadPoses).toEqual([]);
  });

  it('spawns inside the world and clear of nearby traffic surfaces', () => {
    expect(poseClear(runtime, runtime.spec.spawn.position, runtime.spec.spawn.heading)).toBe(true);
    expect(
      carContactsAt(runtime, runtime.spec.spawn.position, runtime.spec.spawn.heading, 0.4),
    ).toEqual([]);
  });

  it('never places a tree trunk on tarmac', () => {
    for (const tree of runtime.trees) {
      const position = { x: tree.position.x, z: tree.position.z };
      expect(surfaceAt(runtime, position, 0)).not.toBe('tarmac');
      const nearest = nearestPaved(runtime, position, 60);
      expect(nearest?.gap ?? Number.POSITIVE_INFINITY).toBeGreaterThan(0.1);
    }
  });

  it('matches building colliders to their rendered footprints', () => {
    for (const building of runtime.buildings) {
      const owned = runtime.colliders.filter((candidate) => candidate.sourceId === building.id);
      if (!building.solid) {
        expect(owned, building.id).toEqual([]);
        continue;
      }
      expect(owned.length, building.id).toBe(1);
      const shape = owned[0]?.shape;
      expect(shape?.type).toBe('box');
      if (shape?.type !== 'box') continue;
      expect(shape.center).toEqual(building.center);
      expect(shape.halfX).toBeCloseTo(building.size.x / 2, 6);
      expect(shape.halfZ).toBeCloseTo(building.size.z / 2, 6);
      expect(shape.angle).toBeCloseTo(building.angle, 6);
    }
  });

  it('has no lap, sector or checkpoint state', () => {
    const world = runtime as unknown as Record<string, unknown>;
    expect(world.checkpoints).toBeUndefined();
    expect(world.laps).toBeUndefined();
    expect('track' in runtime).toBe(false);
  });

  it('keeps the nearest road sample on the centreline', () => {
    const road = runtime.roadsById.get('valley-ring');
    expect(road).toBeDefined();
    if (!road) return;
    for (let i = 0; i < road.points.length; i += 17) {
      const point = road.points[i];
      if (!point) continue;
      const hit = nearestPaved(runtime, point);
      expect(hit?.distance ?? 99).toBeLessThan(0.01);
    }
  });
});
