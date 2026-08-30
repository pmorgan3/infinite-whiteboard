import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Canvas from './Canvas';
import Toolbar from './Toolbar';
import BottomSheet from './BottomSheet';
import Titlebar from './Titlebar';
import { useMediaQuery } from './useMediaQuery';
import { useTheme } from './useTheme';
import { useAutoSave, loadState } from './useAutoSave';
import './App.scss';
import { Whiteboard, Viewport, DARK_THEME, LIGHT_THEME } from '@whiteboard/core';
import type { ToolType } from '@whiteboard/core';
import { exportToPng, exportToSvg, exportToJson, importFromJson } from '@whiteboard/export';
import { downloadBlob, downloadString } from './download';
import type { CollabStatus, ParticipantInfo } from '@whiteboard/collab';
import { collaborationWebsocketUrl, roomFromUrl, urlForRoom, validateRoomId } from './collaboration';

function App() {
  const [restored, setRestored] = useState(false);
  const savedState = useMemo(() => loadState(), []);
  const [tool, setTool] = useState<ToolType>(savedState?.toolColor ? 'pan' : 'pan');
  const [color, setColor] = useState(savedState?.toolColor ?? '#1f2937');
  const [strokeWidth, setStrokeWidth] = useState(savedState?.toolStrokeWidth ?? 2);
  const [arrowStart, setArrowStart] = useState(savedState?.toolArrowStart ?? false);
  const [arrowEnd, setArrowEnd] = useState(savedState?.toolArrowEnd ?? true);
  const [snapEnabled, setSnapEnabled] = useState(savedState?.snapEnabled ?? false);
  const initialRoom = useMemo(() => roomFromUrl(new URL(window.location.href)), []);
  const [roomId, setRoomId] = useState(initialRoom.roomId ?? new URL(window.location.href).searchParams.get('room') ?? '');
  const [joinedRoom, setJoinedRoom] = useState(initialRoom.roomId ?? '');
  const [roomError, setRoomError] = useState<string | null>(initialRoom.error);
  const [collabStatus, setCollabStatus] = useState<CollabStatus>('disconnected');
  const [collabError, setCollabError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [userName, setUserName] = useState('User ' + Math.floor(Math.random() * 1000));
  const [showCollab, setShowCollab] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);
  const wbRef = useRef<Whiteboard | null>(null);
  const isMobile = useMediaQuery('(max-width: 640px)');
  const { resolvedTheme, toggle: toggleTheme } = useTheme();
  const websocketUrl = useMemo(() => collaborationWebsocketUrl(window.location), []);

  useEffect(() => {
    const handlePopState = () => {
      const parsed = roomFromUrl(new URL(window.location.href));
      setRoomError(parsed.error);
      setRoomId(parsed.roomId ?? '');
      setJoinedRoom(parsed.roomId ?? '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
    if (savedState) {
      wb.setState(savedState);
    }
    setRestored(true);
  }, [savedState]);

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

  const joinRoom = () => {
    const error = validateRoomId(roomId);
    setRoomError(error);
    if (error) return;
    setCollabError(null);
    setCollabStatus('connecting');
    setJoinedRoom(roomId);
    window.history.pushState({}, '', urlForRoom(new URL(window.location.href), roomId));
  };

  const leaveRoom = () => {
    setJoinedRoom('');
    setParticipants([]);
    setCollabError(null);
    setCollabStatus('disconnected');
    window.history.pushState({}, '', urlForRoom(new URL(window.location.href), null));
  };

  const copyShareLink = async () => {
    if (!joinedRoom) return;
    try { await navigator.clipboard.writeText(urlForRoom(new URL(window.location.href), joinedRoom).href); }
    catch { setCollabError('Could not copy the share link. Copy it from the address bar instead.'); }
  };

  const collaborationControls = (
    <>
      <label>Name<input value={userName} onChange={(e) => setUserName(e.target.value)} /></label>
      <label>Room ID<input value={roomId} onChange={(e) => { setRoomId(e.target.value); setRoomError(null); }} placeholder="e.g. project-alpha" /></label>
      {roomError && <p className="collab-error" role="alert">{roomError}</p>}
      {!joinedRoom ? <button onClick={joinRoom}>Join Room</button> : (
        <div className="collab-actions"><button onClick={copyShareLink}>Copy Share Link</button><button onClick={leaveRoom}>Leave Room</button></div>
      )}
      <p className={`collab-status status-${collabStatus}`}><span aria-hidden="true" />{collabStatus[0].toUpperCase() + collabStatus.slice(1)}{joinedRoom ? ` · ${joinedRoom}` : ''}</p>
      {collabError && <p className="collab-error" role="alert">{collabError}</p>}
      {joinedRoom && <div className="participants"><strong>Participants ({participants.length})</strong>{participants.map((person) => <span key={person.clientId}><i style={{ background: person.color }} />{person.name}{person.isLocal ? ' (you)' : ''}</span>)}</div>}
      <p className="security-note">Anyone with this room link can access and edit the board.</p>
    </>
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
        return;
      }
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
  }, []);

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
        websocketUrl={websocketUrl}
        onCollabStatus={setCollabStatus}
        onParticipantsChange={setParticipants}
        onCollabError={(error) => setCollabError(error?.message ?? null)}
        snapEnabled={snapEnabled}
        onWhiteboardReady={handleWhiteboardReady}
        theme={resolvedTheme}
        onChange={debouncedSave}
      />

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
          {collaborationControls}
        </BottomSheet>
      ) : (
        showCollab && (
          <div className="collab-panel">
            <h3>Collaboration</h3>
            {collaborationControls}
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
