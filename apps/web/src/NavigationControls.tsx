import { useEffect, useRef, useState } from 'react';
import type { Whiteboard } from '@whiteboard/core';

interface Props { whiteboard: Whiteboard | null; revision: number; navigate: (action: (wb: Whiteboard) => boolean | void) => void; }

export default function NavigationControls({ whiteboard, revision, navigate }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const zoom = whiteboard?.viewport.zoom ?? 1;
  const setZoom = (value: number) => navigate((wb) => wb.setZoomAroundPoint(value));
  return <div className="navigation-controls" ref={rootRef} aria-label="Canvas navigation" data-revision={revision}>
    <button onClick={() => setZoom(zoom / 1.2)} aria-label="Zoom out">−</button>
    <button className="zoom-percent" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>{Math.round(zoom * 100)}%</button>
    <button onClick={() => setZoom(zoom * 1.2)} aria-label="Zoom in">+</button>
    <button onClick={() => setZoom(1)} aria-label="Reset zoom to 100%">1:1</button>
    <button onClick={() => navigate((wb) => wb.fitAll())} aria-label="Fit all">Fit</button>
    <button onClick={() => navigate((wb) => wb.fitSelection())} disabled={!whiteboard?.selectedIds.size} aria-label="Fit selection">Sel</button>
    {open && <div className="zoom-menu" role="menu">
      {[0.25, 0.5, 1, 2].map((value) => <button role="menuitem" key={value} onClick={() => { setZoom(value); setOpen(false); }}>{value * 100}%</button>)}
      <button role="menuitem" onClick={() => { navigate((wb) => wb.fitAll()); setOpen(false); }}>Fit All</button>
      <button role="menuitem" disabled={!whiteboard?.selectedIds.size} onClick={() => { navigate((wb) => wb.fitSelection()); setOpen(false); }}>Fit Selection</button>
    </div>}
  </div>;
}
