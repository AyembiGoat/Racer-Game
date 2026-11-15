import type { CarInput } from './car';
import { driveDemand, steerLockAt } from './car';
import type { CarSpec } from './cars';
import type { GameState } from './game';
import type { Track } from './track';
import { pointAheadOnTrack, projectOntoTrack } from './track';
import { angleDelta, clamp, headingTo } from './vec';

/** How much of the car's grip and brakes the bot plans with. */
export const BOT_MARGIN = {
  cornerGrip: 0.66,
  brake: 0.6,
} as const;

/**
 * Scripted driver that uses only the standard player inputs (`CarInput`).
 * Follows a speed-scaled lookahead point along the track centreline, brakes for the
 * corner speed the car's own grip allows, and feeds in throttle within its traction.
 */
export function createBot(track: Track, car: CarSpec): (state: GameState) => CarInput {
  const { sim } = car;
  return (state) => {
    const speed = state.car.speed;
    const projection = projectOntoTrack(track, state.car.position);

    const steerLookahead = clamp(9.5 + Math.max(0, speed) * 0.38, 9.5, 23);
    const targetPoint = pointAheadOnTrack(track, projection, steerLookahead);
    const desiredHeading = headingTo(state.car.position, targetPoint);
    const headingError = angleDelta(state.car.heading, desiredHeading);
    const steer = clamp(-headingError / Math.max(0.14, steerLockAt(car, speed)), -1, 1);

    // Scan upcoming curvature along the braking horizon to compute safe entry speeds.
    let lowestAllowedSpeed: number = sim.maxSpeed;
    const horizon = Math.max(60, (speed * speed) / (2 * sim.brakeDecel * BOT_MARGIN.brake) + 12);
    for (let ahead = 8; ahead <= horizon; ahead += 10) {
      const a = pointAheadOnTrack(track, projection, Math.max(0, ahead - 6));
      const b = pointAheadOnTrack(track, projection, ahead);
      const c = pointAheadOnTrack(track, projection, ahead + 6);
      const turn = Math.abs(angleDelta(headingTo(a, b), headingTo(b, c)));
      const curvature = turn / 6;
      if (curvature > 0.004) {
        const cornerSpeed = Math.sqrt((sim.lateralGrip * BOT_MARGIN.cornerGrip) / curvature);
        // Allow for braking deceleration `v_now^2 = v_corner^2 + 2 * a_brake * dist`.
        const allowedNow = Math.sqrt(
          cornerSpeed * cornerSpeed +
            2 * (sim.brakeDecel * BOT_MARGIN.brake) * Math.max(0, ahead - 6),
        );
        lowestAllowedSpeed = Math.min(lowestAllowedSpeed, allowedNow);
      }
    }

    const targetSpeed = clamp(lowestAllowedSpeed, 14, sim.maxSpeed);
    if (speed > targetSpeed + 1.2) {
      return {
        throttle: 0,
        brake: clamp((speed - targetSpeed) / 9, 0.2, 1),
        steer,
        handbrake: false,
      };
    }

    // While turning, ask for no more drive than the rear tyres can take.
    const demand = driveDemand(car, state.car.gear, speed);
    const tractionShare = clamp((sim.tractionAccel * 0.8) / Math.max(demand, 1e-6), 0.3, 1);
    const cornering = clamp(Math.abs(steer) * 2, 0, 1);
    const throttleCap = 1 - cornering * (1 - Math.min(tractionShare, 0.75));
    const throttle = speed > targetSpeed ? 0.25 : clamp(throttleCap, 0.3, 1);
    return {
      throttle,
      brake: 0,
      steer,
      handbrake: false,
    };
  };
}
