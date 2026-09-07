/**
 * Apply-pipeline round-trip spec for the Vite + React example.
 *
 * Drives the panel UI to tweak a token, walks the panel's Apply flow to the
 * write step, and asserts the demo tokens CSS file on disk
 * (`src/styles/tokens.css`) was rewritten by the bin sidecar. The full
 * bin -> file rewrite path is what the spec proves; the panel's in-memory
 * `:root` override is exercised as a side effect.
 *
 * Prerequisites
 * -------------
 *  - Vite dev server on `VITE_PORT` (default 44325), started by the
 *    Playwright `webServer` config.
 *  - Bin sidecar `zdtp-server` on `ZDTP_PORT` (default 24683), with
 *    `--write-root .` and `--routing scaffold.routing.json` pointing at this
 *    example's tree, and `--allow-origin` matching the Vite origin.
 *
 * Both are wired by `pnpm dev` (concurrently), which is what `webServer`
 * runs. The env vars let concurrent worktrees of this repo bind distinct
 * ports — see `playwright.config.ts`, `vite.config.ts` and package.json's
 * `_dev:vite` / `_dev:tokens-bin`.
 *
 * Panel chrome, as of @takazudo/zdtp 0.5.1
 * ----------------------------------------
 * Two things about the 0.5.x panel shape the locators below, and both broke
 * the pre-0.5 version of this spec:
 *
 *  - Every token row gained a bulk-select checkbox whose accessible name is
 *    `Select <label>` — so `getByLabel(/border radius/i)` resolves to that
 *    checkbox, not to the editor. The numeric editor's accessible name is
 *    `<cssVar> value` (`tokenpanel-row-number-input`), which is what this
 *    spec drives.
 *  - The header's action links (Export / Load from JSON / Apply / ...) are
 *    `display: none` under `@container tokenpanel (max-width: 1135px)` and
 *    collapse into a `Panel actions` menu button. The panel is far narrower
 *    than that at the default dock size, so Apply is only reachable through
 *    that menu. Everything the panel renders as a "button" here is a
 *    `div[role=button]`, not a native `<button>`, so role locators — not
 *    `button` CSS selectors — are the way in.
 *
 * There is no `Confirm` / `Apply Now` step: the modal opens on a dry-run
 * preview and the commit control is the primary button labelled
 * `Write N file(s) (M token(s))`, which carries `aria-disabled` until the
 * preview resolves.
 *
 * Restoration
 * -----------
 * `afterAll` rewrites the original value through the bin and then asserts
 * the file actually came back. A cleanup failure is deliberately NOT
 * swallowed: silently leaving `src/styles/tokens.css` dirty makes every
 * later run start from a different baseline and shows up as an unexplained
 * working-tree diff, which is worse than a noisy hook failure. Playwright
 * reports an `afterAll` error alongside — not instead of — any in-band test
 * failure, so surfacing it cannot mask the primary error.
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openPanel } from './panel-storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKENS_PATH = resolve(__dirname, '..', '..', 'src', 'styles', 'tokens.css');

/** Mirrors `resolvePort` in playwright.config.ts / scripts/smoke-apply.mjs. */
function resolvePort(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${envVar} must be an integer port, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

const ZDTP_PORT = resolvePort('ZDTP_PORT', 24683);
const VITE_PORT = resolvePort('VITE_PORT', 44325);
const APPLY_URL = `http://127.0.0.1:${ZDTP_PORT}/apply`;

// The sidecar compares the forwarded Origin header verbatim against its own
// --allow-origin, which `pnpm dev` derives from VITE_PORT. When the caller
// supplies BASE_URL it also owns the sidecar's --allow-origin, so that value
// wins over the port-derived default. An empty BASE_URL counts as unset —
// same rule resolvePort applies — otherwise it would silently produce an
// empty Origin header and every /apply POST would be rejected.
const ORIGIN =
  process.env.BASE_URL?.replace(/\/$/, '') || `http://localhost:${VITE_PORT}`;

async function readTokenValue(cssVar: string): Promise<string> {
  const css = await readFile(TOKENS_PATH, 'utf-8');
  const escaped = cssVar.replace(/-/g, '\\-');
  const re = new RegExp(`${escaped}:\\s*([^;]+);`);
  const m = css.match(re);
  if (!m) {
    throw new Error(`Could not find ${cssVar} in ${TOKENS_PATH}`);
  }
  return m[1].trim();
}

/**
 * Poll-friendly read: the bin writes atomically via a temp-file rename, so a
 * read can briefly land on a file that does not yet contain the var.
 */
async function readTokenValueOrEmpty(cssVar: string): Promise<string> {
  try {
    return await readTokenValue(cssVar);
  } catch {
    return '';
  }
}

async function postApply(cssVar: string, value: string): Promise<void> {
  const response = await fetch(APPLY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
    },
    body: JSON.stringify({ tokens: { [cssVar]: value } }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`POST /apply failed (${response.status}): ${text}`);
  }
}

test.describe('Vite + React example — apply pipeline round-trip', () => {
  const TARGET_VAR = '--vr-radius';
  /** The panel appends the item's configured unit itself — do not include it. */
  const TEST_INPUT = '1.25';
  /** `--vr-radius` is declared `{ kind: 'length', unit: 'rem' }` in the manifest. */
  const TEST_VALUE = `${TEST_INPUT}rem`;
  let originalValue = '';

  test.beforeAll(async () => {
    originalValue = await readTokenValue(TARGET_VAR);
    if (originalValue === TEST_VALUE) {
      throw new Error(
        `Test value ${TEST_VALUE} matches original — pick a different test value.`,
      );
    }
  });

  test.afterAll(async () => {
    if (!originalValue) return;
    await postApply(TARGET_VAR, originalValue);
    await expect
      .poll(() => readTokenValueOrEmpty(TARGET_VAR), {
        timeout: 5_000,
        intervals: [100, 250, 500],
        message: `Cleanup failed to restore ${TARGET_VAR} in ${TOKENS_PATH}`,
      })
      .toBe(originalValue);
  });

  test('panel-driven Apply rewrites the on-disk token value', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Seeds the visible flag and reloads, so the host adapter's eager-load
    // gate mounts the panel before first paint.
    await openPanel(page);

    // --- Tweak ------------------------------------------------------------
    const sizeTab = page.getByRole('tab', { name: /size/i });
    await expect(sizeTab).toBeVisible();
    await sizeTab.click();

    // NOT getByLabel(/border radius/i) — that is the row's bulk-select
    // checkbox in 0.5.x. See the header docblock.
    const radiusInput = page.getByLabel(`${TARGET_VAR} value`);
    await expect(radiusInput).toBeVisible();
    await radiusInput.fill(TEST_INPUT);

    // Guard: prove the edit committed to panel state before opening Apply.
    // Without this, a swallowed onChange shows up much later as a confusing
    // "no overrides to apply" in the modal.
    await expect
      .poll(() =>
        page.evaluate(
          (cssVar) => document.documentElement.style.getPropertyValue(cssVar).trim(),
          TARGET_VAR,
        ),
      )
      .toBe(TEST_VALUE);

    // --- Apply ------------------------------------------------------------
    const actionsMenuButton = page.getByRole('button', { name: 'Panel actions' });
    // The menu button's own click handler no-ops while it is display:none, so
    // assert visibility rather than clicking into a silent dead end.
    await expect(actionsMenuButton).toBeVisible();
    await actionsMenuButton.click();

    const actionsPopover = page.getByRole('dialog', { name: 'Panel actions' });
    await expect(actionsPopover).toBeVisible();
    await actionsPopover.getByRole('button', { name: 'Apply', exact: true }).click();

    const applyModal = page.getByRole('dialog', { name: 'Apply design tokens to codebase' });
    await expect(applyModal).toBeVisible();

    const writeButton = applyModal.getByRole('button', {
      name: /^Write \d+ files? \(\d+ tokens?\)$/,
    });
    await expect(writeButton).toBeVisible();

    // Preview completion: the modal fires a dryRun POST on open and keeps the
    // primary button aria-disabled until it resolves with a routed selection.
    await expect
      .poll(() => writeButton.getAttribute('aria-disabled'), {
        timeout: 15_000,
        intervals: [100, 250, 500],
        message: 'Apply preview never completed (Write button stayed aria-disabled)',
      })
      .toBeNull();

    // Only --vr-radius was tweaked, and scaffold.routing.json maps the whole
    // `vr` prefix to one file — so the preview must resolve to exactly one.
    await expect(writeButton).toHaveText('Write 1 file (1 token)');
    await writeButton.click();

    // --- Assert the disk write -------------------------------------------
    const doneButton = applyModal.getByRole('button', { name: 'Done', exact: true });
    await expect(doneButton).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(() => readTokenValueOrEmpty(TARGET_VAR), {
        timeout: 5_000,
        intervals: [100, 250, 500],
      })
      .toBe(TEST_VALUE);

    await doneButton.click();
    await expect(applyModal).toBeHidden();
  });
});
