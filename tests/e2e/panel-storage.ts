/**
 * Shared panel-storage helpers for the e2e specs.
 *
 * Why this module exists
 * ----------------------
 * Every spec needs the same two things: seed the flag that makes the host
 * adapter eagerly load the panel, and wipe every key the panel may have
 * written so the next test starts clean. Both were copy-pasted into each
 * spec as hard-coded key literals, and the cleanup went stale: it removed
 * `${prefix}-state-v2` only, while the package migrates a state envelope
 * forward (v1/v2 -> v3 -> v4) and deletes the old key. Once a test's tweaks
 * were persisted as v4, `clearPanelStorage` left them behind and they bled
 * into the following test.
 *
 * Why this sweeps by prefix instead of listing keys
 * -------------------------------------------------
 * `@takazudo/zdtp/constants` publishes the package's key registries
 * (`EAGER_LOAD_GATE_KEY_SUFFIXES`, `READABLE_STATE_KEY_SUFFIXES`), and the
 * host adapter's eager-load gate in `src/lib/mount-panel.ts` is built from
 * them — it runs on the synchronous bootstrap path, where enumerating
 * storage is not acceptable, so it must construct the exact keys it probes.
 *
 * A test cleanup has neither constraint, and needs a WIDER set than those
 * registries describe: the registries deliberately exclude preference keys,
 * and the panel now persists a growing pile of them (dock mode, position,
 * size, density, specimen, highlight slots, spawn ordinal, …). Enumerating
 * every key under the host's `storagePrefix` covers all of them, and stays
 * correct through any future key the package adds — which is exactly the
 * drift that broke the previous version of this helper.
 */

import type { Page } from '@playwright/test';

/** Mirrors `storagePrefix` in `src/config/panel-config.ts`. */
const STORAGE_PREFIX = 'vite-react-example-tokens';

/**
 * The `:visible` flag, seeded by `openPanel` below.
 *
 * `'1'` is the canonical truthy value — the package's eager-load registry
 * lists it as the only accepted value for this suffix, so any other value is
 * ignored by the gate. Note the `:` separator, which is historical: every
 * other derived key uses `-`.
 */
export const STORAGE_KEY_VISIBLE = `${STORAGE_PREFIX}:visible`;

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

/** Remove every key under the panel's storage prefix, in both stores. */
export async function clearPanelStorage(page: Page): Promise<void> {
  await page.evaluate((prefix) => {
    for (const store of [localStorage, sessionStorage]) {
      // Collect first: removing during the index walk shifts the remaining
      // keys down and would skip every other match.
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key !== null && key.startsWith(prefix)) doomed.push(key);
      }
      for (const key of doomed) store.removeItem(key);
    }
  }, STORAGE_PREFIX);
}
