#!/usr/bin/env bash
# build-render.sh — Reproduce the Render build locally for verification.
#
# Mirrors the buildCommand block in render.yaml exactly so any breakage
# can be caught here before pushing. After this completes you can start
# the production server with:
#
#     NODE_ENV=production PORT=5000 node dist/index.js
#
# and visit http://localhost:5000 to smoke-test the full stack.

set -euo pipefail

echo "▶ Installing dependencies (incl. dev — needed for vite/esbuild)…"
npm ci --include=dev

echo "▶ Building React client (vite → dist/public)…"
npx vite build

if [ ! -f "dist/public/index.html" ]; then
  echo "✗ Client build failed: dist/public/index.html missing." >&2
  exit 1
fi

echo "▶ Bundling Express server (esbuild → dist/index.js)…"
npx esbuild app/server/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outdir=dist

if [ ! -f "dist/index.js" ]; then
  echo "✗ Server build failed: dist/index.js missing." >&2
  exit 1
fi

echo
echo "✓ Build complete."
echo "  dist/         →"
ls -la dist | sed 's/^/    /'
echo "  dist/public/  →"
ls -la dist/public | sed 's/^/    /' | head -10
echo
echo "Start locally with:  NODE_ENV=production PORT=5000 node dist/index.js"
