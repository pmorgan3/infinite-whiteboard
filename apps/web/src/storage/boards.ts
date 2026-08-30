import type { WhiteboardState } from '@whiteboard/core';

export const ACTIVE_BOARD_KEY = 'whiteboard-active-board';
export const LEGACY_STATE_KEY = 'whiteboard-state';

export interface BoardRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  state: WhiteboardState;
}

export interface BoardRepository {
  list(): Promise<BoardRecord[]>;
  get(id: string): Promise<BoardRecord | undefined>;
  create(name: string, state: WhiteboardState): Promise<BoardRecord>;
  save(id: string, state: WhiteboardState): Promise<BoardRecord>;
  rename(id: string, name: string): Promise<BoardRecord>;
  duplicate(id: string): Promise<BoardRecord>;
  delete(id: string): Promise<void>;
  close(): void;
}

const DB_NAME = 'infinite-whiteboard';
const STORE_NAME = 'boards';
const DB_VERSION = 1;

export function sanitizeBoardName(name: string): string {
  return name.trim() || 'Untitled Board';
}

export function generateBoardId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return `board-${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  return `board-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function cloneState(state: WhiteboardState): WhiteboardState {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as WhiteboardState;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbBoardRepository implements BoardRepository {
  constructor(private readonly db: IDBDatabase) {}

  async list(): Promise<BoardRecord[]> {
    const transaction = this.db.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as BoardRecord[];
    await done;
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<BoardRecord | undefined> {
    const transaction = this.db.transaction(STORE_NAME, 'readonly');
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(id)) as BoardRecord | undefined;
    await done;
    return record;
  }

  async create(name: string, state: WhiteboardState): Promise<BoardRecord> {
    const now = new Date().toISOString();
    const record: BoardRecord = {
      id: generateBoardId(),
      name: sanitizeBoardName(name),
      createdAt: now,
      updatedAt: now,
      state: cloneState(state),
    };
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).add(record);
    await transactionDone(transaction);
    return record;
  }

  async save(id: string, state: WhiteboardState): Promise<BoardRecord> {
    const existing = await this.requireBoard(id);
    const record = { ...existing, updatedAt: new Date().toISOString(), state: cloneState(state) };
    await this.put(record);
    return record;
  }

  async rename(id: string, name: string): Promise<BoardRecord> {
    const existing = await this.requireBoard(id);
    const record = { ...existing, name: sanitizeBoardName(name), updatedAt: new Date().toISOString() };
    await this.put(record);
    return record;
  }

  async duplicate(id: string): Promise<BoardRecord> {
    const source = await this.requireBoard(id);
    return this.create(`${source.name} Copy`, cloneState(source.state));
  }

  async delete(id: string): Promise<void> {
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone(transaction);
  }

  close(): void {
    this.db.close();
  }

  private async requireBoard(id: string): Promise<BoardRecord> {
    const record = await this.get(id);
    if (!record) throw new Error('Board not found');
    return record;
  }

  private async put(record: BoardRecord): Promise<void> {
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
  }
}

export async function openBoardRepository(
  idb: IDBFactory = indexedDB,
  storage: Pick<Storage, 'getItem' | 'removeItem'> = localStorage,
): Promise<BoardRepository> {
  const request = idb.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    }
  };
  const db = await requestResult(request);
  const repository = new IndexedDbBoardRepository(db);

  const legacy = storage.getItem(LEGACY_STATE_KEY);
  if (legacy) {
    try {
      const state = JSON.parse(legacy) as WhiteboardState;
      await repository.create('Imported Board', state);
      storage.removeItem(LEGACY_STATE_KEY);
    } catch {
      // Corrupt JSON or a failed transaction must not prevent startup. A failed
      // transaction deliberately leaves the legacy value available for retry.
    }
  }
  return repository;
}
