---
name: cars
description: How a car is split between handling specs in core and a 3D model with wheel, light and camera anchors in game. Use when adding or changing any car, wheel setup or car visual animation.
---

# Cars

A car is two things:

| Part  | Where             | What it holds                                                      |
| ----- | ----------------- | ------------------------------------------------------------------ |
| Rules | `src/core/car.ts` | Handling constants / `CarSpec`: dimensions, wheelbase, speed, grip |
| Model | `src/game/`       | The body mesh plus wheel, brake-light and camera anchors           |

Wheel rotation, front-wheel steering angle, brake-light illumination and camera
attachment are shared presentation logic driven from `CarState`. A new car supplies its
`CarSpec` and its model anchors; never write per-car wheel or camera code.

## Adding or updating a car

1. Get reference images first once past grey-box: side, front, rear and three-quarter
   views (`reference-images` skill).
2. Define the car's real name and real dimensions in `src/core/car.ts` (length, width,
   wheelbase, wheel radius, speed, acceleration, braking and grip).
3. Build or load the model in `src/game/` in metres, +X right, +Y up, nose along -Z,
   with `y = 0` on the ground plane midway between the axles.
4. Expose the standard anchors so the view updates them automatically:
   - Front wheels (`fl`, `fr`): nested in a steering pivot (`rotation.y = -steerAngle`)
     containing a spin mesh (`rotation.x = -wheelSpin`). Putting spin inside steer keeps
     the wheel rotating cleanly around its axle at full lock.
   - Rear wheels (`rl`, `rr`): spin around `X` (`rotation.x = -wheelSpin`).
   - Brake lights: brighten only while `brake > 0` (not as permanent neon glow).
   - Camera anchors: bonnet/hood and cockpit eye positions derived from the car's body
     dimensions (see `cameras`).
5. Confirm `src/core/bot.ts` can lap `Club Circuit` cleanly with the car's handling.

## Checking a car

First run `npm run playtest -- --car` (every car) or `npm run playtest -- --car <id>` and
open `playtest/car-<id>.png` to inspect the car from four angles. Ids are in
`src/core/cars.ts`. Facts and tuning for a car live in `src/core/cars.ts`, its body shape
in `src/game/cars/shapes.ts`, its engine voice in `src/game/audio/profiles.ts`, and its
par lap in `src/core/career.ts` (a test holds par to the bot's lap, so re-derive it after
any handling change). Then run `npm run playtest` and
inspect the gameplay screenshots in `playtest/`:

- Wheels touch the road surface (`y = 0`) without sinking through the asphalt or
  floating above it.
- Front wheels turn left when steering left and right when steering right, without
  clipping through the wheel arches.
- The car's collision width and length in `src/core` match its visible body so barriers
  stop the bodywork cleanly rather than stopping empty air or letting bumpers sink into
  walls.
