import { createBot } from './bot';
import { createCar, NO_INPUT, stepCar } from './car';
import type { CarSpec } from './cars';
import { SIM_STEP_SECONDS } from './fixedLoop';
import { createGame, stepGame } from './game';
import type { Track } from './track';

/** What a car does in this simulation, measured by running it. Not real-world figures. */
export interface CarEstimates {
  readonly zeroTo100Seconds: number;
  readonly topSpeedKmh: number;
  /** Standing-start lap by the scripted driver, or null if it did not finish one. */
  readonly botLapSeconds: number | null;
}

export function estimateCar(car: CarSpec, track: Track): CarEstimates {
  const dt = SIM_STEP_SECONDS;
  let state = createCar(car, { position: { x: 0, z: 0 }, heading: 0 });
  let zeroTo100Seconds = Number.POSITIVE_INFINITY;
  for (let i = 1; i <= 60 * 60; i++) {
    state = stepCar(car, state, { ...NO_INPUT, throttle: 1 }, dt);
    if (zeroTo100Seconds === Number.POSITIVE_INFINITY && state.speed >= 100 / 3.6) {
      zeroTo100Seconds = i * dt;
    }
  }
  const bot = createBot(track, car);
  let game = createGame(track, car);
  for (let i = 0; i < 60 * 120 && game.completedLaps < 1; i++) {
    game = stepGame(game, bot(game), dt, track, car).state;
  }
  return { zeroTo100Seconds, topSpeedKmh: state.speed * 3.6, botLapSeconds: game.lastLapSeconds };
}
