import type { DrivingSurface } from '../../core/car';
import type { CarSpec } from '../../core/cars';
import { clamp } from '../../core/vec';
import type { AudioEngine } from './engine';
import { ENGINE_VOICES } from './profiles';

export interface ContinuousRigParams {
  readonly rpm: number;
  readonly throttle: number;
  readonly speed: number;
  /** Tyre slide past the grip peak, 0..1. */
  readonly slip: number;
  /** Share of cornering grip in use, 0..1. */
  readonly cornerLoad: number;
  readonly surface: DrivingSurface;
}

const KERB_BLOCK_METRES = 1.2;

/** Asymmetric soft clip: positive half saturates sooner, adding even harmonics like an exhaust pulse. */
function exhaustCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = x >= 0 ? Math.tanh(2.6 * x) * 0.82 : Math.tanh(1.5 * x);
  }
  return curve;
}

/**
 * Continuous sound for one car: engine (exhaust, intake, body), tyre scrub and squeal,
 * kerb, grass and wind. Build one per car and `dispose` it when the car changes.
 */
export function createContinuousRig(engine: AudioEngine, car: CarSpec) {
  const { context } = engine;
  const now = engine.now();
  const voice = ENGINE_VOICES[car.id];
  const { cylinders, idleRpm, redlineRpm } = car.real;
  const sources: AudioScheduledSourceNode[] = [];
  const outputs: AudioNode[] = [];
  const start = <T extends AudioScheduledSourceNode>(node: T): T => {
    node.start(now);
    sources.push(node);
    return node;
  };
  const toBus = (node: AudioNode, bus: Parameters<AudioEngine['bus']>[0]) => {
    node.connect(engine.bus(bus));
    outputs.push(node);
  };
  const gainNode = (value: number) => {
    const node = context.createGain();
    node.gain.value = value;
    return node;
  };
  const filterNode = (type: BiquadFilterType, frequency: number, q: number) => {
    const node = context.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  };

  // --- Engine ---
  const highest = voice.partials.reduce((max, [order]) => Math.max(max, order), 0);
  const real = new Float32Array(highest + 1);
  const imag = new Float32Array(highest + 1);
  for (const [order, amplitude] of voice.partials) imag[order] = amplitude;
  const wave = context.createPeriodicWave(real, imag);
  const cycleHz = (rpm: number) => rpm / 120;

  const exhaustOsc = start(context.createOscillator());
  exhaustOsc.setPeriodicWave(wave);
  exhaustOsc.frequency.value = cycleHz(idleRpm);
  const exhaustDrive = gainNode(0.4);
  const shaper = context.createWaveShaper();
  shaper.curve = exhaustCurve();
  shaper.oversample = '2x';
  const bandLow = filterNode('peaking', voice.bands[0], 1.4);
  bandLow.gain.value = voice.bandGain;
  const bandHigh = filterNode('peaking', voice.bands[1], 1.8);
  bandHigh.gain.value = voice.bandGain * 0.7;
  const exhaustLowpass = filterNode('lowpass', voice.brightness[0], 0.8);
  const exhaustGain = gainNode(0.0001);
  exhaustOsc
    .connect(exhaustDrive)
    .connect(shaper)
    .connect(bandLow)
    .connect(bandHigh)
    .connect(exhaustLowpass)
    .connect(exhaustGain);
  toBus(exhaustGain, 'motor');

  // Intake: the same orders a touch sharp, through a band that climbs with revs.
  const intakeOsc = start(context.createOscillator());
  intakeOsc.setPeriodicWave(wave);
  intakeOsc.frequency.value = cycleHz(idleRpm) * 1.003;
  const intakeBand = filterNode('bandpass', 400, 1.1);
  const intakeGain = gainNode(0.0001);
  intakeOsc.connect(intakeBand).connect(intakeGain);
  const intakeNoise = engine.makeNoiseSource(0.2);
  sources.push(intakeNoise);
  const intakeNoiseBand = filterNode('bandpass', 700, 0.9);
  const intakeNoiseGain = gainNode(0.0001);
  intakeNoise.connect(intakeNoiseBand).connect(intakeNoiseGain);
  toBus(intakeGain, 'motor');
  toBus(intakeNoiseGain, 'motor');

  // Body: a sine an octave under the firing frequency.
  const bodyOsc = start(context.createOscillator());
  bodyOsc.type = 'sine';
  bodyOsc.frequency.value = (cycleHz(idleRpm) * cylinders) / 2;
  const bodyGain = gainNode(0.0001);
  bodyOsc.connect(bodyGain);
  toBus(bodyGain, 'motor');

  // Gear whine follows road speed.
  const whineOsc = start(context.createOscillator());
  whineOsc.type = 'triangle';
  whineOsc.frequency.value = 300;
  const whineGain = gainNode(0);
  whineOsc.connect(whineGain);
  toBus(whineGain, 'motor');

  // --- Tyres ---
  const scrubNoise = engine.makeNoiseSource(0.7);
  sources.push(scrubNoise);
  const scrubBand = filterNode('bandpass', 420, 0.6);
  const scrubGain = gainNode(0);
  scrubNoise.connect(scrubBand).connect(scrubGain);
  toBus(scrubGain, 'tyres');

  const squealNoise = engine.makeNoiseSource(0.9);
  sources.push(squealNoise);
  const squealLow = filterNode('bandpass', 900, 9);
  const squealHigh = filterNode('bandpass', 1500, 12);
  const squealHighGain = gainNode(0.6);
  const squealGain = gainNode(0);
  squealNoise.connect(squealLow).connect(squealGain);
  squealNoise.connect(squealHigh).connect(squealHighGain).connect(squealGain);
  toBus(squealGain, 'tyres');

  // --- Kerb: noise and a low tone, chopped at the rate the blocks pass ---
  const kerbNoise = engine.makeNoiseSource(0.4);
  sources.push(kerbNoise);
  const kerbLowpass = filterNode('lowpass', 210, 0.9);
  const kerbTone = start(context.createOscillator());
  kerbTone.type = 'triangle';
  kerbTone.frequency.value = 68;
  const kerbToneGain = gainNode(0.5);
  const kerbChop = gainNode(0.55);
  const kerbLfo = start(context.createOscillator());
  kerbLfo.type = 'square';
  kerbLfo.frequency.value = 12;
  const kerbLfoDepth = gainNode(0.45);
  kerbLfo.connect(kerbLfoDepth).connect(kerbChop.gain);
  const kerbGain = gainNode(0);
  kerbNoise.connect(kerbLowpass).connect(kerbChop);
  kerbTone.connect(kerbToneGain).connect(kerbChop);
  kerbChop.connect(kerbGain);
  toBus(kerbGain, 'tyres');

  // --- Grass: soft low noise with a slow swell ---
  const grassNoise = engine.makeNoiseSource(1.1);
  sources.push(grassNoise);
  const grassLowpass = filterNode('lowpass', 620, 0.5);
  const grassSwell = gainNode(0.8);
  const grassLfo = start(context.createOscillator());
  grassLfo.type = 'sine';
  grassLfo.frequency.value = 3.1;
  const grassLfoDepth = gainNode(0.2);
  grassLfo.connect(grassLfoDepth).connect(grassSwell.gain);
  const grassGain = gainNode(0);
  grassNoise.connect(grassLowpass).connect(grassSwell).connect(grassGain);
  toBus(grassGain, 'tyres');

  // --- Wind ---
  const windNoise = engine.makeNoiseSource(1.5);
  sources.push(windNoise);
  const windLowpass = filterNode('lowpass', 380, 0.5);
  const windGain = gainNode(0);
  windNoise.connect(windLowpass).connect(windGain);
  toBus(windGain, 'ambience');

  let shiftCutUntil = 0;
  let blipUntil = 0;
  let previousLoad = 0;
  let popSerial = 0;

  return {
    car,

    update(params: ContinuousRigParams, at = engine.now()) {
      const rpmRatio = clamp((params.rpm - idleRpm) / (redlineRpm - idleRpm), 0, 1);
      const pedal = clamp(params.throttle, 0, 1);
      const load = at < blipUntil ? Math.max(pedal, 0.7) : pedal;
      const cycle = cycleHz(Math.max(params.rpm, idleRpm * 0.8));
      const firing = cycle * cylinders;
      const tau = 0.025;

      exhaustOsc.frequency.setTargetAtTime(cycle, at, tau);
      intakeOsc.frequency.setTargetAtTime(cycle * 1.003, at, tau);
      bodyOsc.frequency.setTargetAtTime(firing / 2, at, tau);

      // Load changes level and brightness; pitch comes only from engine speed.
      const [corner, withRevs, withLoad] = voice.brightness;
      exhaustLowpass.frequency.setTargetAtTime(
        corner + rpmRatio * withRevs + load * withLoad,
        at,
        tau,
      );
      exhaustDrive.gain.setTargetAtTime(0.25 + voice.drive * (0.25 + load * 0.75), at, tau);
      const cut = at < shiftCutUntil ? 0.3 : 1;
      const exhaustLevel = (0.1 + rpmRatio * 0.1 + load * (0.2 + rpmRatio * 0.08)) * voice.level;
      exhaustGain.gain.setTargetAtTime(exhaustLevel * cut, at, 0.02);
      intakeBand.frequency.setTargetAtTime(320 + rpmRatio * 1300, at, tau);
      intakeGain.gain.setTargetAtTime(
        load * (0.05 + rpmRatio * 0.16) * voice.intake * cut,
        at,
        tau,
      );
      intakeNoiseBand.frequency.setTargetAtTime(500 + rpmRatio * 900, at, tau);
      intakeNoiseGain.gain.setTargetAtTime(
        load * (0.015 + rpmRatio * 0.05) * voice.intake,
        at,
        tau,
      );
      bodyGain.gain.setTargetAtTime((0.06 + load * 0.1) * voice.body * cut, at, tau);

      const absSpeed = Math.abs(params.speed);
      whineOsc.frequency.setTargetAtTime(220 + absSpeed * 22, at, 0.04);
      whineGain.gain.setTargetAtTime(clamp(absSpeed / 60, 0, 1) * 0.012, at, 0.04);

      // Overrun: a sharp lift at high revs leaves a few quiet pops in the exhaust.
      if (previousLoad > 0.5 && load < 0.05 && rpmRatio > 0.6 && voice.pops > 0) {
        for (let i = 0; i < 3; i++) {
          popSerial = (popSerial * 73 + 41) % 97;
          engine.noiseBurst('motor', at + 0.09 + i * 0.07 + (popSerial / 97) * 0.05, {
            filter: 'bandpass',
            from: voice.bands[0] * 1.3,
            to: voice.bands[0] * 0.7,
            q: 2.2,
            level: 0.1 * voice.pops,
            decay: 0.035,
          });
        }
      }
      previousLoad = load;

      const moving = clamp(absSpeed / 8, 0, 1);
      scrubBand.frequency.setTargetAtTime(340 + absSpeed * 6, at, 0.05);
      scrubGain.gain.setTargetAtTime(
        params.surface === 'grass' ? 0 : params.cornerLoad * moving * 0.085,
        at,
        0.05,
      );
      const squeal =
        params.surface === 'grass' ? 0 : clamp((params.slip - 0.15) / 0.6, 0, 1) * moving;
      squealLow.frequency.setTargetAtTime(860 + squeal * 130, at, 0.04);
      squealHigh.frequency.setTargetAtTime(1420 + squeal * 220, at, 0.04);
      squealGain.gain.setTargetAtTime(squeal * 0.55, at, 0.035);

      const onKerb = params.surface === 'kerb' && absSpeed > 2;
      kerbLfo.frequency.setTargetAtTime(clamp(absSpeed / KERB_BLOCK_METRES, 3, 48), at, 0.02);
      kerbTone.frequency.setTargetAtTime(clamp(58 + absSpeed * 0.5, 60, 82), at, 0.03);
      kerbGain.gain.setTargetAtTime(onKerb ? clamp(absSpeed / 40, 0.2, 0.7) * 0.5 : 0, at, 0.02);

      const onGrass = params.surface === 'grass' && absSpeed > 1.5;
      grassGain.gain.setTargetAtTime(onGrass ? clamp(absSpeed / 30, 0.1, 0.5) : 0, at, 0.04);

      const wind = clamp(absSpeed / 70, 0, 1);
      windLowpass.frequency.setTargetAtTime(240 + wind * 700, at, 0.06);
      windGain.gain.setTargetAtTime(wind * wind * 0.5, at, 0.06);
    },

    silence(at = engine.now()) {
      for (const gain of [
        exhaustGain,
        intakeGain,
        intakeNoiseGain,
        bodyGain,
        whineGain,
        scrubGain,
        squealGain,
        kerbGain,
        grassGain,
        windGain,
      ]) {
        gain.gain.setTargetAtTime(0.0001, at, 0.04);
      }
      previousLoad = 0;
    },

    /** Interrupts drive for a moment and plays the gear lever; a downshift adds a throttle blip. */
    notifyShift(direction: 'up' | 'down', at = engine.now()) {
      shiftCutUntil = at + 0.07;
      if (direction === 'down') blipUntil = at + 0.12;
      gearShiftClack(engine, at);
    },

    dispose() {
      for (const source of sources) {
        source.stop();
        source.disconnect();
      }
      for (const output of outputs) output.disconnect();
    },
  };
}

export type ContinuousRig = ReturnType<typeof createContinuousRig>;

export function gearShiftClack(engine: AudioEngine, at = engine.now()): void {
  engine.noiseBurst('motor', at, {
    filter: 'bandpass',
    from: 900,
    to: 420,
    q: 1.8,
    level: 0.16,
    decay: 0.04,
  });
  engine.toneBurst('motor', at + 0.012, {
    type: 'triangle',
    from: 150,
    to: 95,
    level: 0.14,
    decay: 0.045,
  });
}

export function wallHit(engine: AudioEngine, impactSpeed: number, at = engine.now()): void {
  const strength = clamp(impactSpeed / 16, 0.18, 1);
  engine.toneBurst('impacts', at, {
    type: 'sine',
    from: 108,
    to: 42,
    level: 0.65 * strength,
    decay: 0.16,
  });
  engine.toneBurst('impacts', at + 0.004, {
    type: 'triangle',
    from: 390,
    to: 290,
    level: 0.24 * strength,
    decay: 0.11,
  });
  engine.noiseBurst('impacts', at, {
    filter: 'bandpass',
    from: 1400,
    to: 480,
    q: 1.2,
    level: 0.42 * strength,
    decay: 0.14,
  });
}

export function checkpointTick(engine: AudioEngine, at = engine.now()): void {
  engine.toneBurst('ui', at, {
    type: 'sine',
    from: 660,
    level: 0.18,
    decay: 0.07,
  });
}

export function lapChime(engine: AudioEngine, at = engine.now()): void {
  engine.toneBurst('ui', at, {
    type: 'sine',
    from: 587.33,
    level: 0.24,
    decay: 0.1,
  });
  engine.toneBurst('ui', at + 0.075, {
    type: 'sine',
    from: 880,
    level: 0.28,
    decay: 0.16,
  });
}

export function uiPersonalBest(engine: AudioEngine, at = engine.now()): void {
  engine.toneBurst('ui', at, {
    type: 'sine',
    from: 587.33,
    level: 0.22,
    decay: 0.1,
  });
  engine.toneBurst('ui', at + 0.07, {
    type: 'sine',
    from: 739.99,
    level: 0.22,
    decay: 0.12,
  });
  engine.toneBurst('ui', at + 0.14, {
    type: 'sine',
    from: 880,
    level: 0.26,
    decay: 0.2,
  });
}

export function uiFocus(engine: AudioEngine, at = engine.now()): void {
  engine.toneBurst('ui', at, {
    type: 'triangle',
    from: 420,
    to: 360,
    level: 0.08,
    decay: 0.032,
  });
}

export function uiSelect(engine: AudioEngine, at = engine.now()): void {
  engine.toneBurst('ui', at, {
    type: 'triangle',
    from: 520,
    to: 680,
    level: 0.14,
    decay: 0.055,
  });
}

export function uiBack(engine: AudioEngine, at = engine.now()): void {
  engine.toneBurst('ui', at, {
    type: 'triangle',
    from: 460,
    to: 310,
    level: 0.12,
    decay: 0.06,
  });
}

export function uiConfirm(engine: AudioEngine, at = engine.now()): void {
  engine.toneBurst('ui', at, {
    type: 'sine',
    from: 523.25,
    level: 0.14,
    decay: 0.06,
  });
  engine.toneBurst('ui', at + 0.055, {
    type: 'sine',
    from: 659.25,
    level: 0.16,
    decay: 0.1,
  });
}

export function uiWarning(engine: AudioEngine, at = engine.now()): void {
  engine.toneBurst('ui', at, {
    type: 'triangle',
    from: 330,
    to: 277.18,
    level: 0.15,
    decay: 0.09,
  });
}

/** Three rising tones when a car is bought. */
export function uiPurchase(engine: AudioEngine, at = engine.now()): void {
  const notes = [523.25, 659.25, 783.99] as const;
  notes.forEach((from, index) => {
    engine.toneBurst('ui', at + index * 0.07, {
      type: 'sine',
      from,
      level: 0.16 + index * 0.02,
      decay: index === 2 ? 0.2 : 0.09,
    });
  });
}

/** Two low tones when a purchase is refused. */
export function uiDenied(engine: AudioEngine, at = engine.now()): void {
  engine.toneBurst('ui', at, { type: 'triangle', from: 220, level: 0.16, decay: 0.08 });
  engine.toneBurst('ui', at + 0.1, { type: 'triangle', from: 174.61, level: 0.16, decay: 0.12 });
}
