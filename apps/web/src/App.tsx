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
import { useAutoSave } from './useAutoSave';
import BoardManager from './BoardManager';
import { ACTIVE_BOARD_KEY, openBoardRepository } from './storage/boards';
import type { BoardRecord, BoardRepository } from './storage/boards';
import './App.scss';
import { Whiteboard, Viewport, DARK_THEME, LIGHT_THEME } from '@whiteboard/core';
import type { ToolType } from '@whiteboard/core';
import { exportToPng, exportToSvg, exportToJson, importFromJson } from '@whiteboard/export';
import { downloadBlob, downloadString } from './download';
import type { CollabStatus, ParticipantInfo } from '@whiteboard/collab';
import { collaborationWebsocketUrl, roomFromUrl, urlForRoom, validateRoomId } from './collaboration';

function App() {
  const [restored, setRestored] = useState(false);
  const [tool, setTool] = useState<ToolType>('pan');
  const [color, setColor] = useState('#1f2937');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [arrowStart, setArrowStart] = useState(false);
  const [arrowEnd, setArrowEnd] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(false);
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
  const [showBoards, setShowBoards] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);
  const [, setSelectionRevision] = useState(0);
  const [whiteboard, setWhiteboard] = useState<Whiteboard | null>(null);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [contentRevision, setContentRevision] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [minimapCollapsed, setMinimapCollapsed] = useState(() => localStorage.getItem('whiteboard:minimap-collapsed') === 'true');
  const [storageError, setStorageError] = useState('');
  const [boards, setBoards] = useState<BoardRecord[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const wbRef = useRef<Whiteboard | null>(null);
  const repositoryRef = useRef<BoardRepository | null>(null);
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

  const reportStorageError = useCallback((_error?: unknown) => {
    setStorageError('Board storage failed. Your current board remains open; try saving again.');
  }, []);

  const refreshBoards = useCallback(async () => {
    const repository = repositoryRef.current;
    if (repository) setBoards(await repository.list());
  }, []);

  const saveState = useCallback(async (boardId: string, state: ReturnType<Whiteboard['getState']>) => {
    const repository = repositoryRef.current;
    if (!repository) throw new Error('Board storage is not ready');
    await repository.save(boardId, state);
    setStorageError('');
    await refreshBoards();
  }, [refreshBoards]);

  const { save, debouncedSave, cancelPendingSave } = useAutoSave(
    wbRef,
    resolvedTheme,
    activeBoardId,
    saveState,
    reportStorageError,
  );

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
    void (async () => {
      try {
        const repository = await openBoardRepository();
        repositoryRef.current = repository;
        let available = await repository.list();
        let active = localStorage.getItem(ACTIVE_BOARD_KEY)
          ? await repository.get(localStorage.getItem(ACTIVE_BOARD_KEY) as string)
          : undefined;
        if (!active) active = available[0];
        if (!active) active = await repository.create('Untitled Board', wb.getState(resolvedTheme));
        available = await repository.list();
        setBoards(available);
        setActiveBoardId(active.id);
        localStorage.setItem(ACTIVE_BOARD_KEY, active.id);
        wb.setState(active.state, false);
        setColor(active.state.toolColor);
        setStrokeWidth(active.state.toolStrokeWidth);
        setArrowStart(active.state.toolArrowStart);
        setArrowEnd(active.state.toolArrowEnd);
        setSnapEnabled(active.state.snapEnabled);
        setContentRevision((value) => value + 1);
        setNavigationRevision((value) => value + 1);
      } catch (error) {
        reportStorageError(error);
      } finally {
        setRestored(true);
      }
    })();
  }, [reportStorageError, resolvedTheme]);

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
    const handleUnload = () => { void save(activeBoardId); };
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [activeBoardId, restored, save]);

  const applyBoard = useCallback((board: BoardRecord) => {
    const wb = wbRef.current;
    if (!wb) return;
    setJoinedRoom('');
    setParticipants([]);
    setCollabError(null);
    setCollabStatus('disconnected');
    window.history.replaceState({}, '', urlForRoom(new URL(window.location.href), null));
    setActiveBoardId(board.id);
    localStorage.setItem(ACTIVE_BOARD_KEY, board.id);
    wb.setState(board.state, false);
    setColor(board.state.toolColor);
    setStrokeWidth(board.state.toolStrokeWidth);
    setArrowStart(board.state.toolArrowStart);
    setArrowEnd(board.state.toolArrowEnd);
    setSnapEnabled(board.state.snapEnabled);
    setSelectionRevision((value) => value + 1);
    setContentRevision((value) => value + 1);
    setNavigationRevision((value) => value + 1);
  }, []);

  const handleOpenBoard = useCallback(async (id: string) => {
    const repository = repositoryRef.current;
    if (!repository || id === activeBoardId) return;
    cancelPendingSave();
    const saved = await save(activeBoardId);
    if (activeBoardId && !saved) return;
    try {
      const board = await repository.get(id);
      if (!board) throw new Error('Board not found');
      applyBoard(board);
      setShowBoards(false);
    } catch (error) {
      reportStorageError(error);
    }
  }, [activeBoardId, applyBoard, cancelPendingSave, reportStorageError, save]);

  const handleCreateBoard = useCallback(async () => {
    const repository = repositoryRef.current;
    const wb = wbRef.current;
    if (!repository || !wb) return;
    cancelPendingSave();
    const saved = await save(activeBoardId);
    if (activeBoardId && !saved) return;
    try {
      const blankState = wb.getState(resolvedTheme);
      blankState.elements = [];
      blankState.viewport = { x: 0, y: 0, zoom: 1 };
      const board = await repository.create('Untitled Board', blankState);
      applyBoard(board);
      await refreshBoards();
    } catch (error) {
      reportStorageError(error);
    }
  }, [activeBoardId, applyBoard, cancelPendingSave, refreshBoards, reportStorageError, resolvedTheme, save]);

  const handleRenameBoard = useCallback(async (id: string, name: string) => {
    try {
      await repositoryRef.current?.rename(id, name);
      await refreshBoards();
    } catch (error) { reportStorageError(error); }
  }, [refreshBoards, reportStorageError]);

  const handleDuplicateBoard = useCallback(async (id: string) => {
    try {
      if (id === activeBoardId) {
        cancelPendingSave();
        if (!await save(id)) return;
      }
      await repositoryRef.current?.duplicate(id);
      await refreshBoards();
    } catch (error) { reportStorageError(error); }
  }, [activeBoardId, cancelPendingSave, refreshBoards, reportStorageError, save]);

  const handleDeleteBoard = useCallback(async (id: string) => {
    const repository = repositoryRef.current;
    if (!repository) return;
    const board = boards.find((item) => item.id === id);
    if (!board || !confirm(`Delete “${board.name}”? This cannot be undone.`)) return;
    try {
      await repository.delete(id);
      let remaining = await repository.list();
      if (id === activeBoardId) {
        let replacement = remaining[0];
        if (!replacement) {
          const wb = wbRef.current;
          if (!wb) return;
          const state = wb.getState(resolvedTheme);
          state.elements = [];
          state.viewport = { x: 0, y: 0, zoom: 1 };
          replacement = await repository.create('Untitled Board', state);
          remaining = await repository.list();
        }
        applyBoard(replacement);
      }
      setBoards(remaining);
    } catch (error) { reportStorageError(error); }
  }, [activeBoardId, applyBoard, boards, reportStorageError, resolvedTheme]);

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

  const handleManualSave = useCallback(async () => {
    if (await save()) {
      setSaveNotice(true);
      setTimeout(() => setSaveNotice(false), 2000);
    }
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
        void handleManualSave();
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
        case 'n': case 'N': setTool('sticky'); break;
        case 'i': case 'I': setTool('image'); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleManualSave, navigate]);

  const activeBoard = boards.find((board) => board.id === activeBoardId);

  return (
    <div className="app">
      <Titlebar />
      {saveNotice && <div className="save-notice">Saved</div>}
      {storageError && <div className="storage-error" role="status">{storageError}</div>}
      <div className="app-inner">
      <Canvas
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        arrowStart={arrowStart}
        arrowEnd={arrowEnd}
        roomId={restored ? joinedRoom || undefined : undefined}
        userName={userName}
        websocketUrl={websocketUrl}
        onCollabStatus={setCollabStatus}
        onParticipantsChange={setParticipants}
        onCollabError={(error) => setCollabError(error?.message ?? null)}
        snapEnabled={snapEnabled}
        onWhiteboardReady={handleWhiteboardReady}
        theme={resolvedTheme}
        onChange={debouncedSave}
        onSelectionChange={() => setSelectionRevision(value => value + 1)}
        onContentChange={() => setContentRevision((value) => value + 1)}
        onViewportChange={() => setNavigationRevision((value) => value + 1)}
      />

      <NavigationControls whiteboard={whiteboard} revision={navigationRevision} navigate={navigate} />
      <Minimap whiteboard={whiteboard} revision={navigationRevision + contentRevision} theme={resolvedTheme} collapsed={minimapCollapsed} onCollapsedChange={setMinimapPreference} />
      <SearchPopover open={searchOpen} onClose={() => setSearchOpen(false)} whiteboard={whiteboard} contentRevision={contentRevision} navigate={navigate} />

      {wbRef.current && wbRef.current.selectedIds.size > 0 && (() => {
        const wb = wbRef.current!;
        const selected = wb.elements.filter(el => wb.selectedIds.has(el.id));
        const unlocked = selected.filter(el => !el.locked);
        const colors = new Set(unlocked.map(el => el.color).filter(Boolean));
        const widths = new Set(unlocked.map(el => el.strokeWidth));
        const allLocked = selected.every(el => el.locked);
        return <div className="property-bar" aria-label="Selection properties">
          <label title={colors.size > 1 ? 'Mixed colors' : 'Stroke color'}>
            Color
            <input type="color" value={colors.size === 1 ? [...colors][0] : '#808080'} onChange={e => { wb.updateSelection({ color: e.target.value }); setSelectionRevision(v => v + 1); }} disabled={!unlocked.length} />
          </label>
          <label title={widths.size > 1 ? 'Mixed widths' : 'Stroke width'}>
            Width
            <input type="number" min="1" max="20" value={widths.size === 1 ? [...widths][0] : ''} placeholder="Mixed" onChange={e => { const value = Number(e.target.value); if (value) wb.updateSelection({ strokeWidth: value }); setSelectionRevision(v => v + 1); }} disabled={!unlocked.length} />
          </label>
          <button onClick={() => { wb.updateSelection({ locked: !allLocked }); setSelectionRevision(v => v + 1); }}>{allLocked ? '🔓 Unlock' : '🔒 Lock'}</button>
          <button onClick={() => wb.reorderSelection('back')} disabled={!unlocked.length} title="Send to back">⇤</button>
          <button onClick={() => wb.reorderSelection('backward')} disabled={!unlocked.length} title="Send backward">←</button>
          <button onClick={() => wb.reorderSelection('forward')} disabled={!unlocked.length} title="Bring forward">→</button>
          <button onClick={() => wb.reorderSelection('front')} disabled={!unlocked.length} title="Bring to front">⇥</button>
        </div>;
      })()}

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
        className="boards-toggle"
        onClick={() => setShowBoards((shown) => !shown)}
        title="Boards"
        aria-label={`Boards. Current board: ${activeBoard?.name ?? 'Loading'}`}
      >
        <span aria-hidden="true">▤</span>
        <span className="active-board-name">{activeBoard?.name ?? 'Loading…'}</span>
      </button>

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
        <BottomSheet isOpen={showBoards} onClose={() => setShowBoards(false)} title="Boards">
          <BoardManager boards={boards} activeBoardId={activeBoardId ?? ''} onCreate={handleCreateBoard} onOpen={handleOpenBoard} onRename={handleRenameBoard} onDuplicate={handleDuplicateBoard} onDelete={handleDeleteBoard} />
        </BottomSheet>
      ) : (
        showBoards && <div className="boards-panel"><h3>Boards</h3><BoardManager boards={boards} activeBoardId={activeBoardId ?? ''} onCreate={handleCreateBoard} onOpen={handleOpenBoard} onRename={handleRenameBoard} onDuplicate={handleDuplicateBoard} onDelete={handleDeleteBoard} /></div>
      )}

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
