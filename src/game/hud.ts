import { CAR_TUNING } from '../core/car';
import type { GameState } from '../core/game';

function formatLapTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const remainder = clamped - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
}

function formatGear(gear: number): string {
  if (gear < 0) return 'R';
  const suffix = gear === 1 ? 'st' : gear === 2 ? 'nd' : gear === 3 ? 'rd' : 'th';
  return `${gear}${suffix}`;
}

export function createHud(trackName: string) {
  const titleEl = document.getElementById('track-name');
  const carNameEl = document.getElementById('car-name');
  const lapCountEl = document.getElementById('lap-count');
  const lapCurrentEl = document.getElementById('lap-current');
  const lapLastEl = document.getElementById('lap-last');
  const lapBestEl = document.getElementById('lap-best');
  const speedValueEl = document.getElementById('speed-value');
  const speedMetaEl = document.getElementById('speed-meta');

  if (titleEl) titleEl.textContent = trackName;
  if (carNameEl) carNameEl.textContent = CAR_TUNING.name;

  return {
    update(state: GameState) {
      if (lapCountEl) {
        lapCountEl.textContent = `Lap ${state.completedLaps + 1}`;
      }
      if (lapCurrentEl) {
        lapCurrentEl.textContent = formatLapTime(state.currentLapSeconds);
      }
      if (lapLastEl) {
        lapLastEl.hidden = state.lastLapSeconds === null;
        if (state.lastLapSeconds !== null) {
          lapLastEl.textContent = `Last ${formatLapTime(state.lastLapSeconds)}`;
        }
      }
      if (lapBestEl) {
        lapBestEl.textContent =
          state.bestLapSeconds === null ? 'Best —' : `Best ${formatLapTime(state.bestLapSeconds)}`;
      }
      if (speedValueEl) {
        const kmh = Math.round(Math.abs(state.car.speed) * 3.6);
        speedValueEl.textContent = `${kmh}`;
      }
      if (speedMetaEl) {
        speedMetaEl.textContent = `${formatGear(state.car.gear)} · km/h`;
      }
    },
  };
}
