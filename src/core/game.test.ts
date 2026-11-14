import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import { CAR_TUNING, NO_INPUT } from './car';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameEvent, GameInput, GameState } from './game';
import { createGame, stepGame } from './game';
import type { Track } from './track';
import { gateAcrossTrack, projectOntoTrack } from './track';
import { testCircuit } from './tracks/testCircuit';

const dt = SIM_STEP_SECONDS;

/** Compact rectangular loop for fast rule tests. */
const miniLoop: Track = {
  name: 'Mini Loop',
  roadWidth: 10,
  waypoints: [
    { x: 20, z: 0 },
    { x: 20, z: -20 },
    { x: -20, z: -20 },
    { x: -20, z: 20 },
    { x: 20, z: 20 },
  ],
  spawn: { position: { x: 20, z: 4 }, heading: 0 },
  checkpoints: [
    gateAcrossTrack({ x: 0, z: -20 }, Math.PI / 2, 10),
    gateAcrossTrack({ x: 0, z: 20 }, -Math.PI / 2, 10),
    gateAcrossTrack({ x: 20, z: 0 }, 0, 10),
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

describe('stepGame barriers and checkpoints', () => {
  it('keeps the car within the road barriers and emits a wall-hit event', () => {
    const start: GameState = {
      ...createGame(miniLoop),
      car: {
        ...createGame(miniLoop).car,
        heading: -Math.PI / 2, // Aim straight at the outer east barrier.
      },
    };
    const { state, events } = run(start, { ...NO_INPUT, throttle: 1 }, 90);
    const maxOffset = miniLoop.roadWidth / 2 - CAR_TUNING.width / 2;
    const projection = projectOntoTrack(miniLoop, state.car.position);

    expect(projection.distance).toBeLessThanOrEqual(maxOffset + 1e-4);
    expect(events.some((event) => event.type === 'wall-hit')).toBe(true);
  });

  it('ignores the finish line until all prior checkpoints are crossed in order', () => {
    // Drive straight across the start/finish line at launch without hitting checkpoint 0 or 1.
    const acrossStart = run(createGame(miniLoop), { ...NO_INPUT, throttle: 1 }, 60);
    expect(acrossStart.state.completedLaps).toBe(0);
    expect(acrossStart.state.nextCheckpoint).toBe(0);

    // Reversing over a checkpoint gate does not count either.
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

describe('Test Circuit', () => {
  it('places the starting grid cleanly on the road', () => {
    const projection = projectOntoTrack(testCircuit, testCircuit.spawn.position);
    expect(projection.distance).toBeLessThan(0.1);
  });

  it('can be lapped cleanly by the bot using only player inputs', () => {
    const bot = createBot(testCircuit);
    let state = createGame(testCircuit);
    const events: GameEvent[] = [];
    const maxSteps = 60 * 60;

    for (let i = 0; i < maxSteps && state.completedLaps < 2; i++) {
      const step = stepGame(state, bot(state), dt, testCircuit);
      state = step.state;
      events.push(...step.events);
    }

    expect(state.completedLaps).toBe(2);
    expect(state.bestLapSeconds).not.toBeNull();
    expect(state.bestLapSeconds ?? 999).toBeLessThan(30);
    expect(events.filter((e) => e.type === 'wall-hit')).toHaveLength(0);
  });
});
