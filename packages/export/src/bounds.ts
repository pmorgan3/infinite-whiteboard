import type { WBElement, GroupElement } from '@whiteboard/core';

export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computeBounds(elements: WBElement[]): ContentBounds | null {
  if (elements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    const bounds = getElementBounds(el);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  return { minX, minY, maxX, maxY };
}

function getElementBounds(el: WBElement): { minX: number; minY: number; maxX: number; maxY: number } {
  const pad = el.strokeWidth ?? 0;
  switch (el.type) {
    case 'path': {
      const xs = el.points.map(p => p.x);
      const ys = el.points.map(p => p.y);
      return {
        minX: Math.min(...xs) - pad,
        minY: Math.min(...ys) - pad,
        maxX: Math.max(...xs) + pad,
        maxY: Math.max(...ys) + pad,
      };
    }
    case 'rectangle':
      return { minX: el.x - pad, minY: el.y - pad, maxX: el.x + el.width + pad, maxY: el.y + el.height + pad };
    case 'ellipse':
      return { minX: el.x - el.rx - pad, minY: el.y - el.ry - pad, maxX: el.x + el.rx + pad, maxY: el.y + el.ry + pad };
    case 'text':
      return { minX: el.x - pad, minY: el.y - pad, maxX: el.x + el.width + pad, maxY: el.y + el.height + pad };
    case 'image':
      return { minX: el.x - pad, minY: el.y - pad, maxX: el.x + el.width + pad, maxY: el.y + el.height + pad };
    case 'arrow':
      return {
        minX: Math.min(el.startX, el.endX) - pad,
        minY: Math.min(el.startY, el.endY) - pad,
        maxX: Math.max(el.startX, el.endX) + pad,
        maxY: Math.max(el.startY, el.endY) + pad,
      };
    case 'group': {
      const g = el as GroupElement;
      if (g.bounds) {
        return { minX: g.bounds.left - pad, minY: g.bounds.top - pad, maxX: g.bounds.right + pad, maxY: g.bounds.bottom + pad };
      }
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
  }
}