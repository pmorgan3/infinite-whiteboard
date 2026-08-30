import { useEffect, useRef, useState, useCallback } from 'react';
import { Whiteboard, generateId } from '@whiteboard/core';
import type { ToolType, Point, TextElement, StickyNoteElement, WBElement, TextAlign, FontWeight, FontStyle } from '@whiteboard/core';
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
  onSelectionChange?: () => void;
  onContentChange?: () => void;
  onViewportChange?: () => void;
}

export default function Canvas({ tool, color, strokeWidth, arrowStart, arrowEnd, roomId, userName, snapEnabled, onWhiteboardReady, theme, onChange, onSelectionChange, onContentChange, onViewportChange }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wbRef = useRef<Whiteboard | null>(null);
  const collabRef = useRef<CollabProvider | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePoint = useRef<Point | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
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
      onSelectionChange,
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

  const getEditingElement = useCallback((): TextElement | StickyNoteElement | null => {
    const wb = wbRef.current;
    if (!wb || !editingElementId) return null;
    const el = wb.elements.find((e) => e.id === editingElementId);
    return el && (el.type === 'text' || el.type === 'sticky') ? el : null;
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
    const current = wb.elements.find(el => el.id === editingElementId);
    if (!current || (current.type !== 'text' && current.type !== 'sticky')) return;
    if (!text.trim() && current.text === '') {
      wb.deleteElementsWithHistory([editingElementId]);
    } else {
      const zoom = wb.viewport.zoom;
      const neededHeight = Math.ceil((editorRef.current?.scrollHeight ?? current.height * zoom) / zoom);
      wb.updateElementWithHistory(editingElementId, { text, height: Math.max(current.height, neededHeight) });
    }
    wb.stopEditing();
    setEditingElementId(null);
  };

  const handleTextCancel = () => {
    const wb = wbRef.current;
    if (!wb) return;
    const current = editingElementId ? wb.elements.find(el => el.id === editingElementId) : null;
    if (current && (current.type === 'text' || current.type === 'sticky') && current.text === '') {
      wb.deleteElementsWithHistory([current.id]);
    }
    wb.stopEditing();
    setEditingElementId(null);
  };

  const themeBg = theme === 'dark' ? '#1e1e1e' : '#ffffff';
  const cursorStroke = theme === 'dark' ? '#e5e7eb' : 'white';

  const editingEl = getEditingElement();
  const selectedText = wbRef.current?.elements.filter((el): el is TextElement | StickyNoteElement =>
    wbRef.current!.selectedIds.has(el.id) && (el.type === 'text' || el.type === 'sticky')) ?? [];
  const formattedElements = editingEl ? [editingEl] : selectedText;

  const applyFormatting = (changes: Partial<WBElement>) => {
    const wb = wbRef.current;
    if (!wb) return;
    for (const el of formattedElements) wb.updateElementWithHistory(el.id, changes);
    forceUpdate(n => n + 1);
  };

  const applyStickyFill = (fill: string) => {
    const wb = wbRef.current;
    if (!wb) return;
    for (const el of formattedElements) if (el.type === 'sticky') wb.updateElementWithHistory(el.id, { fill });
    forceUpdate(n => n + 1);
  };

  const commonValue = (key: 'fontSize' | 'fontFamily' | 'textAlign' | 'fontWeight' | 'fontStyle' | 'color' | 'fill'): string | number | undefined => {
    const values = new Set(formattedElements.map(el => el[key]));
    return values.size === 1 ? formattedElements[0]?.[key] : undefined;
  };

  const toggleList = (ordered: boolean) => {
    const textarea = editorRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const start = value.lastIndexOf('\n', Math.max(0, textarea.selectionStart - 1)) + 1;
    const nextNewline = value.indexOf('\n', textarea.selectionEnd);
    const end = nextNewline < 0 ? value.length : nextNewline;
    const lines = value.slice(start, end).split('\n');
    const pattern = ordered ? /^\d+\.\s/ : /^-\s/;
    const remove = lines.every(line => !line || pattern.test(line));
    const changed = lines.map((line, index) => !line ? line : remove ? line.replace(pattern, '') : `${ordered ? `${index + 1}. ` : '- '}${line.replace(/^(?:- |\d+\.\s)/, '')}`);
    textarea.value = value.slice(0, start) + changed.join('\n') + value.slice(end);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  };
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
          ref={editorRef}
          autoFocus
          defaultValue={editingEl.text}
          onBlur={(e) => {
            if ((e.relatedTarget as HTMLElement | null)?.closest('.formatting-bar')) return;
            handleTextCommit(e.target.value);
          }}
          onInput={(e) => {
            const minimum = editingEl.height * (wbRef.current?.viewport.zoom ?? 1);
            e.currentTarget.style.height = `${Math.max(minimum, e.currentTarget.scrollHeight)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
            fontWeight: editingEl.fontWeight ?? 'normal',
            fontStyle: editingEl.fontStyle ?? 'normal',
            textAlign: editingEl.textAlign ?? 'left',
            lineHeight: 1.3,
            padding: `${(editingEl.type === 'sticky' ? 8 : 4) * (wbRef.current?.viewport.zoom ?? 1)}px`,
            resize: 'none',
            overflow: 'hidden',
            border: 'none',
            color: editingEl.color,
            background: editingEl.fill === 'transparent' ? themeBg : editingEl.fill,
            zIndex: 20,
          }}
        />
      )}

      {formattedElements.length > 0 && (
        <div className="formatting-bar" role="toolbar" aria-label="Text formatting">
          <select aria-label="Font size preset" value={String(commonValue('fontSize') ?? '')} onChange={e => applyFormatting({ fontSize: Number(e.target.value) })}>
            <option value="" disabled>Mixed</option>
            {[12, 16, 20, 24, 32, 48].map(size => <option key={size} value={size}>{size}px</option>)}
          </select>
          <input aria-label="Font size" type="number" min="8" max="96" value={String(commonValue('fontSize') ?? '')} placeholder="Mixed" onChange={e => {
            const size = Number(e.target.value);
            if (Number.isFinite(size) && size >= 8 && size <= 96) applyFormatting({ fontSize: size });
          }} />
          <select aria-label="Font family" value={String(commonValue('fontFamily') ?? '')} onChange={e => applyFormatting({ fontFamily: e.target.value })}>
            <option value="" disabled>Mixed</option><option value="sans-serif">Sans</option><option value="serif">Serif</option><option value="monospace">Mono</option>
          </select>
          {(['left', 'center', 'right'] as TextAlign[]).map(align => <button key={align} aria-label={`${align} align`} aria-pressed={commonValue('textAlign') === align} onClick={() => applyFormatting({ textAlign: align })}>{align[0].toUpperCase()}</button>)}
          <button aria-label="Bold" aria-pressed={commonValue('fontWeight') === 'bold'} onClick={() => applyFormatting({ fontWeight: (commonValue('fontWeight') === 'bold' ? 'normal' : 'bold') as FontWeight })}><strong>B</strong></button>
          <button aria-label="Italic" aria-pressed={commonValue('fontStyle') === 'italic'} onClick={() => applyFormatting({ fontStyle: (commonValue('fontStyle') === 'italic' ? 'normal' : 'italic') as FontStyle })}><em>I</em></button>
          {editingEl && <><button aria-label="Bulleted list" onClick={() => toggleList(false)}>• list</button><button aria-label="Numbered list" onClick={() => toggleList(true)}>1. list</button></>}
          <input aria-label="Text color" type="color" value={String(commonValue('color') ?? '#1f2937')} onChange={e => applyFormatting({ color: e.target.value })} />
          {formattedElements.some(el => el.type === 'sticky') && <input aria-label="Sticky fill" type="color" value={String(commonValue('fill') ?? '#fef08a')} onChange={e => applyStickyFill(e.target.value)} />}
        </div>
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
