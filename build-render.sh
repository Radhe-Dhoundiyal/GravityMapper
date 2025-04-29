#!/bin/bash
# build-render.sh - Script to test the build process for Render deployment

echo "🚀 Starting Render build process..."

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p dist
mkdir -p dist/public

# Install dependencies for subdirectories
echo "📦 Installing dependencies for client..."
cd client && npm install
cd ..

echo "📦 Installing dependencies for server..."
cd server && npm install
cd ..

echo "📦 Installing dependencies for shared..."
cd shared && npm install
cd ..

# Build client
echo "🔨 Building client..."
npx vite build

# Check if client build was successful
if [ ! -f "dist/public/index.html" ]; then
  echo "❌ Client build failed! dist/public/index.html not found."
  exit 1
else
  echo "✅ Client build successful!"
fi

# Build server
echo "🔨 Building server..."
npx esbuild server/index.ts server/routes.ts server/storage.ts server/vite.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

# Check if server build was successful
if [ ! -f "dist/index.js" ]; then
  echo "❌ Server build failed! dist/index.js not found."
  exit 1
else
  echo "✅ Server build successful!"
fi

echo "📋 Directory structure:"
ls -la dist
ls -la dist/public

echo "✅ Build process completed successfully!"
echo "➡️ To test locally, run: NODE_ENV=production node render.js"
echo "➡️ To deploy to Render, follow the instructions in RENDER_DEPLOYMENT.md"