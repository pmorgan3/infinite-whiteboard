import { describe, expect, it } from 'vitest';
import { boundsFromPoints, hitTestHandle, pointInRotatedBounds, resizeBounds, rotatePoint, transformElement } from './geometry';
import type { RectangleElement } from './types';

const bounds = boundsFromPoints([{ x: 0, y: 0 }, { x: 100, y: 50 }]);
describe('object transform geometry', () => {
  it('rotates points and hit tests rotated rectangles', () => {
    expect(rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, Math.PI / 2).x).toBeCloseTo(0);
    expect(pointInRotatedBounds({ x: 50, y: -20 }, bounds, Math.PI / 2)).toBe(true);
    expect(pointInRotatedBounds({ x: 0, y: 0 }, bounds, Math.PI / 2)).toBe(false);
  });
  it('keeps handle hit areas zoom independent and anchors opposite edges', () => {
    expect(hitTestHandle({ x: 104, y: 54 }, bounds, 1)).toBe('se');
    expect(hitTestHandle({ x: 102, y: 52 }, bounds, 2)).toBe('se');
    const resized = resizeBounds(bounds, 'nw', { x: 20, y: 10 });
    expect(resized.right).toBe(100); expect(resized.bottom).toBe(50);
  });
  it('scales element geometry deterministically', () => {
    const rect: RectangleElement = { id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: '#000', strokeWidth: 2 };
    expect(transformElement(rect, bounds, resizeBounds(bounds, 'se', { x: 200, y: 100 }))).toMatchObject({ width: 200, height: 100 });
  });
});
