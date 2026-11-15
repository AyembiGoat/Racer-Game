/**
 * The car roster. `real` holds published figures for one exact variant (sources and
 * caveats in reference/cars.md). `tuning` and `SIM_BALANCE` are game balance. `sim` is
 * derived from both by `deriveSim` so displayed figures and physics cannot drift apart.
 */

export type CarId = 'bmw-m3-e30' | 'mazda-mx5-na' | 'ford-mustang-gt-s550' | 'porsche-cayman-s-987';

export type EngineLayout = 'inline' | 'flat' | 'vee';

export interface Tyre {
  readonly widthMm: number;
  readonly aspect: number;
  readonly rimInches: number;
}

export interface CarFacts {
  readonly enginePosition: 'front' | 'mid';
  readonly engineLayout: EngineLayout;
  readonly cylinders: number;
  readonly displacementCc: number;
  readonly powerKw: number;
  readonly powerRpm: number;
  readonly torqueNm: number;
  readonly torqueRpm: number;
  readonly idleRpm: number;
  readonly redlineRpm: number;
  readonly massKg: number;
  /** Metres. */
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly wheelbase: number;
  readonly trackFront: number;
  readonly trackRear: number;
  readonly tyreFront: Tyre;
  readonly tyreRear: Tyre;
  readonly gearRatios: readonly number[];
  readonly finalDrive: number;
  readonly topSpeedKmh: number;
  readonly zeroTo100Seconds: number;
  readonly dragCoefficient: number;
  readonly turningCircle: number;
  readonly frontWeightShare: number;
}

export interface CarTuning {
  /** Cornering grip in g before `SIM_BALANCE.lateralScale`. */
  readonly gripG: number;
  readonly brakeG: number;
  /** How quickly yaw rate follows the steering, 1/s. */
  readonly yawResponse: number;
  /** How far full lock can ask past the grip limit. */
  readonly yawAuthority: number;
  /** Yaw toward the direction of travel per radian of slip beyond the peak, 1/s. */
  readonly alignGain: number;
  /** Slip angle of peak lateral force, radians. */
  readonly peakSlip: number;
  readonly steerQuickness: number;
  /** Extra rotation at full brake pressure. */
  readonly trailRotation: number;
}

/** What the model, cameras and showroom need beyond the published dimensions. */
export interface CarVisual {
  /** Body paint as 0xRRGGBB, and the name shown in the garage. */
  readonly paint: number;
  readonly paintName: string;
  readonly metallic: boolean;
  /** Nose to front axle, metres. Estimated from side photographs, not published. */
  readonly frontOverhang: number;
}

export interface CarSim {
  /** Rolling radius of the driven (rear) tyre, metres. */
  readonly wheelRadius: number;
  readonly frontWheelRadius: number;
  readonly maxSpeed: number;
  readonly maxSteerAngle: number;
  readonly lateralGrip: number;
  readonly brakeDecel: number;
  readonly tractionAccel: number;
  /** Engine rpm per m/s of road speed, per gear. */
  readonly rpmPerSpeed: readonly number[];
  /** Road speed at the redline, per gear. */
  readonly gearTopSpeeds: readonly number[];
  /** Forward acceleration per Nm of engine torque, per gear, balance scale included. */
  readonly accelPerNm: readonly number[];
  /** Air drag deceleration per (m/s)^2. */
  readonly airDrag: number;
  readonly rollingDrag: number;
  readonly upshiftRpm: number;
  readonly launchRpm: number;
  readonly torqueAtPowerNm: number;
}

export interface CarSpec {
  readonly id: CarId;
  readonly make: string;
  readonly model: string;
  readonly chassis: string;
  readonly year: number;
  readonly variant: string;
  readonly price: number;
  readonly visual: CarVisual;
  readonly real: CarFacts;
  readonly tuning: CarTuning;
  readonly sim: CarSim;
}

export const SIM_BALANCE = {
  /** Every drive, drag and engine-braking force is multiplied by this. */
  longitudinalScale: 2.5,
  lateralScale: 2.5,
  brakeScale: 2.85,
  drivelineEfficiency: 0.88,
  driverKg: 75,
  airDensity: 1.2,
  frontalAreaFactor: 0.8,
  rollingResistance: 0.014,
  weightTransferShare: 0.1,
  gravity: 9.81,
} as const;

export function tyreRadius(tyre: Tyre): number {
  return (tyre.rimInches * 0.0254) / 2 + (tyre.widthMm / 1000) * tyre.aspect;
}

export function deriveSim(real: CarFacts, tuning: CarTuning): CarSim {
  const b = SIM_BALANCE;
  const wheelRadius = tyreRadius(real.tyreRear);
  const mass = real.massKg + b.driverKg;
  const lateralGrip = tuning.gripG * b.gravity * b.lateralScale;
  const rpmPerSpeed = real.gearRatios.map(
    (ratio) => (ratio * real.finalDrive * 60) / (2 * Math.PI * wheelRadius),
  );
  return {
    wheelRadius,
    frontWheelRadius: tyreRadius(real.tyreFront),
    maxSpeed: real.topSpeedKmh / 3.6,
    maxSteerAngle: Math.asin(real.wheelbase / (real.turningCircle / 2)),
    lateralGrip,
    brakeDecel: tuning.brakeG * b.gravity * b.brakeScale,
    tractionAccel: lateralGrip * (1 - real.frontWeightShare + b.weightTransferShare),
    rpmPerSpeed,
    gearTopSpeeds: rpmPerSpeed.map((perSpeed) => real.redlineRpm / perSpeed),
    accelPerNm: real.gearRatios.map(
      (ratio) =>
        (ratio * real.finalDrive * b.drivelineEfficiency * b.longitudinalScale) /
        (wheelRadius * mass),
    ),
    airDrag:
      (0.5 *
        b.airDensity *
        real.dragCoefficient *
        b.frontalAreaFactor *
        real.width *
        real.height *
        b.longitudinalScale) /
      mass,
    rollingDrag: b.rollingResistance * b.gravity * b.longitudinalScale,
    upshiftRpm: real.redlineRpm - 200,
    launchRpm: real.torqueRpm * 0.75,
    torqueAtPowerNm: (real.powerKw * 1000) / ((real.powerRpm * 2 * Math.PI) / 60),
  };
}

/** Engine torque in Nm: idle, peak torque, torque at peak power, redline. */
export function torqueAt(car: CarSpec, rpm: number): number {
  const { idleRpm, torqueRpm, torqueNm, powerRpm, redlineRpm } = car.real;
  const atPower = car.sim.torqueAtPowerNm;
  if (rpm >= redlineRpm) return 0;
  if (rpm <= idleRpm) return torqueNm * 0.7;
  if (rpm < torqueRpm) {
    return torqueNm * (0.7 + (0.3 * (rpm - idleRpm)) / (torqueRpm - idleRpm));
  }
  if (rpm < powerRpm) {
    return torqueNm + ((atPower - torqueNm) * (rpm - torqueRpm)) / (powerRpm - torqueRpm);
  }
  return atPower * (1 - (0.1 * (rpm - powerRpm)) / (redlineRpm - powerRpm));
}

function defineCar(spec: Omit<CarSpec, 'sim'>): CarSpec {
  return { ...spec, sim: deriveSim(spec.real, spec.tuning) };
}

export const CARS: Readonly<Record<CarId, CarSpec>> = {
  'bmw-m3-e30': defineCar({
    id: 'bmw-m3-e30',
    make: 'BMW',
    model: 'M3',
    chassis: 'E30',
    year: 1989,
    variant: '2.3, European, 5-speed',
    price: 0,
    visual: { paint: 0xb3161b, paintName: 'Red', metallic: false, frontOverhang: 0.8 },
    real: {
      enginePosition: 'front',
      engineLayout: 'inline',
      cylinders: 4,
      displacementCc: 2302,
      powerKw: 147,
      powerRpm: 6750,
      torqueNm: 240,
      torqueRpm: 4750,
      idleRpm: 950,
      redlineRpm: 7250,
      massKg: 1200,
      length: 4.345,
      width: 1.68,
      height: 1.37,
      wheelbase: 2.565,
      trackFront: 1.414,
      trackRear: 1.435,
      tyreFront: { widthMm: 205, aspect: 0.55, rimInches: 15 },
      tyreRear: { widthMm: 205, aspect: 0.55, rimInches: 15 },
      gearRatios: [3.72, 2.4, 1.77, 1.26, 1.0],
      finalDrive: 3.25,
      topSpeedKmh: 235,
      zeroTo100Seconds: 6.7,
      dragCoefficient: 0.33,
      turningCircle: 11.1,
      frontWeightShare: 0.52,
    },
    tuning: {
      gripG: 0.86,
      brakeG: 0.95,
      yawResponse: 13,
      yawAuthority: 1.04,
      alignGain: 2.2,
      peakSlip: 0.12,
      steerQuickness: 1,
      trailRotation: 0.06,
    },
  }),
  'mazda-mx5-na': defineCar({
    id: 'mazda-mx5-na',
    make: 'Mazda',
    model: 'MX-5',
    chassis: 'NA',
    year: 1990,
    variant: '1.6, 5-speed',
    price: 4500,
    visual: { paint: 0x1d4a35, paintName: 'Green', metallic: false, frontOverhang: 0.8 },
    real: {
      enginePosition: 'front',
      engineLayout: 'inline',
      cylinders: 4,
      displacementCc: 1597,
      powerKw: 85,
      powerRpm: 6500,
      torqueNm: 136,
      torqueRpm: 5500,
      idleRpm: 850,
      redlineRpm: 7200,
      massKg: 955,
      length: 3.97,
      width: 1.675,
      height: 1.235,
      wheelbase: 2.265,
      trackFront: 1.41,
      trackRear: 1.43,
      tyreFront: { widthMm: 185, aspect: 0.6, rimInches: 14 },
      tyreRear: { widthMm: 185, aspect: 0.6, rimInches: 14 },
      gearRatios: [3.136, 1.888, 1.33, 1.0, 0.814],
      finalDrive: 4.3,
      topSpeedKmh: 195,
      zeroTo100Seconds: 8.8,
      dragCoefficient: 0.38,
      turningCircle: 9.14,
      frontWeightShare: 0.51,
    },
    tuning: {
      gripG: 0.84,
      brakeG: 0.92,
      yawResponse: 15,
      yawAuthority: 1.03,
      alignGain: 2.6,
      peakSlip: 0.12,
      steerQuickness: 1.1,
      trailRotation: 0.05,
    },
  }),
  'ford-mustang-gt-s550': defineCar({
    id: 'ford-mustang-gt-s550',
    make: 'Ford',
    model: 'Mustang GT',
    chassis: 'S550',
    year: 2015,
    variant: '5.0 fastback, 6-speed',
    price: 12000,
    visual: { paint: 0x143c82, paintName: 'Blue', metallic: true, frontOverhang: 0.92 },
    real: {
      enginePosition: 'front',
      engineLayout: 'vee',
      cylinders: 8,
      displacementCc: 4951,
      powerKw: 324,
      powerRpm: 6500,
      torqueNm: 542,
      torqueRpm: 4250,
      idleRpm: 750,
      redlineRpm: 7000,
      massKg: 1681,
      length: 4.783,
      width: 1.915,
      height: 1.382,
      wheelbase: 2.72,
      trackFront: 1.582,
      trackRear: 1.648,
      tyreFront: { widthMm: 235, aspect: 0.5, rimInches: 18 },
      tyreRear: { widthMm: 235, aspect: 0.5, rimInches: 18 },
      gearRatios: [3.66, 2.43, 1.69, 1.31, 1.0, 0.65],
      finalDrive: 3.31,
      topSpeedKmh: 250,
      zeroTo100Seconds: 4.8,
      dragCoefficient: 0.35,
      turningCircle: 11.5,
      frontWeightShare: 0.53,
    },
    tuning: {
      gripG: 0.93,
      brakeG: 1.0,
      yawResponse: 10.5,
      yawAuthority: 1.03,
      alignGain: 2.0,
      peakSlip: 0.1,
      steerQuickness: 0.9,
      trailRotation: 0.04,
    },
  }),
  'porsche-cayman-s-987': defineCar({
    id: 'porsche-cayman-s-987',
    make: 'Porsche',
    model: 'Cayman S',
    chassis: '987',
    year: 2006,
    variant: '3.4, 6-speed',
    price: 18000,
    visual: { paint: 0xb9bec4, paintName: 'Silver', metallic: true, frontOverhang: 0.94 },
    real: {
      enginePosition: 'mid',
      engineLayout: 'flat',
      cylinders: 6,
      displacementCc: 3387,
      powerKw: 217,
      powerRpm: 6250,
      torqueNm: 340,
      torqueRpm: 4400,
      idleRpm: 800,
      redlineRpm: 7300,
      massKg: 1340,
      length: 4.341,
      width: 1.801,
      height: 1.305,
      wheelbase: 2.415,
      trackFront: 1.486,
      trackRear: 1.528,
      tyreFront: { widthMm: 235, aspect: 0.4, rimInches: 18 },
      tyreRear: { widthMm: 265, aspect: 0.4, rimInches: 18 },
      gearRatios: [3.31, 1.95, 1.41, 1.13, 0.97, 0.82],
      finalDrive: 3.88,
      topSpeedKmh: 275,
      zeroTo100Seconds: 5.4,
      dragCoefficient: 0.29,
      turningCircle: 11.1,
      frontWeightShare: 0.45,
    },
    tuning: {
      gripG: 0.97,
      brakeG: 1.08,
      yawResponse: 16,
      yawAuthority: 1.05,
      alignGain: 2.0,
      peakSlip: 0.1,
      steerQuickness: 1.05,
      trailRotation: 0.1,
    },
  }),
};

export const CAR_IDS = Object.keys(CARS) as readonly CarId[];
export const STARTER_CAR_ID: CarId = 'bmw-m3-e30';

export function isCarId(value: unknown): value is CarId {
  return typeof value === 'string' && Object.hasOwn(CARS, value);
}

export function carName(car: CarSpec): string {
  return `${car.make} ${car.model}`;
}

export interface CarAnchors {
  /** Wheel centres: x is half the track, y the rolling radius, z half the wheelbase. */
  readonly frontWheel: { readonly x: number; readonly y: number; readonly z: number };
  readonly rearWheel: { readonly x: number; readonly y: number; readonly z: number };
  /** Bonnet camera, ahead of the windscreen base. Forward is -Z. */
  readonly bonnetCamera: { readonly y: number; readonly z: number };
  readonly chaseCamera: { readonly distance: number; readonly height: number };
  /** Body extent in model space: `front` is the nose (negative z), `rear` the tail. */
  readonly bounds: {
    readonly halfWidth: number;
    readonly front: number;
    readonly rear: number;
    readonly height: number;
  };
  readonly orbitTarget: { readonly y: number };
  readonly orbitDistance: number;
}

/** Positions every consumer (model, cameras, skid marks, showroom) reads for a car. */
export function carAnchors(car: CarSpec): CarAnchors {
  const { real, sim } = car;
  const front = -(real.wheelbase / 2 + car.visual.frontOverhang);
  const cabForward = real.enginePosition === 'mid' ? 0.32 : 0.18;
  return {
    frontWheel: { x: real.trackFront / 2, y: sim.frontWheelRadius, z: -real.wheelbase / 2 },
    rearWheel: { x: real.trackRear / 2, y: sim.wheelRadius, z: real.wheelbase / 2 },
    bonnetCamera: { y: real.height * 0.86, z: -real.wheelbase * cabForward },
    chaseCamera: { distance: real.length * 1.42, height: real.height * 1.55 },
    bounds: { halfWidth: real.width / 2, front, rear: front + real.length, height: real.height },
    orbitTarget: { y: real.height * 0.42 },
    orbitDistance: real.length * 1.5,
  };
}

/** Problems with a car definition; empty when it is usable. */
export function validateCar(car: CarSpec): string[] {
  const problems: string[] = [];
  const { real, tuning, sim } = car;
  const positive: readonly (readonly [string, number])[] = [
    ['powerKw', real.powerKw],
    ['torqueNm', real.torqueNm],
    ['massKg', real.massKg],
    ['length', real.length],
    ['width', real.width],
    ['height', real.height],
    ['wheelbase', real.wheelbase],
    ['trackFront', real.trackFront],
    ['trackRear', real.trackRear],
    ['finalDrive', real.finalDrive],
    ['topSpeedKmh', real.topSpeedKmh],
    ['dragCoefficient', real.dragCoefficient],
    ['gripG', tuning.gripG],
    ['brakeG', tuning.brakeG],
    ['yawResponse', tuning.yawResponse],
    ['peakSlip', tuning.peakSlip],
  ];
  for (const [name, value] of positive) {
    if (!Number.isFinite(value) || value <= 0) problems.push(`${name} must be positive`);
  }
  if (!Number.isInteger(car.price) || car.price < 0) problems.push('price must be a whole number');
  if (real.wheelbase >= real.length) problems.push('wheelbase must be shorter than the car');
  if (Math.max(real.trackFront, real.trackRear) >= real.width) {
    problems.push('track must be narrower than the car');
  }
  if (real.wheelbase + 2 * Math.max(sim.wheelRadius, sim.frontWheelRadius) >= real.length) {
    problems.push('wheels must fit inside the length');
  }
  if (!(real.idleRpm < real.torqueRpm && real.torqueRpm < real.powerRpm)) {
    problems.push('idle, torque and power speeds must rise in that order');
  }
  if (real.powerRpm >= real.redlineRpm) problems.push('peak power must be below the redline');
  if (real.gearRatios.length < 4 || real.gearRatios.length > 7) problems.push('4 to 7 gears');
  for (let i = 1; i < real.gearRatios.length; i++) {
    if ((real.gearRatios[i] ?? 0) >= (real.gearRatios[i - 1] ?? 0)) {
      problems.push('gear ratios must fall with each gear');
    }
  }
  if (real.frontWeightShare <= 0.3 || real.frontWeightShare >= 0.7) {
    problems.push('front weight share out of range');
  }
  if (!Number.isFinite(sim.maxSteerAngle) || sim.maxSteerAngle < 0.3 || sim.maxSteerAngle > 0.75) {
    problems.push('steering lock out of range');
  }
  if (tuning.yawAuthority < 1 || tuning.yawAuthority > 1.25) problems.push('yawAuthority range');
  if (tuning.alignGain < 0 || tuning.alignGain > 5) problems.push('alignGain range');
  if (tuning.trailRotation < 0 || tuning.trailRotation > 0.2) problems.push('trailRotation range');
  const anchors = carAnchors(car);
  if (anchors.frontWheel.x + 0.05 > anchors.bounds.halfWidth)
    problems.push('front wheels outside body');
  if (anchors.rearWheel.x + 0.05 > anchors.bounds.halfWidth)
    problems.push('rear wheels outside body');
  if (anchors.bonnetCamera.y >= real.height || anchors.bonnetCamera.y < real.height * 0.6) {
    problems.push('bonnet camera height');
  }
  if (anchors.bonnetCamera.z < anchors.bounds.front) problems.push('bonnet camera z');
  const noseRoom = car.visual.frontOverhang - sim.frontWheelRadius;
  const tailRoom = anchors.bounds.rear - anchors.rearWheel.z - sim.wheelRadius;
  if (noseRoom < 0.2 || tailRoom < 0.2) problems.push('overhangs too short for the wheels');
  return problems;
}
