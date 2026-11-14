---
name: textures
description: How surfaces get their look once art direction is chosen. One shared library of named surfaces that road, kerbs, barriers, props and car materials use. Use before giving anything a texture or material beyond baseline grey-box.
---

# Textures

While the art direction in `AGENTS.md` is undecided, geometry stays untextured grey-box.
Once the owner picks a direction and textured surfaces are built, every surface in the
game must come from one shared library, `src/game/materials/`, so road asphalt,
concrete barriers, kerbs, grass, rubber and car materials look like they belong to the
same world.

## Pattern

Expose named recipes from `src/game/materials/` rather than creating ad-hoc textures or
materials in individual track or car files:

```ts
import { surface, applySurface } from '../materials';
```

Map UVs in real metres so aggregate grain on an 11 m road matches the grain on a pit
apron, and kerb blocks keep a consistent length around the track.

Do not:

- scatter one-off `new THREE.MeshStandardMaterial({ color })` across track and prop
  files once the shared library exists (plain materials remain fine for tiny untextured
  parts such as bolts or bulbs).
- draw to a canvas or load an image inside a single prop or track file.
- stretch UVs by eye to make a texture fit.

## Adding a surface

1. Find or generate a reference image first (`reference-images` skill).
2. Add a named recipe in `src/game/materials/` with real-world `tile` size and `relief`
   depth in metres (for example, coarse asphalt aggregate versus smooth painted kerb).
3. Use deterministic noise functions only — never `Math.random` — so procedural textures
   render identically across runs and playtest captures.
4. Add a `--materials` preview mode to `scripts/playtest.mjs` when `src/game/materials/`
   is created so every surface can be inspected side by side under the game's lighting.

## What makes a road or trackside recipe read well

- Base colour stays within realistic albedo values (about 30 to 220 under white light;
  fresh asphalt is dark grey, never pure black `0`, so tyre marks and shadows still
  show).
- Put cracks, aggregate, kerb joints and rumble strips into height/normal maps as well
  as roughness, not painted shadows.
- Keep broad contrast subtle on surfaces the camera flies over at 150 km/h; high-contrast
  blotches strobe and tile noticeably down a long straight.
- Avoid regular high-frequency patterns finer than a few texels, which shimmer near the
  horizon even with mipmaps and anisotropic filtering.
