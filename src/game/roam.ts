import type * as THREE from 'three';
import { createCar } from '../core/car';
import type { GameInput } from '../core/game';
import { SIM_STEP_SECONDS, createFixedLoop } from '../core/fixedLoop';
import {
  atRecoveryPoint,
  createOpenWorldState,
  resetOpenWorld,
  stepOpenWorld,
} from '../core/openWorld';
import type { OpenWorldState } from '../core/openWorld';
import { auditOpenWorld } from '../core/world/audit';
import type { OpenWorldAudit } from '../core/world/audit';
import { buildOpenWorld } from '../core/world/build';
import type { OpenWorldRuntime } from '../core/world/build';
import { nearestPaved } from '../core/world/query';
import { padHit } from '../core/world/roads';
import { kestrelValley } from '../core/worlds/kestrelValley';
import type { GameAudio } from './audio';
import { buildOpenWorldScene } from './openWorldScene';
import type { OpenWorldScene } from './openWorldScene';
import { createRoamHud } from './ui/roamHud';
import type { GameSettings } from './ui/settings';
import type { RoamHudController } from './ui/roamHud';
import { createDrivingView } from './view';
import type { CameraMode } from './view';

type ViewController = ReturnType<typeof createDrivingView>;
type RenderInfo = ReturnType<ViewController['renderInfo']>;

export interface RoamMode {
  build(): void;
  isBuilt(): boolean;
  enter(): void;
  exit(): void;
  active(): boolean;
  /** Advance simulation and draw one frame. */
  advance(elapsedSeconds: number, input: GameInput): void;
  /** Adaptive pixel-ratio feedback, shared with the circuit view. */
  adapt(frameSeconds: number): void;
  /** Deterministic simulation steps without relying on wall-clock time. */
  step(input: GameInput, steps: number): void;
  reset(): void;
  teleportToRecovery(recoveryId: string): void;
  camera(): CameraMode;
  setCamera(mode: CameraMode): void;
  cycleCamera(): void;
  state(): OpenWorldState;
  placeName(): string;
  setDebug(visible: boolean): boolean;
  debugVisible(): boolean;
  audit(): OpenWorldAudit;
  buildMilliseconds(): number;
  renderInfo(): RenderInfo | null;
  readonly hud: RoamHudController;
  applySettings(settings: GameSettings): void;
}

/**
 * Free-roam session built on demand from the same core simulation the tests
 * drive. The scene is not constructed until the player picks Free Roam.
 */
export function createRoamMode(renderer: THREE.WebGLRenderer, audio: GameAudio): RoamMode {
  const hud = createRoamHud();
  document.body.append(hud.element);

  let built = false;
  let runtime: OpenWorldRuntime | null = null;
  let scene: OpenWorldScene | null = null;
  let view: ViewController | null = null;
  let audit: OpenWorldAudit | null = null;
  let state: OpenWorldState = {
    car: createCar(kestrelValley.spawn),
    surface: 'tarmac',
    elapsedSeconds: 0,
    distanceMetres: 0,
  };
  let previous: OpenWorldState = state;
  let loop = createFixedLoop();
  let active = false;
  let buildMs = 0;
  let place = 'Valley Ring';

  function refreshPlaceName(): void {
    if (!runtime) return;
    const pad = padHit(runtime.junctions, state.car.position);
    const hit = nearestPaved(runtime, state.car.position, 70);
    if (pad?.pad && pad.pad.radius >= 18 && pad.gap < 2) {
      place = pad.pad.name;
    } else if (!hit) {
      place = 'Open Valley';
    } else if (hit.kind === 'pad' && hit.pad) {
      place = hit.pad.name;
    } else if (hit.gap < 12 && hit.road) {
      place = hit.road.spec.name;
    } else {
      place = 'Open Valley';
    }
  }

  function updateHud(): void {
    refreshPlaceName();
    hud.update(state, place, scene?.debugVisible() ?? false);
  }

  function stepOnce(input: GameInput, dt: number): void {
    if (!runtime) return;
    previous = state;
    const result = stepOpenWorld(state, input, dt, runtime);
    state = result.state;
    audio.handle(result.events);
    audio.update(state, input.throttle, true);
  }

  const mode: RoamMode = {
    hud,

    build() {
      if (built) return;
      const start = performance.now();
      runtime = buildOpenWorld(kestrelValley);
      scene = buildOpenWorldScene(runtime, renderer);
      view = createDrivingView(renderer, scene, runtime.spec.spawn.heading, 4400);
      audit = auditOpenWorld(runtime);
      buildMs = performance.now() - start;
      state = createOpenWorldState(runtime);
      previous = state;
      if (audit.ok) {
        console.info(
          `[roam] Kestrel Valley built in ${buildMs.toFixed(0)} ms · ` +
            `${audit.colliderCount} colliders · ${audit.gridCells} grid cells`,
        );
      } else {
        console.error('[roam] world audit failed', audit.errors);
      }
      built = true;
    },

    isBuilt() {
      return built;
    },

    enter() {
      if (!built) throw new Error('Call build() before enter()');
      active = true;
      loop = createFixedLoop();
      mode.reset();
      hud.setVisible(true);
      view?.setCamera('chase');
      updateHud();
    },

    exit() {
      active = false;
      hud.setVisible(false);
      audio.update(state, 0, false);
    },

    active() {
      return active;
    },

    adapt(frameSeconds) {
      view?.adapt(frameSeconds);
    },

    advance(elapsedSeconds, input) {
      if (!active || !view) return;
      const alpha = loop.advance(elapsedSeconds, (dt) => {
        stepOnce(input, dt);
      });
      view.frame(previous, state, alpha, elapsedSeconds, input.brake > 0);
      updateHud();
    },

    step(input, steps) {
      if (!built) return;
      for (let i = 0; i < steps; i++) stepOnce({ ...input }, SIM_STEP_SECONDS);
      if (view) view.frame(previous, state, 1, SIM_STEP_SECONDS, input.brake > 0);
      updateHud();
    },

    reset() {
      if (!runtime) return;
      state = resetOpenWorld(runtime);
      previous = state;
      if (view) view.resetCamera(runtime.spec.spawn.heading);
      updateHud();
    },

    teleportToRecovery(recoveryId) {
      if (!runtime) return;
      state = atRecoveryPoint(runtime, recoveryId);
      previous = state;
      if (view) view.resetCamera(state.car.heading);
      updateHud();
    },

    camera() {
      return view?.camera() ?? 'chase';
    },

    setCamera(next) {
      view?.setCamera(next);
    },

    cycleCamera() {
      view?.cycleCamera();
    },

    state() {
      return state;
    },

    placeName() {
      return place;
    },

    setDebug(visible) {
      if (!scene) return false;
      scene.setDebugVisible(visible);
      hud.setDebug(scene.colliderCount, visible);
      updateHud();
      return visible;
    },

    debugVisible() {
      return scene?.debugVisible() ?? false;
    },

    applySettings(settings) {
      hud.applySettings(settings);
    },

    audit() {
      if (!audit) throw new Error('Call build() before audit()');
      return audit;
    },

    buildMilliseconds() {
      return buildMs;
    },

    renderInfo() {
      return view?.renderInfo() ?? null;
    },
  };
  return mode;
}
