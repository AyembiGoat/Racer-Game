import type { GameEvent, GameState } from '../../core/game';
import type { AudioEngine } from './engine';
import { createEngine } from './engine';
import {
  checkpointTick,
  createContinuousRig,
  gearShiftClack,
  lapChime,
  uiBack,
  uiConfirm,
  uiFocus,
  uiPersonalBest,
  uiSelect,
  uiWarning,
  wallHit,
} from './sounds';

export type UiSoundKind = 'focus' | 'select' | 'back' | 'confirm' | 'warning' | 'personal-best';

export function createAudio() {
  let engine: AudioEngine | null = null;
  let rig: ReturnType<typeof createContinuousRig> | null = null;
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
      rig = createContinuousRig(engine);
    },

    setMasterVolume(level: number) {
      pendingMasterLevel = Math.max(0, Math.min(1, level));
      engine?.setMasterLevel(pendingMasterLevel);
    },

    playUi(kind: UiSoundKind) {
      if (!engine) return;
      if (kind === 'focus') uiFocus(engine);
      else if (kind === 'select') uiSelect(engine);
      else if (kind === 'back') uiBack(engine);
      else if (kind === 'confirm') uiConfirm(engine);
      else if (kind === 'warning') uiWarning(engine);
      else uiPersonalBest(engine);
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
        surface: state.surface,
      });
    },

    handle(events: readonly GameEvent[]) {
      if (!engine || !rig) return;
      for (const event of events) {
        if (event.type === 'gear-shift') {
          rig.notifyShift();
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

const MEASURED: Record<string, (engine: AudioEngine) => void> = {
  wallHit: (engine) => {
    wallHit(engine, 16, 0.02);
  },
  motorFullLoad: (engine) => {
    const rig = createContinuousRig(engine);
    rig.update({ rpm: 6200, throttle: 1, speed: 38, slip: 0, surface: 'tarmac' }, 0.01);
  },
  motorIdle: (engine) => {
    const rig = createContinuousRig(engine);
    rig.update({ rpm: 950, throttle: 0, speed: 0, slip: 0, surface: 'tarmac' }, 0.01);
  },
  kerbRumble: (engine) => {
    const rig = createContinuousRig(engine);
    rig.update({ rpm: 950, throttle: 0, speed: 28, slip: 0, surface: 'kerb' }, 0.01);
  },
  tyreSlip: (engine) => {
    const rig = createContinuousRig(engine);
    rig.update({ rpm: 950, throttle: 0, speed: 26, slip: 0.9, surface: 'tarmac' }, 0.01);
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
};

/**
 * Render each sound offline without speakers and report peak amplitude relative
 * to a full-strength barrier hit (`wallHit = 1`). Used by `scripts/playtest.mjs`.
 */
export async function measureSounds(): Promise<Record<string, number>> {
  const peaks: Record<string, number> = {};
  for (const [name, trigger] of Object.entries(MEASURED)) {
    const context = new OfflineAudioContext(2, Math.floor(48000 * 0.45), 48000);
    trigger(createEngine(context));
    const rendered = await context.startRendering();
    let peak = 0;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      for (const sample of rendered.getChannelData(ch)) {
        peak = Math.max(peak, Math.abs(sample));
      }
    }
    peaks[name] = peak;
  }
  const reference = peaks.wallHit || 1;
  return Object.fromEntries(
    Object.entries(peaks).map(([name, peak]) => [name, Math.round((peak / reference) * 100) / 100]),
  );
}
