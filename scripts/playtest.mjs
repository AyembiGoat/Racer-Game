// Drives the game in a real browser and saves screenshots to playtest/.
//
//   npm run playtest                  core driving, UI flow, persistence, audio, and key screenshots
//   npm run playtest -- --ui-matrix   extended multi-resolution & all-tabs screenshot gallery
//   npm run playtest -- --quick       starting-grid screenshot only
//   npm run playtest -- --materials   every surface side by side
//   npm run playtest -- --car         every car from four angles (playtest/car-<id>.png)
//   npm run playtest -- --car <id>    one car from four angles
//   npm run playtest -- --keep before copy the screenshots to playtest/before/ afterwards
//
// Exits non-zero if the page logs an error or a check fails.

import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { launchGame } from './browser.mjs';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const uiMatrix = args.includes('--ui-matrix');
const keep = args.includes('--keep') ? args[args.indexOf('--keep') + 1] : null;
const summary = { checks: {} };
const check = (name, passed) => {
  summary.checks[name] = Boolean(passed);
};

function boxesOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function checkHudLayout(page) {
  return page.evaluate(() => {
    const selectors = ['.hud-timing', '.hud-map-cluster', '.hud-left-cluster', '.hud-tach'];
    const rects = selectors.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { sel, x: r.left, y: r.top, width: r.width, height: r.height };
    });
    const text = document.body.innerText;
    return {
      rects,
      hasBadText: /\bNaN\b|\bundefined\b|!/i.test(text),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
}

const CAR_IDS = ['bmw-m3-e30', 'mazda-mx5-na', 'ford-mustang-gt-s550', 'porsche-cayman-s-987'];

if (args.includes('--materials')) {
  const page = await launchGame({ mode: 'materials' });
  await page.screenshot('playtest/materials.png');
  summary.errors = page.errors;
  await page.close();
} else if (args.includes('--car')) {
  const requested = args[args.indexOf('--car') + 1];
  const ids = CAR_IDS.includes(requested) ? [requested] : CAR_IDS;
  summary.errors = [];
  for (const id of ids) {
    const page = await launchGame({ mode: 'car', query: `car=${id}` });
    await page.screenshot(`playtest/car-${id}.png`);
    summary.errors.push(...page.errors);
    await page.close();
  }
} else if (uiMatrix) {
  const game = await launchGame({ width: 1280, height: 720, mode: 'auto' });
  const shot = (name) => game.screenshot(`playtest/${name}.png`);
  const settle = () => game.page.evaluate(() => new Promise((r) => window.setTimeout(r, 450)));

  try {
    await game.reset();
    await game.step({ brake: 1 }, 45);
    check('engages reverse after stopping', (await game.state()).car.gear === -1);
    await shot('06-reverse-gear');

    await game.reset();
    await game.step({ throttle: 1, steer: 0.45 }, 95);
    check('detects grass surface off-track', (await game.state()).surface === 'grass');
    await shot('07-offtrack-grass');

    await game.reset();
    await game.bot(900);
    await game.setViewport(1920, 1080);
    await settle();
    await game.step({}, 1);
    await shot('16-hud-1080p');

    await game.setScreen('loading');
    await settle();
    await shot('08-loading');

    await game.setScreen('settings');
    await game.page.click('[data-tab="display"]');
    await settle();
    await shot('12-settings-display');
    await game.page.click('[data-tab="audio"]');
    await settle();
    await shot('13-settings-audio');

    await game.setScreen('controls');
    await settle();
    await game.page.click('[aria-label="Accelerate primary key"]');
    await game.page.keyboard.press('KeyS');
    await settle();
    await shot('15-controls-conflict');

    await game.setScreen('race');
    for (const vp of [
      { name: '720p', w: 1280, h: 720, file: '17-hud-720p' },
      { name: '1440p', w: 2560, h: 1440, file: '18-hud-1440p' },
      { name: '21:9', w: 2560, h: 1080, file: '19-hud-21x9' },
      { name: '32:9', w: 3840, h: 1080, file: '20-hud-32x9' },
    ]) {
      await game.setViewport(vp.w, vp.h);
      await settle();
      await game.step({}, 1);
      await shot(vp.file);
      const layout = await checkHudLayout(game.page);
      check(`no bad text at ${vp.name}`, !layout.hasBadText);
      const validRects = layout.rects.filter((r) => r !== null);
      let overlap = false;
      for (let i = 0; i < validRects.length; i++) {
        for (let j = i + 1; j < validRects.length; j++) {
          if (boxesOverlap(validRects[i], validRects[j])) overlap = true;
        }
      }
      const insideBounds = validRects.every(
        (r) => r.x >= 0 && r.y >= 0 && r.x + r.width <= vp.w && r.y + r.height <= vp.h,
      );
      check(`HUD clusters fit without overlap at ${vp.name}`, !overlap && insideBounds);
    }

    await game.setViewport(2560, 1080);
    await settle();
    await game.setScreen('title');
    await settle();
    await shot('21-title-21x9');

    await game.setViewport(3840, 1080);
    await settle();
    await game.setScreen('pause');
    await settle();
    await shot('22-pause-32x9');
  } finally {
    summary.errors = game.errors;
    await game.close();
  }
} else {
  const game = await launchGame({ width: 1280, height: 720, mode: 'auto' });
  const shot = (name) => game.screenshot(`playtest/${name}.png`);
  const settle = () => game.page.evaluate(() => new Promise((r) => window.setTimeout(r, 450)));

  try {
    await shot('01-grid');

    if (!quick) {
      // 1. Accelerate, steer, bonnet camera, brake
      await game.step({ throttle: 1 }, 120);
      const afterLaunch = await game.state();
      check('accelerates off the grid', afterLaunch.car.speed > 16);
      check('shifts up under acceleration', afterLaunch.car.gear >= 2);

      await game.step({ throttle: 0.85, steer: -0.6 }, 25);
      await shot('02-steering');
      const steered = await game.state();
      check('steers left when requested', steered.car.steerAngle < -0.04);

      await game.setCamera('bonnet');
      check('switches to bonnet camera', (await game.camera()) === 'bonnet');
      await shot('03-bonnet-camera');

      await game.setCamera('chase');
      check('returns to chase camera', (await game.camera()) === 'chase');

      const speedBeforeBrake = (await game.state()).car.speed;
      await game.step({ brake: 1 }, 30);
      const speedAfterBrake = (await game.state()).car.speed;
      check('braking reduces speed', speedAfterBrake < speedBeforeBrake - 6);

      // 2. Offline sound mix including new UI bus sounds
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
      check(
        'UI focus/select cues stay subtle',
        summary.loudness.uiFocus < 0.3 && summary.loudness.uiSelect < 0.35,
      );

      // Levels of every sound against the ranges in reference/audio.md.
      const levels = await game.levels();
      summary.levels = levels;
      const all = Object.values(levels);
      const within = (name, low, high) => levels[name].rmsDb >= low && levels[name].rmsDb <= high;
      check(
        'no sound clips or is silent',
        all.every((l) => l.peak < 0.9 && l.peak > 0.002),
      );
      check(
        'each engine sits in its level range',
        CAR_IDS.every(
          (id) =>
            within(`engine:${id}:FullLoad`, -26, -14) &&
            within(`engine:${id}:Idle`, -42, -27) &&
            levels[`engine:${id}:FullLoad`].rmsDb - levels[`engine:${id}:Lift`].rmsDb >= 4 &&
            levels[`engine:${id}:PartLoad`].rmsDb > levels[`engine:${id}:Lift`].rmsDb &&
            levels[`engine:${id}:PartLoad`].rmsDb < levels[`engine:${id}:FullLoad`].rmsDb,
        ),
      );
      check(
        'surface and wind sounds sit in their level ranges',
        within('kerbRumble', -34, -22) &&
          within('tyreSlip', -38, -24) &&
          within('grass', -40, -27) &&
          within('wind', -40, -26),
      );
      check(
        'interface cues stay under the barrier hit',
        Object.entries(levels)
          .filter(([name]) => name.startsWith('ui') || name === 'checkpoint' || name === 'lap')
          .every(([, l]) => l.peak < levels.wallHit.peak * 0.35),
      );

      // Economy: a clean bot lap pays, the dealership refuses and sells, the garage equips.
      await game.loadCareer(11000, ['bmw-m3-e30'], 'bmw-m3-e30');
      await game.page.evaluate(() => document.fonts.ready);
      await game.openGarage('dealership');
      check('bay replaces the circuit in the garage', (await game.showroom()).active);
      await game.screenshot('playtest/dealership.png');
      await game.page.click('[data-car-id="ford-mustang-gt-s550"]');
      await game.page.click('[data-role="primary"]');
      const refused = await game.career();
      check(
        'purchase without enough credits changes nothing and says why',
        refused.credits === 11000 &&
          refused.owned.length === 1 &&
          /1,000 cr short/.test(
            await game.page.$eval('[data-role="reason"]', (el) => el.textContent ?? ''),
          ),
      );
      await game.page.keyboard.press('Escape');
      await game.setScreen('race');
      check('circuit returns after the garage', !(await game.showroom()).active);
      let lapEvent;
      for (let i = 0; i < 70 && !lapEvent; i++) {
        lapEvent = (await game.bot(30)).find((event) => event.type === 'lap');
      }
      check('clean first lap pays 1,050 cr', (await game.career()).credits === 12050);
      await game.screenshot('playtest/lap-reward.png');
      await game.setScreen('pause');
      await game.openGarage('dealership');
      await game.page.click('[data-car-id="ford-mustang-gt-s550"]');
      await game.page.click('[data-role="primary"]');
      check(
        'purchase dialog opens with Cancel focused',
        (await game.page.evaluate(() => document.activeElement?.textContent)) === 'Cancel',
      );
      await game.screenshot('playtest/purchase-dialog.png');
      await game.page.click('[data-dialog-action="confirm"]');
      const bought = await game.career();
      check(
        'purchase takes the price once and adds the car',
        bought.credits === 50 &&
          bought.owned.includes('ford-mustang-gt-s550') &&
          bought.equipped === 'bmw-m3-e30',
      );
      await game.page.click('[data-dialog-action="confirm"]');
      // A session is paused behind the garage, so equipping asks first.
      await game.page.click('[data-dialog-action="confirm"]');
      check(
        'equipping swaps the car on the grid',
        (await game.carId()) === 'ford-mustang-gt-s550' && (await game.state()).car.speed === 0,
      );
      await game.screenshot('playtest/garage.png');
      await game.page.reload({ waitUntil: 'load' });
      await game.page.waitForFunction(() => window.__racer !== undefined, { timeout: 60000 });
      const reloaded = await game.career();
      check(
        'career survives a reload',
        reloaded.credits === 50 &&
          reloaded.equipped === 'ford-mustang-gt-s550' &&
          (await game.carId()) === 'ford-mustang-gt-s550' &&
          reloaded.records['bmw-m3-e30'].bestLapSeconds !== null,
      );
      await game.loadCareer(0, ['bmw-m3-e30'], 'bmw-m3-e30');

      // 3. Bot completes a full timed lap with 3 sectors & zero wall hits
      await game.reset();
      check('reset returns to grid', (await game.state()).car.speed === 0);

      let steps = 0;
      let checkpointsHit = 0;
      let wallHits = 0;
      const limit = 60 * 55;
      while (steps < limit) {
        const events = await game.bot(30);
        steps += 30;
        wallHits += events.filter((event) => event.type === 'wall-hit').length;
        const crossed = events.filter((event) => event.type === 'checkpoint');
        for (const cp of crossed) {
          checkpointsHit += 1;
          if (cp.index === 1) {
            await shot('04-checkpoint-02');
          }
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

      // 4. Inspect Title, Pause, Settings, Controls at 1920x1080 + FOV & conflict checks
      await game.setViewport(1920, 1080);
      await settle();

      const hudLayout = await checkHudLayout(game.page);
      const hudRects = hudLayout.rects.filter((r) => r !== null);
      let hudOverlap = false;
      for (let i = 0; i < hudRects.length; i++) {
        for (let j = i + 1; j < hudRects.length; j++) {
          if (boxesOverlap(hudRects[i], hudRects[j])) hudOverlap = true;
        }
      }
      check('1080p HUD clusters fit without overlap', !hudOverlap && !hudLayout.hasBadText);

      await game.setScreen('title');
      await settle();
      await shot('09-title');

      await game.setScreen('pause');
      await settle();
      await shot('10-pause');

      await game.setScreen('settings');
      await settle();
      await shot('11-settings-driving');

      await game.setSettings({ fov: 76 });
      check('FOV setting updates real camera', Math.abs((await game.fov()) - 76) < 0.1);
      await game.setSettings({ fov: 64 });

      await game.setScreen('controls');
      await settle();
      await shot('14-controls');

      await game.page.click('[aria-label="Accelerate primary key"]');
      await game.page.keyboard.press('KeyS');
      const conflictVisible = await game.page.evaluate(() => {
        const el = document.querySelector('[data-role="ctrl-conflict"]');
        return el !== null && !el.hasAttribute('hidden');
      });
      check('controls rejects duplicate keybinding with conflict notice', conflictVisible);

      // 5. 1080p 200-step deterministic benchmark
      await game.setScreen('race');
      await game.reset();
      const benchMs = await game.page.evaluate(() => {
        const t0 = performance.now();
        for (let i = 0; i < 20; i++) window.__racer.bot(10);
        return performance.now() - t0;
      });
      summary.autoBench200StepsMs = Math.round(benchMs * 10) / 10;
      summary.autoMsPerStep = Math.round((benchMs / 200) * 1000) / 1000;
    }
  } finally {
    summary.errors = game.errors;
    await game.close();
  }

  // 6. Interactive 'play' mode pass: Fresh storage -> Loading -> Title -> Keyboard navigation -> Persistence -> Reduced motion
  if (!quick) {
    const live = await launchGame({ width: 1280, height: 720, mode: 'play' });
    try {
      await live.page.waitForFunction(
        () => {
          const title = document.querySelector('.ui-title');
          return title !== null && !title.hasAttribute('hidden');
        },
        { timeout: 60000 },
      );
      const freshOk = await live.page.evaluate(() => {
        const title = document.querySelector('.ui-title');
        return title !== null && !title.hasAttribute('hidden');
      });
      check('boots cleanly with fresh storage and transitions loading to title', freshOk);

      await live.page.keyboard.press('Enter');
      await live.page.waitForFunction(
        () => {
          const hud = document.querySelector('.hud-layer');
          return hud !== null && !hud.hasAttribute('hidden');
        },
        { timeout: 10000 },
      );
      check('Enter on Play starts race HUD', true);

      await live.page.keyboard.press('Escape');
      await live.page.waitForFunction(
        () =>
          document.querySelector('#pause-title') !== null &&
          !document.querySelector('#pause-title')?.closest('.ui-backdrop')?.hasAttribute('hidden'),
        { timeout: 10000 },
      );
      check('Escape pauses race', true);

      await live.page.click('[data-pause-action="settings"]');
      await live.page.click('[data-tab="display"]');
      await live.page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Field of view"]');
        if (input instanceof HTMLInputElement) {
          input.value = '78';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      const browser = live.page.browser();
      await live.page.close();
      const page2 = await browser.newPage();
      await page2.setViewport({ width: 1280, height: 720 });
      await page2.goto(live.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page2.waitForFunction(
        () => {
          const title = document.querySelector('.ui-title');
          return title !== null && !title.hasAttribute('hidden');
        },
        { timeout: 60000 },
      );
      const savedFov = await page2.evaluate(() => {
        const raw = window.localStorage.getItem('racer-game.settings.v1');
        return raw ? JSON.parse(raw).fov : null;
      });
      check('settings persist in localStorage across reload', savedFov === 78);

      await page2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page2.waitForFunction(() => document.documentElement.dataset.reducedMotion === 'true', {
        timeout: 10000,
      });
      check('respects prefers-reduced-motion media query', true);
    } finally {
      summary.errors = [...summary.errors, ...live.errors];
      await live.close();
    }
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
