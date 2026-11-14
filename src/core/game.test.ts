import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import { NO_INPUT } from './car';
import { CARS, STARTER_CAR_ID } from './cars';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameEvent, GameInput, GameState } from './game';
import { createGame, stepGame } from './game';
import type { Track } from './track';
import { analyseTrackWaypoints, gateAcrossTrack, projectOntoTrack } from './track';
import { clubCircuit } from './tracks/clubCircuit';

const dt = SIM_STEP_SECONDS;
const car = CARS[STARTER_CAR_ID];
const newGame = (track: Track) => createGame(track, car);

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
    const result = stepGame(current, input, dt, track, car);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

describe('stepGame barriers, surfaces and checkpoints', () => {
  it('detects grass run-off before confining the car at the outer guardrail', () => {
    const start: GameState = {
      ...newGame(miniLoop),
      car: {
        ...newGame(miniLoop).car,
        heading: -Math.PI / 2, // Aim across the grass verge toward the outer east guardrail.
      },
    };
    const seen: string[] = [];
    let state = start;
    const events: GameEvent[] = [];
    for (let i = 0; i < 240; i++) {
      const step = run(state, { ...NO_INPUT, throttle: 1 }, 1);
      state = step.state;
      events.push(...step.events);
      if (seen[seen.length - 1] !== state.surface) seen.push(state.surface);
    }
    expect(seen.slice(0, 3)).toEqual(['tarmac', 'kerb', 'grass']);
    const intoWall = { state, events };
    const maxOffset = miniLoop.roadWidth / 2 + miniLoop.vergeWidth - car.real.width / 2;
    const projection = projectOntoTrack(miniLoop, intoWall.state.car.position);

    expect(projection.distance).toBeLessThanOrEqual(maxOffset + 1e-4);
    expect(intoWall.events.some((event) => event.type === 'wall-hit')).toBe(true);
  });

  it('ignores the finish line until all prior checkpoints are crossed in order', () => {
    const acrossStart = run(newGame(miniLoop), { ...NO_INPUT, throttle: 1 }, 60);
    expect(acrossStart.state.completedLaps).toBe(0);
    expect(acrossStart.state.nextCheckpoint).toBe(0);

    const atCheckpoint0: GameState = {
      ...newGame(miniLoop),
      car: {
        ...newGame(miniLoop).car,
        position: { x: -2, z: -20 },
        heading: Math.PI / 2,
      },
    };
    const reversed = run(atCheckpoint0, { ...NO_INPUT, brake: 1 }, 60);
    expect(reversed.state.nextCheckpoint).toBe(0);
  });

  it('records lap count, last lap and best lap when all checkpoints are crossed', () => {
    const finishReady: GameState = {
      ...newGame(miniLoop),
      currentLapSeconds: 14.5,
      nextCheckpoint: 2,
    };
    const lapOne = run(finishReady, { ...NO_INPUT, throttle: 1 }, 60);
    expect(lapOne.state.completedLaps).toBe(1);
    expect(lapOne.state.nextCheckpoint).toBe(0);
    expect(lapOne.state.lastLapSeconds).not.toBeNull();
    expect(lapOne.state.bestLapSeconds).toBe(lapOne.state.lastLapSeconds);
    expect(lapOne.state.lastLapDeltaSeconds).toBeNull();
    expect(lapOne.state.lapHistory).toHaveLength(1);
    expect(
      lapOne.events.some((event) => event.type === 'lap' && event.lap === 1 && event.isNewBest),
    ).toBe(true);

    const fasterFinish: GameState = {
      ...lapOne.state,
      car: newGame(miniLoop).car,
      currentLapSeconds: 11.2,
      nextCheckpoint: 2,
    };
    const lapTwo = run(fasterFinish, { ...NO_INPUT, throttle: 1 }, 60);
    expect(lapTwo.state.completedLaps).toBe(2);
    expect(lapTwo.state.bestLapSeconds).toBeLessThan(lapOne.state.bestLapSeconds ?? 0);
    expect(lapTwo.state.lastLapDeltaSeconds).toBeLessThan(0);
    expect(lapTwo.state.lapHistory).toHaveLength(2);
  });

  it('tracks sector splits in order, computes checkpoint deltas, and resets splits on new lap', () => {
    // Cross checkpoint 0 moving west along the north straight.
    const beforeCp0: GameState = {
      ...newGame(miniLoop),
      car: {
        ...newGame(miniLoop).car,
        position: { x: 4, z: -20 },
        heading: Math.PI / 2,
      },
      currentLapSeconds: 5,
      currentSectorStartSeconds: 0,
      nextCheckpoint: 0,
    };
    const afterCp0 = run(beforeCp0, { ...NO_INPUT, throttle: 1 }, 60);
    const cp0Event = afterCp0.events.find((e) => e.type === 'checkpoint');
    expect(cp0Event).toBeDefined();
    expect(afterCp0.state.nextCheckpoint).toBe(1);
    expect(afterCp0.state.currentSectors[0]).not.toBeNull();
    expect(afterCp0.state.currentSectors[1]).toBeNull();
    expect(afterCp0.state.bestSectors[0]).toBe(afterCp0.state.currentSectors[0]);
    expect(afterCp0.state.lastCheckpointDeltaSeconds).toBeNull();

    // Cross checkpoint 1 moving east along the south straight.
    const beforeCp1: GameState = {
      ...afterCp0.state,
      car: {
        ...newGame(miniLoop).car,
        position: { x: -4, z: 20 },
        heading: -Math.PI / 2,
      },
      currentLapSeconds: 11,
    };
    const afterCp1 = run(beforeCp1, { ...NO_INPUT, throttle: 1 }, 60);
    expect(afterCp1.state.nextCheckpoint).toBe(2);
    expect(afterCp1.state.currentSectors[1]).not.toBeNull();

    // Finish lap 1, establishing bestLapSplits for lap 2 comparison.
    const beforeFinish: GameState = {
      ...afterCp1.state,
      car: newGame(miniLoop).car,
      currentLapSeconds: 16,
    };
    const lapOneDone = run(beforeFinish, { ...NO_INPUT, throttle: 1 }, 60);
    expect(lapOneDone.state.completedLaps).toBe(1);
    expect(lapOneDone.state.currentSectors).toEqual([null, null]);
    expect(lapOneDone.state.bestLapSplits[0]).not.toBeNull();
    expect(lapOneDone.state.bestLapSplits[1]).not.toBeNull();

    // On lap 2, cross checkpoint 0 faster than lap 1 and verify negative delta.
    const lapTwoFasterCp0: GameState = {
      ...lapOneDone.state,
      car: {
        ...newGame(miniLoop).car,
        position: { x: 4, z: -20 },
        heading: Math.PI / 2,
      },
      currentLapSeconds: 3,
      currentSectorStartSeconds: 0,
      nextCheckpoint: 0,
    };
    const afterLapTwoCp0 = run(lapTwoFasterCp0, { ...NO_INPUT, throttle: 1 }, 60);
    expect(afterLapTwoCp0.state.lastCheckpointDeltaSeconds).toBeLessThan(0);
    expect(afterLapTwoCp0.state.bestSectors[0]).toBe(afterLapTwoCp0.state.currentSectors[0]);
  });

  it('counts barrier contacts per lap and clears the count at the finish line', () => {
    const scuffed: GameState = {
      ...newGame(miniLoop),
      currentLapSeconds: 14.5,
      nextCheckpoint: 2,
      lapWallHits: 2,
    };
    const lap = run(scuffed, { ...NO_INPUT, throttle: 1 }, 60);
    const event = lap.events.find((e) => e.type === 'lap');
    expect(event?.type === 'lap' && event.wallHits).toBe(2);
    expect(lap.state.lapHistory[0]?.wallHits).toBe(2);
    expect(lap.state.lapWallHits).toBe(0);
  });

  it('accumulates odometer distanceMetres strictly while moving', () => {
    const parked = run(newGame(miniLoop), NO_INPUT, 30);
    expect(parked.state.distanceMetres).toBe(0);

    const driven = run(newGame(miniLoop), { ...NO_INPUT, throttle: 1 }, 120);
    expect(driven.state.distanceMetres).toBeGreaterThan(15);
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
    const bot = createBot(clubCircuit, car);
    let state = createGame(clubCircuit, car);
    const events: GameEvent[] = [];
    const maxSteps = 60 * 90;

    for (let i = 0; i < maxSteps && state.completedLaps < 2; i++) {
      const step = stepGame(state, bot(state), dt, clubCircuit, car);
      state = step.state;
      events.push(...step.events);
    }

    expect(state.completedLaps).toBe(2);
    expect(state.bestLapSeconds).not.toBeNull();
    expect(state.bestLapSeconds ?? 999).toBeLessThan(35);
    expect(state.currentSectors).toHaveLength(3);
    expect(state.bestSectors.every((s) => s !== null && s > 0)).toBe(true);
    expect(state.distanceMetres).toBeGreaterThan(1000);
    expect(events.filter((e) => e.type === 'wall-hit')).toHaveLength(0);
    expect(events.some((e) => e.type === 'gear-shift')).toBe(true);
  });
});
