# Audio design

All sound is synthesised with Web Audio nodes (https://www.w3.org/TR/webaudio-1.1/:
OscillatorNode with PeriodicWave, BiquadFilterNode, WaveShaperNode,
DynamicsCompressorNode, AudioBufferSourceNode). No audio files, no library.

## Graph

```
sources -> bus gain (motor | tyres | impacts | ui | ambience) -> limiter -> master gain -> output
```

The limiter is a DynamicsCompressor (threshold -6 dB, ratio 12, 3 ms attack). Master
gain follows the volume setting. Bus levels live in one table in `engine.ts`.

## Engine

A four-stroke engine fires each cylinder once per two crank turns, so the engine cycle
is rpm / 120 Hz and the firing frequency is cylinders x rpm / 120. Each car has one
PeriodicWave whose partials are multiples of the cycle frequency, so the firing partial
and the orders around it move together with rpm:

| Car                        | Firing partial | Character partials                                          |
| -------------------------- | -------------- | ----------------------------------------------------------- |
| M3, inline four            | 4              | 2, 8, 12 (hard second-order four-cylinder rasp)             |
| MX-5, inline four          | 4              | 2, 8 (lighter, less upper content)                          |
| Cayman S, flat six         | 6              | 3, 9, 12 (smooth, with the 1.5-order howl)                  |
| Mustang GT, cross-plane V8 | 8              | 4, 2, 3, 5, 12 (uneven per-bank pulses give the low burble) |

Two oscillators share that wave: exhaust (through an asymmetric soft-clip shaper, then
two resonant bands and a low-pass that opens with load) and intake (band-pass that
rises with rpm, level follows throttle). A sine one octave below firing adds body.
Load changes level and brightness, not pitch. Lifting off closes the low-pass, drops the
intake and leaves a hollow exhaust band; above 60 % rpm a lift schedules up to three
quiet filtered pops. A gear-shift event ducks the engine for 70 ms and plays a short
mechanical clack on the motor bus; a downshift event adds one 120 ms throttle blip. A
quiet gear whine follows road speed.

The simulation's rev limiter is only reached at true top speed in top gear, which Club
Circuit never allows, so no limiter sound is built.

## Tyres, surface, wind, impact

- Scrub: wide band-passed noise, level follows cornering load.
- Squeal: noise through two narrow bands (about 900 and 1500 Hz) whose pitch drifts with
  slip; fades in from 15 % slip.
- Kerb: low-passed noise plus a 60-80 Hz tone, amplitude-modulated at the rate the car
  crosses 1.2 m kerb blocks. Only on the kerb surface.
- Grass: soft low-passed noise with slow irregular swell. The circuit has no gravel.
- Wind: noise that rises with the square of speed.
- Barrier hit: 90 to 38 Hz sine thud, low-passed noise burst, scaled by impact speed.

## Interface

Focus, select, back, confirm, warning, personal best, checkpoint, lap, plus purchase
(three rising tones) and denied (two low tones, played when a purchase is refused for
lack of credits). All on the `ui` bus. No showroom ambience: a room tone under a silent
garage added nothing in testing by measurement and is one more loop to manage.

## Baseline (before this change), 0.45 s offline renders

| Case                       | Peak                  | RMS dBFS              |
| -------------------------- | --------------------- | --------------------- |
| Barrier hit, 16 m/s        | 0.219                 | -33.5                 |
| Engine full load, 6200 rpm | 0.266                 | -21.2                 |
| Engine idle                | 0.061                 | -33.1                 |
| Engine lift-off, 6200 rpm  | 0.135                 | -26.5                 |
| Kerb                       | 0.157                 | -23.9                 |
| Tyre slip 0.9              | 0.079                 | -32.8                 |
| Grass                      | 0.083                 | -32.5                 |
| Gear shift                 | 0.011                 | -63.3                 |
| Checkpoint                 | 0.014                 | -58.6                 |
| Lap                        | 0.048                 | -45.2                 |
| Select / confirm / warning | 0.010 / 0.025 / 0.012 | -63.8 / -52.3 / -60.4 |

## Acceptance ranges (asserted in `scripts/playtest.mjs`)

Peak below 0.9 for every case (no clipping) and above 0.002 (not silent). RMS:

| Case                                                  | Range (dBFS)                            |
| ----------------------------------------------------- | --------------------------------------- |
| Engine full load, each car                            | -26 to -14                              |
| Engine idle, each car                                 | -42 to -27                              |
| Lift-off is quieter than full load at the same rpm by | at least 4 dB                           |
| Part throttle sits between lift-off and full load     | yes                                     |
| Kerb                                                  | -34 to -22                              |
| Squeal at slip 0.9                                    | -38 to -24                              |
| Grass                                                 | -40 to -27                              |
| Wind at 55 m/s                                        | -40 to -26                              |
| Interface cues                                        | peak below 35 % of the barrier-hit peak |
| Barrier hit                                           | peak 0.15 to 0.6                        |

The kerb ceiling is deliberately lower than the baseline, which was the loudest thing
after the engine.

## Listening

Nobody has listened to this build. The levels above are measured; whether the engine
notes are pleasant, distinct and comfortable over a session needs a person with
speakers or headphones.
