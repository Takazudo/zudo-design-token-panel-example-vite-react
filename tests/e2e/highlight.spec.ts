/**
 * Highlight overlay coverage for the Vite + React example.
 *
 *   (a) The host trigger opens and closes the panel on every primary route
 *       (6 hash routes + the /prose.html MPA entry).
 *   (b) Toggling the eye icon on `--vr-palette-1` draws an overlay over a
 *       real element, outlined in highlight slot 0's default color.
 *   (c) "Disable all highlights" removes overlays and empties the active map
 *       while leaving the slot colors untouched.
 *
 * Storage (prefix `vite-react-example-tokens`):
 *   highlight slots  → localStorage   `vite-react-example-tokens-highlight-slots`
 *   active map       → sessionStorage `vite-react-example-tokens-highlight-active`
 */

import type { Page } from '@playwright/test';
import {
  PROSE_URL,
  STORAGE_PREFIX,
  closeViaHeader,
  expect,
  hashUrl,
  openViaHeader,
  panelShell,
  test,
} from './support';

const STORAGE_KEY_HIGHLIGHT_SLOTS = `${STORAGE_PREFIX}-highlight-slots`;
const STORAGE_KEY_HIGHLIGHT_ACTIVE = `${STORAGE_PREFIX}-highlight-active`;

const ALL_ROUTES = [
  { label: 'Home', url: hashUrl('/') },
  { label: 'About', url: hashUrl('/about') },
  { label: 'Forms', url: hashUrl('/forms') },
  { label: 'Status', url: hashUrl('/status') },
  { label: 'Widgets', url: hashUrl('/widgets') },
  { label: 'Data', url: hashUrl('/data') },
  { label: 'Prose', url: PROSE_URL },
] as const;

async function highlightPalette1(page: Page): Promise<void> {
  const shell = panelShell(page);
  await shell.getByRole('tab', { name: /^color$/i }).click();
  await shell.locator('[title="Highlight elements using --vr-palette-1"]').click();
  await expect(page.locator('.tokenpanel-highlight-overlay').first()).toBeAttached();
}

test.describe('(a) host trigger toggles the panel on every primary route', () => {
  for (const route of ALL_ROUTES) {
    test(`${route.label} route`, async ({ page }) => {
      await page.goto(route.url);
      await openViaHeader(page);
      await closeViaHeader(page);
      await openViaHeader(page);
    });
  }
});

test('(b) eye icon on --vr-palette-1 draws an overlay in slot 0 color', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  await highlightPalette1(page);

  const overlay = page.locator('.tokenpanel-highlight-overlay').first();
  const rect = await overlay.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.width).toBeGreaterThan(0);
  expect(rect!.height).toBeGreaterThan(0);

  // Slot 0 default color #ff2d2d, drawn as `inset 0 0 0 <w>px <color>`.
  const boxShadow = await overlay.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(boxShadow).toMatch(/inset/);
  expect(boxShadow).toContain('rgb(255, 45, 45)');
});

test('(c) Disable all highlights clears the active map and keeps slot colors', async ({
  page,
}) => {
  await page.goto('/');
  await openViaHeader(page);
  await highlightPalette1(page);

  const readSlots = () =>
    page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY_HIGHLIGHT_SLOTS);
  const slotsBefore = await readSlots();

  await panelShell(page).locator('[aria-label="Highlight outline settings"]').click();
  await expect(page.locator('.tokenpanel-highlight-settings-popover')).toBeVisible();
  await page
    .locator('.tokenpanel-highlight-settings-footer')
    .getByText('Disable all highlights')
    .click();

  await expect(page.locator('.tokenpanel-highlight-overlay')).toHaveCount(0);
  const active = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key) ?? '{}') as Record<string, number>,
    STORAGE_KEY_HIGHLIGHT_ACTIVE,
  );
  expect(active).toEqual({});
  expect(await readSlots()).toBe(slotsBefore);
});
