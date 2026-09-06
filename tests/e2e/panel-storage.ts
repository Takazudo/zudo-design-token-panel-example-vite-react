/**
 * Shared panel-storage helpers for the e2e specs.
 *
 * Why this module exists
 * ----------------------
 * Every spec needs the same two things: seed the flag that makes the host
 * adapter eagerly load the panel, and wipe every key the panel may have
 * written so the next test starts clean. Both were previously copy-pasted
 * into each spec as hard-coded key literals, and both went stale the same
 * way: the cleanup removed `${prefix}-state-v2` only, while the package
 * migrates a state envelope forward (v1/v2 -> v3 -> v4) and deletes the old
 * key. Once a test's tweaks were persisted as v4, `clearPanelStorage` left
 * them behind and they bled into the following test.
 *
 * The fix is to stop hand-rolling the key set. `@takazudo/zdtp/constants` is
 * a zero-import sub-entry publishing the package's two registries:
 *
 *   EAGER_LOAD_GATE_KEY_SUFFIXES — the fixed eager-load flags
 *                                  (`:visible`, `-open`, `:autoload`,
 *                                  `-elpath-enabled`, `-domtweaker-enabled`)
 *   READABLE_STATE_KEY_SUFFIXES  — every state version the current loader
 *                                  can still read (v1 … v4)
 *
 * A future storage-version bump lands in those registries, so this cleanup
 * follows the package instead of drifting behind it.
 *
 * Preference keys (`-highlight-slots`, `-highlight-active`) are deliberately
 * NOT in the registries — they are not eager-load signals — so the specs'
 * own list of them is kept below.
 */

import type { Page } from '@playwright/test';
import {
  EAGER_LOAD_GATE_KEY_SUFFIXES,
  READABLE_STATE_KEY_SUFFIXES,
} from '@takazudo/zdtp/constants';

/** Mirrors `storagePrefix` in `src/config/panel-config.ts`. */
const STORAGE_PREFIX = 'vite-react-example-tokens';

/**
 * The `:visible` flag, seeded by `openPanel` below.
 *
 * `'1'` is the canonical truthy value — the package's registry lists it as
 * the only accepted value for this suffix, so any other value is ignored by
 * the eager-load gate.
 */
export const STORAGE_KEY_VISIBLE = `${STORAGE_PREFIX}:visible`;

/** Panel preference keys, which the package's signal registries exclude. */
const LOCAL_PREFERENCE_KEYS = [`${STORAGE_PREFIX}-highlight-slots`];
const SESSION_PREFERENCE_KEYS = [`${STORAGE_PREFIX}-highlight-active`];

/** Every localStorage key a panel session may have written. */
const LOCAL_KEYS: readonly string[] = [
  ...Object.keys(EAGER_LOAD_GATE_KEY_SUFFIXES).map((suffix) => STORAGE_PREFIX + suffix),
  ...Object.values(READABLE_STATE_KEY_SUFFIXES).map((suffix) => STORAGE_PREFIX + suffix),
  ...LOCAL_PREFERENCE_KEYS,
];

/**
 * Seed visibility intent, reload, and wait for the panel shell to mount.
 *
 * Seeding + reloading (rather than calling the console API) exercises the
 * host adapter's eager-load gate itself: the panel must be in the DOM before
 * first paint, which is the behaviour that regresses when the gate probes a
 * storage key the package no longer writes.
 */
export async function openPanel(page: Page): Promise<void> {
  await page.evaluate((visibleKey) => {
    localStorage.setItem(visibleKey, '1');
  }, STORAGE_KEY_VISIBLE);

  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  await page.locator('.tokenpanel-shell').waitFor({ state: 'visible', timeout: 10_000 });
}

/** Remove every panel key so the next test starts from a clean slate. */
export async function clearPanelStorage(page: Page): Promise<void> {
  await page.evaluate(
    ({ localKeys, sessionKeys }) => {
      for (const key of localKeys) localStorage.removeItem(key);
      for (const key of sessionKeys) sessionStorage.removeItem(key);
    },
    { localKeys: LOCAL_KEYS, sessionKeys: SESSION_PREFERENCE_KEYS },
  );
}
