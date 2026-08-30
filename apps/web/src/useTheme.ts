import { useState, useEffect, useCallback } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('whiteboard-theme');
    return (saved as ThemeMode) ?? 'system';
  });

  const resolvedTheme = mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    localStorage.setItem('whiteboard-theme', mode);
  }, [resolvedTheme, mode]);

  const toggle = useCallback(() => {
    setMode(prev => {
      if (prev === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark';
      if (prev === 'light') return 'dark';
      return 'light';
    });
  }, []);

  useEffect(() => {
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      document.documentElement.setAttribute('data-theme', mql.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  return { mode, resolvedTheme, setMode, toggle };
}