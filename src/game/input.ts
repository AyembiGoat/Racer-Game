import type { GameInput } from '../core/game';

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
  });

  const anyHeld = (...codes: string[]) => codes.some((code) => held.has(code));

  return {
    sample(): GameInput {
      const throttle = anyHeld('KeyW', 'ArrowUp') ? 1 : 0;
      const brake = anyHeld('KeyS', 'ArrowDown') ? 1 : 0;
      const left = anyHeld('KeyA', 'ArrowLeft') ? 1 : 0;
      const right = anyHeld('KeyD', 'ArrowRight') ? 1 : 0;
      return {
        throttle,
        brake,
        steer: right - left,
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
      cycleCamera = false;
      reset = false;
      pause = false;
    },
  };
}
