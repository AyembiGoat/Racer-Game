# Racer Game

A racing and driving game that runs in the browser, built with TypeScript and Three.js.

**Status: baseline.** One untextured grey-box placeholder car, one closed circuit (Test
Circuit) with barriers and ordered checkpoints, lap timing, chase and bonnet cameras,
and a scripted bot that laps the circuit using player inputs. Art direction, car roster
and race modes have not been chosen yet.

## Quick start

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the printed URL and click (or press Enter) to drive.

| Input             | Action          |
| ----------------- | --------------- |
| W or Up           | Accelerate      |
| S or Down         | Brake / reverse |
| A D or Left Right | Steer           |
| Space             | Handbrake       |
| C                 | Switch camera   |
| R                 | Reset to grid   |
| Esc               | Pause           |

Add `?bot` to the URL to watch the bot drive laps.

## Commands

| Command             | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run dev`       | Start the dev server with hot reload                                     |
| `npm run check`     | Typecheck, lint, format check, test and build                            |
| `npm run typecheck` | TypeScript in strict mode                                                |
| `npm run lint`      | ESLint with type-aware rules and architecture checks                     |
| `npm run format`    | Format everything with Prettier                                          |
| `npm run test`      | Run unit tests once (`test:watch` to keep running)                       |
| `npm run build`     | Production build into `dist/`                                            |
| `npm run playtest`  | Drive the game in a headless browser and save screenshots to `playtest/` |

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
  core/          Driving and race rules: car physics, barriers, checkpoints, lap timer, bot
  core/tracks/   Tracks as plain data
  game/          Browser shell: Three.js view, cameras, keyboard input, HUD
scripts/         Headless-browser playtest
.agents/         Playbooks (skills) for AI agents, indexed in skills.md
AGENTS.md        Rules and architecture for anyone changing the code
```

The rules in `src/core` know nothing about rendering or the browser. They advance at a
fixed 60 Hz and the renderer interpolates between steps, so handling and lap times stay
the same at any display refresh rate and can be tested without a screen. Lint rules
enforce the boundary.

## Working with AI agents

[`AGENTS.md`](AGENTS.md) holds the rules every agent follows: keep systems simple, no
AI slop, ask before choosing art direction, work from reference images once building
visuals, verify before committing, and explain results to the owner in plain language.
`CLAUDE.md` points to it.

[`skills.md`](skills.md) lists the playbooks in `.agents/skills/`. Eleven are written
for this racing game. Five are vendored: two from Anthropic's skills repository and
three from Theo Browne's tstack. `.claude/skills` is a symbolic link to that folder; on
Windows, enable symlinks in Git (`git config core.symlinks true`) before cloning.
