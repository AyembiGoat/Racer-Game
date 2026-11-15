import { describe, expect, it } from 'vitest';
import { rampSteer, STEER_RAMP } from './steerRamp';

const dt = 1 / 60;
const hold = (start: number, raw: number, seconds: number) => {
  let value = start;
  for (let i = 0; i < Math.round(seconds / dt); i++) value = rampSteer(value, raw, dt);
  return value;
};

describe('rampSteer', () => {
  it('turns a short tap into a small correction and a hold into full lock', () => {
    expect(hold(0, 1, 0.1)).toBeCloseTo(0.1 / STEER_RAMP.onsetSeconds, 1);
    expect(hold(0, 1, STEER_RAMP.onsetSeconds + 0.02)).toBe(1);
    expect(hold(0, -1, 1)).toBe(-1);
  });

  it('eases back to centre on release instead of snapping', () => {
    expect(rampSteer(1, 0, dt)).toBeGreaterThan(0.8);
    expect(hold(1, 0, STEER_RAMP.releaseSeconds + 0.02)).toBe(0);
  });

  it('passes through centre when the direction changes and never overshoots', () => {
    let value = 1;
    let crossedAtZero = false;
    for (let i = 0; i < 60; i++) {
      const next = rampSteer(value, -1, dt);
      expect(Math.abs(next)).toBeLessThanOrEqual(1);
      if (value > 0 && next <= 0) crossedAtZero = next === 0;
      value = next;
    }
    expect(crossedAtZero).toBe(true);
    expect(value).toBe(-1);
  });
});
