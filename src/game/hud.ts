import type { GameState } from '../core/game';

function formatLapTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const minutes = Math.floor(clamped / 60);
  const remainder = clamped - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
}

export function createHud(trackName: string) {
  const titleEl = document.getElementById('track-name');
  const lapCountEl = document.getElementById('lap-count');
  const lapCurrentEl = document.getElementById('lap-current');
  const lapBestEl = document.getElementById('lap-best');
  const speedValueEl = document.getElementById('speed-value');
  const speedUnitEl = document.getElementById('speed-unit');

  if (titleEl) titleEl.textContent = trackName;

  return {
    update(state: GameState) {
      if (lapCountEl) {
        lapCountEl.textContent = `Lap ${state.completedLaps + 1}`;
      }
      if (lapCurrentEl) {
        lapCurrentEl.textContent = formatLapTime(state.currentLapSeconds);
      }
      if (lapBestEl) {
        lapBestEl.textContent =
          state.bestLapSeconds === null ? 'Best —' : `Best ${formatLapTime(state.bestLapSeconds)}`;
      }
      if (speedValueEl) {
        const kmh = Math.round(Math.abs(state.car.speed) * 3.6);
        speedValueEl.textContent = `${kmh}`;
      }
      if (speedUnitEl) {
        speedUnitEl.textContent = state.car.speed < -0.3 ? 'km/h R' : 'km/h';
      }
    },
  };
}
