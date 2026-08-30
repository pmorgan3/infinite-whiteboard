import { useEffect, useRef, useCallback } from 'react';
import type { Whiteboard, WhiteboardState } from '@whiteboard/core';

const SAVE_DELAY_MS = 500;

export class BoardSaveScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly persist: (boardId: string, state: WhiteboardState) => Promise<void>,
    private readonly onError: (error: unknown) => void,
    private readonly delay = SAVE_DELAY_MS,
  ) {}

  schedule(boardId: string, state: WhiteboardState): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.persist(boardId, state).catch(this.onError);
    }, this.delay);
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export function useAutoSave(
  wbRef: React.RefObject<Whiteboard | null>,
  themeMode: 'light' | 'dark',
  activeBoardId: string | null,
  saveState: (boardId: string, state: WhiteboardState) => Promise<void>,
  onError: (error: unknown) => void,
) {
  const saveStateRef = useRef(saveState);
  const onErrorRef = useRef(onError);
  saveStateRef.current = saveState;
  onErrorRef.current = onError;
  const schedulerRef = useRef<BoardSaveScheduler | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = new BoardSaveScheduler(
      (boardId, state) => saveStateRef.current(boardId, state),
      (error) => onErrorRef.current(error),
    );
  }

  const save = useCallback(async (boardId = activeBoardId) => {
    const wb = wbRef.current;
    if (!wb || !boardId) return false;
    const state = wb.getState(themeMode);
    try {
      await saveState(boardId, state);
      return true;
    } catch (error) {
      onError(error);
      return false;
    }
  }, [activeBoardId, onError, saveState, themeMode, wbRef]);

  const debouncedSave = useCallback(() => {
    const scheduledBoardId = activeBoardId;
    const wb = wbRef.current;
    if (!scheduledBoardId || !wb) return;
    const scheduledState = wb.getState(themeMode);
    schedulerRef.current?.schedule(scheduledBoardId, scheduledState);
  }, [activeBoardId, themeMode, wbRef]);

  const cancelPendingSave = useCallback(() => {
    schedulerRef.current?.cancel();
  }, []);

  useEffect(() => {
    return () => {
      cancelPendingSave();
    };
  }, [cancelPendingSave]);

  return { save, debouncedSave, cancelPendingSave };
}
