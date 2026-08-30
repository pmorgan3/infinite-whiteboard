import { useEffect, useState } from 'react';

export default function Titlebar() {
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    const tauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    setIsTauri(tauri);
    if (tauri) {
      document.querySelector('.app')?.classList.add('tauri');
    }
  }, []);

  if (!isTauri) return null;

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {}
  };

  const handleToggleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().toggleMaximize();
    } catch {}
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch {}
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="titlebar-title" data-tauri-drag-region>Infinite Whiteboard</span>
      <div className="titlebar-buttons">
        <button className="titlebar-btn minimize" onClick={handleMinimize} title="Minimize">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect y="5" width="12" height="1" fill="currentColor" /></svg>
        </button>
        <button className="titlebar-btn maximize" onClick={handleToggleMaximize} title="Maximize">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
        </button>
        <button className="titlebar-btn close" onClick={handleClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
    </div>
  );
}