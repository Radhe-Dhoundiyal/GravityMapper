// render.js - Entry point for Render deployment
import { createServer } from 'http';
import path from 'path';
import express from 'express';
import session from 'express-session';
import MemoryStore from 'memorystore';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { registerRoutes } from './server/routes.js';

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

  // Register routes and get the HTTP server
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