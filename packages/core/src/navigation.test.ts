import { describe, expect, it } from 'vitest';
import { getElementsBounds, viewportForBounds } from './navigation';

describe('viewportForBounds', () => {
  it('centers negative bounds with screen-space padding', () => {
    const result = viewportForBounds({ left: -200, top: -100, right: 0, bottom: 100, width: 200, height: 200, centerX: -100, centerY: 0 }, 1000, 600, 50)!;
    expect(result.zoom).toBe(2.5);
    expect(result.x).toBe(250);
    expect(result.y).toBe(-0);
  });
  it('clamps zero-sized and huge bounds to finite zoom limits', () => {
    expect(viewportForBounds({ left: 1, right: 1, top: 2, bottom: 2, width: 0, height: 0, centerX: 1, centerY: 2 }, 800, 600)!.zoom).toBe(10);
    expect(viewportForBounds({ left: 0, right: 1e9, top: 0, bottom: 1e9, width: 1e9, height: 1e9, centerX: 5e8, centerY: 5e8 }, 800, 600)!.zoom).toBe(0.05);
  });
  it('rejects invalid canvas dimensions', () => expect(viewportForBounds({} as any, 0, 0)).toBeNull());
});

describe('getElementsBounds', () => {
  it('returns null for empty content and unions a selection', () => {
    expect(getElementsBounds([])).toBeNull();
    expect(getElementsBounds([
      { id: 'a', type: 'rectangle', x: -10, y: 5, width: 20, height: 10, color: '', strokeWidth: 1 },
      { id: 'b', type: 'ellipse', x: 30, y: 0, rx: 5, ry: 10, color: '', strokeWidth: 1 },
    ])).toMatchObject({ left: -10, top: -10, right: 35, bottom: 15 });
  });
});
