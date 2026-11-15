import { describe, expect, it } from 'vitest';
import { createBot } from './bot';
import type { Career } from './career';
import {
  addDistance,
  bankLap,
  createCareer,
  equipCar,
  lapReward,
  MAX_CREDITS,
  PAR_SECONDS,
  parFromBotLap,
  parseCareer,
  purchaseCar,
  REWARDS,
  serializeCareer,
} from './career';
import { CAR_IDS, CARS } from './cars';
import { SIM_STEP_SECONDS } from './fixedLoop';
import { createGame, stepGame } from './game';
import { clubCircuit } from './tracks/clubCircuit';

const m3 = 'bmw-m3-e30';
const mx5 = 'mazda-mx5-na';

function withCredits(credits: number): Career {
  return { ...createCareer(), credits };
}

describe('lap rewards', () => {
  it('pays lap, clean and first-lap bonus on the first clean lap in a car', () => {
    const reward = lapReward(createCareer(), { carId: m3, lapSeconds: 40, wallHits: 0 });
    expect(reward).toEqual({
      lap: 500,
      clean: 250,
      personalBest: 300,
      total: 1050,
      bestLap: 'first',
    });
  });

  it('withholds the clean bonus after any barrier contact', () => {
    const reward = lapReward(createCareer(), { carId: m3, lapSeconds: 40, wallHits: 1 });
    expect(reward.clean).toBe(0);
    expect(reward.total).toBe(REWARDS.lap + REWARDS.personalBest);
  });

  it('pays the personal-best bonus only for a real gain under par', () => {
    const first = bankLap(createCareer(), { carId: m3, lapSeconds: 40, wallHits: 0 }).career;
    // Faster, but still slower than par: record moves, no bonus.
    const overPar = bankLap(first, { carId: m3, lapSeconds: 35, wallHits: 0 });
    expect(overPar.reward.bestLap).toBe('over-par');
    expect(overPar.reward.personalBest).toBe(0);
    expect(overPar.career.records[m3].bestLapSeconds).toBe(35);

    const underPar = bankLap(overPar.career, { carId: m3, lapSeconds: 29, wallHits: 0 });
    expect(underPar.reward.bestLap).toBe('improved');
    expect(underPar.reward.personalBest).toBe(REWARDS.personalBest);

    const sliver = bankLap(underPar.career, { carId: m3, lapSeconds: 28.9, wallHits: 0 });
    expect(sliver.reward.bestLap).toBe('small-gain');
    expect(sliver.reward.personalBest).toBe(0);
    expect(sliver.career.records[m3].bestLapSeconds).toBe(28.9);

    const slower = bankLap(sliver.career, { carId: m3, lapSeconds: 30, wallHits: 0 });
    expect(slower.reward.bestLap).toBe('none');
    expect(slower.career.records[m3].bestLapSeconds).toBe(28.9);
  });

  it('cannot be farmed by creeping down from a slow first lap', () => {
    let career = bankLap(createCareer(), { carId: m3, lapSeconds: 90, wallHits: 0 }).career;
    let bonuses = 0;
    for (let seconds = 89; seconds > PAR_SECONDS[m3]; seconds -= 1) {
      const banked = bankLap(career, { carId: m3, lapSeconds: seconds, wallHits: 0 });
      bonuses += banked.reward.personalBest;
      career = banked.career;
    }
    expect(bonuses).toBe(0);
  });

  it('keeps best laps per car and caps the balance', () => {
    const career = bankLap(withCredits(MAX_CREDITS - 10), {
      carId: mx5,
      lapSeconds: 31,
      wallHits: 0,
    }).career;
    expect(career.credits).toBe(MAX_CREDITS);
    expect(career.records[mx5].bestLapSeconds).toBe(31);
    expect(career.records[m3].bestLapSeconds).toBeNull();
  });

  it('holds each par time to the bot lap in that car', () => {
    for (const id of CAR_IDS) {
      const car = CARS[id];
      const bot = createBot(clubCircuit, car);
      let state = createGame(clubCircuit, car);
      for (let i = 0; i < 60 * 90 && state.completedLaps < 1; i++) {
        state = stepGame(state, bot(state), SIM_STEP_SECONDS, clubCircuit, car).state;
      }
      expect(state.lastLapSeconds).not.toBeNull();
      expect(PAR_SECONDS[id]).toBe(parFromBotLap(state.lastLapSeconds ?? 0));
    }
  });
});

describe('purchase and equip', () => {
  it('refuses a purchase the balance cannot cover and reports the shortfall', () => {
    const before = withCredits(4499);
    const result = purchaseCar(before, mx5);
    expect(result.ok).toBe(false);
    expect(result.career).toBe(before);
    if (!result.ok) {
      expect(result.reason).toBe('insufficient-credits');
      expect(result.shortfall).toBe(1);
    }
  });

  it('deducts the price and adds the car without equipping it', () => {
    const result = purchaseCar(withCredits(5000), mx5);
    expect(result.ok).toBe(true);
    expect(result.career.credits).toBe(500);
    expect(result.career.owned).toEqual([m3, mx5]);
    expect(result.career.equipped).toBe(m3);
  });

  it('refuses a second purchase of the same car and unknown cars', () => {
    const owned = purchaseCar(withCredits(20000), mx5).career;
    const again = purchaseCar(owned, mx5);
    expect(again.ok).toBe(false);
    expect(again.career.credits).toBe(15500);
    if (!again.ok) expect(again.reason).toBe('already-owned');
    const unknown = purchaseCar(owned, 'fast-car');
    if (!unknown.ok) expect(unknown.reason).toBe('unknown-car');
    expect(unknown.ok).toBe(false);
  });

  it('equips only owned cars', () => {
    const career = createCareer();
    const refused = equipCar(career, mx5);
    expect(refused.ok).toBe(false);
    expect(refused.career.equipped).toBe(m3);
    const owned = purchaseCar(withCredits(4500), mx5).career;
    expect(equipCar(owned, mx5).career.equipped).toBe(mx5);
    expect(equipCar(owned, 'nope').ok).toBe(false);
  });

  it('prices every car in whole laps of honest driving', () => {
    expect(CARS[m3].price).toBe(0);
    for (const id of CAR_IDS) {
      expect(CARS[id].price % 250).toBe(0);
    }
  });
});

describe('persistence', () => {
  it('round-trips a career', () => {
    let career = purchaseCar(withCredits(6000), mx5).career;
    career = equipCar(career, mx5).career;
    career = bankLap(career, { carId: mx5, lapSeconds: 30.5, wallHits: 0 }).career;
    career = addDistance(career, mx5, 1234.5);
    const loaded = parseCareer(serializeCareer(career));
    expect(loaded.repaired).toBe(false);
    expect(loaded.career).toEqual(career);
  });

  it('starts fresh with nothing stored, and flags text it cannot read', () => {
    expect(parseCareer(null)).toEqual({ career: createCareer(), repaired: false });
    for (const text of ['{not json', '[]', '42', 'null', '{"schema":2,"credits":999}']) {
      expect(parseCareer(text)).toEqual({ career: createCareer(), repaired: true });
    }
  });

  it('repairs bad fields one at a time', () => {
    const text = JSON.stringify({
      schema: 1,
      credits: -50,
      owned: [mx5, 'ghost-car', mx5],
      equipped: 'porsche-cayman-s-987',
      records: {
        [m3]: { bestLapSeconds: 27.5, distanceMetres: 900 },
        [mx5]: { bestLapSeconds: 0.2, distanceMetres: -4 },
      },
    });
    const { career, repaired } = parseCareer(text);
    expect(repaired).toBe(true);
    expect(career.credits).toBe(0);
    expect(career.owned).toEqual([m3, mx5]);
    expect(career.equipped).toBe(m3);
    expect(career.records[m3]).toEqual({ bestLapSeconds: 27.5, distanceMetres: 900 });
    expect(career.records[mx5]).toEqual({ bestLapSeconds: null, distanceMetres: 0 });
  });

  it('rejects fractional, huge and non-numeric balances', () => {
    for (const credits of [10.5, MAX_CREDITS + 1, '500', null, Number.NaN]) {
      const text = JSON.stringify({ ...createCareer(), credits });
      expect(parseCareer(text).career.credits).toBe(0);
    }
  });

  it('adds distance only for real movement', () => {
    const career = createCareer();
    expect(addDistance(career, m3, 0)).toBe(career);
    expect(addDistance(career, m3, Number.NaN)).toBe(career);
    expect(addDistance(career, m3, 12).records[m3].distanceMetres).toBe(12);
  });
});
