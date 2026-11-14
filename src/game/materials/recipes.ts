import type { SurfaceRecipe } from './surface';

/**
 * Shared surface recipes for the circuit, trackside structures and car parts.
 * Colours represent diffuse albedo under plain white daylight; lighting and sky
 * reflections supply the rest.
 */

const asphalt: SurfaceRecipe = {
  pixels: [256, 256],
  tile: [4.5, 4.5],
  relief: 0.004,
  metalness: 0,
  texel(u, v, tools, out) {
    const patch = tools.fbm(u, v, 3, 3, 3, 11);
    const stones = tools.noise(u, v, 64, 64, 29);
    const fine = tools.noise(u, v, 128, 128, 53);
    const grain = stones * 0.6 + fine * 0.4;
    const base = 66 + (patch - 0.5) * 10 + (grain - 0.5) * 18;
    out.r = base;
    out.g = base + 1;
    out.b = base + 4;
    out.height = 0.35 + grain * 0.65;
    out.roughness = 0.84 - patch * 0.06 + (1 - grain) * 0.06;
  },
};

const grass: SurfaceRecipe = {
  pixels: [256, 256],
  tile: [9, 9],
  relief: 0.018,
  metalness: 0,
  texel(u, v, tools, out) {
    const meadow = tools.fbm(u, v, 3, 3, 4, 71);
    const clump = tools.fbm(u, v, 16, 16, 3, 97);
    const blades = tools.noise(u, v, 84, 84, 131);
    const dry = Math.max(0, meadow - 0.55) * 24;
    out.r = 76 + clump * 22 + blades * 10 + dry;
    out.g = 118 + meadow * 22 + clump * 18 + blades * 12;
    out.b = 50 + clump * 14 + blades * 6;
    out.height = clump * 0.55 + blades * 0.45;
    out.roughness = 0.9 - blades * 0.06;
  },
};

const kerb: SurfaceRecipe = {
  pixels: [128, 256],
  tile: [0.95, 2.4],
  relief: 0.008,
  metalness: 0,
  texel(u, v, tools, out) {
    const redBlock = v < 0.5;
    const blockV = (v * 2) % 1;
    const joint = Math.min(blockV, 1 - blockV);
    const bevel = Math.min(1, joint / 0.045);
    const grit = tools.fbm(u, v, 12, 24, 3, 181);
    const scuff = tools.fbm(u, v, 6, 14, 3, 211) * (1 - u * 0.5);

    if (redBlock) {
      out.r = 198 - scuff * 26 + (grit - 0.5) * 10;
      out.g = 46 + scuff * 8 + (grit - 0.5) * 8;
      out.b = 42 + scuff * 8 + (grit - 0.5) * 8;
    } else {
      out.r = 232 - scuff * 30 + (grit - 0.5) * 8;
      out.g = 233 - scuff * 30 + (grit - 0.5) * 8;
      out.b = 228 - scuff * 28 + (grit - 0.5) * 8;
    }
    if (bevel < 1) {
      const darken = 0.72 + bevel * 0.28;
      out.r *= darken;
      out.g *= darken;
      out.b *= darken;
    }
    out.height = bevel * (0.75 + grit * 0.25);
    out.roughness = 0.76 + grit * 0.14;
  },
};

const guardrail: SurfaceRecipe = {
  pixels: [128, 128],
  tile: [2.5, 0.75],
  relief: 0.022,
  metalness: 0.55,
  texel(u, v, tools, out) {
    // Classic W-beam two-ridge steel profile running horizontally along `u`.
    const wave = Math.cos((v * 2 - 1) * Math.PI * 1.5);
    const ridge = wave * 0.5 + 0.5;
    const postSeam = Math.min(u, 1 - u) < 0.025 ? 0.86 : 1;
    const zinc = tools.fbm(u, v, 14, 6, 3, 251);
    const tone = (182 + zinc * 18) * postSeam;
    out.r = tone;
    out.g = tone + 4;
    out.b = tone + 10;
    out.height = ridge * postSeam;
    out.roughness = 0.42 + (1 - zinc) * 0.14;
  },
};

const concrete: SurfaceRecipe = {
  pixels: [256, 256],
  tile: [3, 3],
  relief: 0.004,
  metalness: 0,
  texel(u, v, tools, out) {
    const broad = tools.fbm(u, v, 4, 4, 3, 307);
    const pores = tools.noise(u, v, 72, 72, 331);
    const tone = 192 + (broad - 0.5) * 18 + (pores - 0.5) * 12;
    out.r = tone + 3;
    out.g = tone + 1;
    out.b = tone - 4;
    out.height = 0.4 + pores * 0.6;
    out.roughness = 0.84 + (1 - pores) * 0.1;
  },
};

const tyreRubber: SurfaceRecipe = {
  pixels: [128, 128],
  tile: [0.35, 0.6],
  relief: 0.004,
  metalness: 0,
  texel(u, v, tools, out) {
    const groove =
      Math.abs(u - 0.28) < 0.045 || Math.abs(u - 0.5) < 0.045 || Math.abs(u - 0.72) < 0.045;
    const grain = tools.noise(u, v, 48, 48, 401);
    const tone = (groove ? 28 : 40) + grain * 8;
    out.r = tone;
    out.g = tone + 1;
    out.b = tone + 3;
    out.height = groove ? 0.15 : 0.85 + grain * 0.15;
    out.roughness = 0.86 + grain * 0.08;
  },
};

const foliage: SurfaceRecipe = {
  pixels: [128, 128],
  tile: [2.5, 2.5],
  relief: 0.04,
  metalness: 0,
  texel(u, v, tools, out) {
    const cluster = tools.fbm(u, v, 8, 8, 3, 443);
    const leaf = tools.noise(u, v, 36, 36, 467);
    out.r = 56 + cluster * 28 + leaf * 12;
    out.g = 98 + cluster * 34 + leaf * 16;
    out.b = 42 + cluster * 14 + leaf * 8;
    out.height = cluster * 0.6 + leaf * 0.4;
    out.roughness = 0.88;
  },
};

export const RECIPES = {
  asphalt,
  grass,
  kerb,
  guardrail,
  concrete,
  'tyre-rubber': tyreRubber,
  foliage,
} as const;
