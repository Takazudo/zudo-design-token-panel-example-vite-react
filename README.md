# zudo-design-token-panel-example-vite-react

Standalone Vite 6 + React 18 example for
[@takazudo/zdtp](https://github.com/Takazudo/zudo-design-token-panel).

Deployed to Cloudflare Workers Static Assets at
`https://zdtp-vite-react.zudolab.dev/`.

## Install

```bash
pnpm install
```

The panel comes from npm, pinned exactly to `@takazudo/zdtp@0.8.6`. The panel
owns its Preact runtime as a regular dependency and self-injects its
stylesheet on first mount, so this React host declares neither `preact` nor a
panel CSS import.

## Dev

```bash
pnpm dev
```

Runs two processes via `concurrently`:

| process | port  | env var     | role                                                          |
| ------- | ----- | ----------- | ------------------------------------------------------------- |
| Vite    | 44325 | `VITE_PORT` | the example site                                              |
| bin     | 24683 | `ZDTP_PORT` | `zdtp-server` — receives `/apply` POSTs, rewrites `tokens.css` |

Open [http://localhost:44325](http://localhost:44325) and run
`window.vr.toggleDesignPanel()` in the browser console to open the panel.

### Running concurrent worktrees on different ports

Both ports default as above so a bare `pnpm dev` is unchanged. To run a
second git worktree of this repo alongside the first without port
collisions, override both env vars — the sidecar's allowed CORS origin is
derived from `VITE_PORT` automatically, so the pair always stays in sync:

```bash
VITE_PORT=45325 ZDTP_PORT=25683 pnpm dev
```

Point Playwright at the same pair when testing that worktree. Playwright
starts its own Vite server and sidecar (`_dev:vite` + `_dev:tokens-bin`) and
does **not** reuse running ones, so stop that worktree's `pnpm dev` first:

```bash
VITE_PORT=45325 ZDTP_PORT=25683 pnpm test:e2e
```

To test against a `pnpm dev` you want to keep running, pass `BASE_URL` — that
switches Playwright to caller-managed servers and starts none of its own:

```bash
BASE_URL=http://localhost:45325 ZDTP_PORT=25683 pnpm exec playwright test
```

`test:apply-smoke` always talks to a `pnpm dev` you started yourself:

```bash
VITE_PORT=45325 ZDTP_PORT=25683 pnpm test:apply-smoke
```

## Browser tests

```bash
pnpm exec playwright install chromium   # once
pnpm test:e2e
```

The suite drives the real panel against the real sidecar: a global setup
checks that both listeners belong to this checkout, the apply spec writes
`src/styles/tokens.css` through the panel's Apply flow and restores it
byte-for-byte, and every test fails on any console error, page error or failed
request. CI runs it in the blocking `browser` job of `deploy.yml`, which skips
(and passes) only for content-only changes.

## Build

```bash
pnpm build
```

Produces `dist/index.html` and `dist/prose.html` (multi-page build; `base: '/'`).

## Routes

| Route | Component | Description |
|---|---|---|
| `/` | `Home` | Cards, buttons, palette swatches, rerender verify |
| `/#/about` | `About` | About this example |
| `/#/forms` | `Forms` | Form controls demo |
| `/#/status` | `Status` | Alert / badge / tooltip demo |
| `/#/widgets` | `Widgets` | Tabs / accordion / modal demo |
| `/#/data` | `Data` | Data table / cards demo |
| `/prose.html` | `prose.html` | Prose demo — separate MPA page |

## What the example proves

- The panel works inside a real React 18 app **without** a `react -> preact/compat` alias.
- React 18 StrictMode is safe via the per-`storagePrefix` bind flag.
- Panel state survives React rerenders and client-side navigation.
- The apply pipeline round-trips token tweaks to disk via the bin sidecar.

<!-- proof: content-only change (throwaway) -->
