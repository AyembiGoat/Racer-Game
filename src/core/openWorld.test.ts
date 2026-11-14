import { describe, expect, it } from 'vitest';
import type { CarInput, CarState } from './car';
import { CAR_TUNING, createCar } from './car';
import { buildOpenWorld } from './world/build';
import type { OpenWorldRuntime } from './world/build';
import type { OpenWorldSpec } from './world/types';
import { carContactsAt, poseClear, surfaceAt } from './world/query';
import { atRecoveryPoint, createOpenWorldState, resetOpenWorld, stepOpenWorld } from './openWorld';
import type { OpenWorldState } from './openWorld';
import { kestrelValley } from './worlds/kestrelValley';
import type { Vec2 } from './vec';

const runtime = buildOpenWorld(kestrelValley);
const DT = 1 / 60;

const fullThrottle: CarInput = { throttle: 1, brake: 0, steer: 0, handbrake: false };

function place(runtime: OpenWorldRuntime, position: Vec2, heading: number): OpenWorldState {
  return {
    car: createCar({ position, heading }),
    surface: surfaceAt(runtime, position, CAR_TUNING.width / 2),
    elapsedSeconds: 0,
    distanceMetres: 0,
  };
}

/** Minimal world with one straight road and a guardrail on its north edge. */
function probeWorld(): OpenWorldRuntime {
  const spec: OpenWorldSpec = {
    id: 'probe',
    name: 'Probe',
    subtitle: '',
    bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 },
    spawn: { position: { x: 0, z: 30 }, heading: 0 },
    recoveryPoints: [],
    roads: [
      {
        id: 'probe-road',
        name: 'Probe Road',
        kind: 'main',
        width: 8,
        controlPoints: [
          { x: -200, z: 0 },
          { x: 200, z: 0 },
        ],
        closed: false,
      },
    ],
    junctions: [],
    barriers: [
      {
        id: 'probe-rail',
        name: 'Probe Rail',
        style: 'guardrail',
        thickness: 0.35,
        height: 0.9,
        source: {
          type: 'road-edge',
          roadId: 'probe-road',
          side: 'left',
          offset: 0.2,
          from: { x: -200, z: 0 },
          to: { x: 200, z: 0 },
        },
      },
    ],
    buildings: [],
    trees: [],
    treeZones: [],
    rocks: [],
    props: [],
    groundPatches: [],
  };
  return buildOpenWorld(spec);
}

const probe = probeWorld();

/** Empty field with one solid building, used for head-on impact tests. */
function wallWorld(): OpenWorldRuntime {
  return buildOpenWorld({
    ...kestrelValley,
    id: 'wall-probe',
    name: 'Wall Probe',
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawn: { position: { x: 0, z: 40 }, heading: 0 },
    recoveryPoints: [],
    roads: [],
    junctions: [],
    barriers: [],
    buildings: [
      {
        id: 'probe-hall',
        kind: 'hall',
        center: { x: 0, z: -30 },
        size: { x: 30, z: 12 },
        angle: 0,
        wallHeight: 6,
        roofHeight: 3,
        wall: 'concrete',
        roof: 'hip',
        solid: true,
      },
    ],
    trees: [],
    treeZones: [],
    rocks: [],
    props: [],
    groundPatches: [],
  });
}

const wall = wallWorld();

function fastState(position: Vec2, heading: number, speed: number): OpenWorldState {
  const base = createCar({ position, heading });
  const car: CarState = {
    ...base,
    velocity: { x: -Math.sin(heading) * speed, z: -Math.cos(heading) * speed },
    speed,
    gear: 5,
    rpm: 6500,
  };
  return {
    car,
    surface: surfaceAt(probe, position, CAR_TUNING.width / 2),
    elapsedSeconds: 0,
    distanceMetres: 0,
  };
}

describe('free roam state', () => {
  it('starts at the authored spawn, on tarmac, with no velocity', () => {
    const state = createOpenWorldState(runtime);
    expect(state.car.position).toEqual(kestrelValley.spawn.position);
    expect(state.car.speed).toBe(0);
    expect(state.surface).toBe('tarmac');
    expect(state.elapsedSeconds).toBe(0);
    expect(poseClear(runtime, state.car.position, state.car.heading, 0.3)).toBe(true);
  });

  it('resets to spawn without any lap state', () => {
    const state = resetOpenWorld(runtime);
    expect(state.car.position).toEqual(kestrelValley.spawn.position);
    expect(Object.keys(state).sort()).toEqual(
      ['car', 'distanceMetres', 'elapsedSeconds', 'surface'].sort(),
    );
  });

  it('reaches every authored recovery point without touching geometry', () => {
    for (const point of kestrelValley.recoveryPoints) {
      const state = atRecoveryPoint(runtime, point.id);
      expect(state.car.position).toEqual(point.position);
      expect(state.surface).toBe('tarmac');
      expect(carContactsAt(runtime, point.position, point.heading)).toEqual([]);
    }
  });

  it('throws for an unknown recovery point', () => {
    expect(() => atRecoveryPoint(runtime, 'nowhere')).toThrow(/Unknown recovery/);
  });
});

describe('free roam driving', () => {
  it('accelerates, shifts up and reports distance and time', () => {
    let state = createOpenWorldState(runtime);
    const start = state.car.position;
    let shifts = 0;
    for (let frame = 0; frame < 240; frame++) {
      const result = stepOpenWorld(state, fullThrottle, DT, runtime);
      state = result.state;
      shifts += result.events.filter((event) => event.type === 'gear-shift').length;
      expect(Number.isFinite(state.car.position.x)).toBe(true);
      expect(Number.isFinite(state.car.position.z)).toBe(true);
    }
    expect(state.car.speed).toBeGreaterThan(10);
    expect(state.distanceMetres).toBeGreaterThan(60);
    expect(state.elapsedSeconds).toBeCloseTo(4, 6);
    expect(shifts).toBeGreaterThan(0);
    expect(
      Math.hypot(state.car.position.x - start.x, state.car.position.z - start.z),
    ).toBeGreaterThan(60);
  });

  it('changes surface state when it leaves the pavement', () => {
    let state = place(runtime, { x: 303, z: 620 }, Math.PI);
    expect(state.surface).toBe('tarmac');
    for (let frame = 0; frame < 180; frame++) {
      state = stepOpenWorld(state, fullThrottle, DT, runtime).state;
    }
    expect(state.surface).toBe('grass');
  });

  it('contains the car inside the world bounds at full speed', () => {
    let state = fastState({ x: 1100, z: 700 }, -Math.PI / 2, 45);
    for (let frame = 0; frame < 120; frame++) {
      state = stepOpenWorld(state, fullThrottle, DT, runtime).state;
      expect(state.car.position.x).toBeLessThanOrEqual(kestrelValley.bounds.maxX);
      expect(state.car.position.x).toBeGreaterThanOrEqual(kestrelValley.bounds.minX);
      expect(state.car.position.z).toBeLessThanOrEqual(kestrelValley.bounds.maxZ);
      expect(state.car.position.z).toBeGreaterThanOrEqual(kestrelValley.bounds.minZ);
    }
    expect(state.car.position.x).toBeLessThan(1200);
  });

  it('is deterministic for identical inputs', () => {
    const run = () => {
      let state = createOpenWorldState(runtime);
      const trace: number[] = [];
      for (let frame = 0; frame < 180; frame++) {
        const input = {
          throttle: 0.8,
          brake: 0,
          steer: Math.sin(frame / 30) * 0.4,
          handbrake: false,
        };
        state = stepOpenWorld(state, input, DT, runtime).state;
        trace.push(state.car.position.x, state.car.position.z, state.car.heading);
      }
      return trace;
    };
    const first = run();
    const second = run();
    expect(first).toEqual(second);
  });
});

describe('swept collision', () => {
  it('stops a car at top speed against a guardrail instead of tunnelling', () => {
    expect(probe.barriers[0]?.colliders.length ?? 0).toBeGreaterThan(50);
    let state = fastState({ x: 0, z: 30 }, 0, 48);
    let minZ = Number.POSITIVE_INFINITY;
    let contacts = 0;
    let wallHits = 0;
    for (let frame = 0; frame < 120; frame++) {
      const result = stepOpenWorld(state, fullThrottle, DT, probe);
      state = result.state;
      if (result.contact) contacts += 1;
      wallHits += result.events.filter((event) => event.type === 'wall-hit').length;
      minZ = Math.min(minZ, state.car.position.z);
      expect(state.car.position.z).toBeGreaterThan(-6);
    }
    // Rail centre z = -4.2; car centre may never pass its near face.
    expect(minZ).toBeGreaterThan(-2.4);
    expect(state.car.position.z).toBeGreaterThan(-2.4);
    expect(contacts).toBeGreaterThan(0);
    expect(wallHits).toBeGreaterThan(0);
    expect(state.car.speed).toBeLessThan(5);
    expect(carContactsAt(probe, state.car.position, state.car.heading)).toEqual([]);
  });

  it('cannot slip through the seam between two rail colliders', () => {
    let state = fastState({ x: 0, z: 25 }, 0, 46);
    let minZ = Number.POSITIVE_INFINITY;
    for (let frame = 0; frame < 90; frame++) {
      state = stepOpenWorld(state, fullThrottle, DT, probe).state;
      minZ = Math.min(minZ, state.car.position.z);
    }
    expect(minZ).toBeGreaterThan(-2.5);
  });

  it('scrapes along a rail at a shallow angle without stopping dead', () => {
    let state = fastState({ x: -30, z: 5 }, 1.45, 32);
    let contacts = 0;
    for (let frame = 0; frame < 150; frame++) {
      const result = stepOpenWorld(state, fullThrottle, DT, probe);
      state = result.state;
      if (result.contact) contacts += 1;
      expect(state.car.position.z).toBeGreaterThan(-2.95);
    }
    expect(contacts).toBeGreaterThan(0);
    expect(state.car.position.x).toBeLessThan(-60);
    expect(state.car.speed).toBeGreaterThan(8);
    expect(Math.abs(state.car.heading - Math.PI / 2)).toBeLessThan(0.25);
  });

  it('resolves a head-on building impact without leaving the car inside', () => {
    let state = place(wall, { x: 0, z: 40 }, 0);
    let wallHits = 0;
    for (let frame = 0; frame < 240; frame++) {
      const result = stepOpenWorld(state, fullThrottle, DT, wall);
      state = result.state;
      wallHits += result.events.filter((event) => event.type === 'wall-hit').length;
      expect(carContactsAt(wall, state.car.position, state.car.heading)).toEqual([]);
    }
    expect(wallHits).toBeGreaterThan(0);
    expect(state.car.speed).toBeLessThan(5);
    // South wall face z = -24; the car centre can never end up past it.
    expect(state.car.position.z).toBeGreaterThan(-22.2);
  });

  it('is stable when resting against a wall under throttle', () => {
    let state = fastState({ x: 0, z: 30 }, 0, 40);
    for (let frame = 0; frame < 60; frame++)
      state = stepOpenWorld(state, fullThrottle, DT, probe).state;
    const resting = { x: state.car.position.x, z: state.car.position.z };
    for (let frame = 0; frame < 180; frame++) {
      state = stepOpenWorld(state, fullThrottle, DT, probe).state;
      expect(state.car.position.z).toBeGreaterThan(-2.5);
    }
    expect(Math.abs(state.car.position.x - resting.x)).toBeLessThan(1);
    expect(Math.abs(state.car.position.z - resting.z)).toBeLessThan(0.5);
  });

  it('reverses away from a wall after an impact', () => {
    let state = fastState({ x: 0, z: 30 }, 0, 40);
    for (let frame = 0; frame < 60; frame++)
      state = stepOpenWorld(state, fullThrottle, DT, probe).state;
    const hitZ = state.car.position.z;
    const reverse: CarInput = { throttle: 0, brake: 1, steer: 0, handbrake: false };
    let reversed = false;
    for (let frame = 0; frame < 300; frame++) {
      const result = stepOpenWorld(state, reverse, DT, probe);
      state = result.state;
      if (state.car.position.z > hitZ + 0.2) reversed = true;
    }
    expect(reversed).toBe(true);
  });
});
