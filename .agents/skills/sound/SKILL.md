---
name: sound
description: How engine, tyre, kerb and impact audio should be synthesised or mixed, and how to check loudness without speakers. Use when adding or changing any sound.
---

# Sound

All sound is synthesised in `src/game/audio/`. There are no audio files. `src/core`
knows nothing about Web Audio: core emits car state (`rpm`, `speed`, `slip`, `surface`)
and discrete events (`gear-shift`, `wall-hit`, `checkpoint`, `lap`), and
`src/game/audio/` turns those into sound.

## Structure

| File        | Holds                                                           |
| ----------- | --------------------------------------------------------------- |
| `engine.ts` | Mixing buses, compressor/limiter, shared noise buffers          |
| `sounds.ts` | Continuous loops (engine, tyres, wind) and one-shots (impacts)  |
| `index.ts`  | Game-facing API (`start`, `update`, `handle`) + `measureSounds` |

## Bus balance

Route every sound through a named bus so mix balance lives in one table:

| Bus        | For                                                      |
| ---------- | -------------------------------------------------------- |
| `motor`    | Engine and exhaust note (primary continuous reference)   |
| `tyres`    | Scrub, squeal on slip, kerb rumble                       |
| `impacts`  | Barrier scrapes and hits                                 |
| `ui`       | Checkpoint and lap ticks (short, quiet, never startling) |
| `ambience` | Wind rush scaling with speed                             |

## Making driving sounds believable

- Browsers block audio until the first click or key press; start or resume the
  `AudioContext` from user interaction and keep `?auto` / `?bot` error-free before a
  click.
- Engine pitch and timbre must respond to both RPM/speed and throttle load (an engine
  coasting off-throttle at high RPM sounds hollower and quieter than under full load).
  A single raw sawtooth or sine wave sounds like a buzzer; layer harmonics and filtered
  intake/exhaust noise.
- Tyre scrub should fade in progressively near the grip limit so the driver hears slip
  building before the car lets go, rather than switching abruptly on and off.
- Scale barrier impact volume and low-end thump by `impactSpeed` from the `wall-hit`
  event so a light brush does not sound like a head-on crash.

## Checking without ears

Expose `measureSounds()` using `OfflineAudioContext` and check peak levels in
`scripts/playtest.mjs` so UI ticks stay quiet relative to full-load engine and impact
peaks, and every registered sound produces non-zero signal without clipping.

Loudness numbers only prove levels are sane. Whether an engine note is pleasant or
grating over ten laps requires human ears — always tell the owner to listen.
