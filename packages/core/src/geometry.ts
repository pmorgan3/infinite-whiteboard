import type { Bounds, Point, ResizeHandle, WBElement } from './types';

export const MIN_ELEMENT_SIZE = 8;
export const ROTATION_SNAP = Math.PI / 12;

export function rotatePoint(point: Point, center: Point, angle: number): Point {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = point.x - center.x, dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

export function boundsFromPoints(points: Point[]): Bounds {
  if (!points.length) return { left: 0, top: 0, right: 0, bottom: 0, centerX: 0, centerY: 0, width: 0, height: 0 };
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { left, top, right, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2, width: right - left, height: bottom - top };
}

export function unionBounds(bounds: Bounds[]): Bounds {
  if (!bounds.length) return boundsFromPoints([]);
  return boundsFromPoints(bounds.flatMap(b => [{ x: b.left, y: b.top }, { x: b.right, y: b.bottom }]));
}

export function rotatedRectBounds(bounds: Bounds, rotation = 0): Bounds {
  if (!rotation) return bounds;
  const center = { x: bounds.centerX, y: bounds.centerY };
  return boundsFromPoints([
    { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom },
  ].map(p => rotatePoint(p, center, rotation)));
}

export function pointInRotatedBounds(point: Point, bounds: Bounds, rotation = 0, margin = 0): boolean {
  const local = rotatePoint(point, { x: bounds.centerX, y: bounds.centerY }, -rotation);
  return local.x >= bounds.left - margin && local.x <= bounds.right + margin && local.y >= bounds.top - margin && local.y <= bounds.bottom + margin;
}

export function getHandlePoints(bounds: Bounds, zoom = 1): Record<ResizeHandle | 'rotate', Point> {
  const x = bounds.centerX, y = bounds.centerY;
  return {
    nw: { x: bounds.left, y: bounds.top }, n: { x, y: bounds.top }, ne: { x: bounds.right, y: bounds.top },
    e: { x: bounds.right, y }, se: { x: bounds.right, y: bounds.bottom }, s: { x, y: bounds.bottom },
    sw: { x: bounds.left, y: bounds.bottom }, w: { x: bounds.left, y }, rotate: { x, y: bounds.top - 28 / zoom },
  };
}

export function hitTestHandle(point: Point, bounds: Bounds, zoom = 1): ResizeHandle | 'rotate' | null {
  const radius = 10 / zoom;
  for (const [handle, p] of Object.entries(getHandlePoints(bounds, zoom))) {
    if (Math.hypot(point.x - p.x, point.y - p.y) <= radius) return handle as ResizeHandle | 'rotate';
  }
  return null;
}

export function resizeBounds(start: Bounds, handle: ResizeHandle, point: Point, preserveAspect = false): Bounds {
  let left = start.left, right = start.right, top = start.top, bottom = start.bottom;
  if (handle.includes('w')) left = Math.min(point.x, right - MIN_ELEMENT_SIZE);
  if (handle.includes('e')) right = Math.max(point.x, left + MIN_ELEMENT_SIZE);
  if (handle.includes('n')) top = Math.min(point.y, bottom - MIN_ELEMENT_SIZE);
  if (handle.includes('s')) bottom = Math.max(point.y, top + MIN_ELEMENT_SIZE);
  if (preserveAspect && handle.length === 2) {
    const ratio = Math.max(MIN_ELEMENT_SIZE, start.width) / Math.max(MIN_ELEMENT_SIZE, start.height);
    let width = right - left, height = bottom - top;
    if (width / height > ratio) height = width / ratio; else width = height * ratio;
    if (handle.includes('w')) left = right - width; else right = left + width;
    if (handle.includes('n')) top = bottom - height; else bottom = top + height;
  }
  return boundsFromPoints([{ x: left, y: top }, { x: right, y: bottom }]);
}

export function transformElement(el: WBElement, from: Bounds, to: Bounds): WBElement {
  const sx = to.width / Math.max(from.width, 0.0001), sy = to.height / Math.max(from.height, 0.0001);
  const map = (p: Point): Point => ({ x: to.left + (p.x - from.left) * sx, y: to.top + (p.y - from.top) * sy });
  if (el.type === 'path') return { ...el, points: el.points.map(map), strokeWidth: el.strokeWidth * Math.sqrt(Math.abs(sx * sy)) };
  if (el.type === 'arrow') { const a = map({ x: el.startX, y: el.startY }), b = map({ x: el.endX, y: el.endY }); return { ...el, startX: a.x, startY: a.y, endX: b.x, endY: b.y }; }
  if (el.type === 'ellipse') { const c = map({ x: el.x, y: el.y }); return { ...el, x: c.x, y: c.y, rx: Math.max(MIN_ELEMENT_SIZE / 2, el.rx * Math.abs(sx)), ry: Math.max(MIN_ELEMENT_SIZE / 2, el.ry * Math.abs(sy)) }; }
  if (el.type === 'rectangle' || el.type === 'text' || el.type === 'sticky' || el.type === 'image') { const p = map({ x: el.x, y: el.y }); return { ...el, x: p.x, y: p.y, width: Math.max(MIN_ELEMENT_SIZE, el.width * Math.abs(sx)), height: Math.max(MIN_ELEMENT_SIZE, el.height * Math.abs(sy)), ...(el.type === 'text' || el.type === 'sticky' ? { fontSize: Math.max(6, el.fontSize * Math.sqrt(Math.abs(sx * sy))) } : {}) } as WBElement; }
  return el;
}

export function rotateElement(el: WBElement, center: Point, angle: number): WBElement {
  if (el.type === 'path') return { ...el, points: el.points.map(p => rotatePoint(p, center, angle)) };
  if (el.type === 'arrow') { const a = rotatePoint({ x: el.startX, y: el.startY }, center, angle), b = rotatePoint({ x: el.endX, y: el.endY }, center, angle); return { ...el, startX: a.x, startY: a.y, endX: b.x, endY: b.y }; }
  if (el.type === 'ellipse') { const p = rotatePoint({ x: el.x, y: el.y }, center, angle); return { ...el, x: p.x, y: p.y, rotation: (el.rotation ?? 0) + angle }; }
  if (el.type === 'rectangle' || el.type === 'text' || el.type === 'sticky' || el.type === 'image') { const c = rotatePoint({ x: el.x + el.width / 2, y: el.y + el.height / 2 }, center, angle); return { ...el, x: c.x - el.width / 2, y: c.y - el.height / 2, rotation: (el.rotation ?? 0) + angle }; }
  return el;
}
