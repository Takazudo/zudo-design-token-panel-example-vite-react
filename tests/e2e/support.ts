/**
 * Shared constants, the error-gated `test` fixture, and panel helpers for the
 * Vite + React example's browser suite.
 *
 * Every spec imports `test` / `expect` from here, not from `@playwright/test`,
 * so the auto `diagnostics` fixture runs on every page of every test: any
 * console error, uncaught page error, failed request, or HTTP >= 400 response
 * on any visited route fails that test.
 *
 * Each test gets a fresh browser context, so no panel state (localStorage /
 * sessionStorage) leaks between tests.
 */

import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_ORIGIN, ZDTP_PORT } from '../../scripts/ports.mjs';

export { expect };

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TOKENS_PATH = resolve(REPO_ROOT, 'src', 'styles', 'tokens.css');
export const ORIGIN = BROWSER_ORIGIN;
export const SIDECAR_ORIGIN = `http://127.0.0.1:${ZDTP_PORT}`;
export const HOME_TITLE = 'Vite + React Example — Design Token Panel';

// The panel derives its root id from `storagePrefix` in src/config/panel-config.ts.
export const STORAGE_PREFIX = 'vite-react-example-tokens';
export const PANEL_ROOT_ID = `${STORAGE_PREFIX}-root`;

export const test = base.extend<{ diagnostics: string[] }>({
  diagnostics: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          problems.push(`console.error: ${message.text()} (${message.location().url})`);
        }
      });
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      page.on('requestfailed', (request) => {
        problems.push(
          `requestfailed: ${request.method()} ${request.url()} [${request.resourceType()}]` +
            ` — ${request.failure()?.errorText}`,
        );
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          problems.push(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`);
        }
      });
      await use(problems);
      expect(problems, 'console errors, page errors and failed requests').toEqual([]);
    },
    { auto: true },
  ],
});

/** Absolute URL for a HashRouter route (`'/about'` → `<origin>/#/about`). */
export function hashUrl(route: string): string {
  return `${ORIGIN}/#${route}`;
}

export const PROSE_URL = `${ORIGIN}/prose.html`;

export function panelShell(page: Page): Locator {
  return page.locator('.tokenpanel-shell');
}

/** The host's own trigger button (AppShell topbar / prose page), not the console API. */
export async function toggleViaHeader(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open Design Token Panel', exact: true }).click();
}

export async function openViaHeader(page: Page): Promise<void> {
  await expect(panelShell(page)).toHaveCount(0);
  await toggleViaHeader(page);
  await expect(panelShell(page)).toBeVisible();
}

export async function closeViaHeader(page: Page): Promise<void> {
  await expect(panelShell(page)).toBeVisible();
  await toggleViaHeader(page);
  await expect(panelShell(page)).toHaveCount(0);
}

/** Client-router navigation through the sidenav (never `page.goto`). */
export async function navigateViaSidenav(page: Page, label: string, route: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: label, exact: true })
    .click();
  await expect(page).toHaveURL(hashUrl(route));
  await expect(page.locator('.vr-sidenav-link.is-active')).toHaveText(label);
}

/**
 * Exactly one panel instance: one panel root, one set of the panel's
 * document-level mounts, one injected stylesheet, and at most one shell.
 */
export async function expectSinglePanelInstance(page: Page, shellCount: 0 | 1): Promise<void> {
  await expect(page.locator(`[id="${PANEL_ROOT_ID}"]`)).toHaveCount(1);
  for (const mount of ['highlight', 'elpath', 'element-inspect', 'domtweaker']) {
    await expect(page.locator(`[id="tokenpanel-${mount}-mount"]`)).toHaveCount(1);
  }
  // The stylesheet the panel self-injects on first mount (PORTABLE-CONTRACT §4.1.4).
  await expect(page.locator('style#zudo-design-token-panel-styles')).toHaveCount(1);
  await expect(panelShell(page)).toHaveCount(shellCount);
}

/**
 * Header actions collapse behind the "Panel actions" kebab when the shell is
 * narrower than the header's container query (zdtp recipe "Reaching header
 * actions", id-based pattern).
 */
export async function clickHeaderAction(
  page: Page,
  id: 'export' | 'import' | 'apply' | 'reset',
): Promise<void> {
  const shell = panelShell(page);
  const action = shell.locator(`[data-zdtp-action="${id}"]:visible`);
  if ((await action.count()) === 0) {
    await shell.getByRole('button', { name: 'Panel actions', exact: true }).click();
  }
  await action.click();
}

/** Opens a panel tab and fills a length token's numeric input. */
export async function setLengthToken(
  page: Page,
  tab: RegExp,
  cssVar: string,
  numericValue: string,
): Promise<void> {
  await panelShell(page).getByRole('tab', { name: tab }).click();
  const input = panelShell(page).getByRole('textbox', { name: `${cssVar} value`, exact: true });
  await input.fill(numericValue);
  await input.press('Tab');
}

export function rootTokenValue(page: Page, cssVar: string): Promise<string> {
  return page.evaluate(
    (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    cssVar,
  );
}
