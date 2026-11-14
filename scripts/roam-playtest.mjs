// Drives free roam in a real browser, audits collision data, and saves
// screenshots of every landmark plus the collider overlay.
//
//   npm run playtest:roam            screenshots to playtest/roam/
//   npm run playtest:roam -- --keep  keep them under playtest/roam-before/
//
// Exits non-zero if the page logs an error, the audit fails, or a pose check
// fails.

import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { launchGame } from './browser.mjs';

const args = process.argv.slice(2);
const keep = args.includes('--keep') ? args[args.indexOf('--keep') + 1] : null;
const summary = { checks: {}, render: null, buildMs: 0 };
const check = (name, passed) => {
  summary.checks[name] = Boolean(passed);
};

const OUT = 'playtest/roam';
mkdirSync(OUT, { recursive: true });

const game = await launchGame({ width: 1280, height: 720, mode: 'auto&roam' });
const shot = (name) => game.screenshot(`${OUT}/${name}.png`);
const sleep = (ms) => game.page.evaluate((value) => new Promise((r) => setTimeout(r, value)), ms);

try {
  const boot = await game.page.evaluate(() => ({
    roam: window.__racer?.roam === true,
    screen: window.__racer?.screen(),
    audit: window.__racer?.roamAudit?.(),
  }));
  check('roam automation available', boot.roam);
  check('free roam screen active', boot.screen === 'roam');
  check('audit has no errors', boot.audit?.ok === true);

  const spawn = await game.page.evaluate(() => window.__racer.roamState());
  check('spawn on tarmac', spawn.surface === 'tarmac');
  check('spawn stationary', Math.abs(spawn.car.speed) < 0.01);
  await shot('01-spawn');

  await game.page.evaluate(() => window.__racer.stepRoam({ throttle: 1 }, 180));
  await sleep(80);
  const driven = await game.page.evaluate(() => window.__racer.roamState());
  check('car accelerates', driven.car.speed > 12);
  check('odometer advances', driven.distanceMetres > 40);
  check('car stays inside bounds', Math.abs(driven.car.position.x) < 1200);
  await shot('02-valley-ring');

  const recoveries = [
    ['recovery-village', '03-village'],
    ['recovery-airstrip', '04-airstrip'],
    ['recovery-quarry', '05-quarry'],
    ['recovery-ridge', '06-ridge'],
    ['recovery-farm', '07-farm'],
  ];
  for (const [id, name] of recoveries) {
    await game.page.evaluate((recoveryId) => window.__racer.roamRecovery(recoveryId), id);
    await game.page.evaluate(() => window.__racer.stepRoam({}, 24));
    await sleep(80);
    await shot(name);
  }

  const debugOn = await game.page.evaluate(() => window.__racer.setDebug(true));
  check('collider overlay toggles', debugOn === true);
  await game.page.evaluate(() => window.__racer.stepRoam({}, 1));
  await sleep(80);
  await shot('08-colliders');
  const debugOff = await game.page.evaluate(() => window.__racer.setDebug(false));
  check('collider overlay hides', debugOff === false);
  await game.page.evaluate(() => window.__racer.stepRoam({}, 1));

  const render = await game.page.evaluate(() => window.__racer.renderInfo());
  summary.render = render;
  check('draw calls within open-world budget', render.calls > 0 && render.calls < 115);
  check('triangles reported', render.triangles > 10000);

  const hud = await game.page.evaluate(() => {
    const text = document.body.innerText;
    return {
      textLength: text.length,
      bad: /\bNaN\b|\bundefined\b/i.test(text),
      hasLaps: /\bLap\b|\bSector\b/i.test(text),
      speed: document.querySelector('[data-role="speed"]')?.textContent ?? '',
      place: document.querySelector('[data-role="place"]')?.textContent ?? '',
    };
  });
  check('HUD has no invalid text', !hud.bad);
  check('free roam HUD has no lap or sector labels', !hud.hasLaps);
  check('HUD shows a place name', hud.place.length > 2);

  summary.errors = [...game.errors];
  check('no browser errors', game.errors.length === 0);
} finally {
  await game.close();
}

// The title menu must expose free roam as a real entry, not a URL-only mode.
const menuGame = await launchGame({ width: 1280, height: 720, mode: 'play' });
try {
  await menuGame.page.waitForSelector('[data-action="roam"]', { visible: true, timeout: 60000 });
  await menuGame.screenshot(`${OUT}/00-title-menu.png`);
  const label = await menuGame.page.$eval('[data-action="roam"]', (el) => el.textContent);
  check('title menu lists free roam', /Free Roam/.test(label ?? ''));
  await menuGame.page.click('[data-action="roam"]');
  await menuGame.page.waitForFunction(
    () => {
      const layer = document.querySelector('.roam-layer');
      return layer !== null && !layer.hasAttribute('hidden');
    },
    { timeout: 60000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
  await menuGame.screenshot(`${OUT}/00-menu-entry.png`);
  check('menu entry enters free roam', true);
  check('menu path has no errors', menuGame.errors.length === 0);
  summary.errors = [...summary.errors, ...menuGame.errors];
} finally {
  await menuGame.close();
}

console.log(JSON.stringify(summary, null, 2));
const failed = Object.entries(summary.checks).filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`\nFree-roam playtest FAILED: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log('\nFree-roam playtest PASSED');

if (keep) {
  const target = `playtest/${keep}`;
  mkdirSync(target, { recursive: true });
  for (const file of readdirSync(OUT)) {
    if (file.endsWith('.png')) cpSync(`${OUT}/${file}`, `${target}/${file}`);
  }
}
