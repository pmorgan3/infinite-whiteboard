import { describe, expect, it } from 'vitest';
import { HistoryStack, SnapshotCommand } from './history';
import type { WBElement } from './types';

describe('snapshot history', () => {
  it('coalesces a gesture and restores exact state and selection', () => {
    const before: WBElement[] = [{ id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 1 }];
    const after: WBElement[] = [{ ...before[0], x: 42, rotation: 1 } as WBElement];
    const live = structuredClone(before); let selection = new Set<string>();
    const history = new HistoryStack();
    history.execute(new SnapshotCommand(live, before, after, ids => { selection = ids; }, new Set(['a']), new Set(['a'])));
    expect(live[0]).toMatchObject({ x: 42, rotation: 1 });
    history.undo(); expect(live[0]).toMatchObject({ x: 0 }); expect(selection.has('a')).toBe(true);
    history.redo(); expect(live[0]).toMatchObject({ x: 42 });
  });
});
