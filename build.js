import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function ensureDirectoryExists(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
    console.log(`✅ Directory created or already exists: ${dir}`);
  } catch (error) {
    console.error(`❌ Error creating directory ${dir}:`, error);
    throw error;
  }
}

async function executeCommand(command) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Executing: ${command}`);
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error executing command: ${error.message}`);
        console.error(stderr);
        reject(error);
        return;
      }
      if (stderr) {
        console.warn(`⚠️ Command generated stderr: ${stderr}`);
      }
      console.log(stdout);
      resolve();
    });
  });
}

async function build() {
  try {
    const distDir = path.resolve(__dirname, 'dist');
    const publicDir = path.resolve(distDir, 'public');
    
    // Ensure dist and public directories exist
    await ensureDirectoryExists(distDir);
    await ensureDirectoryExists(publicDir);

    // Build the client
    console.log('📦 Building client...');
    await executeCommand('vite build');
    
    // Build the server
    console.log('📦 Building server...');
    await executeCommand('esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist');
    
    // Create a server.js file for Render
    const serverJsContent = `
// server.js - Entry point for Render deployment
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import express from 'express';
import session from 'express-session';
import MemoryStore from 'memorystore';
import { WebSocketServer } from 'ws';
import { registerRoutes } from './routes.js';

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

const __dirname = dirname(fileURLToPath(import.meta.url));

// Serve static files
app.use(express.static(resolve(__dirname, 'public')));

// Register API routes
const httpServer = createServer(app);
await registerRoutes(app);

// Set up WebSocket server
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// Handle WebSocket connections
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

// Serve the React app for all other routes (SPA behavior)
app.get('*', (req, res) => {
  res.sendFile(resolve(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`;

    await fs.writeFile(path.resolve(distDir, 'server.js'), serverJsContent);
    console.log('✅ Created server.js for Render deployment');

    // Create a sample Render build script and config
    const renderYamlContent = `
# render.yaml configuration
services:
  - type: web
    name: gravitational-anomaly-mapper
    env: node
    buildCommand: npm ci && npm run build
    startCommand: node dist/server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: SESSION_SECRET
        generateValue: true
`;

    await fs.writeFile(path.resolve(__dirname, 'render.yaml'), renderYamlContent);
    console.log('✅ Created render.yaml configuration');

    // Create a sample .environment file for local testing
    const envContent = `
# Environment variables
NODE_ENV=production
PORT=5000
SESSION_SECRET=local-dev-secret
`;

    await fs.writeFile(path.resolve(__dirname, '.env.production'), envContent);
    console.log('✅ Created .env.production file');

    console.log('✅ Build completed successfully!');
    console.log('📋 You can now deploy to Render:');
    console.log('1. Push this code to a Git repository');
    console.log('2. Create a new Web Service in Render, connected to your repo');
    console.log('3. Use the following settings:');
    console.log('   - Build Command: npm ci && npm run build');
    console.log('   - Start Command: node dist/server.js');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();