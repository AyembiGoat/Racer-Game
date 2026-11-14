---
name: gameplay-systems
description: How to add or change driving physics, handling, collision, checkpoints, lap timing, AI drivers and race rules. Use for any work that changes what happens in the simulation.
---

# Gameplay systems

## Where things go

Rules and state go in `src/core`. Presentation of those rules goes in `src/game`.
Ask: "would a headless server or replay verifier need this to decide positions and lap
times?" If yes, it is core.

| Core                                               | Game                                              |
| -------------------------------------------------- | ------------------------------------------------- |
| Speed, grip, steering, braking, gears, collision   | Tyre marks, smoke, sparks, brake lights, sound    |
| Checkpoints, lap times, off-track penalties, rules | Camera follow, wheel spin animation, HUD readouts |
| AI driver decisions (`bot.ts`)                     | Interpolation between 60 Hz steps                 |

## Shape of a system

Follow `src/core/car.ts`, and see `src/core/game.ts` for how systems are combined:

```ts
export function stepThing(
  state: ThingState,
  input: ThingInput,
  dt: number,
): { state: ThingState; events: ThingEvent[] };
```

- State and input are plain readonly data. Return new state; do not mutate.
- Time comes only from `dt`. Timers are numbers counted up or down in state.
- Randomness (surface variation, grid order) comes from a seeded RNG passed in.
- Tuning lives in one exported `as const` object per system (such as `CAR_TUNING`).
- The simulation runs at a fixed 60 Hz. Never assume a render frame equals a step.

## Events

When the shell needs to react to a moment (checkpoint crossed, lap finished, barrier
hit), return those events from the step function alongside the new state. The shell
plays sound and effects from them. Core never calls into rendering or audio.

## Driving feel

Good driving feel comes from predictable weight, progressive limits and zero hidden lag:

- Steering sensitivity scales smoothly with speed so the car can turn sharply at low
  speed without becoming twitchy on a fast straight.
- A stationary car turning its front wheels does not pivot on the spot; yaw rate comes
  from forward or reverse motion through the wheelbase.
- Braking is stronger than acceleration, so braking zones matter and mistakes can be
  recovered.
- Handling is identical at every display refresh rate because all physics run on the
  fixed 60 Hz step and rendering interpolates.
- Short taps (camera toggle, reset, gear shift) are latched in `src/game/input.ts` so a
  press shorter than one simulation step is never dropped.
- Change one tuning value at a time and record the old and new values.

## Checklist

1. Types and step function in `src/core`, with tests covering the normal case, the
   edges (standstill, top speed, reverse, clamps) and determinism.
2. Teach `src/core/bot.ts` to use the new mechanic if it affects driving.
3. Wiring in `src/game`.
4. `npm run check`, then `npm run playtest` and look at the screenshots.
