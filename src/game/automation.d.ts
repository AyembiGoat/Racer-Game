import type { GameEvent, GameInput, GameState } from '../core/game';
import type { GameSettings, KeyBindings, ScreenName } from './ui';
import type { CameraMode } from './view';

declare global {
  interface Window {
    /** Present only when the page is opened with `?auto`. See scripts/playtest.mjs. */
    __racer?: {
      state(): GameState;
      /** Hold `input` for `steps` simulation steps (60 per second). */
      step(input?: Partial<GameInput>, steps?: number): GameEvent[];
      /** Let the bot drive for `steps` simulation steps. */
      bot(steps?: number): GameEvent[];
      /** Active camera mode. */
      camera(): CameraMode;
      /** Switch camera mode (`chase` or `bonnet`). */
      setCamera(mode: CameraMode): void;
      /** Current camera field of view in degrees. */
      fov(): number;
      /** Reset car and lap timer to the starting grid. */
      reset(): void;
      /** Active UI screen name. */
      screen(): ScreenName;
      /** Switch active UI screen for inspection/playtesting. */
      setScreen(screen: ScreenName): void;
      /** Current persisted UI & camera settings. */
      settings(): GameSettings;
      /** Update UI & camera settings with immediate effect. */
      setSettings(patch: Partial<GameSettings>): GameSettings;
      /** Current keyboard bindings. */
      bindings(): KeyBindings;
      /** Peak loudness of each sound relative to a full barrier impact. */
      loudness(): Promise<Record<string, number>>;
    };
  }
}
