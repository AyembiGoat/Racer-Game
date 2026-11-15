/**
 * Mixing desk for synthesised game audio. Routes every sound through one of five
 * buses into a master limiter, and runs identically on `AudioContext` and
 * `OfflineAudioContext` so `measureSounds` can verify mix levels without speakers.
 */

export type Bus = 'motor' | 'tyres' | 'impacts' | 'ui' | 'ambience';

const BUS_LEVELS: Record<Bus, number> = {
  motor: 0.52,
  tyres: 0.44,
  impacts: 0.68,
  ui: 0.22,
  ambience: 0.32,
};

const MASTER_LEVEL = 0.68;

export interface NoiseBurst {
  readonly filter: BiquadFilterType;
  readonly from: number;
  readonly to?: number;
  readonly q?: number;
  readonly level: number;
  readonly attack?: number;
  readonly decay: number;
}

export interface ToneBurst {
  readonly type?: OscillatorType;
  readonly from: number;
  readonly to?: number;
  readonly level: number;
  readonly decay: number;
}

export function createEngine(context: BaseAudioContext) {
  const master = context.createGain();
  master.gain.value = MASTER_LEVEL;

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  limiter.connect(master).connect(context.destination);

  // Shared two-second white-noise buffer looped by continuous and burst sources.
  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  let seed = 0x9e3779b9;
  for (let i = 0; i < noiseData.length; i++) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
    noiseData[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
  }

  const buses = {} as Record<Bus, GainNode>;
  for (const name of Object.keys(BUS_LEVELS) as Bus[]) {
    const gain = context.createGain();
    gain.gain.value = BUS_LEVELS[name];
    gain.connect(limiter);
    buses[name] = gain;
  }

  function makeNoiseSource(offset = 0): AudioBufferSourceNode {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    source.start(context.currentTime, offset % 1.9);
    return source;
  }

  return {
    context,
    master,
    bus: (name: Bus) => buses[name],
    makeNoiseSource,
    now: () => context.currentTime,

    setMasterLevel(level: number) {
      const clamped = Math.max(0, Math.min(1, level));
      master.gain.setTargetAtTime(clamped, context.currentTime, 0.02);
    },

    noiseBurst(bus: Bus, at: number, shape: NoiseBurst) {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = shape.filter;
      filter.Q.value = shape.q ?? 0.8;
      filter.frequency.setValueAtTime(shape.from, at);
      if (shape.to !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, shape.to), at + shape.decay);
      }
      const gain = context.createGain();
      const attack = shape.attack ?? 0.002;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, shape.level), at + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + shape.decay);
      source.connect(filter).connect(gain).connect(buses[bus]);
      source.start(at, (at * 0.37) % 1.5);
      source.stop(at + attack + shape.decay + 0.03);
    },

    toneBurst(bus: Bus, at: number, shape: ToneBurst) {
      const osc = context.createOscillator();
      osc.type = shape.type ?? 'sine';
      osc.frequency.setValueAtTime(shape.from, at);
      if (shape.to !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, shape.to), at + shape.decay);
      }
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, shape.level), at + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + shape.decay);
      osc.connect(gain).connect(buses[bus]);
      osc.start(at);
      osc.stop(at + shape.decay + 0.03);
    },
  };
}

export type AudioEngine = ReturnType<typeof createEngine>;
