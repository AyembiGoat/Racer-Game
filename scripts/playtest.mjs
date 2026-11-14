// Drives the game in a real browser and saves screenshots to playtest/.
//
//   npm run playtest                  accelerate, steer, brake, cameras, audio mix, then bot laps Club Circuit
//   npm run playtest -- --quick       starting-grid screenshot only
//   npm run playtest -- --materials   every surface side by side
//   npm run playtest -- --car         the BMW M3 from four angles
//   npm run playtest -- --keep before copy the screenshots to playtest/before/ afterwards
//
// Exits non-zero if the page logs an error, a check fails, or the bot cannot
// complete a clean lap.

import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { launchGame } from './browser.mjs';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const keep = args.includes('--keep') ? args[args.indexOf('--keep') + 1] : null;
const summary = { checks: {} };
const check = (name, passed) => {
  summary.checks[name] = passed;
};

const preview = ['materials', 'car'].find((name) => args.includes(`--${name}`));
if (preview) {
  const page = await launchGame({ mode: preview });
  await page.screenshot(`playtest/${preview}.png`);
  summary.errors = page.errors;
  await page.close();
} else {
  const game = await launchGame();
  const shot = (name) => game.screenshot(`playtest/${name}.png`);

  try {
    await shot('01-grid');

    if (!quick) {
      // Accelerate down the main straight, shift up, steer, check both cameras, and brake.
      await game.step({ throttle: 1 }, 90);
      const afterLaunch = await game.state();
      check('accelerates off the grid', afterLaunch.car.speed > 16);
      check('shifts up under acceleration', afterLaunch.car.gear >= 2);

      await game.step({ throttle: 0.85, steer: -0.6 }, 25);
      await shot('02-steering');
      const steered = await game.state();
      check('steers left when requested', steered.car.steerAngle < -0.08);

      await game.setCamera('bonnet');
      check('switches to bonnet camera', (await game.camera()) === 'bonnet');
      await shot('03-bonnet-camera');

      await game.setCamera('chase');
      check('returns to chase camera', (await game.camera()) === 'chase');

      const speedBeforeBrake = (await game.state()).car.speed;
      await game.step({ brake: 1 }, 30);
      const speedAfterBrake = (await game.state()).car.speed;
      check('braking reduces speed', speedAfterBrake < speedBeforeBrake - 6);

      // Verify offline sound mix levels without speakers.
      summary.loudness = await game.loudness();
      check(
        'every sound produces audio',
        Object.values(summary.loudness).every((v) => v > 0),
      );
      check(
        'full-load engine is louder than idle',
        summary.loudness.motorFullLoad > summary.loudness.motorIdle,
      );
      check('UI checkpoint tick stays subtle', summary.loudness.checkpoint < 0.45);

      // Reset to the starting grid and let the bot drive a full timed lap.
      await game.reset();
      check('reset returns to grid', (await game.state()).car.speed === 0);

      let steps = 0;
      let checkpointsHit = 0;
      let wallHits = 0;
      const limit = 60 * 55;
      while (steps < limit) {
        const events = await game.bot(15);
        steps += 15;
        wallHits += events.filter((event) => event.type === 'wall-hit').length;
        const crossed = events.filter((event) => event.type === 'checkpoint');
        for (const cp of crossed) {
          checkpointsHit += 1;
          await shot(`04-checkpoint-${String(cp.index + 1).padStart(2, '0')}`);
        }
        const state = await game.state();
        if (state.completedLaps >= 1) break;
      }

      const finalState = await game.state();
      summary.lapSeconds = finalState.bestLapSeconds;
      summary.checkpointsHit = checkpointsHit;
      summary.wallHits = wallHits;
      check('bot hit every intermediate checkpoint', checkpointsHit === 3);
      check('bot completed a lap', finalState.completedLaps >= 1);
      check('bot avoided the barriers', wallHits === 0);
      await shot('05-lap-complete');
    }
  } finally {
    summary.errors = game.errors;
    await game.close();
  }
}

if (keep) {
  mkdirSync(`playtest/${keep}`, { recursive: true });
  for (const file of readdirSync('playtest')) {
    if (file.endsWith('.png')) cpSync(`playtest/${file}`, `playtest/${keep}/${file}`);
  }
}

console.log(JSON.stringify(summary, null, 2));
const failed = Object.values(summary.checks).some((passed) => !passed);
if (summary.errors.length > 0 || failed) process.exit(1);
