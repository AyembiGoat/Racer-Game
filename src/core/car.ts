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

export type DrivingSurface = 'tarmac' | 'kerb' | 'grass';

/** 1989 BMW M3 (E30) dimensions and balanced sport-coupe tuning. */
export const CAR_TUNING = {
  name: 'BMW M3',
  length: 4.35,
  width: 1.72,
  height: 1.37,
  wheelbase: 2.56,
  wheelRadius: 0.315,
  maxSpeed: 48,
  maxReverseSpeed: 13,
  acceleration: 14.2,
  reverseAcceleration: 8.5,
  brakeDecel: 27,
  engineBrakeDecel: 3.4,
  rollingDrag: 1.4,
  airDrag: 0.0036,
  grassDrag: 6.8,
  handbrakeDecel: 15,
  reverseHoldSeconds: 0.24,
  maxSteerAngle: 0.5,
  highSpeedSteerFactor: 0.34,
  steerTurnInRate: 7.5,
  steerCenterRate: 15,
  steerCounterRate: 17,
  yawResponse: 13,
  lateralGrip: 21,
  grassGripFactor: 0.7,
  handbrakeGrip: 6.5,
  idleRpm: 950,
  redlineRpm: 7200,
  upshiftRpm: 6750,
  downshiftRpm: 3550,
  gearTopSpeeds: [14, 23, 32, 41, 50] as const,
  gearTorqueFactors: [1.18, 1.05, 0.96, 0.89, 0.83] as const,
} as const;

export interface CarInput {
  /** 0..1 */
  readonly throttle: number;
  /** 0..1 (brakes while moving forward; engages reverse after a brief standstill hold) */
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
  /** Angular velocity around +Y in rad/s. */
  readonly yawRate: number;
  /** Signed forward speed along the car's nose, in m/s. */
  readonly speed: number;
  /** Front wheel steer angle in radians (-left, +right). */
  readonly steerAngle: number;
  /** Cumulative wheel rotation in radians for visual spin. */
  readonly wheelSpin: number;
  /** -1 for reverse, 1..5 for forward gears. */
  readonly gear: number;
  /** Engine speed in revolutions per minute. */
  readonly rpm: number;
  /** Cooldown between automatic gear shifts in seconds. */
  readonly shiftCooldown: number;
  /** Standstill hold timer preventing accidental reverse while braking to a stop. */
  readonly stopHold: number;
  /** Normalised lateral tyre slip 0..1 for audio and marks. */
  readonly slip: number;
  /** Suspension pitch in radians (positive squats rear, negative dives nose). */
  readonly pitch: number;
  /** Suspension roll in radians (body lean in corners). */
  readonly roll: number;
}

export function createCar(spawn: { readonly position: Vec2; readonly heading: number }): CarState {
  return {
    position: spawn.position,
    velocity: { x: 0, z: 0 },
    heading: wrapAngle(spawn.heading),
    yawRate: 0,
    speed: 0,
    steerAngle: 0,
    wheelSpin: 0,
    gear: 1,
    rpm: CAR_TUNING.idleRpm,
    shiftCooldown: 0,
    stopHold: 0,
    slip: 0,
    pitch: 0,
    roll: 0,
  };
}

export function stepCar(
  state: CarState,
  rawInput: CarInput,
  dt: number,
  surface: DrivingSurface = 'tarmac',
): CarState {
  const throttle = clamp(rawInput.throttle, 0, 1);
  const brake = clamp(rawInput.brake, 0, 1);
  const steer = clamp(rawInput.steer, -1, 1);
  const handbrake = rawInput.handbrake;

  const forward = headingForward(state.heading);
  const right = headingRight(state.heading);
  const prevForwardSpeed = dot2(state.velocity, forward);
  const prevLateralSpeed = dot2(state.velocity, right);

  let stopHold = Math.max(0, state.stopHold - dt);
  const gearIndex = clamp(Math.max(1, state.gear) - 1, 0, 4);
  const torqueFactor = CAR_TUNING.gearTorqueFactors[gearIndex] ?? 1;

  let forwardSpeed = prevForwardSpeed;
  if (handbrake) {
    forwardSpeed = moveToward(forwardSpeed, 0, CAR_TUNING.handbrakeDecel * dt);
  } else if (brake > 0 && forwardSpeed > 0.08) {
    forwardSpeed = Math.max(0, forwardSpeed - brake * CAR_TUNING.brakeDecel * dt);
    if (forwardSpeed === 0) {
      stopHold = CAR_TUNING.reverseHoldSeconds;
    }
  } else if (throttle > 0 && forwardSpeed < -0.08) {
    forwardSpeed = Math.min(0, forwardSpeed + throttle * CAR_TUNING.brakeDecel * dt);
  } else if (throttle > 0) {
    stopHold = 0;
    const driveAccel = throttle * CAR_TUNING.acceleration * torqueFactor;
    const drag =
      CAR_TUNING.rollingDrag + CAR_TUNING.airDrag * forwardSpeed * Math.abs(forwardSpeed);
    forwardSpeed = clamp(
      forwardSpeed + (driveAccel - drag) * dt,
      -CAR_TUNING.maxReverseSpeed,
      CAR_TUNING.maxSpeed,
    );
  } else if (brake > 0 && stopHold <= 0) {
    forwardSpeed = Math.max(
      -CAR_TUNING.maxReverseSpeed,
      forwardSpeed - brake * CAR_TUNING.reverseAcceleration * dt,
    );
  } else {
    const coastLoss =
      CAR_TUNING.engineBrakeDecel +
      CAR_TUNING.rollingDrag +
      CAR_TUNING.airDrag * forwardSpeed * Math.abs(forwardSpeed);
    forwardSpeed = moveToward(forwardSpeed, 0, coastLoss * dt);
  }

  // Grass verge adds gentle progressive drag at speed without trapping a slow car.
  if (surface === 'grass' && Math.abs(forwardSpeed) > 3) {
    const speedFactor = clamp((Math.abs(forwardSpeed) - 3) / 25, 0, 1);
    forwardSpeed = moveToward(forwardSpeed, 0, CAR_TUNING.grassDrag * speedFactor * dt);
  }

  // Smooth steering: self-centring on release and counter-steering across centre are
  // brisk so the car tracks straight effortlessly after a corner.
  const speedRatio = clamp(Math.abs(forwardSpeed) / CAR_TUNING.maxSpeed, 0, 1);
  const maxSteer = CAR_TUNING.maxSteerAngle * lerp(1, CAR_TUNING.highSpeedSteerFactor, speedRatio);
  const targetSteerAngle = steer * maxSteer;
  const isCentring = Math.abs(targetSteerAngle) < 1e-4;
  const isCountering =
    !isCentring &&
    Math.abs(state.steerAngle) > 0.02 &&
    Math.sign(targetSteerAngle) !== Math.sign(state.steerAngle);
  const steerRate = isCentring
    ? CAR_TUNING.steerCenterRate
    : isCountering
      ? CAR_TUNING.steerCounterRate
      : CAR_TUNING.steerTurnInRate;
  const steerBlend = 1 - Math.exp(-steerRate * dt);
  const rawSteerAngle = lerp(state.steerAngle, targetSteerAngle, steerBlend);
  const steerAngle = Math.abs(rawSteerAngle) < 1e-4 && isCentring ? 0 : rawSteerAngle;

  const surfaceGripFactor =
    surface === 'grass' ? CAR_TUNING.grassGripFactor : surface === 'kerb' ? 0.96 : 1;
  const lateralGrip =
    (handbrake ? CAR_TUNING.handbrakeGrip : CAR_TUNING.lateralGrip) * surfaceGripFactor;

  // Desired curvature yaw rate, bounded by front-tyre grip and smoothed by rotational inertia.
  const kinematicYawRate = -(forwardSpeed / CAR_TUNING.wheelbase) * Math.tan(steerAngle);
  const yawAuthority = handbrake ? CAR_TUNING.lateralGrip * 1.25 : lateralGrip * 1.08;
  const maxYawRate =
    Math.abs(forwardSpeed) > 1 ? yawAuthority / Math.abs(forwardSpeed) : Number.POSITIVE_INFINITY;
  const desiredYawRate = clamp(kinematicYawRate, -maxYawRate, maxYawRate);
  const yawRate =
    Math.abs(forwardSpeed) < 0.05
      ? 0
      : lerp(state.yawRate, desiredYawRate, 1 - Math.exp(-CAR_TUNING.yawResponse * dt));
  const heading = wrapAngle(state.heading + yawRate * dt);

  const velocityBeforeTurn = add2(scale2(forward, forwardSpeed), scale2(right, prevLateralSpeed));
  const nextForward = headingForward(heading);
  const nextRight = headingRight(heading);

  const nextForwardComponent = dot2(velocityBeforeTurn, nextForward);
  const rawLateral = dot2(velocityBeforeTurn, nextRight);
  const nextLateralComponent = moveToward(rawLateral, 0, lateralGrip * dt);
  const velocity = add2(
    scale2(nextForward, nextForwardComponent),
    scale2(nextRight, nextLateralComponent),
  );

  const position = add2(state.position, scale2(velocity, dt));
  const speed = dot2(velocity, nextForward);
  const wheelSpin = state.wheelSpin + (speed / CAR_TUNING.wheelRadius) * dt;

  // Automatic 5-speed transmission and engine RPM.
  let shiftCooldown = Math.max(0, state.shiftCooldown - dt);
  let gear = state.gear;
  let rpm: number;
  if (speed < -0.25 || (gear === -1 && brake > 0 && stopHold <= 0 && speed <= 0.05)) {
    gear = -1;
    const revRatio = clamp(Math.abs(speed) / CAR_TUNING.maxReverseSpeed, 0, 1);
    rpm = lerp(CAR_TUNING.idleRpm, 5400, Math.max(revRatio, throttle * 0.25));
  } else {
    if (gear < 1) gear = 1;
    const currentTop = CAR_TUNING.gearTopSpeeds[gear - 1] ?? CAR_TUNING.maxSpeed;
    const speedRpm = lerp(
      CAR_TUNING.idleRpm,
      CAR_TUNING.redlineRpm,
      clamp(Math.abs(speed) / currentTop, 0, 1.03),
    );
    if (shiftCooldown <= 0) {
      if (gear < 5 && speedRpm >= CAR_TUNING.upshiftRpm && throttle > 0.2) {
        gear += 1;
        shiftCooldown = 0.22;
      } else if (gear > 1 && speedRpm <= CAR_TUNING.downshiftRpm) {
        gear -= 1;
        shiftCooldown = 0.16;
      }
    }
    const finalTop = CAR_TUNING.gearTopSpeeds[gear - 1] ?? CAR_TUNING.maxSpeed;
    const wheelRatio = clamp(Math.abs(speed) / finalTop, 0, 1.02);
    const launchBlip = Math.abs(speed) < 2 ? throttle * 0.22 : 0;
    rpm = lerp(CAR_TUNING.idleRpm, CAR_TUNING.redlineRpm, Math.max(wheelRatio, launchBlip));
  }

  const slip = Math.abs(speed) > 3 ? clamp(Math.abs(nextLateralComponent) / 6.5, 0, 1) : 0;

  const longAccel = (speed - state.speed) / Math.max(dt, 1e-4);
  const latAccel = speed * yawRate;
  const targetPitch = clamp(longAccel * 0.0017, -0.04, 0.032);
  const targetRoll = clamp(latAccel * 0.0022, -0.055, 0.055);
  const bodyBlend = 1 - Math.exp(-10 * dt);
  const pitch = lerp(state.pitch, targetPitch, bodyBlend);
  const roll = lerp(state.roll, targetRoll, bodyBlend);

  return {
    position,
    velocity,
    heading,
    yawRate,
    speed,
    steerAngle,
    wheelSpin,
    gear,
    rpm,
    shiftCooldown,
    stopHold,
    slip,
    pitch,
    roll,
  };
}
