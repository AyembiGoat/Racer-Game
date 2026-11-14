import type { CarInput } from './car';
import { CAR_TUNING } from './car';
import type { GameState } from './game';
import type { Track } from './track';
import { pointAheadOnTrack, projectOntoTrack } from './track';
import { angleDelta, clamp, headingTo } from './vec';

/**
 * Scripted driver that uses only the standard player inputs (`CarInput`).
 * Follows a speed-scaled lookahead point along the track centreline and brakes
 * cleanly into tight corners while keeping all four wheels on the tarmac.
 */
export function createBot(track: Track): (state: GameState) => CarInput {
  return (state) => {
    const { car } = state;
    const projection = projectOntoTrack(track, car.position);

    const steerLookahead = clamp(9.5 + Math.max(0, car.speed) * 0.38, 9.5, 23);
    const targetPoint = pointAheadOnTrack(track, projection, steerLookahead);
    const desiredHeading = headingTo(car.position, targetPoint);
    const headingError = angleDelta(car.heading, desiredHeading);

    const speedRatio = clamp(Math.abs(car.speed) / CAR_TUNING.maxSpeed, 0, 1);
    const effectiveMaxSteer =
      CAR_TUNING.maxSteerAngle * (1 + (CAR_TUNING.highSpeedSteerFactor - 1) * speedRatio);
    const steer = clamp(-headingError / Math.max(0.14, effectiveMaxSteer), -1, 1);

    // Scan upcoming curvature along the braking horizon to compute safe entry speeds.
    let lowestAllowedSpeed: number = CAR_TUNING.maxSpeed;
    const scanDistances = [8, 18, 30, 44, 60];
    for (const ahead of scanDistances) {
      const a = pointAheadOnTrack(track, projection, Math.max(0, ahead - 6));
      const b = pointAheadOnTrack(track, projection, ahead);
      const c = pointAheadOnTrack(track, projection, ahead + 6);
      const turn = Math.abs(angleDelta(headingTo(a, b), headingTo(b, c)));
      const curvature = turn / 6;
      if (curvature > 0.004) {
        const cornerSpeed = Math.sqrt((CAR_TUNING.lateralGrip * 0.68) / curvature);
        // Allow for braking deceleration `v_now^2 = v_corner^2 + 2 * a_brake * dist`.
        const allowedNow = Math.sqrt(
          cornerSpeed * cornerSpeed + 2 * (CAR_TUNING.brakeDecel * 0.62) * Math.max(0, ahead - 6),
        );
        lowestAllowedSpeed = Math.min(lowestAllowedSpeed, allowedNow);
      }
    }

    const targetSpeed = clamp(lowestAllowedSpeed, 14, CAR_TUNING.maxSpeed);
    if (car.speed > targetSpeed + 1.2) {
      return {
        throttle: 0,
        brake: clamp((car.speed - targetSpeed) / 9, 0.2, 1),
        steer,
        handbrake: false,
      };
    }

    const throttle = car.speed > targetSpeed ? 0.25 : clamp(1 - Math.abs(steer) * 0.25, 0.55, 1);
    return {
      throttle,
      brake: 0,
      steer,
      handbrake: false,
    };
  };
}
