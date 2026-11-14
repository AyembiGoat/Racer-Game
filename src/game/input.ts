import type { GameInput } from '../core/game';
import { clamp, moveToward } from '../core/vec';
import type { ControlAction, KeyBindings } from './ui/settings';
import { DEFAULT_BINDINGS } from './ui/settings';

export interface HumanActions {
  readonly cycleCamera: boolean;
  readonly reset: boolean;
  readonly pause: boolean;
}

export function createHumanInput(getBindings: () => KeyBindings = () => DEFAULT_BINDINGS) {
  const held = new Set<string>();
  let cycleCamera = false;
  let reset = false;
  let pause = false;
  let smoothedSteer = 0;
  let smoothedThrottle = 0;
  let captureActions = true;

  const matchesAction = (action: ControlAction, code: string): boolean => {
    const pair = getBindings()[action];
    return pair[0] === code || pair[1] === code;
  };

  const anyHeld = (action: ControlAction): boolean => {
    const pair = getBindings()[action];
    return (pair[0] !== null && held.has(pair[0])) || (pair[1] !== null && held.has(pair[1]));
  };

  const isBoundKey = (code: string): boolean => {
    const bindings = getBindings();
    for (const pair of Object.values(bindings)) {
      if (pair[0] === code || pair[1] === code) return true;
    }
    return false;
  };

  window.addEventListener('keydown', (event) => {
    if (!captureActions) return;
    if (isBoundKey(event.code) && (event.code === 'Space' || event.code.startsWith('Arrow'))) {
      event.preventDefault();
    }
    if (!event.repeat) {
      if (matchesAction('camera', event.code)) cycleCamera = true;
      if (matchesAction('reset', event.code)) reset = true;
      if (matchesAction('pause', event.code)) pause = true;
    }
    held.add(event.code);
  });

  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });

  window.addEventListener('blur', () => {
    held.clear();
    smoothedSteer = 0;
    smoothedThrottle = 0;
  });

  return {
    setCaptureEnabled(enabled: boolean) {
      captureActions = enabled;
      if (!enabled) {
        held.clear();
        smoothedSteer = 0;
        smoothedThrottle = 0;
        cycleCamera = false;
        reset = false;
        pause = false;
      }
    },

    /** Sample one 60 Hz step of input with gentle progressive keyboard ramp-in. */
    sample(dtSeconds: number): GameInput {
      const rawThrottle = anyHeld('accelerate') ? 1 : 0;
      const brake = anyHeld('brake') ? 1 : 0;
      const left = anyHeld('steerLeft') ? 1 : 0;
      const right = anyHeld('steerRight') ? 1 : 0;
      const rawSteer = right - left;

      // Progressive onset makes brief steering taps subtle on straights; releasing
      // drops immediately to 0 so the car's caster self-centres without lag.
      if (rawSteer === 0) {
        smoothedSteer = 0;
      } else if (Math.sign(rawSteer) !== Math.sign(smoothedSteer) && smoothedSteer !== 0) {
        smoothedSteer = rawSteer * 0.35;
      } else {
        smoothedSteer = clamp(moveToward(smoothedSteer, rawSteer, dtSeconds / 0.075), -1, 1);
      }

      smoothedThrottle =
        rawThrottle === 0 ? 0 : moveToward(smoothedThrottle, rawThrottle, dtSeconds / 0.05);

      return {
        throttle: smoothedThrottle,
        brake,
        steer: smoothedSteer,
        handbrake: anyHeld('handbrake'),
      };
    },

    consumeActions(): HumanActions {
      const actions: HumanActions = { cycleCamera, reset, pause };
      cycleCamera = false;
      reset = false;
      pause = false;
      return actions;
    },

    clear() {
      held.clear();
      smoothedSteer = 0;
      smoothedThrottle = 0;
      cycleCamera = false;
      reset = false;
      pause = false;
    },
  };
}
