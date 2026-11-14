import type { CarSpec } from '../../core/cars';
import { CAR_IDS, CARS, STARTER_CAR_ID } from '../../core/cars';
import type { GameEvent, GameState } from '../../core/game';
import type { AudioEngine } from './engine';
import { createEngine } from './engine';
import type { ContinuousRig } from './sounds';
import {
  checkpointTick,
  createContinuousRig,
  gearShiftClack,
  lapChime,
  uiBack,
  uiConfirm,
  uiDenied,
  uiFocus,
  uiPersonalBest,
  uiPurchase,
  uiSelect,
  uiWarning,
  wallHit,
} from './sounds';

export type UiSoundKind =
  'focus' | 'select' | 'back' | 'confirm' | 'warning' | 'personal-best' | 'purchase' | 'denied';

const UI_SOUNDS: Record<UiSoundKind, (engine: AudioEngine) => void> = {
  focus: uiFocus,
  select: uiSelect,
  back: uiBack,
  confirm: uiConfirm,
  warning: uiWarning,
  'personal-best': uiPersonalBest,
  purchase: uiPurchase,
  denied: uiDenied,
};

export function createAudio(initialCar: CarSpec) {
  let engine: AudioEngine | null = null;
  let rig: ContinuousRig | null = null;
  let car = initialCar;
  let pendingMasterLevel = 0.68;

  return {
    /** Start or resume audio after a user click or key press. */
    start() {
      if (engine) {
        if (engine.context instanceof AudioContext && engine.context.state === 'suspended') {
          void engine.context.resume();
        }
        return;
      }
      engine = createEngine(new AudioContext());
      engine.setMasterLevel(pendingMasterLevel);
      rig = createContinuousRig(engine, car);
    },

    /** Switches the engine voice to another car. */
    setCar(next: CarSpec) {
      car = next;
      if (!engine || rig?.car.id === next.id) return;
      rig?.dispose();
      rig = createContinuousRig(engine, next);
    },

    setMasterVolume(level: number) {
      pendingMasterLevel = Math.max(0, Math.min(1, level));
      engine?.setMasterLevel(pendingMasterLevel);
    },

    playUi(kind: UiSoundKind) {
      if (engine) UI_SOUNDS[kind](engine);
    },

    update(state: GameState, throttle: number, active: boolean) {
      if (!rig) return;
      if (!active) {
        rig.silence();
        return;
      }
      rig.update({
        rpm: state.car.rpm,
        throttle,
        speed: state.car.speed,
        slip: state.car.slip,
        cornerLoad: state.car.cornerLoad,
        surface: state.surface,
      });
    },

    handle(events: readonly GameEvent[]) {
      if (!engine || !rig) return;
      for (const event of events) {
        if (event.type === 'gear-shift') {
          rig.notifyShift(event.direction === 'up' ? 'up' : 'down');
        } else if (event.type === 'wall-hit') {
          wallHit(engine, event.impactSpeed);
        } else if (event.type === 'checkpoint') {
          checkpointTick(engine);
        } else if (event.isNewBest && event.lap > 1) {
          uiPersonalBest(engine);
        } else {
          lapChime(engine);
        }
      }
    },
  };
}

export type GameAudio = ReturnType<typeof createAudio>;

type Trigger = (engine: AudioEngine) => void;

const QUIET = { slip: 0, cornerLoad: 0, surface: 'tarmac' } as const;

function engineCases(car: CarSpec, prefix: string): Record<string, Trigger> {
  const high = car.real.powerRpm;
  const rig = (engine: AudioEngine) => createContinuousRig(engine, car);
  return {
    [`${prefix}FullLoad`]: (engine) => {
      rig(engine).update({ rpm: high, throttle: 1, speed: 38, ...QUIET }, 0.01);
    },
    [`${prefix}PartLoad`]: (engine) => {
      rig(engine).update({ rpm: high, throttle: 0.4, speed: 38, ...QUIET }, 0.01);
    },
    [`${prefix}Lift`]: (engine) => {
      rig(engine).update({ rpm: high, throttle: 0, speed: 38, ...QUIET }, 0.01);
    },
    [`${prefix}Idle`]: (engine) => {
      rig(engine).update({ rpm: car.real.idleRpm, throttle: 0, speed: 0, ...QUIET }, 0.01);
    },
  };
}

function measuredCases(): Record<string, Trigger> {
  const starter = CARS[STARTER_CAR_ID];
  const idle = { rpm: starter.real.idleRpm, throttle: 0 };
  const rig = (engine: AudioEngine) => createContinuousRig(engine, starter);
  const cases: Record<string, Trigger> = {
    wallHit: (engine) => {
      wallHit(engine, 16, 0.02);
    },
    ...engineCases(starter, 'motor'),
    kerbRumble: (engine) => {
      rig(engine).update({ ...idle, speed: 28, slip: 0, cornerLoad: 0, surface: 'kerb' }, 0.01);
    },
    tyreSlip: (engine) => {
      rig(engine).update({ ...idle, speed: 26, slip: 0.9, cornerLoad: 1, surface: 'tarmac' }, 0.01);
    },
    tyreScrub: (engine) => {
      rig(engine).update({ ...idle, speed: 26, slip: 0, cornerLoad: 1, surface: 'tarmac' }, 0.01);
    },
    grass: (engine) => {
      rig(engine).update({ ...idle, speed: 26, slip: 0, cornerLoad: 0, surface: 'grass' }, 0.01);
    },
    wind: (engine) => {
      rig(engine).update({ ...idle, speed: 55, ...QUIET }, 0.01);
    },
    gearShift: (engine) => {
      gearShiftClack(engine, 0.02);
    },
    checkpoint: (engine) => {
      checkpointTick(engine, 0.02);
    },
    lap: (engine) => {
      lapChime(engine, 0.02);
    },
    uiPersonalBest: (engine) => {
      uiPersonalBest(engine, 0.02);
    },
    uiFocus: (engine) => {
      uiFocus(engine, 0.02);
    },
    uiSelect: (engine) => {
      uiSelect(engine, 0.02);
    },
    uiBack: (engine) => {
      uiBack(engine, 0.02);
    },
    uiConfirm: (engine) => {
      uiConfirm(engine, 0.02);
    },
    uiWarning: (engine) => {
      uiWarning(engine, 0.02);
    },
    uiPurchase: (engine) => {
      uiPurchase(engine, 0.02);
    },
    uiDenied: (engine) => {
      uiDenied(engine, 0.02);
    },
  };
  for (const id of CAR_IDS) Object.assign(cases, engineCases(CARS[id], `engine:${id}:`));
  return cases;
}

export interface SoundLevel {
  /** Highest absolute sample, 0..1. */
  readonly peak: number;
  /** RMS level in dB relative to full scale. */
  readonly rmsDb: number;
}

/** Render each sound offline, without speakers, and report its peak and RMS level. */
export async function measureLevels(): Promise<Record<string, SoundLevel>> {
  const levels: Record<string, SoundLevel> = {};
  for (const [name, trigger] of Object.entries(measuredCases())) {
    const context = new OfflineAudioContext(2, Math.floor(48000 * 0.45), 48000);
    trigger(createEngine(context));
    const rendered = await context.startRendering();
    let peak = 0;
    let squares = 0;
    let count = 0;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      for (const sample of rendered.getChannelData(ch)) {
        peak = Math.max(peak, Math.abs(sample));
        squares += sample * sample;
        count += 1;
      }
    }
    levels[name] = {
      peak,
      rmsDb: Math.round(10 * Math.log10(squares / Math.max(count, 1) + 1e-12) * 10) / 10,
    };
  }
  return levels;
}

/**
 * Peak amplitude of each sound relative to a full-strength barrier hit (`wallHit = 1`).
 * Used by `scripts/playtest.mjs`.
 */
export async function measureSounds(): Promise<Record<string, number>> {
  const levels = await measureLevels();
  const reference = levels.wallHit?.peak || 1;
  return Object.fromEntries(
    Object.entries(levels).map(([name, level]) => [
      name,
      Math.round((level.peak / reference) * 100) / 100,
    ]),
  );
}
