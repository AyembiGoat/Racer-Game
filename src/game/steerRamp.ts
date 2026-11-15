/**
 * Turns a held steering key into a steering position, -1..1. A key is on or off, so the
 * position moves over time: a tap gives a small correction and a hold builds to full lock.
 */
export const STEER_RAMP = {
  /** Seconds from centre to full lock while a key is held. */
  onsetSeconds: 0.24,
  /** Seconds from full lock back to centre once the key is released. */
  releaseSeconds: 0.12,
} as const;

export function rampSteer(current: number, raw: number, dt: number): number {
  const returning = raw === 0 || Math.sign(raw) !== Math.sign(current);
  // Coming back through centre uses the quicker rate, so a change of direction is prompt.
  const rate =
    (returning && current !== 0 ? 1 / STEER_RAMP.releaseSeconds : 1 / STEER_RAMP.onsetSeconds) * dt;
  const delta = raw - current;
  const next = Math.abs(delta) <= rate ? raw : current + Math.sign(delta) * rate;
  // Stop at centre for one step when crossing it, so the onset rate applies from there.
  if (raw !== 0 && current !== 0 && Math.sign(next) !== Math.sign(current)) return 0;
  return Math.max(-1, Math.min(1, next));
}
