/**
 * Routes-smoke spec for the Vite + React example.
 *
 * Visits each primary route and asserts:
 *   1. The page-level heading (.vr-page-title) is visible.
 *   2. (widgets only) Each of the three tabs can be clicked and the active
 *      tab class moves to the clicked tab.
 *   3. (data only) All 5 data-component class selectors are present on the page.
 *
 * The `diagnostics` fixture from ./support additionally fails a route on any
 * console error, page error, failed request, or HTTP >= 400 response.
 *
 * Route inventory (7 routes tested, all full loads via `page.goto`):
 *   /                   → Home          (index.html, hash route /)
 *   /#/about            → About
 *   /#/forms            → Form controls demo
 *   /#/status           → Status badges / indicators
 *   /#/widgets          → Interactive widgets (tabs assertion)
 *   /#/data             → Data components (data-component assertion)
 *   /prose.html         → Prose typography demo (separate MPA entry)
 *
 * HashRouter routes live under `index.html` as URL fragments; `page.goto`
 * needs the absolute URL (origin + fragment), which `hashUrl` builds.
 */

import { PROSE_URL, expect, hashUrl, test } from './support';

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

/** Hash-router routes plus the separate MPA prose page. */
const HASH_ROUTES = [
  { label: 'Home',    route: '/',        heading: /live token tweaking/i        },
  { label: 'About',   route: '/about',   heading: /about/i                      },
  { label: 'Forms',   route: '/forms',   heading: /form controls/i              },
  { label: 'Status',  route: '/status',  heading: /status/i                     },
  { label: 'Widgets', route: '/widgets', heading: /interactive widgets/i        },
  { label: 'Data',    route: '/data',    heading: /data.*demo|data.*media/i     },
] as const;

// ---------------------------------------------------------------------------
// Route navigation + heading assertions
// ---------------------------------------------------------------------------

test.describe('Vite + React example — routes smoke', () => {
  for (const route of HASH_ROUTES) {
    test(`${route.label} route: page heading is visible`, async ({ page }) => {
      await page.goto(hashUrl(route.route));
      await page.waitForLoadState('domcontentloaded');

      // .vr-page-title is the framework-prefixed heading class used across
      // all Vite + React example pages (div role=heading aria-level=1).
      const heading = page.locator('.vr-page-title').first();
      await expect(heading).toBeVisible({ timeout: 10_000 });
      await expect(heading).toHaveText(route.heading);
    });
  }

  test('Prose route (MPA page): page heading is visible', async ({ page }) => {
    // Prose is a separate HTML entry — NOT a hash route.  It has its own
    // heading class specific to the prose layout.  We look for any h1 or
    // role=heading/aria-level=1 since the prose page may use semantic markup
    // or a custom component depending on the MDX/layout setup.
    await page.goto(PROSE_URL);
    await page.waitForLoadState('domcontentloaded');

    // The prose page uses either .vr-page-title (if the shared layout applies)
    // or a semantic h1.  Accept either.
    const heading = page
      .locator('.vr-page-title, [role="heading"][aria-level="1"], h1')
      .first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // Widgets page — tab-switching assertion
  //
  // The Vite + React Tabs component uses plain <button> elements with an
  // .is-active CSS modifier.  There is no ARIA tablist because the chrome-button
  // policy was not applied to this legacy component; we locate by class only.
  // -------------------------------------------------------------------------

  test('Widgets route: clicking each tab moves the active class', async ({ page }) => {
    await page.goto(hashUrl('/widgets'));
    await page.waitForLoadState('domcontentloaded');

    // Wait for the tabs container.
    const tabsContainer = page.locator('.vr-tabs').first();
    await tabsContainer.waitFor({ state: 'visible', timeout: 10_000 });

    const tabs = tabsContainer.locator('.vr-tabs__tab');
    await expect(tabs).toHaveCount(3, { timeout: 5_000 });

    // Tab 0 (Overview) is active by default.
    await expect(tabs.nth(0)).toHaveClass(/is-active/);

    // Click tab 1 (Details) and assert active class moves.
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/is-active/);
    await expect(tabs.nth(0)).not.toHaveClass(/is-active/);

    // Click tab 2 (Settings) and assert active class moves.
    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveClass(/is-active/);
    await expect(tabs.nth(1)).not.toHaveClass(/is-active/);
  });

  // -------------------------------------------------------------------------
  // Data page — 5-component presence assertion
  //
  // Each Vite + React data component has a unique BEM root class:
  //   StatCard    → .vr-stat-card
  //   ProfileCard → .vr-profile-card
  //   MediaCard   → .vr-media-card
  //   AvatarRow   → .vr-avatar-row
  //   DataTable   → .vr-table
  // -------------------------------------------------------------------------

  test('Data route: all 5 data-component selectors are present', async ({ page }) => {
    await page.goto(hashUrl('/data'));
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('.vr-stat-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.vr-profile-card').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.vr-media-card').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.vr-avatar-row').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.vr-table').first()).toBeVisible({ timeout: 5_000 });
  });
});
