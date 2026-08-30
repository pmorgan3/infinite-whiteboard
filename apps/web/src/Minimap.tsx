import { useEffect, useRef } from 'react';
import { getElementBounds, getElementsBounds, unionNavigationBounds } from '@whiteboard/core';
import type { Bounds, Whiteboard } from '@whiteboard/core';
import { createMinimapTransform, minimapToWorld, worldToMinimap } from './navigationUtils';

interface Props { whiteboard: Whiteboard | null; revision: number; theme: 'light' | 'dark'; collapsed: boolean; onCollapsedChange: (value: boolean) => void; }
export default function Minimap({ whiteboard, revision, theme, collapsed, onCollapsedChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<ReturnType<typeof createMinimapTransform> | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !whiteboard || collapsed) return;
    const rect = canvas.getBoundingClientRect(); const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(rect.width * ratio)); canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
    const main = whiteboard.renderer['canvas'] as HTMLCanvasElement;
    const topLeft = whiteboard.viewport.screenToWorld({ x: 0, y: 0 }, main.clientWidth, main.clientHeight);
    const bottomRight = whiteboard.viewport.screenToWorld({ x: main.clientWidth, y: main.clientHeight }, main.clientWidth, main.clientHeight);
    const viewBounds: Bounds = { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y, centerX: (topLeft.x + bottomRight.x) / 2, centerY: (topLeft.y + bottomRight.y) / 2 };
    const contentBounds = getElementsBounds(whiteboard.elements);
    const worldBounds = unionNavigationBounds(contentBounds ? [contentBounds, viewBounds] : [viewBounds])!;
    const transform = createMinimapTransform(worldBounds, rect.width, rect.height); transformRef.current = transform;
    ctx.fillStyle = theme === 'dark' ? '#282828' : '#fff'; ctx.fillRect(0, 0, rect.width, rect.height);
    for (const element of whiteboard.elements) {
      const b = getElementBounds(element); const p = worldToMinimap(b.left, b.top, transform);
      if (![b.left, b.top, b.width, b.height].every(Number.isFinite)) continue;
      ctx.fillStyle = element.type === 'group' ? `${element.color || '#8b5cf6'}66` : theme === 'dark' ? '#9ca3af' : '#64748b';
      ctx.fillRect(p.x, p.y, Math.max(2, b.width * transform.scale), Math.max(2, b.height * transform.scale));
    }
    const p = worldToMinimap(viewBounds.left, viewBounds.top, transform);
    ctx.strokeStyle = theme === 'dark' ? '#60a5fa' : '#2563eb'; ctx.lineWidth = 2;
    ctx.strokeRect(p.x, p.y, viewBounds.width * transform.scale, viewBounds.height * transform.scale);
  }, [whiteboard, revision, theme, collapsed]);
  const recenter = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!whiteboard || !transformRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect(); const world = minimapToWorld(event.clientX - rect.left, event.clientY - rect.top, transformRef.current);
    whiteboard.viewport.x = -world.x * whiteboard.viewport.zoom; whiteboard.viewport.y = -world.y * whiteboard.viewport.zoom; whiteboard.notifyViewportChange();
  };
  if (collapsed) return <button className="minimap-show" onClick={() => onCollapsedChange(false)}>Show Minimap</button>;
  return <section className="minimap" aria-label="Board minimap"><button className="minimap-hide" onClick={() => onCollapsedChange(true)}>Hide Minimap</button>
    <canvas ref={canvasRef} aria-label="Click or drag to navigate board" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); recenter(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) recenter(event); }} /></section>;
}
