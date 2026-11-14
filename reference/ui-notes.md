# Racing UI Reference Study & Design Specification

## 1. Reference Library (`reference/ui/` — 42 verified screenshots)

### In-Race HUD

1. **Gran Turismo 7 — Chase HUD** (`gt7-hud-chase.jpg`)
   - Source: https://www.gtplanet.net/forum/threads/gt7-hud.424809/
   - Concrete details: Bottom-centre cluster anchors speed (`236 km/h`, ~28 px geometric sans) and gear (`5`, ~36 px tabular) above a slim horizontal rev bar that transitions from white to crimson only at the upper ~15% shift zone. Top-right minimap uses thin 1.5 px white track line with a directional car chevron against open sky without a heavy box. Top-left timing column uses translucent dark scrim (`rgba(12,14,18,0.62)`) with a 2 px red/white row highlight for the player.
2. **Forza Motorsport (2023) — Chase HUD** (`forza-motorsport-hud.jpg`)
   - Source: https://windowscentral.com/gaming/forza/forza-motorsport-review
   - Concrete details: Bottom-right circular tach (`160 px` diameter) places a 48 px condensed gear numeral inside the arc and 28 px tabular speed below it; redline ticks appear only in the last 1,000 RPM. Top-left `CURRENT LAP 01:21.573` uses condensed display type at ~26 px with a soft text drop shadow and 10 px uppercase labels at 70% opacity. Bottom-left minimap sits inside a subtle circular dark tint (`rgba(15,18,22,0.45)`) with a bright cyan/blue arrow marker.
3. **F1 2019 — Race HUD** (`f1-2019-hud-race.jpg`)
   - Source: https://interfaceingame.com/games/f1-2019
   - Concrete details: Top-right lap & sector widget stacks current time above three horizontal sector segments (`S1`, `S2`, `S3`) that colour-code only after crossing. Bottom-right gear circle sits beside a rounded pill showing speed, gear-RPM dots, and throttle/brake fill.
4. **F1 2019 — Grid Start HUD** (`f1-2019-hud-grid-start.jpg`)
   - Source: https://interfaceingame.com/games/f1-2019
   - Concrete details: Empty lap time renders as `--:--.---` rather than `0:00.000`; stationary state shows gear `1`, `0 km/h`, and idle RPM cleanly.
5. **iRacing (2026 UI) — Widget HUD** (`iracing-hud-widgets.jpg`)
   - Source: https://iracerhub.com/iracing-sim-ui-widget-editor-guide
   - Concrete details: Bottom-left input trace widget pairs vertical throttle (green), brake (red), and clutch bars beside a clean steering wheel angle indicator, gear numeral, and speed unit inside a dark matte slate card (`#14181e` at ~88% opacity) with a 1 px crisp border.
6. **iRacing — In-Car HUD** (`iracing-hud-cockpit.jpg`)
   - Source: https://traxion.gg/iracing-ui-guide-how-to-customize-and-move-the-hud/
   - Concrete details: Compact edge-anchored widgets leave the entire centre sightline and braking markers unobstructed. Warning banners use high-contrast dark backing with a solid coloured top rule.
7. **Assetto Corsa Competizione — Cinema HUD** (`acc-cinema-hud.jpg`)
   - Source: https://traxion.gg/a-guide-to-assetto-corsa-competiziones-v1-8-cinema-hud-photo-mode/
   - Concrete details: Left-docked dark slate rail (`~280 px` wide, ~82% opacity) uses condensed uppercase section headers and red accent exclusively on the active slider fill.

### Title and Main Menu

8. **Gran Turismo 7 — World Map / Main Hub** (`gt7-main-menu.jpg`)
   - Source: https://www.gamesradar.com/gran-turismo-7-menu-books-how-many/
   - Concrete details: Live animated scenic backdrop fills 100% of the viewport; a compact 48 px matte charcoal top header bar anchors car info, distance driven, and clock without competing with the scene.
9. **F1 24 — Main Menu** (`f1-24-main-menu.jpg`)
   - Source: https://traxion.gg/how-to-take-great-photos-in-f1-24
   - Concrete details: Left-aligned uppercase display menu stack (~22 px condensed bold) sits over a graded scene; focused item receives a crisp 2 px white/tinted frame with subtle gradient fill and a one-line description tucked directly beneath the stack.
10. **DiRT Rally 2.0 — Main Menu** (`dirt-rally-2-main-menu.jpg`)
    - Source: https://www.gamestar.de/galerien/dirt_rally_20,133687.html
    - Concrete details: Top navigation bar uses clean horizontal spacing with a 2 px red active underline; bottom-right anchors compact keycap prompts (`Enter Select`, `Esc Quit`).
11. **Need for Speed Unbound — Main Menu** (`nfs-unbound-main-menu.png`)
    - Source: https://reddit.com/r/needforspeed/comments/17uxmzk/who_else_thinks_nfs_unbounds_main_menu_goes_hard
    - Concrete details: Bold oversized background display typography layered behind the car model establishes instant hierarchy; bottom-left keycap footer (`Enter Select`, `ESC Quit`) keeps navigation unambiguous.
12. **Deus Ex: Mankind Divided — Main Menu** (`deus-ex-main-menu.jpg`)
    - Source: https://interfaceingame.com/screenshots/deus-ex-mankind-divided-main-menu/
    - Concrete details: Vertical left-rail menu with high-contrast inverted active row (solid bright fill, dark text, small left triangular pointer) over a dark gradient scrim protecting legibility against the 3D scene.
13. **Cyberpunk 2077 — Main Menu** (`cyberpunk-main-menu.png`)
    - Source: https://interfaceingame.com/screenshots/cyberpunk-2077-main-menu/
    - Concrete details: Left-anchored vertical rail with a subtle vertical tint gradient, crisp active border outline, and bottom-right mouse/keycap legend.
14. **Gran Turismo 7 — Customisation / Car Stage** (`gt7-customisation-grid.webp`)
    - Source: https://vgtimes.com/games/gran-turismo-7/screenshots/image1099614.html
    - Concrete details: Bright daylight concrete/pit environment with bottom dark gradient tiles (`rgba(15,17,20,0.85)`) and one solid warm yellow/amber selected card (`#f5b800`), zero visual noise.

### Pause Menu

15. **Gran Turismo 7 — Pause Menu** (`gt7-pause-menu.jpg`)
    - Source: https://outsidergaming.com/gran-turismo-7-how-to-take-photos-of-cars-and-races
    - Concrete details: Live scene dims to ~40% brightness while keeping the car recognisable; centred segmented pill bar (`Continue | Retry | Settings | Exit`) uses a bright brushed-white active state against dark translucent neighbours.
16. **F1 2019 — Pause Menu** (`f1-2019-pause-menu.jpg`)
    - Source: https://interfaceingame.com/screenshots/f1-2019-pause-menu
    - Concrete details: Single frosted dark-slate container (`rgba(22,26,34,0.86)` with `backdrop-filter: blur`) over the paused track; left column lists actions separated by 1 px hairlines (`rgba(255,255,255,0.1)`); right column displays a single-sentence description of the focused row.
17. **Cyberpunk 2077 — Pause Menu** (`cyberpunk-pause-menu.png`)
    - Source: https://interfaceingame.com/games/cyberpunk-2077
    - Concrete details: Blurred, darkened live gameplay background; clean left menu rail; bottom-right `ESC Close` keycap footer.
18. **The Finals — Pre-Match Overlay** (`the-finals-prematch.png`)
    - Source: https://interfaceingame.com/games/the-finals/
    - Concrete details: Crisp top bar with tight uppercase condensed heading, subtle diagonal light plane, and anchored bottom-left key hints.

### Settings

19. **Forza Motorsport (2023) — Accessibility Settings** (`forza-motorsport-settings-accessibility.jpg`)
    - Source: https://windowscentral.com/gaming/forza/forza-motorsport-2023-may-be-one-of-the-most-popular-simulation-racers-ever-for-one-reason-accessibility
    - Concrete details: Two-zone layout: left scrollable list of rows separated by subtle 1 px dividers, right floating inspector card explaining the focused setting. Active row gets a slightly darker raised surface + 1 px warm amber border (`#f0a500`) and amber text. Top tab strip marks active tab with a dark pill and small centred amber triangle indicator.
20. **Forza Motorsport (2023) — Camera FOV Settings** (`forza-motorsport-settings-camera.jpg`)
    - Source: https://gamerant.com/forza-motorsport-how-change-camera-view/
    - Concrete details: Consistent 3-column row alignment: label on left, tabular numeric value in middle (`53`), custom thin slider track on right with triangular thumb marker. Bottom-right keycaps `R Reset To Default`, `Esc Close`.
21. **Forza Motorsport (2023) — Wheel / Advanced Settings** (`forza-motorsport-settings-wheel.png`)
    - Source: https://simracingcockpit.gg/forza-motorsport-wheel-settings/
    - Concrete details: Disabled row (`Vibration Scale`) is rendered at ~40% opacity with subtle diagonal hatch pattern, immediately communicating non-interactive state without clutter.
22. **Forza Motorsport (2023) — Controller Settings** (`forza-motorsport-settings-controller.jpg`)
    - Source: https://www.windowscentral.com/gaming/forza/forza-motorsport-review
    - Concrete details: Section dividers use uppercase wide-tracked muted labels (`TIME LIMITS`) flanked by thin horizontal rules.
23. **Forza Motorsport (2023) — Video Settings** (`forza-motorsport-settings-video.jpg`)
    - Source: https://www.windowscentral.com/gaming/forza/forza-motorsport-review
    - Concrete details: Inline `< Selector >` control sits inside the focused amber-outlined cell.
24. **Forza Motorsport (2023) — Photo Settings** (`forza-motorsport-photo-settings.jpg`)
    - Source: https://attackofthefanboy.com/guides/forza-motorsport-how-to-access-photo-mode
    - Concrete details: Compact left-rail settings panel leaves the car visible in the right 70% of the frame so live setting changes can be judged visually.
25. **EA Sports WRC — Edit Device Settings** (`ea-wrc-settings.jpg`)
    - Source: https://simracingcockpit.gg/ea-wrc-wheel-settings/
    - Concrete details: Matte anthracite card with a single crisp 2 px signal-orange rule beneath the `EDIT DEVICE SETTINGS` header and subtle warm ambient glow in the bottom-right corner; segmented tab strip (`BINDINGS | ADVANCED | VIBRATION`) uses an inverted white active tab; sliders use signal-orange active fill and circular white thumb.
26. **F1 23 — Force Feedback Settings** (`f1-23-settings-sliders.webp`)
    - Source: https://simracingsetup.com/f1-23/f1-23-wheel-settings-guide/
    - Concrete details: High-contrast white pill focus bar with dark text, crisp tabular value aligned right of the bar gauge, and contextual info card on the right.
27. **DiRT Rally 2.0 — Vibration & Feedback Settings** (`dirt-rally-2-settings.png`)
    - Source: https://simracingcockpit.gg/dirt-rally-2-wheel-settings/
    - Concrete details: Clean dark list rows with crisp 6 px horizontal bar indicators and tabular percentages; active tab uses a 2 px red bottom border.
28. **Deus Ex: Mankind Divided — Display Options** (`deus-ex-settings.jpg`)
    - Source: https://interfaceingame.com/screenshots/deus-ex-mankind-divided-display-options
    - Concrete details: Display header in bold high-contrast white plate (`DISPLAY OPTIONS`), two-column settings + description split, crisp disabled row treatment, and anchored `Restore Defaults` / `Back` footer buttons.
29. **Assetto Corsa Competizione — Video Settings** (`acc-video-settings.png`)
    - Source: https://traxion.gg/a-guide-to-assetto-corsa-competiziones-v1-8-cinema-hud-photo-mode/
    - Concrete details: Breadcrumb header (`OPTIONS / VIDEO`) at top-right, dense aligned selector list with muted disabled rows.

### Controls

30. **F1 23 — Control Scheme** (`f1-23-controls-conflicts.webp`)
    - Source: https://simracingsetup.com/f1-23/f1-23-controls-guide/
    - Concrete details: Grouped actions (`CONTROL SCHEME`) with explicit warning triangle icons next to unbound or conflicting actions, paired with a contextual info panel on the right.
31. **Assetto Corsa Competizione — Controls** (`acc-controls.png`)
    - Source: https://simracingcockpit.gg/acc-wheel-settings
    - Concrete details: Two-column split separating key/axis bindings on the left from calibration/tuning on the right, using crisp key-badge chips and clear `×` unbind actions.
32. **Valorant — Controls & Rebinding** (`valorant-controls.png`)
    - Source: https://interfaceingame.com/screenshots/valorant-interface
    - Concrete details: Hierarchical two-level tab navigation (`CONTROLS` > `MOVEMENT / INTERFACE`), clean 3-column binding table (Action | Primary Key | Secondary/Clear), and bottom `RESET CONTROLS TO DEFAULT` + `CLOSE SETTINGS` actions.
33. **Cyberpunk 2077 — Control Scheme** (`cyberpunk-controls.png`)
    - Source: https://interfaceingame.com/games/cyberpunk-2077
    - Concrete details: Cleanly grouped action labels and key glyphs with `ESC Close` footer.

### Results and Session Summary

34. **Gran Turismo 7 — Lap Time Challenge Board** (`gt7-time-trial-board.jpg`)
    - Source: https://www.reddit.com/r/GranTurismo7/comments/1hkk7ny/leaderboardstime_trials_rivals/
    - Concrete details: Matte dark container with subtle vertical top-lit gradient, left summary / right table split, tabular lap times (`1:44.111`), fine hairline row dividers, and pill-shaped primary action button with crisp white focus ring.
35. **Gran Turismo 7 — Ranking Board Empty State** (`gt7-ranking-empty.jpg`)
    - Source: https://reddit.com/r/granturismo/comments/179vw8v/how_to_see_friends_leaderboard
    - Concrete details: Unpopulated rows cleanly display `---` in muted tabular columns rather than `0:00.000` or blank space.
36. **Gran Turismo 7 — Split / Record Comparison** (`gt7-results-split.webp`)
    - Source: https://vgtimes.com/games/gran-turismo-7/screenshots/
    - Concrete details: Floating top split pill and bottom-right delta readout (`-00.270`) with clean sign prefix and tabular precision.
37. **F1 2019 — Classification / Results** (`f1-2019-results.jpg`)
    - Source: https://interfaceingame.com/games/f1-2019
    - Concrete details: Left action rail (`ADVANCE`, `RESTART SESSION`) paired with right tabular timing board; personal best highlighted in accent colour while all columns maintain strict vertical alignment.
38. **F1 2019 — Race Finish Banner** (`f1-2019-finish-banner.jpg`)
    - Source: https://interfaceingame.com/games/f1-2019
    - Concrete details: Compact bottom-left dark translucent banner (`11th`) sits low out of the sightline while driving on track.
39. **iRacing — Results & Stats Board** (`iracing-results-board.png`)
    - Source: https://reddit.com/r/iRacing/comments/1mwlbwv/new_iracing_ui_screenshots
    - Concrete details: Top session metadata strip (circuit silhouette + track dimensions + car badge) above a dark-slate table with row zebra tinting and yellow/amber highlight on the player's own row.
40. **The Finals — Progression Summary** (`the-finals-progression.png`)
    - Source: https://interfaceingame.com/games/the-finals/
    - Concrete details: Strong typographic contrast between oversized italic/condensed header and crisp tabular stat counters, paired with bottom-left keycap hints (`ESC MAIN MENU`, `SPACE NEXT`).

### Loading, Transitions, and Motion

41. **F1 2019 — Loading Screen** (`f1-2019-loading.jpg`)
    - Source: https://interfaceingame.com/games/f1-2019
    - Concrete details: Atmospheric circuit shot with a dark diagonal scrim across the bottom third, bold location/date title anchored bottom-left with a 2 px horizontal accent rule above it, and subtle top-left spinner.
42. **Cyberpunk 2077 — Exit / Transition Interface** (`cyberpunk-exit-interface.png`)
    - Source: https://interfaceingame.com/screenshots/cyberpunk-2077-exit-interface/
    - Concrete details: Crisp structured confirmation/transition frame with clear status indicators and anchored bottom-right key legend.

---

## 2. Shared Patterns Across the Best References

1. **Matte dark anthracite surfaces with directional top light:** Forza Motorsport (2023), EA Sports WRC, GT7, and iRacing 2026 all anchor menus on dark matte slate (`#12151a`–`#1d2229`) lit slightly brighter at the top edge with a 1 px specular top highlight and deep outer shadow.
2. **One warm/high-contrast accent reserved strictly for state:** Forza uses a single warm amber (`#f0a500`) for focus outlines and active tab indicators; EA WRC uses signal orange (`#e85a19`) for header rule and slider fills; GT7 uses warm gold/white for selection. Nothing decorative glows.
3. **Condensed display numerals + neutral sans body:** Speed, gear, lap times, and section headers use tight, authoritative condensed faces with `tabular-nums`, while descriptions and labels sit in a crisp neutral grotesque.
4. **Two-zone settings with live right-hand inspector:** Forza Motorsport, F1 23, EA WRC, and Deus Ex all put the interactive list on the left and a dedicated description card on the right so rows stay clean and uncluttered.
5. **Keycap footers:** Every top-tier title anchors real keycaps in the bottom corners (`Enter Select`, `Esc Back`, `R Reset`) so keyboard navigation is always self-explanatory.
6. **Peripheral-safe HUD anchoring:** All corners stay compact, high-contrast over bright sunlit sky and asphalt, and the centre 60% sightline remains completely open.

### Decisions Taken vs Rejected

- **Taking:**
  - Forza Motorsport (2023) & EA Sports WRC's matte anthracite layered panels, 1 px top edge specular highlight, single warm signal-amber/orange accent (`#eb6b1e` / `#f28c28` warm touring-car pit-wall orange), and two-zone settings + inspector layout.
  - GT7's clean edge-anchored HUD hierarchy, horizontal rev strip that lights up only near redline, empty-state `—` dashes, and darkened live-camera pause bar.
  - iRacing 2026's clean compact throttle/brake/steer input trace widget.
  - F1 2019/23's 3-sector checkpoint timing strip (`S1`, `S2`, `S3`) and explicit conflict warning triangles on key rebinding.
- **Rejecting:**
  - GT7's World Map icons, collector levels, credits, and daily workout (fake meta-progression not in our game).
  - Forza's car level XP bar and 24-car placement counter (we have 1 car, time-trial only).
  - F1 24's store/battle pass/driver portraits and Cyberpunk's neon-cyan/magenta glitch chrome.
  - Circular dial gauges with decorative tick clutter (`acc` / `forza` analog needle) in favour of a razor-sharp horizontal/segmented digital pit-wall tachometer and oversized gear/speed numerals that read faster in peripheral vision over bright sky.

---

## 3. Design Specification

### Identity

**Works Touring-Car Pit-Wall Instrument (1989 BMW M3 E30 at Club Circuit).**
Three words: **Precise, Physical, Quiet.**
Matte anthracite anodized panels lit from above, fine 1 px hairline rules, crisp daylight-white tabular numerals, and one warm **Motorsport Signal Orange (`#ef6c1d`)** accent used like painted pit-board markings.

### Colour Tokens (`tokens.css`)

- Neutrals:
  - `--bg-void: #0a0c0f` (canvas letterbox / deep scrim)
  - `--surface-0: #111419` (panel base bottom)
  - `--surface-1: #181c23` (panel base top / card surface)
  - `--surface-2: #212731` (elevated interactive row / keycap face)
  - `--surface-3: #2b323f` (hover / active control fill)
  - `--border-subtle: rgba(255, 255, 255, 0.08)`
  - `--border-strong: rgba(255, 255, 255, 0.16)`
  - `--border-highlight: rgba(255, 255, 255, 0.22)` (top specular edge)
  - `--text-primary: #f4f6f8`
  - `--text-secondary: #b4bcc8`
  - `--text-muted: #7a8494`
- Brand / Accent (one warm signal orange, used sparingly):
  - `--accent: #ef6c1d`
  - `--accent-bright: #ff8538`
  - `--accent-soft: rgba(239, 108, 29, 0.16)`
  - `--accent-glow: rgba(239, 108, 29, 0.42)`
- Semantic (always paired with text/icon/sign):
  - `--confirm: #2fb869` (new personal best, throttle, negative delta)
  - `--confirm-soft: rgba(47, 184, 105, 0.18)`
  - `--warning: #e6a817` (kerb / high slip / conflict / positive delta)
  - `--warning-soft: rgba(230, 168, 23, 0.18)`
  - `--danger: #e04438` (redline, off-track grass, brake, wall impact)
  - `--danger-soft: rgba(224, 68, 56, 0.2)`

### Typography (`tokens.css` + local `@font-face`)

- Bundled local `.woff2` fonts (SIL OFL 1.1, zero CDN):
  - Display / Numerals: **Barlow Condensed** (`500`, `600`, `700`) — tabular-nums for all counters, clocks, speeds, RPM, and deltas.
  - UI / Body / Labels: **IBM Plex Sans** (`400`, `500`, `600`) — tabular-nums for settings values and keycaps.
- Scale (viewport-responsive via `clamp()`):
  - `--text-hero`: `clamp(2.5rem, 5vw, 4.25rem)` (`700`, tracking `-0.02em`, line-height `0.95`) — Title screen & speed readout
  - `--text-display`: `clamp(1.5rem, 2.5vw, 2.25rem)` (`600`, tracking `-0.015em`) — Screen titles & lap timer
  - `--text-section`: `clamp(0.95rem, 1.25vw, 1.15rem)` (`600`, tracking `0.06em`, uppercase) — Section headers
  - `--text-body`: `clamp(0.875rem, 1vw, 0.95rem)` (`400`, line-height `1.45`) — Setting labels & descriptions
  - `--text-label`: `clamp(0.6875rem, 0.8vw, 0.75rem)` (`600`, tracking `0.09em`, uppercase) — Compact pit-board labels & units

### Spacing & Safe Zones (4 px base)

- `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`, `--space-6: 24px`, `--space-8: 32px`, `--space-10: 40px`
- Viewport safe margin: `--safe-x: clamp(18px, 2.4vw, 44px)`, `--safe-y: clamp(16px, 2.2vh, 36px)`
- HUD anchor map (centre 60% completely unobstructed):
  - Top-left (`max-width: min(320px, 28vw)`): Timing & Sectors (Lap counter, Current lap `m:ss.mmm`, Last, Best, 3 real sector split pills `S1 S2 S3`, checkpoint/lap delta).
  - Top-right (`max-width: min(210px, 18vw)`): Real Track Minimap (drawn from `track.waypoints`, start/finish gate tick, 3 checkpoint dots, live car chevron/dot, optional track-rotation mode) + Session Elapsed time beneath.
  - Top-centre (transient, `top: var(--safe-y)`): Lap-complete / New-Best banner (auto-dismisses after 3.2 s) & brief Camera mode toast (`Chase` / `Bonnet`, auto-dismisses after 1.6 s).
  - Bottom-left (`max-width: min(260px, 24vw)`): Quiet contextual keycap strip (`Esc Pause`, `C Camera`, `R Reset`) + optional Input Trace widget (Throttle / Brake / Steer bars from real `GameInput`) + active Surface / Off-track / Grip Scrub badge (only visible when relevant: `KERB`, `OFF TRACK · GRASS`, or `SLIP`).
  - Bottom-right (`max-width: min(300px, 26vw)`): Speed, Gear (`R` or `1`–`5`), Unit (`km/h` or `mph`), numeric RPM, and segmented/continuous RPM bar with redline zone (`>= 6500 RPM` amber, `>= 6750 RPM` redline) + shift cut/flash feedback.

### Surfaces & Depth

- **Level 1 (HUD cluster backing):** Subtle matte anthracite gradient (`linear-gradient(180deg, rgba(24,28,35,0.86) 0%, rgba(15,18,23,0.90) 100%)`) with 1 px top highlight (`inset 0 1px 0 rgba(255,255,255,0.16)`), 1 px outer border (`rgba(255,255,255,0.10)`), and soft drop shadow (`0 8px 24px rgba(0,0,0,0.42)`). **Zero `backdrop-filter`** on per-frame updating telemetry clusters! Contrast guaranteed > 7:1 even against pure white sky or sunlit concrete.
- **Level 2 (Static overlay panels — Pause, Settings, Controls, Summary):** Layered matte anthracite surface (`linear-gradient(180deg, rgba(28,33,42,0.94) 0%, rgba(17,20,26,0.97) 100%)`), 1 px top specular border, inner shadow, outer elevation shadow, `backdrop-filter: blur(10px)` strictly on static dimmed overlay backdrop, plus ultra-subtle SVG noise texture (`opacity: 0.025`) to prevent gradient banding.
- **Level 3 (Focused/Selected control & keycaps):** Raised `--surface-2`/`--surface-3` gradient, crisp 1 px `--accent` border, and pre-blurred pseudo-element glow layer animated solely via `opacity`.

### Glow & Light Rules

- Glow appears ONLY via pre-rendered `::after` pseudo-element opacity transitions (never animating `box-shadow` or `filter`):
  1. Focused menu/settings control (soft `--accent-glow` edge bloom).
  2. Transient event flash: gear-shift tick, checkpoint split capture, new personal best banner, wall-hit edge vignette scaled by `impactSpeed`.
  3. Redline zone when RPM >= 6750 RPM (solid/cut response, no pulsing loop).

### Motion & Reduced Motion

- Tokens:
  - `--dur-instant: 90ms` (press / keycap feedback)
  - `--dur-fast: 150ms` (hover / focus / tab swap)
  - `--dur-mid: 240ms` (panel reveal / banner enter)
  - `--dur-slow: 360ms` (screen cross-fade / title stagger)
  - `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`
  - `--ease-in: cubic-bezier(0.4, 0, 1, 1)`
- Header reveal: single horizontal accent rule scale/light sweep on mount (plays once, never loops).
- Reduced motion (`prefers-reduced-motion: reduce` OR settings `reducedMotion: true`, toggled via `data-reduced-motion="true"` on `<html>`): disables transforms/sweeps/slides/wall-shake; uses instant/opacity transitions only (`<= 80ms`).

### SVG Icon Set

- Single 24×24 viewBox, `1.75px` stroke weight, `round` caps and `2px` joins:
  - `bmw-m3-silhouette`: Side-profile E30 BMW M3 (box-flared arches, upright kidney nose, Hofmeister kink C-pillar, flat bootlid spoiler, 3-box coupe silhouette, real 4.35:1.37 proportion).
  - `flag-checkered`, `stopwatch`, `gauge`, `camera`, `reset`, `pause`, `play`, `settings`, `controls`, `warning`, `check`, `volume`, `eye`, `chevron-left`, `chevron-right`, `lock`, `surface-grass`, `surface-kerb`.

### Data Integrity Contract & Core Additions Needed

To keep every displayed metric 100% real and deterministic:

1. **Sector splits & best sector times (`src/core/game.ts`):**
   - Club Circuit already has 4 checkpoints (`checkpoints[0..2]` are intermediate gates; `checkpoints[3]` is start/finish).
   - Add to `GameState`:
     - `currentSectorStartSeconds: number` (elapsed lap time at start of current sector)
     - `currentSectors: readonly (number | null)[]` (3 sectors for the current lap: S1 at checkpoint 0, S2 at checkpoint 1, S3 at checkpoint 2->finish? Wait: 3 intermediate checkpoints divide a lap into **4** segments or 3 splits! Let's check: checkpoint 0 is at 28%, checkpoint 1 at 54%, checkpoint 2 at 78%, finish at 100%. So crossing checkpoint 0 completes Sector 1; checkpoint 1 completes Sector 2; checkpoint 2 completes Sector 3; or wait: 3 intermediate checkpoints = 3 splits + final leg, OR 4 sectors? Wait — prompt says: "Three real sector splits at the existing checkpoints. Show each sector as it is completed. If you add sector timing to core, add tests for split order, lap boundaries and best-sector tracking." Look at how clear that is: at checkpoint 0 -> S1 split time (`currentLapSeconds` or sector duration), at checkpoint 1 -> S2 split time, at checkpoint 2 -> S3 split time, and at finish line -> full lap! Even better: let's track `sectorTimes: readonly (number | null)[]` for the 3 sector splits `[S1, S2, S3]` — wait: let's decide whether S1 = 0->CP0, S2 = CP0->CP1, S3 = CP1->CP2, or if S1/S2/S3 are the 3 splits (cumulative or segment) plus final leg! Wait: in racing games with 3 checkpoints + start/finish, either S1=0..CP0, S2=CP0..CP1, S3=CP1..CP2, S4=CP2..Finish OR we show the 3 intermediate splits `S1` (at CP0), `S2` (at CP1), `S3` (at CP2) as cumulative split times or individual sector durations (and S3+Finish is the final sector). Let's check: if we store `sectorSplits: readonly (number | null)[]` of length `track.checkpoints.length` (3 intermediate splits + finish = 4 sectors, OR the 3 intermediate checkpoint splits `S1`, `S2`, `S3` plus `Finish`!). Even cleaner: store `sectorTimes: readonly (number | null)[]` of length `track.checkpoints.length` where each element `i` is the duration of segment `i` (`CP[i-1] -> CP[i]`), AND `bestSectorTimes: readonly (number | null)[]` + `lastSectorDeltaSeconds: number | null` (comparing the just-completed sector/split against the best lap's corresponding split!).Wait: showing 3 sector pills `S1`, `S2`, `S3` for the 3 intermediate checkpoints (segment times `0->CP0`, `CP0->CP1`, `CP1->CP2`, and finish completes the lap) OR showing `S1`, `S2`, `S3` as cumulative split at CP0/CP1/CP2 and lap at finish? Wait: let's re-read the prompt carefully:
       "Three real sector splits at the existing checkpoints. Show each sector as it is completed. If you add sector timing to core, add tests for split order, lap boundaries and best-sector tracking. Delta to the best lap. Be precise about what it compares: a sector delta measured at a checkpoint, or a lap delta shown at the finish line."
       Notice! If `track.checkpoints` has 3 intermediate gates + 1 finish gate (`length = 4`), then at CP 0, CP 1, CP 2 we get **three** checkpoint splits (`S1`, `S2`, `S3`), and at Finish we get the Lap Time! Storing `sectorSplits` (3 intermediate sector durations `[0..CP0, CP0..CP1, CP1..CP2]`, plus `bestLapSplits` for the best lap's cumulative split times at CP0, CP1, CP2 and `bestSectorTimes` for the fastest individual sector durations) means:
       - At CP 0: S1 completes; cumulative split at CP 0 vs `bestLapSplits[0]` gives the exact **sector delta to best lap**!
       - At CP 1: S2 completes; cumulative split at CP 1 vs `bestLapSplits[1]` gives the exact **sector delta to best lap**!
       - At CP 2: S3 completes; cumulative split at CP 2 vs `bestLapSplits[2]` gives the exact **sector delta to best lap**!
       - At Finish: Lap completes; lap time vs previous `bestLapSeconds` gives the exact **lap delta**!
       - And if `bestLapSplits` doesn't exist yet (Lap 1), delta shows `—` (empty) and sector just shows the real split time!
         That is 100% mathematically sound, matches the 3 existing intermediate checkpoints + finish line, and obeys every word of the prompt!
2. **Odometer / Distance driven (`src/core/game.ts`):**
   - Add `distanceMetres: number` to `GameState` (accumulated `Math.hypot(car.position.x - prevPosition.x, car.position.z - prevPosition.z)` on every `stepGame`, tested in `game.test.ts`).
3. **Lap history (`src/core/game.ts`):**
   - Add `lapHistory: readonly number[]` (or track in `GameState` up to e.g. all completed laps in session) so the Session Summary screen shows real completed laps, best lap, last lap, total laps, session time, and distance driven!
4. **Reset to grid (`src/game/main.ts`):**
   - Keep `resetToGrid()` clean and also support a smooth fade transition when triggered manually (instant in `?auto` for deterministic playtest!).
