---
name: rendering-performance
description: How to work on rendering, lighting, materials, effects and frame rate in Three.js. Use when changing how the game looks or when investigating slow frames or load times.
---

# Rendering and performance

## Targets

- 60 fps at 1080p on a mid-range laptop GPU is the floor. Frame time budget 16.6 ms.
- Consistent frame pacing matters more than peak frame rate. A single dropped frame in
  a braking zone or mid-apex ruins a lap.

## Rules for render code (`src/game`)

- Do not allocate in the frame loop. Create `Vector3`, `Quaternion`, `Matrix4`, `Color`
  and scratch objects once and reuse them.
- Share geometries and materials. Merge static track geometry (road ribbon, continuous
  barriers, kerbs) and use `InstancedMesh` for repeated trackside objects (posts,
  cones, distance boards, trees).
- Dispose of what you remove when switching tracks or cars: `geometry.dispose()`,
  `material.dispose()`, `texture.dispose()`.
- Cap device pixel ratio at 2.
- Rendering reads simulation state and interpolates (`alpha`). It never mutates state.

## Cost, roughly in order

1. Draw calls. Keep the road and barriers as merged meshes and instance repeats.
2. Overdraw and transparency. Large transparent tyre-smoke sprites stacked behind the
   car tank fill rate fast; cap particle count and screen coverage.
3. Shadows. Tight directional shadow frustum following the car, or baked static light.
4. Full-screen post-processing passes.
5. Triangle count, which rarely dominates until draw calls and fill rate are under
   control.

## Pre-warming

Compile shaders at start-up (`renderer.compile(scene, camera)`), including meshes for
effects that start hidden, so the first barrier spark or skid mark never causes a frame
hitch.

## Readability at speed

- Road edges, braking markers, kerbs and barriers must stay crisp against the
  background at 150+ km/h.
- Avoid low-angle glare, heavy fog or murky contrast that hides where a corner turns.
- Keep anisotropic filtering enabled on road and kerb textures once textures are added,
  as the camera views asphalt at shallow grazing angles.

## Measuring and verification

`npm run check` verifies none of this. Measure `renderer.info.render` (draw calls and
triangles) and frame times in the browser before and after performance changes, run
`npm run playtest` to verify visual output, and report real numbers with the scene they
were taken in.
