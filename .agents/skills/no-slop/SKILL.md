---
name: no-slop
description: The defaults AI models fall back on that make work look generated, and what to do instead. Use before finishing any change to UI, HUD, visual effects, game content, code or written text, and when reviewing someone else's change.
---

# No slop

Slop is what you get when nothing was decided and the most common answer was used.
None of the items below is forbidden for ever. Each is banned as a default. Use one only
when you can say what it does for the driver or the reader, and the owner's art
direction allows it.

## The test

For every element you added, answer: what does this tell the driver, or what breaks if
I remove it? If the honest answer is "it looks cooler" or "nothing", remove it.

## UI and HUD

| Default                                                                     | Instead                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Glow lines, neon borders, outer glow on speedometers and panels             | Flat shapes. Contrast from value and size                           |
| Purple-to-blue gradients, cyan and magenta accents on near-black            | The palette in the art direction. One accent, used rarely           |
| Gradient-filled text                                                        | Solid colour                                                        |
| Glass panels: blur, translucency, soft border                               | No panel, or an opaque one, if the text needs backing               |
| Corner brackets, scan lines, fake telemetry readouts, decorative dial ticks | Only marks that carry real state                                    |
| Emoji as icons                                                              | One drawn icon set, or text                                         |
| Pulsing, shimmering, breathing or floating loops                            | Motion only in response to an event (redline, lap delta, collision) |
| Fade-and-slide entrance on every element                                    | Appear. Animate only what explains a change                         |
| Everything in a rounded card with the same radius and soft shadow           | Group with space and alignment                                      |
| All-caps labels with wide letter spacing above every value                  | Label only what is ambiguous without one                            |
| A big number with a small label and an accent bar                           | Size by how often the driver needs it mid-corner                    |
| Middle dots between items, arrows after button text                         | Plain words                                                         |

A racing HUD is read in a peripheral glance while braking into a corner. Every element
competes with the apex and braking markers ahead. Fewer, flatter and smaller wins.

## Rendering and effects

- Bloom and emissive materials on everything. Headlights, brake lights and sunlit
  reflections may bloom if the art direction calls for it; body trim, barriers and UI
  may not.
- A post-processing stack added to fake speed: heavy radial blur, chromatic aberration,
  vignette, film grain, lens flare. Each one costs frame time and hides the apex.
- Constant camera shake or extreme field-of-view warping at speed. Keep the horizon and
  braking points readable; reserve sharp jolts for real impacts or kerbs.
- Particle spam. Tyre smoke or sparks should show real slip or contact, not trail the
  car at all times.
- Fog and darkness used to hide unfinished trackside geometry.
- Colour grading that makes the road edge, kerbs or barriers hard to read at speed.

## Game content

- Controls that do nothing: menu entries, tuning sliders, buttons or stats with no
  system behind them. If it is on screen, it works.
- Fake numbers: RPM bars, gear readouts, tyre temperatures or lap deltas not driven by
  real simulation state.
- Invented names: "Apex GT", "Nitro Viper X", "Turbo Velocity", "Neon Drift Circuit",
  "Sector 7". Use the name the thing normally has: Mazda MX-5, Porsche 911, Test
  Circuit, Silverstone, Hairpin. If there is no normal name, describe it plainly and
  ask the owner.
- Invented lore, fake sponsor slogans, loading tips and flavour text nobody asked for.
- Many shallow variants (ten cars that differ by one top-speed number) instead of one
  car whose weight, braking and grip feel right.
- Mixed art styles: assets pulled from different sources that do not share scale,
  texel density or material response.

## Code

- Comments that restate the code, or record what you changed (`// now uses the new
helper`). Comments explain a reason the code cannot show.
- An abstraction with one user. An option nobody sets. A parameter that is always the
  same value. A wrapper that only forwards.
- Handling for cases that cannot happen, and fallbacks that hide a real failure.
  `catch` blocks that swallow the error. Let it fail loudly.
- Compatibility shims for code that never shipped. Change the callers.
- A second helper that duplicates an existing one. Search first.
- Names with `new`, `v2`, `enhanced`, `improved`, `simple`, `utils`, `manager`,
  `helper`. Name the thing for what it is.
- Leftovers: `console.log`, commented-out code, unused exports, TODOs with no owner.
- Tests that assert the mock was called, or copy the implementation into the
  assertion.
- Files nobody asked for: summaries, changelogs, plan documents, extra READMEs.
- Reformatting or renaming code the task did not touch.

## Words

Applies to in-game text, PRs, comments, docs and messages to the owner.

- Hype and praise: "powerful", "seamless", "robust", "comprehensive", "blazing fast".
- Exclamation marks, emoji, greetings and sign-offs.
- Restating the request, announcing what you are about to do, summarising what you
  just said.
- Hedging every claim. State what you know; flag the specific thing you do not.
- Three-item lists and tidy closing lines written for rhythm rather than content.

## Before you finish

1. Reread the diff as someone looking for signs that nobody made a decision.
2. Apply the test above to every visual element and every new function, option and
   file.
3. Remove what fails. A smaller change that is all intentional beats a larger one.
