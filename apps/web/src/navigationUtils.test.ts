import { describe, expect, it } from 'vitest';
import { createMinimapTransform, minimapToWorld, searchElements, worldToMinimap } from './navigationUtils';

describe('searchElements', () => {
  const elements: any[] = [
    { id: 'a', type: 'text', text: 'Alpha Board' },
    { id: 'b', type: 'rectangle' },
    { id: 'c', type: 'group', label: 'alpha team' },
  ];
  it('matches supported fields case-insensitively in document order', () => {
    expect(searchElements(elements, 'ALPHA').map((e) => e.id)).toEqual(['a', 'c']);
  });
  it('uses literal substrings', () => expect(searchElements(elements, 'a.*').length).toBe(0));
});

describe('minimap coordinates', () => {
  it('round trips negative world coordinates', () => {
    const t = createMinimapTransform({ left: -100, top: -50, right: 300, bottom: 150, width: 400, height: 200, centerX: 100, centerY: 50 }, 200, 120);
    const mini = worldToMinimap(-25, 75, t);
    expect(minimapToWorld(mini.x, mini.y, t)).toEqual({ x: -25, y: 75 });
  });
});
