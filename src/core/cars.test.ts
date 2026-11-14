import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import { createCar, NO_INPUT, stepCar } from './car';
import type { CarSpec } from './cars';
import { carAnchors, CAR_IDS, CARS, isCarId, STARTER_CAR_ID, torqueAt, validateCar } from './cars';
import { estimateCar } from './estimates';
import { SIM_STEP_SECONDS } from './fixedLoop';
import type { GameEvent } from './game';
import { createGame, stepGame } from './game';
import { clubCircuit } from './tracks/clubCircuit';

const dt = SIM_STEP_SECONDS;
const origin = { position: { x: 0, z: 0 }, heading: 0 };

function zeroTo100(car: CarSpec): number {
  let state = createCar(car, origin);
  for (let i = 1; i <= 60 * 20; i++) {
    state = stepCar(car, state, { ...NO_INPUT, throttle: 1 }, dt);
    if (state.speed >= 100 / 3.6) return i * dt;
  }
  return Number.POSITIVE_INFINITY;
}

describe('car catalog', () => {
  it('has four to five valid cars with a free starter', () => {
    expect(CAR_IDS.length).toBeGreaterThanOrEqual(4);
    expect(CAR_IDS.length).toBeLessThanOrEqual(5);
    expect(CARS[STARTER_CAR_ID].price).toBe(0);
    for (const id of CAR_IDS) {
      expect(CARS[id].id).toBe(id);
      expect(validateCar(CARS[id])).toEqual([]);
    }
    expect(isCarId('bmw-m3-e30')).toBe(true);
    expect(isCarId('toString')).toBe(false);
    expect(isCarId(3)).toBe(false);
  });

  it('reports a definition that cannot work', () => {
    const base = CARS[STARTER_CAR_ID];
    const broken: CarSpec = {
      ...base,
      price: -1,
      real: { ...base.real, wheelbase: 5, gearRatios: [3, 3.2, 1, 0.9], massKg: 0 },
    };
    const problems = validateCar(broken);
    expect(problems).toContain('massKg must be positive');
    expect(problems).toContain('wheelbase must be shorter than the car');
    expect(problems).toContain('gear ratios must fall with each gear');
    expect(problems).toContain('price must be a whole number');
  });

  it('reproduces the published peak torque and power', () => {
    for (const id of CAR_IDS) {
      const car = CARS[id];
      expect(torqueAt(car, car.real.torqueRpm)).toBeCloseTo(car.real.torqueNm, 6);
      const kw = (torqueAt(car, car.real.powerRpm) * car.real.powerRpm * 2 * Math.PI) / 60000;
      expect(kw).toBeCloseTo(car.real.powerKw, 6);
      expect(torqueAt(car, car.real.redlineRpm)).toBe(0);
    }
  });

  it('keeps wheels inside the body and anchors on the wheelbase', () => {
    for (const id of CAR_IDS) {
      const car = CARS[id];
      const anchors = carAnchors(car);
      expect(anchors.rearWheel.z - anchors.frontWheel.z).toBeCloseTo(car.real.wheelbase, 9);
      expect(anchors.frontWheel.z).toBeLessThan(0);
      expect(anchors.rearWheel.z + car.sim.wheelRadius).toBeLessThan(anchors.bounds.rear);
      expect(anchors.bounds.rear - anchors.bounds.front).toBeCloseTo(car.real.length, 9);
      expect(anchors.frontWheel.y).toBeCloseTo(car.sim.frontWheelRadius, 9);
    }
  });

  it('orders the cars by straight-line pace as their power to weight suggests', () => {
    const mx5 = zeroTo100(CARS['mazda-mx5-na']);
    const m3 = zeroTo100(CARS['bmw-m3-e30']);
    const cayman = zeroTo100(CARS['porsche-cayman-s-987']);
    const mustang = zeroTo100(CARS['ford-mustang-gt-s550']);
    expect(mx5).toBeGreaterThan(m3);
    expect(m3).toBeGreaterThan(mustang);
    expect(m3).toBeGreaterThan(cayman);
  });

  it('reaches, and never passes, each car top speed using every gear it has', () => {
    for (const id of CAR_IDS) {
      const car = CARS[id];
      let state = createCar(car, origin);
      let topGear = 1;
      for (let i = 0; i < 60 * 90; i++) {
        state = stepCar(car, state, { ...NO_INPUT, throttle: 1 }, dt);
        topGear = Math.max(topGear, state.gear);
        expect(state.gear).toBeLessThanOrEqual(car.real.gearRatios.length);
        expect(state.speed).toBeLessThanOrEqual(car.sim.maxSpeed + 1e-9);
      }
      expect(state.speed).toBeGreaterThan(car.sim.maxSpeed * 0.93);
      expect(topGear).toBeGreaterThanOrEqual(car.real.gearRatios.length - 1);
    }
  });
});

describe('game estimates', () => {
  it('measures each car by running it', () => {
    for (const id of CAR_IDS) {
      const car = CARS[id];
      const estimates = estimateCar(car, clubCircuit);
      expect(estimates.zeroTo100Seconds).toBeCloseTo(zeroTo100(car), 9);
      expect(estimates.topSpeedKmh).toBeGreaterThan(car.real.topSpeedKmh * 0.93);
      expect(estimates.topSpeedKmh).toBeLessThanOrEqual(car.real.topSpeedKmh + 1e-6);
      expect(estimates.botLapSeconds).not.toBeNull();
    }
  });
});

describe('bot across the roster', () => {
  for (const id of CAR_IDS) {
    it(`laps Club Circuit twice in the ${id} without touching a barrier`, () => {
      const car = CARS[id];
      const bot = createBot(clubCircuit, car);
      let state = createGame(clubCircuit, car);
      const events: GameEvent[] = [];
      let flyingShifts = 0;
      let grassSteps = 0;
      for (let i = 0; i < 60 * 90 && state.completedLaps < 2; i++) {
        const step = stepGame(state, bot(state), dt, clubCircuit, car);
        state = step.state;
        events.push(...step.events);
        if (state.surface === 'grass') grassSteps += 1;
        if (state.completedLaps === 1) {
          flyingShifts += step.events.filter((e) => e.type === 'gear-shift').length;
        }
      }
      expect(state.completedLaps).toBe(2);
      expect(events.filter((e) => e.type === 'wall-hit')).toHaveLength(0);
      expect(grassSteps).toBe(0);
      expect(state.bestLapSeconds ?? 999).toBeLessThan(35);
      // No gear hunting: a lap has fewer shifts than two per corner.
      expect(flyingShifts).toBeLessThan(14);
      expect(events.every((e) => e.type !== 'lap' || e.wallHits === 0)).toBe(true);
    });
  }
});
