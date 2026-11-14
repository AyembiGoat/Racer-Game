import type { CarInput, CarState } from './car';
import { CAR_TUNING, createCar, stepCar } from './car';
import type { Track } from './track';
import { projectOntoTrack } from './track';
import { add2, dot2, forwardGateCrossing, headingForward, scale2, sub2 } from './vec';

export type GameInput = CarInput;

export type GameEvent =
  | { readonly type: 'checkpoint'; readonly index: number }
  | { readonly type: 'lap'; readonly lap: number; readonly timeSeconds: number }
  | { readonly type: 'wall-hit'; readonly impactSpeed: number };

export interface GameState {
  readonly car: CarState;
  readonly elapsedSeconds: number;
  readonly currentLapSeconds: number;
  readonly completedLaps: number;
  readonly nextCheckpoint: number;
  readonly lastLapSeconds: number | null;
  readonly bestLapSeconds: number | null;
}

export function createGame(track: Track): GameState {
  return {
    car: createCar(track.spawn),
    elapsedSeconds: 0,
    currentLapSeconds: 0,
    completedLaps: 0,
    nextCheckpoint: 0,
    lastLapSeconds: null,
    bestLapSeconds: null,
  };
}

function confineToBarriers(car: CarState, track: Track, events: GameEvent[]): CarState {
  const maxOffset = Math.max(0.5, track.roadWidth / 2 - CAR_TUNING.width / 2);
  const projection = projectOntoTrack(track, car.position);
  if (projection.distance <= maxOffset || projection.distance < 1e-6) {
    return car;
  }

  const offset = sub2(car.position, projection.point);
  const outward = scale2(offset, 1 / projection.distance);
  const clampedPosition = add2(projection.point, scale2(outward, maxOffset));

  const outwardSpeed = dot2(car.velocity, outward);
  let velocity = car.velocity;
  if (outwardSpeed > 0) {
    // Remove velocity into the barrier and scrub speed proportionally to impact angle.
    const tangentVelocity = sub2(velocity, scale2(outward, outwardSpeed));
    const scrub = Math.max(0.55, 1 - 0.35 * (outwardSpeed / CAR_TUNING.maxSpeed));
    velocity = scale2(tangentVelocity, scrub);
    if (outwardSpeed > 1.2) {
      events.push({ type: 'wall-hit', impactSpeed: outwardSpeed });
    }
  }

  const speed = dot2(velocity, headingForward(car.heading));
  return {
    ...car,
    position: clampedPosition,
    velocity,
    speed,
  };
}

export function stepGame(
  state: GameState,
  input: GameInput,
  dt: number,
  track: Track,
): { readonly state: GameState; readonly events: GameEvent[] } {
  const events: GameEvent[] = [];
  const prevPosition = state.car.position;
  const steppedCar = stepCar(state.car, input, dt);
  const car = confineToBarriers(steppedCar, track, events);

  let currentLapSeconds = state.currentLapSeconds + dt;
  let completedLaps = state.completedLaps;
  let nextCheckpoint = state.nextCheckpoint;
  let lastLapSeconds = state.lastLapSeconds;
  let bestLapSeconds = state.bestLapSeconds;

  const checkpoint = track.checkpoints[nextCheckpoint];
  if (checkpoint) {
    const hitFraction = forwardGateCrossing(
      prevPosition,
      car.position,
      checkpoint.left,
      checkpoint.right,
    );
    if (hitFraction !== null) {
      const isFinishLine = nextCheckpoint === track.checkpoints.length - 1;
      if (!isFinishLine) {
        events.push({ type: 'checkpoint', index: nextCheckpoint });
        nextCheckpoint += 1;
      } else {
        const lapTime = state.currentLapSeconds + dt * hitFraction;
        completedLaps += 1;
        lastLapSeconds = lapTime;
        bestLapSeconds = bestLapSeconds === null ? lapTime : Math.min(bestLapSeconds, lapTime);
        currentLapSeconds = dt * (1 - hitFraction);
        nextCheckpoint = 0;
        events.push({ type: 'lap', lap: completedLaps, timeSeconds: lapTime });
      }
    }
  }

  return {
    state: {
      car,
      elapsedSeconds: state.elapsedSeconds + dt,
      currentLapSeconds,
      completedLaps,
      nextCheckpoint,
      lastLapSeconds,
      bestLapSeconds,
    },
    events,
  };
}
