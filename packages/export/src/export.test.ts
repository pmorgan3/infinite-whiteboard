import { describe, it, expect } from 'vitest';
import type { WBElement } from '@whiteboard/core';
import { computeBounds } from './bounds';
import { exportToSvg } from './svg';
import { exportToJson, importFromJson } from './json';

describe('computeBounds', () => {
  it('returns null for empty elements', () => {
    expect(computeBounds([])).toBeNull();
  });

  it('computes bounds for a single rectangle', () => {
    const elements: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 1 },
    ];
    const bounds = computeBounds(elements);
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBe(9);
    expect(bounds!.minY).toBe(19);
    expect(bounds!.maxX).toBe(111);
    expect(bounds!.maxY).toBe(71);
  });

  it('computes bounds for multiple elements', () => {
    const elements: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: '#000', strokeWidth: 1 },
      { id: 'r2', type: 'rectangle', x: 200, y: 200, width: 50, height: 50, color: '#000', strokeWidth: 2 },
    ];
    const bounds = computeBounds(elements);
    expect(bounds!.minX).toBe(-1);
    expect(bounds!.maxX).toBe(252);
  });

  it('computes bounds for an ellipse', () => {
    const elements: WBElement[] = [
      { id: 'e1', type: 'ellipse', x: 100, y: 100, rx: 50, ry: 30, color: '#000', strokeWidth: 2 },
    ];
    const bounds = computeBounds(elements);
    expect(bounds!.minX).toBe(48);
    expect(bounds!.maxX).toBe(152);
  });

  it('computes bounds for an arrow', () => {
    const elements: WBElement[] = [
      { id: 'a1', type: 'arrow', startX: 0, startY: 0, endX: 100, endY: 200, startArrowhead: false, endArrowhead: true, color: '#000', strokeWidth: 2, startBinding: null, endBinding: null },
    ];
    const bounds = computeBounds(elements);
    expect(bounds!.minX).toBe(-2);
    expect(bounds!.maxY).toBe(202);
  });

  it('computes bounds for a path', () => {
    const elements: WBElement[] = [
      { id: 'p1', type: 'path', points: [{ x: 10, y: 20 }, { x: 50, y: 80 }], color: '#000', strokeWidth: 3 },
    ];
    const bounds = computeBounds(elements);
    expect(bounds!.minX).toBe(7);
    expect(bounds!.maxY).toBe(83);
  });

  it('computes bounds for text element', () => {
    const elements: WBElement[] = [
      { id: 't1', type: 'text', x: 50, y: 50, width: 200, height: 30, text: 'hello', fontSize: 16, fontFamily: 'sans-serif', fill: 'transparent', color: '#000', strokeWidth: 1 },
    ];
    const bounds = computeBounds(elements);
    expect(bounds!.minX).toBe(49);
    expect(bounds!.maxX).toBe(251);
  });
});

describe('exportToSvg', () => {
  it('exports rotation around the element center', () => {
    const svg = exportToSvg([{ id: 'rotated', type: 'rectangle', x: 10, y: 20, width: 40, height: 20, rotation: Math.PI / 2, color: '#000', strokeWidth: 2 }]);
    expect(svg).toContain('rotate(90 30 30)');
  });
  it('produces valid SVG for empty elements', () => {
    const svg = exportToSvg([]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('fill="#ffffff"');
  });

  it('produces SVG with rectangle element', () => {
    const elements: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#ff0000', strokeWidth: 2 },
    ];
    const svg = exportToSvg(elements);
    expect(svg).toContain('<rect');
    expect(svg).toContain('stroke="#ff0000"');
  });

  it('produces SVG with ellipse element', () => {
    const elements: WBElement[] = [
      { id: 'e1', type: 'ellipse', x: 50, y: 50, rx: 30, ry: 20, color: '#00ff00', strokeWidth: 1 },
    ];
    const svg = exportToSvg(elements);
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('stroke="#00ff00"');
  });

  it('produces SVG with path element', () => {
    const elements: WBElement[] = [
      { id: 'p1', type: 'path', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], color: '#0000ff', strokeWidth: 3 },
    ];
    const svg = exportToSvg(elements);
    expect(svg).toContain('<path');
    expect(svg).toContain('stroke="#0000ff"');
  });

  it('produces SVG with arrow element with arrowheads', () => {
    const elements: WBElement[] = [
      { id: 'a1', type: 'arrow', startX: 0, startY: 0, endX: 100, endY: 100, startArrowhead: true, endArrowhead: true, color: '#000', strokeWidth: 2, startBinding: null, endBinding: null },
    ];
    const svg = exportToSvg(elements);
    expect(svg).toContain('<line');
    expect(svg).toContain('<polygon');
  });

  it('produces SVG with text element', () => {
    const elements: WBElement[] = [
      { id: 't1', type: 'text', x: 10, y: 20, width: 100, height: 30, text: 'hello world', fontSize: 16, fontFamily: 'sans-serif', fill: 'transparent', color: '#333', strokeWidth: 1 },
    ];
    const svg = exportToSvg(elements);
    expect(svg).toContain('<text');
    expect(svg).toContain('hello world');
  });

  it('produces SVG with custom background', () => {
    const svg = exportToSvg([], { background: '#f0f0f0' });
    expect(svg).toContain('fill="#f0f0f0"');
  });

  it('produces SVG with custom padding', () => {
    const elements: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: '#000', strokeWidth: 1 },
    ];
    const svgSmall = exportToSvg(elements, { padding: 10 });
    const svgLarge = exportToSvg(elements, { padding: 50 });
    expect(svgLarge).toContain('width="202"');
    expect(svgSmall).toContain('width="122"');
  });

  it('escapes XML special characters in text', () => {
    const elements: WBElement[] = [
      { id: 't1', type: 'text', x: 0, y: 0, width: 200, height: 30, text: '<script>alert("xss")</script>', fontSize: 16, fontFamily: 'sans-serif', fill: 'transparent', color: '#000', strokeWidth: 1 },
    ];
    const svg = exportToSvg(elements);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('exportToJson / importFromJson', () => {
  it('exports elements with version and timestamp', () => {
    const elements: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 1 },
    ];
    const viewport = { x: 0, y: 0, zoom: 1 };
    const json = exportToJson(elements, viewport);
    expect(json.version).toBe('0.0.1');
    expect(json.elements).toHaveLength(1);
    expect(json.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(json.exportedAt).toBeTruthy();
  });

  it('deep clones elements on export', () => {
    const elements: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 1 },
    ];
    const viewport = { x: 0, y: 0, zoom: 1 };
    const json = exportToJson(elements, viewport);
    (json.elements[0] as any).x = 999;
    expect((elements[0] as any).x).toBe(10);
  });

  it('imports valid JSON', () => {
    const json = JSON.stringify({
      version: '0.0.1',
      elements: [
        { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#000', strokeWidth: 1 },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      exportedAt: '2024-01-01T00:00:00.000Z',
    });
    const result = importFromJson(json);
    expect(result.elements).toHaveLength(1);
    expect(result.version).toBe('0.0.1');
  });

  it('throws on invalid JSON missing version', () => {
    const json = JSON.stringify({
      elements: [],
    });
    expect(() => importFromJson(json)).toThrow('Invalid whiteboard JSON');
  });

  it('throws on invalid JSON missing elements', () => {
    const json = JSON.stringify({
      version: '0.0.1',
    });
    expect(() => importFromJson(json)).toThrow('Invalid whiteboard JSON');
  });

  it('round-trips elements through export and import', () => {
    const elements: WBElement[] = [
      { id: 'r1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#ff0000', strokeWidth: 2 },
    ];
    const viewport = { x: 5, y: 10, zoom: 1.5 };
    const json = exportToJson(elements, viewport);
    const str = JSON.stringify(json);
    const imported = importFromJson(str);
    expect(imported.elements).toHaveLength(1);
    expect((imported.elements[0] as any).x).toBe(10);
    expect(imported.viewport.zoom).toBe(1.5);
  });
});
