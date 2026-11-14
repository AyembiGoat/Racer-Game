import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

/**
 * Find a browser. Set CHROME_PATH to use an installed Chrome. Otherwise, on Linux,
 * use the Chromium that ships inside the @sparticuz/chromium package, which needs
 * no download beyond `npm install`.
 */
async function findBrowser() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, env: process.env };
  if (process.platform !== 'linux') {
    throw new Error('Set CHROME_PATH to your Chrome or Chromium executable.');
  }

  const { default: chromium } = await import('@sparticuz/chromium');
  const executablePath = await chromium.executablePath();

  // The package carries the system libraries Chromium needs (NSS and friends) for
  // machines that lack them. Unpack them once and put them on the library path.
  const libraries = path.join(tmpdir(), 'racer-game-chromium-libs');
  if (!existsSync(libraries)) {
    const require = createRequire(import.meta.url);
    const packageDir = path.dirname(path.dirname(require.resolve('@sparticuz/chromium')));
    const archive = path.join(tmpdir(), 'racer-game-chromium-libs.tar');
    writeFileSync(
      archive,
      brotliDecompressSync(readFileSync(path.join(packageDir, 'bin', 'al2023.tar.br'))),
    );
    mkdirSync(libraries, { recursive: true });
    execFileSync('tar', ['-xf', archive, '-C', libraries]);
  }
  const libraryPath = [path.join(libraries, 'lib'), process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(':');
  return { executablePath, env: { ...process.env, LD_LIBRARY_PATH: libraryPath } };
}

/**
 * Open the game in automation mode. Returns the page plus helpers:
 *   step(input, steps)  hold an input for a number of 60 Hz steps
 *   bot(steps)          let the bot drive
 *   state()             the current game state
 *   camera()            active camera mode (`chase` or `bonnet`)
 *   setCamera(mode)     switch camera mode
 *   reset()             return to the starting grid
 *   screenshot(file)    save what is on screen
 * `errors` collects anything the page logged as an error.
 */
export async function launchGame({ width = 1280, height = 720, mode = 'auto' } = {}) {
  const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Dev server did not start');

  const { executablePath, env } = await findBrowser();
  const browser = await puppeteer.launch({
    executablePath,
    env,
    headless: 'shell',
    // Software WebGL: slow, but it works on machines with no graphics card.
    args: [
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height });

  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`http://127.0.0.1:${address.port}/?${mode}`, { waitUntil: 'load' });
  if (mode === 'auto') {
    await page.waitForFunction(() => window.__racer !== undefined, { timeout: 60000 });
  }

  return {
    page,
    errors,
    step: (input = {}, steps = 1) =>
      page.evaluate((i, n) => window.__racer.step(i, n), input, steps),
    bot: (steps = 1) => page.evaluate((n) => window.__racer.bot(n), steps),
    state: () => page.evaluate(() => window.__racer.state()),
    camera: () => page.evaluate(() => window.__racer.camera()),
    setCamera: (cameraMode) => page.evaluate((m) => window.__racer.setCamera(m), cameraMode),
    reset: () => page.evaluate(() => window.__racer.reset()),
    async screenshot(file) {
      mkdirSync(path.dirname(file), { recursive: true });
      await page.screenshot({ path: file });
      return file;
    },
    async close() {
      await browser.close();
      await server.close();
    },
  };
}
