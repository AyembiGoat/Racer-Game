# Handling model

Background: tyre lateral force rises with slip angle to a peak, then falls
(http://www-cdr.stanford.edu/dynamic/bywire/tires.pdf); a small game model needs that
shape more than it needs a full Pacejka fit
(https://wassimulator.com/blog/programming/programming_vehicles_in_games.html).

## Baseline, measured on the old single-car model (fixed 60 Hz)

| Measure                                         | 10 m/s | 25 m/s | 40 m/s |
| ----------------------------------------------- | ------ | ------ | ------ |
| Full-lock steady lateral acceleration           | 1.61 g | 2.21 g | 2.54 g |
| Time to 90 % yaw rate from a full steering step | 267 ms | 183 ms | 300 ms |
| Time for yaw rate to fall to 10 % after release | 300 ms | 367 ms | 400 ms |
| Of which no response at all (above 95 %)        | 33 ms  | 100 ms | 133 ms |
| Full lock one way to zero yaw on reversal       | 117 ms | 100 ms | 100 ms |

Other baseline numbers: 0-100 km/h 2.18 s; top speed 48 m/s; 40 m/s to rest 1.48 s and
29.4 m; coasting from 30 m/s for 2 s leaves 16.5 m/s on tarmac and 9.4 m/s on grass; bot
standing lap 25.143 s, flying lap 23.351 s, no barrier contact, 2 shifts per flying lap.

Defects confirmed by measurement:

1. **Dead steering travel.** At speed the steering lock was several times the angle the
   tyres could use, so after releasing the key the wheel had to unwind 100-133 ms of
   lock before the car responded at all.
2. **Reverse while sliding.** Holding brake in a spin engaged reverse with the car still
   travelling at 13.5 m/s, because the rule looked only at speed along the nose.
3. **Reverse hold skipped.** Braking to rest could land between 0 and 0.08 m/s, which
   skipped the 0.24 s standstill hold and engaged reverse on the next step.
4. **Flat grip limit.** Lateral grip was a constant, so there was no build-up before the
   limit and no loss beyond it.

## Changes

- **Per-car tuning** is passed into `createCar`, `stepCar`, `createGame`, `stepGame`
  and `createBot`. There is no global car.
- **Steering lock follows grip.** Full lock asks for 1.6 x the steer angle that reaches
  the grip limit at the current speed, capped by the real mechanical lock. Removes the
  dead travel at every speed. Rates: 14 /s turning in, 18 /s centring, 22 /s reversing,
  scaled by `steerQuickness`.
- **Tyre curve.** Lateral force is grip x f(slip angle / peak slip): a sine rise to 1 at
  the peak, then a smooth fall to 0.86. Both pieces meet with zero slope, so there is no
  step.
- **Self-aligning.** Past the peak, a yaw term turns the nose toward the direction of
  travel in proportion to the excess slip, capped at 0.9 rad/s.
- **Power and brake balance.** When the driven axle is asked for more than its traction,
  cornering grip drops by up to 20 % and rotation rises by up to 12 %. Braking adds the
  car's `trailRotation` and costs up to 6 % cornering grip.
- **Reverse.** Braking while the car is moving in any direction refreshes a 0.24 s hold.
  Reverse engages only when total speed is under 0.5 m/s and the hold has run out.
  Throttle in reverse brakes to rest, then drives forward.
- **Gearbox.** Real ratios. Upshift 200 rpm under the redline with throttle above 20 %.
  Downshift when the lower gear would sit under 78 % of the upshift speed, which is
  always below where an upshift lands, so the two cannot alternate. 0.25 s lockout after
  an upshift (70 ms without drive), 0.14 s after a downshift.
- **Surfaces.** Grip changes are eased over about 70 ms instead of switching on the
  step the surface changes. Kerb 0.96, grass 0.70. Grass drag rises from nothing at
  3 m/s to full at 28 m/s.

Not modelled: separate front and rear slip, suspension, tyre temperature, differential.
The car is one body with one slip angle; front-engine and mid-engine balance are
expressed through traction, rotation and alignment values.

## Targets and results

| Measure (M3)                                | Baseline       | Target               | Result                                           |
| ------------------------------------------- | -------------- | -------------------- | ------------------------------------------------ |
| No-response time after release, 25 / 40 m/s | 100 / 133 ms   | 50 ms or less        | 33 / 33 ms                                       |
| Time to 90 % yaw from a full step, 25 m/s   | 183 ms         | 250 ms or less       | 233 ms (slower than baseline, inside the target) |
| Reverse engaged above 0.5 m/s total speed   | yes (13.5 m/s) | never                | never (unit test)                                |
| Shifts in a bot flying lap                  | 2              | no hunting: under 14 | 8                                                |
| Bot standing lap, barrier contacts          | 25.14 s, 0     | every car, 0         | 26.98 s, 0                                       |

Measured by stepping the simulation at 60 Hz: full throttle to the test speed, a full
steering step held 1.5 s, then release.

| Car              | 90 % yaw at 25 / 40 m/s | No-response after release, 25 / 40 m/s | Bot laps, standing / flying | Contacts | Flying-lap shifts |
| ---------------- | ----------------------- | -------------------------------------- | --------------------------- | -------- | ----------------- |
| BMW M3           | 233 / 283 ms            | 33 / 33 ms                             | 26.98 / 24.83 s             | 0        | 8                 |
| Mazda MX-5       | 217 / 267 ms            | 33 / 33 ms                             | 28.52 / 26.23 s             | 0        | 8                 |
| Ford Mustang GT  | 217 / 267 ms            | 50 / 50 ms                             | 24.97 / 22.92 s             | 0        | 8                 |
| Porsche Cayman S | 167 / 200 ms            | 33 / 33 ms                             | 24.87 / 22.97 s             | 0        | 10                |

The M3 is about 1.8 s a lap slower than the old single car because it now has its own
mass, power and tyre figures rather than tuned-by-feel values.

Acceleration is not to scale. In-game 0 to 100 km/h is 2.1 to 3.4 s against 4.8 to 8.8 s
for the real cars; the order between the cars is kept, the absolute times are not. The
garage labels these figures "In this game" and lists manufacturer data separately.

No person has driven this build. Every figure above comes from the simulation and the
bot; how it feels on a keyboard is untested.
