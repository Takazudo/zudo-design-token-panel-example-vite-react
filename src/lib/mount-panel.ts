/**
 * Vite + React host adapter for `@takazudo/zdtp`.
 *
 * The Astro example ships a package-provided host adapter
 * (`@takazudo/zdtp/astro/host-adapter`) that runs from a
 * per-page `<script>` block in `DesignTokenPanelHost.astro`. Vite + React has
 * no equivalent host component — the panel is mounted as a Preact island
 * from a React `useEffect`. So the adapter logic is ported here.
 *
 * Responsibilities (mirror the Astro adapter):
 *
 *  1. Own the `configurePanel(panelConfig)` call. The package's main entry
 *     installs event listeners and the astro fallback at module-init time;
 *     reapplyPersistedOverrides and reapplyFromStorage run via a post-configure
 *     hook that fires AFTER configurePanel supplies the host's storagePrefix
 *     (H2 fix, issue #111). Calling configurePanel inside the dynamic-import
 *     resolution is safe and keeps the panel JS out of the initial chunk.
 *     The host application is the single source of truth for the config
 *     object — it imports `panelConfig` from the local `../config/panel-config`
 *     module and this adapter wires it through.
 *  2. Install the console API on `window[cfg.consoleNamespace]`
 *     (`showDesignPanel` / `hideDesignPanel` / `toggleDesignPanel`). The
 *     namespace is a configured field — different consumers can pick
 *     distinct values to prove the contract is host-agnostic.
 *  3. Gate the panel module's dynamic import on the same probes the Astro
 *     adapter uses, read from the package's `/constants` signal registry:
 *     any active eager-load flag, or any non-empty persisted state envelope.
 *     When none is set, the panel module stays out of the initial bundle and
 *     only loads when the user calls a `window.<ns>.*` helper from the
 *     console.
 *  4. After the dynamic import resolves, call `configurePanel(panelConfig)`
 *     on the freshly imported module BEFORE any other panel API runs, then
 *     call `reapplyPersistedOverrides()` so the panel applies persisted
 *     overrides ASAP (kills the FOUT on hard navigation when the user has
 *     tweaks saved).
 *
 * StrictMode safety
 * -----------------
 * React 18 StrictMode (enabled in `src/main.tsx`, the new-Vite default)
 * deliberately invokes mount effects twice in development to surface
 * cleanup-bug regressions. The `mountPanel` export is therefore called
 * twice on the first render in dev. We pin a per-`storagePrefix` flag on
 * `window.__zudoDesignTokenPanelAdapter` (same map shape the package's
 * Astro adapter uses) so the lazy-load probes only fire once. The console
 * API re-installation is idempotent — re-assigning the same closures is
 * semantically a no-op — so leaving it ungated is fine.
 *
 * Eager-load signals come from the package, never from this file
 * -------------------------------------------------------------
 * The gate below reads `@takazudo/zdtp/constants` — a zero-import sub-entry
 * that carries only the signal registry, so importing it statically costs a
 * few hundred bytes and does NOT pull the panel bundle into the initial
 * chunk (which is the entire point of the dynamic import in
 * `loadPanelModule`).
 *
 * This host used to hard-code the two key formatters instead:
 *
 *   `${storagePrefix}:visible`   and   `${storagePrefix}-state-v2`
 *
 * The `-state-v2` half was a latent bug. The package migrates an older
 * state envelope forward (v1/v2 -> v3 -> v4) and then DELETES the old key,
 * so the moment a user's persisted overrides were migrated past v2 the gate
 * stopped seeing them and the panel silently lost its eager load — an FOUT
 * on every hard navigation, for exactly the users who had tweaks saved.
 * `READABLE_STATE_KEY_SUFFIXES` is the package's single registry of the
 * versions its loader can still read, so probing it cannot go stale again.
 *
 * `EAGER_LOAD_GATE_KEY_SUFFIXES` covers the flag signals the same way. It
 * is wider than the `:visible` flag this file used to check alone: `-open`,
 * `:autoload`, `-elpath-enabled` and `-domtweaker-enabled` also require the
 * panel to boot (the last two drive closed-shell features that need the
 * Preact shell mounted even when the panel itself is not visible).
 *
 * Why this host does NOT call `setLifecycleAdapter`
 * ------------------------------------------------
 * The package exports `setLifecycleAdapter` for hosts whose router performs
 * a soft navigation that SWAPS the document — the panel has to re-apply its
 * persisted overrides against the new `:root` afterwards, and the built-in
 * fallback listens for `astro:before-swap` / `astro:page-load`, which never
 * fire outside Astro. Neither navigation this app performs is that shape:
 *
 *  - In-app routes use HashRouter (`#/about`, …). A hash change never
 *    touches the document: one React root stays mounted for the page
 *    lifetime, only `<Outlet>`'s subtree re-renders, and the panel's Preact
 *    island — mounted outside the React tree — is never unmounted. The
 *    inline custom properties the panel wrote to `:root` survive untouched,
 *    so there is nothing to re-apply.
 *  - `index.html` <-> `prose.html` is a plain anchor across two Vite MPA
 *    entries, i.e. a full document load. That path re-runs the entry script,
 *    `mountPanel()`, and `reapplyPersistedOverrides()` from scratch — which
 *    is the hard-navigation case the adapter explicitly does not cover.
 *
 * So an adapter here would install listeners for an event that cannot
 * happen. Revisit this only if the app moves to BrowserRouter with a
 * document-swapping transition.
 */

import type { PanelConfig } from '@takazudo/zdtp';
import {
  EAGER_LOAD_GATE_KEY_SUFFIXES,
  READABLE_STATE_KEY_SUFFIXES,
} from '@takazudo/zdtp/constants';
import { panelConfig } from '../config/panel-config';

// Mirrors the panel-module's main entry shape we lazy-import below.
type DesignTokenPanelModule = typeof import('@takazudo/zdtp');

interface DesignTokenPanelAdapterState {
  /** Per-`storagePrefix` bind flag — re-runs of mountPanel are no-ops. */
  bound: boolean;
  /** Memoised module promise so steady-state toggle/show/hide share one load. */
  modulePromise: Promise<DesignTokenPanelModule> | null;
}

interface ConsoleApiSurface {
  showDesignPanel?: () => Promise<void>;
  hideDesignPanel?: () => Promise<void>;
  toggleDesignPanel?: () => Promise<void>;
  // Allow co-existence with other helpers a host may install on the same
  // namespace (e.g. `window.<ns>.someOtherDebugHelper()`).
  [extra: string]: unknown;
}

type AdapterStateMap = Record<string, DesignTokenPanelAdapterState>;

interface AdapterWindow extends Window {
  __zudoDesignTokenPanelAdapter?: AdapterStateMap;
  // Index access for the configured console namespace.
  [namespace: string]: unknown;
}

function getAdapterStateMap(win: AdapterWindow): AdapterStateMap {
  if (!win.__zudoDesignTokenPanelAdapter) {
    win.__zudoDesignTokenPanelAdapter = {};
  }
  return win.__zudoDesignTokenPanelAdapter;
}

function getAdapterState(win: AdapterWindow, key: string): DesignTokenPanelAdapterState {
  const map = getAdapterStateMap(win);
  let state = map[key];
  if (!state) {
    state = { bound: false, modulePromise: null };
    map[key] = state;
  }
  return state;
}

/** Read one key, treating an unavailable store as an absent value. */
function readStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * True when any of the package's fixed eager-load flags is set to one of its
 * accepted values. Presence alone never activates a flag — the registry
 * enumerates the values that count, so a stale `'0'` does not force a load.
 */
function hasActiveFlagSignal(cfg: PanelConfig): boolean {
  for (const [suffix, rule] of Object.entries(EAGER_LOAD_GATE_KEY_SUFFIXES)) {
    // `requiredConfig` names a PanelConfig property that must be configured
    // for the flag to mean anything — a stray `-domtweaker-enabled` is inert
    // on a host that never passed `domTweaker`.
    if (rule.requiredConfig !== null && cfg[rule.requiredConfig] === undefined) {
      continue;
    }
    const value = readStorageItem(cfg.storagePrefix + suffix);
    if (value !== null && (rule.acceptedValues as readonly string[]).includes(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply `EAGER_LOAD_GATE_STATE_FAMILY.valueRules` to one raw envelope:
 *
 *   blank (absent or empty string) -> no      JSON null            -> no
 *   empty object / empty array     -> no      any other parsed value -> yes
 *   malformed JSON                 -> yes
 *
 * Malformed JSON fails OPEN deliberately: a parse failure means the panel
 * must still load so it can migrate or reject the payload, rather than
 * stranding the user with corrupt state they can never reach.
 *
 * Presence alone is not enough because `clearPersistedState()` removes keys
 * rather than writing `{}` — an empty envelope is foreign or hand-written
 * data, not a user's saved tweaks.
 */
function isActiveStateEnvelope(raw: string | null): boolean {
  // An empty string is a blank slot, not corrupt data — `JSON.parse('')`
  // throws, but there is nothing here to migrate.
  if (raw === null || raw === '') return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return true;
  }
  if (parsed === null) return false;
  if (Array.isArray(parsed)) return parsed.length > 0;
  if (typeof parsed === 'object') return Object.keys(parsed).length > 0;
  return true;
}

/**
 * True when any state version the CURRENT loader can read holds a non-empty
 * envelope.
 *
 * Each complete key is built from the literal prefix instead of enumerating
 * `localStorage`, which keeps sibling instances (`${otherPrefix}-state-v4`)
 * out, makes host-supplied regex characters inert, and holds this loop to
 * O(versions) on the synchronous bootstrap path.
 */
function hasPersistedOverrides(cfg: PanelConfig): boolean {
  for (const suffix of Object.values(READABLE_STATE_KEY_SUFFIXES)) {
    if (isActiveStateEnvelope(readStorageItem(cfg.storagePrefix + suffix))) {
      return true;
    }
  }
  return false;
}

/**
 * Lazily import the panel module. First call runs the panel module's
 * top-level bootstrap (which binds its own toggle/window listeners) and
 * configures the panel-config singleton with the host's `panelConfig`
 * BEFORE any panel API runs. Subsequent calls return the same promise so
 * `configurePanel` runs exactly once per `storagePrefix`-scoped state —
 * which matches the package's one-shot configurePanel contract.
 *
 * Why configurePanel runs HERE (not eagerly in main.tsx): the package
 * main entry installs event listeners and the astro fallback at module-init
 * time; reapplyPersistedOverrides and reapplyFromStorage run via a
 * post-configure hook that fires when configurePanel is called (H2 fix,
 * issue #111). Calling configurePanel inside the dynamic-import resolution
 * therefore lands the host's config in the singleton before any reader sees
 * it, while keeping the panel JS out of the initial chunk (a static
 * `import { configurePanel }` in main.tsx pulled the whole module in and
 * Vite folded the dynamic import back into the same chunk — see the Rollup
 * warning we removed).
 *
 * After configurePanel runs, call `reapplyPersistedOverrides()` so the
 * panel applies persisted overrides ASAP (matches the eager-reapply path
 * the Astro adapter triggers via the package's main-entry side effects).
 */
async function loadPanelModule(state: DesignTokenPanelAdapterState) {
  if (state.modulePromise === null) {
    state.modulePromise = import('@takazudo/zdtp').then((mod) => {
      // Configure FIRST — every other panel API below reads
      // getPanelConfig() and must observe the host's intended values, not
      // the package's DEFAULT_PANEL_CONFIG sentinel.
      mod.configurePanel(panelConfig);
      try {
        mod.reapplyPersistedOverrides();
      } catch (err) {
        // Defensive: never let a bad persist-state read kill the panel
        // surface. The panel will still mount with stylesheet defaults.
        console.warn(
          '[design-token-panel] reapplyPersistedOverrides() threw: ' + (err as Error).message,
        );
      }
      return mod;
    });
  }
  return state.modulePromise;
}

function installConsoleApi(
  win: AdapterWindow,
  namespace: string,
  state: DesignTokenPanelAdapterState,
): void {
  const existing = (win[namespace] as ConsoleApiSurface | undefined) ?? {};
  existing.showDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.showDesignTokenPanel();
  };
  existing.hideDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.hideDesignTokenPanel();
  };
  existing.toggleDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.toggleDesignPanel();
  };
  win[namespace] = existing;
}

/**
 * Bind the host adapter for the active panel config. Safe to call multiple
 * times — the per-`storagePrefix` `bound` flag short-circuits repeat calls,
 * which is exactly what React 18 StrictMode requires (mount effects run
 * twice in dev). Returns nothing; the cleanup function from the calling
 * `useEffect` should also be a no-op.
 *
 * Reads the active config from the local `panelConfig` module so storage
 * keys / console namespace / etc. are derived from the same object that
 * `loadPanelModule()` will pass to `configurePanel(...)` once the panel
 * module finishes loading. The two derivations are guaranteed coherent
 * because there is exactly one `panelConfig` import in this file.
 */
export function mountPanel(): void {
  if (typeof window === 'undefined') return;

  const cfg = panelConfig;
  const win = window as unknown as AdapterWindow;
  const state = getAdapterState(win, cfg.storagePrefix);

  // Install console API every time — `bound` only gates the lazy-load
  // probes, since the console handlers are idempotent (re-assigning the
  // same closures is a no-op semantically).
  installConsoleApi(win, cfg.consoleNamespace, state);

  if (state.bound) return;
  state.bound = true;

  // Lazy-load gate — eagerly load the panel module when any persisted signal
  // says the panel was in use: an open / visible / autoload flag, an armed
  // closed-shell feature, or saved token overrides. Any of them means the
  // panel must boot before first paint, else the user gets an FOUT or a
  // feature that silently does nothing.
  if (hasActiveFlagSignal(cfg) || hasPersistedOverrides(cfg)) {
    // Fire-and-forget by design, but with the rejection handled: nothing
    // awaits this promise, and an unhandled rejection from a failed chunk
    // load fails the whole run in a consumer's test runner.
    void loadPanelModule(state).catch((err: unknown) => {
      console.error('[design-token-panel] Eager panel-module load failed.', err);
    });
  }
}
