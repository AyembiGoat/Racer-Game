import type { GameInput } from '../core/game';
import { clamp, moveToward } from '../core/vec';

export interface HumanActions {
  readonly cycleCamera: boolean;
  readonly reset: boolean;
  readonly pause: boolean;
}

export function createHumanInput() {
  const held = new Set<string>();
  let cycleCamera = false;
  let reset = false;
  let pause = false;
  let smoothedSteer = 0;
  let smoothedThrottle = 0;

  const isControlKey = (code: string) =>
    code === 'Space' ||
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight';

  window.addEventListener('keydown', (event) => {
    if (isControlKey(event.code)) event.preventDefault();
    if (!event.repeat) {
      if (event.code === 'KeyC') cycleCamera = true;
      if (event.code === 'KeyR') reset = true;
      if (event.code === 'Escape') pause = true;
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

  const anyHeld = (...codes: string[]) => codes.some((code) => held.has(code));

  return {
    /** Sample one 60 Hz step of input with gentle progressive keyboard ramp-in. */
    sample(dtSeconds: number): GameInput {
      const rawThrottle = anyHeld('KeyW', 'ArrowUp') ? 1 : 0;
      const brake = anyHeld('KeyS', 'ArrowDown') ? 1 : 0;
      const left = anyHeld('KeyA', 'ArrowLeft') ? 1 : 0;
      const right = anyHeld('KeyD', 'ArrowRight') ? 1 : 0;
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
        handbrake: held.has('Space'),
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
