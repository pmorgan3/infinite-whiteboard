import type { Point, WBElement, SnapConfig, Bounds, SnapGuides, AnchorPosition, ArrowElement, GroupElement } from './types';
import type { Viewport } from './viewport';

export function snapToGrid(point: Point, config: SnapConfig): Point {
  if (!config.enabled) return point;
  return {
    x: Math.round(point.x / config.gridSize) * config.gridSize,
    y: Math.round(point.y / config.gridSize) * config.gridSize,
  };
}

export function getElementBounds(el: WBElement): Bounds {
  switch (el.type) {
    case 'rectangle':
      return {
        left: el.x,
        top: el.y,
        right: el.x + el.width,
        bottom: el.y + el.height,
        centerX: el.x + el.width / 2,
        centerY: el.y + el.height / 2,
        width: el.width,
        height: el.height,
      };
    case 'ellipse':
      return {
        left: el.x - el.rx,
        top: el.y - el.ry,
        right: el.x + el.rx,
        bottom: el.y + el.ry,
        centerX: el.x,
        centerY: el.y,
        width: el.rx * 2,
        height: el.ry * 2,
      };
    case 'path': {
      const xs = el.points.map(p => p.x);
      const ys = el.points.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return {
        left: minX,
        top: minY,
        right: maxX,
        bottom: maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
    case 'text':
    case 'image':
      return {
        left: el.x,
        top: el.y,
        right: el.x + el.width,
        bottom: el.y + el.height,
        centerX: el.x + el.width / 2,
        centerY: el.y + el.height / 2,
        width: el.width,
        height: el.height,
      };
    case 'arrow': {
      const minX = Math.min(el.startX, el.endX);
      const maxX = Math.max(el.startX, el.endX);
      const minY = Math.min(el.startY, el.endY);
      const maxY = Math.max(el.startY, el.endY);
      return {
        left: minX,
        top: minY,
        right: maxX,
        bottom: maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
    case 'group': {
      const b = (el as GroupElement).bounds;
      if (b) return b;
      return { left: 0, top: 0, right: 0, bottom: 0, centerX: 0, centerY: 0, width: 0, height: 0 };
    }
  }
}

export function shiftBounds(bounds: Bounds, dx: number, dy: number): Bounds {
  return {
    left: bounds.left + dx,
    top: bounds.top + dy,
    right: bounds.right + dx,
    bottom: bounds.bottom + dy,
    centerX: bounds.centerX + dx,
    centerY: bounds.centerY + dy,
    width: bounds.width,
    height: bounds.height,
  };
}

export function snapToGuides(
  movingBounds: Bounds,
  allElements: Bounds[],
  config: SnapConfig,
  viewport: Viewport,
): SnapGuides {
  if (!config.enabled) {
    return {
      horizontal: [],
      vertical: [],
      snappedPoint: { x: movingBounds.centerX, y: movingBounds.centerY },
    };
  }

  const threshold = config.threshold / viewport.zoom;
  const horizontal: number[] = [];
  const vertical: number[] = [];

  let snapDx = 0;
  let snapDy = 0;

  for (const other of allElements) {
    let bestXDx = Infinity;
    let bestXRef = 0;
    let bestYDy = Infinity;
    let bestYRef = 0;

    for (const ref of [other.left, other.centerX, other.right]) {
      for (const moving of [movingBounds.left, movingBounds.centerX, movingBounds.right]) {
        const diff = ref - moving;
        if (Math.abs(diff) < threshold && Math.abs(diff) < Math.abs(bestXDx)) {
          bestXDx = diff;
          bestXRef = ref;
        }
      }
    }

    for (const ref of [other.top, other.centerY, other.bottom]) {
      for (const moving of [movingBounds.top, movingBounds.centerY, movingBounds.bottom]) {
        const diff = ref - moving;
        if (Math.abs(diff) < threshold && Math.abs(diff) < Math.abs(bestYDy)) {
          bestYDy = diff;
          bestYRef = ref;
        }
      }
    }

    if (Math.abs(bestXDx) < threshold) {
      snapDx += bestXDx;
      if (!vertical.includes(bestXRef)) {
        vertical.push(bestXRef);
      }
    }

    if (Math.abs(bestYDy) < threshold) {
      snapDy += bestYDy;
      if (!horizontal.includes(bestYRef)) {
        horizontal.push(bestYRef);
      }
    }
  }

  return {
    horizontal,
    vertical,
    snappedPoint: { x: movingBounds.centerX + snapDx, y: movingBounds.centerY + snapDy },
  };
}

export function getAnchorPoint(el: WBElement, position: AnchorPosition, additionalOffset?: number): Point {
  const bounds = getElementBounds(el);
  const offset = additionalOffset ?? 0;
  switch (position) {
    case 'top':    return { x: bounds.centerX, y: bounds.top - offset };
    case 'right':  return { x: bounds.right + offset, y: bounds.centerY };
    case 'bottom': return { x: bounds.centerX, y: bounds.bottom + offset };
    case 'left':   return { x: bounds.left - offset, y: bounds.centerY };
    case 'center': return { x: bounds.centerX, y: bounds.centerY };
  }
}

export function resolveBindings(elements: WBElement[]): void {
  for (const el of elements) {
    if (el.type !== 'arrow') continue;
    const arrow = el as ArrowElement;
    if (arrow.startBinding) {
      const bound = elements.find(e => e.id === arrow.startBinding!.elementId);
      if (bound) {
        const point = getAnchorPoint(bound, arrow.startBinding.position);
        arrow.startX = point.x;
        arrow.startY = point.y;
      }
    }
    if (arrow.endBinding) {
      const bound = elements.find(e => e.id === arrow.endBinding!.elementId);
      if (bound) {
        const point = getAnchorPoint(bound, arrow.endBinding.position);
        arrow.endX = point.x;
        arrow.endY = point.y;
      }
    }
  }
}

export function cleanupBindings(elements: WBElement[], deletedIds: Set<string>): void {
  for (const el of elements) {
    if (el.type !== 'arrow') continue;
    const arrow = el as ArrowElement;
    if (arrow.startBinding && deletedIds.has(arrow.startBinding.elementId)) {
      arrow.startBinding = null;
    }
    if (arrow.endBinding && deletedIds.has(arrow.endBinding.elementId)) {
      arrow.endBinding = null;
    }
  }
}