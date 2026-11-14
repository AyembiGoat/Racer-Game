import type { DrivingSurface } from '../../core/car';
import { CAR_TUNING } from '../../core/car';
import type { GameEvent, GameInput, GameState } from '../../core/game';
import type { Track } from '../../core/track';
import { clamp } from '../../core/vec';
import type { CameraMode } from '../view';
import {
  convertSpeed,
  formatDelta,
  formatGear,
  formatKeyCode,
  formatLapTime,
  formatRpm,
  formatSectorTime,
  formatSessionTime,
  speedUnitLabel,
} from './format';
import { renderIcon } from './icons';
import { createMinimap } from './minimap';
import type { GameSettings, KeyBindings } from './settings';

export interface HudController {
  readonly element: HTMLElement;
  setVisible(visible: boolean): void;
  applySettings(settings: GameSettings, bindings: KeyBindings): void;
  update(state: GameState, input: GameInput, events: readonly GameEvent[], dtSeconds: number): void;
  notifyCamera(mode: CameraMode): void;
  triggerResetVeil(): void;
  resetTransientState(): void;
}

export function createHud(track: Track): HudController {
  const root = document.createElement('div');
  root.className = 'hud-layer';
  root.hidden = true;

  root.innerHTML = `
    <div class="hud-impact-vignette" data-role="impact-vignette"></div>
    <div class="hud-reset-veil" data-role="reset-veil"></div>

    <div class="hud-top-banners">
      <div class="hud-lap-banner" data-role="lap-banner" aria-live="polite">
        <div>
          <div class="hud-lap-banner-tag" data-role="lap-banner-tag">Lap 1 Complete</div>
          <div class="hud-lap-banner-time tabular" data-role="lap-banner-time">0:00.000</div>
        </div>
        <div class="hud-lap-banner-delta tabular" data-role="lap-banner-delta"></div>
      </div>
      <div class="hud-camera-toast" data-role="camera-toast" aria-live="polite">
        ${renderIcon('camera')}
        <span data-role="camera-toast-label">Chase view</span>
      </div>
    </div>

    <section class="hud-cluster hud-card hud-timing" aria-label="Timing">
      <div class="hud-timing-head">
        <span class="hud-lap-badge tabular" data-role="lap-label">Lap 1</span>
        <span class="hud-delta-pill tabular" data-role="delta-pill">\u2014</span>
      </div>
      <div class="hud-lap-current tabular" data-role="lap-current">0:00.000</div>
      <div class="hud-sectors">
        <div class="hud-sector" data-sector="0">
          <span class="hud-sector-label">S1</span>
          <span class="hud-sector-val tabular" data-sector-val="0">\u2014</span>
        </div>
        <div class="hud-sector" data-sector="1">
          <span class="hud-sector-label">S2</span>
          <span class="hud-sector-val tabular" data-sector-val="1">\u2014</span>
        </div>
        <div class="hud-sector" data-sector="2">
          <span class="hud-sector-label">S3</span>
          <span class="hud-sector-val tabular" data-sector-val="2">\u2014</span>
        </div>
      </div>
      <div class="hud-timing-splits">
        <div class="hud-split-row">
          <span class="hud-split-label">Last</span>
          <span class="hud-split-val tabular" data-role="lap-last">\u2014</span>
        </div>
        <div class="hud-split-row">
          <span class="hud-split-label">Best</span>
          <span class="hud-split-val is-best tabular" data-role="lap-best">\u2014</span>
        </div>
      </div>
    </section>

    <section class="hud-cluster hud-map-cluster" aria-label="Circuit map">
      <div class="hud-card hud-minimap-box" data-role="minimap-box"></div>
      <div class="hud-card hud-session-pill">
        <span>Club Circuit</span>
        <span class="hud-session-clock tabular" data-role="session-clock">00:00</span>
      </div>
    </section>

    <section class="hud-cluster hud-left-cluster" aria-label="Surface and controls">
      <div class="hud-status-stack">
        <div class="hud-status-badge is-grass" data-role="surface-badge" hidden>
          ${renderIcon('surface-offtrack')}
          <span data-role="surface-label">Off track</span>
        </div>
        <div class="hud-status-badge is-slip" data-role="slip-badge" hidden>
          ${renderIcon('slip')}
          <span>Tyre slip</span>
        </div>
      </div>

      <div class="hud-card hud-inputs" data-role="input-trace">
        <div class="hud-pedal-bars">
          <div class="hud-pedal-col" title="Brake">
            <div class="hud-pedal-slot">
              <div class="hud-pedal-fill is-brake" data-role="brake-bar"></div>
            </div>
            <span class="hud-input-tag">B</span>
          </div>
          <div class="hud-pedal-col" title="Throttle">
            <div class="hud-pedal-slot">
              <div class="hud-pedal-fill is-throttle" data-role="throttle-bar"></div>
            </div>
            <span class="hud-input-tag">T</span>
          </div>
        </div>
        <div class="hud-steer-wrap">
          <div class="hud-steer-label">
            <span>L</span>
            <span>Steer</span>
            <span>R</span>
          </div>
          <div class="hud-steer-track">
            <div class="hud-steer-center"></div>
            <div class="hud-steer-puck" data-role="steer-puck"></div>
          </div>
        </div>
      </div>

      <div class="hud-key-hints" data-role="key-hints"></div>
    </section>

    <section class="hud-cluster hud-card hud-tach" aria-label="Vehicle telemetry">
      <div class="hud-tach-main">
        <div class="hud-speed-block">
          <span class="hud-speed-value tabular" data-role="speed-value">0</span>
          <span class="hud-speed-unit" data-role="speed-unit">km/h</span>
        </div>
        <div class="hud-gear-box" data-role="gear-box">
          <span class="hud-gear-label" data-role="gear-label">Gear</span>
          <span class="hud-gear-value tabular" data-role="gear-value">1</span>
        </div>
      </div>
      <div class="hud-rpm-meta">
        <span>RPM</span>
        <span class="hud-rpm-val tabular" data-role="rpm-value">950</span>
      </div>
      <div class="hud-rpm-bar">
        <div class="hud-rpm-fill" data-role="rpm-fill"></div>
        <div class="hud-rpm-redline-mark" aria-hidden="true"></div>
      </div>
    </section>
  `;

  const q = (role: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (!el) throw new Error(`Missing HUD role: ${role}`);
    return el;
  };

  const impactVignette = q('impact-vignette');
  const resetVeil = q('reset-veil');
  const lapBanner = q('lap-banner');
  const lapBannerTag = q('lap-banner-tag');
  const lapBannerTime = q('lap-banner-time');
  const lapBannerDelta = q('lap-banner-delta');
  const cameraToast = q('camera-toast');
  const cameraToastLabel = q('camera-toast-label');

  const lapLabel = q('lap-label');
  const deltaPill = q('delta-pill');
  const lapCurrent = q('lap-current');
  const lapLast = q('lap-last');
  const lapBest = q('lap-best');

  const sectorEls = [0, 1, 2].map((i) => {
    const box = root.querySelector<HTMLElement>(`[data-sector="${i}"]`);
    const val = root.querySelector<HTMLElement>(`[data-sector-val="${i}"]`);
    if (!box || !val) throw new Error(`Missing HUD sector ${i}`);
    return { box, val };
  });

  const minimapBox = q('minimap-box');
  const minimap = createMinimap(track);
  minimapBox.appendChild(minimap.element);
  const sessionClock = q('session-clock');

  const surfaceBadge = q('surface-badge');
  const surfaceLabel = q('surface-label');
  const slipBadge = q('slip-badge');
  const inputTrace = q('input-trace');
  const brakeBar = q('brake-bar');
  const throttleBar = q('throttle-bar');
  const steerPuck = q('steer-puck');
  const keyHints = q('key-hints');

  const speedValue = q('speed-value');
  const speedUnitEl = q('speed-unit');
  const gearBox = q('gear-box');
  const gearLabel = q('gear-label');
  const gearValue = q('gear-value');
  const rpmValue = q('rpm-value');
  const rpmFill = q('rpm-fill');

  let currentSettings: GameSettings | null = null;
  let lastSpeedText = '';
  let lastGear = NaN;
  let lastRpmText = '';
  let lastRpmScale = '';
  let lastLap = -1;
  let lastLapTimeText = '';
  let lastBestLapText = '';
  let lastLastLapText = '';
  let lastDeltaText = '';
  let lastDeltaClass = '';
  let lastSessionText = '';
  let lastSurface: DrivingSurface | null = null;
  let lastSlipVisible = false;
  let lastThrottle = -1;
  let lastBrake = -1;
  let lastSteer = 999;
  const lastSectorText = ['', '', ''];
  const lastSectorClass = ['', '', ''];

  let lapBannerRemaining = 0;
  let cameraToastRemaining = 0;
  let shiftFlashRemaining = 0;
  let impactOpacity = 0;
  let resetVeilRemaining = 0;

  function renderKeyHints(bindings: KeyBindings) {
    const camKey = formatKeyCode(bindings.camera[0] ?? bindings.camera[1]);
    const resetKey = formatKeyCode(bindings.reset[0] ?? bindings.reset[1]);
    const pauseKey = formatKeyCode(bindings.pause[0] ?? bindings.pause[1]);
    keyHints.innerHTML = `
      <span class="hud-key-hint"><kbd class="ui-keycap is-compact">${pauseKey}</kbd> Pause</span>
      <span class="hud-key-hint"><kbd class="ui-keycap is-compact">${camKey}</kbd> View</span>
      <span class="hud-key-hint"><kbd class="ui-keycap is-compact">${resetKey}</kbd> Reset</span>
    `;
  }

  return {
    element: root,

    setVisible(visible) {
      root.hidden = !visible;
    },

    applySettings(settings, bindings) {
      currentSettings = settings;
      root.style.setProperty('--hud-scale', String(settings.hudScale / 100));
      speedUnitEl.textContent = speedUnitLabel(settings.speedUnit);
      minimapBox.hidden = settings.minimap === 'off';
      inputTrace.hidden = !settings.inputTrace;
      renderKeyHints(bindings);
      // Force unit-dependent speed refresh on next frame.
      lastSpeedText = '';
    },

    notifyCamera(mode) {
      cameraToastLabel.textContent = mode === 'bonnet' ? 'Bonnet view' : 'Chase view';
      cameraToastRemaining = 1.5;
      cameraToast.classList.add('is-visible');
    },

    triggerResetVeil() {
      resetVeilRemaining = 0.24;
      resetVeil.classList.add('is-active');
    },

    resetTransientState() {
      lapBannerRemaining = 0;
      cameraToastRemaining = 0;
      shiftFlashRemaining = 0;
      impactOpacity = 0;
      resetVeilRemaining = 0;
      lapBanner.classList.remove('is-visible', 'is-best');
      cameraToast.classList.remove('is-visible');
      gearBox.classList.remove('is-shift');
      impactVignette.style.opacity = '0';
      resetVeil.classList.remove('is-active');
    },

    update(state, input, events, dtSeconds) {
      if (!currentSettings) return;

      // Transient timers
      if (lapBannerRemaining > 0) {
        lapBannerRemaining = Math.max(0, lapBannerRemaining - dtSeconds);
        if (lapBannerRemaining === 0) lapBanner.classList.remove('is-visible');
      }
      if (cameraToastRemaining > 0) {
        cameraToastRemaining = Math.max(0, cameraToastRemaining - dtSeconds);
        if (cameraToastRemaining === 0) cameraToast.classList.remove('is-visible');
      }
      if (shiftFlashRemaining > 0) {
        shiftFlashRemaining = Math.max(0, shiftFlashRemaining - dtSeconds);
        if (shiftFlashRemaining === 0) gearBox.classList.remove('is-shift');
      }
      if (impactOpacity > 0) {
        impactOpacity = Math.max(0, impactOpacity - dtSeconds * 2.4);
        impactVignette.style.opacity = impactOpacity.toFixed(3);
      }
      if (resetVeilRemaining > 0) {
        resetVeilRemaining = Math.max(0, resetVeilRemaining - dtSeconds);
        if (resetVeilRemaining === 0) resetVeil.classList.remove('is-active');
      }

      // Events
      for (const ev of events) {
        if (ev.type === 'gear-shift') {
          shiftFlashRemaining = 0.22;
          gearBox.classList.add('is-shift');
        } else if (ev.type === 'wall-hit') {
          impactOpacity = clamp(ev.impactSpeed / 14, 0.22, 0.92);
          impactVignette.style.opacity = impactOpacity.toFixed(3);
        } else if (ev.type === 'lap') {
          const isBestBadge = ev.isNewBest && ev.lap > 1;
          lapBannerTag.textContent = isBestBadge
            ? `Lap ${ev.lap} \u00b7 New Personal Best`
            : `Lap ${ev.lap} Complete`;
          lapBannerTime.textContent = formatLapTime(ev.timeSeconds);
          const deltaStr = formatDelta(ev.deltaSeconds);
          lapBannerDelta.textContent = ev.deltaSeconds === null ? '' : deltaStr;
          lapBannerDelta.className = `hud-lap-banner-delta tabular ${
            ev.deltaSeconds !== null && ev.deltaSeconds < -0.0005
              ? 'is-faster'
              : ev.deltaSeconds !== null
                ? 'is-slower'
                : ''
          }`;
          lapBanner.classList.toggle('is-best', isBestBadge);
          lapBanner.classList.add('is-visible');
          lapBannerRemaining = 3.2;
        }
      }

      // Speed, gear & RPM
      const speedText = String(convertSpeed(state.car.speed, currentSettings.speedUnit));
      if (speedText !== lastSpeedText) {
        lastSpeedText = speedText;
        speedValue.textContent = speedText;
      }

      if (state.car.gear !== lastGear) {
        lastGear = state.car.gear;
        const isRev = state.car.gear < 0;
        gearBox.classList.toggle('is-reverse', isRev);
        gearLabel.textContent = isRev ? 'Rev' : 'Gear';
        gearValue.textContent = formatGear(state.car.gear);
      }

      const rpmText = formatRpm(state.car.rpm);
      if (rpmText !== lastRpmText) {
        lastRpmText = rpmText;
        rpmValue.textContent = rpmText;
      }

      const redline = CAR_TUNING.redlineRpm;
      const rpmNorm = clamp(state.car.rpm / redline, 0, 1);
      const rpmScale = `scaleX(${rpmNorm.toFixed(3)})`;
      if (rpmScale !== lastRpmScale) {
        lastRpmScale = rpmScale;
        rpmFill.style.transform = rpmScale;
        rpmFill.classList.toggle('is-redline', state.car.rpm >= redline - 450);
        rpmFill.classList.toggle(
          'is-near-redline',
          state.car.rpm >= redline - 950 && state.car.rpm < redline - 450,
        );
      }

      // Timing & sectors
      const activeLap = state.completedLaps + 1;
      if (activeLap !== lastLap) {
        lastLap = activeLap;
        lapLabel.textContent = `Lap ${activeLap}`;
      }

      const currentLapText = formatLapTime(state.currentLapSeconds);
      if (currentLapText !== lastLapTimeText) {
        lastLapTimeText = currentLapText;
        lapCurrent.textContent = currentLapText;
      }

      const lastText = formatLapTime(state.lastLapSeconds);
      if (lastText !== lastLastLapText) {
        lastLastLapText = lastText;
        lapLast.textContent = lastText;
      }

      const bestText = formatLapTime(state.bestLapSeconds);
      if (bestText !== lastBestLapText) {
        lastBestLapText = bestText;
        lapBest.textContent = bestText;
      }

      // Prefer most recent checkpoint delta if we're mid-lap, otherwise last lap delta.
      const activeDelta = state.lastCheckpointDeltaSeconds ?? state.lastLapDeltaSeconds;
      const deltaText = formatDelta(activeDelta);
      const deltaClass =
        activeDelta === null
          ? 'hud-delta-pill tabular'
          : activeDelta < -0.0005
            ? 'hud-delta-pill tabular is-faster'
            : 'hud-delta-pill tabular is-slower';
      if (deltaText !== lastDeltaText) {
        lastDeltaText = deltaText;
        deltaPill.textContent = deltaText;
      }
      if (deltaClass !== lastDeltaClass) {
        lastDeltaClass = deltaClass;
        deltaPill.className = deltaClass;
      }

      for (let i = 0; i < 3; i++) {
        const sVal = state.currentSectors[i] ?? null;
        const bVal = state.bestSectors[i] ?? null;
        const valText = formatSectorTime(sVal);
        const slot = sectorEls[i];
        if (!slot) continue;
        if (valText !== lastSectorText[i]) {
          lastSectorText[i] = valText;
          slot.val.textContent = valText;
        }
        const isDone = sVal !== null;
        const isBest = sVal !== null && bVal !== null && Math.abs(sVal - bVal) < 0.0005;
        const isActive = !isDone && state.nextCheckpoint === i;
        const cls = isBest
          ? 'hud-sector is-best'
          : isDone
            ? 'hud-sector is-done'
            : isActive
              ? 'hud-sector is-active'
              : 'hud-sector';
        if (cls !== lastSectorClass[i]) {
          lastSectorClass[i] = cls;
          slot.box.className = cls;
        }
      }

      const sessionText = formatSessionTime(state.elapsedSeconds);
      if (sessionText !== lastSessionText) {
        lastSessionText = sessionText;
        sessionClock.textContent = sessionText;
      }

      // Surface & tyre slip warnings
      if (state.surface !== lastSurface) {
        lastSurface = state.surface;
        if (state.surface === 'grass') {
          surfaceBadge.hidden = false;
          surfaceBadge.className = 'hud-status-badge is-grass';
          surfaceLabel.textContent = 'Off track \u00b7 Grass';
        } else if (state.surface === 'kerb') {
          surfaceBadge.hidden = false;
          surfaceBadge.className = 'hud-status-badge is-kerb';
          surfaceLabel.textContent = 'Kerb';
        } else {
          surfaceBadge.hidden = true;
        }
      }

      const showSlip = state.car.slip > 0.28 && state.car.speed > 5;
      if (showSlip !== lastSlipVisible) {
        lastSlipVisible = showSlip;
        slipBadge.hidden = !showSlip;
      }

      // Input trace
      if (currentSettings.inputTrace) {
        if (Math.abs(input.throttle - lastThrottle) > 0.005) {
          lastThrottle = input.throttle;
          throttleBar.style.transform = `scaleY(${clamp(input.throttle, 0, 1).toFixed(3)})`;
        }
        if (Math.abs(input.brake - lastBrake) > 0.005) {
          lastBrake = input.brake;
          brakeBar.style.transform = `scaleY(${clamp(input.brake, 0, 1).toFixed(3)})`;
        }
        if (Math.abs(input.steer - lastSteer) > 0.005) {
          lastSteer = input.steer;
          steerPuck.style.transform = `translateX(${(clamp(input.steer, -1, 1) * 36).toFixed(1)}px)`;
        }
      }

      // Minimap
      minimap.update(
        state.car.position.x,
        state.car.position.z,
        state.car.heading,
        state.nextCheckpoint,
        currentSettings.minimap,
      );
    },
  };
}
