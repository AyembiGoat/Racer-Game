export type IconName =
  | 'play'
  | 'pause'
  | 'settings'
  | 'controls'
  | 'reset'
  | 'camera'
  | 'stopwatch'
  | 'flag'
  | 'warning'
  | 'check'
  | 'volume'
  | 'eye'
  | 'lock'
  | 'chevron-left'
  | 'chevron-right'
  | 'surface-offtrack'
  | 'surface-kerb'
  | 'slip'
  | 'garage'
  | 'tag';

const ICON_PATHS: Record<IconName, string> = {
  play: '<polygon points="7,5 19,12 7,19" />',
  pause: '<line x1="8" y1="5" x2="8" y2="19" /><line x1="16" y1="5" x2="16" y2="19" />',
  settings:
    '<circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />',
  controls:
    '<rect x="3" y="6" width="18" height="12" rx="2" /><line x1="7" y1="10" x2="7.01" y2="10" /><line x1="11" y1="10" x2="11.01" y2="10" /><line x1="15" y1="10" x2="15.01" y2="10" /><line x1="17" y1="10" x2="17.01" y2="10" /><line x1="8" y1="14" x2="16" y2="14" />',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7" /><polyline points="4,4 4,8.7 8.7,8.7" />',
  camera:
    '<path d="M4 8h3l1.6-2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3" />',
  stopwatch:
    '<circle cx="12" cy="13" r="7.5" /><line x1="12" y1="13" x2="15.2" y2="9.8" /><line x1="9.5" y1="3" x2="14.5" y2="3" /><line x1="12" y1="3" x2="12" y2="5.5" />',
  flag: '<line x1="6" y1="4" x2="6" y2="20" /><path d="M6 5h12l-2.5 4L18 13H6" />',
  warning:
    '<path d="M12 4L3.5 19h17L12 4Z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="16.8" x2="12.01" y2="16.8" />',
  check: '<polyline points="5,12.5 9.5,17 19,7" />',
  volume:
    '<polygon points="4,9 8.5,9 14,5 14,19 8.5,15 4,15" /><path d="M17.5 8.5a5 5 0 0 1 0 7" /><path d="M19.8 6a8.5 8.5 0 0 1 0 12" />',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" />',
  lock: '<rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" />',
  'chevron-left': '<polyline points="15,6 9,12 15,18" />',
  'chevron-right': '<polyline points="9,6 15,12 9,18" />',
  'surface-offtrack':
    '<line x1="4" y1="19" x2="8" y2="5" /><line x1="16" y1="19" x2="20" y2="5" /><path d="M10.5 14.5l1.5-4.5 1.5 4.5" /><line x1="9" y1="18" x2="15" y2="18" />',
  'surface-kerb':
    '<path d="M3 16l6-8h12l-6 8H3Z" /><line x1="9" y1="8" x2="6" y2="16" /><line x1="15" y1="8" x2="12" y2="16" />',
  garage:
    '<path d="M3 20V9.5L12 4l9 5.5V20" /><path d="M7 20v-7h10v7" /><line x1="7" y1="16.5" x2="17" y2="16.5" />',
  tag: '<path d="M4 4h7.5l8.5 8.5-7.5 7.5L4 11.5V4Z" /><circle cx="8.2" cy="8.2" r="1.3" />',
  slip: '<path d="M5 17c2-3 2-6 0-9" /><path d="M11 18c2.5-3.5 2.5-7 0-11" /><path d="M17 17c2-3 2-6 0-9" />',
};

export function renderIcon(name: IconName, className = 'ui-icon'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}
