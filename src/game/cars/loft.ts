import * as THREE from 'three';
import type { PartMaterial, Parts } from './parts';

/** Control points as [metres behind the nose, value]. */
export type Profile = readonly (readonly [number, number])[];

export function sampleProfile(profile: Profile, z: number): number {
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) return 0;
  if (z <= first[0]) return first[1];
  if (z >= last[0]) return last[1];
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (a && b && z <= b[0]) {
      const t = (z - a[0]) / Math.max(b[0] - a[0], 1e-9);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return last[1];
}

/** Piecewise-linear profile rounded by averaging over `radius` metres either side. */
export function smoothProfile(profile: Profile, z: number, radius: number): number {
  let sum = 0;
  for (let k = -4; k <= 4; k++) sum += sampleProfile(profile, z + (radius * k) / 4);
  return sum / 9;
}

export interface CabinShape {
  /** Windscreen base, top of windscreen, end of roof, base of rear glass: metres behind the nose. */
  readonly cowl: number;
  readonly screenTop: number;
  readonly roofEnd: number;
  readonly rearBase: number;
  /** How far the roof edge sits inboard of the shoulder at full height. */
  readonly tumble: number;
  readonly roofCrown: number;
  /** Side glass runs from just behind the cowl to here. */
  readonly sideGlassEnd: number;
  readonly pillar: readonly [number, number] | null;
  /** Open cars keep only the windscreen and its frame. */
  readonly open: boolean;
  /** Cockpit floor zone and height. */
  readonly tubFrom: number;
  readonly tubTo: number;
  readonly tubFloor: number;
}

export interface BodyShape {
  /** Height of the body edge: wing tops, door tops, rear deck edge. */
  readonly edge: Profile;
  /** Extra height at the centreline over the edge: bonnet and deck crown. */
  readonly crown: Profile;
  /** Half-width as a share of the car's half-width, seen from above. */
  readonly plan: Profile;
  /** Height of the lower body edge. */
  readonly under: Profile;
  /** How far the shoulder sits inboard of the widest point; large values make haunches. */
  readonly shoulder: Profile;
  readonly tuck: number;
  readonly flareFront: number;
  readonly flareRear: number;
  /** Arch flare length as a multiple of the arch radius; box flares are longer. */
  readonly flareSpan: number;
  readonly archGap: number;
  readonly smoothing: number;
  readonly sill: PartMaterial;
  readonly cabin: CabinShape;
}

export interface BodyDims {
  readonly length: number;
  readonly halfWidth: number;
  readonly height: number;
  /** Axle positions in metres behind the nose, and wheel radii. */
  readonly frontAxle: number;
  readonly rearAxle: number;
  readonly frontRadius: number;
  readonly rearRadius: number;
}

const BODY_CONTROL = 11;
const CABIN_CONTROL = 7;
/** Points drawn per control segment: the control ring is a cage, the shell a curve through it. */
const BODY_STEPS = 5;
const CABIN_STEPS = 4;
const BODY_RING = (BODY_CONTROL - 1) * BODY_STEPS + 1;
const CABIN_RING = (CABIN_CONTROL - 1) * CABIN_STEPS + 1;
/** Radius of the body corners seen from above. */
const CORNER_RADIUS = 0.12;

/**
 * Draws a ring through its control points. Segments from `from` to `to` are a smooth
 * curve; the rest stay straight. `mirrorEnd` treats the last point as lying on the
 * centreline so the curve crosses it level.
 */
function refine(
  control: THREE.Vector2[],
  steps: number,
  from: number,
  to: number,
  mirrorEnd: boolean,
): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  const at = (i: number) => control[Math.max(0, Math.min(control.length - 1, i))] as THREE.Vector2;
  for (let i = 0; i < control.length - 1; i++) {
    const p1 = at(i);
    const p2 = at(i + 1);
    const smooth = i >= from && i < to;
    let p0 = i - 1 >= from ? at(i - 1) : p1;
    let p3 = i + 2 <= to ? at(i + 2) : p2;
    if (smooth && mirrorEnd && i + 2 > to && to === control.length - 1) {
      p3 = new THREE.Vector2(-p1.x, p1.y);
    }
    if (!smooth) {
      p0 = p1;
      p3 = p2;
    }
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      if (!smooth) {
        out.push(new THREE.Vector2(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t));
        continue;
      }
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      out.push(new THREE.Vector2(blend(p0.x, p1.x, p2.x, p3.x), blend(p0.y, p1.y, p2.y, p3.y)));
    }
  }
  out.push(at(control.length - 1).clone());
  return out;
}

function bump(t: number): number {
  const a = Math.abs(t);
  return a >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * a);
}

/** Functions of `z` (metres behind the nose) describing the finished surface. */
export function bodySurface(shape: BodyShape, dims: BodyDims) {
  const r = shape.smoothing;
  const { cabin } = shape;
  const archRadius = (wheel: number) => wheel + shape.archGap;
  const maxFlare = Math.max(shape.flareFront, shape.flareRear);

  const edge = (z: number) => smoothProfile(shape.edge, z, r);
  const under = (z: number) => smoothProfile(shape.under, z, r * 0.6);
  const shoulder = (z: number) => smoothProfile(shape.shoulder, z, r);
  const flare = (z: number) =>
    shape.flareFront *
      bump((z - dims.frontAxle) / (archRadius(dims.frontRadius) * shape.flareSpan)) +
    shape.flareRear * bump((z - dims.rearAxle) / (archRadius(dims.rearRadius) * shape.flareSpan));
  /** Widest half-width before arch flares. */
  const halfWidth = (z: number) =>
    smoothProfile(shape.plan, z, r * 0.7) * (dims.halfWidth - maxFlare);
  const arch = (z: number) => {
    let top = 0;
    for (const [axle, wheel] of [
      [dims.frontAxle, dims.frontRadius],
      [dims.rearAxle, dims.rearRadius],
    ] as const) {
      const radius = archRadius(wheel);
      const dz = z - axle;
      if (Math.abs(dz) < radius) top = Math.max(top, wheel + Math.sqrt(radius * radius - dz * dz));
    }
    return top;
  };
  const inCabin = (z: number) => z > cabin.cowl + 0.02 && z < cabin.rearBase - 0.02;
  const inTub = (z: number) => z >= cabin.tubFrom && z <= cabin.tubTo;
  const crown = (z: number) => (inCabin(z) ? 0 : smoothProfile(shape.crown, z, r));
  const roofProfile: Profile = [
    [cabin.cowl, edge(cabin.cowl)],
    [cabin.screenTop, dims.height - cabin.roofCrown - 0.012],
    [(cabin.screenTop + cabin.roofEnd) / 2, dims.height - cabin.roofCrown],
    [cabin.roofEnd, dims.height - cabin.roofCrown - 0.03],
    [cabin.rearBase, edge(cabin.rearBase)],
  ];
  /** Roof edge height; the centreline is `roofCrown` higher at full height. */
  const roof = (z: number) => Math.max(edge(z), smoothProfile(roofProfile, z, 0.07));
  /** Half-width of the cabin where it meets the body. */
  const cabinBase = (z: number) => halfWidth(z) - shoulder(z) - 0.012;

  /** Height of the bonnet or deck surface at `x` across the car. */
  const topAt = (x: number, z: number) => {
    const inner = Math.max(halfWidth(z) - shoulder(z), 1e-6);
    const t = Math.min(1, Math.abs(x) / inner);
    const share =
      t > 0.66
        ? ((1 - t) / 0.34) * 0.72
        : t > 0.33
          ? 0.72 + ((0.66 - t) / 0.33) * 0.22
          : 0.94 + ((0.33 - t) / 0.33) * 0.06;
    return edge(z) + crown(z) * share;
  };
  /** Outermost half-width of the flank, arch flares included. */
  const flank = (z: number) => halfWidth(z) + flare(z);

  return {
    edge,
    under,
    shoulder,
    flare,
    halfWidth,
    flank,
    arch,
    inCabin,
    inTub,
    crown,
    roof,
    cabinBase,
    topAt,
  };
}

export type BodySurface = ReturnType<typeof bodySurface>;

function stations(shape: BodyShape, dims: BodyDims): number[] {
  const set = new Set<number>();
  const add = (z: number) => {
    if (z >= 0 && z <= dims.length) set.add(Math.round(z * 1000) / 1000);
  };
  for (let z = 0; z <= dims.length; z += 0.05) add(z);
  add(dims.length);
  // Close spacing in the first and last stretch rounds the corners seen from above.
  for (let z = 0; z <= 0.3; z += 0.02) {
    add(z);
    add(dims.length - z);
  }
  for (const [axle, wheel] of [
    [dims.frontAxle, dims.frontRadius],
    [dims.rearAxle, dims.rearRadius],
  ] as const) {
    const radius = wheel + shape.archGap;
    for (let i = 0; i <= 28; i++) add(axle - radius * Math.cos((Math.PI * i) / 28));
  }
  const { cabin } = shape;
  for (const z of [
    cabin.cowl,
    cabin.screenTop,
    cabin.roofEnd,
    cabin.rearBase,
    cabin.tubFrom,
    cabin.tubTo,
  ]) {
    add(z - 0.021);
    add(z + 0.021);
  }
  if (cabin.pillar) {
    add(cabin.pillar[0]);
    add(cabin.pillar[1]);
  }
  add(cabin.sideGlassEnd);
  // Stations a few millimetres apart make sliver triangles that shade as streaks.
  const sorted = [...set].sort((a, b) => a - b);
  const kept: number[] = [];
  for (const z of sorted) {
    const last = kept[kept.length - 1];
    if (last === undefined || z - last >= 0.012) kept.push(z);
  }
  if (kept[kept.length - 1] !== dims.length) kept[kept.length - 1] = dims.length;
  return kept;
}

function quad(
  parts: Parts,
  material: PartMaterial,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  flip: boolean,
) {
  if (flip) {
    parts.triangle(material, a, c, b);
    parts.triangle(material, a, d, c);
  } else {
    parts.triangle(material, a, b, c);
    parts.triangle(material, a, c, d);
  }
}

/**
 * Builds the body shell and glasshouse as lofted surfaces. The lower edge of the shell
 * follows the wheel arches, so the wheels sit in real openings.
 * `zOrigin` is the model-space z of the nose.
 */
export function loftBody(
  parts: Parts,
  shape: BodyShape,
  dims: BodyDims,
  zOrigin: number,
): BodySurface {
  const surface = bodySurface(shape, dims);
  const { cabin } = shape;
  const zs = stations(shape, dims);

  const bodyRing = (z: number): THREE.Vector2[] => {
    const hw = surface.halfWidth(z);
    const fl = surface.flare(z);
    const yE = surface.edge(z);
    const yL = Math.min(Math.max(surface.under(z), surface.arch(z)), yE - 0.06);
    const sh = Math.min(surface.shoulder(z), hw * 0.5);
    const span = yE - yL;
    const tuck = shape.tuck;
    const ring = [
      new THREE.Vector2(0, yL),
      new THREE.Vector2(Math.max(hw - tuck - 0.14, hw * 0.5), yL),
      new THREE.Vector2(hw - tuck + fl * 0.5, yL + Math.min(0.03, span * 0.2)),
      new THREE.Vector2(hw - tuck * 0.3 + fl * 0.85, yL + span * 0.34),
      new THREE.Vector2(hw + fl, yL + span * 0.6),
      new THREE.Vector2(hw + fl * 0.6 - sh * 0.04, yE - Math.min(sh * 0.9, span * 0.3)),
      new THREE.Vector2(hw - sh * 0.42, yE - Math.min(sh * 0.25, span * 0.1)),
      new THREE.Vector2(hw - sh, yE),
    ];
    const inner = hw - sh;
    // Round the four corners of the body seen from above.
    const fromEnd = Math.min(z, dims.length - z);
    if (fromEnd < CORNER_RADIUS) {
      const limit =
        hw + fl - CORNER_RADIUS + Math.sqrt(CORNER_RADIUS ** 2 - (CORNER_RADIUS - fromEnd) ** 2);
      for (const point of ring) point.x = Math.min(point.x, limit);
    }
    const cabinHere = surface.inCabin(z);
    if (cabinHere) {
      const floor = surface.inTub(z) ? cabin.tubFloor : yE - 0.015;
      ring.push(
        new THREE.Vector2(inner - 0.05, yE - 0.004),
        new THREE.Vector2(inner - 0.075, floor),
        new THREE.Vector2(0, floor),
      );
    } else {
      const c = surface.crown(z);
      ring.push(
        new THREE.Vector2(inner * 0.66, yE + c * 0.72),
        new THREE.Vector2(inner * 0.33, yE + c * 0.94),
        new THREE.Vector2(0, yE + c),
      );
    }
    return refine(ring, BODY_STEPS, 2, cabinHere ? 7 : BODY_CONTROL - 1, !cabinHere);
  };

  const bodyMaterial = (index: number, z: number): PartMaterial => {
    const segment = Math.floor(index / BODY_STEPS);
    if (segment === 0) return 'trim';
    if (segment <= 2) return shape.sill;
    if (segment >= 7 && surface.inCabin(z)) return segment === 7 ? 'trim' : 'interior';
    return 'paint';
  };

  const cabinRing = (z: number): THREE.Vector2[] => {
    const belt = surface.edge(z);
    const base = surface.cabinBase(z);
    const top = surface.roof(z);
    const rise = Math.max(0, top - belt);
    const fullRise = dims.height - cabin.roofCrown - belt;
    const lean = cabin.tumble * Math.min(1, rise / Math.max(fullRise, 0.05));
    const crown = cabin.roofCrown * Math.min(1, rise / Math.max(fullRise, 0.05));
    const roofHalf = base - lean;
    const control = [
      new THREE.Vector2(base, belt),
      new THREE.Vector2(base - lean * 0.42, belt + rise * 0.5),
      new THREE.Vector2(base - lean * 0.88, belt + rise * 0.93),
      new THREE.Vector2(roofHalf - 0.012, top),
      new THREE.Vector2(roofHalf - 0.075, top + crown * 0.45),
      new THREE.Vector2(roofHalf * 0.45, top + crown * 0.92),
      new THREE.Vector2(0, top + crown),
    ];
    return refine(control, CABIN_STEPS, 0, CABIN_CONTROL - 1, true);
  };

  const cabinMaterial = (index: number, z: number): PartMaterial | null => {
    const segment = Math.floor(index / CABIN_STEPS);
    const onRoof = z > cabin.screenTop && z < cabin.roofEnd;
    if (segment <= 1) {
      if (cabin.open) return null;
      if (z < cabin.cowl + 0.1 || z > cabin.sideGlassEnd) return 'paint';
      if (cabin.pillar && z > cabin.pillar[0] && z < cabin.pillar[1]) return 'trim';
      return 'glass';
    }
    if (segment <= 3) return cabin.open ? 'trim' : 'paint';
    if (onRoof) return 'paint';
    // A painted band frames the bottom of each screen.
    if (z < cabin.cowl + 0.06 || z > cabin.rearBase - 0.06) return cabin.open ? 'trim' : 'paint';
    return 'glass';
  };

  const place = (point: THREE.Vector2, z: number, side: number) =>
    new THREE.Vector3(point.x * side, point.y, zOrigin + z);

  /** Inner face of a cabin panel, so the roof is dark from inside. */
  const liner = (point: THREE.Vector2, z: number, side: number) =>
    new THREE.Vector3(point.x * 0.975 * side, point.y - 0.014, zOrigin + z);
  // End faces are added after the shell is smoothed so they keep a crisp edge.
  const caps: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];

  let previousBody: THREE.Vector2[] | null = null;
  let previousCabin: THREE.Vector2[] | null = null;
  let previousZ = 0;
  const cabinEnd = cabin.open ? cabin.screenTop : cabin.rearBase;

  zs.forEach((z, index) => {
    const ring = bodyRing(z);
    if (previousBody) {
      const mid = (z + previousZ) / 2;
      for (const side of [1, -1]) {
        for (let i = 0; i < BODY_RING - 1; i++) {
          const a0 = previousBody[i];
          const a1 = previousBody[i + 1];
          const b0 = ring[i];
          const b1 = ring[i + 1];
          if (!a0 || !a1 || !b0 || !b1) continue;
          quad(
            parts,
            bodyMaterial(i, mid),
            place(a0, previousZ, side),
            place(a1, previousZ, side),
            place(b1, z, side),
            place(b0, z, side),
            side < 0,
          );
        }
      }
    }
    if (index === 0 || index === zs.length - 1) {
      const first = ring[0];
      const last = ring[BODY_RING - 1];
      if (first && last) {
        const centre = new THREE.Vector3(0, (first.y + last.y) / 2, zOrigin + z);
        for (const side of [1, -1]) {
          for (let i = 0; i < BODY_RING - 1; i++) {
            const p0 = ring[i];
            const p1 = ring[i + 1];
            if (!p0 || !p1) continue;
            const front = index === 0;
            const a = place(p0, z, side);
            const b = place(p1, z, side);
            caps.push(front === side > 0 ? [centre, b, a] : [centre, a, b]);
          }
        }
      }
    }
    previousBody = ring;

    if (z >= cabin.cowl - 1e-6 && z <= cabinEnd + 1e-6) {
      const cRing = cabinRing(z);
      if (previousCabin) {
        const mid = (z + previousZ) / 2;
        for (const side of [1, -1]) {
          for (let i = 0; i < CABIN_RING - 1; i++) {
            const material = cabinMaterial(i, mid);
            const a0 = previousCabin[i];
            const a1 = previousCabin[i + 1];
            const b0 = cRing[i];
            const b1 = cRing[i + 1];
            if (!material || !a0 || !a1 || !b0 || !b1) continue;
            quad(
              parts,
              material,
              place(a0, previousZ, side),
              place(a1, previousZ, side),
              place(b1, z, side),
              place(b0, z, side),
              side < 0,
            );
            if (!cabin.open && material !== 'glass') {
              quad(
                parts,
                'interior',
                liner(a0, previousZ, side),
                liner(a1, previousZ, side),
                liner(b1, z, side),
                liner(b0, z, side),
                side > 0,
              );
            }
          }
        }
      }
      previousCabin = cRing;
    }
    previousZ = z;
  });

  // Door shut lines: thin dark strips laid just proud of the flank.
  const doorFront = cabin.cowl + 0.16;
  const rearArchStart = dims.rearAxle - dims.rearRadius - shape.archGap;
  const doorRear = Math.min(doorFront + 1.2, rearArchStart - 0.1);
  for (const z of [doorFront, doorRear]) {
    const before = bodyRing(z - 0.004);
    const after = bodyRing(z + 0.004);
    for (const side of [1, -1]) {
      for (let i = 2 * BODY_STEPS; i < 7 * BODY_STEPS; i++) {
        const a0 = before[i];
        const a1 = before[i + 1];
        const b0 = after[i];
        const b1 = after[i + 1];
        if (!a0 || !a1 || !b0 || !b1) continue;
        const out = (point: THREE.Vector2, at: number) =>
          new THREE.Vector3((point.x + 0.003) * side, point.y, zOrigin + at);
        quad(
          parts,
          'trim',
          out(a0, z - 0.004),
          out(a1, z - 0.004),
          out(b1, z + 0.004),
          out(b0, z + 0.004),
          side < 0,
        );
      }
    }
  }

  parts.sealSurfaces();
  for (const [a, b, c] of caps) parts.triangle('paint', a, b, c);
  parts.sealSurfaces();
  return surface;
}
