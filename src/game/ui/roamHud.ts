import { CAR_TUNING } from '../../core/car';
import type { OpenWorldState } from '../../core/openWorld';
import { clamp } from '../../core/vec';
import { convertSpeed, formatGear, formatSessionTime, speedUnitLabel } from './format';
import type { GameSettings } from './settings';

export interface RoamHudController {
  readonly element: HTMLElement;
  setVisible(visible: boolean): void;
  applySettings(settings: GameSettings): void;
  /** Show the collider overlay count and label. */
  setDebug(count: number, visible: boolean): void;
  update(state: OpenWorldState, placeName: string, debugVisible: boolean): void;
}

/** Free-roam instrumentation: no laps, sectors or fake objectives. */
export function createRoamHud(): RoamHudController {
  const root = document.createElement('div');
  root.className = 'roam-layer';
  root.hidden = true;
  root.innerHTML = `
    <div class="roam-header">
      <div class="roam-header-kicker">Kestrel Valley · Free Roam</div>
      <div class="roam-header-name" data-role="place">Valley Ring</div>
      <div class="roam-header-meta">
        <span class="tabular" data-role="clock">00:00</span>
        <span class="roam-dot"></span>
        <span class="tabular" data-role="distance">0.0 km</span>
      </div>
    </div>

    <div class="roam-surface" data-role="surface">Tarmac</div>

    <div class="roam-speed hud-card">
      <div class="roam-speed-main">
        <span class="hud-speed-value tabular" data-role="speed">0</span>
        <span class="hud-speed-unit" data-role="speed-unit">km/h</span>
      </div>
      <div class="roam-gear">
        <span class="roam-gear-label" data-role="gear-label">Gear</span>
        <span class="roam-gear-value tabular" data-role="gear">1</span>
      </div>
      <div class="roam-rpm"><div class="roam-rpm-fill" data-role="rpm"></div></div>
    </div>

    <div class="roam-hints">
      <span><kbd class="ui-keycap is-compact">Esc</kbd> Title</span>
      <span><kbd class="ui-keycap is-compact">R</kbd> Spawn</span>
      <span><kbd class="ui-keycap is-compact">C</kbd> Camera</span>
      <span><kbd class="ui-keycap is-compact">F3</kbd> Colliders</span>
    </div>

    <div class="roam-debug" data-role="debug" hidden>
      Collider overlay · <span data-role="debug-count">0</span> volumes
    </div>
  `;

  const query = (role: string): HTMLElement => {
    const element = root.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (!element) throw new Error(`Missing roam HUD role: ${role}`);
    return element;
  };

  const place = query('place');
  const clock = query('clock');
  const distance = query('distance');
  const surfaceLabel = query('surface');
  const speed = query('speed');
  const speedUnit = query('speed-unit');
  const gear = query('gear');
  const gearLabel = query('gear-label');
  const rpm = query('rpm');
  const debug = query('debug');
  const debugCount = query('debug-count');

  let unit: GameSettings['speedUnit'] = 'kmh';
  const last = {
    place: '',
    clock: '',
    distance: '',
    surface: '',
    speed: '',
    unit: '',
    gear: '',
    gearLabel: '',
    rpm: '',
  };
  let lastDebug = false;

  return {
    element: root,

    setVisible(visible: boolean) {
      root.hidden = !visible;
    },

    applySettings(settings: GameSettings) {
      unit = settings.speedUnit;
      speedUnit.textContent = speedUnitLabel(unit);
    },

    setDebug(count: number, visible: boolean) {
      debug.hidden = !visible;
      debugCount.textContent = String(count);
    },

    update(state: OpenWorldState, placeName: string, debugVisible: boolean) {
      const clockText = formatSessionTime(state.elapsedSeconds);
      if (clockText !== last.clock) {
        last.clock = clockText;
        clock.textContent = clockText;
      }
      const distanceText =
        unit === 'mph'
          ? `${(state.distanceMetres / 1609.344).toFixed(2)} mi`
          : `${(state.distanceMetres / 1000).toFixed(2)} km`;
      if (distanceText !== last.distance) {
        last.distance = distanceText;
        distance.textContent = distanceText;
      }
      if (placeName !== last.place) {
        last.place = placeName;
        place.textContent = placeName;
      }
      const surfaceText =
        state.surface === 'tarmac' ? 'Tarmac' : state.surface === 'kerb' ? 'Kerb' : 'Grass';
      if (surfaceText !== last.surface) {
        last.surface = surfaceText;
        surfaceLabel.textContent = surfaceText;
        surfaceLabel.classList.toggle('is-grass', state.surface === 'grass');
        surfaceLabel.classList.toggle('is-kerb', state.surface === 'kerb');
      }
      const speedText = String(convertSpeed(state.car.speed, unit));
      if (speedText !== last.speed) {
        last.speed = speedText;
        speed.textContent = speedText;
      }
      const unitText = speedUnitLabel(unit);
      if (unitText !== last.unit) {
        last.unit = unitText;
        speedUnit.textContent = unitText;
      }
      const gearText = formatGear(state.car.gear);
      const gearLabelText = state.car.gear < 0 ? 'Rev' : 'Gear';
      if (gearText !== last.gear) {
        last.gear = gearText;
        gear.textContent = gearText;
      }
      if (gearLabelText !== last.gearLabel) {
        last.gearLabel = gearLabelText;
        gearLabel.textContent = gearLabelText;
        root.classList.toggle('is-reverse', state.car.gear < 0);
      }
      const rpmScale = `scaleX(${clamp(state.car.rpm / CAR_TUNING.redlineRpm, 0, 1).toFixed(3)})`;
      if (rpmScale !== last.rpm) {
        last.rpm = rpmScale;
        rpm.style.transform = rpmScale;
      }
      if (debugVisible !== lastDebug) {
        lastDebug = debugVisible;
        debug.hidden = !debugVisible;
      }
    },
  };
}
