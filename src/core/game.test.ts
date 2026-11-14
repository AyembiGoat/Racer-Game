import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import { CAR_TUNING, NO_INPUT } from './car';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameEvent, GameInput, GameState } from './game';
import { createGame, stepGame } from './game';
import type { Track } from './track';
import { analyseTrackWaypoints, gateAcrossTrack, projectOntoTrack } from './track';
import { clubCircuit } from './tracks/clubCircuit';

const dt = SIM_STEP_SECONDS;

const miniWaypoints = [
  { x: 20, z: 0 },
  { x: 20, z: -20 },
  { x: -20, z: -20 },
  { x: -20, z: 20 },
  { x: 20, z: 20 },
];
const miniAnalysis = analyseTrackWaypoints(miniWaypoints);

/** Compact rectangular loop for fast rule tests. */
const miniLoop: Track = {
  name: 'Mini Loop',
  roadWidth: 10,
  vergeWidth: 4,
  waypoints: miniWaypoints,
  curvatures: miniAnalysis.curvatures,
  kerbs: miniAnalysis.kerbs,
  spawn: { position: { x: 20, z: 4 }, heading: 0 },
  checkpoints: [
    gateAcrossTrack({ x: 0, z: -20 }, Math.PI / 2, 18),
    gateAcrossTrack({ x: 0, z: 20 }, -Math.PI / 2, 18),
    gateAcrossTrack({ x: 20, z: 0 }, 0, 18),
  ],
};

function run(state: GameState, input: GameInput, steps: number, track = miniLoop) {
  const events: GameEvent[] = [];
  let current = state;
  for (let i = 0; i < steps; i++) {
    const result = stepGame(current, input, dt, track);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

describe('stepGame barriers, surfaces and checkpoints', () => {
  it('detects grass run-off before confining the car at the outer guardrail', () => {
    const start: GameState = {
      ...createGame(miniLoop),
      car: {
        ...createGame(miniLoop).car,
        heading: -Math.PI / 2, // Aim across the grass verge toward the outer east guardrail.
      },
    };
    const ontoKerb = run(start, { ...NO_INPUT, throttle: 1 }, 45);
    expect(ontoKerb.state.surface).toBe('kerb');

    const ontoVerge = run(ontoKerb.state, { ...NO_INPUT, throttle: 1 }, 14);
    expect(ontoVerge.state.surface).toBe('grass');

    const intoWall = run(ontoVerge.state, { ...NO_INPUT, throttle: 1 }, 45);
    const maxOffset = miniLoop.roadWidth / 2 + miniLoop.vergeWidth - CAR_TUNING.width / 2;
    const projection = projectOntoTrack(miniLoop, intoWall.state.car.position);

    expect(projection.distance).toBeLessThanOrEqual(maxOffset + 1e-4);
    expect(intoWall.events.some((event) => event.type === 'wall-hit')).toBe(true);
  });

  it('ignores the finish line until all prior checkpoints are crossed in order', () => {
    const acrossStart = run(createGame(miniLoop), { ...NO_INPUT, throttle: 1 }, 60);
    expect(acrossStart.state.completedLaps).toBe(0);
    expect(acrossStart.state.nextCheckpoint).toBe(0);

    const atCheckpoint0: GameState = {
      ...createGame(miniLoop),
      car: {
        ...createGame(miniLoop).car,
        position: { x: -2, z: -20 },
        heading: Math.PI / 2,
      },
    };
    const reversed = run(atCheckpoint0, { ...NO_INPUT, brake: 1 }, 60);
    expect(reversed.state.nextCheckpoint).toBe(0);
  });

  it('records lap count, last lap and best lap when all checkpoints are crossed', () => {
    const finishReady: GameState = {
      ...createGame(miniLoop),
      currentLapSeconds: 14.5,
      nextCheckpoint: 2,
    };
    const lapOne = run(finishReady, { ...NO_INPUT, throttle: 1 }, 60);
    expect(lapOne.state.completedLaps).toBe(1);
    expect(lapOne.state.nextCheckpoint).toBe(0);
    expect(lapOne.state.lastLapSeconds).not.toBeNull();
    expect(lapOne.state.bestLapSeconds).toBe(lapOne.state.lastLapSeconds);
    expect(lapOne.events.some((event) => event.type === 'lap' && event.lap === 1)).toBe(true);

    const fasterFinish: GameState = {
      ...lapOne.state,
      car: createGame(miniLoop).car,
      currentLapSeconds: 11.2,
      nextCheckpoint: 2,
    };
    const lapTwo = run(fasterFinish, { ...NO_INPUT, throttle: 1 }, 60);
    expect(lapTwo.state.completedLaps).toBe(2);
    expect(lapTwo.state.bestLapSeconds).toBeLessThan(lapOne.state.bestLapSeconds ?? 0);
  });
});

describe('Club Circuit', () => {
  it('places the starting grid cleanly on tarmac and includes both left and right corners', () => {
    const projection = projectOntoTrack(clubCircuit, clubCircuit.spawn.position);
    expect(projection.distance).toBeLessThan(0.1);
    expect(clubCircuit.curvatures.some((k) => k > 0.01)).toBe(true);
    expect(clubCircuit.curvatures.some((k) => k < -0.01)).toBe(true);
  });

  it('can be lapped cleanly by the bot using only player inputs', () => {
    const bot = createBot(clubCircuit);
    let state = createGame(clubCircuit);
    const events: GameEvent[] = [];
    const maxSteps = 60 * 90;

    for (let i = 0; i < maxSteps && state.completedLaps < 2; i++) {
      const step = stepGame(state, bot(state), dt, clubCircuit);
      state = step.state;
      events.push(...step.events);
    }

    expect(state.completedLaps).toBe(2);
    expect(state.bestLapSeconds).not.toBeNull();
    expect(state.bestLapSeconds ?? 999).toBeLessThan(35);
    expect(events.filter((e) => e.type === 'wall-hit')).toHaveLength(0);
    expect(events.some((e) => e.type === 'gear-shift')).toBe(true);
  });
});
