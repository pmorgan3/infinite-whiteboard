import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { WBElement } from '@whiteboard/core';
import { LOCAL_ORIGIN, readElements, reconcileElements } from './provider';

const rectangle = (id: string, x = 0): WBElement => ({ id, type: 'rectangle', x, y: 0, width: 10, height: 10, color: '#000', strokeWidth: 1 });

describe('incremental reconciliation', () => {
  it('updates maps by id and tags local transactions', () => {
    const doc = new Y.Doc(); const array = doc.getArray<Y.Map<unknown>>('elements');
    reconcileElements(doc, array, [rectangle('a')]); const original = array.get(0);
    const origins: unknown[] = []; array.observeDeep((_events, tx) => origins.push(tx.origin));
    reconcileElements(doc, array, [rectangle('a', 5), rectangle('b')]);
    expect(array.get(0)).toBe(original); expect(readElements(array)).toEqual([rectangle('a', 5), rectangle('b')]); expect(origins).toEqual([LOCAL_ORIGIN]);
  });
  it('does not leak nested mutable references', () => {
    const doc = new Y.Doc(); const array = doc.getArray<Y.Map<unknown>>('elements');
    const element = { ...rectangle('a'), points: [{ x: 1, y: 2 }] } as unknown as WBElement;
    reconcileElements(doc, array, [element]); (element as any).points[0].x = 99;
    expect((readElements(array)[0] as any).points[0].x).toBe(1);
  });
  it('merges deterministic document updates without duplicate ids', () => {
    const left = new Y.Doc(); const right = new Y.Doc();
    const la = left.getArray<Y.Map<unknown>>('elements'); const ra = right.getArray<Y.Map<unknown>>('elements');
    reconcileElements(left, la, [rectangle('a')]); Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
    reconcileElements(right, ra, [rectangle('a', 7), rectangle('b')]); Y.applyUpdate(left, Y.encodeStateAsUpdate(right));
    expect(readElements(left.getArray('elements')).map((e) => e.id)).toEqual(['a', 'b']);
    expect((readElements(ra).find((e) => e.id === 'a') as ReturnType<typeof rectangle> & { x: number }).x).toBe(7);
  });
  it('does not delete a concurrently discovered element outside the local baseline', () => {
    const doc = new Y.Doc();
    const array = doc.getArray<Y.Map<unknown>>('elements');
    reconcileElements(doc, array, [rectangle('known'), rectangle('remote')]);
    reconcileElements(doc, array, [rectangle('known', 4), rectangle('local')], LOCAL_ORIGIN, new Set(['known']));
    expect(new Set(readElements(array).map((element) => element.id))).toEqual(new Set(['known', 'local', 'remote']));
  });
  it('keeps established room content available for initial sync', () => {
    const doc = new Y.Doc(); const array = doc.getArray<Y.Map<unknown>>('elements');
    reconcileElements(doc, array, [rectangle('room')]);
    expect(readElements(array)).toEqual([rectangle('room')]);
  });
});
