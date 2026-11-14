import type { CarId } from './cars';
import { CAR_IDS, CARS, isCarId, STARTER_CAR_ID } from './cars';

/** Rules and rationale: reference/economy.md. */
export const CAREER_SCHEMA = 1;
export const MAX_CREDITS = 9_999_999;
const MIN_LAP_SECONDS = 5;

export const REWARDS = {
  lap: 500,
  cleanLap: 250,
  personalBest: 300,
  /** A new best must beat the old one by this much to pay the bonus. */
  minImprovementSeconds: 0.25,
  /** Par is the bot's standing-start lap times this, rounded up to a tenth. */
  parFactor: 1.15,
} as const;

/** Par lap per car on Club Circuit; a unit test holds these to the bot's laps. */
export const PAR_SECONDS: Readonly<Record<CarId, number>> = {
  'bmw-m3-e30': 31.1,
  'mazda-mx5-na': 32.8,
  'ford-mustang-gt-s550': 28.8,
  'porsche-cayman-s-987': 28.7,
};

export function parFromBotLap(botLapSeconds: number): number {
  return Math.ceil(botLapSeconds * REWARDS.parFactor * 10 - 1e-9) / 10;
}

export interface CarRecord {
  readonly bestLapSeconds: number | null;
  readonly distanceMetres: number;
}

export interface Career {
  readonly schema: typeof CAREER_SCHEMA;
  readonly credits: number;
  readonly owned: readonly CarId[];
  readonly equipped: CarId;
  readonly records: Readonly<Record<CarId, CarRecord>>;
}

function emptyRecords(): Record<CarId, CarRecord> {
  const records = {} as Record<CarId, CarRecord>;
  for (const id of CAR_IDS) records[id] = { bestLapSeconds: null, distanceMetres: 0 };
  return records;
}

export function createCareer(): Career {
  return {
    schema: CAREER_SCHEMA,
    credits: 0,
    owned: [STARTER_CAR_ID],
    equipped: STARTER_CAR_ID,
    records: emptyRecords(),
  };
}

export type BestLapOutcome = 'first' | 'improved' | 'small-gain' | 'over-par' | 'none';

export interface LapReward {
  readonly lap: number;
  readonly clean: number;
  readonly personalBest: number;
  readonly total: number;
  readonly bestLap: BestLapOutcome;
}

export interface LapOutcome {
  readonly carId: CarId;
  readonly lapSeconds: number;
  readonly wallHits: number;
}

export function lapReward(career: Career, outcome: LapOutcome): LapReward {
  const previous = career.records[outcome.carId].bestLapSeconds;
  let bestLap: BestLapOutcome = 'none';
  if (previous === null) bestLap = 'first';
  else if (outcome.lapSeconds < previous) {
    if (outcome.lapSeconds >= PAR_SECONDS[outcome.carId]) bestLap = 'over-par';
    else if (previous - outcome.lapSeconds < REWARDS.minImprovementSeconds) bestLap = 'small-gain';
    else bestLap = 'improved';
  }
  const clean = outcome.wallHits === 0 ? REWARDS.cleanLap : 0;
  const personalBest = bestLap === 'first' || bestLap === 'improved' ? REWARDS.personalBest : 0;
  return {
    lap: REWARDS.lap,
    clean,
    personalBest,
    total: REWARDS.lap + clean + personalBest,
    bestLap,
  };
}

/** Banks one completed lap: pays the reward and updates the car's best lap. */
export function bankLap(
  career: Career,
  outcome: LapOutcome,
): { readonly career: Career; readonly reward: LapReward } {
  const reward = lapReward(career, outcome);
  const record = career.records[outcome.carId];
  const best =
    record.bestLapSeconds === null
      ? outcome.lapSeconds
      : Math.min(record.bestLapSeconds, outcome.lapSeconds);
  return {
    reward,
    career: {
      ...career,
      credits: Math.min(MAX_CREDITS, career.credits + reward.total),
      records: { ...career.records, [outcome.carId]: { ...record, bestLapSeconds: best } },
    },
  };
}

export function addDistance(career: Career, carId: CarId, metres: number): Career {
  if (!Number.isFinite(metres) || metres <= 0) return career;
  const record = career.records[carId];
  return {
    ...career,
    records: {
      ...career.records,
      [carId]: { ...record, distanceMetres: record.distanceMetres + metres },
    },
  };
}

export type PurchaseResult =
  | { readonly ok: true; readonly career: Career }
  | {
      readonly ok: false;
      readonly career: Career;
      readonly reason: 'unknown-car' | 'already-owned' | 'insufficient-credits';
      readonly shortfall: number;
    };

export function purchaseCar(career: Career, carId: string): PurchaseResult {
  if (!isCarId(carId)) return { ok: false, career, reason: 'unknown-car', shortfall: 0 };
  if (career.owned.includes(carId)) {
    return { ok: false, career, reason: 'already-owned', shortfall: 0 };
  }
  const price = CARS[carId].price;
  if (career.credits < price) {
    return { ok: false, career, reason: 'insufficient-credits', shortfall: price - career.credits };
  }
  return {
    ok: true,
    career: { ...career, credits: career.credits - price, owned: [...career.owned, carId] },
  };
}

export type EquipResult =
  | { readonly ok: true; readonly career: Career }
  | { readonly ok: false; readonly career: Career; readonly reason: 'unknown-car' | 'not-owned' };

export function equipCar(career: Career, carId: string): EquipResult {
  if (!isCarId(carId)) return { ok: false, career, reason: 'unknown-car' };
  if (!career.owned.includes(carId)) return { ok: false, career, reason: 'not-owned' };
  return { ok: true, career: { ...career, equipped: carId } };
}

export function serializeCareer(career: Career): string {
  return JSON.stringify(career);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a saved career. Text that is not a schema-1 object gives a fresh career; a bad
 * field inside a valid save resets only that field. `repaired` reports either case.
 */
export function parseCareer(text: string | null): {
  readonly career: Career;
  readonly repaired: boolean;
} {
  if (text === null) return { career: createCareer(), repaired: false };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { career: createCareer(), repaired: true };
  }
  if (!isObject(raw) || raw['schema'] !== CAREER_SCHEMA) {
    return { career: createCareer(), repaired: true };
  }
  let repaired = false;

  let credits = 0;
  const rawCredits = raw['credits'];
  if (
    typeof rawCredits === 'number' &&
    Number.isInteger(rawCredits) &&
    rawCredits >= 0 &&
    rawCredits <= MAX_CREDITS
  ) {
    credits = rawCredits;
  } else repaired = true;

  const owned: CarId[] = [STARTER_CAR_ID];
  const rawOwned = raw['owned'];
  if (Array.isArray(rawOwned)) {
    for (const id of rawOwned as unknown[]) {
      if (!isCarId(id)) repaired = true;
      else if (!owned.includes(id)) owned.push(id);
    }
    if (!rawOwned.includes(STARTER_CAR_ID)) repaired = true;
  } else repaired = true;
  owned.sort((a, b) => CAR_IDS.indexOf(a) - CAR_IDS.indexOf(b));

  let equipped = STARTER_CAR_ID;
  const rawEquipped = raw['equipped'];
  if (isCarId(rawEquipped) && owned.includes(rawEquipped)) equipped = rawEquipped;
  else repaired = true;

  const records = emptyRecords();
  const rawRecords = raw['records'];
  if (isObject(rawRecords)) {
    for (const id of CAR_IDS) {
      const entry = rawRecords[id];
      if (!isObject(entry)) {
        repaired = true;
        continue;
      }
      const best = entry['bestLapSeconds'];
      const distance = entry['distanceMetres'];
      let bestLapSeconds: number | null = null;
      if (typeof best === 'number' && Number.isFinite(best) && best >= MIN_LAP_SECONDS) {
        bestLapSeconds = best;
      } else if (best !== null) repaired = true;
      let distanceMetres = 0;
      if (typeof distance === 'number' && Number.isFinite(distance) && distance >= 0) {
        distanceMetres = distance;
      } else repaired = true;
      records[id] = { bestLapSeconds, distanceMetres };
    }
  } else repaired = true;

  return { career: { schema: CAREER_SCHEMA, credits, owned, equipped, records }, repaired };
}
