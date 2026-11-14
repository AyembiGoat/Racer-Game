---
name: track-design
description: How to build and change tracks, including layout, road width, corner radii, barriers, checkpoints and starting grids. Use for any work on circuits or driving spaces.
---

# Track design

A track is one data file in `src/core/tracks/`, typed by `src/core/track.ts`: a closed
loop of centreline waypoints in driving order, signed curvature and kerb flags, road
and grass-verge widths, a starting grid pose and an ordered list of checkpoint gates
ending with the start/finish line. `clubCircuit.ts` is the example. Barrier collision,
surface detection, lap counting and the rendered road, kerbs and guardrails are all
built from that single description, so what the driver sees is what the car drives on.

## Rules

- Waypoints run in driving order and form a closed loop with smooth spacing around
  corners so neither barrier collision nor the rendered road develops sharp kinks.
- Checkpoints span the full width between barriers and sit at every major section of
  the loop. Cutting across an infield or reversing over the start/finish line must
  never count a lap.
- The final checkpoint in `checkpoints` is the start/finish line. The spawn sits just
  behind it facing along the opening straight, with `nextCheckpoint` starting at `0` so
  rolling across the start line at launch does not count a free lap.
- Never place two coplanar surfaces in the same plane where both are visible; offset
  markings (start line, kerbs) slightly above the road surface so they do not flicker.
- Add every new track to the bot lap test in `src/core/game.test.ts`. If the bot cannot
  complete a clean lap within a reasonable time, a corner or barrier is broken.

## Scale reference

One unit is one metre. Derive widths and radii from `CAR_TUNING` in `src/core/car.ts`
rather than guessing.

| Thing                  | Size                                           |
| ---------------------- | ---------------------------------------------- |
| Car width / length     | about 1.8 m wide, 4.2 m long                   |
| Narrow country / touge | 7 to 9 m wide (about 4 to 5 car widths)        |
| Standard race circuit  | 11 to 14 m wide (room to pass and take a line) |
| Hairpin inside radius  | 10 to 15 m                                     |
| Medium corner radius   | 25 to 45 m                                     |
| Fast sweeper radius    | 60 m or more                                   |
| Barrier height         | 0.9 to 1.1 m                                   |

## Layout principles

- Block out in untextured grey-box and lap it with the bot and by hand before adding
  any trackside art.
- Alternate fast straights with corners of varied radii so the driver has real braking
  zones, not one constant speed.
- Put a straight long enough to settle the car before the sharpest braking zone.
- Make corner direction obvious before turn-in: barriers, kerbs or landmarks should
  show where the road goes before the apex arrives.
- Avoid blind kinks right after crests or tight exits unless deliberate and telegraphed.

## Verification

Run `npm run check` (which laps the track with the bot in unit tests) and
`npm run playtest`, then inspect the screenshots from grid, mid-corner and finish line
to confirm the road, barriers and markings line up with no gaps or z-fighting.
