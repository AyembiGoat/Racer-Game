import type { CarInput, CarState, DrivingSurface } from './car';
import { CAR_TUNING, createCar, stepCar } from './car';
import type { GameEvent, ShiftDirection } from './game';
import type { Vec2 } from './vec';
import { distance2, dot2, headingForward, lerp2, scale2, sub2, wrapAngle } from './vec';
import type { OpenWorldRuntime } from './world/build';
import { sweptCarAabb } from './world/collision';
import { clampToBounds, collidersNear, surfaceAt } from './world/query';
import type { Aabb, CarContact, Collider } from './world/types';
import { carColliderContact, carObb } from './world/collision';

/** Free-roam simulation state. Deliberately has no laps, sectors or checkpoints. */
export interface OpenWorldState {
  readonly car: CarState;
  readonly surface: DrivingSurface;
  readonly elapsedSeconds: number;
  readonly distanceMetres: number;
}

export interface OpenWorldStepResult {
  readonly state: OpenWorldState;
  readonly events: GameEvent[];
  /** Deepest contact resolved during the step, or null when the car was free. */
  readonly contact: CarContact | null;
  /** Broad-phase candidates tested for this step, for inspection and tests. */
  readonly candidateCount: number;
}

export function createOpenWorldState(runtime: OpenWorldRuntime): OpenWorldState {
  return {
    car: createCar(runtime.spec.spawn),
    surface: surfaceAt(runtime, runtime.spec.spawn.position, CAR_TUNING.width / 2),
    elapsedSeconds: 0,
    distanceMetres: 0,
  };
}

function deepestOverlap(
  candidates: readonly Collider[],
  position: Vec2,
  heading: number,
): CarContact | null {
  const car = carObb(position, heading);
  let deepest: CarContact | null = null;
  for (const collider of candidates) {
    const contact = carColliderContact(car, collider);
    if (contact && (!deepest || contact.depth > deepest.depth)) deepest = contact;
  }
  return deepest;
}

const MAX_SUBSTEP_METRES = 0.22;
const MAX_SUBSTEPS = 16;
const RESOLVE_PASSES = 4;
const POSITION_SLOP = 0.004;

/**
 * Advance free-roam simulation by one fixed step.
 *
 * Collision uses a swept footprint in short substeps so thin fences and rails
 * cannot be tunnelled at top speed. Contacts are resolved with minimum
 * translation, inward velocity is removed, and tangential motion is scrubbed
 * gently like a guardrail scrape.
 */
export function stepOpenWorld(
  state: OpenWorldState,
  input: CarInput,
  dt: number,
  runtime: OpenWorldRuntime,
): OpenWorldStepResult {
  const events: GameEvent[] = [];
  const prevPosition = state.car.position;
  const prevGear = state.car.gear;
  const stepped = stepCar(state.car, input, dt, state.surface);

  let velocity = stepped.velocity;
  let position = prevPosition;
  const target = stepped.position;
  const motion = distance2(prevPosition, target);

  const sweptAabb: Aabb = (() => {
    const swept = sweptCarAabb(prevPosition, target, stepped.heading);
    const padding = 0.9;
    return {
      minX: swept.minX - padding,
      maxX: swept.maxX + padding,
      minZ: swept.minZ - padding,
      maxZ: swept.maxZ + padding,
    };
  })();
  const candidates = collidersNear(runtime, sweptAabb);
  const substeps = Math.max(1, Math.min(MAX_SUBSTEPS, Math.ceil(motion / MAX_SUBSTEP_METRES)));
  let contact: CarContact | null = null;
  let strongestImpact = 0;
  let lastNormal: Vec2 | null = null;
  let scrubbed = false;

  for (let substep = 1; substep <= substeps; substep++) {
    const targetPoint = lerp2(prevPosition, target, substep / substeps);
    let point = targetPoint;
    for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
      const hit = deepestOverlap(candidates, point, stepped.heading);
      if (!hit) break;
      if (!contact || hit.depth > contact.depth) contact = hit;
      point = {
        x: point.x + hit.normal.x * (hit.depth + POSITION_SLOP),
        z: point.z + hit.normal.z * (hit.depth + POSITION_SLOP),
      };
      const normalSpeed = dot2(velocity, hit.normal);
      if (normalSpeed < 0) {
        strongestImpact = Math.max(strongestImpact, -normalSpeed);
        lastNormal = hit.normal;
        // Remove the inward component with a very small arcade rebound.
        const restitution = -normalSpeed > 10 ? 0.07 : 0;
        velocity = sub2(velocity, scale2(hit.normal, normalSpeed * (1 + restitution)));
      }
      if (!scrubbed) {
        scrubbed = true;
        const along = dot2(velocity, hit.normal);
        const tangent = sub2(velocity, scale2(hit.normal, along));
        velocity = {
          x: tangent.x * 0.92 + hit.normal.x * along,
          z: tangent.z * 0.92 + hit.normal.z * along,
        };
      }
    }
    // Keep the displacement consistent with the resolved path.
    position = point;
  }

  position = clampToBounds(runtime, position);

  // A shallow impact against a rail should deflect the nose along the barrier
  // rather than pin the car with its wheels turned into the wall. Head-on hits
  // (where the normal speed dominates) are left alone.
  let heading = stepped.heading;
  let yawRate = contact ? stepped.yawRate * 0.7 : stepped.yawRate;
  if (lastNormal && contact && strongestImpact > 0.5) {
    const tangent = { x: -lastNormal.z, z: lastNormal.x };
    const along = dot2(velocity, tangent);
    const tangentialSpeed = Math.abs(along);
    if (tangentialSpeed > 3 && tangentialSpeed > strongestImpact * 1.2) {
      const tangentDir = along >= 0 ? tangent : { x: -tangent.x, z: -tangent.z };
      const targetHeading = Math.atan2(-tangentDir.x, -tangentDir.z);
      let delta = targetHeading - heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const maxTurn = 3.2 * dt;
      const turn = Math.max(-maxTurn, Math.min(maxTurn, delta));
      heading = wrapAngle(heading + turn);
      yawRate = turn / dt;
    }
  }

  const forward = headingForward(heading);
  const speed = dot2(velocity, forward);
  const car: CarState = {
    ...stepped,
    position,
    heading,
    velocity,
    speed,
    yawRate,
  };

  if (car.gear !== prevGear) {
    const direction: ShiftDirection =
      car.gear < 0 ? 'reverse' : car.gear > prevGear ? 'up' : 'down';
    events.push({ type: 'gear-shift', gear: car.gear, direction });
  }
  if (strongestImpact > 1.2) {
    events.push({ type: 'wall-hit', impactSpeed: strongestImpact });
  }

  const surface = surfaceAt(runtime, position, CAR_TUNING.width / 2);
  return {
    state: {
      car,
      surface,
      elapsedSeconds: state.elapsedSeconds + dt,
      distanceMetres: state.distanceMetres + distance2(prevPosition, position),
    },
    events,
    contact,
    candidateCount: candidates.length,
  };
}

/** Free-roam reset. Never touches lap or checkpoint state because none exists. */
export function resetOpenWorld(runtime: OpenWorldRuntime): OpenWorldState {
  return createOpenWorldState(runtime);
}

/** Move to an authored clear recovery point (used by tests and inspection). */
export function atRecoveryPoint(runtime: OpenWorldRuntime, recoveryId: string): OpenWorldState {
  const point = runtime.spec.recoveryPoints.find((entry) => entry.id === recoveryId);
  if (!point) throw new Error(`Unknown recovery point ${recoveryId}`);
  return {
    car: createCar(point),
    surface: surfaceAt(runtime, point.position, CAR_TUNING.width / 2),
    elapsedSeconds: 0,
    distanceMetres: 0,
  };
}
