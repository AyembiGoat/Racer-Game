import type { DrivingSurface } from '../../core/car';
import { CAR_TUNING } from '../../core/car';
import { clamp } from '../../core/vec';
import type { AudioEngine } from './engine';

export interface ContinuousRigParams {
  readonly rpm: number;
  readonly throttle: number;
  readonly speed: number;
  readonly slip: number;
  readonly surface: DrivingSurface;
}

/**
 * Continuous oscillators and filtered noise beds for engine note, tyre scrub,
 * kerb rumble, grass brush and high-speed wind.
 */
export function createContinuousRig(engine: AudioEngine) {
  const { context } = engine;
  const now = engine.now();

  // --- Engine note (6-cylinder firing order: 3 pulses per revolution) ---
  const motorFilter = context.createBiquadFilter();
  motorFilter.type = 'lowpass';
  motorFilter.frequency.value = 320;
  motorFilter.Q.value = 1.3;

  const motorGain = context.createGain();
  motorGain.gain.value = 0.0001;
  motorFilter.connect(motorGain).connect(engine.bus('motor'));

  const subOsc = context.createOscillator();
  subOsc.type = 'sine';
  const subGain = context.createGain();
  subGain.gain.value = 0.34;
  subOsc.connect(subGain).connect(motorFilter);

  const mainOsc = context.createOscillator();
  mainOsc.type = 'triangle';
  const mainGain = context.createGain();
  mainGain.gain.value = 0.42;
  mainOsc.connect(mainGain).connect(motorFilter);

  const harmOsc = context.createOscillator();
  harmOsc.type = 'sawtooth';
  const harmGain = context.createGain();
  harmGain.gain.value = 0.2;
  harmOsc.connect(harmGain).connect(motorFilter);

  const fifthOsc = context.createOscillator();
  fifthOsc.type = 'triangle';
  const fifthGain = context.createGain();
  fifthGain.gain.value = 0.1;
  fifthOsc.connect(fifthGain).connect(motorFilter);

  // Intake air roar under throttle load.
  const intakeSource = engine.makeNoiseSource(0.2);
  const intakeFilter = context.createBiquadFilter();
  intakeFilter.type = 'bandpass';
  intakeFilter.frequency.value = 260;
  intakeFilter.Q.value = 1.4;
  const intakeGain = context.createGain();
  intakeGain.gain.value = 0.0001;
  intakeSource.connect(intakeFilter).connect(intakeGain).connect(engine.bus('motor'));

  subOsc.start(now);
  mainOsc.start(now);
  harmOsc.start(now);
  fifthOsc.start(now);

  // --- Tyre scrub & squeal ---
  const slipSource = engine.makeNoiseSource(0.7);
  const slipFilter = context.createBiquadFilter();
  slipFilter.type = 'bandpass';
  slipFilter.frequency.value = 920;
  slipFilter.Q.value = 3.6;
  const slipGain = context.createGain();
  slipGain.gain.value = 0;
  slipSource.connect(slipFilter).connect(slipGain).connect(engine.bus('tyres'));

  // --- Kerb rumble (low tone pulsed at kerb-block rate) ---
  const kerbOsc = context.createOscillator();
  kerbOsc.type = 'sawtooth';
  kerbOsc.frequency.value = 62;
  const kerbFilter = context.createBiquadFilter();
  kerbFilter.type = 'lowpass';
  kerbFilter.frequency.value = 155;
  const kerbGain = context.createGain();
  kerbGain.gain.value = 0;
  kerbOsc.connect(kerbFilter).connect(kerbGain).connect(engine.bus('tyres'));
  kerbOsc.start(now);

  // --- Grass brush ---
  const grassSource = engine.makeNoiseSource(1.1);
  const grassFilter = context.createBiquadFilter();
  grassFilter.type = 'bandpass';
  grassFilter.frequency.value = 540;
  grassFilter.Q.value = 0.9;
  const grassGain = context.createGain();
  grassGain.gain.value = 0;
  grassSource.connect(grassFilter).connect(grassGain).connect(engine.bus('tyres'));

  // --- Aerodynamic wind rush ---
  const windSource = engine.makeNoiseSource(1.5);
  const windFilter = context.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 380;
  const windGain = context.createGain();
  windGain.gain.value = 0;
  windSource.connect(windFilter).connect(windGain).connect(engine.bus('ambience'));

  let shiftCutUntil = 0;

  return {
    update(params: ContinuousRigParams, at = engine.now()) {
      const rpmRatio = clamp(
        (params.rpm - CAR_TUNING.idleRpm) / (CAR_TUNING.redlineRpm - CAR_TUNING.idleRpm),
        0,
        1,
      );
      const load = clamp(params.throttle, 0, 1);
      const firingHz = Math.max(38, (params.rpm / 60) * 3);
      const tau = 0.025;

      subOsc.frequency.setTargetAtTime(firingHz * 0.5, at, tau);
      mainOsc.frequency.setTargetAtTime(firingHz, at, tau);
      harmOsc.frequency.setTargetAtTime(firingHz * 2.004, at, tau);
      fifthOsc.frequency.setTargetAtTime(firingHz * 1.5, at, tau);

      const cutoff = 230 + rpmRatio * 560 + load * 920;
      motorFilter.frequency.setTargetAtTime(cutoff, at, tau);

      const inShiftCut = at < shiftCutUntil;
      const baseMotorLevel = 0.16 + rpmRatio * 0.18 + load * 0.24;
      motorGain.gain.setTargetAtTime(
        inShiftCut ? baseMotorLevel * 0.35 : baseMotorLevel,
        at,
        0.018,
      );
      harmGain.gain.setTargetAtTime(0.12 + load * 0.2 + rpmRatio * 0.1, at, tau);
      intakeFilter.frequency.setTargetAtTime(220 + rpmRatio * 420, at, tau);
      intakeGain.gain.setTargetAtTime(0.02 + load * (0.08 + rpmRatio * 0.1), at, tau);

      const absSpeed = Math.abs(params.speed);
      const slipAmount = params.slip > 0.16 ? clamp((params.slip - 0.16) / 0.84, 0, 1) : 0;
      slipFilter.frequency.setTargetAtTime(840 + slipAmount * 360, at, 0.03);
      slipGain.gain.setTargetAtTime(slipAmount * 0.26, at, 0.03);

      const onKerb = params.surface === 'kerb' && absSpeed > 2;
      kerbOsc.frequency.setTargetAtTime(clamp(24 + absSpeed * 1.35, 28, 86), at, 0.02);
      kerbGain.gain.setTargetAtTime(onKerb ? clamp(absSpeed / 32, 0.12, 0.36) : 0, at, 0.02);

      const onGrass = params.surface === 'grass' && absSpeed > 1.5;
      grassGain.gain.setTargetAtTime(onGrass ? clamp(absSpeed / 36, 0.05, 0.22) : 0, at, 0.03);

      const windRatio = clamp(absSpeed / CAR_TUNING.maxSpeed, 0, 1);
      windFilter.frequency.setTargetAtTime(260 + windRatio * 420, at, 0.05);
      windGain.gain.setTargetAtTime(windRatio * windRatio * 0.22, at, 0.05);
    },

    silence(at = engine.now()) {
      motorGain.gain.setTargetAtTime(0.0001, at, 0.04);
      intakeGain.gain.setTargetAtTime(0.0001, at, 0.04);
      slipGain.gain.setTargetAtTime(0, at, 0.03);
      kerbGain.gain.setTargetAtTime(0, at, 0.03);
      grassGain.gain.setTargetAtTime(0, at, 0.03);
      windGain.gain.setTargetAtTime(0, at, 0.04);
    },

    notifyShift(at = engine.now()) {
      shiftCutUntil = at + 0.065;
      gearShiftClack(engine, at);
    },
  };
}

export function gearShiftClack(engine: AudioEngine, at = engine.now()): void {
  engine.noiseBurst('ui', at, {
    filter: 'bandpass',
    from: 900,
    to: 420,
    q: 1.8,
    level: 0.16,
    decay: 0.04,
  });
  engine.toneBurst('ui', at + 0.012, {
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
