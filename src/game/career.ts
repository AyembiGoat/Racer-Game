import type { Career, EquipResult, LapOutcome, LapReward, PurchaseResult } from '../core/career';
import {
  MAX_CREDITS,
  addDistance,
  bankLap,
  createCareer,
  equipCar,
  parseCareer,
  purchaseCar,
  serializeCareer,
} from '../core/career';
import type { CarId } from '../core/cars';

export const CAREER_STORAGE_KEY = 'racer-game.career.v1';

/**
 * The saved career: credits, owned cars, equipped car and per-car records. Rules live in
 * `core/career`; this holds the current value and writes it to browser storage when it
 * changes, never per frame.
 */
/**
 * Test switch: credits never run out, so every car can be bought and looked at. Opening
 * the game with `?economy` in the address turns it off and uses the real balance.
 */
const UNLIMITED_CREDITS = !new URLSearchParams(window.location.search).has('economy');

const topUp = (career: Career): Career =>
  UNLIMITED_CREDITS && career.credits !== MAX_CREDITS
    ? { ...career, credits: MAX_CREDITS }
    : career;

export function createCareerStore() {
  let storageAvailable = true;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(CAREER_STORAGE_KEY);
  } catch {
    storageAvailable = false;
  }
  const loaded = parseCareer(stored);
  let career = topUp(loaded.career);
  const listeners = new Set<() => void>();

  function commit(changed: Career) {
    const next = topUp(changed);
    if (next === career) return;
    career = next;
    try {
      window.localStorage.setItem(CAREER_STORAGE_KEY, serializeCareer(career));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
    for (const listener of listeners) listener();
  }

  if (loaded.repaired) {
    // Write the repaired save back so the next load is clean.
    const repaired = career;
    career = { ...repaired };
    commit(repaired);
  }

  return {
    get: (): Career => career,
    /** True when the stored save was unreadable or had fields that needed repair. */
    wasRepaired: () => loaded.repaired,
    isStorageAvailable: () => storageAvailable,
    isUnlimited: () => UNLIMITED_CREDITS,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    bankLap(outcome: LapOutcome): LapReward {
      const banked = bankLap(career, outcome);
      commit(banked.career);
      return banked.reward;
    },
    addDistance(carId: CarId, metres: number) {
      commit(addDistance(career, carId, metres));
    },
    purchase(carId: string): PurchaseResult {
      const result = purchaseCar(career, carId);
      commit(result.career);
      return result;
    },
    equip(carId: string): EquipResult {
      const result = equipCar(career, carId);
      commit(result.career);
      return result;
    },
    reset() {
      commit(createCareer());
    },
  };
}

export type CareerStore = ReturnType<typeof createCareerStore>;
