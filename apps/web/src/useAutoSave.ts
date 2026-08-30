import { useEffect, useRef, useCallback } from 'react';
import type { Whiteboard, WhiteboardState } from '@whiteboard/core';

const STORAGE_KEY = 'whiteboard-state';
const SAVE_DELAY_MS = 500;

function saveToLocalStorage(state: WhiteboardState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function loadState(): WhiteboardState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WhiteboardState;
  } catch {
    return null;
  }
}

export function useAutoSave(
  wbRef: React.RefObject<Whiteboard | null>,
  themeMode: 'light' | 'dark',
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(() => {
    const wb = wbRef.current;
    if (!wb) return;
    const state = wb.getState(themeMode);
    saveToLocalStorage(state);
  }, [wbRef, themeMode]);

  const debouncedSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, SAVE_DELAY_MS);
  }, [save]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { save, debouncedSave };
}