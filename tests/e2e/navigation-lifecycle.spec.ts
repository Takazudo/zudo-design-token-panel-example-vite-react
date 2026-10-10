/**
 * HashRouter navigation + panel ownership/lifecycle.
 *
 * Client-side swap proof: a `window.__marker` set before navigating survives
 * every sidenav click and browser back/forward. A full document load would
 * drop it, so `page.goto` is never used between routes here.
 *
 * The Prose link is different by design: prose.html is a second Vite MPA
 * entry, so reaching it is a full document load. That path is tested for
 * persistence across the reload instead (and asserts the marker is gone).
 *
 * Lifecycle: the panel is opened/closed only through the host's topbar
 * trigger, and after every navigation and toggle the page holds exactly one
 * panel root (plus one set of the panel's document-level mounts).
 */

import type { Page } from '@playwright/test';
import {
  PROSE_URL,
  closeViaHeader,
  expect,
  expectSinglePanelInstance,
  hashUrl,
  navigateViaSidenav,
  openViaHeader,
  panelShell,
  setLengthToken,
  test,
  toggleViaHeader,
} from './support';

const ROUTES = [
  { label: 'About', route: '/about' },
  { label: 'Forms', route: '/forms' },
  { label: 'Status', route: '/status' },
  { label: 'Widgets', route: '/widgets' },
  { label: 'Data', route: '/data' },
  { label: 'Home', route: '/' },
] as const;

type MarkedWindow = Window & { __marker?: number };

async function setMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as MarkedWindow).__marker = 1;
  });
}

async function marker(page: Page): Promise<number | undefined> {
  return page.evaluate(() => (window as MarkedWindow).__marker);
}

async function expectSameDocument(page: Page): Promise<void> {
  expect(await marker(page)).toBe(1);
}

const pageTitle = (page: Page) => page.locator('.vr-page-title');

test('sidenav navigation and back/forward are client-side swaps that keep one open panel', async ({
  page,
}) => {
  await page.goto('/');
  await openViaHeader(page);
  await setMarker(page);

  await navigateViaSidenav(page, 'About', '/about');
  await expect(pageTitle(page)).toHaveText('About this example');
  await expectSameDocument(page);
  await expectSinglePanelInstance(page, 1);
  await expect(panelShell(page)).toBeVisible();

  await navigateViaSidenav(page, 'Forms', '/forms');
  await expect(pageTitle(page)).toHaveText('Form controls demo');
  await expectSameDocument(page);
  await expectSinglePanelInstance(page, 1);

  await page.goBack();
  await expect(page).toHaveURL(hashUrl('/about'));
  await expect(pageTitle(page)).toHaveText('About this example');
  await expectSameDocument(page);
  await expectSinglePanelInstance(page, 1);

  await page.goBack();
  await expect(pageTitle(page)).toHaveText('Live token tweaking, in plain Vite + React');
  await expectSameDocument(page);
  await expectSinglePanelInstance(page, 1);

  await page.goForward();
  await expect(page).toHaveURL(hashUrl('/about'));
  await expect(pageTitle(page)).toHaveText('About this example');
  await expectSameDocument(page);
  await expectSinglePanelInstance(page, 1);
  await expect(panelShell(page)).toBeVisible();
});

test('repeated open/close across navigation never duplicates the panel', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  await setMarker(page);

  for (let round = 0; round < 2; round += 1) {
    for (const { label, route } of ROUTES) {
      await navigateViaSidenav(page, label, route);
      await expectSinglePanelInstance(page, 1);
      await closeViaHeader(page);
      await expectSinglePanelInstance(page, 0);
      await openViaHeader(page);
      await expectSinglePanelInstance(page, 1);
    }
  }
  await expectSameDocument(page);
});

test('panel visibility persists across navigation and reload', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);

  await page.reload();
  await expect(panelShell(page)).toBeVisible();
  await expectSinglePanelInstance(page, 1);

  await closeViaHeader(page);
  await navigateViaSidenav(page, 'About', '/about');
  await expectSinglePanelInstance(page, 0);

  await page.reload();
  await expect(pageTitle(page)).toHaveText('About this example');
  await expectSinglePanelInstance(page, 0);

  await toggleViaHeader(page);
  await expect(panelShell(page)).toBeVisible();
  await navigateViaSidenav(page, 'Home', '/');
  await expect(panelShell(page)).toBeVisible();
  await expectSinglePanelInstance(page, 1);
});

test('a token edit persists across client navigation and reload', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  await expect(pageTitle(page)).toHaveCSS('font-size', '28px');

  await setLengthToken(page, /^font$/i, '--vr-scale-xl', '2.5');
  await expect(pageTitle(page)).toHaveCSS('font-size', '40px');

  await setMarker(page);
  await navigateViaSidenav(page, 'About', '/about');
  await expect(pageTitle(page)).toHaveText('About this example');
  await expect(pageTitle(page)).toHaveCSS('font-size', '40px');
  await navigateViaSidenav(page, 'Home', '/');
  await expect(pageTitle(page)).toHaveCSS('font-size', '40px');
  await expectSameDocument(page);

  await page.reload();
  await expect(pageTitle(page)).toHaveCSS('font-size', '40px');
  await expectSinglePanelInstance(page, 1);
});

test('the Prose link is a full MPA load that keeps panel visibility and token edits', async ({
  page,
}) => {
  await page.goto('/');
  await openViaHeader(page);
  await setLengthToken(page, /^font$/i, '--vr-scale-xl', '2.5');
  await setMarker(page);

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Prose', exact: true })
    .click();
  await expect(page).toHaveURL(PROSE_URL);
  // A new document: the marker is gone, the panel re-mounted from storage.
  expect(await marker(page)).toBeUndefined();
  await expect(panelShell(page)).toBeVisible();
  await expectSinglePanelInstance(page, 1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--vr-scale-xl').trim(),
      ),
    )
    .toBe('2.5rem');

  await closeViaHeader(page);
  await page.getByRole('link', { name: '← Back to component gallery' }).click();
  await expect(pageTitle(page)).toHaveText('Live token tweaking, in plain Vite + React');
  await expectSinglePanelInstance(page, 0);
  await expect(pageTitle(page)).toHaveCSS('font-size', '40px');
});
