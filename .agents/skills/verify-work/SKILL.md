---
name: verify-work
description: How to check a change before calling it done. Use at the end of every task, when a check fails, or when deciding what kind of test a change needs.
---

# Verify work

## Baseline

```
npm run check
```

All five steps must pass. While iterating, run the single relevant step:
`npm run typecheck`, `npm run lint`, `npm run test`, or
`npx vitest run src/core/car.test.ts` for one file.

## Match the check to the change

| Change                     | Minimum verification                                          |
| -------------------------- | ------------------------------------------------------------- |
| Logic in `src/core`        | New or updated unit test that fails without the change        |
| Tuning constant            | Tests still pass; note the before and after value             |
| Rendering, input, UI, feel | `npm run check`, then look at it running (see below)          |
| New asset                  | Loads in the dev server with no console errors; within budget |
| Dependency, config, CI     | Full `npm run check` from a clean `npm ci`                    |
| Docs only                  | `npm run format:check`                                        |

## Writing tests

- Tests sit beside the code: `src/core/thing.ts` and `src/core/thing.test.ts`.
- Test behaviour through the public function, over many simulated steps where that is
  what matters ("after holding full throttle for two seconds, the car is moving down
  -Z and below `CAR_TUNING.maxSpeed`").
- Assert against tuning constants, not copies of their values, so retuning does not
  break unrelated tests.
- Use `toBeCloseTo` for accumulated floating point; `toBe` for exact clamps.
- Fix a logic bug by first writing the test that reproduces it.
- Extend an existing test before adding a new one. Do not test what the types already
  guarantee.
- No sleeps, retries or timeouts. Core takes `dt`; step it as many times as needed.

## When a check fails

1. Read the whole error. Fix the cause in your change.
2. Format failures: run `npm run format`.
3. A boundary error in `src/core` (importing `three`, using `performance`,
   `Math.random`) means the code is in the wrong layer. Move it to `src/game` or pass
   the value in as an argument. Do not disable the rule.
4. Do not weaken or delete a test to make it pass unless the tested behaviour was
   intentionally changed. If so, say that explicitly.

## Looking at it

The checks prove the simulation is correct and the project builds. They do not prove
the game looks right. For that, drive it:

```
npm run playtest                  # accelerate, steer, brake, switch cameras, then the bot drives a lap
npm run playtest -- --keep before # also copy the screenshots to playtest/before/ to compare later
npm run playtest -- --quick       # one screenshot on the starting grid
```

This opens the game in a headless browser, drives it, and writes screenshots to
`playtest/` (not committed). It fails if the page logs an error, a control check fails,
or the bot cannot complete a lap. Then open the screenshots and look at them. A passing
run with a broken screenshot is a failed check.

How it works:

- `src/core/bot.ts` is a scripted driver. It reads the game state and returns the same
  inputs a person gives: throttle, brake, steer and handbrake. It follows the track's
  waypoints and brakes for corners. A unit test also runs it without a browser, so
  `npm run check` fails if a change makes a track impossible to lap.
- Opening the game with `?auto` stops the clock. Nothing moves until a script calls
  `window.__racer.step(input, steps)` or `window.__racer.bot(steps)`; `state()` returns
  the full game state. Opening it with `?bot` lets the bot drive in real time.
- `scripts/browser.mjs` exports `launchGame()`, which returns `step`, `bot`, `state`,
  `setCamera`, `camera` and `screenshot`. To check something specific, copy
  `scripts/playtest.mjs` and drive the car to the corner you need.

To inspect one spot: `step({ throttle: 1 }, 60)` drives for a second,
`step({ throttle: 0.5, steer: -0.6 }, 45)` turns left, then
`screenshot('playtest/name.png')`.

On Linux the browser comes from the `@sparticuz/chromium` package, so `npm install`
is all it needs. On macOS or Windows set `CHROME_PATH` to an installed Chrome.
Rendering is done in software, so a run takes under a minute.

What it cannot tell you: how sound comes across, and how the steering, braking and
weight transfer feel in the hand. Say so when your change touches either.
