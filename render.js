// render.js - Entry point for Render deployment
import { createServer } from 'http';
import path from 'path';
import express from 'express';
import session from 'express-session';
import MemoryStore from 'memorystore';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { registerRoutes } from './dist/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const MemoryStoreSession = MemoryStore(session);

  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'gravitational-anomaly-secret',
      resave: false,
      saveUninitialized: false,
      store: new MemoryStoreSession({
        checkPeriod: 86400000
      })
    })
  );

  app.use(express.json());

  app.use(express.static(path.join(__dirname, 'dist/public')));

  const httpServer = createServer(app);
  await registerRoutes(app);

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');

    ws.on('message', (message) => {
      try {
        const parsedMessage = JSON.parse(message.toString());
        console.log('Received message:', parsedMessage.type);

        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
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

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/public/index.html'));
  });

  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
