/**
 * Single source of truth for the dev/preview port pair.
 *
 * `VITE_PORT` / `ZDTP_PORT` let concurrent git worktrees of this repo bind
 * distinct ports. Everything that needs one reads it from here, so the Vite
 * server, the `/api/dev/apply` proxy target, the sidecar's `--allow-origin`,
 * Playwright's baseURL and the smoke harness cannot drift apart.
 *
 * Digits-only is deliberate, not pedantry: package.json's `_dev:tokens-bin`
 * interpolates these vars with plain shell expansion (`${ZDTP_PORT:-24683}`),
 * which forwards the value verbatim. Anything JS coerces but the shell does
 * not — `' '` (→ 0), `'1e4'`, `'0x20'` — would otherwise bind one port while
 * telling the sidecar about another, and the CORS check would reject every
 * /apply POST with no hint as to why.
 */

export const DEFAULT_VITE_PORT = 44325;
export const DEFAULT_ZDTP_PORT = 24683;

export function resolvePort(envVar, fallback) {
  const raw = process.env[envVar];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${envVar} must be an integer port, got ${JSON.stringify(raw)}`);
  }
  const parsed = Number(raw);
  if (parsed < 1 || parsed > 65535) {
    throw new Error(`${envVar} must be between 1 and 65535, got ${parsed}`);
  }
  return parsed;
}

export const VITE_PORT = resolvePort('VITE_PORT', DEFAULT_VITE_PORT);
export const ZDTP_PORT = resolvePort('ZDTP_PORT', DEFAULT_ZDTP_PORT);

/**
 * Origin the browser is driven against, and the value the sidecar compares
 * verbatim against its own `--allow-origin`.
 *
 * `||`, not `??`: an exported-but-empty `BASE_URL` counts as unset. With `??`
 * it would survive as `''` and every navigation and Origin header built from
 * it would be malformed.
 */
export const BROWSER_ORIGIN =
  process.env.BASE_URL?.replace(/\/$/, '') || `http://localhost:${VITE_PORT}`;
