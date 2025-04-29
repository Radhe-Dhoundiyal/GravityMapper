# Deploying to Render

This guide will help you deploy your Gravitational Anomaly Mapper application to Render.

## Prerequisites

1. Create a [Render account](https://render.com/)
2. Have your code pushed to a Git repository (GitHub, GitLab, etc.)

## Fixing the Build Issue

To fix the `Publish directory dist/public does not exist!` error, follow these steps:

## Step 1: Modify package.json

Before deploying, update your package.json with the following scripts:

```json
"scripts": {
  "dev": "NODE_ENV=development tsx server/index.ts",
  "build": "npm run build:prepare && npm run build:client && npm run build:server",
  "build:prepare": "mkdir -p dist dist/public",
  "build:client": "vite build",
  "build:server": "esbuild server/index.ts server/routes.ts server/storage.ts server/vite.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
  "start": "NODE_ENV=production node dist/index.js",
  "check": "tsc",
  "db:push": "drizzle-kit push"
}
```

The `build:prepare` script creates the necessary directories before building.

## Step 2: Create a Render-specific Entry Point

Create a file named `render.js` in your project root:

```javascript
// This file is necessary for Render deployment
import { createServer } from 'http';
import path from 'path';
import express from 'express';
import session from 'express-session';
import MemoryStore from 'memorystore';
import { WebSocketServer } from 'ws';
import { registerRoutes } from './server/routes.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const MemoryStoreSession = MemoryStore(session);

  // Session configuration
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'gravitational-anomaly-secret',
      resave: false,
      saveUninitialized: false,
      store: new MemoryStoreSession({
        checkPeriod: 86400000 // 24 hours
      })
    })
  );

  app.use(express.json());

  // Serve static files from dist/public
  app.use(express.static(path.join(__dirname, 'dist/public')));

  // Set up HTTP server and register routes
  const httpServer = createServer(app);
  await registerRoutes(app);

  // WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    
    ws.on('message', (message) => {
      try {
        const parsedMessage = JSON.parse(message.toString());
        console.log('Received message:', parsedMessage.type);
        
        // Broadcast to all clients
        wss.clients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify(parsedMessage));
          }
        });
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
  });

  // For SPA routing - send all non-api routes to index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/public/index.html'));
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start the server
  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

## Step 3: Set Up Your Render Service

1. Log in to your Render dashboard
2. Click "New" and select "Web Service"
3. Connect your repository
4. Configure the service with these settings:
   - **Name**: gravitational-anomaly-mapper (or your preferred name)
   - **Runtime**: Node
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `node render.js`
   - **Environment Variables**:
     - `NODE_ENV`: production
     - `SESSION_SECRET`: (generate a random string)

5. Click "Create Web Service"

## Step 4: Troubleshooting

If you encounter build issues:

1. Check the build logs in Render dashboard
2. Ensure all necessary files are pushed to your repository
3. Verify that the dist/public directory is being created during the build process
4. If using environment variables, make sure they're properly set in Render

## Additional Notes

- Render automatically assigns a PORT environment variable
- The free tier may have performance limitations for real-time applications
- For production deployments, consider using a proper database instead of in-memory storage

## Local Testing

To test your build locally before deploying:

```bash
# Create necessary directories
mkdir -p dist dist/public

# Build the client
npm run build:client

# Build the server
npm run build:server

# Create a simple test for the build
ls -la dist
ls -la dist/public

# If all looks good, start the server
NODE_ENV=production node render.js
```

This should help you successfully deploy your application to Render.