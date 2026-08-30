import type { Bounds, WBElement } from '@whiteboard/core';

export function searchElements(elements: WBElement[], query: string): WBElement[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return elements.filter((element) => {
    const value = element.type === 'text' ? element.text : element.type === 'group' ? element.label : null;
    return value?.toLocaleLowerCase().includes(needle) ?? false;
  });
}

export interface MinimapTransform { scale: number; offsetX: number; offsetY: number; bounds: Bounds; }

export function createMinimapTransform(bounds: Bounds, width: number, height: number, padding = 8): MinimapTransform {
  const worldWidth = Math.max(1, bounds.width);
  const worldHeight = Math.max(1, bounds.height);
  const scale = Math.max(0.000001, Math.min((width - padding * 2) / worldWidth, (height - padding * 2) / worldHeight));
  return { scale, offsetX: (width - worldWidth * scale) / 2 - bounds.left * scale,
    offsetY: (height - worldHeight * scale) / 2 - bounds.top * scale, bounds };
}

export function worldToMinimap(x: number, y: number, transform: MinimapTransform) {
  return { x: x * transform.scale + transform.offsetX, y: y * transform.scale + transform.offsetY };
}

export function minimapToWorld(x: number, y: number, transform: MinimapTransform) {
  return { x: (x - transform.offsetX) / transform.scale, y: (y - transform.offsetY) / transform.scale };
}
