// Drives the game in a real browser and saves screenshots to playtest/.
//
//   npm run playtest                  accelerate, steer, brake, switch cameras, then bot laps the circuit
//   npm run playtest -- --quick       starting-grid screenshot only
//   npm run playtest -- --keep before copy the screenshots to playtest/before/ afterwards,
//                                     to compare against after a change
//
// Exits non-zero if the page logs an error, a control check fails, or the bot
// cannot complete a clean lap.

import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { launchGame } from './browser.mjs';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const keep = args.includes('--keep') ? args[args.indexOf('--keep') + 1] : null;
const summary = { checks: {} };
const check = (name, passed) => {
  summary.checks[name] = passed;
};

const game = await launchGame();
const shot = (name) => game.screenshot(`playtest/${name}.png`);

try {
  await shot('01-grid');

  if (!quick) {
    // Accelerate down the main straight, steer, brake, and verify both camera views.
    await game.step({ throttle: 1 }, 60);
    const afterLaunch = await game.state();
    check('accelerates off the grid', afterLaunch.car.speed > 10);

    await game.step({ throttle: 0.8, steer: -0.6 }, 30);
    await shot('02-steering');
    const steered = await game.state();
    check('steers left when requested', steered.car.steerAngle < -0.1);

    await game.setCamera('bonnet');
    check('switches to bonnet camera', (await game.camera()) === 'bonnet');
    await shot('03-bonnet-camera');

    await game.setCamera('chase');
    check('returns to chase camera', (await game.camera()) === 'chase');

    const speedBeforeBrake = (await game.state()).car.speed;
    await game.step({ brake: 1 }, 30);
    const speedAfterBrake = (await game.state()).car.speed;
    check('braking reduces speed', speedAfterBrake < speedBeforeBrake - 5);

    // Reset to the starting grid and let the bot drive a full timed lap.
    await game.reset();
    check('reset returns to grid', (await game.state()).car.speed === 0);

    let steps = 0;
    let checkpointsHit = 0;
    let wallHits = 0;
    const limit = 60 * 45;
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

if (keep) {
  mkdirSync(`playtest/${keep}`, { recursive: true });
  for (const file of readdirSync('playtest')) {
    if (file.endsWith('.png')) cpSync(`playtest/${file}`, `playtest/${keep}/${file}`);
  }
}

console.log(JSON.stringify(summary, null, 2));
const failed = Object.values(summary.checks).some((passed) => !passed);
if (summary.errors.length > 0 || failed) process.exit(1);
