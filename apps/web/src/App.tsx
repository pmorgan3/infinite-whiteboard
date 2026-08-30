import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Canvas from './Canvas';
import Toolbar from './Toolbar';
import BottomSheet from './BottomSheet';
import Titlebar from './Titlebar';
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

function App() {
  const [restored, setRestored] = useState(false);
  const [tool, setTool] = useState<ToolType>('pan');
  const [color, setColor] = useState('#1f2937');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [arrowStart, setArrowStart] = useState(false);
  const [arrowEnd, setArrowEnd] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [joinedRoom, setJoinedRoom] = useState('');
  const [userName, setUserName] = useState('User ' + Math.floor(Math.random() * 1000));
  const [showCollab, setShowCollab] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showBoards, setShowBoards] = useState(false);
  const [saveNotice, setSaveNotice] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [boards, setBoards] = useState<BoardRecord[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const wbRef = useRef<Whiteboard | null>(null);
  const repositoryRef = useRef<BoardRepository | null>(null);
  const isMobile = useMediaQuery('(max-width: 640px)');
  const { resolvedTheme, toggle: toggleTheme } = useTheme();

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
        wb.setState(active.state);
        setColor(active.state.toolColor);
        setStrokeWidth(active.state.toolStrokeWidth);
        setArrowStart(active.state.toolArrowStart);
        setArrowEnd(active.state.toolArrowEnd);
        setSnapEnabled(active.state.snapEnabled);
      } catch (error) {
        reportStorageError(error);
      } finally {
        setRestored(true);
      }
    })();
  }, [reportStorageError, resolvedTheme]);

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
    setActiveBoardId(board.id);
    localStorage.setItem(ACTIVE_BOARD_KEY, board.id);
    wb.setState(board.state);
    setColor(board.state.toolColor);
    setStrokeWidth(board.state.toolStrokeWidth);
    setArrowStart(board.state.toolArrowStart);
    setArrowEnd(board.state.toolArrowEnd);
    setSnapEnabled(board.state.snapEnabled);
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void handleManualSave();
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
  }, [handleManualSave]);

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
        roomId={joinedRoom || undefined}
        userName={userName}
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
