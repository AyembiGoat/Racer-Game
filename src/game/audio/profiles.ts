import type { CarId } from '../../core/cars';

/**
 * Engine voice for one car. Partials are multiples of the engine cycle (rpm / 120 Hz),
 * so the firing partial equals the cylinder count. Reasoning: reference/audio.md.
 */
export interface EngineVoice {
  /** [order, amplitude] pairs for the exhaust wave. */
  readonly partials: readonly (readonly [number, number])[];
  /** How hard the exhaust is driven into the shaper at full load, 0..1. */
  readonly drive: number;
  /** Two exhaust resonances in Hz and their boost in dB. */
  readonly bands: readonly [number, number];
  readonly bandGain: number;
  /** Low-pass corner at idle and how far it opens with revs and load, Hz. */
  readonly brightness: readonly [number, number, number];
  readonly intake: number;
  readonly body: number;
  readonly pops: number;
  readonly level: number;
}

export const ENGINE_VOICES: Readonly<Record<CarId, EngineVoice>> = {
  // Inline four with individual throttles: strong second engine order, raspy top.
  'bmw-m3-e30': {
    partials: [
      [2, 0.5],
      [4, 1],
      [6, 0.22],
      [8, 0.55],
      [12, 0.3],
      [16, 0.14],
    ],
    drive: 0.75,
    bands: [420, 1150],
    bandGain: 6,
    brightness: [260, 900, 1900],
    intake: 0.9,
    body: 0.35,
    pops: 0.5,
    level: 1,
  },
  // Small inline four: the same orders with less upper content and less weight.
  'mazda-mx5-na': {
    partials: [
      [2, 0.42],
      [4, 1],
      [8, 0.38],
      [12, 0.14],
    ],
    drive: 0.5,
    bands: [520, 1400],
    bandGain: 4,
    brightness: [280, 800, 1500],
    intake: 0.6,
    body: 0.22,
    pops: 0.2,
    level: 0.86,
  },
  // Cross-plane V8: uneven pulses per bank put energy at half the firing order and around it.
  'ford-mustang-gt-s550': {
    partials: [
      [2, 0.34],
      [3, 0.2],
      [4, 0.85],
      [5, 0.2],
      [8, 1],
      [12, 0.3],
      [16, 0.24],
    ],
    drive: 0.9,
    bands: [240, 760],
    bandGain: 7,
    brightness: [200, 700, 1500],
    intake: 0.55,
    body: 0.6,
    pops: 0.8,
    level: 1.08,
  },
  // Flat six: even firing, smooth, with the third-order howl rising at the top.
  'porsche-cayman-s-987': {
    partials: [
      [3, 0.55],
      [6, 1],
      [9, 0.34],
      [12, 0.4],
      [18, 0.16],
    ],
    drive: 0.6,
    bands: [560, 1500],
    bandGain: 6,
    brightness: [280, 1000, 2100],
    intake: 0.8,
    body: 0.3,
    pops: 0.35,
    level: 0.98,
  },
};
