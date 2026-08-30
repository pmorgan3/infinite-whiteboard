import { describe, expect, it, vi } from 'vitest';
import type { WhiteboardState } from '@whiteboard/core';
import { BoardSaveScheduler } from './useAutoSave';

const state = (color: string): WhiteboardState => ({
  version: '1.0.0', elements: [], viewport: { x: 0, y: 0, zoom: 1 },
  toolColor: color, toolStrokeWidth: 2, toolArrowStart: false,
  toolArrowEnd: true, snapEnabled: false, themeMode: 'light',
});

describe('BoardSaveScheduler', () => {
  it('persists the board id and state captured when a save was scheduled', async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => undefined);
    const scheduler = new BoardSaveScheduler(persist, () => undefined);
    scheduler.schedule('board-a', state('red'));

    await vi.advanceTimersByTimeAsync(500);

    expect(persist).toHaveBeenCalledWith('board-a', expect.objectContaining({ toolColor: 'red' }));
    vi.useRealTimers();
  });

  it('cancels a stale pending save during board switching', async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => undefined);
    const scheduler = new BoardSaveScheduler(persist, () => undefined);
    scheduler.schedule('board-a', state('red'));
    scheduler.cancel();
    scheduler.schedule('board-b', state('blue'));

    await vi.advanceTimersByTimeAsync(500);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('board-b', expect.objectContaining({ toolColor: 'blue' }));
    vi.useRealTimers();
  });
});
