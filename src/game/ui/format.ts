export type SpeedUnit = 'kmh' | 'mph';

const MINUS = '\u2212';

/** Format lap or session time as `m:ss.mmm` (or `—` when null). */
export function formatLapTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '\u2014';
  const clamped = Math.max(0, seconds);
  const totalMillis = Math.round(clamped * 1000);
  const minutes = Math.floor(totalMillis / 60000);
  const secs = Math.floor((totalMillis % 60000) / 1000);
  const millis = totalMillis % 1000;
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** Format sector duration as `ss.mmm` (or `—` when null). */
export function formatSectorTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '\u2014';
  const clamped = Math.max(0, seconds);
  return clamped.toFixed(3);
}

/** Format session elapsed clock as `mm:ss`. */
export function formatSessionTime(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** Format delta with explicit `+` or real Unicode minus `−` (`−0.108` / `+0.412`). */
export function formatDelta(deltaSeconds: number | null): string {
  if (deltaSeconds === null || !Number.isFinite(deltaSeconds)) return '\u2014';
  const abs = Math.abs(deltaSeconds);
  const sign = deltaSeconds < -0.0005 ? MINUS : '+';
  return `${sign}${abs.toFixed(3)}`;
}

/** Convert m/s to integer speed in the chosen unit. */
export function convertSpeed(speedMetersPerSecond: number, unit: SpeedUnit): number {
  const factor = unit === 'mph' ? 2.23693629 : 3.6;
  return Math.round(Math.abs(speedMetersPerSecond) * factor);
}

export function speedUnitLabel(unit: SpeedUnit): string {
  return unit === 'mph' ? 'mph' : 'km/h';
}

/** Format distance driven in metres or km/mi. */
export function formatDistance(metres: number, unit: SpeedUnit): string {
  const safe = Math.max(0, metres);
  if (unit === 'mph') {
    const miles = safe / 1609.344;
    if (miles < 0.25) return `${Math.round(safe * 3.28084)} ft`;
    return `${miles.toFixed(2)} mi`;
  }
  if (safe < 1000) return `${Math.round(safe)} m`;
  return `${(safe / 1000).toFixed(2)} km`;
}

/** Format gear (`R` or `1`..`5`). */
export function formatGear(gear: number): string {
  if (gear < 0) return 'R';
  return `${Math.max(1, Math.round(gear))}`;
}

/** Format engine RPM as clean integer rounded to nearest 10 to prevent jitter. */
export function formatRpm(rpm: number): string {
  const rounded = Math.round(Math.max(0, rpm) / 10) * 10;
  return `${rounded}`;
}

/** Human-readable keycap label for a KeyboardEvent.code string. */
export function formatKeyCode(code: string | null): string {
  if (!code) return 'Unbound';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Enter: 'Enter',
    NumpadEnter: 'Num Enter',
    ShiftLeft: 'L Shift',
    ShiftRight: 'R Shift',
    ControlLeft: 'L Ctrl',
    ControlRight: 'R Ctrl',
    AltLeft: 'L Alt',
    AltRight: 'R Alt',
    Tab: 'Tab',
    Backspace: 'Back',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
  };
  return map[code] ?? code;
}

/** Whole credits with thousands separators and the unit, e.g. `4,500 cr`. */
export function formatCredits(credits: number): string {
  return `${Math.round(credits).toLocaleString('en-US')} cr`;
}
