#!/bin/bash
# render-build.sh - Custom build script for Render

# Display current directory
echo "Current directory: $(pwd)"

# Set up environment for Render
export NODE_ENV=production

# Create necessary directories
echo "Creating dist directories..."
mkdir -p dist
mkdir -p dist/public

# Use our custom package.json for Render
echo "Setting up package.json for Render..."
if [ -f "package.json.render" ]; then
  cp package.json.render package.json
fi

# Use our custom vite config for Render
echo "Setting up vite.config.js for Render..."
if [ -f "vite.config.render.js" ]; then
  cp vite.config.render.js vite.config.js
fi

# Install dependencies
echo "Installing dependencies..."
npm ci

# Build client
echo "Building client..."
npx vite build

# Check if client build was successful
if [ ! -f "dist/public/index.html" ]; then
  echo "Client build may have output to a different location. Checking..."
  
  # Check if files were built to client/dist instead
  if [ -d "client/dist" ]; then
    echo "Found build output in client/dist, copying to dist/public..."
    cp -R client/dist/* dist/public/
  fi
fi

# Build server
echo "Building server..."
npx esbuild server/index.ts server/routes.ts server/storage.ts server/vite.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

# Verify build
echo "Verifying build..."
if [ -f "dist/public/index.html" ] && [ -f "dist/index.js" ]; then
  echo "Build succeeded!"
  echo "Directory structure:"
  ls -la dist
  ls -la dist/public
else
  echo "Build failed. Missing expected files."
  echo "Contents of dist directory:"
  ls -la dist
  if [ -d "dist/public" ]; then
    echo "Contents of dist/public directory:"
    ls -la dist/public
  fi
  echo "Contents of client/dist directory (if exists):"
  if [ -d "client/dist" ]; then
    ls -la client/dist
  fi
  exit 1
fi

# Copy render.js to the dist directory
echo "Copying server entry point..."
cp render.js dist/

echo "Build process completed!"