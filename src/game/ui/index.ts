import './tokens.css';
import './base.css';
import './hud.css';
import './screens.css';

import type { Track } from '../../core/track';
import { createHud, type HudController } from './hud';
import {
  createScreens,
  type ScreenName,
  type ScreensCallbacks,
  type ScreensController,
} from './screens';
import { createSettingsStore, isReducedMotionActive, type SettingsStore } from './settings';

export type { ScreenName, UiSoundKind } from './screens';
export {
  type ControlAction,
  type GameSettings,
  type KeyBindings,
  type SettingsStore,
  isReducedMotionActive,
} from './settings';

export interface UiController {
  readonly store: SettingsStore;
  readonly hud: HudController;
  readonly screens: ScreensController;
  screen(): ScreenName;
  setScreen(next: ScreenName): void;
  openSubscreen(sub: 'settings' | 'controls'): void;
  closeSubscreen(): void;
  returnFromSubscreenTarget(): 'title' | 'pause';
}

export function createUi(
  track: Track,
  callbacks: Omit<ScreensCallbacks, 'onOpenSettings' | 'onOpenControls' | 'onCloseSubscreen'>,
): UiController {
  const store = createSettingsStore();
  const root = document.createElement('div');
  root.className = 'ui-root';
  document.body.appendChild(root);

  let activeScreen: ScreenName = 'loading';
  let subscreenReturn: 'title' | 'pause' = 'title';

  const hud = createHud(track);

  const applyMotionAndSettings = () => {
    const settings = store.getSettings();
    const bindings = store.getBindings();
    document.documentElement.dataset.reducedMotion = String(isReducedMotionActive(settings));
    hud.applySettings(settings, bindings);
  };

  const setScreen = (next: ScreenName) => {
    activeScreen = next;
    hud.setVisible(next === 'race' || next === 'pause');
    screens.setScreen(next);
  };

  const openSubscreen = (sub: 'settings' | 'controls') => {
    if (activeScreen === 'title' || activeScreen === 'pause') {
      subscreenReturn = activeScreen;
    }
    setScreen(sub);
  };

  const closeSubscreen = () => {
    setScreen(subscreenReturn);
  };

  const screens: ScreensController = createScreens(store, {
    ...callbacks,
    onOpenSettings: () => {
      openSubscreen('settings');
    },
    onOpenControls: () => {
      openSubscreen('controls');
    },
    onCloseSubscreen: closeSubscreen,
  });

  root.append(hud.element, screens.element);

  applyMotionAndSettings();
  store.subscribe(() => {
    applyMotionAndSettings();
    screens.refreshBindings();
  });

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    mql.addEventListener('change', applyMotionAndSettings);
  }

  return {
    store,
    hud,
    screens,
    screen: () => activeScreen,
    setScreen,
    openSubscreen,
    closeSubscreen,
    returnFromSubscreenTarget: () => subscreenReturn,
  };
}
