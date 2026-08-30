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
  setupWSConnection(ws, req);
});

console.log(`Whiteboard server running on ws://localhost:${PORT}`);
