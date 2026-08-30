import { useEffect, useRef, useState, useCallback } from 'react';
import { Whiteboard, generateId } from '@whiteboard/core';
import type { ToolType, Point, TextElement } from '@whiteboard/core';
import { CollabProvider } from '@whiteboard/collab';
import type { CursorInfo } from '@whiteboard/collab';

interface CanvasProps {
  tool: ToolType;
  color: string;
  strokeWidth: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  roomId?: string;
  userName: string;
  snapEnabled?: boolean;
  onWhiteboardReady?: (wb: Whiteboard) => void;
  theme?: 'light' | 'dark';
  onChange?: () => void;
  onContentChange?: () => void;
  onViewportChange?: () => void;
}

export default function Canvas({ tool, color, strokeWidth, arrowStart, arrowEnd, roomId, userName, snapEnabled, onWhiteboardReady, theme, onChange, onContentChange, onViewportChange }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wbRef = useRef<Whiteboard | null>(null);
  const collabRef = useRef<CollabProvider | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePoint = useRef<Point | null>(null);
  const [cursors, setCursors] = useState<Map<number, CursorInfo>>(new Map());
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    const wb = new Whiteboard({
      canvas: canvasRef.current,
      onChange: () => {
        if (collabRef.current) {
          collabRef.current.setElements(wb.elements);
        }
        onChange?.();
        onContentChange?.();
        forceUpdate((value) => value + 1);
      },
      onViewportChange: () => {
        forceUpdate((value) => value + 1);
        onViewportChange?.();
      },
      onStartEditing: (elementId) => {
        setEditingElementId(elementId);
      },
      onRequestImageUpload: (point) => {
        pendingImagePoint.current = point;
        fileInputRef.current?.click();
      },
    });
    wbRef.current = wb;
    onWhiteboardReady?.(wb);

    return () => {
      wb.destroy();
      wbRef.current = null;
    };
  }, []);

  useEffect(() => {
    const wb = wbRef.current;
    if (!wb) return;
    wb.setTool(tool);
    wb.setToolOptions({ color, strokeWidth, arrowStart, arrowEnd });
  }, [tool, color, strokeWidth, arrowStart, arrowEnd]);

  useEffect(() => {
    const wb = wbRef.current;
    if (!wb) return;
    wb.snapConfig.enabled = snapEnabled ?? false;
    wb.scheduleRender();
  }, [snapEnabled]);

  useEffect(() => {
    const wb = wbRef.current;
    if (!wb || !roomId) return;

    const collab = new CollabProvider({
      roomId,
      websocketUrl: 'ws://localhost:1234',
      userName,
      userColor: color,
      onElementsChange: (elements) => {
        wb.elements = elements;
        wb.scheduleRender();
        onContentChange?.();
      },
      onCursorsChange: (newCursors) => {
        setCursors(new Map(newCursors));
      },
    });

    collabRef.current = collab;

    const sendCursor = (e: PointerEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const world = wb.viewport.screenToWorld(
        { x, y },
        canvas.clientWidth,
        canvas.clientHeight
      );
      collab.updateCursor(world.x, world.y);
    };
    window.addEventListener('pointermove', sendCursor);

    return () => {
      window.removeEventListener('pointermove', sendCursor);
      collab.destroy();
      collabRef.current = null;
    };
  }, [roomId, userName, color]);

  const getScreenPos = useCallback((world: Point): Point | null => {
    const wb = wbRef.current;
    const canvas = canvasRef.current;
    if (!wb || !canvas) return null;
    return wb.viewport.worldToScreen(world, canvas.clientWidth, canvas.clientHeight);
  }, []);

  const getEditingElement = useCallback((): TextElement | null => {
    const wb = wbRef.current;
    if (!wb || !editingElementId) return null;
    const el = wb.elements.find((e) => e.id === editingElementId);
    return el && el.type === 'text' ? el : null;
  }, [editingElementId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !wbRef.current) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const point = pendingImagePoint.current;
        const MAX_WIDTH = 800;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }
        wbRef.current?.addElement({
          id: generateId(),
          type: 'image',
          x: (point?.x ?? 0) - width / 2,
          y: (point?.y ?? 0) - height / 2,
          width,
          height,
          src: dataUrl,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          color: '',
          strokeWidth: 0,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);

    e.target.value = '';
    pendingImagePoint.current = null;
  };

  const handleTextCommit = (text: string) => {
    const wb = wbRef.current;
    if (!wb || !editingElementId) return;
    wb.updateElementWithHistory(editingElementId, { text });
    wb.stopEditing();
    setEditingElementId(null);
  };

  const handleTextCancel = () => {
    const wb = wbRef.current;
    if (!wb) return;
    wb.stopEditing();
    setEditingElementId(null);
  };

  const themeBg = theme === 'dark' ? '#1e1e1e' : '#ffffff';
  const cursorStroke = theme === 'dark' ? '#e5e7eb' : 'white';

  const editingEl = getEditingElement();
  const editingScreenPos = editingEl ? getScreenPos({ x: editingEl.x, y: editingEl.y }) : null;

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: tool === 'pan' ? 'grab' : 'crosshair',
        }}
      />

      {/* Hidden file input for image upload */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Text editor overlay */}
      {editingEl && editingScreenPos && (
        <textarea
          autoFocus
          defaultValue={editingEl.text}
          onBlur={(e) => handleTextCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleTextCommit(e.currentTarget.value);
            }
            if (e.key === 'Escape') {
              handleTextCancel();
            }
          }}
          className="text-editor-overlay"
          style={{
            position: 'absolute',
            left: editingScreenPos.x,
            top: editingScreenPos.y,
            width: editingEl.width * (wbRef.current?.viewport.zoom ?? 1),
            height: editingEl.height * (wbRef.current?.viewport.zoom ?? 1),
            fontSize: `${editingEl.fontSize * (wbRef.current?.viewport.zoom ?? 1)}px`,
            fontFamily: editingEl.fontFamily,
            color: editingEl.color,
            background: editingEl.fill === 'transparent' ? themeBg : editingEl.fill,
            zIndex: 20,
          }}
        />
      )}

      {Array.from(cursors.entries()).map(([id, cursor]) => {
        const pos = getScreenPos(cursor);
        if (!pos) return null;
        return (
          <div
            key={id}
            className="cursor"
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              pointerEvents: 'none',
              zIndex: 100,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.35Z" fill={cursor.color} stroke={cursorStroke} strokeWidth="1.5" />
            </svg>
            <span
              className="cursor-label"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.name}
            </span>
          </div>
        );
      })}
    </>
  );
}
