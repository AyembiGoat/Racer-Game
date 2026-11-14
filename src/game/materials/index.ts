import type * as THREE from 'three';
import { RECIPES } from './recipes';
import { buildSurface } from './surface';

export type SurfaceName = keyof typeof RECIPES;

export const SURFACE_NAMES = Object.keys(RECIPES) as SurfaceName[];

const cache = new Map<SurfaceName, THREE.MeshStandardMaterial>();

/** Shared PBR material for a named surface, built once on first use. */
export function surface(name: SurfaceName): THREE.MeshStandardMaterial {
  let material = cache.get(name);
  if (!material) {
    material = buildSurface(RECIPES[name]);
    cache.set(name, material);
  }
  return material;
}

/** Map a box or planar geometry's UVs in real-world metres according to its recipe. */
export function applySurface(geometry: THREE.BufferGeometry, name: SurfaceName): void {
  const tile: readonly [number, number] | null = RECIPES[name].tile;
  if (!tile) return;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    if (nx >= ny && nx >= nz) uv.setXY(i, z / tile[0], y / tile[1]);
    else if (ny >= nz) uv.setXY(i, x / tile[0], z / tile[1]);
    else uv.setXY(i, x / tile[0], y / tile[1]);
  }
}
