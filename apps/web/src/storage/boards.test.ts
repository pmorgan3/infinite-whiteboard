import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WhiteboardState } from '@whiteboard/core';
import { LEGACY_STATE_KEY, openBoardRepository } from './boards';
import type { BoardRepository } from './boards';

const state = (label = 'one'): WhiteboardState => ({
  version: '1.0.0',
  elements: [{ id: label, type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 2 }],
  viewport: { x: 0, y: 0, zoom: 1 },
  toolColor: '#1f2937',
  toolStrokeWidth: 2,
  toolArrowStart: false,
  toolArrowEnd: true,
  snapEnabled: false,
  themeMode: 'light',
});

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('infinite-whiteboard');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe('IndexedDbBoardRepository', () => {
  let storage: Storage;
  let repository: BoardRepository | undefined;

  beforeEach(async () => {
    const values = new Map<string, string>();
    storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => { values.set(key, value); },
    };
    await deleteDatabase();
  });

  afterEach(() => repository?.close());

  it('creates, reads, updates, renames, and deletes boards', async () => {
    repository = await openBoardRepository(indexedDB, storage);
    const created = await repository.create('  Project  ', state());
    expect(created.name).toBe('Project');
    expect((await repository.get(created.id))?.state.elements[0].id).toBe('one');

    await repository.save(created.id, state('two'));
    const renamed = await repository.rename(created.id, '   ');
    expect(renamed.name).toBe('Untitled Board');
    expect(renamed.state.elements[0].id).toBe('two');

    await repository.delete(created.id);
    expect(await repository.get(created.id)).toBeUndefined();
  });

  it('sorts boards by most recently updated', async () => {
    repository = await openBoardRepository(indexedDB, storage);
    const older = await repository.create('Older', state());
    await new Promise((resolve) => setTimeout(resolve, 2));
    const newer = await repository.create('Newer', state());
    expect((await repository.list()).map((board) => board.id)).toEqual([newer.id, older.id]);
  });

  it('migrates legacy state once and removes it only after persistence', async () => {
    storage.setItem(LEGACY_STATE_KEY, JSON.stringify(state('legacy')));
    repository = await openBoardRepository(indexedDB, storage);
    const boards = await repository.list();
    expect(boards).toHaveLength(1);
    expect(boards[0].name).toBe('Imported Board');
    expect(boards[0].state.elements[0].id).toBe('legacy');
    expect(storage.getItem(LEGACY_STATE_KEY)).toBeNull();
  });

  it('ignores corrupt legacy JSON without preventing repository use', async () => {
    storage.setItem(LEGACY_STATE_KEY, '{bad json');
    repository = await openBoardRepository(indexedDB, storage);
    expect(await repository.list()).toEqual([]);
    expect((await repository.create('Works', state())).name).toBe('Works');
  });

  it('duplicates with a new id and independent deeply cloned state', async () => {
    repository = await openBoardRepository(indexedDB, storage);
    const source = await repository.create('Source', state());
    const copy = await repository.duplicate(source.id);
    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe('Source Copy');
    copy.state.elements[0].id = 'mutated-copy';
    expect((await repository.get(source.id))?.state.elements[0].id).toBe('one');
  });
});
