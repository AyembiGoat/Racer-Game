import * as THREE from 'three';

/**
 * Turns a procedural surface recipe into a lit PBR material with matching
 * colour, height-derived normal and roughness textures. Uses deterministic
 * integer hashing so every run produces the exact same pixels.
 */

export interface Texel {
  /** Colour, 0..255 per channel, under neutral white light. */
  r: number;
  g: number;
  b: number;
  /** 0 is the lowest point of the surface, 1 the highest. */
  height: number;
  /** 0 is mirror-smooth, 1 is matte. */
  roughness: number;
}

export interface Tools {
  /** Seamless value noise 0..1 with `fu` × `fv` cells per tile. */
  noise(u: number, v: number, fu: number, fv: number, seed: number): number;
  /** Layered octaves of seamless noise 0..1. */
  fbm(u: number, v: number, fu: number, fv: number, octaves: number, seed: number): number;
  /** Deterministic 0..1 value for an integer index. */
  hash(n: number, seed: number): number;
}

export interface SurfaceRecipe {
  readonly pixels: readonly [number, number];
  /** Metres covered by one UV repeat, or null when UVs are authored directly. */
  readonly tile: readonly [number, number] | null;
  /** Real-world height difference between 0 and 1 in metres. */
  readonly relief: number;
  readonly metalness: number;
  texel(u: number, v: number, tools: Tools, out: Texel): void;
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(u: number, v: number, fu: number, fv: number, seed: number): number {
  const x = u * fu;
  const y = v * fv;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const xa = ((x0 % fu) + fu) % fu;
  const ya = ((y0 % fv) + fv) % fv;
  const xb = (xa + 1) % fu;
  const yb = (ya + 1) % fv;
  const top = hash2(xa, ya, seed) + (hash2(xb, ya, seed) - hash2(xa, ya, seed)) * sx;
  const bottom = hash2(xa, yb, seed) + (hash2(xb, yb, seed) - hash2(xa, yb, seed)) * sx;
  return top + (bottom - top) * sy;
}

const TOOLS: Tools = {
  noise,
  fbm(u, v, fu, fv, octaves, seed) {
    let total = 0;
    let weight = 0;
    let amplitude = 1;
    for (let i = 0; i < octaves; i++) {
      total += noise(u, v, fu << i, fv << i, seed + i * 17) * amplitude;
      weight += amplitude;
      amplitude *= 0.5;
    }
    return total / weight;
  },
  hash: (n, seed) => hash2(n, 0, seed),
};

function makeTexture(
  data: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  srgb: boolean,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is not available');
  context.putImageData(new ImageData(data, width, height), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function buildSurface(recipe: SurfaceRecipe): THREE.MeshStandardMaterial {
  const [width, height] = recipe.pixels;
  const count = width * height;
  const colour = new Uint8ClampedArray(count * 4);
  const rough = new Uint8ClampedArray(count * 4);
  const normal = new Uint8ClampedArray(count * 4);
  const heights = new Float32Array(count);
  const out: Texel = { r: 0, g: 0, b: 0, height: 0, roughness: 0 };

  for (let j = 0; j < height; j++) {
    const v = 1 - (j + 0.5) / height;
    for (let i = 0; i < width; i++) {
      recipe.texel((i + 0.5) / width, v, TOOLS, out);
      const index = j * width + i;
      colour[index * 4] = out.r;
      colour[index * 4 + 1] = out.g;
      colour[index * 4 + 2] = out.b;
      colour[index * 4 + 3] = 255;
      rough[index * 4 + 1] = out.roughness * 255;
      rough[index * 4 + 3] = 255;
      heights[index] = out.height;
    }
  }

  const metresPerPixelU = (recipe.tile?.[0] ?? 1) / width;
  const metresPerPixelV = (recipe.tile?.[1] ?? 1) / height;
  for (let j = 0; j < height; j++) {
    const up = ((j - 1 + height) % height) * width;
    const down = ((j + 1) % height) * width;
    for (let i = 0; i < width; i++) {
      const left = (i - 1 + width) % width;
      const right = (i + 1 + width) % width;
      const row = j * width;
      const slopeU =
        (((heights[row + right] ?? 0) - (heights[row + left] ?? 0)) * recipe.relief) /
        (2 * metresPerPixelU);
      const slopeV =
        (((heights[up + i] ?? 0) - (heights[down + i] ?? 0)) * recipe.relief) /
        (2 * metresPerPixelV);
      const len = Math.hypot(slopeU, slopeV, 1);
      const index = (row + i) * 4;
      normal[index] = (-slopeU / len) * 127.5 + 127.5;
      normal[index + 1] = (-slopeV / len) * 127.5 + 127.5;
      normal[index + 2] = (1 / len) * 127.5 + 127.5;
      normal[index + 3] = 255;
    }
  }

  return new THREE.MeshStandardMaterial({
    map: makeTexture(colour, width, height, true),
    normalMap: makeTexture(normal, width, height, false),
    roughnessMap: makeTexture(rough, width, height, false),
    roughness: 1,
    metalness: recipe.metalness,
  });
}
