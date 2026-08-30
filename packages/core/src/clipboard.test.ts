import { describe, expect, it } from 'vitest';
import { createClipboardPayload, parseClipboardPayload, remapClipboardElements } from './clipboard';
import type { WBElement } from './types';

const elements: WBElement[] = [
  { id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 1 },
  { id: 'b', type: 'arrow', startX: 10, startY: 5, endX: 30, endY: 5, startArrowhead: false, endArrowhead: true, startBinding: { elementId: 'a', position: 'right' }, endBinding: { elementId: 'external', position: 'left' }, color: '#000', strokeWidth: 1 },
  { id: 'g', type: 'group', label: 'G', memberIds: ['a', 'b'], color: '#fff', strokeWidth: 0 },
];
describe('internal clipboard', () => {
  it('includes group members and validates its envelope', () => {
    const payload = createClipboardPayload(elements, new Set(['g']));
    expect(payload.elements).toHaveLength(3);
    expect(parseClipboardPayload(JSON.stringify(payload))?.elements).toHaveLength(3);
    expect(parseClipboardPayload('{}')).toBeNull();
  });
  it('remaps ids, memberships and only internal bindings', () => {
    const copies = remapClipboardElements(elements);
    const group = copies.find(el => el.type === 'group')!;
    const arrow = copies.find(el => el.type === 'arrow')!;
    expect(new Set(copies.map(el => el.id)).size).toBe(3);
    expect(group.type === 'group' && group.memberIds.every(id => copies.some(el => el.id === id))).toBe(true);
    expect(arrow.type === 'arrow' && copies.some(el => el.id === arrow.startBinding?.elementId)).toBe(true);
    expect(arrow.type === 'arrow' && arrow.endBinding).toBeNull();
  });
});
