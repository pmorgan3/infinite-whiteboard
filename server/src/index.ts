import { WebSocketServer } from 'ws';
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';
import { resolve } from 'node:path';
import { createFsPersistence } from './persistence.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 1234;

const persistenceDir = process.env.WHITEBOARD_PERSISTENCE_DIR
  ? resolve(process.env.WHITEBOARD_PERSISTENCE_DIR)
  : null;

if (persistenceDir) {
  setPersistence(createFsPersistence(persistenceDir));
  console.log(`Persisting rooms to ${persistenceDir}`);
} else {
  console.log('Persistence disabled (set WHITEBOARD_PERSISTENCE_DIR to enable)');
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  const room = req.url?.slice(1).split('?')[0] || 'unknown';
  if (!/^[A-Za-z0-9._-]+$/.test(room)) {
    console.warn('Rejected connection with invalid room name');
    ws.close(1008, 'Invalid room name');
    return;
  }
  console.log(`room=${room} connected`);
  ws.on('error', (error) => console.error(`room=${room} socket error: ${error.message}`));
  ws.on('close', () => console.log(`room=${room} disconnected`));
  try {
    setupWSConnection(ws, req);
  } catch (error) {
    console.error(`room=${room} setup failed:`, error);
    ws.close(1011, 'Collaboration setup failed');
  }
});

wss.on('error', (error) => console.error(`WebSocket server error: ${error.message}`));

console.log(`Whiteboard server running on ws://localhost:${PORT}`);
