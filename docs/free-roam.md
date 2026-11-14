# Free roam: Kestrel Valley

Free roam is a second, much larger driving world alongside Club Circuit. It keeps the
same car, handling, synthesised audio, cameras and pit-wall typography, but removes
laps, sectors, checkpoints and timing. The result is a place to drive: a 2.4 x 1.8 km
valley with a ring road, farm, village, quarry, ridge road and airstrip.

- Enter from **Free Roam** on the title menu, or open `?roam`.
- `?debug` shows the collider overlay from the start; **F3** toggles it anywhere.
- Controls in free roam: **C** cycles chase/bonnet, **R** resets to spawn, **Esc**
  returns to the title. The HUD shows place, elapsed time, distance, surface, speed,
  gear and RPM, and never lap or sector information.

## Architecture at a glance

```
src/core/world/                 World data, sampling, collision index and audits (no Three.js)
  types.ts                      OpenWorldSpec and the collider/query contracts
  build.ts                      Spline sampling, tree planting, collider generation
  roads.ts / grid.ts / query.ts Surface and nearest-road lookups
  collision.ts                  OBB/circle contact resolution
  audit.ts                      Map health report used by tests and automation
  worlds/kestrelValley.ts       Kestrel Valley as plain data
src/core/openWorld.ts           Pure fixed-step driving simulation over a built world
src/game/roam.ts                Browser adapter: lazy build, fixed loop, camera, HUD, settings
src/game/openWorldScene.ts      Mesh construction from the same built data
src/game/ui/roamHud.ts          Free-roam HUD
```

The dependency rule is unchanged: `src/core` knows nothing about rendering, input or
the browser, and lint enforces it. The scene builder and the simulation both read the
same `OpenWorldRuntime`, so what you see is what you collide with.

## World data

`OpenWorldSpec` is the single source of truth. It declares the flat valley floor,
bounds, spawn, recovery points, roads, junction pads, barriers, buildings, trees,
rocks, props and ground patches. Coordinates are metres, X east and Z south; headings
are XZ radians with 0 pointing along -Z.

- **Roads** are spline control points with a width, kind and surface. `buildOpenWorld`
  resamples them into `RoadPath`s with points, normals, tangents and arc lengths.
  Junction pads are separate paved discs, so roads can meet at a square rather than a
  tangle of splines. Runways disable edge lines and add threshold bars and dashes.
- **Barrier sources** are either explicit polylines or `road-edge` offsets between two
  samples, which keeps guardrails exactly parallel to the sampled road. The rail mesh
  and the obstacle collider use the same thickness and path.
- **Buildings** are footprint boxes with kind, wall/roof style and orientation. A
  rendered gable is a pair of roof prisms, but collision uses the footprint.
- **Trees** are the one exception to hand-authored placement: tree zones are seeded,
  deterministic planting regions. Candidates within road clearance, pads, buildings,
  barriers, props, other trees or recovery points are rejected. Accepted trunks become
  `{zone}:{index}:trunk` circle colliders, so the visible tree and its collision are
  generated from the same list.
- **Ground patches** are render-only colour/roughness variation and never affect grip.
  Handling depends only on the paved surface query (`tarmac`, `kerb`, `grass`).

There is no heightfield collision because the valley floor is deliberately flat. The
road surface is evaluated in XZ, and the car is clamped inside the boundary fence well
before the visual world edge.

## Simulation contract

`stepOpenWorld(state, input, dt, runtime)` returns
`{ state, events, contact, candidateCount }` and is deterministic for a given state,
input and dt. `state` is:

```ts
interface OpenWorldState {
  readonly car: CarState;
  readonly surface: DrivingSurface;
  readonly elapsedSeconds: number;
  readonly distanceMetres: number;
}
```

The step advances the existing car model, sweeps the car's bounding box through the
broad-phase grid, resolves the deepest contact, clamps the pose to the world bounds,
recomputes the surface under the wheels and adds travelled distance. Contacts produce
the same game events as the circuit, which feed the existing impact and tyre audio.
A shallow tangential-heading assist helps the car slide along walls without changing
straight-line handling.

`createRoamMode(renderer, audio)` wraps this in the browser. It builds the world and
scene lazily on first entry, runs `stepOpenWorld` through the shared fixed loop, adapts
the renderer pixel ratio like the circuit, exposes camera cycling, reset, recovery
teleport, settings, audit and render info, and owns the `.roam-layer` HUD. Both modes
share the same `WebGLRenderer`; entering or leaving free roam only swaps scenes.

## Rendering and budget

`openWorldScene.ts` extrudes the built data into Three.js meshes:

- Asphalt and paint are merged ribbon geometries; junction pads and ground patches are
  merged per material. Kerbs are separate strips because they use a different material.
- Boundary fences, guardrails, stone walls and timber fences are instanced boxes, one
  draw per barrier style. Props share two instanced cylinders (steel and concrete),
  one instanced leg mesh and textured sign planes instead of one mesh per prop.
- Trees are chunked on a 1200 m grid: one instanced trunk mesh and one instanced canopy
  mesh per chunk. Trunks do not cast shadows; canopies do.
- The car body and each wheel assembly are collapsed per material with
  `mergeByMaterial`, dropping the car to roughly eight draw calls.
- A non-collidable ring of low-poly mountains sits outside the fence and is merged into
  two meshes (rock and snow). Fog and the far plane are set for a 4.4 km view.

The agreed open-world budget is **115 draw calls**, inherited from the Club Circuit
baseline. Kestrel Valley currently renders **69-74 calls** and about 267k triangles at
1280x720 with pixel ratio 1.

## Verification

| Command                  | What it proves                                                                    |
| ------------------------ | --------------------------------------------------------------------------------- |
| `npm run check`          | Types, lint, formatting, 49 unit tests and production build                       |
| `npm run playtest`       | Club Circuit still drives, sounds and laps (22/22 checks)                         |
| `npm run playtest:roam`  | Free roam spawn, driving, bounds, HUD, debug overlay and menu path (19/19 checks) |
| `npm run perf`           | Frame pacing and renderer counts for Club Circuit                                 |
| `npm run perf -- --roam` | The same for Kestrel Valley                                                       |

The roam playtest also writes `playtest/roam/*.png` for the menu entry, spawn, ring,
village, airstrip, quarry, ridge, farm and collider overlay. Map health is covered by
`src/core/world/world.test.ts` (audit, surface queries, reachability, recovery poses)
and `src/core/openWorld.test.ts` (deterministic stepping, bounds, collision, distance).

Latest sandbox measurements (SwiftShader CPU rasterisation, so absolute frame times
are only comparable between runs on the same machine):

| World          | Viewport  | Avg frame  | Draw calls | Triangles |
| -------------- | --------- | ---------- | ---------- | --------- |
| Club Circuit   | 1280x720  | 1581.75 ms | 115        | 77,480    |
| Club Circuit   | 1920x1080 | 2890.03 ms | -          | -         |
| Kestrel Valley | 1280x720  | 1287.07 ms | 69         | 267,464   |
| Kestrel Valley | 1920x1080 | 2506.72 ms | 69         | 267,464   |

## Known limits / next steps

- Terrain is flat; the valley reads through roads, planting, buildings and the mountain
  backdrop rather than elevation.
- Recovery points are authored, audited and reachable from automation
  (`__racer.roamRecovery(id)`); there is no in-game recovery-point menu yet. Reset
  always returns to the safe spawn pose.
- Static shadows are rendered every frame because the sun is fixed; a later pass could
  cache the static shadow map and only redraw the car.
- The sky, fog and mountain palette share the circuit's lighting rig. Adding weather or
  time of day would be a separate system, not a free-roam special case.
