# Render Deployment Guide

This guide will help you deploy your Gravitational Anomaly Mapper application to Render.com.

## Step 1: Prepare Your Repository

Make sure the following files are included in your repository:

- `render-build.sh` - Custom build script for Render
- `render.js` - Entry point for the Node.js server on Render
- `vite.config.render.js` - Simplified Vite config for Render
- `package.json.render` - Modified package.json for Render
- `build-render.js` - Node.js build script (fallback option)

## Step 2: Set Up a New Web Service on Render

1. Log in to your [Render Dashboard](https://dashboard.render.com/)
2. Click **New** and select **Web Service**
3. Connect your GitHub/GitLab repository
4. Fill in the following details:
   - **Name:** gravitational-anomaly-mapper (or your preferred name)
   - **Runtime:** Node
   - **Build Command:** `chmod +x render-build.sh && ./render-build.sh`
   - **Start Command:** `node dist/render.js`

## Step 3: Configure Environment Variables

Add the following environment variables:
- `NODE_ENV`: production
- `SESSION_SECRET`: (generate a random string or use Render's secret generation)

## Step 4: Deploy Your Service

Click **Create Web Service** and wait for the deployment to complete.

## Troubleshooting

If you encounter the error `Publish directory dist/public does not exist!`:

1. Check the build logs to see where files are being output
2. Verify that the `render-build.sh` script is executing correctly
3. Make sure the `vite.config.render.js` file is being copied to `vite.config.js` during build

### Manual Testing Steps

Before pushing to your repository, you can test locally:

```bash
# Create the necessary directories
mkdir -p dist dist/public

# Build the client
npx vite --config vite.config.render.js build

# Build the server
npx esbuild server/index.ts server/routes.ts server/storage.ts server/vite.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

# Check the output directories
ls -la dist
ls -la dist/public
```

If everything looks good, you should have:
- `dist/public/index.html` and other client assets
- `dist/index.js` and other server files

## Advanced Configuration

If you need to use a database or other services:

1. Add the appropriate environment variables in the Render dashboard
2. Update the `render.js` file to use these variables
3. Add any necessary dependencies to your `package.json.render` file