import { describe, expect, it } from 'vitest';
import type { StickyNoteElement, WBElement } from './types';
import { getElementBounds } from './snap';
import { createGroup, getGroupBounds } from './group-utils';
import { hitTest, moveElement } from './tools';
import { createTool } from './tools';
import type { ToolContext } from './tools';
import { Viewport } from './viewport';
import { layoutText, requiredTextHeight } from './text-layout';
import { HistoryStack, UpdateElementCommand } from './history';

const note = (overrides: Partial<StickyNoteElement> = {}): StickyNoteElement => ({
  id: 'note', type: 'sticky', x: 10, y: 20, width: 220, height: 160,
  text: 'hello', fill: '#fef08a', fontSize: 16, fontFamily: 'sans-serif',
  textAlign: 'left', fontWeight: 'normal', fontStyle: 'normal',
  color: '#1f2937', strokeWidth: 0, ...overrides,
});

describe('sticky notes', () => {
  it('creates a centered 220 by 160 note and starts editing on click', () => {
    const added: WBElement[] = [];
    let editing = '';
    const ctx = {
      viewport: new Viewport(), elements: [], addElement: (el: WBElement) => added.push(el),
      updateElement: () => {}, deleteElements: () => {}, getSelectedIds: () => new Set<string>(),
      setSelectedIds: () => {}, canvasWidth: 800, canvasHeight: 600, scheduleRender: () => {},
      getOffset: () => ({ x: 400, y: 300 }), activeColor: '#000', startEditing: (id: string) => { editing = id; },
      requestImageUpload: () => {}, snapConfig: { enabled: false, gridSize: 20, threshold: 8 },
      snapToGrid: (point: { x: number; y: number }) => point, setGuides: () => {}, resolveBindings: () => {}, setArrowSnapTarget: () => {},
    } as ToolContext;
    const tool = createTool('sticky', { color: '#000', strokeWidth: 0 });
    tool.onPointerDown(new PointerEvent('pointerdown', { button: 0 }), ctx);
    tool.onPointerUp(new PointerEvent('pointerup', { button: 0 }), ctx);
    expect(added[0]).toMatchObject({ type: 'sticky', x: -110, y: -80, width: 220, height: 160 });
    expect(editing).toBe(added[0].id);
  });

  it('satisfies the element union with readable defaults', () => {
    const el: WBElement = note();
    expect(el.type).toBe('sticky');
    expect(el.fill).toBe('#fef08a');
  });

  it('supports hit testing, bounds, and movement', () => {
    const el = note();
    expect(hitTest(el, { x: 100, y: 100 })).toBe(true);
    expect(getElementBounds(el).width).toBe(220);
    expect(moveElement(el, 50, 60)).toMatchObject({ x: 50, y: 60 });
  });

  it('participates in group bounds and membership', () => {
    const el = note();
    expect(getGroupBounds([el])).toMatchObject({ left: 10, top: 20, width: 220, height: 160 });
    expect(createGroup([el.id], 'Notes', '#fef08a').memberIds).toEqual(['note']);
  });

  it('preserves blank lines and wraps with alignment', () => {
    const lines = layoutText({ text: 'one two\n\nthree', width: 70, fontSize: 10, textAlign: 'right', measureText: text => text.length * 10 });
    expect(lines.map(line => line.text)).toEqual(['one', 'two', '', 'three']);
    expect(lines[0].x).toBeGreaterThan(8);
    expect(requiredTextHeight(lines.length, 10)).toBeGreaterThan(50);
  });

  it('makes text and height edits undoable', () => {
    const elements: WBElement[] = [note()];
    const history = new HistoryStack();
    history.execute(new UpdateElementCommand(elements, 'note', { text: 'changed', height: 200 }));
    expect(elements[0]).toMatchObject({ text: 'changed', height: 200 });
    history.undo();
    expect(elements[0]).toMatchObject({ text: 'hello', height: 160 });
  });
});
