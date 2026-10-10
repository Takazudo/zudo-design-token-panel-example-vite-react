/**
 * "Change a token in the panel → a visible element's computed style updates."
 *
 * One representative consumer per token category, each edited through the
 * panel UI (no direct `:root` writes):
 *   - font scale  `--vr-scale-md`   → `.vr-subsection-title` font-size on /#/forms
 *                 (via `--vr-text-subsection-title: var(--vr-scale-md)`)
 *   - spacing     `--vr-vsp-md`     → `.vr-card` padding-top on /
 *   - color       `--vr-palette-1`  → palette swatch #1 background on /
 *
 * Each test gets a fresh browser context, so no panel state leaks between
 * tests; nothing here touches the apply sidecar or the file on disk.
 */

import { expect, hashUrl, openViaHeader, panelShell, setLengthToken, test } from './support';

test('font scale: --vr-scale-md resizes the subsection titles', async ({ page }) => {
  await page.goto(hashUrl('/forms'));
  await openViaHeader(page);
  const title = page.locator('.vr-subsection-title').first();
  await expect(title).toHaveCSS('font-size', '18px');

  await setLengthToken(page, /^font$/i, '--vr-scale-md', '1.5');

  await expect(title).toHaveCSS('font-size', '24px');
});

test('spacing: --vr-vsp-md changes card padding', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const card = page.locator('.vr-card').first();
  await expect(card).toHaveCSS('padding-top', '16px');

  await setLengthToken(page, /^spacing$/i, '--vr-vsp-md', '2');

  await expect(card).toHaveCSS('padding-top', '32px');
});

test('color: --vr-palette-1 repaints palette swatch #1', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const swatch = page.locator('.vr-swatch').nth(1);
  await expect(swatch).toHaveCSS('background-color', 'rgb(45, 108, 223)');

  const shell = panelShell(page);
  await shell.getByRole('tab', { name: /^color$/i }).click();
  await shell.locator('[aria-label^="--vr-palette-1:"]').click();
  const hexInput = page.locator('.tokenpanel-color-picker-hex-input');
  await hexInput.fill('#ff0000');
  await hexInput.press('Enter');

  await expect(swatch).toHaveCSS('background-color', 'rgb(255, 0, 0)');
});
