/**
 * Fixed-timestep accumulator. Rendering runs at whatever rate the display gives
 * us; the simulation always advances in identical `stepSeconds` slices so that
 * handling and lap times do not change with frame rate.
 */

export const SIM_HZ = 60;
export const SIM_STEP_SECONDS = 1 / SIM_HZ;

export interface FixedLoop {
  /**
   * Feed elapsed real time. Calls `step` zero or more times and returns the
   * leftover fraction of a step (0..1) for render interpolation.
   */
  advance(elapsedSeconds: number, step: (dt: number) => void): number;
}

export function createFixedLoop(stepSeconds = SIM_STEP_SECONDS, maxStepsPerAdvance = 5): FixedLoop {
  let accumulator = 0;
  return {
    advance(elapsedSeconds, step) {
      // Cap the backlog so a long stall (tab switch, breakpoint) cannot spiral.
      accumulator = Math.min(accumulator + elapsedSeconds, stepSeconds * maxStepsPerAdvance);
      while (accumulator >= stepSeconds) {
        step(stepSeconds);
        accumulator -= stepSeconds;
      }
      return accumulator / stepSeconds;
    },
  };
}
