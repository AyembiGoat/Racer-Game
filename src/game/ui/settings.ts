import type { CameraMode } from '../view';
import type { SpeedUnit } from './format';

export type MinimapMode = 'on' | 'rotating' | 'off';

export interface GameSettings {
  readonly speedUnit: SpeedUnit;
  readonly fov: number;
  readonly defaultCamera: CameraMode;
  readonly masterVolume: number;
  readonly hudScale: number;
  readonly minimap: MinimapMode;
  readonly inputTrace: boolean;
  readonly reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  speedUnit: 'kmh',
  fov: 64,
  defaultCamera: 'chase',
  masterVolume: 68,
  hudScale: 100,
  minimap: 'on',
  inputTrace: true,
  reducedMotion: false,
};

export type ControlAction =
  'accelerate' | 'brake' | 'steerLeft' | 'steerRight' | 'handbrake' | 'camera' | 'reset' | 'pause';

export type BindingPair = readonly [string | null, string | null];
export type KeyBindings = Record<ControlAction, BindingPair>;

export const DEFAULT_BINDINGS: KeyBindings = {
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space', null],
  camera: ['KeyC', null],
  reset: ['KeyR', null],
  pause: ['Escape', null],
};

export interface ControlActionMeta {
  readonly id: ControlAction;
  readonly label: string;
  readonly group: 'driving' | 'view' | 'session';
  readonly description: string;
  readonly locked?: boolean;
  readonly lockedReason?: string;
}

export const CONTROL_ACTIONS: readonly ControlActionMeta[] = [
  {
    id: 'accelerate',
    label: 'Accelerate',
    group: 'driving',
    description: 'Applies throttle; also slows the car while reversing.',
  },
  {
    id: 'brake',
    label: 'Brake / reverse',
    group: 'driving',
    description: 'Applies brakes while moving forward; engages reverse after stopping.',
  },
  {
    id: 'steerLeft',
    label: 'Steer left',
    group: 'driving',
    description: 'Turns the front wheels left with speed-sensitive lock.',
  },
  {
    id: 'steerRight',
    label: 'Steer right',
    group: 'driving',
    description: 'Turns the front wheels right with speed-sensitive lock.',
  },
  {
    id: 'handbrake',
    label: 'Handbrake',
    group: 'driving',
    description: 'Locks the rear axle to rotate the car in tight corners.',
  },
  {
    id: 'camera',
    label: 'Switch camera',
    group: 'view',
    description: 'Cycles between chase and bonnet views.',
  },
  {
    id: 'reset',
    label: 'Reset to grid',
    group: 'session',
    description: 'Returns the car to the starting line and restarts the current lap.',
  },
  {
    id: 'pause',
    label: 'Pause / back',
    group: 'session',
    description: 'Pauses the session and navigates back from menus.',
    locked: true,
    lockedReason: 'Pause stays bound to Escape so menus are always reachable.',
  },
];

const SETTINGS_KEY = 'racer-game.settings.v1';
const BINDINGS_KEY = 'racer-game.bindings.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.max(min, Math.min(max, value)));
}

function validateSettings(raw: unknown): GameSettings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS;
  const speedUnit: SpeedUnit = raw.speedUnit === 'mph' ? 'mph' : 'kmh';
  const defaultCamera: CameraMode = raw.defaultCamera === 'bonnet' ? 'bonnet' : 'chase';
  const minimap: MinimapMode =
    raw.minimap === 'off' || raw.minimap === 'rotating' ? raw.minimap : 'on';

  return {
    speedUnit,
    fov: clampNumber(raw.fov, 50, 85, DEFAULT_SETTINGS.fov),
    defaultCamera,
    masterVolume: clampNumber(raw.masterVolume, 0, 100, DEFAULT_SETTINGS.masterVolume),
    hudScale: clampNumber(raw.hudScale, 80, 120, DEFAULT_SETTINGS.hudScale),
    minimap,
    inputTrace: typeof raw.inputTrace === 'boolean' ? raw.inputTrace : DEFAULT_SETTINGS.inputTrace,
    reducedMotion:
      typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
  };
}

function validateCode(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 32 ? trimmed : null;
}

function validateBindings(raw: unknown): KeyBindings {
  if (!isRecord(raw)) return cloneBindings(DEFAULT_BINDINGS);
  const next = cloneBindings(DEFAULT_BINDINGS);
  const used = new Set<string>(['Escape']);

  for (const meta of CONTROL_ACTIONS) {
    if (meta.locked) continue;
    const entry = raw[meta.id];
    if (!Array.isArray(entry) || entry.length < 2) {
      for (const code of next[meta.id]) {
        if (code) used.add(code);
      }
      continue;
    }
    const c0 = validateCode(entry[0]);
    const c1 = validateCode(entry[1]);
    const slot0 = c0 && !used.has(c0) ? c0 : null;
    if (slot0) used.add(slot0);
    const slot1 = c1 && !used.has(c1) ? c1 : null;
    if (slot1) used.add(slot1);
    next[meta.id] = [slot0, slot1];
  }
  return next;
}

export function cloneBindings(source: KeyBindings): KeyBindings {
  return {
    accelerate: [...source.accelerate] as BindingPair,
    brake: [...source.brake] as BindingPair,
    steerLeft: [...source.steerLeft] as BindingPair,
    steerRight: [...source.steerRight] as BindingPair,
    handbrake: [...source.handbrake] as BindingPair,
    camera: [...source.camera] as BindingPair,
    reset: [...source.reset] as BindingPair,
    pause: [...source.pause] as BindingPair,
  };
}

export function findBindingConflict(
  bindings: KeyBindings,
  targetAction: ControlAction,
  targetSlot: 0 | 1,
  code: string,
): { readonly action: ControlAction; readonly label: string; readonly slot: 0 | 1 } | null {
  for (const meta of CONTROL_ACTIONS) {
    const pair = bindings[meta.id];
    for (const slot of [0, 1] as const) {
      if (meta.id === targetAction && slot === targetSlot) continue;
      if (pair[slot] === code) {
        return { action: meta.id, label: meta.label, slot };
      }
    }
  }
  return null;
}

export function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function isReducedMotionActive(settings: GameSettings): boolean {
  return settings.reducedMotion || systemPrefersReducedMotion();
}

export interface SettingsStore {
  getSettings(): GameSettings;
  setSettings(patch: Partial<GameSettings>): GameSettings;
  resetSetting(key: keyof GameSettings): GameSettings;
  resetAllSettings(): GameSettings;
  getBindings(): KeyBindings;
  setBinding(
    action: ControlAction,
    slot: 0 | 1,
    code: string | null,
  ):
    | { readonly ok: true; readonly bindings: KeyBindings }
    | { readonly ok: false; readonly conflictLabel: string };
  resetBindingAction(action: ControlAction): KeyBindings;
  resetAllBindings(): KeyBindings;
  isStorageAvailable(): boolean;
  subscribe(listener: () => void): () => void;
}

export function createSettingsStore(): SettingsStore {
  let storageAvailable = true;

  function readStorage(key: string): unknown {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as unknown;
    } catch {
      storageAvailable = false;
      return null;
    }
  }

  function writeStorage(key: string, value: unknown): void {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
  }

  let settings = validateSettings(readStorage(SETTINGS_KEY));
  let bindings = validateBindings(readStorage(BINDINGS_KEY));
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) listener();
  }

  return {
    getSettings: () => settings,

    setSettings(patch) {
      settings = validateSettings({ ...settings, ...patch });
      writeStorage(SETTINGS_KEY, settings);
      notify();
      return settings;
    },

    resetSetting(key) {
      settings = validateSettings({ ...settings, [key]: DEFAULT_SETTINGS[key] });
      writeStorage(SETTINGS_KEY, settings);
      notify();
      return settings;
    },

    resetAllSettings() {
      settings = { ...DEFAULT_SETTINGS };
      writeStorage(SETTINGS_KEY, settings);
      notify();
      return settings;
    },

    getBindings: () => bindings,

    setBinding(action, slot, code) {
      const meta = CONTROL_ACTIONS.find((a) => a.id === action);
      if (meta?.locked) {
        return { ok: false, conflictLabel: meta.label };
      }
      if (code !== null) {
        if (code === 'Escape') {
          return { ok: false, conflictLabel: 'Pause / back' };
        }
        const conflict = findBindingConflict(bindings, action, slot, code);
        if (conflict) {
          return { ok: false, conflictLabel: conflict.label };
        }
      }
      const nextPair: BindingPair =
        slot === 0 ? [code, bindings[action][1]] : [bindings[action][0], code];
      bindings = { ...bindings, [action]: nextPair };
      writeStorage(BINDINGS_KEY, bindings);
      notify();
      return { ok: true, bindings };
    },

    resetBindingAction(action) {
      const def = DEFAULT_BINDINGS[action];
      // Clear any conflicts on other actions only if needed? Check if default keys are used elsewhere.
      const next = cloneBindings(bindings);
      const slot0 =
        def[0] && !findBindingConflict(next, action, 0, def[0]) ? def[0] : next[action][0];
      const slot1 =
        def[1] && !findBindingConflict(next, action, 1, def[1]) ? def[1] : next[action][1];
      next[action] = [slot0, slot1];
      bindings = next;
      writeStorage(BINDINGS_KEY, bindings);
      notify();
      return bindings;
    },

    resetAllBindings() {
      bindings = cloneBindings(DEFAULT_BINDINGS);
      writeStorage(BINDINGS_KEY, bindings);
      notify();
      return bindings;
    },

    isStorageAvailable: () => storageAvailable,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
