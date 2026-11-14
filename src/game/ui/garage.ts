import { PAR_SECONDS } from '../../core/career';
import type { CarId, CarSpec } from '../../core/cars';
import { CAR_IDS, carName, CARS, STARTER_CAR_ID } from '../../core/cars';
import type { CarEstimates } from '../../core/estimates';
import type { CareerStore } from '../career';
import { renderCarSilhouette } from '../cars/silhouette';
import type { BayFrame } from '../showroom';
import { formatCredits, formatDistance, formatLapTime } from './format';
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
  /** True when a session with laps or time on the clock is paused behind the garage. */
  isSessionUnderway(): boolean;
  getEstimates(car: CarSpec): CarEstimates;
}

export interface GarageController {
  readonly element: HTMLElement;
  open(tab: GarageTab): void;
  close(): void;
  /** Handles a key press while the garage is the active screen. */
  handleKey(event: KeyboardEvent): void;
}

interface DialogAction {
  readonly label: string;
  readonly primary?: boolean;
  readonly danger?: boolean;
  readonly role: string;
  onSelect(): void;
}

const ORBIT_STEP = Math.PI / 12;
const LAYOUT_NAMES = { inline: 'inline', flat: 'flat', vee: 'V' } as const;
const CYLINDER_WORDS: Readonly<Record<number, string>> = { 4: 'four', 6: 'six', 8: 'eight' };

function engineSummary(car: CarSpec): string {
  const litres = (car.real.displacementCc / 1000).toFixed(1);
  const { engineLayout, cylinders } = car.real;
  const shape =
    engineLayout === 'vee'
      ? `V${cylinders}`
      : `${LAYOUT_NAMES[engineLayout]} ${CYLINDER_WORDS[cylinders] ?? String(cylinders)}`;
  return `${litres} L ${shape}`;
}

function whole(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function signed(value: number, digits: number, unit: string): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return 'Same';
  const text = Math.abs(rounded).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${rounded > 0 ? '+' : '\u2212'}${text} ${unit}`;
}

export function createGarage(
  career: CareerStore,
  settings: SettingsStore,
  callbacks: GarageCallbacks,
): GarageController {
  const root = document.createElement('section');
  root.className = 'ui-garage';
  root.setAttribute('aria-label', 'Garage and dealership');
  root.hidden = true;
  root.innerHTML = `
    <header class="ui-garage-top">
      <div class="ui-header">
        <div class="ui-header-eyebrow">${renderIcon('garage')}<span>Club Circuit · Career</span></div>
        <h2 class="ui-header-title" data-role="heading">Garage</h2>
      </div>
      <div class="ui-tabs" role="tablist" aria-label="Garage sections">
        <button type="button" class="ui-tab ui-focusable" role="tab" data-tab="garage">Garage</button>
        <button type="button" class="ui-tab ui-focusable" role="tab" data-tab="dealership">Dealership</button>
      </div>
      <div class="ui-garage-credits" aria-live="polite">
        <span class="ui-garage-credits-label">Credits</span>
        <span class="ui-garage-credits-value tabular" data-role="credits">0 cr</span>
      </div>
    </header>
    <div class="ui-garage-main">
      <nav class="ui-garage-list" data-role="list" aria-label="Cars"></nav>
      <div class="ui-garage-bay" data-role="bay" tabindex="0" role="img" aria-label="Car in the bay. Arrow keys turn and raise the view.">
        <div class="ui-garage-bay-hint">
          <kbd class="ui-keycap is-compact">Drag</kbd> or
          <kbd class="ui-keycap is-compact">Left</kbd><kbd class="ui-keycap is-compact">Right</kbd> turn the car
        </div>
      </div>
      <aside class="ui-garage-panel" data-role="panel" aria-live="polite"></aside>
    </div>
    <footer class="ui-garage-bar">
      <div class="ui-garage-view">
        <button type="button" class="ui-btn ui-focusable" data-role="turn-left" aria-label="Turn view left">${renderIcon('chevron-left')}<span>Turn</span></button>
        <button type="button" class="ui-btn ui-focusable" data-role="turn-right" aria-label="Turn view right"><span>Turn</span>${renderIcon('chevron-right')}</button>
        <button type="button" class="ui-btn ui-focusable" data-role="reset-view">${renderIcon('camera')}<span>Reset view</span></button>
      </div>
      <div class="ui-garage-notes">
        <span class="ui-notice" data-role="storage-notice" hidden>${renderIcon('warning')}<span data-role="storage-text"></span></span>
        <span class="ui-garage-reason" data-role="reason" role="status"></span>
      </div>
      <div class="ui-garage-actions">
        <button type="button" class="ui-btn ui-focusable" data-role="reset-career">${renderIcon('reset')}<span>Reset career</span></button>
        <button type="button" class="ui-btn is-primary ui-focusable" data-role="primary"></button>
        <button type="button" class="ui-btn ui-focusable" data-role="back">${renderIcon('chevron-left')}<span>Back</span></button>
      </div>
    </footer>
    <div class="ui-backdrop ui-garage-dialog-layer" data-role="dialog-layer" hidden>
      <section class="ui-panel ui-garage-dialog" role="dialog" aria-modal="true" aria-labelledby="garage-dialog-title">
        <h3 class="ui-header-title" id="garage-dialog-title" data-role="dialog-title"></h3>
        <div class="ui-header-rule"></div>
        <div class="ui-garage-dialog-body" data-role="dialog-body"></div>
        <div class="ui-garage-dialog-actions" data-role="dialog-actions"></div>
      </section>
    </div>
  `;

  const q = (role: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (!el) throw new Error(`Missing garage role: ${role}`);
    return el;
  };
  const button = (role: string) => q(role) as HTMLButtonElement;
  const heading = q('heading');
  const creditsEl = q('credits');
  const listEl = q('list');
  const bayEl = q('bay');
  const panelEl = q('panel');
  const reasonEl = q('reason');
  const storageNotice = q('storage-notice');
  const storageText = q('storage-text');
  const primaryBtn = button('primary');
  const resetCareerBtn = button('reset-career');
  const backBtn = button('back');
  const dialogLayer = q('dialog-layer');
  const dialogTitle = q('dialog-title');
  const dialogBody = q('dialog-body');
  const dialogActions = q('dialog-actions');
  const tabButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tab]'));

  let tab: GarageTab = 'garage';
  let selected: CarId = career.get().equipped;
  let isOpen = false;
  let dialogOpen = false;
  let dialogCancel: (() => void) | null = null;
  let returnFocus: HTMLElement | null = null;

  function visibleCars(): CarId[] {
    const owned = career.get().owned;
    return CAR_IDS.filter((id) => owned.includes(id) === (tab === 'garage'));
  }

  function reportBay() {
    if (!isOpen) return;
    const rect = bayEl.getBoundingClientRect();
    callbacks.onBayFrame({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  }

  function specRows(rows: readonly (readonly [string, string])[]): string {
    return rows
      .map(
        ([label, value]) =>
          `<div class="ui-garage-spec"><span>${label}</span><span class="tabular">${value}</span></div>`,
      )
      .join('');
  }

  function renderPanel() {
    const state = career.get();
    const cars = visibleCars();
    if (cars.length === 0) {
      panelEl.innerHTML = `
        <h3 class="ui-garage-panel-title">Dealership empty</h3>
        <p class="ui-garage-panel-sub">Every car on sale is already in your garage.</p>`;
      return;
    }
    const car = CARS[selected];
    const { real } = car;
    const estimates = callbacks.getEstimates(car);
    const unit = settings.getSettings().speedUnit;
    const speed = (kmh: number) =>
      unit === 'mph' ? `${whole(kmh * 0.621371)} mph` : `${whole(kmh)} km/h`;
    const maker = specRows([
      [
        'Power',
        `${whole(real.powerKw)} kW (${whole(real.powerKw * 1.35962)} PS) at ${whole(real.powerRpm)} rpm`,
      ],
      ['Torque', `${whole(real.torqueNm)} Nm at ${whole(real.torqueRpm)} rpm`],
      ['Kerb mass', `${whole(real.massKg)} kg`],
      ['Layout', `${real.enginePosition === 'mid' ? 'Mid' : 'Front'} engine, rear drive`],
      ['Engine', engineSummary(car)],
      ['Gearbox', `${real.gearRatios.length}-speed manual`],
      ['Top speed', speed(real.topSpeedKmh)],
      [
        'Length, width, height',
        `${whole(real.length * 1000)} × ${whole(real.width * 1000)} × ${whole(real.height * 1000)} mm`,
      ],
    ]);
    const inGame = specRows([
      ['0 to 100 km/h', `${estimates.zeroTo100Seconds.toFixed(2)} s`],
      ['Bot lap, standing start', formatLapTime(estimates.botLapSeconds)],
      ['Par lap for the best-lap bonus', formatLapTime(PAR_SECONDS[car.id])],
    ]);

    let last: string;
    if (tab === 'garage') {
      const record = state.records[car.id];
      last = `
        <h4 class="ui-garage-section">Your records</h4>
        ${specRows([
          ['Best lap', formatLapTime(record.bestLapSeconds)],
          ['Distance driven', formatDistance(record.distanceMetres, unit)],
        ])}`;
    } else {
      const current = CARS[state.equipped];
      const currentEstimates = callbacks.getEstimates(current);
      const lapDiff =
        estimates.botLapSeconds !== null && currentEstimates.botLapSeconds !== null
          ? signed(estimates.botLapSeconds - currentEstimates.botLapSeconds, 2, 's')
          : '\u2014';
      last = `
        <h4 class="ui-garage-section">Against your ${carName(current)}</h4>
        ${specRows([
          ['Power', signed(real.powerKw - current.real.powerKw, 0, 'kW')],
          ['Kerb mass', signed(real.massKg - current.real.massKg, 0, 'kg')],
          [
            '0 to 100 km/h in game',
            signed(estimates.zeroTo100Seconds - currentEstimates.zeroTo100Seconds, 2, 's'),
          ],
          ['Bot lap in game', lapDiff],
        ])}`;
    }

    panelEl.innerHTML = `
      <div class="ui-garage-panel-head">
        <span class="ui-garage-panel-year tabular">${car.year}</span>
        <h3 class="ui-garage-panel-title">${carName(car)}</h3>
        <p class="ui-garage-panel-sub">${car.chassis} · ${car.variant} · ${car.visual.paintName}</p>
      </div>
      <h4 class="ui-garage-section">Manufacturer data</h4>
      ${maker}
      <h4 class="ui-garage-section">In this game <span>measured by running the simulation</span></h4>
      ${inGame}
      ${last}`;
  }

  function renderList() {
    const state = career.get();
    const cars = visibleCars();
    listEl.innerHTML = '';
    if (cars.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ui-garage-empty';
      empty.textContent = 'Every car is in your garage.';
      listEl.appendChild(empty);
      return;
    }
    for (const id of cars) {
      const car = CARS[id];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `ui-garage-car ui-focusable${id === selected ? ' is-selected' : ''}`;
      row.dataset.carId = id;
      row.setAttribute('aria-pressed', String(id === selected));
      const tag =
        tab === 'dealership'
          ? `<span class="ui-garage-car-tag tabular">${formatCredits(car.price)}</span>`
          : id === state.equipped
            ? `<span class="ui-garage-car-tag is-equipped">${renderIcon('check')}Equipped</span>`
            : '<span class="ui-garage-car-tag">Owned</span>';
      row.innerHTML = `
        ${renderCarSilhouette(car)}
        <span class="ui-garage-car-text">
          <span class="ui-garage-car-name">${car.year} ${carName(car)}</span>
          <span class="ui-garage-car-sub">${car.chassis} · ${engineSummary(car)}</span>
        </span>
        ${tag}`;
      row.addEventListener('click', () => {
        if (selected !== id) callbacks.onPlaySound('select');
        select(id);
      });
      listEl.appendChild(row);
    }
  }

  function renderActions() {
    const state = career.get();
    const cars = visibleCars();
    creditsEl.textContent = formatCredits(state.credits);
    heading.textContent = tab === 'garage' ? 'Garage' : 'Dealership';
    resetCareerBtn.hidden = tab !== 'garage';
    primaryBtn.classList.remove('is-unavailable');
    primaryBtn.removeAttribute('aria-disabled');
    primaryBtn.disabled = false;
    primaryBtn.hidden = cars.length === 0;
    reasonEl.textContent = '';
    reasonEl.classList.remove('is-denied');
    if (cars.length === 0) return;
    const car = CARS[selected];
    if (tab === 'garage') {
      const equipped = state.equipped === selected;
      primaryBtn.innerHTML = equipped
        ? `${renderIcon('check')}<span>Equipped</span>`
        : `${renderIcon('play')}<span>Equip ${carName(car)}</span>`;
      primaryBtn.disabled = equipped;
      if (equipped) reasonEl.textContent = 'This is the car you drive.';
    } else {
      primaryBtn.innerHTML = `${renderIcon('tag')}<span>Buy · ${formatCredits(car.price)}</span>`;
      const shortfall = car.price - state.credits;
      if (shortfall > 0) {
        // Stays focusable so the reason can be reached and read; activating it changes nothing.
        primaryBtn.classList.add('is-unavailable');
        primaryBtn.setAttribute('aria-disabled', 'true');
        reasonEl.textContent = `${formatCredits(shortfall)} short. Complete laps to earn credits.`;
      }
    }
    const storageOk = career.isStorageAvailable();
    storageNotice.hidden = storageOk && !career.wasRepaired();
    storageText.textContent = !storageOk
      ? 'Browser storage is unavailable; progress will not be kept.'
      : 'Saved progress could not be read in full and was repaired.';
  }

  function render() {
    const cars = visibleCars();
    const first = cars[0];
    if (first && !cars.includes(selected)) selected = first;
    for (const button of tabButtons) {
      const active = button.dataset.tab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    }
    renderList();
    renderPanel();
    renderActions();
    callbacks.onShowCar(cars.length > 0 ? CARS[selected] : CARS[career.get().equipped]);
  }

  function select(id: CarId) {
    selected = id;
    render();
    listEl.querySelector<HTMLElement>(`[data-car-id="${id}"]`)?.focus();
  }

  function setTab(next: GarageTab) {
    tab = next;
    if (next === 'garage') selected = career.get().equipped;
    render();
  }

  function closeDialog() {
    dialogOpen = false;
    dialogCancel = null;
    dialogLayer.hidden = true;
    returnFocus?.focus();
    returnFocus = null;
  }

  function openDialog(
    title: string,
    bodyHtml: string,
    actions: readonly DialogAction[],
    safeRole: string,
    onCancel: () => void,
  ) {
    if (!dialogOpen) returnFocus = document.activeElement as HTMLElement | null;
    dialogOpen = true;
    dialogCancel = onCancel;
    dialogTitle.textContent = title;
    dialogBody.innerHTML = bodyHtml;
    dialogActions.innerHTML = '';
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ui-btn ui-focusable${action.primary ? ' is-primary' : ''}${action.danger ? ' is-danger' : ''}`;
      button.dataset.dialogAction = action.role;
      button.textContent = action.label;
      button.addEventListener('click', () => {
        action.onSelect();
      });
      dialogActions.appendChild(button);
    }
    dialogLayer.hidden = false;
    dialogActions.querySelector<HTMLElement>(`[data-dialog-action="${safeRole}"]`)?.focus();
  }

  function cancelDialog() {
    callbacks.onPlaySound('back');
    closeDialog();
  }

  function doEquip(id: CarId) {
    const result = career.equip(id);
    if (!result.ok) {
      callbacks.onPlaySound('warning');
      return;
    }
    callbacks.onPlaySound('confirm');
    callbacks.onEquipped(id);
    tab = 'garage';
    selected = id;
    render();
  }

  function requestEquip(id: CarId) {
    const car = CARS[id];
    if (!callbacks.isSessionUnderway()) {
      doEquip(id);
      return;
    }
    openDialog(
      `Equip ${carName(car)}`,
      `<p>Your paused session ends and a new one starts on the grid in the ${car.year} ${carName(car)}. Credits already earned are kept.</p>`,
      [
        { label: 'Cancel', role: 'cancel', onSelect: cancelDialog },
        {
          label: 'Equip and restart',
          role: 'confirm',
          primary: true,
          onSelect: () => {
            closeDialog();
            doEquip(id);
          },
        },
      ],
      'cancel',
      cancelDialog,
    );
  }

  function requestPurchase(id: CarId) {
    const car = CARS[id];
    const balance = career.get().credits;
    if (balance < car.price) {
      callbacks.onPlaySound('denied');
      reasonEl.textContent = `${formatCredits(car.price - balance)} short. Complete laps to earn credits.`;
      reasonEl.classList.remove('is-denied');
      // Restart the highlight so repeated presses are each acknowledged.
      reasonEl.getBoundingClientRect();
      reasonEl.classList.add('is-denied');
      return;
    }
    callbacks.onPlaySound('select');
    openDialog(
      `Buy ${car.year} ${carName(car)}`,
      `<div class="ui-garage-receipt">
        ${specRows([
          ['Car', `${car.year} ${carName(car)}`],
          ['Price', formatCredits(car.price)],
          ['Balance now', formatCredits(balance)],
          ['Balance after', formatCredits(balance - car.price)],
        ])}
      </div>
      <p>The car is added to your garage. Your current car stays equipped until you change it.</p>`,
      [
        { label: 'Cancel', role: 'cancel', onSelect: cancelDialog },
        {
          label: `Confirm purchase · ${formatCredits(car.price)}`,
          role: 'confirm',
          primary: true,
          onSelect: () => {
            const result = career.purchase(id);
            if (!result.ok) {
              callbacks.onPlaySound('denied');
              closeDialog();
              render();
              return;
            }
            callbacks.onPlaySound('purchase');
            render();
            const keep = () => {
              callbacks.onPlaySound('back');
              closeDialog();
            };
            openDialog(
              `${carName(car)} purchased`,
              `<p>The ${car.year} ${carName(car)} is in your garage. Balance ${formatCredits(career.get().credits)}.</p>`,
              [
                { label: 'Keep current car', role: 'cancel', onSelect: keep },
                {
                  label: 'Equip now',
                  role: 'confirm',
                  primary: true,
                  onSelect: () => {
                    closeDialog();
                    requestEquip(id);
                  },
                },
              ],
              'cancel',
              keep,
            );
          },
        },
      ],
      'cancel',
      cancelDialog,
    );
  }

  function requestReset() {
    callbacks.onPlaySound('select');
    const state = career.get();
    const lost = state.owned.length - 1;
    openDialog(
      'Reset career',
      `<p>This removes ${formatCredits(state.credits)}, ${lost === 1 ? '1 purchased car' : `${lost} purchased cars`} and every best lap and distance record. You keep the ${carName(CARS[STARTER_CAR_ID])}. Settings and key bindings are not changed.</p>
       <p>This cannot be undone.</p>`,
      [
        { label: 'Cancel', role: 'cancel', onSelect: cancelDialog },
        {
          label: 'Reset career',
          role: 'confirm',
          danger: true,
          onSelect: () => {
            const before = career.get().equipped;
            career.reset();
            callbacks.onPlaySound('confirm');
            closeDialog();
            if (career.get().equipped !== before) callbacks.onEquipped(career.get().equipped);
            setTab('garage');
          },
        },
      ],
      'cancel',
      cancelDialog,
    );
  }

  for (const button of tabButtons) {
    button.addEventListener('click', () => {
      const next = button.dataset.tab === 'dealership' ? 'dealership' : 'garage';
      if (next !== tab) callbacks.onPlaySound('select');
      setTab(next);
    });
  }
  primaryBtn.addEventListener('click', () => {
    if (visibleCars().length === 0) return;
    if (tab === 'garage') requestEquip(selected);
    else requestPurchase(selected);
  });
  resetCareerBtn.addEventListener('click', requestReset);
  backBtn.addEventListener('click', () => {
    callbacks.onPlaySound('back');
    callbacks.onClose();
  });
  q('turn-left').addEventListener('click', () => {
    callbacks.onOrbit(-ORBIT_STEP, 0);
  });
  q('turn-right').addEventListener('click', () => {
    callbacks.onOrbit(ORBIT_STEP, 0);
  });
  q('reset-view').addEventListener('click', () => {
    callbacks.onResetView();
  });

  // Drag in the bay to orbit.
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

  window.addEventListener('resize', reportBay);
  career.subscribe(() => {
    if (isOpen) render();
  });
  settings.subscribe(() => {
    if (isOpen) renderPanel();
  });

  return {
    element: root,

    open(next) {
      isOpen = true;
      root.hidden = false;
      tab = next;
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
      if (dialogOpen) closeDialog();
      callbacks.onBayFrame(null);
    },

    handleKey(event) {
      if (dialogOpen) {
        if (event.code === 'Escape') {
          event.preventDefault();
          dialogCancel?.();
        } else if (event.code === 'Tab') {
          // Keep focus inside the dialog.
          const buttons = Array.from(dialogActions.querySelectorAll<HTMLElement>('button'));
          const index = buttons.indexOf(document.activeElement as HTMLElement);
          const step = event.shiftKey ? -1 : 1;
          event.preventDefault();
          buttons[(index + step + buttons.length) % buttons.length]?.focus();
        } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
          const buttons = Array.from(dialogActions.querySelectorAll<HTMLElement>('button'));
          const index = buttons.indexOf(document.activeElement as HTMLElement);
          const step = event.code === 'ArrowLeft' ? -1 : 1;
          event.preventDefault();
          buttons[Math.max(0, Math.min(buttons.length - 1, index + step))]?.focus();
        }
        return;
      }
      if (event.code === 'Escape') {
        event.preventDefault();
        callbacks.onPlaySound('back');
        callbacks.onClose();
        return;
      }
      const inBay = document.activeElement === bayEl;
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault();
        callbacks.onOrbit(event.code === 'ArrowLeft' ? -ORBIT_STEP : ORBIT_STEP, 0);
        return;
      }
      if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        event.preventDefault();
        if (inBay) {
          callbacks.onOrbit(0, event.code === 'ArrowUp' ? 0.1 : -0.1);
          return;
        }
        const cars = visibleCars();
        if (cars.length === 0) return;
        const index = cars.indexOf(selected);
        const step = event.code === 'ArrowDown' ? 1 : -1;
        const next = cars[(index + step + cars.length) % cars.length];
        if (next && next !== selected) {
          callbacks.onPlaySound('focus');
          select(next);
        }
      }
    },
  };
}
