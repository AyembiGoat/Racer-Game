import { describe, expect, it } from 'vitest';
import { createFixedLoop } from './fixedLoop';

function countSteps(elapsed: number[], stepSeconds = 0.25, maxSteps = 5) {
  const loop = createFixedLoop(stepSeconds, maxSteps);
  let steps = 0;
  let alpha = 0;
  for (const e of elapsed) {
    alpha = loop.advance(e, (dt) => {
      expect(dt).toBe(stepSeconds);
      steps++;
    });
  }
  return { steps, alpha };
}

describe('createFixedLoop', () => {
  it('does not step until a full step has accumulated', () => {
    expect(countSteps([0.125])).toEqual({ steps: 0, alpha: 0.5 });
  });

  it('carries the remainder across frames', () => {
    expect(countSteps([0.125, 0.125, 0.125])).toEqual({ steps: 1, alpha: 0.5 });
  });

  it('runs several steps to catch up after a slow frame', () => {
    expect(countSteps([0.75])).toEqual({ steps: 3, alpha: 0 });
  });

  it('caps the backlog after a long stall', () => {
    expect(countSteps([100]).steps).toBe(5);
  });
});
