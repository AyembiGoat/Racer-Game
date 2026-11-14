import type { GameState } from '../../core/game';
import type { CameraMode } from '../view';
import { formatDistance, formatKeyCode, formatLapTime, formatSessionTime } from './format';
import { renderBmwM3Silhouette, renderIcon } from './icons';
import {
  CONTROL_ACTIONS,
  DEFAULT_SETTINGS,
  type ControlAction,
  type GameSettings,
  type KeyBindings,
  type MinimapMode,
  type SettingsStore,
} from './settings';

export type ScreenName = 'loading' | 'title' | 'race' | 'pause' | 'settings' | 'controls';
export type UiSoundKind = 'focus' | 'select' | 'back' | 'confirm' | 'warning';

export interface ScreensCallbacks {
  onStartRace(): void;
  onResumeRace(): void;
  onRestartRun(): void;
  onQuitToTitle(): void;
  onOpenSettings(): void;
  onOpenControls(): void;
  onCloseSubscreen(): void;
  onPlaySound(kind: UiSoundKind): void;
  onSkipLoading(): void;
  getGameState(): GameState;
  getCurrentCamera(): CameraMode;
}

export interface ScreensController {
  readonly element: HTMLElement;
  setScreen(screen: ScreenName): void;
  setLoadingState(phaseLabel: string, progress01: number, canSkip: boolean): void;
  refreshPauseSummary(state: GameState): void;
  refreshBindings(): void;
  isListeningForKey(): boolean;
}

type SettingsTab = 'driving' | 'display' | 'audio';

interface SettingDef {
  readonly key: keyof GameSettings;
  readonly tab: SettingsTab;
  readonly label: string;
  readonly summary: string;
  readonly defaultLabel: string;
  readonly type: 'selector' | 'slider' | 'toggle';
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unitSuffix?: string;
}

const SETTING_DEFS: readonly SettingDef[] = [
  {
    key: 'speedUnit',
    tab: 'driving',
    label: 'Speed & distance units',
    summary:
      'Switches the speedometer, odometer, and session distance between metric and imperial.',
    defaultLabel: 'km/h',
    type: 'selector',
    options: [
      { value: 'kmh', label: 'km/h' },
      { value: 'mph', label: 'mph' },
    ],
  },
  {
    key: 'defaultCamera',
    tab: 'driving',
    label: 'Default camera',
    summary: 'Selects whether sessions begin in the trailing chase camera or the bonnet camera.',
    defaultLabel: 'Chase',
    type: 'selector',
    options: [
      { value: 'chase', label: 'Chase' },
      { value: 'bonnet', label: 'Bonnet' },
    ],
  },
  {
    key: 'inputTrace',
    tab: 'driving',
    label: 'Input trace',
    summary: 'Shows compact throttle, brake, and steering bars at the bottom-left of the HUD.',
    defaultLabel: 'On',
    type: 'toggle',
  },
  {
    key: 'fov',
    tab: 'display',
    label: 'Field of view',
    summary:
      'Adjusts the camera lens width in degrees. Higher values widen peripheral track sightlines.',
    defaultLabel: '64°',
    type: 'slider',
    min: 50,
    max: 85,
    step: 1,
    unitSuffix: '°',
  },
  {
    key: 'hudScale',
    tab: 'display',
    label: 'HUD scale',
    summary:
      'Scales all in-race timing, map, and tachometer clusters without affecting the 3D viewport.',
    defaultLabel: '100%',
    type: 'slider',
    min: 80,
    max: 120,
    step: 5,
    unitSuffix: '%',
  },
  {
    key: 'minimap',
    tab: 'display',
    label: 'Circuit minimap',
    summary:
      'Displays Club Circuit track outline, sectors, and car marker in fixed, rotating, or hidden mode.',
    defaultLabel: 'Fixed',
    type: 'selector',
    options: [
      { value: 'on', label: 'Fixed' },
      { value: 'rotating', label: 'Rotating' },
      { value: 'off', label: 'Off' },
    ],
  },
  {
    key: 'masterVolume',
    tab: 'audio',
    label: 'Master volume',
    summary: 'Scales engine, tyre, surface, and interface audio together.',
    defaultLabel: '68%',
    type: 'slider',
    min: 0,
    max: 100,
    step: 2,
    unitSuffix: '%',
  },
  {
    key: 'reducedMotion',
    tab: 'audio',
    label: 'Reduced motion',
    summary: 'Replaces slide sweeps and title showcase camera drift with quiet opacity fades.',
    defaultLabel: 'Off',
    type: 'toggle',
  },
];

export function createScreens(
  store: SettingsStore,
  callbacks: ScreensCallbacks,
): ScreensController {
  const root = document.createElement('div');
  root.className = 'ui-screens-host';

  // Build subtrees once; toggle visibility & update dynamic sections in place.
  const loadingEl = document.createElement('section');
  loadingEl.className = 'ui-loading';
  loadingEl.setAttribute('aria-label', 'Loading');
  loadingEl.innerHTML = `
    <div class="ui-loading-top">
      <div class="ui-loading-brand">
        ${renderBmwM3Silhouette()}
        <span>Time Trial · Club Circuit</span>
      </div>
      <button type="button" class="ui-btn ui-focusable" data-role="skip-btn" hidden>
        Skip intro
      </button>
    </div>
    <div class="ui-loading-center">
      <h1 class="ui-loading-title">1989 BMW M3</h1>
      <p class="ui-loading-sub">Club Circuit · Assembling track geometry, lighting, and audio</p>
    </div>
    <div class="ui-loading-footer">
      <div class="ui-loading-status">
        <span data-role="loading-phase">Building circuit</span>
        <span class="tabular" data-role="loading-pct">0%</span>
      </div>
      <div class="ui-loading-bar">
        <div class="ui-loading-fill" data-role="loading-fill"></div>
      </div>
    </div>
  `;

  const titleEl = document.createElement('section');
  titleEl.className = 'ui-title';
  titleEl.setAttribute('aria-label', 'Main menu');
  titleEl.hidden = true;
  titleEl.innerHTML = `
    <div class="ui-title-top">
      <div class="ui-title-spec-pill">
        ${renderBmwM3Silhouette()}
        <span>1989 BMW M3 · E30 · 2.3L I4 · 5-Speed</span>
      </div>
      <div class="ui-title-spec-pill">
        ${renderIcon('flag')}
        <span>Club Circuit · Time Trial</span>
      </div>
    </div>

    <div class="ui-title-body">
      <div class="ui-title-heading">
        <div class="ui-title-eyebrow">
          <span>Pit Wall Timing</span>
        </div>
        <h1 class="ui-title-h1">BMW M3<br />Club Circuit</h1>
        <p class="ui-title-meta">Solo time trial · 3 timing sectors · Chase and bonnet views</p>
        <div class="ui-header-rule"></div>
      </div>

      <nav class="ui-menu-list" aria-label="Primary actions">
        <button type="button" class="ui-menu-item is-primary ui-focusable" style="--stagger: 0" data-action="play">
          <span class="ui-menu-item-left">
            ${renderIcon('play')}
            <span>Play</span>
          </span>
          <span class="ui-menu-item-tag">Start session</span>
        </button>
        <button type="button" class="ui-menu-item ui-focusable" style="--stagger: 1" data-action="settings">
          <span class="ui-menu-item-left">
            ${renderIcon('settings')}
            <span>Settings</span>
          </span>
          <span class="ui-menu-item-tag">Units · FOV · Audio</span>
        </button>
        <button type="button" class="ui-menu-item ui-focusable" style="--stagger: 2" data-action="controls">
          <span class="ui-menu-item-left">
            ${renderIcon('controls')}
            <span>Controls</span>
          </span>
          <span class="ui-menu-item-tag">Key bindings</span>
        </button>
      </nav>
    </div>

    <div class="ui-title-footer">
      <div class="ui-action-bar">
        <span class="ui-action-hint"><kbd class="ui-keycap is-compact">Up</kbd><kbd class="ui-keycap is-compact">Down</kbd> Navigate</span>
        <span class="ui-action-hint"><kbd class="ui-keycap is-compact">Enter</kbd> Select</span>
        <span class="ui-action-hint"><kbd class="ui-keycap is-compact">Esc</kbd> Pause in session</span>
      </div>
    </div>
  `;

  const pauseBackdrop = document.createElement('div');
  pauseBackdrop.className = 'ui-backdrop';
  pauseBackdrop.hidden = true;
  pauseBackdrop.innerHTML = `
    <section class="ui-panel ui-pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <header class="ui-header">
        <div class="ui-header-eyebrow">
          ${renderIcon('pause')}
          <span>Session Paused · Club Circuit</span>
        </div>
        <h2 class="ui-header-title" id="pause-title">1989 BMW M3</h2>
        <div class="ui-header-rule"></div>
      </header>

      <div class="ui-pause-grid">
        <nav class="ui-menu-list" aria-label="Pause menu">
          <button type="button" class="ui-menu-item is-primary ui-focusable" data-pause-action="resume">
            <span class="ui-menu-item-left">${renderIcon('play')}<span>Resume</span></span>
            <span class="ui-menu-item-tag">Esc</span>
          </button>
          <button type="button" class="ui-menu-item ui-focusable" data-pause-action="restart">
            <span class="ui-menu-item-left">${renderIcon('reset')}<span>Restart run</span></span>
            <span class="ui-menu-item-tag">Grid reset</span>
          </button>
          <button type="button" class="ui-menu-item ui-focusable" data-pause-action="settings">
            <span class="ui-menu-item-left">${renderIcon('settings')}<span>Settings</span></span>
          </button>
          <button type="button" class="ui-menu-item ui-focusable" data-pause-action="controls">
            <span class="ui-menu-item-left">${renderIcon('controls')}<span>Controls</span></span>
          </button>
          <button type="button" class="ui-menu-item ui-focusable" data-pause-action="quit">
            <span class="ui-menu-item-left">${renderIcon('chevron-left')}<span>Quit to title</span></span>
          </button>
        </nav>

        <aside class="ui-summary-card" aria-label="Session summary">
          <h3 class="ui-summary-title">Session Summary</h3>
          <div class="ui-stat-grid">
            <div class="ui-stat-cell">
              <div class="ui-stat-label">Laps completed</div>
              <div class="ui-stat-value tabular" data-role="sum-laps">0</div>
            </div>
            <div class="ui-stat-cell">
              <div class="ui-stat-label">Best lap</div>
              <div class="ui-stat-value is-accent tabular" data-role="sum-best">\u2014</div>
            </div>
            <div class="ui-stat-cell">
              <div class="ui-stat-label">Last lap</div>
              <div class="ui-stat-value tabular" data-role="sum-last">\u2014</div>
            </div>
            <div class="ui-stat-cell">
              <div class="ui-stat-label">Session time</div>
              <div class="ui-stat-value tabular" data-role="sum-time">00:00</div>
            </div>
            <div class="ui-stat-cell">
              <div class="ui-stat-label">Distance driven</div>
              <div class="ui-stat-value tabular" data-role="sum-dist">0 m</div>
            </div>
            <div class="ui-stat-cell">
              <div class="ui-stat-label">Current lap</div>
              <div class="ui-stat-value tabular" data-role="sum-curr">0:00.000</div>
            </div>
          </div>
          <div class="ui-lap-log" data-role="sum-log" hidden></div>
        </aside>
      </div>
    </section>
  `;

  const settingsBackdrop = document.createElement('div');
  settingsBackdrop.className = 'ui-backdrop';
  settingsBackdrop.hidden = true;
  settingsBackdrop.innerHTML = `
    <section class="ui-panel ui-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="ui-sheet-topbar">
        <header class="ui-header" style="flex: 1; min-width: 240px;">
          <div class="ui-header-eyebrow">
            ${renderIcon('settings')}
            <span>Configuration</span>
          </div>
          <h2 class="ui-header-title" id="settings-title">Settings</h2>
          <div class="ui-header-rule"></div>
        </header>
        <div class="ui-tabs" role="tablist" aria-label="Settings categories">
          <button type="button" class="ui-tab ui-focusable is-active" role="tab" data-tab="driving">Driving</button>
          <button type="button" class="ui-tab ui-focusable" role="tab" data-tab="display">Display</button>
          <button type="button" class="ui-tab ui-focusable" role="tab" data-tab="audio">Audio & Motion</button>
        </div>
      </div>

      <div class="ui-sheet-columns">
        <div class="ui-sheet-list" data-role="settings-rows"></div>
        <aside class="ui-inspector" data-role="settings-inspector">
          <div>
            <div class="ui-inspector-head">
              <span>Setting Details</span>
              <span data-role="insp-tab">Driving</span>
            </div>
            <h3 class="ui-inspector-title" data-role="insp-title">Speed & distance units</h3>
            <p class="ui-inspector-desc" data-role="insp-desc"></p>
          </div>
          <div class="ui-inspector-meta">
            <div>Default: <strong data-role="insp-default">km/h</strong></div>
            <div>Changes apply immediately and are saved locally.</div>
            <button type="button" class="ui-btn ui-focusable" data-role="insp-reset">
              ${renderIcon('reset')}
              <span>Reset this setting</span>
            </button>
          </div>
        </aside>
      </div>

      <footer class="ui-sheet-footer">
        <div class="ui-footer-actions">
          <button type="button" class="ui-btn ui-focusable" data-role="settings-reset-all">
            ${renderIcon('reset')}
            <span>Reset all settings</span>
          </button>
          <span class="ui-notice" data-role="storage-notice" hidden>
            ${renderIcon('warning')}
            <span>Browser storage is unavailable; settings apply for this session only.</span>
          </span>
        </div>
        <button type="button" class="ui-btn is-primary ui-focusable" data-role="settings-back">
          ${renderIcon('chevron-left')}
          <span>Back</span>
        </button>
      </footer>
    </section>
  `;

  const controlsBackdrop = document.createElement('div');
  controlsBackdrop.className = 'ui-backdrop';
  controlsBackdrop.hidden = true;
  controlsBackdrop.innerHTML = `
    <section class="ui-panel ui-sheet" role="dialog" aria-modal="true" aria-labelledby="controls-title">
      <div class="ui-sheet-topbar">
        <header class="ui-header" style="flex: 1;">
          <div class="ui-header-eyebrow">
            ${renderIcon('controls')}
            <span>Input Mapping · Keyboard</span>
          </div>
          <h2 class="ui-header-title" id="controls-title">Controls</h2>
          <div class="ui-header-rule"></div>
        </header>
        <div class="ui-title-spec-pill" data-role="controls-camera-pill">
          ${renderIcon('camera')}
          <span data-role="controls-camera-label">Current view: Chase</span>
        </div>
      </div>

      <div class="ui-sheet-columns">
        <div class="ui-sheet-list" data-role="controls-rows"></div>
        <aside class="ui-inspector">
          <div>
            <div class="ui-inspector-head">
              <span>Action Details</span>
              <span data-role="ctrl-insp-group">Driving</span>
            </div>
            <h3 class="ui-inspector-title" data-role="ctrl-insp-title">Accelerate</h3>
            <p class="ui-inspector-desc" data-role="ctrl-insp-desc"></p>
          </div>
          <div class="ui-inspector-meta">
            <div>Select any binding slot and press a new key. Press Escape to cancel.</div>
            <div class="ui-notice is-danger" data-role="ctrl-conflict" hidden>
              ${renderIcon('warning')}
              <span data-role="ctrl-conflict-text"></span>
            </div>
          </div>
        </aside>
      </div>

      <footer class="ui-sheet-footer">
        <button type="button" class="ui-btn ui-focusable" data-role="controls-reset-all">
          ${renderIcon('reset')}
          <span>Reset default bindings</span>
        </button>
        <button type="button" class="ui-btn is-primary ui-focusable" data-role="controls-back">
          ${renderIcon('chevron-left')}
          <span>Back</span>
        </button>
      </footer>
    </section>
  `;

  root.append(loadingEl, titleEl, pauseBackdrop, settingsBackdrop, controlsBackdrop);

  const mustEl = (parent: ParentNode, selector: string): HTMLElement => {
    const el = parent.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Missing element: ${selector}`);
    return el;
  };
  const mustBtn = (parent: ParentNode, selector: string): HTMLButtonElement => {
    const el = parent.querySelector<HTMLButtonElement>(selector);
    if (!el) throw new Error(`Missing button: ${selector}`);
    return el;
  };

  let currentScreen: ScreenName = 'loading';
  let activeSettingsTab: SettingsTab = 'driving';
  let focusedSettingKey: keyof GameSettings = 'speedUnit';
  let confirmResetAll = false;
  let focusedAction: ControlAction = 'accelerate';
  let listeningTarget: { action: ControlAction; slot: 0 | 1 } | null = null;
  let conflictMessage: string | null = null;

  // Loading elements
  const skipBtn = mustBtn(loadingEl, '[data-role="skip-btn"]');
  const loadingPhase = mustEl(loadingEl, '[data-role="loading-phase"]');
  const loadingPct = mustEl(loadingEl, '[data-role="loading-pct"]');
  const loadingFill = mustEl(loadingEl, '[data-role="loading-fill"]');

  skipBtn.addEventListener('click', () => {
    callbacks.onPlaySound('select');
    callbacks.onSkipLoading();
  });

  // Title handlers
  titleEl.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
    btn.addEventListener('mouseenter', () => {
      callbacks.onPlaySound('focus');
    });
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      callbacks.onPlaySound('select');
      if (action === 'play') callbacks.onStartRace();
      else if (action === 'settings') callbacks.onOpenSettings();
      else if (action === 'controls') callbacks.onOpenControls();
    });
  });

  // Pause handlers
  pauseBackdrop.querySelectorAll<HTMLButtonElement>('[data-pause-action]').forEach((btn) => {
    btn.addEventListener('mouseenter', () => {
      callbacks.onPlaySound('focus');
    });
    btn.addEventListener('click', () => {
      const action = btn.dataset.pauseAction;
      if (action === 'resume') {
        callbacks.onPlaySound('back');
        callbacks.onResumeRace();
      } else if (action === 'restart') {
        callbacks.onPlaySound('confirm');
        callbacks.onRestartRun();
      } else if (action === 'settings') {
        callbacks.onPlaySound('select');
        callbacks.onOpenSettings();
      } else if (action === 'controls') {
        callbacks.onPlaySound('select');
        callbacks.onOpenControls();
      } else if (action === 'quit') {
        callbacks.onPlaySound('back');
        callbacks.onQuitToTitle();
      }
    });
  });

  // Settings references & rendering
  const settingsRowsEl = mustEl(settingsBackdrop, '[data-role="settings-rows"]');
  const inspTab = mustEl(settingsBackdrop, '[data-role="insp-tab"]');
  const inspTitle = mustEl(settingsBackdrop, '[data-role="insp-title"]');
  const inspDesc = mustEl(settingsBackdrop, '[data-role="insp-desc"]');
  const inspDefault = mustEl(settingsBackdrop, '[data-role="insp-default"]');
  const inspResetBtn = mustBtn(settingsBackdrop, '[data-role="insp-reset"]');
  const resetAllBtn = mustBtn(settingsBackdrop, '[data-role="settings-reset-all"]');
  const settingsBackBtn = mustBtn(settingsBackdrop, '[data-role="settings-back"]');
  const storageNotice = mustEl(settingsBackdrop, '[data-role="storage-notice"]');

  function updateSettingsInspector() {
    const fallbackDef = SETTING_DEFS[0];
    const def = SETTING_DEFS.find((d) => d.key === focusedSettingKey) ?? fallbackDef;
    if (!def) return;
    inspTab.textContent =
      def.tab === 'driving' ? 'Driving' : def.tab === 'display' ? 'Display' : 'Audio & Motion';
    inspTitle.textContent = def.label;
    inspDesc.textContent = def.summary;
    inspDefault.textContent = def.defaultLabel;
    const isDefault = store.getSettings()[def.key] === DEFAULT_SETTINGS[def.key];
    inspResetBtn.disabled = isDefault;
  }

  function renderSettingsRows() {
    const s = store.getSettings();
    const visibleDefs = SETTING_DEFS.filter((d) => d.tab === activeSettingsTab);
    if (!visibleDefs.some((d) => d.key === focusedSettingKey) && visibleDefs[0]) {
      focusedSettingKey = visibleDefs[0].key;
    }

    settingsRowsEl.innerHTML = '';
    for (const def of visibleDefs) {
      const row = document.createElement('div');
      row.className = `ui-row${def.key === focusedSettingKey ? ' is-selected' : ''}`;
      row.dataset.settingKey = def.key;

      const left = document.createElement('div');
      left.innerHTML = `<div class="ui-row-label">${def.label}</div>`;

      const right = document.createElement('div');
      right.className = 'ui-row-right';

      if (def.type === 'toggle') {
        const checked = Boolean(s[def.key]);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ui-toggle ui-focusable';
        btn.setAttribute('role', 'switch');
        btn.setAttribute('aria-checked', String(checked));
        btn.setAttribute('aria-label', def.label);
        btn.innerHTML = `
          <span class="ui-toggle-pill"><span class="ui-toggle-knob"></span></span>
          <span class="ui-value-readout">${checked ? 'On' : 'Off'}</span>
        `;
        btn.addEventListener('focus', () => {
          focusedSettingKey = def.key;
          updateRowSelection();
        });
        btn.addEventListener('click', () => {
          focusedSettingKey = def.key;
          callbacks.onPlaySound('confirm');
          store.setSettings({ [def.key]: !store.getSettings()[def.key] });
          renderSettingsRows();
        });
        right.appendChild(btn);
      } else if (def.type === 'selector' && def.options) {
        const options = def.options;
        const currentVal = String(s[def.key]);
        const idx = Math.max(
          0,
          options.findIndex((o) => o.value === currentVal),
        );
        const currentOpt = options[idx] ?? options[0];
        if (!currentOpt) continue;
        const wrap = document.createElement('div');
        wrap.className = 'ui-selector';

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'ui-selector-btn ui-focusable';
        prevBtn.setAttribute('aria-label', `Previous ${def.label}`);
        prevBtn.innerHTML = renderIcon('chevron-left');

        const valEl = document.createElement('span');
        valEl.className = 'ui-selector-value';
        valEl.textContent = currentOpt.label;

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'ui-selector-btn ui-focusable';
        nextBtn.setAttribute('aria-label', `Next ${def.label}`);
        nextBtn.innerHTML = renderIcon('chevron-right');

        const stepOption = (dir: -1 | 1) => {
          focusedSettingKey = def.key;
          const curIdx = Math.max(
            0,
            options.findIndex((o) => o.value === String(store.getSettings()[def.key])),
          );
          const nextOpt = options[(curIdx + dir + options.length) % options.length];
          if (!nextOpt) return;
          callbacks.onPlaySound('confirm');
          store.setSettings({
            [def.key]: nextOpt.value as MinimapMode,
          });
          renderSettingsRows();
        };

        prevBtn.addEventListener('focus', () => {
          focusedSettingKey = def.key;
          updateRowSelection();
        });
        nextBtn.addEventListener('focus', () => {
          focusedSettingKey = def.key;
          updateRowSelection();
        });
        prevBtn.addEventListener('click', () => {
          stepOption(-1);
        });
        nextBtn.addEventListener('click', () => {
          stepOption(1);
        });

        wrap.append(prevBtn, valEl, nextBtn);
        right.appendChild(wrap);
      } else if (def.type === 'slider') {
        const min = def.min ?? 0;
        const max = def.max ?? 100;
        const step = def.step ?? 1;
        const val = Number(s[def.key]);
        const frac = (val - min) / Math.max(1, max - min);

        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'ui-slider';

        const track = document.createElement('div');
        track.className = 'ui-slider-track';

        const fill = document.createElement('div');
        fill.className = 'ui-slider-fill';
        fill.style.transform = `scaleX(${frac.toFixed(3)})`;

        const thumb = document.createElement('div');
        thumb.className = 'ui-slider-thumb';
        thumb.style.left = `${(frac * 100).toFixed(2)}%`;

        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'ui-slider-input ui-focusable';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(val);
        input.setAttribute('aria-label', def.label);

        const readout = document.createElement('span');
        readout.className = 'ui-value-readout tabular';
        readout.textContent = `${val}${def.unitSuffix ?? ''}`;

        input.addEventListener('focus', () => {
          focusedSettingKey = def.key;
          updateRowSelection();
        });
        input.addEventListener('input', () => {
          focusedSettingKey = def.key;
          const nextVal = Number(input.value);
          const nextFrac = (nextVal - min) / Math.max(1, max - min);
          fill.style.transform = `scaleX(${nextFrac.toFixed(3)})`;
          thumb.style.left = `${(nextFrac * 100).toFixed(2)}%`;
          readout.textContent = `${nextVal}${def.unitSuffix ?? ''}`;
          store.setSettings({ [def.key]: nextVal });
          updateSettingsInspector();
        });
        input.addEventListener('change', () => {
          callbacks.onPlaySound('confirm');
        });

        track.append(fill, thumb, input);
        sliderWrap.append(track, readout);
        right.appendChild(sliderWrap);
      }

      row.addEventListener('mouseenter', () => {
        if (focusedSettingKey !== def.key) {
          focusedSettingKey = def.key;
          updateRowSelection();
        }
      });

      row.append(left, right);
      settingsRowsEl.appendChild(row);
    }

    storageNotice.hidden = store.isStorageAvailable();
    updateSettingsInspector();
  }

  function updateRowSelection() {
    settingsRowsEl.querySelectorAll<HTMLElement>('.ui-row').forEach((row) => {
      row.classList.toggle('is-selected', row.dataset.settingKey === focusedSettingKey);
    });
    updateSettingsInspector();
  }

  settingsBackdrop.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const tab = tabBtn.dataset.tab as SettingsTab;
      if (tab === activeSettingsTab) return;
      callbacks.onPlaySound('select');
      activeSettingsTab = tab;
      settingsBackdrop.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.tab === tab);
      });
      confirmResetAll = false;
      resetAllBtn.innerHTML = `${renderIcon('reset')}<span>Reset all settings</span>`;
      resetAllBtn.classList.remove('is-danger');
      renderSettingsRows();
    });
  });

  inspResetBtn.addEventListener('click', () => {
    callbacks.onPlaySound('confirm');
    store.resetSetting(focusedSettingKey);
    renderSettingsRows();
  });

  resetAllBtn.addEventListener('click', () => {
    if (!confirmResetAll) {
      confirmResetAll = true;
      callbacks.onPlaySound('warning');
      resetAllBtn.innerHTML = `${renderIcon('warning')}<span>Confirm reset all</span>`;
      resetAllBtn.classList.add('is-danger');
      return;
    }
    confirmResetAll = false;
    resetAllBtn.innerHTML = `${renderIcon('reset')}<span>Reset all settings</span>`;
    resetAllBtn.classList.remove('is-danger');
    callbacks.onPlaySound('confirm');
    store.resetAllSettings();
    renderSettingsRows();
  });

  settingsBackBtn.addEventListener('click', () => {
    callbacks.onPlaySound('back');
    callbacks.onCloseSubscreen();
  });

  // Controls references & rendering
  const controlsRowsEl = mustEl(controlsBackdrop, '[data-role="controls-rows"]');
  const controlsCamLabel = mustEl(controlsBackdrop, '[data-role="controls-camera-label"]');
  const ctrlInspGroup = mustEl(controlsBackdrop, '[data-role="ctrl-insp-group"]');
  const ctrlInspTitle = mustEl(controlsBackdrop, '[data-role="ctrl-insp-title"]');
  const ctrlInspDesc = mustEl(controlsBackdrop, '[data-role="ctrl-insp-desc"]');
  const ctrlConflict = mustEl(controlsBackdrop, '[data-role="ctrl-conflict"]');
  const ctrlConflictText = mustEl(controlsBackdrop, '[data-role="ctrl-conflict-text"]');
  const controlsResetAllBtn = mustBtn(controlsBackdrop, '[data-role="controls-reset-all"]');
  const controlsBackBtn = mustBtn(controlsBackdrop, '[data-role="controls-back"]');

  function updateControlsInspector() {
    const fallbackMeta = CONTROL_ACTIONS[0];
    const meta = CONTROL_ACTIONS.find((a) => a.id === focusedAction) ?? fallbackMeta;
    if (!meta) return;
    ctrlInspGroup.textContent =
      meta.group === 'driving' ? 'Driving' : meta.group === 'view' ? 'View' : 'Session';
    ctrlInspTitle.textContent = meta.label;
    ctrlInspDesc.textContent = meta.lockedReason
      ? `${meta.description} ${meta.lockedReason}`
      : meta.description;
    if (conflictMessage) {
      ctrlConflict.hidden = false;
      ctrlConflictText.textContent = conflictMessage;
    } else {
      ctrlConflict.hidden = true;
    }
    const camMode = callbacks.getCurrentCamera();
    controlsCamLabel.textContent = `Current view: ${camMode === 'bonnet' ? 'Bonnet' : 'Chase'}`;
  }

  function renderControlsRows() {
    const bindings: KeyBindings = store.getBindings();
    controlsRowsEl.innerHTML = '';

    const groups: readonly { id: 'driving' | 'view' | 'session'; title: string }[] = [
      { id: 'driving', title: 'Driving' },
      { id: 'view', title: 'View' },
      { id: 'session', title: 'Session' },
    ];

    for (const grp of groups) {
      const heading = document.createElement('div');
      heading.className = 'ui-group-label';
      heading.textContent = grp.title;
      controlsRowsEl.appendChild(heading);

      for (const meta of CONTROL_ACTIONS.filter((a) => a.group === grp.id)) {
        const pair = bindings[meta.id];
        const row = document.createElement('div');
        row.className = `ui-row${meta.id === focusedAction ? ' is-selected' : ''}`;
        row.dataset.actionId = meta.id;

        const left = document.createElement('div');
        left.innerHTML = `<div class="ui-row-label">${meta.label}</div>`;

        const slots = document.createElement('div');
        slots.className = 'ui-bind-slots';

        if (meta.locked) {
          const badge = document.createElement('span');
          badge.className = 'ui-keycap';
          badge.textContent = formatKeyCode(pair[0]);
          const lockTag = document.createElement('span');
          lockTag.className = 'ui-row-sub';
          lockTag.textContent = 'System';
          slots.append(lockTag, badge);
        } else {
          for (const slotIdx of [0, 1] as const) {
            const code = pair[slotIdx];
            const isListening =
              listeningTarget?.action === meta.id && listeningTarget.slot === slotIdx;

            const bindBtn = document.createElement('button');
            bindBtn.type = 'button';
            bindBtn.className = `ui-bind-btn ui-focusable${isListening ? ' is-listening' : ''}`;
            bindBtn.textContent = isListening
              ? 'Press key\u2026'
              : code
                ? formatKeyCode(code)
                : 'Unbound';
            bindBtn.setAttribute(
              'aria-label',
              `${meta.label} ${slotIdx === 0 ? 'primary' : 'secondary'} key`,
            );

            bindBtn.addEventListener('focus', () => {
              focusedAction = meta.id;
              updateControlsRowSelection();
            });
            bindBtn.addEventListener('click', () => {
              focusedAction = meta.id;
              conflictMessage = null;
              listeningTarget = { action: meta.id, slot: slotIdx };
              callbacks.onPlaySound('select');
              renderControlsRows();
            });
            slots.appendChild(bindBtn);

            if (code !== null && (slotIdx === 1 || pair[1] !== null)) {
              const clearBtn = document.createElement('button');
              clearBtn.type = 'button';
              clearBtn.className = 'ui-bind-clear ui-focusable';
              clearBtn.title = 'Clear key';
              clearBtn.setAttribute('aria-label', `Clear ${meta.label} slot ${slotIdx + 1}`);
              clearBtn.textContent = '\u00d7';
              clearBtn.addEventListener('click', () => {
                focusedAction = meta.id;
                listeningTarget = null;
                conflictMessage = null;
                store.setBinding(meta.id, slotIdx, null);
                callbacks.onPlaySound('back');
                renderControlsRows();
              });
              slots.appendChild(clearBtn);
            } else {
              const spacer = document.createElement('span');
              spacer.className = 'ui-bind-spacer';
              spacer.setAttribute('aria-hidden', 'true');
              slots.appendChild(spacer);
            }
          }
        }

        row.addEventListener('mouseenter', () => {
          if (focusedAction !== meta.id) {
            focusedAction = meta.id;
            updateControlsRowSelection();
          }
        });

        row.append(left, slots);
        controlsRowsEl.appendChild(row);
      }
    }

    updateControlsInspector();
  }

  function updateControlsRowSelection() {
    controlsRowsEl.querySelectorAll<HTMLElement>('.ui-row').forEach((row) => {
      row.classList.toggle('is-selected', row.dataset.actionId === focusedAction);
    });
    updateControlsInspector();
  }

  controlsResetAllBtn.addEventListener('click', () => {
    listeningTarget = null;
    conflictMessage = null;
    callbacks.onPlaySound('confirm');
    store.resetAllBindings();
    renderControlsRows();
  });

  controlsBackBtn.addEventListener('click', () => {
    listeningTarget = null;
    conflictMessage = null;
    callbacks.onPlaySound('back');
    callbacks.onCloseSubscreen();
  });

  // Pause summary DOM
  const sumLaps = mustEl(pauseBackdrop, '[data-role="sum-laps"]');
  const sumBest = mustEl(pauseBackdrop, '[data-role="sum-best"]');
  const sumLast = mustEl(pauseBackdrop, '[data-role="sum-last"]');
  const sumTime = mustEl(pauseBackdrop, '[data-role="sum-time"]');
  const sumDist = mustEl(pauseBackdrop, '[data-role="sum-dist"]');
  const sumCurr = mustEl(pauseBackdrop, '[data-role="sum-curr"]');
  const sumLog = mustEl(pauseBackdrop, '[data-role="sum-log"]');

  function updatePauseSummary(state: GameState) {
    const unit = store.getSettings().speedUnit;
    sumLaps.textContent = String(state.completedLaps);
    sumBest.textContent = formatLapTime(state.bestLapSeconds);
    sumLast.textContent = formatLapTime(state.lastLapSeconds);
    sumTime.textContent = formatSessionTime(state.elapsedSeconds);
    sumDist.textContent = formatDistance(state.distanceMetres, unit);
    sumCurr.textContent = formatLapTime(state.currentLapSeconds);

    const recent = state.lapHistory.slice(-4);
    if (recent.length === 0) {
      sumLog.hidden = true;
      sumLog.innerHTML = '';
    } else {
      sumLog.hidden = false;
      sumLog.innerHTML = recent
        .map((record) => {
          const isBest =
            state.bestLapSeconds !== null &&
            Math.abs(record.timeSeconds - state.bestLapSeconds) < 0.0005;
          return `<div class="ui-lap-log-row${isBest ? ' is-best' : ''}">
            <span>Lap ${record.lap}</span>
            <span class="tabular">${formatLapTime(record.timeSeconds)}</span>
          </div>`;
        })
        .join('');
    }
  }

  // Global keyboard handler for menus, rebinding capture, and Escape navigation.
  window.addEventListener('keydown', (event) => {
    if (currentScreen === 'race') return;

    if (currentScreen === 'controls' && listeningTarget) {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        listeningTarget = null;
        conflictMessage = null;
        callbacks.onPlaySound('back');
        renderControlsRows();
        return;
      }
      const res = store.setBinding(listeningTarget.action, listeningTarget.slot, event.code);
      if (res.ok) {
        listeningTarget = null;
        conflictMessage = null;
        callbacks.onPlaySound('confirm');
      } else {
        listeningTarget = null;
        conflictMessage = `${formatKeyCode(event.code)} is already bound to ${res.conflictLabel}`;
        callbacks.onPlaySound('warning');
      }
      renderControlsRows();
      return;
    }

    if (currentScreen === 'loading') {
      if ((event.code === 'Enter' || event.code === 'Space') && !skipBtn.hidden) {
        event.preventDefault();
        callbacks.onPlaySound('select');
        callbacks.onSkipLoading();
      }
      return;
    }

    if (event.code === 'Escape') {
      event.preventDefault();
      if (currentScreen === 'settings' || currentScreen === 'controls') {
        callbacks.onPlaySound('back');
        callbacks.onCloseSubscreen();
      } else if (currentScreen === 'pause') {
        callbacks.onPlaySound('back');
        callbacks.onResumeRace();
      }
      return;
    }

    // Up/Down menu navigation on Title and Pause lists
    if (
      (currentScreen === 'title' || currentScreen === 'pause') &&
      (event.code === 'ArrowUp' || event.code === 'ArrowDown')
    ) {
      const container = currentScreen === 'title' ? titleEl : pauseBackdrop;
      const items = Array.from(container.querySelectorAll<HTMLButtonElement>('.ui-menu-item'));
      if (items.length === 0) return;
      event.preventDefault();
      const activeIdx = items.indexOf(document.activeElement as HTMLButtonElement);
      const dir = event.code === 'ArrowDown' ? 1 : -1;
      const nextIdx = activeIdx < 0 ? 0 : (activeIdx + dir + items.length) % items.length;
      callbacks.onPlaySound('focus');
      items[nextIdx]?.focus();
    }
  });

  function focusInitialForScreen(screen: ScreenName) {
    requestAnimationFrame(() => {
      if (screen === 'title') {
        titleEl.querySelector<HTMLButtonElement>('[data-action="play"]')?.focus();
      } else if (screen === 'pause') {
        pauseBackdrop.querySelector<HTMLButtonElement>('[data-pause-action="resume"]')?.focus();
      } else if (screen === 'settings') {
        settingsBackBtn.focus();
      } else if (screen === 'controls') {
        controlsBackBtn.focus();
      }
    });
  }

  return {
    element: root,

    setScreen(screen) {
      currentScreen = screen;
      listeningTarget = null;
      conflictMessage = null;
      confirmResetAll = false;
      resetAllBtn.innerHTML = `${renderIcon('reset')}<span>Reset all settings</span>`;
      resetAllBtn.classList.remove('is-danger');

      loadingEl.hidden = screen !== 'loading';
      titleEl.hidden = screen !== 'title';
      pauseBackdrop.hidden = screen !== 'pause';
      settingsBackdrop.hidden = screen !== 'settings';
      controlsBackdrop.hidden = screen !== 'controls';

      if (screen === 'pause') {
        updatePauseSummary(callbacks.getGameState());
      } else if (screen === 'settings') {
        renderSettingsRows();
      } else if (screen === 'controls') {
        renderControlsRows();
      }

      if (screen !== 'race' && screen !== 'loading') {
        focusInitialForScreen(screen);
      }
    },

    setLoadingState(phaseLabel, progress01, canSkip) {
      const pct = Math.round(Math.max(0, Math.min(1, progress01)) * 100);
      loadingPhase.textContent = phaseLabel;
      loadingPct.textContent = `${pct}%`;
      loadingFill.style.transform = `scaleX(${(pct / 100).toFixed(3)})`;
      skipBtn.hidden = !canSkip;
    },

    refreshPauseSummary(state) {
      if (currentScreen === 'pause') {
        updatePauseSummary(state);
      }
    },

    refreshBindings() {
      if (currentScreen === 'controls') {
        renderControlsRows();
      }
    },

    isListeningForKey: () => listeningTarget !== null,
  };
}
