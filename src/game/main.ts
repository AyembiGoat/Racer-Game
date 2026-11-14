import { createBot } from '../core/bot';
import { NO_INPUT } from '../core/car';
import { createFixedLoop, SIM_STEP_SECONDS } from '../core/fixedLoop';
import type { GameEvent, GameInput, GameState } from '../core/game';
import { createGame, stepGame } from '../core/game';
import { testCircuit } from '../core/tracks/testCircuit';
import { createHud } from './hud';
import { createHumanInput } from './input';
import { createView } from './view';

/**
 * Three ways to run:
 *   (default)  a person drives with the keyboard.
 *   ?bot       the bot drives in real time, to watch.
 *   ?auto      nothing moves until a script calls window.__racer. Used by
 *              `npm run playtest` so an agent can drive the game and take screenshots.
 */
const query = new URLSearchParams(window.location.search);
const mode = query.has('auto') ? 'auto' : query.has('bot') ? 'bot' : 'play';

const track = testCircuit;
const view = createView(track);
const hud = createHud(track.name);
const bot = createBot(track);

let previous = createGame(track);
let state = previous;
let lastInput: GameInput = NO_INPUT;

function resetToGrid() {
  previous = createGame(track);
  state = previous;
  lastInput = NO_INPUT;
  view.resetCamera(track.spawn.heading);
  hud.update(state);
}

function step(input: GameInput): GameEvent[] {
  previous = state;
  lastInput = input;
  const result = stepGame(state, input, SIM_STEP_SECONDS, track);
  state = result.state;
  hud.update(state);
  return result.events;
}

const overlay = document.getElementById('overlay');
hud.update(state);

if (mode === 'auto') {
  if (overlay) overlay.hidden = true;

  const run = (steps: number, chooseInput: (current: GameState) => GameInput) => {
    const events: GameEvent[] = [];
    for (let i = 0; i < steps; i++) {
      const input = chooseInput(state);
      events.push(...step(input));
      view.frame(previous, state, 1, SIM_STEP_SECONDS, input.brake > 0, i === steps - 1);
    }
    return events;
  };

  window.__racer = {
    state: () => state,
    step: (input = {}, steps = 1) => run(steps, () => ({ ...NO_INPUT, ...input })),
    bot: (steps = 1) => run(steps, bot),
    camera: () => view.camera(),
    setCamera: (cameraMode) => {
      view.setCamera(cameraMode);
      view.frame(previous, state, 1, 0, lastInput.brake > 0);
    },
    reset: () => {
      resetToGrid();
      view.frame(previous, state, 1, 0, false);
    },
  };

  view.frame(previous, state, 1, 0, false);
} else {
  const human = createHumanInput();
  const loop = createFixedLoop();
  let paused = mode === 'play';
  let lastTime = performance.now();

  const setPaused = (nextPaused: boolean) => {
    paused = nextPaused;
    if (overlay) overlay.hidden = !paused;
    human.clear();
  };

  if (mode === 'bot') {
    setPaused(false);
  } else {
    overlay?.addEventListener('click', () => {
      setPaused(false);
    });
    window.addEventListener('keydown', (event) => {
      if (paused && (event.code === 'Enter' || event.code === 'Space')) {
        event.preventDefault();
        setPaused(false);
      }
    });
  }

  const frame = (now: number) => {
    const elapsed = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;

    const actions = human.consumeActions();
    if (actions.cycleCamera) view.cycleCamera();
    if (mode === 'play' && !paused) {
      if (actions.reset) resetToGrid();
      if (actions.pause) setPaused(true);
    }

    const alpha = !paused
      ? loop.advance(elapsed, () => step(mode === 'bot' ? bot(state) : human.sample()))
      : 1;
    view.frame(previous, state, alpha, paused ? 0 : elapsed, lastInput.brake > 0);
    requestAnimationFrame(frame);
  };

  view.frame(previous, state, 1, 0, false);
  requestAnimationFrame(frame);
}
