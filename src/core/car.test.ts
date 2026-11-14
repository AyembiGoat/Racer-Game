import { describe, expect, it } from 'vitest';
import type { CarInput, CarState, DrivingSurface } from './car';
import { CAR_TUNING, createCar, NO_INPUT, stepCar } from './car';
import { SIM_STEP_SECONDS } from './fixedLoop';

const dt = SIM_STEP_SECONDS;

function runCar(
  initial: CarState,
  input: CarInput,
  steps: number,
  surface: DrivingSurface = 'tarmac',
): CarState {
  let state = initial;
  for (let i = 0; i < steps; i++) {
    state = stepCar(state, input, dt, surface);
  }
  return state;
}

describe('stepCar', () => {
  const origin = { position: { x: 0, z: 0 }, heading: 0 };

  it('accelerates down -Z, shifts up through the gears, and stays within maxSpeed', () => {
    const afterOneSecond = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 60);
    expect(afterOneSecond.speed).toBeGreaterThan(12);
    expect(afterOneSecond.position.z).toBeLessThan(-6);
    expect(afterOneSecond.position.x).toBeCloseTo(0, 5);
    expect(afterOneSecond.wheelSpin).toBeGreaterThan(0);

    const highSpeed = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 420);
    expect(highSpeed.gear).toBeGreaterThanOrEqual(4);
    expect(highSpeed.speed).toBeLessThanOrEqual(CAR_TUNING.maxSpeed);
    expect(highSpeed.rpm).toBeGreaterThan(CAR_TUNING.idleRpm);
  });

  it('brakes to a brief standstill hold before engaging reverse', () => {
    const moving = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 60);
    // Enough steps to hit 0 m/s, plus 5 steps (less than reverseHoldSeconds) still holding brake.
    const justStopped = runCar(moving, { ...NO_INPUT, brake: 1 }, 42);
    expect(justStopped.speed).toBe(0);
    expect(justStopped.gear).toBe(1);

    // Continuing to hold brake past the hold engages reverse cleanly.
    const reversing = runCar(justStopped, { ...NO_INPUT, brake: 1 }, 120);
    expect(reversing.gear).toBe(-1);
    expect(reversing.speed).toBeLessThan(-5);
  });

  it('self-centres the front wheels faster on release than on turn-in', () => {
    const turned = runCar(createCar(origin), { ...NO_INPUT, steer: 1 }, 8);
    const turnGain = turned.steerAngle;
    const released = runCar(turned, NO_INPUT, 8);
    const releaseDrop = turned.steerAngle - released.steerAngle;

    expect(turnGain).toBeGreaterThan(0.15);
    expect(releaseDrop).toBeGreaterThan(turnGain * 0.55);
  });

  it('turns the front wheels while parked without rotating the car body', () => {
    const parked = runCar(createCar(origin), { ...NO_INPUT, steer: 1 }, 30);
    expect(parked.steerAngle).toBeGreaterThan(0);
    expect(parked.heading).toBe(0);
    expect(parked.position).toEqual({ x: 0, z: 0 });
  });

  it('turns left for negative steer and right for positive steer while driving', () => {
    const left = runCar(createCar(origin), { ...NO_INPUT, throttle: 0.7, steer: -1 }, 60);
    const right = runCar(createCar(origin), { ...NO_INPUT, throttle: 0.7, steer: 1 }, 60);

    expect(left.position.x).toBeLessThan(0);
    expect(right.position.x).toBeGreaterThan(0);
    expect(right.position.x).toBeCloseTo(-left.position.x, 5);
  });

  it('reduces maximum steering angle at top speed for straight-line stability', () => {
    const slow = runCar(createCar(origin), { ...NO_INPUT, throttle: 0.1, steer: 1 }, 40);
    const fastStart = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 420);
    const fast = runCar(fastStart, { ...NO_INPUT, throttle: 1, steer: 1 }, 40);

    expect(fast.steerAngle).toBeLessThan(slow.steerAngle);
    expect(fast.steerAngle).toBeCloseTo(
      CAR_TUNING.maxSteerAngle * CAR_TUNING.highSpeedSteerFactor,
      1,
    );
  });

  it('loses speed faster on grass than on tarmac and builds slip on handbrake turns', () => {
    const entry = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 120);
    const tarmacCoast = runCar(entry, NO_INPUT, 45, 'tarmac');
    const grassCoast = runCar(entry, NO_INPUT, 45, 'grass');
    expect(grassCoast.speed).toBeLessThan(tarmacCoast.speed - 2);

    const gripped = runCar(entry, { ...NO_INPUT, steer: 1 }, 30);
    const sliding = runCar(entry, { ...NO_INPUT, steer: 1, handbrake: true }, 30);
    expect(sliding.slip).toBeGreaterThan(gripped.slip);
  });
});
