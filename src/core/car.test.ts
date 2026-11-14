import { describe, expect, it } from 'vitest';
import type { CarInput, CarState } from './car';
import { CAR_TUNING, createCar, NO_INPUT, stepCar } from './car';
import { SIM_STEP_SECONDS } from './fixedLoop';

const dt = SIM_STEP_SECONDS;

function runCar(initial: CarState, input: CarInput, steps: number): CarState {
  let state = initial;
  for (let i = 0; i < steps; i++) {
    state = stepCar(state, input, dt);
  }
  return state;
}

describe('stepCar', () => {
  const origin = { position: { x: 0, z: 0 }, heading: 0 };

  it('accelerates down -Z when facing heading 0 and clamps at maxSpeed', () => {
    const afterOneSecond = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 60);
    expect(afterOneSecond.speed).toBeCloseTo(CAR_TUNING.acceleration, 1);
    expect(afterOneSecond.position.z).toBeLessThan(-6);
    expect(afterOneSecond.position.x).toBeCloseTo(0, 5);
    expect(afterOneSecond.wheelSpin).toBeGreaterThan(0);

    const topOut = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 600);
    expect(topOut.speed).toBe(CAR_TUNING.maxSpeed);
  });

  it('brakes harder than coasting and reverses when brake is held from rest', () => {
    const moving = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 120);
    const coasted = runCar(moving, NO_INPUT, 30);
    const braked = runCar(moving, { ...NO_INPUT, brake: 1 }, 30);
    expect(braked.speed).toBeLessThan(coasted.speed);

    const reversed = runCar(createCar(origin), { ...NO_INPUT, brake: 1 }, 180);
    expect(reversed.speed).toBe(-CAR_TUNING.maxReverseSpeed);
    expect(reversed.position.z).toBeGreaterThan(0);
  });

  it('coasts smoothly to zero without overshooting', () => {
    const moving = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 60);
    const stopped = runCar(moving, NO_INPUT, 300);
    expect(stopped.speed).toBe(0);
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
    const slow = runCar(createCar(origin), { ...NO_INPUT, throttle: 0.1, steer: 1 }, 30);
    const fastStart = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 400);
    const fast = runCar(fastStart, { ...NO_INPUT, throttle: 1, steer: 1 }, 30);

    expect(fast.steerAngle).toBeLessThan(slow.steerAngle);
    expect(fast.steerAngle).toBeCloseTo(
      CAR_TUNING.maxSteerAngle * CAR_TUNING.highSpeedSteerFactor,
      2,
    );
  });

  it('slides wider when the handbrake reduces lateral grip', () => {
    const entry = runCar(createCar(origin), { ...NO_INPUT, throttle: 1 }, 150);
    const gripped = runCar(entry, { ...NO_INPUT, steer: 1 }, 30);
    const sliding = runCar(entry, { ...NO_INPUT, steer: 1, handbrake: true }, 30);

    expect(sliding.speed).toBeLessThan(gripped.speed);
    // Lower grip means velocity lags behind heading, leaving a larger lateral slip.
    const grippedSlip = Math.hypot(gripped.velocity.x, gripped.velocity.z) - gripped.speed;
    const slidingSlip = Math.hypot(sliding.velocity.x, sliding.velocity.z) - sliding.speed;
    expect(slidingSlip).toBeGreaterThan(grippedSlip);
  });
});
