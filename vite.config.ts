import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkGfm from 'remark-gfm';
import { VITE_PORT, ZDTP_PORT } from './scripts/ports.mjs';

/**
 * Vite + React example for @takazudo/zdtp.
 *
 * Deliberately minimal: NO Tailwind, NO design-system integration, NO MDX,
 * NO `react -> preact/compat` alias. The example proves the panel package
 * works inside any Vite + React consumer that supplies just a `PanelConfig`.
 * The panel's own Preact runtime is a regular dependency of
 * `@takazudo/zdtp` (0.8.x), so this host does not declare `preact` itself.
 *
 * Apply-pipeline proxy
 * --------------------
 * `panelConfig.applyEndpoint` is set to the relative path `/api/dev/apply` so
 * the panel POSTs to the same origin as the Vite dev server (no CORS
 * preflight, no hardcoded port in the runtime config). Vite proxies that
 * path to the bin sidecar on port 24683. This keeps the example app a
 * vanilla static-output Vite build and avoids pulling in a Node server just
 * to host one dev-only POST endpoint.
 *
 * IMPORTANT: do NOT alias `react` -> `preact/compat`. The example must use
 * real React 18 — that is the entire point of the example. The panel renders
 * via its own Preact runtime inside the panel root element, fully isolated
 * from the host React tree.
 *
 * Deploy base path
 * ----------------
 * `base: '/'` — the standalone repo deploys to the Cloudflare Workers root,
 * so no prefix is needed. Both the dev server and production build serve at `/`.
 *
 * `panelConfig.applyEndpoint` deliberately stays as the bare relative path
 * `/api/dev/apply` — it is a dev-server-only proxy target that does not exist
 * in the production deploy, so it must NOT be base-prefixed.
 *
 * Worktree-safe ports
 * -------------------
 * `VITE_PORT` / `ZDTP_PORT` let concurrent git worktrees of this repo run on
 * distinct port pairs; both resolve in `scripts/ports.mjs`. The proxy target
 * below is derived from `ZDTP_PORT` — it must never be configured
 * independently of the sidecar's own `--port` (see `_dev:tokens-bin` in
 * package.json), or the two drift apart.
 */
export default defineConfig({
  base: '/',
  plugins: [
    // mdx must come before react() — it transforms .mdx to JSX that react()
    // then processes via the automatic JSX runtime.
    { enforce: 'pre', ...mdx({ jsxImportSource: 'react', providerImportSource: '@mdx-js/react', remarkPlugins: [remarkGfm] }) },
    react(),
  ],
  build: {
    rollupOptions: {
      // Multi-page: emit dist/index.html and dist/prose.html as self-contained
      // HTML entries so both pages work as static deploys.
      input: {
        main: 'index.html',
        prose: 'prose.html',
      },
    },
  },
  server: {
    port: VITE_PORT,
    strictPort: true,
    proxy: {
      '/api/dev/apply': {
        target: `http://127.0.0.1:${ZDTP_PORT}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/dev\/apply/, '/apply'),
      },
    },
  },
  preview: {
    port: VITE_PORT,
    strictPort: true,
  },
});
