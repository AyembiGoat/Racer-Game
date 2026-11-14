import type { GameEvent, GameInput, GameState } from '../core/game';
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
      /** Reset car and lap timer to the starting grid. */
      reset(): void;
      /** Peak loudness of each sound relative to a full barrier impact. */
      loudness(): Promise<Record<string, number>>;
    };
  }
}
