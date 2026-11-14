import type { Vec2 } from './vec';
import {
  add2,
  clamp,
  dot2,
  headingForward,
  headingRight,
  lerp,
  moveToward,
  scale2,
  wrapAngle,
} from './vec';

export const CAR_TUNING = {
  length: 4.2,
  width: 1.8,
  height: 1.3,
  wheelbase: 2.55,
  wheelRadius: 0.33,
  maxSpeed: 44,
  maxReverseSpeed: 12,
  acceleration: 13.5,
  reverseAcceleration: 8,
  brakeDecel: 26,
  coastDecel: 4.5,
  handbrakeDecel: 16,
  maxSteerAngle: 0.5,
  highSpeedSteerFactor: 0.42,
  steerRate: 3.4,
  lateralGrip: 18,
  handbrakeGrip: 5.5,
} as const;

export interface CarInput {
  /** 0..1 */
  readonly throttle: number;
  /** 0..1 (brakes while moving forward; reverses once stopped) */
  readonly brake: number;
  /** -1 full left, +1 full right */
  readonly steer: number;
  readonly handbrake: boolean;
}

export const NO_INPUT: CarInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
};

export interface CarState {
  readonly position: Vec2;
  readonly velocity: Vec2;
  /** Radians around +Y. 0 faces down -Z; positive rotates counter-clockwise (left). */
  readonly heading: number;
  /** Signed forward speed along the car's nose, in m/s. */
  readonly speed: number;
  /** Front wheel steer angle in radians (-left, +right). */
  readonly steerAngle: number;
  /** Cumulative wheel rotation in radians for visual spin. */
  readonly wheelSpin: number;
}

export function createCar(spawn: { readonly position: Vec2; readonly heading: number }): CarState {
  return {
    position: spawn.position,
    velocity: { x: 0, z: 0 },
    heading: wrapAngle(spawn.heading),
    speed: 0,
    steerAngle: 0,
    wheelSpin: 0,
  };
}

export function stepCar(state: CarState, rawInput: CarInput, dt: number): CarState {
  const throttle = clamp(rawInput.throttle, 0, 1);
  const brake = clamp(rawInput.brake, 0, 1);
  const steer = clamp(rawInput.steer, -1, 1);
  const handbrake = rawInput.handbrake;

  const forward = headingForward(state.heading);
  const right = headingRight(state.heading);
  const prevForwardSpeed = dot2(state.velocity, forward);
  const prevLateralSpeed = dot2(state.velocity, right);

  let forwardSpeed = prevForwardSpeed;
  if (handbrake) {
    forwardSpeed = moveToward(forwardSpeed, 0, CAR_TUNING.handbrakeDecel * dt);
  } else if (brake > 0 && forwardSpeed > 0.05) {
    forwardSpeed = Math.max(0, forwardSpeed - brake * CAR_TUNING.brakeDecel * dt);
  } else if (throttle > 0 && forwardSpeed < -0.05) {
    forwardSpeed = Math.min(0, forwardSpeed + throttle * CAR_TUNING.brakeDecel * dt);
  } else if (throttle > 0) {
    forwardSpeed = Math.min(
      CAR_TUNING.maxSpeed,
      forwardSpeed + throttle * CAR_TUNING.acceleration * dt,
    );
  } else if (brake > 0) {
    forwardSpeed = Math.max(
      -CAR_TUNING.maxReverseSpeed,
      forwardSpeed - brake * CAR_TUNING.reverseAcceleration * dt,
    );
  } else {
    forwardSpeed = moveToward(forwardSpeed, 0, CAR_TUNING.coastDecel * dt);
  }

  const speedRatio = clamp(Math.abs(forwardSpeed) / CAR_TUNING.maxSpeed, 0, 1);
  const maxSteer = CAR_TUNING.maxSteerAngle * lerp(1, CAR_TUNING.highSpeedSteerFactor, speedRatio);
  const steerAngle = moveToward(state.steerAngle, steer * maxSteer, CAR_TUNING.steerRate * dt);

  // Positive `steerAngle` turns right, which is clockwise around +Y (negative yaw).
  // Front-tyre grip limits how fast the nose can rotate at speed (natural understeer
  // instead of spinning in place; pulling the handbrake lets the rear rotate wider).
  const rawYawRate = -(forwardSpeed / CAR_TUNING.wheelbase) * Math.tan(steerAngle);
  const yawGrip = handbrake ? CAR_TUNING.lateralGrip * 1.25 : CAR_TUNING.lateralGrip * 1.08;
  const maxYawRate =
    Math.abs(forwardSpeed) > 1 ? yawGrip / Math.abs(forwardSpeed) : Number.POSITIVE_INFINITY;
  const yawRate = clamp(rawYawRate, -maxYawRate, maxYawRate);
  const heading = wrapAngle(state.heading + yawRate * dt);

  const velocityBeforeTurn = add2(scale2(forward, forwardSpeed), scale2(right, prevLateralSpeed));
  const nextForward = headingForward(heading);
  const nextRight = headingRight(heading);

  const grip = handbrake ? CAR_TUNING.handbrakeGrip : CAR_TUNING.lateralGrip;
  const nextForwardComponent = dot2(velocityBeforeTurn, nextForward);
  const nextLateralComponent = moveToward(dot2(velocityBeforeTurn, nextRight), 0, grip * dt);
  const velocity = add2(
    scale2(nextForward, nextForwardComponent),
    scale2(nextRight, nextLateralComponent),
  );

  const position = add2(state.position, scale2(velocity, dt));
  const speed = dot2(velocity, nextForward);
  const wheelSpin = state.wheelSpin + (speed / CAR_TUNING.wheelRadius) * dt;

  return {
    position,
    velocity,
    heading,
    speed,
    steerAngle,
    wheelSpin,
  };
}
