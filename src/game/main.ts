import { createBot } from '../core/bot';
import { NO_INPUT } from '../core/car';
import { createFixedLoop, SIM_STEP_SECONDS } from '../core/fixedLoop';
import type { GameEvent, GameInput, GameState } from '../core/game';
import { createGame, stepGame } from '../core/game';
import { clubCircuit } from '../core/tracks/clubCircuit';
import { createAudio, measureSounds } from './audio';
import { createRoamMode } from './roam';
import { showCar } from './carModel';
import { createHumanInput } from './input';
import { showMaterials } from './materials/preview';
import { createUi, isReducedMotionActive, type ScreenName, type UiSoundKind } from './ui';
import { createView, createViewRenderer } from './view';

/**
 * Ways to run:
 *   (default)   title screen, settings, controls, HUD, and keyboard driving.
 *   ?bot        the bot drives laps in real time, to watch.
 *   ?materials  every surface side by side, to check textures.
 *   ?car        the BMW M3 from four angles, to check proportions and wheel clearance.
 *   ?auto       nothing moves until a script calls window.__racer. Used by
 *               `npm run playtest` so an agent can drive the game and take screenshots.
 */
const query = new URLSearchParams(window.location.search);
const startInRoam = query.has('roam');
const startWithColliders = query.has('debug');
const mode = query.has('materials')
  ? 'materials'
  : query.has('car')
    ? 'car'
    : query.has('auto')
      ? 'auto'
      : query.has('bot')
        ? 'bot'
        : 'play';

function runGame(gameMode: 'auto' | 'bot' | 'play') {
  const track = clubCircuit;
  const audio = createAudio();
  const renderer = createViewRenderer();
  const view = createView(track, renderer);
  const roam = createRoamMode(renderer, audio);
  const bot = createBot(track);

  let previous = createGame(track);
  let state = previous;
  let lastInput: GameInput = NO_INPUT;
  let audioUnlocked = false;
  let finishLoadingEarly: (() => void) | null = null;
  let human: ReturnType<typeof createHumanInput> | null = null;

  function unlockAudioFromGesture() {
    if (!audioUnlocked) {
      audioUnlocked = true;
    }
    audio.start();
    audio.setMasterVolume(ui.store.getSettings().masterVolume / 100);
  }

  function playUiSound(kind: UiSoundKind) {
    if (!audioUnlocked) return;
    audio.playUi(kind);
  }

  function syncSettingsToViewAndAudio() {
    const s = ui.store.getSettings();
    view.setFov(s.fov);
    view.setReducedMotion(isReducedMotionActive(s));
    audio.setMasterVolume(s.masterVolume / 100);
    roam.applySettings(s);
    if (ui.screen() === 'title') {
      view.setCamera(s.defaultCamera);
    }
  }

  function resetToGrid(withVeil = false) {
    previous = createGame(track);
    state = previous;
    lastInput = NO_INPUT;
    view.resetCamera(track.spawn.heading);
    ui.hud.resetTransientState();
    if (withVeil) ui.hud.triggerResetVeil();
    ui.hud.update(state, NO_INPUT, [], 0);
  }

  function enterScreen(next: ScreenName) {
    ui.setScreen(next);
    const isTitle = next === 'title' || next === 'loading';
    view.setTitleShowcase(isTitle);
    human?.setCaptureEnabled(next === 'race' || next === 'roam');
    if (next !== 'race' && next !== 'roam') {
      human?.clear();
      audio.update(state, 0, false);
    }
    if (next === 'pause') {
      ui.screens.refreshPauseSummary(state);
    }
  }

  let prevDefaultCamera: 'chase' | 'bonnet' | null = null;

  const ui = createUi(track, {
    onStartRace() {
      unlockAudioFromGesture();
      resetToGrid(false);
      view.setCamera(ui.store.getSettings().defaultCamera);
      enterScreen('race');
    },
    onStartFreeRoam() {
      unlockAudioFromGesture();
      openFreeRoam();
      playUiSound('select');
    },
    onResumeRace() {
      unlockAudioFromGesture();
      enterScreen('race');
    },
    onRestartRun() {
      unlockAudioFromGesture();
      resetToGrid(true);
      view.setCamera(ui.store.getSettings().defaultCamera);
      enterScreen('race');
    },
    onQuitToTitle() {
      resetToGrid(false);
      view.setCamera(ui.store.getSettings().defaultCamera);
      enterScreen('title');
    },
    onPlaySound(kind) {
      playUiSound(kind);
    },
    onSkipLoading() {
      unlockAudioFromGesture();
      finishLoadingEarly?.();
    },
    getGameState: () => state,
    getCurrentCamera: () => view.camera(),
  });

  function openFreeRoam() {
    roam.build();
    roam.applySettings(ui.store.getSettings());
    roam.enter();
    enterScreen('roam');
    if (startWithColliders) roam.setDebug(true);
  }

  function closeFreeRoam() {
    roam.exit();
    enterScreen('title');
  }

  prevDefaultCamera = ui.store.getSettings().defaultCamera;
  view.setCamera(prevDefaultCamera);
  syncSettingsToViewAndAudio();

  ui.store.subscribe(() => {
    const s = ui.store.getSettings();
    if (s.defaultCamera !== prevDefaultCamera) {
      prevDefaultCamera = s.defaultCamera;
      view.setCamera(s.defaultCamera);
    }
    syncSettingsToViewAndAudio();
    if (ui.screen() === 'pause') {
      ui.screens.refreshPauseSummary(state);
    }
    if (gameMode === 'auto') {
      ui.hud.update(state, lastInput, [], 0);
      view.frame(previous, state, 1, 0, lastInput.brake > 0);
    }
  });

  function step(input: GameInput): GameEvent[] {
    previous = state;
    lastInput = input;
    const result = stepGame(state, input, SIM_STEP_SECONDS, track);
    state = result.state;
    audio.handle(result.events);
    ui.hud.update(state, input, result.events, SIM_STEP_SECONDS);
    return result.events;
  }

  if (gameMode === 'auto') {
    if (startInRoam) {
      roam.build();
      roam.applySettings(ui.store.getSettings());
      roam.enter();
      if (startWithColliders) roam.setDebug(true);
      enterScreen('roam');
      roam.advance(0, NO_INPUT);
      window.__racer = {
        state: () => state,
        step: () => [],
        bot: () => [],
        camera: () => roam.camera(),
        setCamera: (cameraMode) => {
          roam.setCamera(cameraMode);
          roam.step(NO_INPUT, 0);
        },
        fov: () => view.fov(),
        reset: () => {
          roam.reset();
          roam.step(NO_INPUT, 0);
        },
        screen: () => ui.screen(),
        setScreen: (screen) => {
          if (screen === 'roam') {
            openFreeRoam();
          } else {
            if (roam.active()) closeFreeRoam();
            enterScreen(screen);
          }
          roam.step(NO_INPUT, 0);
        },
        settings: () => ui.store.getSettings(),
        setSettings: (patch) => ui.store.setSettings(patch),
        bindings: () => ui.store.getBindings(),
        loudness: measureSounds,
        renderInfo: () => roam.renderInfo() ?? view.renderInfo(),
        roam: true,
        roamState: () => roam.state(),
        stepRoam: (input = {}, steps = 1) => {
          roam.step({ ...NO_INPUT, ...input }, steps);
        },
        roamReset: () => {
          roam.reset();
          roam.step(NO_INPUT, 0);
        },
        roamRecovery: (id) => {
          roam.teleportToRecovery(id);
          roam.step(NO_INPUT, 0);
        },
        roamAudit: () => roam.audit(),
        setDebug: (visible) => roam.setDebug(visible),
        debugVisible: () => roam.debugVisible(),
      };
      // Keep rendering on demand-driven frames so screenshots and the
      // performance sampler see real renderer work without advancing physics.
      const renderRoam = () => {
        roam.advance(0, NO_INPUT);
        requestAnimationFrame(renderRoam);
      };
      requestAnimationFrame(renderRoam);
      return;
    }
    enterScreen('race');
    view.compileShaders();
    ui.hud.update(state, NO_INPUT, [], 0);

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
        ui.hud.notifyCamera(cameraMode);
        view.frame(previous, state, 1, 0, lastInput.brake > 0);
      },
      fov: () => view.fov(),
      reset: () => {
        resetToGrid(false);
        view.frame(previous, state, 1, 0, false);
      },
      screen: () => ui.screen(),
      setScreen: (screen) => {
        if (screen === 'settings' || screen === 'controls') {
          ui.openSubscreen(screen);
        } else {
          enterScreen(screen);
        }
        view.frame(previous, state, 1, 0, lastInput.brake > 0);
      },
      settings: () => ui.store.getSettings(),
      setSettings: (patch) => ui.store.setSettings(patch),
      bindings: () => ui.store.getBindings(),
      loudness: measureSounds,
      renderInfo: () => view.renderInfo(),
    };

    view.frame(previous, state, 1, 0, false);
    return;
  }

  // Interactive modes: 'play' or 'bot'
  const humanInput = createHumanInput(() => ui.store.getBindings());
  human = humanInput;
  const loop = createFixedLoop();
  let lastTime = performance.now();

  window.addEventListener('keydown', (event) => {
    if (event.code === 'F3' && roam.active()) {
      event.preventDefault();
      roam.setDebug(!roam.debugVisible());
      playUiSound('select');
    }
  });

  if (startInRoam) {
    openFreeRoam();
  } else if (gameMode === 'bot') {
    enterScreen('race');
    view.compileShaders();
    // Read-only measurement hook for scripts/perf.mjs. Nothing can be driven from here.
    window.__racer = {
      state: () => state,
      renderInfo: () => view.renderInfo(),
    } as unknown as NonNullable<typeof window.__racer>;
    window.addEventListener(
      'pointerdown',
      () => {
        unlockAudioFromGesture();
      },
      { once: true },
    );
  } else {
    // 'play' mode starts on loading screen -> real build phases -> title showcase
    enterScreen('loading');
    ui.screens.setLoadingState('Building circuit', 0.25, false);

    let loadingDone = false;
    const completeLoading = () => {
      if (loadingDone) return;
      loadingDone = true;
      finishLoadingEarly = null;
      enterScreen('title');
    };
    finishLoadingEarly = completeLoading;

    requestAnimationFrame(() => {
      ui.screens.setLoadingState('Compiling shaders', 0.65, true);
      view.compileShaders();
      view.frame(previous, state, 1, 0, false);

      requestAnimationFrame(() => {
        ui.screens.setLoadingState('Ready', 1, true);
        const delayMs = isReducedMotionActive(ui.store.getSettings()) ? 40 : 280;
        window.setTimeout(completeLoading, delayMs);
      });
    });

    window.addEventListener(
      'pointerdown',
      () => {
        unlockAudioFromGesture();
      },
      { once: true },
    );
    window.addEventListener(
      'keydown',
      () => {
        unlockAudioFromGesture();
      },
      { once: true },
    );
  }

  const frame = (now: number) => {
    const elapsed = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;

    const currentScreen = ui.screen();
    if (currentScreen === 'roam') {
      const actions = humanInput.consumeActions();
      if (actions.cycleCamera) {
        roam.cycleCamera();
        playUiSound('select');
      }
      if (gameMode === 'play') {
        if (actions.reset) {
          roam.reset();
          playUiSound('confirm');
        }
        if (actions.pause) {
          playUiSound('back');
          closeFreeRoam();
        }
      }
      roam.adapt(elapsed);
      roam.advance(elapsed, humanInput.sample(elapsed));
      requestAnimationFrame(frame);
      return;
    }
    if (currentScreen === 'race') {
      const actions = humanInput.consumeActions();
      if (actions.cycleCamera) {
        view.cycleCamera();
        ui.hud.notifyCamera(view.camera());
        playUiSound('select');
      }
      if (gameMode === 'play') {
        if (actions.reset) {
          resetToGrid(true);
          playUiSound('confirm');
        }
        if (actions.pause) {
          playUiSound('back');
          enterScreen('pause');
        }
      }
    }

    const activeRace = ui.screen() === 'race';
    if (activeRace) {
      view.adapt(elapsed);
      const alpha = loop.advance(elapsed, (dt) =>
        step(gameMode === 'bot' ? bot(state) : humanInput.sample(dt)),
      );
      audio.update(state, lastInput.throttle, true);
      view.frame(previous, state, alpha, elapsed, lastInput.brake > 0);
    } else {
      audio.update(state, 0, false);
      view.frame(previous, state, 1, elapsed, false);
    }

    requestAnimationFrame(frame);
  };

  view.frame(previous, state, 1, 0, false);
  requestAnimationFrame(frame);
}

if (mode === 'materials') {
  showMaterials();
} else if (mode === 'car') {
  showCar();
} else {
  runGame(mode);
}
