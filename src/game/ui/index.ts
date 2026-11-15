import './tokens.css';
import './base.css';
import './hud.css';
import './screens.css';
import './garage.css';

import type { Track } from '../../core/track';
import type { CareerStore } from '../career';
import {
  createGarage,
  type GarageCallbacks,
  type GarageController,
  type GarageTab,
} from './garage';
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
  readonly garage: GarageController;
  screen(): ScreenName;
  setScreen(next: ScreenName): void;
  openSubscreen(sub: 'settings' | 'controls'): void;
  openGarage(tab: GarageTab): void;
  closeSubscreen(): void;
  returnFromSubscreenTarget(): 'title' | 'pause';
}

export type UiCallbacks = Omit<
  ScreensCallbacks,
  'onOpenSettings' | 'onOpenControls' | 'onOpenGarage' | 'onCloseSubscreen'
> &
  Omit<GarageCallbacks, 'onPlaySound' | 'onClose'>;

export function createUi(track: Track, career: CareerStore, callbacks: UiCallbacks): UiController {
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
    if (activeScreen === 'garage' && next !== 'garage') garage.close();
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

  const openGarage = (tab: GarageTab) => {
    if (activeScreen === 'title' || activeScreen === 'pause') {
      subscreenReturn = activeScreen;
    }
    setScreen('garage');
    garage.open(tab);
  };

  const closeSubscreen = () => {
    setScreen(subscreenReturn);
  };

  const garage = createGarage(career, store, {
    ...callbacks,
    onClose: () => {
      closeSubscreen();
    },
  });

  const screens: ScreensController = createScreens(
    store,
    {
      ...callbacks,
      onOpenSettings: () => {
        openSubscreen('settings');
      },
      onOpenControls: () => {
        openSubscreen('controls');
      },
      onOpenGarage: openGarage,
      onCloseSubscreen: closeSubscreen,
    },
    garage,
  );

  root.append(hud.element, screens.element, garage.element);

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
    garage,
    screen: () => activeScreen,
    setScreen,
    openSubscreen,
    openGarage,
    closeSubscreen,
    returnFromSubscreenTarget: () => subscreenReturn,
  };
}
