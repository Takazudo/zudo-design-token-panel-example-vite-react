#!/usr/bin/env node
/**
 * Manual smoke harness for the bin sidecar.
 *
 * Requires `pnpm dev` to already be running in this example sub-package
 * (so the bin is listening on http://127.0.0.1:24683). The harness:
 *
 *   1. Reads the current value of `--vr-radius` from
 *      src/styles/tokens.css.
 *   2. POSTs a different value to /apply.
 *   3. Re-reads the file and asserts the value changed.
 *   4. Restores the original value with a second POST.
 *
 * The try/finally block ensures the original value is restored even if any
 * assertion fails, so re-running the harness gives consistent results.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKENS_PATH = resolve(__dirname, '..', 'src', 'styles', 'tokens.css');

// VITE_PORT / ZDTP_PORT let concurrent worktrees of this repo run on
// distinct ports — see vite.config.ts and package.json's `_dev:vite` /
// `_dev:tokens-bin`. ORIGIN must track VITE_PORT: the sidecar compares the
// forwarded Origin header verbatim against its own --allow-origin.
function resolvePort(envVar, fallback) {
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
const ORIGIN = `http://localhost:${VITE_PORT}`;
const TARGET_VAR = '--vr-radius';
const TEST_VALUE = '1.25rem';

async function readTokenValue(cssVar) {
  const css = await readFile(TOKENS_PATH, 'utf-8');
  const escaped = cssVar.replace(/-/g, '\\-');
  const re = new RegExp(`${escaped}:\\s*([^;]+);`);
  const m = css.match(re);
  if (!m) {
    throw new Error(`Could not find ${cssVar} in ${TOKENS_PATH}`);
  }
  return m[1].trim();
}

async function postApply(cssVar, value) {
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
  return response.json();
}

async function main() {
  console.error(`[smoke] reading ${TARGET_VAR} from ${TOKENS_PATH}`);
  const originalValue = await readTokenValue(TARGET_VAR);
  console.error(`[smoke] original value: ${originalValue}`);

  if (originalValue === TEST_VALUE) {
    throw new Error(`Test value ${TEST_VALUE} matches original — pick a different test value.`);
  }

  let assertionsPassed = false;
  try {
    console.error(`[smoke] POST /apply ${TARGET_VAR}=${TEST_VALUE}`);
    await postApply(TARGET_VAR, TEST_VALUE);

    const afterValue = await readTokenValue(TARGET_VAR);
    console.error(`[smoke] post-apply value: ${afterValue}`);
    if (afterValue !== TEST_VALUE) {
      throw new Error(`Expected ${TARGET_VAR} to be ${TEST_VALUE} after apply, got ${afterValue}`);
    }

    assertionsPassed = true;
    console.error('[smoke] PASS — bin sidecar rewrote tokens.css');
  } finally {
    try {
      console.error(`[smoke] restoring ${TARGET_VAR}=${originalValue}`);
      await postApply(TARGET_VAR, originalValue);
      const restored = await readTokenValue(TARGET_VAR);
      if (restored !== originalValue) {
        console.error(
          `[smoke] WARNING: restore mismatch — expected ${originalValue}, got ${restored}`,
        );
      }
    } catch (err) {
      console.error(`[smoke] WARNING: failed to restore original value: ${err.message}`);
    }
  }

  if (!assertionsPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[smoke] FAIL: ${err.message}`);
  process.exit(1);
});
