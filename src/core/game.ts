import type { CarInput, CarState, DrivingSurface } from './car';
import { createCar, stepCar } from './car';
import type { CarId, CarSpec } from './cars';
import type { Track } from './track';
import { projectOntoTrack, surfaceAtProjection } from './track';
import { add2, distance2, dot2, forwardGateCrossing, headingForward, scale2, sub2 } from './vec';

export type GameInput = CarInput;

export type ShiftDirection = 'up' | 'down' | 'reverse';

export type GameEvent =
  | {
      readonly type: 'checkpoint';
      readonly index: number;
      readonly splitSeconds: number;
      readonly sectorSeconds: number;
      readonly deltaSeconds: number | null;
    }
  | {
      readonly type: 'lap';
      readonly lap: number;
      readonly timeSeconds: number;
      readonly deltaSeconds: number | null;
      readonly isNewBest: boolean;
      readonly sectors: readonly (number | null)[];
      /** Barrier contacts between this lap's start and finish. */
      readonly wallHits: number;
    }
  | { readonly type: 'wall-hit'; readonly impactSpeed: number }
  | { readonly type: 'gear-shift'; readonly gear: number; readonly direction: ShiftDirection };

export interface LapRecord {
  readonly lap: number;
  readonly timeSeconds: number;
  readonly deltaSeconds: number | null;
  readonly isNewBest: boolean;
  readonly sectors: readonly (number | null)[];
  readonly wallHits: number;
}

export interface GameState {
  readonly carId: CarId;
  readonly car: CarState;
  readonly surface: DrivingSurface;
  readonly elapsedSeconds: number;
  readonly distanceMetres: number;
  readonly currentLapSeconds: number;
  readonly currentSectorStartSeconds: number;
  readonly completedLaps: number;
  readonly nextCheckpoint: number;
  readonly currentSplits: readonly (number | null)[];
  readonly currentSectors: readonly (number | null)[];
  readonly bestLapSplits: readonly (number | null)[];
  readonly bestSectors: readonly (number | null)[];
  readonly lastCheckpointDeltaSeconds: number | null;
  readonly lastLapDeltaSeconds: number | null;
  readonly lastLapSeconds: number | null;
  readonly bestLapSeconds: number | null;
  readonly lapHistory: readonly LapRecord[];
  /** Barrier contacts so far in the lap being driven. */
  readonly lapWallHits: number;
}

function emptySectorArray(track: Track): (number | null)[] {
  const sectorCount = Math.max(0, track.checkpoints.length - 1);
  return Array.from({ length: sectorCount }, () => null);
}

export function createGame(track: Track, car: CarSpec): GameState {
  const empty = emptySectorArray(track);
  return {
    carId: car.id,
    car: createCar(car, track.spawn),
    surface: 'tarmac',
    elapsedSeconds: 0,
    distanceMetres: 0,
    currentLapSeconds: 0,
    currentSectorStartSeconds: 0,
    completedLaps: 0,
    nextCheckpoint: 0,
    currentSplits: empty,
    currentSectors: empty,
    bestLapSplits: empty,
    bestSectors: empty,
    lastCheckpointDeltaSeconds: null,
    lastLapDeltaSeconds: null,
    lastLapSeconds: null,
    bestLapSeconds: null,
    lapHistory: [],
    lapWallHits: 0,
  };
}

function confineToBarriers(
  spec: CarSpec,
  car: CarState,
  track: Track,
  events: GameEvent[],
): { readonly car: CarState; readonly surface: DrivingSurface } {
  const halfCorridor = track.roadWidth / 2 + track.vergeWidth;
  const maxOffset = Math.max(0.5, halfCorridor - spec.real.width / 2);
  const projection = projectOntoTrack(track, car.position);
  const surface = surfaceAtProjection(track, projection, spec.real.width / 2);

  if (projection.distance <= maxOffset || projection.distance < 1e-6) {
    return { car, surface };
  }

  const offset = sub2(car.position, projection.point);
  const outward = scale2(offset, 1 / projection.distance);
  const clampedPosition = add2(projection.point, scale2(outward, maxOffset));

  const outwardSpeed = dot2(car.velocity, outward);
  let velocity = car.velocity;
  if (outwardSpeed > 0) {
    // Slide along the steel guardrail while scrubbing speed according to impact angle.
    const tangentVelocity = sub2(velocity, scale2(outward, outwardSpeed));
    const scrub = Math.max(0.58, 1 - 0.32 * (outwardSpeed / spec.sim.maxSpeed));
    velocity = scale2(tangentVelocity, scrub);
    if (outwardSpeed > 1.2) {
      events.push({ type: 'wall-hit', impactSpeed: outwardSpeed });
    }
  }

  const speed = dot2(velocity, headingForward(car.heading));
  return {
    car: {
      ...car,
      position: clampedPosition,
      velocity,
      speed,
    },
    surface,
  };
}

export function stepGame(
  state: GameState,
  input: GameInput,
  dt: number,
  track: Track,
  spec: CarSpec,
): { readonly state: GameState; readonly events: GameEvent[] } {
  const events: GameEvent[] = [];
  const prevPosition = state.car.position;
  const prevGear = state.car.gear;
  const steppedCar = stepCar(spec, state.car, input, dt, state.surface);
  const { car, surface } = confineToBarriers(spec, steppedCar, track, events);
  let lapWallHits = state.lapWallHits + events.filter((event) => event.type === 'wall-hit').length;

  if (car.gear !== prevGear) {
    const direction: ShiftDirection =
      car.gear < 0 ? 'reverse' : car.gear > prevGear ? 'up' : 'down';
    events.push({ type: 'gear-shift', gear: car.gear, direction });
  }

  const distanceMetres = state.distanceMetres + distance2(prevPosition, car.position);

  let currentLapSeconds = state.currentLapSeconds + dt;
  let currentSectorStartSeconds = state.currentSectorStartSeconds;
  let completedLaps = state.completedLaps;
  let nextCheckpoint = state.nextCheckpoint;
  let currentSplits = state.currentSplits;
  let currentSectors = state.currentSectors;
  let bestLapSplits = state.bestLapSplits;
  let bestSectors = state.bestSectors;
  let lastCheckpointDeltaSeconds = state.lastCheckpointDeltaSeconds;
  let lastLapDeltaSeconds = state.lastLapDeltaSeconds;
  let lastLapSeconds = state.lastLapSeconds;
  let bestLapSeconds = state.bestLapSeconds;
  let lapHistory = state.lapHistory;

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
      const crossingTime = state.currentLapSeconds + dt * hitFraction;
      if (!isFinishLine) {
        const sectorIndex = nextCheckpoint;
        const sectorSeconds = Math.max(0, crossingTime - currentSectorStartSeconds);
        const refSplit = bestLapSplits[sectorIndex] ?? null;
        const deltaSeconds = refSplit !== null ? crossingTime - refSplit : null;

        const nextSplits = [...currentSplits];
        nextSplits[sectorIndex] = crossingTime;
        currentSplits = nextSplits;

        const nextSectors = [...currentSectors];
        nextSectors[sectorIndex] = sectorSeconds;
        currentSectors = nextSectors;

        const nextBestSectors = [...bestSectors];
        const prevBestSector = nextBestSectors[sectorIndex] ?? null;
        if (prevBestSector === null || sectorSeconds < prevBestSector) {
          nextBestSectors[sectorIndex] = sectorSeconds;
          bestSectors = nextBestSectors;
        }

        currentSectorStartSeconds = crossingTime;
        lastCheckpointDeltaSeconds = deltaSeconds;

        events.push({
          type: 'checkpoint',
          index: sectorIndex,
          splitSeconds: crossingTime,
          sectorSeconds,
          deltaSeconds,
        });
        nextCheckpoint += 1;
      } else {
        const lapTime = crossingTime;
        const deltaSeconds = bestLapSeconds !== null ? lapTime - bestLapSeconds : null;
        const isNewBest = bestLapSeconds === null || lapTime < bestLapSeconds;

        completedLaps += 1;
        lastLapSeconds = lapTime;
        lastLapDeltaSeconds = deltaSeconds;
        lastCheckpointDeltaSeconds = null;

        if (isNewBest) {
          bestLapSeconds = lapTime;
          bestLapSplits = currentSplits;
        }

        const record: LapRecord = {
          lap: completedLaps,
          timeSeconds: lapTime,
          deltaSeconds,
          isNewBest,
          sectors: currentSectors,
          wallHits: lapWallHits,
        };
        lapHistory = [...lapHistory, record];

        currentLapSeconds = dt * (1 - hitFraction);
        currentSectorStartSeconds = 0;
        currentSplits = emptySectorArray(track);
        currentSectors = emptySectorArray(track);
        nextCheckpoint = 0;

        events.push({
          type: 'lap',
          lap: completedLaps,
          timeSeconds: lapTime,
          deltaSeconds,
          isNewBest,
          sectors: record.sectors,
          wallHits: lapWallHits,
        });
        lapWallHits = 0;
      }
    }
  }

  return {
    state: {
      carId: state.carId,
      car,
      surface,
      elapsedSeconds: state.elapsedSeconds + dt,
      distanceMetres,
      currentLapSeconds,
      currentSectorStartSeconds,
      completedLaps,
      nextCheckpoint,
      currentSplits,
      currentSectors,
      bestLapSplits,
      bestSectors,
      lastCheckpointDeltaSeconds,
      lastLapDeltaSeconds,
      lastLapSeconds,
      bestLapSeconds,
      lapHistory,
      lapWallHits,
    },
    events,
  };
}
