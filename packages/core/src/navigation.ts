import type { Bounds, ViewportState, WBElement } from './types';
import { getElementBounds } from './snap';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 10;

export function unionBounds(bounds: Bounds[]): Bounds | null {
  const valid = bounds.filter((b) => [b.left, b.top, b.right, b.bottom].every(Number.isFinite));
  if (valid.length === 0) return null;
  const left = Math.min(...valid.map((b) => Math.min(b.left, b.right)));
  const top = Math.min(...valid.map((b) => Math.min(b.top, b.bottom)));
  const right = Math.max(...valid.map((b) => Math.max(b.left, b.right)));
  const bottom = Math.max(...valid.map((b) => Math.max(b.top, b.bottom)));
  return { left, top, right, bottom, width: right - left, height: bottom - top,
    centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

export function getElementsBounds(elements: WBElement[]): Bounds | null {
  return unionBounds(elements.map(getElementBounds));
}

export function viewportForBounds(
  bounds: Bounds,
  canvasWidth: number,
  canvasHeight: number,
  padding = 48,
): ViewportState | null {
  if (![canvasWidth, canvasHeight, padding].every(Number.isFinite) || canvasWidth <= 0 || canvasHeight <= 0) return null;
  const availableWidth = Math.max(1, canvasWidth - Math.max(0, padding) * 2);
  const availableHeight = Math.max(1, canvasHeight - Math.max(0, padding) * 2);
  const width = Math.max(0, Math.abs(bounds.right - bounds.left));
  const height = Math.max(0, Math.abs(bounds.bottom - bounds.top));
  const rawZoom = Math.min(width > 0 ? availableWidth / width : MAX_ZOOM, height > 0 ? availableHeight / height : MAX_ZOOM);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number.isFinite(rawZoom) ? rawZoom : 1));
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  if (![centerX, centerY, zoom].every(Number.isFinite)) return null;
  return { x: -centerX * zoom, y: -centerY * zoom, zoom };
}
