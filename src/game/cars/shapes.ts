import type { CarId } from '../../core/cars';
import type { BodyDims, BodyShape, BodySurface } from './loft';
import type { Parts } from './parts';
import type { WheelStyle } from './wheels';

/** Everything a detail pass needs. `zm` turns metres behind the nose into model z. */
export interface DetailContext {
  readonly parts: Parts;
  readonly surface: BodySurface;
  readonly dims: BodyDims;
  readonly shape: BodyShape;
  readonly zm: (zFromNose: number) => number;
}

export interface CarShape {
  readonly body: BodyShape;
  readonly wheel: WheelStyle;
  /** Height used for the roof line; an open car measures to its windscreen header. */
  readonly roofHeight: number;
  readonly seatSpread: number;
  readonly rearSeat: boolean;
  readonly mirror: 'paint' | 'trim';
  readonly details: (ctx: DetailContext) => void;
}

/** Proportions read from the photographs listed in reference/cars.md. */

function mirrored(place: (side: number) => void) {
  place(1);
  place(-1);
}

function exhaust(ctx: DetailContext, x: number, y: number, radius: number) {
  const z = ctx.zm(ctx.dims.length);
  ctx.parts.tube('chrome', radius, 0.16, x, y, z - 0.03);
  ctx.parts.tube('trim', radius * 0.8, 0.02, x, y, z + 0.045);
}

function plate(ctx: DetailContext, y: number, rear: boolean) {
  const z = rear ? ctx.zm(ctx.dims.length) + 0.006 : ctx.zm(0) - 0.006;
  ctx.parts.box('plate', 0.44, 0.1, 0.012, 0, y, z);
}

const bmwM3E30: CarShape = {
  roofHeight: 1.37,
  seatSpread: 0.36,
  rearSeat: true,
  mirror: 'trim',
  wheel: { spokes: 20, spokeWidth: 0.02, paired: true, finish: 'alloy', caliper: 0x2a2c30 },
  body: {
    edge: [
      [0, 0.76],
      [0.08, 0.81],
      [1.3, 0.9],
      [3.38, 0.935],
      [3.56, 0.985],
      [4.345, 0.975],
    ],
    crown: [
      [0, 0.004],
      [0.3, 0.035],
      [1.3, 0.03],
      [3.6, 0.02],
      [4.345, 0.015],
    ],
    plan: [
      [0, 0.88],
      [0.1, 0.97],
      [0.5, 1],
      [3.9, 1],
      [4.25, 0.97],
      [4.345, 0.9],
    ],
    under: [
      [0, 0.2],
      [0.5, 0.19],
      [3.8, 0.19],
      [4.0, 0.27],
      [4.345, 0.3],
    ],
    shoulder: [
      [0, 0.035],
      [4.345, 0.035],
    ],
    tuck: 0.03,
    flareFront: 0.04,
    flareRear: 0.045,
    flareSpan: 1.55,
    archGap: 0.055,
    smoothing: 0.07,
    sill: 'paint',
    cabin: {
      cowl: 1.3,
      screenTop: 1.9,
      roofEnd: 3.0,
      rearBase: 3.54,
      tumble: 0.17,
      roofCrown: 0.035,
      sideGlassEnd: 3.2,
      pillar: [2.44, 2.51],
      open: false,
      tubFrom: 1.6,
      tubTo: 3.22,
      tubFloor: 0.45,
    },
  },
  details(ctx) {
    const { parts, surface, dims, zm } = ctx;
    const nose = zm(0);
    const tail = zm(dims.length);
    // Black grille panel with the twin kidneys and four round lamps.
    parts.box('trim', 1.34, 0.15, 0.03, 0, 0.675, nose - 0.004);
    mirrored((side) => {
      parts.box('chrome', 0.1, 0.125, 0.02, side * 0.06, 0.675, nose - 0.016);
      parts.box('trim', 0.074, 0.1, 0.01, side * 0.06, 0.675, nose - 0.027);
      for (const x of [0.33, 0.52]) {
        parts.tube('chrome', 0.07, 0.03, side * x, 0.675, nose - 0.012);
        parts.tube('lamp', 0.06, 0.03, side * x, 0.675, nose - 0.02);
      }
      // Bumper indicators and air-dam fog lamps.
      parts.box('amber', 0.13, 0.045, 0.02, side * 0.56, 0.5, nose - 0.03);
      parts.box('lamp', 0.16, 0.07, 0.02, side * 0.5, 0.33, nose - 0.006);
    });
    parts.box('trim', 1.5, 0.06, 0.05, 0, 0.5, nose - 0.012);
    parts.box('trim', 0.62, 0.08, 0.02, 0, 0.33, nose - 0.004);
    plate(ctx, 0.42, false);

    // Side rub strip between the arches.
    const stripFrom = dims.frontAxle + dims.frontRadius + 0.16;
    const stripTo = dims.rearAxle - dims.rearRadius - 0.16;
    mirrored((side) => {
      parts.box(
        'trim',
        0.016,
        0.045,
        stripTo - stripFrom,
        side * (surface.halfWidth(2) - 0.004),
        0.56,
        zm((stripFrom + stripTo) / 2),
      );
      parts.box('trim', 0.012, 0.022, 0.1, side * (surface.halfWidth(2.2) - 0.003), 0.8, zm(2.36));
    });

    // Boot wing on two end plates.
    const wingY = surface.edge(4.2) + 0.15;
    parts.box('paint', 1.36, 0.03, 0.24, 0, wingY, tail - 0.16, -0.08);
    mirrored((side) => {
      parts.box('paint', 0.03, 0.16, 0.26, side * 0.66, wingY - 0.07, tail - 0.16);
    });

    // Tail lamps: amber outer, red, reverse inner.
    const lampY = 0.8;
    mirrored((side) => {
      parts.box('amber', 0.11, 0.14, 0.02, side * 0.63, lampY, tail + 0.004);
      parts.box('brake', 0.25, 0.14, 0.02, side * 0.445, lampY, tail + 0.004);
      parts.box('reverse', 0.08, 0.14, 0.02, side * 0.275, lampY, tail + 0.004);
    });
    parts.box('trim', 0.46, 0.15, 0.012, 0, lampY, tail + 0.002);
    plate(ctx, lampY, true);
    parts.box('trim', 1.5, 0.06, 0.05, 0, 0.53, tail + 0.012);
    exhaust(ctx, -0.5, 0.27, 0.034);
    exhaust(ctx, -0.41, 0.27, 0.034);
  },
};

const mazdaMx5Na: CarShape = {
  roofHeight: 1.215,
  seatSpread: 0.34,
  rearSeat: false,
  mirror: 'paint',
  wheel: { spokes: 7, spokeWidth: 0.06, paired: false, finish: 'alloy', caliper: 0x2a2c30 },
  body: {
    edge: [
      [0, 0.5],
      [0.12, 0.6],
      [0.6, 0.7],
      [1.35, 0.76],
      [2.6, 0.77],
      [3.2, 0.78],
      [3.8, 0.74],
      [3.97, 0.67],
    ],
    crown: [
      [0, 0],
      [0.4, 0.05],
      [1.3, 0.035],
      [2.8, 0.02],
      [3.3, 0.035],
      [3.97, 0.02],
    ],
    plan: [
      [0, 0.74],
      [0.15, 0.9],
      [0.6, 0.99],
      [1.5, 1],
      [3.3, 0.99],
      [3.8, 0.92],
      [3.97, 0.78],
    ],
    under: [
      [0, 0.3],
      [0.3, 0.2],
      [0.6, 0.17],
      [3.3, 0.17],
      [3.7, 0.24],
      [3.97, 0.34],
    ],
    shoulder: [
      [0, 0.12],
      [3.97, 0.12],
    ],
    tuck: 0.05,
    flareFront: 0.012,
    flareRear: 0.015,
    flareSpan: 1.3,
    archGap: 0.05,
    smoothing: 0.1,
    sill: 'trim',
    cabin: {
      cowl: 1.42,
      screenTop: 1.86,
      roofEnd: 2.6,
      rearBase: 2.78,
      tumble: 0.1,
      roofCrown: 0.02,
      sideGlassEnd: 2.6,
      pillar: null,
      open: true,
      tubFrom: 1.62,
      tubTo: 2.64,
      tubFloor: 0.36,
    },
  },
  details(ctx) {
    const { parts, surface, dims, shape, zm } = ctx;
    const nose = zm(0);
    const tail = zm(dims.length);
    // Oval intake and the small oval lamps beside it.
    parts.blob('trim', 0.27, 0.05, 0.03, 0, 0.385, nose + 0.004);
    mirrored((side) => {
      parts.blob('amber', 0.075, 0.032, 0.03, side * 0.46, 0.47, nose + 0.03, 0, side * -0.5);
      // Flush pop-up lamp lids, raised a few millimetres so their outline reads.
      const lidZ = 0.5;
      parts.box(
        'paint',
        0.2,
        0.012,
        0.15,
        side * 0.47,
        surface.topAt(0.47, lidZ) + 0.002,
        zm(lidZ),
        -0.1,
      );
    });
    // Windscreen header joining the two pillars.
    const { cabin } = shape;
    const header = surface.roof(cabin.screenTop);
    const headerHalf = surface.cabinBase(cabin.screenTop) - cabin.tumble;
    parts.box(
      'trim',
      headerHalf * 2,
      0.03,
      0.045,
      0,
      header + cabin.roofCrown * 0.6,
      zm(cabin.screenTop),
    );

    // Tail: oval lamp clusters, plate recess, single exhaust.
    mirrored((side) => {
      parts.blob('brake', 0.11, 0.045, 0.03, side * 0.43, 0.58, tail - 0.002);
      parts.blob('amber', 0.04, 0.04, 0.03, side * 0.555, 0.58, tail - 0.03, 0, side * 0.5);
      parts.blob('reverse', 0.035, 0.035, 0.03, side * 0.3, 0.58, tail + 0.001);
    });
    parts.box('trim', 0.5, 0.12, 0.012, 0, 0.47, tail + 0.002);
    plate(ctx, 0.47, true);
    exhaust(ctx, 0.36, 0.25, 0.03);
  },
};

const fordMustangGtS550: CarShape = {
  roofHeight: 1.382,
  seatSpread: 0.38,
  rearSeat: true,
  mirror: 'paint',
  wheel: { spokes: 10, spokeWidth: 0.034, paired: true, finish: 'darkAlloy', caliper: 0x1c1d20 },
  body: {
    edge: [
      [0, 0.68],
      [0.08, 0.79],
      [0.5, 0.9],
      [1.6, 0.96],
      [3.0, 0.985],
      [3.7, 1.04],
      [4.5, 1.03],
      [4.783, 0.99],
    ],
    crown: [
      [0, 0],
      [0.4, 0.06],
      [1.5, 0.07],
      [4.2, 0.012],
      [4.783, 0.008],
    ],
    plan: [
      [0, 0.86],
      [0.15, 0.95],
      [0.6, 0.99],
      [4.2, 1],
      [4.65, 0.96],
      [4.783, 0.89],
    ],
    under: [
      [0, 0.2],
      [0.5, 0.18],
      [4.0, 0.19],
      [4.3, 0.3],
      [4.783, 0.36],
    ],
    shoulder: [
      [0, 0.06],
      [2.6, 0.06],
      [3.5, 0.1],
      [4.3, 0.085],
      [4.783, 0.06],
    ],
    tuck: 0.05,
    flareFront: 0.03,
    flareRear: 0.045,
    flareSpan: 1.4,
    archGap: 0.06,
    smoothing: 0.09,
    sill: 'paint',
    cabin: {
      cowl: 1.6,
      screenTop: 2.36,
      roofEnd: 3.05,
      rearBase: 4.3,
      tumble: 0.2,
      roofCrown: 0.035,
      sideGlassEnd: 3.62,
      pillar: [3.02, 3.08],
      open: false,
      tubFrom: 1.95,
      tubTo: 3.5,
      tubFloor: 0.48,
    },
  },
  details(ctx) {
    const { parts, surface, dims, zm } = ctx;
    const nose = zm(0);
    const tail = zm(dims.length);
    // Tall grille, lower intake, splitter.
    parts.box('trim', 0.98, 0.2, 0.03, 0, 0.58, nose - 0.004);
    parts.box('chrome', 0.14, 0.05, 0.012, 0, 0.58, nose - 0.022);
    parts.box('trim', 1.2, 0.1, 0.03, 0, 0.33, nose - 0.004);
    parts.box('trim', 1.5, 0.02, 0.1, 0, 0.2, nose + 0.03);
    mirrored((side) => {
      // Slim lamps swept back around the corner.
      parts.box('lamp', 0.26, 0.07, 0.03, side * 0.6, 0.7, nose + 0.004, 0, side * -0.12);
      parts.box('trim', 0.28, 0.012, 0.03, side * 0.6, 0.742, nose + 0.003, 0, side * -0.12);
      parts.box('amber', 0.12, 0.022, 0.02, side * 0.58, 0.46, nose - 0.004);
    });
    // Bonnet vents.
    mirrored((side) => {
      parts.box(
        'trim',
        0.05,
        0.012,
        0.3,
        side * 0.3,
        surface.topAt(0.3, 0.95) + 0.003,
        zm(0.95),
        -0.05,
      );
    });

    // Rear panel with three-bar lamps each side.
    const lampY = 0.89;
    parts.box('trim', 1.52, 0.2, 0.02, 0, lampY, tail + 0.002);
    mirrored((side) => {
      for (const x of [0.49, 0.57, 0.65]) {
        parts.box('brake', 0.055, 0.16, 0.02, side * x, lampY, tail + 0.012);
      }
      parts.box('reverse', 0.05, 0.03, 0.02, side * 0.4, lampY - 0.06, tail + 0.012);
      exhaust(ctx, side * 0.56, 0.3, 0.05);
    });
    parts.box('trim', 1.3, 0.16, 0.03, 0, 0.36, tail + 0.002);
    plate(ctx, 0.62, true);
    // Lip on the trailing edge of the deck.
    parts.box('paint', 1.5, 0.025, 0.1, 0, surface.edge(dims.length - 0.06) + 0.02, tail - 0.06);
  },
};

const porscheCaymanS987: CarShape = {
  roofHeight: 1.305,
  seatSpread: 0.36,
  rearSeat: false,
  mirror: 'paint',
  wheel: { spokes: 5, spokeWidth: 0.075, paired: false, finish: 'alloy', caliper: 0xb5161a },
  body: {
    edge: [
      [0, 0.5],
      [0.15, 0.61],
      [0.6, 0.745],
      [1.4, 0.84],
      [2.6, 0.88],
      [3.3, 0.93],
      [3.9, 0.87],
      [4.341, 0.74],
    ],
    crown: [
      [0, 0],
      [0.3, -0.035],
      [0.95, -0.035],
      [1.38, 0.015],
      [3.95, 0],
      [4.341, 0.015],
    ],
    plan: [
      [0, 0.76],
      [0.18, 0.92],
      [0.7, 0.99],
      [3.6, 1],
      [4.1, 0.95],
      [4.341, 0.82],
    ],
    under: [
      [0, 0.26],
      [0.35, 0.18],
      [3.7, 0.19],
      [4.0, 0.26],
      [4.341, 0.36],
    ],
    shoulder: [
      [0, 0.1],
      [1.3, 0.09],
      [2.4, 0.07],
      [3.0, 0.15],
      [3.8, 0.16],
      [4.341, 0.1],
    ],
    tuck: 0.05,
    flareFront: 0.012,
    flareRear: 0.02,
    flareSpan: 1.3,
    archGap: 0.05,
    smoothing: 0.1,
    sill: 'paint',
    cabin: {
      cowl: 1.4,
      screenTop: 2.0,
      roofEnd: 2.55,
      rearBase: 3.95,
      tumble: 0.19,
      roofCrown: 0.04,
      sideGlassEnd: 3.0,
      pillar: null,
      open: false,
      tubFrom: 1.7,
      tubTo: 2.75,
      tubFloor: 0.42,
    },
  },
  details(ctx) {
    const { parts, surface, dims, zm } = ctx;
    const nose = zm(0);
    const tail = zm(dims.length);
    // Three low intakes.
    parts.box('trim', 0.46, 0.09, 0.03, 0, 0.33, nose - 0.002);
    mirrored((side) => {
      parts.box('trim', 0.3, 0.1, 0.03, side * 0.47, 0.34, nose + 0.012, 0, side * -0.3);
      parts.box('lamp', 0.2, 0.018, 0.02, side * 0.47, 0.41, nose + 0.01, 0, side * -0.3);
      // Oval lamps laid back into the raised wings.
      const lampZ = 0.4;
      parts.blob(
        'lamp',
        0.105,
        0.035,
        0.17,
        side * 0.6,
        surface.topAt(0.6, lampZ) - 0.004,
        zm(lampZ),
        -0.3,
      );
      // Slatted intake ahead of the rear wheel.
      const intakeZ = dims.rearAxle - dims.rearRadius - 0.22;
      const x = surface.flank(intakeZ) - 0.012;
      parts.box('trim', 0.03, 0.24, 0.13, side * x, 0.6, zm(intakeZ));
      for (const y of [0.54, 0.6, 0.66]) {
        parts.box('paint', 0.012, 0.012, 0.14, side * (x + 0.012), y, zm(intakeZ));
      }
    });

    // Wrap-around tail lamps, centre twin exhaust, spoiler lip.
    mirrored((side) => {
      parts.blob('brake', 0.15, 0.05, 0.07, side * 0.55, 0.69, tail - 0.07, 0, side * 0.6);
      parts.blob('reverse', 0.04, 0.02, 0.03, side * 0.36, 0.68, tail - 0.012);
      exhaust(ctx, side * 0.055, 0.31, 0.042);
    });
    parts.box('trim', 0.7, 0.13, 0.03, 0, 0.4, tail + 0.002);
    plate(ctx, 0.56, true);
    parts.box(
      'trim',
      1.1,
      0.014,
      0.1,
      0,
      surface.edge(dims.length - 0.36) + 0.008,
      zm(dims.length - 0.36),
      0.2,
    );
  },
};

export const CAR_SHAPES: Readonly<Record<CarId, CarShape>> = {
  'bmw-m3-e30': bmwM3E30,
  'mazda-mx5-na': mazdaMx5Na,
  'ford-mustang-gt-s550': fordMustangGtS550,
  'porsche-cayman-s-987': porscheCaymanS987,
};
