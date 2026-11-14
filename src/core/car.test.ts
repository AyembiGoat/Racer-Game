import { describe, expect, it } from 'vitest';
import type { CarInput, CarState, DrivingSurface } from './car';
import { createCar, HANDLING, NO_INPUT, steerLockAt, stepCar, tyreCurve } from './car';
import type { CarSpec } from './cars';
import { CAR_IDS, CARS, STARTER_CAR_ID } from './cars';
import { SIM_STEP_SECONDS } from './fixedLoop';

const dt = SIM_STEP_SECONDS;
const m3 = CARS[STARTER_CAR_ID];
const origin = { position: { x: 0, z: 0 }, heading: 0 };

function runCar(
  initial: CarState,
  input: CarInput,
  steps: number,
  surface: DrivingSurface = 'tarmac',
  car: CarSpec = m3,
): CarState {
  let state = initial;
  for (let i = 0; i < steps; i++) {
    state = stepCar(car, state, input, dt, surface);
  }
  return state;
}

function rolling(car: CarSpec, speed: number, gear: number): CarState {
  return { ...createCar(car, origin), velocity: { x: 0, z: -speed }, speed, gear };
}

describe('stepCar', () => {
  it('accelerates down -Z, shifts up through the gears, and stays within maxSpeed', () => {
    const afterOneSecond = runCar(createCar(m3, origin), { ...NO_INPUT, throttle: 1 }, 60);
    expect(afterOneSecond.speed).toBeGreaterThan(10);
    expect(afterOneSecond.position.z).toBeLessThan(-5);
    expect(afterOneSecond.position.x).toBeCloseTo(0, 5);
    expect(afterOneSecond.wheelSpin).toBeGreaterThan(0);

    const highSpeed = runCar(createCar(m3, origin), { ...NO_INPUT, throttle: 1 }, 420);
    expect(highSpeed.gear).toBeGreaterThanOrEqual(4);
    expect(highSpeed.speed).toBeLessThanOrEqual(m3.sim.maxSpeed);
    expect(highSpeed.rpm).toBeGreaterThan(m3.real.idleRpm);
  });

  it('brakes to a standstill and holds there before engaging reverse', () => {
    const moving = runCar(createCar(m3, origin), { ...NO_INPUT, throttle: 1 }, 60);
    let state = moving;
    let stoppedAt = -1;
    let reverseAt = -1;
    for (let i = 0; i < 240; i++) {
      state = stepCar(m3, state, { ...NO_INPUT, brake: 1 }, dt);
      if (stoppedAt < 0 && state.speed === 0) stoppedAt = i;
      if (reverseAt < 0 && state.gear === -1) reverseAt = i;
    }
    expect(stoppedAt).toBeGreaterThan(0);
    expect((reverseAt - stoppedAt) * dt).toBeGreaterThanOrEqual(HANDLING.reverseHoldSeconds - dt);
    expect(state.gear).toBe(-1);
    expect(state.speed).toBeLessThan(-5);
  });

  it('never engages reverse while the car is still sliding', () => {
    // Sideways at speed with no forward motion: the old model dropped straight into reverse.
    let state: CarState = { ...createCar(m3, origin), velocity: { x: 14, z: 0 } };
    for (let i = 0; i < 300; i++) {
      state = stepCar(m3, state, { ...NO_INPUT, brake: 1 }, dt);
      if (state.gear === -1) {
        expect(Math.hypot(state.velocity.x, state.velocity.z)).toBeLessThan(HANDLING.restSpeed);
        break;
      }
    }
    expect(state.gear).toBe(-1);
  });

  it('leaves reverse for first gear when the throttle is pressed', () => {
    const reversing = runCar(createCar(m3, origin), { ...NO_INPUT, brake: 1 }, 120);
    expect(reversing.gear).toBe(-1);
    const forwardAgain = runCar(reversing, { ...NO_INPUT, throttle: 1 }, 120);
    expect(forwardAgain.gear).toBeGreaterThanOrEqual(1);
    expect(forwardAgain.speed).toBeGreaterThan(5);
  });

  it('self-centres the front wheels faster on release than on turn-in', () => {
    const turned = runCar(createCar(m3, origin), { ...NO_INPUT, steer: 1 }, 8);
    const turnGain = turned.steerAngle;
    const released = runCar(turned, NO_INPUT, 8);
    const releaseDrop = turned.steerAngle - released.steerAngle;

    expect(turnGain).toBeGreaterThan(0.15);
    expect(releaseDrop).toBeGreaterThan(turnGain * 0.55);
  });

  it('turns the front wheels while parked without rotating the car body', () => {
    const parked = runCar(createCar(m3, origin), { ...NO_INPUT, steer: 1 }, 30);
    expect(parked.steerAngle).toBeGreaterThan(0);
    expect(parked.heading).toBe(0);
    expect(parked.position).toEqual({ x: 0, z: 0 });
  });

  it('turns left for negative steer and right for positive steer while driving', () => {
    const left = runCar(createCar(m3, origin), { ...NO_INPUT, throttle: 0.7, steer: -1 }, 60);
    const right = runCar(createCar(m3, origin), { ...NO_INPUT, throttle: 0.7, steer: 1 }, 60);

    expect(left.position.x).toBeLessThan(0);
    expect(right.position.x).toBeGreaterThan(0);
    expect(right.position.x).toBeCloseTo(-left.position.x, 5);
  });

  it('narrows the usable steering lock smoothly as speed rises', () => {
    let previous = steerLockAt(m3, 0);
    expect(previous).toBe(m3.sim.maxSteerAngle);
    for (let speed = 1; speed <= 60; speed++) {
      const lock = steerLockAt(m3, speed);
      expect(lock).toBeLessThanOrEqual(previous);
      expect(previous - lock).toBeLessThan(0.07);
      previous = lock;
    }
    const fast = runCar(rolling(m3, 45, 4), { ...NO_INPUT, throttle: 1, steer: 1 }, 40);
    expect(fast.steerAngle).toBeLessThanOrEqual(steerLockAt(m3, 40));
  });

  it('stops yawing promptly on release and answers a counter-steer', () => {
    for (const speed of [25, 40]) {
      const cornering = runCar(rolling(m3, speed, 4), { ...NO_INPUT, throttle: 0.4, steer: 1 }, 90);
      const steady = Math.abs(cornering.yawRate);
      expect(steady).toBeGreaterThan(0.3);
      // Three steps (50 ms) after release the yaw rate is already falling.
      const released = runCar(cornering, { ...NO_INPUT, throttle: 0.4 }, 3);
      expect(Math.abs(released.yawRate)).toBeLessThan(steady * 0.9);
      const settled = runCar(cornering, { ...NO_INPUT, throttle: 0.4 }, 30);
      expect(Math.abs(settled.yawRate)).toBeLessThan(steady * 0.1);
      const countered = runCar(cornering, { ...NO_INPUT, throttle: 0.4, steer: -1 }, 9);
      expect(Math.sign(countered.yawRate)).not.toBe(Math.sign(cornering.yawRate));
    }
  });

  it('recovers from a slide without spinning once the steering is released', () => {
    for (const id of CAR_IDS) {
      const car = CARS[id];
      const sliding = runCar(
        rolling(car, 28, 3),
        { ...NO_INPUT, steer: 1, handbrake: true },
        30,
        'tarmac',
        car,
      );
      expect(sliding.slip).toBeGreaterThan(0.2);
      const recovered = runCar(sliding, { ...NO_INPUT, throttle: 0.3 }, 150, 'tarmac', car);
      expect(recovered.slip).toBe(0);
      expect(Math.abs(recovered.yawRate)).toBeLessThan(0.05);
      expect(recovered.speed).toBeGreaterThan(5);
    }
  });

  it('gives less lateral force past the tyre peak, never none', () => {
    expect(tyreCurve(0)).toBe(0);
    expect(tyreCurve(1)).toBeCloseTo(1, 9);
    expect(tyreCurve(0.5)).toBeGreaterThan(0.5);
    expect(tyreCurve(2)).toBeLessThan(1);
    expect(tyreCurve(50)).toBeGreaterThanOrEqual(HANDLING.slideGrip);
    expect(tyreCurve(-2)).toBe(tyreCurve(2));
  });

  it('loses speed faster on grass than on tarmac and builds slip on handbrake turns', () => {
    const entry = runCar(createCar(m3, origin), { ...NO_INPUT, throttle: 1 }, 180);
    const tarmacCoast = runCar(entry, NO_INPUT, 45, 'tarmac');
    const grassCoast = runCar(entry, NO_INPUT, 45, 'grass');
    expect(grassCoast.speed).toBeLessThan(tarmacCoast.speed - 2);

    const gripped = runCar(entry, { ...NO_INPUT, steer: 1 }, 30);
    const sliding = runCar(entry, { ...NO_INPUT, steer: 1, handbrake: true }, 30);
    expect(sliding.slip).toBeGreaterThan(gripped.slip);
  });

  it('eases grip between surfaces instead of stepping', () => {
    const entry = rolling(m3, 30, 3);
    const firstStep = stepCar(m3, entry, NO_INPUT, dt, 'grass');
    expect(firstStep.surfaceGrip).toBeLessThan(1);
    expect(firstStep.surfaceGrip).toBeGreaterThan(0.9);
    const settled = runCar(entry, NO_INPUT, 40, 'grass');
    expect(settled.surfaceGrip).toBeCloseTo(HANDLING.grassGrip, 2);
    const back = runCar(settled, NO_INPUT, 40, 'tarmac');
    expect(back.surfaceGrip).toBeCloseTo(1, 2);
  });

  it('does not hunt between gears at a steady speed near a shift point', () => {
    for (const id of CAR_IDS) {
      const car = CARS[id];
      const shiftSpeed = (car.sim.gearTopSpeeds[1] ?? 0) * 0.97;
      let state = rolling(car, shiftSpeed, 2);
      let changes = 0;
      for (let i = 0; i < 600; i++) {
        // Feather the throttle around the second-gear shift speed.
        const throttle = state.speed < shiftSpeed ? 0.6 : 0;
        const next = stepCar(car, state, { ...NO_INPUT, throttle }, dt);
        if (next.gear !== state.gear) changes += 1;
        state = next;
      }
      expect(changes).toBeLessThanOrEqual(2);
    }
  });

  it('lets the strong cars overpower the rear tyres out of a slow corner, not the MX-5', () => {
    const widening = (car: CarSpec) => {
      const cornering = runCar(
        rolling(car, 14, 2),
        { ...NO_INPUT, throttle: 0.3, steer: 1 },
        60,
        'tarmac',
        car,
      );
      const steady = runCar(cornering, { ...NO_INPUT, throttle: 0.3, steer: 1 }, 20, 'tarmac', car);
      const floored = runCar(cornering, { ...NO_INPUT, throttle: 1, steer: 1 }, 20, 'tarmac', car);
      return floored.slip - steady.slip;
    };
    const mx5 = widening(CARS['mazda-mx5-na']);
    expect(mx5).toBeLessThan(0.01);
    expect(widening(CARS['ford-mustang-gt-s550'])).toBeGreaterThan(mx5 + 0.08);
    expect(widening(m3)).toBeGreaterThan(mx5 + 0.04);
  });
});
