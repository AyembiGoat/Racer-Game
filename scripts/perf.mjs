// Measures frame pacing and renderer work in a real browser.
//
//   npm run perf                       Club Circuit at 1280x720 and 1920x1080
//   npm run perf -- --roam             Kestrel Valley free roam at both sizes
//   npm run perf -- --all              both worlds, both sizes
//   npm run perf -- --label before     saves playtest/perf-before-*.json
//
// The sandbox browser uses SwiftShader (CPU rasterisation), so absolute frame
// times are not representative of a GPU laptop. The numbers are comparable
// between runs on the same machine and the renderer draw-call/triangle counts
// are hardware independent.

import { mkdirSync, writeFileSync } from 'node:fs';
import { launchGame } from './browser.mjs';

const args = process.argv.slice(2);
const labelIndex = args.indexOf('--label');
const label = labelIndex >= 0 ? args[labelIndex + 1] : null;
const all = args.includes('--all');
const worlds = all ? ['circuit', 'roam'] : args.includes('--roam') ? ['roam'] : ['circuit'];
const sizes = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
];
const FRAMES = 24;

function percentile(sorted, fraction) {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

async function measure(world, size) {
  const game = await launchGame({
    width: size.width,
    height: size.height,
    mode: world === 'roam' ? 'auto&roam' : 'bot',
  });
  try {
    if (world === 'roam') {
      // Move the car away from spawn on the ring road, then let the on-demand
      // render loop (started by `?auto&roam`) present steady frames.
      await game.page.evaluate(() => window.__racer.stepRoam({ throttle: 1 }, 300));
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } else {
      // Let the bot reach racing speed and the adaptive pixel ratio settle.
      await new Promise((resolve) => setTimeout(resolve, 7000));
    }
    const sample = await game.page.evaluate(
      (frames) =>
        new Promise((resolve) => {
          const times = [];
          let last = performance.now();
          let count = 0;
          const tick = (now) => {
            times.push(now - last);
            last = now;
            count += 1;
            if (count < frames) {
              requestAnimationFrame(tick);
            } else {
              resolve({
                times: times.slice(2),
                renderInfo: window.__racer?.renderInfo?.() ?? null,
              });
            }
          };
          requestAnimationFrame(tick);
        }),
      FRAMES,
    );
    const times = sample.times;
    const sorted = [...times].sort((a, b) => a - b);
    const average = times.reduce((sum, value) => sum + value, 0) / times.length;
    return {
      world,
      viewport: size.name,
      browser: await game.page.browser().version(),
      renderer: 'SwiftShader via ANGLE (CPU)',
      frames: times.length,
      averageFrameMs: Math.round(average * 100) / 100,
      p95FrameMs: Math.round(percentile(sorted, 0.95) * 100) / 100,
      p99FrameMs: Math.round(percentile(sorted, 0.99) * 100) / 100,
      minFrameMs: Math.round(sorted[0] * 100) / 100,
      maxFrameMs: Math.round(sorted[sorted.length - 1] * 100) / 100,
      avgFps: Math.round((1000 / average) * 10) / 10,
      renderInfo: sample.renderInfo,
      errors: game.errors,
    };
  } finally {
    await game.close();
  }
}

mkdirSync('playtest', { recursive: true });
const results = [];
for (const world of worlds) {
  for (const size of sizes) {
    const result = await measure(world, size);
    results.push(result);
    console.log(
      `${world} ${size.name}: avg ${result.averageFrameMs} ms (${result.avgFps} fps), ` +
        `p95 ${result.p95FrameMs} ms, calls ${result.renderInfo?.calls ?? '?'}, ` +
        `tris ${result.renderInfo?.triangles ?? '?'}, pixelRatio ${result.renderInfo?.pixelRatio ?? '?'}`,
    );
  }
}
const name = label ? `playtest/perf-${label}.json` : 'playtest/perf.json';
writeFileSync(name, JSON.stringify(results, null, 2));
console.log(`wrote ${name}`);
if (results.some((result) => result.errors.length > 0)) process.exit(1);
