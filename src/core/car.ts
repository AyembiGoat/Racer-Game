import type { CarSpec } from './cars';
import { torqueAt } from './cars';
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

/** Handling rules shared by every car. Per-car values live in `cars.ts`. */
export const HANDLING = {
  maxReverseSpeed: 13,
  reverseAcceleration: 8.5,
  /** Brake must be held this long at rest before reverse engages. */
  reverseHoldSeconds: 0.24,
  /** Below this total speed the car counts as at rest. */
  restSpeed: 0.5,
  handbrakeDecel: 15,
  handbrakeGripFactor: 0.31,
  handbrakeYawFactor: 1.25,
  engineBrakeIdle: 1.2,
  engineBrakeRedline: 3.8,
  /** Full lock asks for this multiple of the steer angle that reaches the grip limit. */
  steerLockMargin: 1.2,
  steerTurnInRate: 14,
  steerCenterRate: 24,
  steerCounterRate: 22,
  /** Lateral force left once the tyre slides well past its peak. */
  slideGrip: 0.86,
  slideFalloff: 2.5,
  alignMaxYaw: 0.9,
  /** Share of the traction limit above which the driven axle starts to slip. */
  powerSlipOnset: 0.85,
  powerSlipSpan: 0.5,
  powerGripLoss: 0.05,
  powerRotation: 0.05,
  brakeGripLoss: 0.06,
  kerbGrip: 0.96,
  grassGrip: 0.7,
  grassDrag: 6.8,
  grassDragFromSpeed: 3,
  grassDragSpan: 25,
  surfaceBlendRate: 14,
  /** A downshift waits until the lower gear would sit below this share of the upshift speed. */
  downshiftShare: 0.78,
  upshiftLockout: 0.25,
  downshiftLockout: 0.14,
  upshiftCut: 0.07,
  upshiftMinThrottle: 0.2,
} as const;

export interface CarInput {
  /** 0..1 */
  readonly throttle: number;
  /** 0..1 (brakes while moving; engages reverse after a brief hold at rest) */
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
  /** -1 for reverse, 1 and up for forward gears. */
  readonly gear: number;
  /** Engine speed in revolutions per minute. */
  readonly rpm: number;
  /** Seconds until the gearbox may shift again. */
  readonly shiftCooldown: number;
  /** Seconds of drive interruption left after an upshift. */
  readonly shiftCut: number;
  /** Seconds brake must still be held at rest before reverse engages. */
  readonly stopHold: number;
  /** Tyre slide beyond the grip peak, 0..1, for marks and squeal. */
  readonly slip: number;
  /** Share of cornering grip in use, 0..1, for tyre scrub. */
  readonly cornerLoad: number;
  /** Current surface grip factor, eased between surfaces. */
  readonly surfaceGrip: number;
  /** Suspension pitch in radians (positive squats rear, negative dives nose). */
  readonly pitch: number;
  /** Suspension roll in radians (body lean in corners). */
  readonly roll: number;
}

export function createCar(
  car: CarSpec,
  spawn: { readonly position: Vec2; readonly heading: number },
): CarState {
  return {
    position: spawn.position,
    velocity: { x: 0, z: 0 },
    heading: wrapAngle(spawn.heading),
    yawRate: 0,
    speed: 0,
    steerAngle: 0,
    wheelSpin: 0,
    gear: 1,
    rpm: car.real.idleRpm,
    shiftCooldown: 0,
    shiftCut: 0,
    stopHold: 0,
    slip: 0,
    cornerLoad: 0,
    surfaceGrip: 1,
    pitch: 0,
    roll: 0,
  };
}

/** Largest steer angle available at `speed`: mechanical lock, narrowed to what grip can use. */
export function steerLockAt(car: CarSpec, speed: number): number {
  const usable = Math.atan(
    (car.real.wheelbase * car.sim.lateralGrip * HANDLING.steerLockMargin) /
      Math.max(speed * speed, 1e-6),
  );
  return Math.min(car.sim.maxSteerAngle, usable);
}

/** Lateral force share for a slip ratio (slip angle / peak): rises to 1, then eases to `slideGrip`. */
export function tyreCurve(slipRatio: number): number {
  const x = Math.abs(slipRatio);
  if (x <= 1) return Math.sin((Math.PI / 2) * x);
  const over = x - 1;
  return HANDLING.slideGrip + (1 - HANDLING.slideGrip) / (1 + HANDLING.slideFalloff * over * over);
}

/** Full-throttle drive acceleration in `gear` at `speed`, before the traction limit. */
export function driveDemand(car: CarSpec, gear: number, speed: number): number {
  const index = clamp(Math.max(1, gear) - 1, 0, car.real.gearRatios.length - 1);
  const wheelRpm = Math.abs(speed) * (car.sim.rpmPerSpeed[index] ?? 0);
  const engineRpm = Math.max(wheelRpm, index === 0 ? car.sim.launchRpm : car.real.idleRpm);
  return torqueAt(car, engineRpm) * (car.sim.accelPerNm[index] ?? 0);
}

function surfaceGripTarget(surface: DrivingSurface): number {
  return surface === 'grass' ? HANDLING.grassGrip : surface === 'kerb' ? HANDLING.kerbGrip : 1;
}

export function stepCar(
  car: CarSpec,
  state: CarState,
  rawInput: CarInput,
  dt: number,
  surface: DrivingSurface = 'tarmac',
): CarState {
  const { real, sim, tuning } = car;
  const throttle = clamp(rawInput.throttle, 0, 1);
  const brake = clamp(rawInput.brake, 0, 1);
  const steer = clamp(rawInput.steer, -1, 1);
  const handbrake = rawInput.handbrake;
  const gearCount = real.gearRatios.length;

  const forward = headingForward(state.heading);
  const right = headingRight(state.heading);
  const prevForwardSpeed = dot2(state.velocity, forward);
  const prevLateralSpeed = dot2(state.velocity, right);
  const totalSpeed = Math.hypot(prevForwardSpeed, prevLateralSpeed);
  const moving = totalSpeed > HANDLING.restSpeed;

  const surfaceGrip = lerp(
    state.surfaceGrip,
    surfaceGripTarget(surface),
    1 - Math.exp(-HANDLING.surfaceBlendRate * dt),
  );
  const offTarmac = clamp((1 - surfaceGrip) / (1 - HANDLING.grassGrip), 0, 1);

  let stopHold = Math.max(0, state.stopHold - dt);
  const shiftCut = Math.max(0, state.shiftCut - dt);
  const drag = sim.rollingDrag + sim.airDrag * prevForwardSpeed * prevForwardSpeed;
  const forwardGear = clamp(Math.max(1, state.gear), 1, gearCount);

  const inReverse = state.gear === -1;
  let reverseNext = false;
  let forwardSpeed = prevForwardSpeed;
  let powerSlip = 0;
  let braking = 0;
  if (handbrake) {
    forwardSpeed = moveToward(forwardSpeed, 0, HANDLING.handbrakeDecel * dt);
    reverseNext = inReverse && forwardSpeed < 0;
  } else if (inReverse && brake > 0 && throttle === 0) {
    reverseNext = true;
    forwardSpeed = Math.max(
      -HANDLING.maxReverseSpeed,
      forwardSpeed - brake * HANDLING.reverseAcceleration * dt,
    );
  } else if (brake > 0 && moving) {
    // Brakes act while the car moves in any direction, so a slide or spin never engages reverse.
    forwardSpeed = moveToward(forwardSpeed, 0, brake * sim.brakeDecel * dt);
    stopHold = HANDLING.reverseHoldSeconds;
    braking = brake;
  } else if (throttle > 0 && forwardSpeed < -0.08) {
    forwardSpeed = Math.min(0, forwardSpeed + throttle * sim.brakeDecel * dt);
  } else if (throttle > 0) {
    stopHold = 0;
    const demand = shiftCut > 0 ? 0 : throttle * driveDemand(car, forwardGear, forwardSpeed);
    const traction = sim.tractionAccel * surfaceGrip;
    powerSlip = clamp((demand / traction - HANDLING.powerSlipOnset) / HANDLING.powerSlipSpan, 0, 1);
    forwardSpeed = clamp(
      forwardSpeed + (Math.min(demand, traction) - drag) * dt,
      -HANDLING.maxReverseSpeed,
      sim.maxSpeed,
    );
  } else if (brake > 0 && stopHold <= 0) {
    reverseNext = true;
    forwardSpeed = Math.max(
      -HANDLING.maxReverseSpeed,
      forwardSpeed - brake * HANDLING.reverseAcceleration * dt,
    );
  } else if (brake > 0) {
    forwardSpeed = moveToward(forwardSpeed, 0, brake * sim.brakeDecel * dt);
  } else {
    reverseNext = inReverse && forwardSpeed <= 0.05;
    const rpmShare = clamp(state.rpm / real.redlineRpm, 0, 1);
    const engineBrake = lerp(HANDLING.engineBrakeIdle, HANDLING.engineBrakeRedline, rpmShare);
    forwardSpeed = moveToward(forwardSpeed, 0, (engineBrake + drag) * dt);
  }

  // Verge drag builds with speed and with how far onto the grass the car is, so a slow
  // car is never trapped and the tarmac edge is not a step.
  if (offTarmac > 0 && Math.abs(forwardSpeed) > HANDLING.grassDragFromSpeed) {
    const speedFactor = clamp(
      (Math.abs(forwardSpeed) - HANDLING.grassDragFromSpeed) / HANDLING.grassDragSpan,
      0,
      1,
    );
    forwardSpeed = moveToward(forwardSpeed, 0, HANDLING.grassDrag * speedFactor * offTarmac * dt);
  }

  const maxSteer = steerLockAt(car, forwardSpeed);
  const targetSteerAngle = steer * maxSteer;
  const isCentring = Math.abs(targetSteerAngle) < 1e-4;
  const isCountering =
    !isCentring &&
    Math.abs(state.steerAngle) > 0.005 &&
    Math.sign(targetSteerAngle) !== Math.sign(state.steerAngle);
  const steerRate =
    (isCentring
      ? HANDLING.steerCenterRate
      : isCountering
        ? HANDLING.steerCounterRate
        : HANDLING.steerTurnInRate) * tuning.steerQuickness;
  const blendedSteer = lerp(state.steerAngle, targetSteerAngle, 1 - Math.exp(-steerRate * dt));
  // Lock narrows as speed rises; never hold more angle than the current lock allows.
  const rawSteerAngle = clamp(blendedSteer, -maxSteer, maxSteer);
  const steerAngle = Math.abs(rawSteerAngle) < 1e-4 && isCentring ? 0 : rawSteerAngle;

  const balanceGrip =
    (1 - HANDLING.powerGripLoss * powerSlip) * (1 - HANDLING.brakeGripLoss * braking);
  const lateralGrip =
    sim.lateralGrip * surfaceGrip * (handbrake ? HANDLING.handbrakeGripFactor : balanceGrip);
  const yawGrip = handbrake
    ? sim.lateralGrip * HANDLING.handbrakeYawFactor
    : lateralGrip *
      tuning.yawAuthority *
      (1 + HANDLING.powerRotation * powerSlip) *
      (1 + tuning.trailRotation * braking);

  // Steering asks for the kinematic yaw rate; the tyres cap it. Past the grip peak the
  // nose is drawn back toward the direction of travel.
  const kinematicYawRate = -(forwardSpeed / real.wheelbase) * Math.tan(steerAngle);
  const absForward = Math.abs(forwardSpeed);
  const maxYawRate = absForward > 1 ? yawGrip / absForward : Number.POSITIVE_INFINITY;
  let desiredYawRate = clamp(kinematicYawRate, -maxYawRate, maxYawRate);
  if (!handbrake && absForward > 3) {
    const slipAngle = Math.atan2(prevLateralSpeed, absForward);
    const excess = Math.max(0, Math.abs(slipAngle) - tuning.peakSlip);
    const align = Math.min(HANDLING.alignMaxYaw, tuning.alignGain * excess);
    desiredYawRate -= Math.sign(slipAngle) * Math.sign(forwardSpeed) * align;
  }
  const yawRate =
    absForward < 0.05 && totalSpeed < HANDLING.restSpeed
      ? 0
      : lerp(state.yawRate, desiredYawRate, 1 - Math.exp(-tuning.yawResponse * dt));
  const heading = wrapAngle(state.heading + yawRate * dt);

  const velocityBeforeTurn = add2(scale2(forward, forwardSpeed), scale2(right, prevLateralSpeed));
  const nextForward = headingForward(heading);
  const nextRight = headingRight(heading);

  const nextForwardComponent = dot2(velocityBeforeTurn, nextForward);
  const rawLateral = dot2(velocityBeforeTurn, nextRight);
  const slipRatio =
    Math.atan2(Math.abs(rawLateral), Math.max(Math.abs(nextForwardComponent), 1)) / tuning.peakSlip;
  const nextLateralComponent = moveToward(rawLateral, 0, lateralGrip * tyreCurve(slipRatio) * dt);
  const velocity = add2(
    scale2(nextForward, nextForwardComponent),
    scale2(nextRight, nextLateralComponent),
  );

  const position = add2(state.position, scale2(velocity, dt));
  const speed = dot2(velocity, nextForward);
  const wheelSpin = state.wheelSpin + (speed / sim.wheelRadius) * dt;

  let shiftCooldown = Math.max(0, state.shiftCooldown - dt);
  let nextShiftCut = shiftCut;
  let gear = state.gear;
  let rpm: number;
  if (reverseNext) {
    gear = -1;
    const wheelRpm = Math.abs(speed) * (sim.rpmPerSpeed[0] ?? 0);
    rpm = clamp(
      Math.max(wheelRpm, lerp(real.idleRpm, sim.launchRpm, brake * 0.4)),
      0,
      real.redlineRpm,
    );
  } else {
    if (gear < 1) gear = 1;
    gear = Math.min(gear, gearCount);
    const absSpeed = Math.abs(speed);
    const rpmInGear = absSpeed * (sim.rpmPerSpeed[gear - 1] ?? 0);
    if (shiftCooldown <= 0) {
      if (
        gear < gearCount &&
        rpmInGear >= sim.upshiftRpm &&
        throttle > HANDLING.upshiftMinThrottle
      ) {
        gear += 1;
        shiftCooldown = HANDLING.upshiftLockout;
        nextShiftCut = HANDLING.upshiftCut;
      } else if (
        gear > 1 &&
        absSpeed * (sim.rpmPerSpeed[gear - 2] ?? 0) <= sim.upshiftRpm * HANDLING.downshiftShare
      ) {
        gear -= 1;
        shiftCooldown = HANDLING.downshiftLockout;
      }
    }
    const wheelRpm = absSpeed * (sim.rpmPerSpeed[gear - 1] ?? 0);
    const clutchRpm = gear === 1 ? lerp(real.idleRpm, sim.launchRpm, throttle) : real.idleRpm;
    rpm = clamp(Math.max(wheelRpm, clutchRpm), real.idleRpm, real.redlineRpm);
  }

  const overPeak = slipRatio - 0.9;
  const slip = Math.abs(speed) > 3 || totalSpeed > 3 ? clamp(overPeak / 2, 0, 1) : 0;
  const cornerLoad = Math.abs(speed) > 3 ? clamp(slipRatio, 0, 1) : 0;

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
    shiftCut: nextShiftCut,
    stopHold,
    slip,
    cornerLoad,
    surfaceGrip,
    pitch,
    roll,
  };
}
