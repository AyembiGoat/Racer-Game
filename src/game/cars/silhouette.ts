import type { CarSpec } from '../../core/cars';
import { carAnchors } from '../../core/cars';
import type { BodyDims } from './loft';
import { bodySurface } from './loft';
import { CAR_SHAPES } from './shapes';

export function bodyDims(car: CarSpec): BodyDims {
  const anchors = carAnchors(car);
  return {
    length: car.real.length,
    halfWidth: car.real.width / 2,
    height: CAR_SHAPES[car.id].roofHeight,
    frontAxle: car.visual.frontOverhang,
    rearAxle: car.visual.frontOverhang + car.real.wheelbase,
    frontRadius: anchors.frontWheel.y,
    rearRadius: anchors.rearWheel.y,
  };
}

/**
 * Side profile of a car as SVG, drawn from the same shape the 3D model is built from,
 * nose to the left. Fits a 96 x 32 view box.
 */
export function renderCarSilhouette(car: CarSpec, className = 'ui-car-silhouette'): string {
  const shape = CAR_SHAPES[car.id];
  const dims = bodyDims(car);
  const surface = bodySurface(shape.body, dims);
  const { cabin } = shape.body;
  const scale = 90 / 4.8;
  const left = (96 - dims.length * scale) / 2;
  const px = (z: number) => (left + z * scale).toFixed(1);
  const py = (y: number) => (30.5 - y * scale).toFixed(1);

  const cabinEnd = cabin.open ? cabin.screenTop : cabin.rearBase;
  const top: string[] = [];
  const bottom: string[] = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const z = (dims.length * i) / steps;
    const body = surface.edge(z) + Math.max(0, surface.crown(z));
    const roof = z >= cabin.cowl && z <= cabinEnd ? surface.roof(z) + cabin.roofCrown : 0;
    top.push(`${px(z)},${py(Math.max(body, roof))}`);
    bottom.push(`${px(z)},${py(Math.max(surface.under(z), surface.arch(z)))}`);
  }
  const outline = [...top, ...bottom.reverse()].join(' ');
  const belt = `M${px(cabin.cowl)} ${py(surface.edge(cabin.cowl))}L${px(cabinEnd)} ${py(surface.edge(cabinEnd))}`;
  const wheel = (axle: number, radius: number) =>
    `<circle cx="${px(axle)}" cy="${py(radius)}" r="${(radius * scale).toFixed(1)}" /><circle cx="${px(axle)}" cy="${py(radius)}" r="${(radius * scale * 0.45).toFixed(1)}" />`;
  return `<svg class="${className}" viewBox="0 0 96 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polygon points="${outline}" />
    <path d="${belt}" />
    ${wheel(dims.frontAxle, dims.frontRadius)}${wheel(dims.rearAxle, dims.rearRadius)}
  </svg>`;
}
