import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Canvas from './Canvas';
import Toolbar from './Toolbar';
import BottomSheet from './BottomSheet';
import Titlebar from './Titlebar';
import NavigationControls from './NavigationControls';
import Minimap from './Minimap';
import SearchPopover from './SearchPopover';
import { useMediaQuery } from './useMediaQuery';
import { useTheme } from './useTheme';
import { useAutoSave, loadState } from './useAutoSave';
import './App.scss';
import { Whiteboard, Viewport, DARK_THEME, LIGHT_THEME } from '@whiteboard/core';
import type { ToolType } from '@whiteboard/core';
import { exportToPng, exportToSvg, exportToJson, importFromJson } from '@whiteboard/export';
import { downloadBlob, downloadString } from './download';

function App() {
  const [restored, setRestored] = useState(false);
  const savedState = useMemo(() => loadState(), []);
  const [tool, setTool] = useState<ToolType>(savedState?.toolColor ? 'pan' : 'pan');
  const [color, setColor] = useState(savedState?.toolColor ?? '#1f2937');
  const [strokeWidth, setStrokeWidth] = useState(savedState?.toolStrokeWidth ?? 2);
  const [arrowStart, setArrowStart] = useState(savedState?.toolArrowStart ?? false);
  const [arrowEnd, setArrowEnd] = useState(savedState?.toolArrowEnd ?? true);
  const [snapEnabled, setSnapEnabled] = useState(savedState?.snapEnabled ?? false);
  const [roomId, setRoomId] = useState('');
  const [joinedRoom, setJoinedRoom] = useState('');
  const [userName, setUserName] = useState('User ' + Math.floor(Math.random() * 1000));
  const [showCollab, setShowCollab] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);
  const [whiteboard, setWhiteboard] = useState<Whiteboard | null>(null);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [contentRevision, setContentRevision] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [minimapCollapsed, setMinimapCollapsed] = useState(() => localStorage.getItem('whiteboard:minimap-collapsed') === 'true');
  const wbRef = useRef<Whiteboard | null>(null);
  const isMobile = useMediaQuery('(max-width: 640px)');
  const { resolvedTheme, toggle: toggleTheme } = useTheme();

  const themeConfig = useMemo(
    () => resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME,
    [resolvedTheme]
  );

  const { save, debouncedSave } = useAutoSave(wbRef, resolvedTheme);

  useEffect(() => {
    const wb = wbRef.current;
    if (wb) {
      wb.theme = themeConfig;
      wb.scheduleRender();
    }
  }, [themeConfig]);

  const handleWhiteboardReady = useCallback((wb: Whiteboard) => {
    wbRef.current = wb;
    setWhiteboard(wb);
    if (savedState) {
      wb.setState(savedState);
    }
    setRestored(true);
  }, [savedState]);

  const navigate = useCallback((action: (wb: Whiteboard) => boolean | void) => {
    const wb = wbRef.current;
    if (!wb) return;
    const start = wb.viewport.toState();
    const result = action(wb);
    if (result === false) return;
    const end = wb.viewport.toState();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    wb.viewport.x = start.x; wb.viewport.y = start.y; wb.viewport.zoom = start.zoom;
    const started = performance.now();
    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / 200);
      const eased = 1 - Math.pow(1 - progress, 3);
      wb.viewport.x = start.x + (end.x - start.x) * eased;
      wb.viewport.y = start.y + (end.y - start.y) * eased;
      wb.viewport.zoom = start.zoom + (end.zoom - start.zoom) * eased;
      wb.notifyViewportChange();
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, []);

  const setMinimapPreference = (collapsed: boolean) => {
    setMinimapCollapsed(collapsed);
    localStorage.setItem('whiteboard:minimap-collapsed', String(collapsed));
  };

  useEffect(() => {
    if (!restored) return;
    const handleUnload = () => { save(); };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      save();
    };
  }, [restored, save]);

  const exportBgColor = resolvedTheme === 'dark' ? '#1e1e1e' : '#ffffff';

  const handleExportPng = async () => {
    const wb = wbRef.current;
    if (!wb) return;
    setShowExport(false);
    const blob = await exportToPng(wb.elements, { scale: 2, background: exportBgColor, theme: themeConfig });
    downloadBlob(blob, 'whiteboard.png');
  };

  const handleExportSvg = () => {
    const wb = wbRef.current;
    if (!wb) return;
    setShowExport(false);
    const svg = exportToSvg(wb.elements, { background: exportBgColor });
    downloadString(svg, 'whiteboard.svg', 'image/svg+xml');
  };

  const handleExportJson = () => {
    const wb = wbRef.current;
    if (!wb) return;
    setShowExport(false);
    const json = exportToJson(wb.elements, wb.viewport.toState());
    const str = JSON.stringify(json, null, 2);
    downloadString(str, 'whiteboard.json', 'application/json');
  };

  const handleImportJson = () => {
    const wb = wbRef.current;
    if (!wb) return;
    setShowExport(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = importFromJson(reader.result as string);
          wb.elements = data.elements;
          wb.viewport = new Viewport(data.viewport);
          wb.scheduleRender();
          setContentRevision((value) => value + 1);
          setNavigationRevision((value) => value + 1);
        } catch {
          alert('Invalid file format');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleManualSave = useCallback(() => {
    save();
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 2000);
  }, [save]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault(); setSearchOpen(true); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault(); navigate((wb) => wb.setZoomAroundPoint(1)); return;
      }
      if (e.shiftKey && e.key === '1') { e.preventDefault(); navigate((wb) => wb.fitAll()); return; }
      if (e.shiftKey && e.key === '2') { e.preventDefault(); navigate((wb) => wb.fitSelection()); return; }
      switch (e.key) {
        case 'v': case 'V': setTool('select'); break;
        case 'h': case 'H': setTool('pan'); break;
        case 'd': case 'D': setTool('draw'); break;
        case 'r': case 'R': setTool('rectangle'); break;
        case 'e': case 'E': setTool('ellipse'); break;
        case 'a': case 'A': setTool('arrow'); break;
        case 't': case 'T': setTool('text'); break;
        case 'i': case 'I': setTool('image'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleManualSave, navigate]);

  return (
    <div className="app">
      <Titlebar />
      {saveNotice && <div className="save-notice">Saved</div>}
      <div className="app-inner">
      <Canvas
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        arrowStart={arrowStart}
        arrowEnd={arrowEnd}
        roomId={joinedRoom || undefined}
        userName={userName}
        snapEnabled={snapEnabled}
        onWhiteboardReady={handleWhiteboardReady}
        theme={resolvedTheme}
        onChange={debouncedSave}
        onContentChange={() => setContentRevision((value) => value + 1)}
        onViewportChange={() => setNavigationRevision((value) => value + 1)}
      />

      <NavigationControls whiteboard={whiteboard} revision={navigationRevision} navigate={navigate} />
      <Minimap whiteboard={whiteboard} revision={navigationRevision + contentRevision} theme={resolvedTheme} collapsed={minimapCollapsed} onCollapsedChange={setMinimapPreference} />
      <SearchPopover open={searchOpen} onClose={() => setSearchOpen(false)} whiteboard={whiteboard} contentRevision={contentRevision} navigate={navigate} />

      <Toolbar
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
        arrowStart={arrowStart}
        arrowEnd={arrowEnd}
        onArrowStartChange={setArrowStart}
        onArrowEndChange={setArrowEnd}
        snapEnabled={snapEnabled}
        onSnapToggle={() => setSnapEnabled((v) => !v)}
      />

      <button
        className="theme-toggle"
        onClick={toggleTheme}
        title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {resolvedTheme === 'dark' ? '☀️' : '🌙'}
      </button>

      <button
        className="collab-toggle"
        onClick={() => setShowCollab((s) => !s)}
        title="Collaboration"
      >
        👥
      </button>

      <button
        className="export-toggle"
        onClick={() => setShowExport((s) => !s)}
        title="Export"
      >
        💾
      </button>

      {isMobile ? (
        <BottomSheet isOpen={showExport} onClose={() => setShowExport(false)} title="Export">
          <button onClick={handleExportPng}>Export as PNG</button>
          <button onClick={handleExportSvg}>Export as SVG</button>
          <button onClick={handleExportJson}>Export as JSON</button>
          <button onClick={handleImportJson}>Import from JSON</button>
        </BottomSheet>
      ) : (
        showExport && (
          <div className="export-panel">
            <h3>Export</h3>
            <button onClick={handleExportPng}>Export as PNG</button>
            <button onClick={handleExportSvg}>Export as SVG</button>
            <button onClick={handleExportJson}>Export as JSON</button>
            <button onClick={handleImportJson}>Import from JSON</button>
          </div>
        )
      )}

      {isMobile ? (
        <BottomSheet isOpen={showCollab} onClose={() => setShowCollab(false)} title="Collaboration">
          <label>
            Name
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </label>
          <label>
            Room ID
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="e.g. project-alpha"
            />
          </label>
          <button
            onClick={() => setJoinedRoom(roomId)}
            disabled={!roomId}
          >
            {joinedRoom === roomId && roomId ? 'Connected' : 'Join Room'}
          </button>
          {joinedRoom && (
            <p className="room-info">Connected to: <strong>{joinedRoom}</strong></p>
          )}
        </BottomSheet>
      ) : (
        showCollab && (
          <div className="collab-panel">
            <h3>Collaboration</h3>
            <label>
              Name
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
            </label>
            <label>
              Room ID
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="e.g. project-alpha"
              />
            </label>
            <button
              onClick={() => setJoinedRoom(roomId)}
              disabled={!roomId}
            >
              {joinedRoom === roomId && roomId ? 'Connected' : 'Join Room'}
            </button>
            {joinedRoom && (
              <p className="room-info">Connected to: <strong>{joinedRoom}</strong></p>
            )}
          </div>
        )
      )}

      <div className="shortcuts">
        <span>Space / Alt+Drag to pan</span>
        <span>Ctrl+Z / Ctrl+Shift+Z for undo/redo</span>
        <span>Ctrl+S to save</span>
        <span>Delete to remove selected</span>
      </div>
      </div>
    </div>
  );
}

export default App;
