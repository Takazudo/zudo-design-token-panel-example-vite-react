# zudo-design-token-panel-example-vite-react

Standalone Vite 6 + React 18 example for
[@takazudo/zdtp](https://github.com/Takazudo/zudo-design-token-panel).

Deployed to Cloudflare Workers Static Assets at
`https://zdtp-vite-react.zudolab.dev/`.

## Sibling layout

This repo expects the panel package to live in a sibling directory:

```
$HOME/repos/zdtp-ex/
├── zudo-design-token-panel/          # panel package (cloned sibling)
│   └── packages/
│       └── zudo-design-token-panel/
└── zudo-design-token-panel-example-vite-react/   # this repo
```

The `package.json` references the panel as
`"file:../zudo-design-token-panel/packages/zudo-design-token-panel"`.
Running `pnpm install` alone on a fresh checkout **will fail** because the sibling is not present yet.

## Bootstrap

```bash
pnpm setup:upstream
```

Clones `zudo-design-token-panel` at the pinned SHA, installs deps, and builds.

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
starts its own `pnpm dev` and does **not** reuse a running one, so stop that
worktree's `pnpm dev` first:

```bash
VITE_PORT=45325 ZDTP_PORT=25683 pnpm exec playwright test
```

To test against a `pnpm dev` you want to keep running, pass `BASE_URL` — that
switches Playwright to caller-managed servers and skips its own `pnpm dev`:

```bash
BASE_URL=http://localhost:45325 ZDTP_PORT=25683 pnpm exec playwright test
```

`test:apply-smoke` always talks to a `pnpm dev` you started yourself:

```bash
VITE_PORT=45325 ZDTP_PORT=25683 pnpm test:apply-smoke
```

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
