#!/usr/bin/env node
/**
 * Bootstrap script for fresh-machine setup.
 *
 * Reads PANEL_PINNED_SHA from .github/workflows/deploy.yml, then:
 *   1. Clones the panel sibling if missing, or fetches + checks out the pin if
 *      the sibling already exists and is clean.
 *   2. Refuses (exit 1) if the sibling exists but has uncommitted changes —
 *      avoids silently clobbering in-progress upstream work. See
 *      /dev-wip-package-upstream-wt-dev for the upstream-dev workflow.
 *   3. Builds the panel package (pnpm install --frozen-lockfile + pnpm build).
 *   4. Installs consumer deps (pnpm install, NOT --frozen-lockfile on fresh machine).
 *   5. Runs pnpm build in the consumer to verify the full pipeline.
 *
 * Do NOT wire this as a postinstall hook — that would cause an install loop.
 * Instead run: pnpm setup:upstream
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONSUMER_DIR = resolve(__dirname, '..');
const SIBLING_DIR = resolve(CONSUMER_DIR, '..', 'zudo-design-token-panel');
const PANEL_REPO_URL = 'https://github.com/Takazudo/zudo-design-token-panel.git';
const WORKFLOW_FILE = resolve(CONSUMER_DIR, '.github', 'workflows', 'deploy.yml');

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function getPinnedSha() {
  const content = readFileSync(WORKFLOW_FILE, 'utf-8');
  // Match "PANEL_PINNED_SHA: <40-char hex SHA>"
  const m = content.match(/PANEL_PINNED_SHA:\s*([0-9a-f]{40})/);
  if (!m) {
    throw new Error(`Could not find PANEL_PINNED_SHA in ${WORKFLOW_FILE}`);
  }
  return m[1];
}

function isSiblingDirty() {
  try {
    const result = execSync('git status --porcelain', {
      cwd: SIBLING_DIR,
      encoding: 'utf-8',
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

async function main() {
  const sha = getPinnedSha();
  console.log(`Panel pinned SHA: ${sha}`);

  if (!existsSync(SIBLING_DIR)) {
    console.log(`\nSibling not found — cloning from ${PANEL_REPO_URL}...`);
    run(`git clone ${PANEL_REPO_URL} ${SIBLING_DIR}`);
    run(`git -C ${SIBLING_DIR} checkout ${sha}`);
  } else {
    console.log(`\nSibling found at ${SIBLING_DIR}`);
    if (isSiblingDirty()) {
      console.error(`
ERROR: The panel sibling has uncommitted changes.
       Refusing to fetch/checkout to avoid clobbering your work.

       If you are doing active upstream development, use the
       /dev-wip-package-upstream-wt-dev workflow instead of setup:upstream.

       If you want to discard local changes and reset to the pinned SHA,
       run manually inside ${SIBLING_DIR}:

         git checkout -- .
         git fetch
         git checkout ${sha}
`);
      process.exit(1);
    }
    run(`git -C ${SIBLING_DIR} fetch`);
    run(`git -C ${SIBLING_DIR} checkout ${sha}`);
  }

  console.log('\nBuilding panel package...');
  run('pnpm install --frozen-lockfile', { cwd: SIBLING_DIR });
  run('pnpm -F @takazudo/zudo-design-token-panel build', { cwd: SIBLING_DIR });

  console.log('\nInstalling consumer dependencies...');
  run('pnpm install', { cwd: CONSUMER_DIR });

  console.log('\nVerifying consumer build...');
  run('pnpm build', { cwd: CONSUMER_DIR });

  console.log('\nDone! The example is ready. Run `pnpm dev` to start the dev server.');
}

main().catch((err) => {
  console.error(`\nsetup:upstream FAILED: ${err.message}`);
  process.exit(1);
});
