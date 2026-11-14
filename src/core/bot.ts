import type { CarInput } from './car';
import { CAR_TUNING } from './car';
import type { GameState } from './game';
import type { Track } from './track';
import { pointAheadOnTrack, projectOntoTrack } from './track';
import { angleDelta, clamp, headingTo } from './vec';

/**
 * Scripted driver that uses only the standard player inputs (`CarInput`).
 * Follows a speed-scaled lookahead point along the track centreline and brakes
 * when upcoming curvature exceeds safe cornering grip.
 */
export function createBot(track: Track): (state: GameState) => CarInput {
  return (state) => {
    const { car } = state;
    const projection = projectOntoTrack(track, car.position);

    const steerLookahead = clamp(9 + Math.max(0, car.speed) * 0.42, 9, 24);
    const targetPoint = pointAheadOnTrack(track, projection, steerLookahead);
    const desiredHeading = headingTo(car.position, targetPoint);
    const headingError = angleDelta(car.heading, desiredHeading);
    const steer = clamp(-headingError / CAR_TUNING.maxSteerAngle, -1, 1);

    // Measure track curvature over the braking horizon ahead to pick a safe entry speed.
    const nearSample = pointAheadOnTrack(track, projection, 6);
    const midSample = pointAheadOnTrack(
      track,
      projection,
      Math.max(18, Math.max(0, car.speed) * 0.9),
    );
    const farSample = pointAheadOnTrack(
      track,
      projection,
      Math.max(32, Math.max(0, car.speed) * 1.5),
    );
    const nearHeading = headingTo(nearSample, midSample);
    const farHeading = headingTo(midSample, farSample);
    const bendAngle = Math.max(
      Math.abs(angleDelta(nearHeading, farHeading)),
      Math.abs(headingError),
    );

    // Convert upcoming bend sharpness into a conservative target corner speed.
    const targetSpeed =
      bendAngle < 0.08
        ? CAR_TUNING.maxSpeed
        : clamp(
            Math.sqrt((CAR_TUNING.lateralGrip * 0.72 * 22) / bendAngle),
            15,
            CAR_TUNING.maxSpeed,
          );

    if (car.speed > targetSpeed + 1.5) {
      return {
        throttle: 0,
        brake: clamp((car.speed - targetSpeed) / 10, 0.25, 1),
        steer,
        handbrake: false,
      };
    }

    const throttle = car.speed > targetSpeed ? 0.2 : clamp(1 - Math.abs(steer) * 0.35, 0.45, 1);
    return {
      throttle,
      brake: 0,
      steer,
      handbrake: false,
    };
  };
}
