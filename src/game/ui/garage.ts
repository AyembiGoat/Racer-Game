import type { CarId, CarSpec } from '../../core/cars';
import { CAR_IDS, carName, CARS } from '../../core/cars';
import type { CarEstimates } from '../../core/estimates';
import type { CareerStore } from '../career';
import type { BayFrame } from '../showroom';
import { formatCredits } from './format';
import { renderIcon } from './icons';
import type { SettingsStore } from './settings';

export type GarageTab = 'garage' | 'dealership';
type GarageSound = 'focus' | 'select' | 'back' | 'confirm' | 'warning' | 'purchase' | 'denied';

export interface GarageCallbacks {
  onPlaySound(kind: GarageSound): void;
  onClose(): void;
  /** The car to stand in the bay. */
  onShowCar(car: CarSpec): void;
  onOrbit(yawDelta: number, pitchDelta: number): void;
  onResetView(): void;
  onBayFrame(frame: BayFrame | null): void;
  /** The equipped car changed; the session restarts on the grid in it. */
  onEquipped(carId: CarId): void;
  getEstimates(car: CarSpec): CarEstimates;
}

export interface GarageController {
  readonly element: HTMLElement;
  open(tab: GarageTab): void;
  close(): void;
  /** Handles a key press while the garage is the active screen. */
  handleKey(event: KeyboardEvent): void;
}

const ORBIT_STEP = Math.PI / 12;

function whole(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** One screen for every car: pick one, look at it, buy it or drive it. */
export function createGarage(
  career: CareerStore,
  settings: SettingsStore,
  callbacks: GarageCallbacks,
): GarageController {
  const root = document.createElement('section');
  root.className = 'ui-garage';
  root.setAttribute('aria-label', 'Garage');
  root.hidden = true;
  root.innerHTML = `
    <div class="ui-garage-bay" data-role="bay" aria-hidden="true"></div>
    <nav class="ui-garage-list" data-role="list" aria-label="Cars"></nav>
    <div class="ui-garage-credits tabular" data-role="credits"></div>
    <div class="ui-garage-info">
      <h2 class="ui-garage-name" data-role="name"></h2>
      <dl class="ui-garage-stats" data-role="stats"></dl>
    </div>
    <div class="ui-garage-actions">
      <button type="button" class="ui-btn ui-focusable" data-role="back">${renderIcon('chevron-left')}<span>Back</span></button>
      <button type="button" class="ui-btn is-primary ui-focusable" data-role="primary"></button>
    </div>
  `;

  const q = (role: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (!el) throw new Error(`Missing garage role: ${role}`);
    return el;
  };
  const creditsEl = q('credits');
  const listEl = q('list');
  const bayEl = q('bay');
  const nameEl = q('name');
  const statsEl = q('stats');
  const primaryBtn = q('primary') as HTMLButtonElement;
  const backBtn = q('back') as HTMLButtonElement;

  let selected: CarId = career.get().equipped;
  let isOpen = false;

  function reportBay() {
    if (!isOpen) return;
    const rect = bayEl.getBoundingClientRect();
    callbacks.onBayFrame({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  }

  function render() {
    const state = career.get();
    const car = CARS[selected];
    const owned = state.owned.includes(selected);
    const equipped = state.equipped === selected;
    creditsEl.textContent = career.isUnlimited() ? '∞ cr' : formatCredits(state.credits);

    listEl.innerHTML = '';
    for (const id of CAR_IDS) {
      const item = CARS[id];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `ui-garage-car ui-focusable${id === selected ? ' is-selected' : ''}`;
      row.dataset.carId = id;
      row.setAttribute('aria-pressed', String(id === selected));
      const tag =
        id === state.equipped
          ? `<span class="ui-garage-car-tag is-equipped">${renderIcon('check')}</span>`
          : state.owned.includes(id)
            ? ''
            : `<span class="ui-garage-car-tag tabular">${formatCredits(item.price)}</span>`;
      row.innerHTML = `<span class="ui-garage-car-name">${carName(item)}</span>${tag}`;
      row.addEventListener('click', () => {
        if (selected !== id) callbacks.onPlaySound('select');
        select(id);
      });
      listEl.appendChild(row);
    }

    const estimates = callbacks.getEstimates(car);
    const mph = settings.getSettings().speedUnit === 'mph';
    const top = mph
      ? `${whole(estimates.topSpeedKmh * 0.621371)} mph`
      : `${whole(estimates.topSpeedKmh)} km/h`;
    const stats: readonly (readonly [string, string])[] = [
      ['Power', `${whole(car.real.powerKw)} kW`],
      ['Weight', `${whole(car.real.massKg)} kg`],
      ['0–100', `${estimates.zeroTo100Seconds.toFixed(1)} s`],
      ['Top speed', top],
    ];
    nameEl.textContent = `${car.year} ${carName(car)}`;
    statsEl.innerHTML = stats
      .map(([label, value]) => `<div><dt>${label}</dt><dd class="tabular">${value}</dd></div>`)
      .join('');

    primaryBtn.disabled = equipped;
    primaryBtn.classList.remove('is-unavailable');
    primaryBtn.removeAttribute('aria-disabled');
    if (equipped) {
      primaryBtn.innerHTML = `${renderIcon('check')}<span>Equipped</span>`;
    } else if (owned) {
      primaryBtn.innerHTML = `${renderIcon('play')}<span>Equip</span>`;
    } else {
      primaryBtn.innerHTML = `${renderIcon('tag')}<span>Buy ${formatCredits(car.price)}</span>`;
      if (state.credits < car.price) {
        primaryBtn.classList.add('is-unavailable');
        primaryBtn.setAttribute('aria-disabled', 'true');
      }
    }
    callbacks.onShowCar(car);
  }

  function select(id: CarId) {
    selected = id;
    render();
    listEl.querySelector<HTMLElement>(`[data-car-id="${id}"]`)?.focus();
  }

  primaryBtn.addEventListener('click', () => {
    const state = career.get();
    if (state.owned.includes(selected)) {
      if (!career.equip(selected).ok) return;
      callbacks.onPlaySound('confirm');
      callbacks.onEquipped(selected);
    } else if (career.purchase(selected).ok) {
      callbacks.onPlaySound('purchase');
    } else {
      callbacks.onPlaySound('denied');
      primaryBtn.classList.remove('is-denied');
      primaryBtn.getBoundingClientRect();
      primaryBtn.classList.add('is-denied');
    }
    render();
  });
  backBtn.addEventListener('click', () => {
    callbacks.onPlaySound('back');
    callbacks.onClose();
  });

  // Drag in the bay to orbit; double-click to reset the view.
  let dragId: number | null = null;
  let dragX = 0;
  let dragY = 0;
  bayEl.addEventListener('pointerdown', (event) => {
    dragId = event.pointerId;
    dragX = event.clientX;
    dragY = event.clientY;
    bayEl.setPointerCapture(event.pointerId);
    bayEl.classList.add('is-dragging');
  });
  bayEl.addEventListener('pointermove', (event) => {
    if (dragId !== event.pointerId) return;
    callbacks.onOrbit((event.clientX - dragX) * 0.008, (event.clientY - dragY) * 0.005);
    dragX = event.clientX;
    dragY = event.clientY;
  });
  const endDrag = (event: PointerEvent) => {
    if (dragId !== event.pointerId) return;
    dragId = null;
    bayEl.classList.remove('is-dragging');
  };
  bayEl.addEventListener('pointerup', endDrag);
  bayEl.addEventListener('pointercancel', endDrag);
  bayEl.addEventListener('dblclick', () => {
    callbacks.onResetView();
  });

  window.addEventListener('resize', reportBay);
  career.subscribe(() => {
    if (isOpen) render();
  });
  settings.subscribe(() => {
    if (isOpen) render();
  });

  return {
    element: root,

    open() {
      isOpen = true;
      root.hidden = false;
      selected = career.get().equipped;
      render();
      reportBay();
      requestAnimationFrame(() => {
        reportBay();
        (listEl.querySelector<HTMLElement>('.is-selected') ?? backBtn).focus();
      });
    },

    close() {
      isOpen = false;
      root.hidden = true;
      callbacks.onBayFrame(null);
    },

    handleKey(event) {
      if (event.code === 'Escape') {
        event.preventDefault();
        callbacks.onPlaySound('back');
        callbacks.onClose();
      } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault();
        callbacks.onOrbit(event.code === 'ArrowLeft' ? -ORBIT_STEP : ORBIT_STEP, 0);
      } else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        event.preventDefault();
        const index = CAR_IDS.indexOf(selected);
        const step = event.code === 'ArrowDown' ? 1 : -1;
        const next = CAR_IDS[(index + step + CAR_IDS.length) % CAR_IDS.length];
        if (next && next !== selected) {
          callbacks.onPlaySound('focus');
          select(next);
        }
      } else if (event.code === 'Enter' && document.activeElement?.closest('.ui-garage-car')) {
        event.preventDefault();
        primaryBtn.click();
      }
    },
  };
}
