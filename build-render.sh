#!/bin/bash
# build-render.sh - Script to test the build process for Render deployment

echo "Starting Render build process..."

mkdir -p dist
mkdir -p dist/public

echo "Building client..."
npx vite build

if [ ! -f "dist/public/index.html" ]; then
  echo "Client build failed: dist/public/index.html not found."
  exit 1
else
  echo "Client build successful."
fi

echo "Building server..."
npx esbuild app/server/index.ts app/server/routes.ts app/server/storage.ts app/server/vite.ts \
  --platform=node --packages=external --bundle --format=esm --outdir=dist

if [ ! -f "dist/index.js" ]; then
  echo "Server build failed: dist/index.js not found."
  exit 1
else
  echo "Server build successful."
fi

echo "Build directory contents:"
ls -la dist
ls -la dist/public

echo "Build process completed successfully."
echo "To test locally: NODE_ENV=production node render.js"
echo "To deploy on Render, follow RENDER_DEPLOYMENT.md"
