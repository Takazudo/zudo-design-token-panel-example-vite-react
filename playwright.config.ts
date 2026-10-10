/**
 * Playwright config for the Vite + React example's browser suite.
 *
 * The suite runs against the repo's real dev topology: the Vite dev server
 * (`_dev:vite`, `VITE_PORT`) and the `zdtp-server` apply sidecar
 * (`_dev:tokens-bin`, `ZDTP_PORT`), the same two scripts `pnpm dev` composes.
 * Each is its own webServer entry, so Playwright waits on both and fails the
 * run if either one does not come up. `tests/e2e/global-setup.ts` then proves
 * the listeners are this checkout's (sidecar writeRoot/routing, proxy wiring).
 *
 * `reuseExistingServer: false`: a run either owns its servers or fails loudly
 * on an occupied port, instead of silently adopting a stale orphan.
 *
 * When BASE_URL is supplied, the caller manages both servers (e.g. a
 * `pnpm dev` you keep running) and no webServer is started.
 *
 * `workers: 1` + no parallelism: the apply spec rewrites
 * `src/styles/tokens.css` on disk, and every spec shares one dev server.
 */

import { defineConfig, devices } from '@playwright/test';
// Ports and origin resolve in exactly one place so vite.config.ts,
// package.json's `_dev:tokens-bin` and this config cannot disagree.
import { BROWSER_ORIGIN, ZDTP_PORT } from './scripts/ports.mjs';

const isCI = Boolean(process.env.CI);
const hasExternalBaseUrl = Boolean(process.env.BASE_URL);

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 0,
  workers: 1,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'html',
  timeout: isCI ? 60 * 1000 : 30 * 1000,
  use: {
    baseURL: BROWSER_ORIGIN,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: hasExternalBaseUrl
    ? undefined
    : [
        {
          command: 'pnpm run _dev:vite',
          url: `${BROWSER_ORIGIN}/`,
          reuseExistingServer: false,
          timeout: 120 * 1000,
        },
        {
          command: 'pnpm run _dev:tokens-bin',
          url: `http://127.0.0.1:${ZDTP_PORT}/healthz`,
          reuseExistingServer: false,
          timeout: 60 * 1000,
        },
      ],
});
