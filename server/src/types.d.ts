declare module 'y-websocket/bin/utils' {
  import type { WebSocket } from 'ws';
  import type { IncomingMessage } from 'http';
  import type { Doc } from 'yjs';

  export interface Persistence {
    bindState: (docName: string, doc: Doc) => void | Promise<void>;
    writeState: (docName: string, doc: Doc) => Promise<void>;
    provider?: unknown;
  }

  export function setupWSConnection(
    ws: WebSocket,
    req: IncomingMessage,
    opts?: { docName?: string; gc?: boolean }
  ): void;

  export function setPersistence(p: Persistence | null): void;
  export function getPersistence(): Persistence | null;
}
