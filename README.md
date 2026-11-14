# Racer Game

A racing and driving game that runs in the browser, built with TypeScript and Three.js.

**Status: two playable worlds.** One car (the 1989 BMW M3) with automatic 5-speed
gearing and weight transfer, synthesised engine/tyre/kerb/impact sound, chase and
bonnet cameras, persisted settings and rebindable controls, and a bot that laps using
player inputs.

- **Club Circuit** is a sunlit time-trial track with left-and-right S-bends,
  red-and-white kerbs, grass run-off, braking boards, steel guardrails, a works
  pit-wall timing HUD (sector splits, minimap, pause summary) and a live title
  showcase.
- **Kestrel Valley** is a 2.4 x 1.8 km free-roam map with a ring road, farm, village,
  quarry, ridge road and airstrip. It keeps the car and audio but replaces the timing
  HUD with place, distance, surface and gear readouts. See
  [`docs/free-roam.md`](docs/free-roam.md).

## Quick start

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the printed URL and click (or press Enter) to drive.

| Input             | Action                   |
| ----------------- | ------------------------ |
| W or Up           | Accelerate               |
| S or Down         | Brake / reverse          |
| A D or Left Right | Steer                    |
| Space             | Handbrake                |
| C                 | Switch camera            |
| R                 | Reset to spawn / grid    |
| Esc               | Pause / title            |
| F3                | Collider overlay (debug) |

Add `?bot` to the URL to watch the bot drive laps. Add `?roam` to boot straight into
Kestrel Valley, or `?debug` to start with collider outlines.

## Commands

| Command                 | What it does                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| `npm run dev`           | Start the dev server with hot reload                              |
| `npm run check`         | Typecheck, lint, format check, test and build                     |
| `npm run typecheck`     | TypeScript in strict mode                                         |
| `npm run lint`          | ESLint with type-aware rules and architecture checks              |
| `npm run format`        | Format everything with Prettier                                   |
| `npm run test`          | Run unit tests once (`test:watch` to keep running)                |
| `npm run build`         | Production build into `dist/`                                     |
| `npm run playtest`      | Drive Club Circuit headlessly and save screenshots to `playtest/` |
| `npm run playtest:roam` | Drive Kestrel Valley headlessly (19 checks) to `playtest/roam/`   |
| `npm run perf`          | Measure circuit frame pacing; add `-- --roam` for the valley      |

`npm run check` is the gate.

## Stack

| Purpose       | Library                           |
| ------------- | --------------------------------- |
| Language      | TypeScript (strict)               |
| Rendering     | Three.js                          |
| Dev and build | Vite                              |
| Tests         | Vitest                            |
| Lint          | ESLint with typescript-eslint     |
| Format        | Prettier                          |
| Playtest      | Puppeteer with a bundled Chromium |

## Structure

```
src/
  core/            Driving and race rules: car handling, gears, surfaces, checkpoints, bot
  core/tracks/     Circuits as plain data
  core/world/      Open-world spec, sampling, collision index and audits
  core/worlds/     Open-world maps as plain data (Kestrel Valley)
  game/            Browser shell: Three.js worlds, BMW M3 model, cameras, input
  game/ui/         Timing HUD, free-roam HUD, menus, settings and fonts
  game/materials/  Shared procedural PBR surface library
  game/audio/      Synthesised engine, tyre, kerb, wind, UI and impact audio
scripts/           Headless-browser playtest
docs/              Feature specs and architecture notes (see `free-roam.md`)
reference/         Reference images and UI design notes (`ui-notes.md`)
.agents/           Playbooks (skills) for AI agents, indexed in skills.md
AGENTS.md          Rules and architecture for anyone changing the code
```

The rules in `src/core` know nothing about rendering or the browser. They advance at a
fixed 60 Hz and the renderer interpolates between steps, so handling and lap times stay
the same at any display refresh rate and can be tested without a screen. Lint rules
enforce the boundary.

## Working with AI agents

[`AGENTS.md`](AGENTS.md) holds the rules every agent follows: keep systems simple, no
AI slop, work from reference images, verify before committing, and explain results to
the owner in plain language. `CLAUDE.md` points to it.

[`skills.md`](skills.md) lists the playbooks in `.agents/skills/`. Eleven are written
for this racing game. Five are vendored: two from Anthropic's skills repository and
three from Theo Browne's tstack. `.claude/skills` is a symbolic link to that folder; on
Windows, enable symlinks in Git (`git config core.symlinks true`) before cloning.
