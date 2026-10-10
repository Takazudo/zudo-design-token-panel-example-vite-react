#!/usr/bin/env bash
# Reads changed repo paths (one per line) on stdin and prints the ones that
# require the browser suite. No output means the change is content-only.
#
# Relevant: dependency/tooling manifests, framework + test config, the two
# Vite HTML entries, the apply routing map, and source/test/CI trees — except
# pure content (*.md / *.mdx).
set -euo pipefail

# grep exits 1 for "no match" (fine) and 2 for a real error (must fail).
candidates=$(grep -E \
  -e '^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$' \
  -e '^(vite\.config\.[cm]?[jt]s|tsconfig\.json|wrangler\.toml|playwright\.config\.ts|scaffold\.routing\.json)$' \
  -e '^(index|prose)\.html$' \
  -e '^(scripts|src|app|pages|components|tests|\.github)/' \
  || [ $? -eq 1 ])
[ -n "$candidates" ] || exit 0
printf '%s\n' "$candidates" | grep -v -E '\.mdx?$' || [ $? -eq 1 ]
