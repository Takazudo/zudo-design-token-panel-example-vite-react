/**
 * Playwright config for the Vite + React example's apply-pipeline e2e spec.
 *
 * Local runs: webServer auto-starts the example's dev server.
 * On CI / when BASE_URL is supplied externally: the caller manages the
 * server lifecycle (so a separate workflow step can boot the bin sidecar
 * + Vite dev server together via `pnpm dev`).
 */

import { defineConfig, devices } from '@playwright/test';

const hasExternalBaseUrl = Boolean(process.env.BASE_URL);

// VITE_PORT lets concurrent worktrees of this repo run on distinct ports —
// see vite.config.ts and package.json's `_dev:vite` / `_dev:tokens-bin`.
function resolvePort(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${envVar} must be an integer port, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

const VITE_PORT = resolvePort('VITE_PORT', 44325);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  maxFailures: 0,
  timeout: process.env.CI ? 60 * 1000 : 30 * 1000,
  use: {
    baseURL: process.env.BASE_URL || `http://localhost:${VITE_PORT}`,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'apply-roundtrip',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer:
    process.env.CI || hasExternalBaseUrl
      ? undefined
      : {
          command: 'pnpm dev',
          port: VITE_PORT,
          reuseExistingServer: false,
          timeout: 120 * 1000,
        },
});
