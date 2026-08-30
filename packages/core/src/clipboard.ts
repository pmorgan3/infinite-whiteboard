import type { WBElement } from './types';
import { generateId, moveElement } from './tools';

export const WHITEBOARD_CLIPBOARD_MIME = 'application/x-infinite-whiteboard-elements+json';
export interface ClipboardPayload { kind: 'infinite-whiteboard-elements'; version: 1; elements: WBElement[] }

export function createClipboardPayload(elements: WBElement[], selectedIds: Set<string>): ClipboardPayload {
  const ids = new Set(selectedIds);
  for (const id of selectedIds) {
    const group = elements.find(el => el.id === id && el.type === 'group');
    if (group?.type === 'group') group.memberIds.forEach(member => ids.add(member));
  }
  return { kind: 'infinite-whiteboard-elements', version: 1, elements: structuredClone(elements.filter(el => ids.has(el.id))) };
}

export function parseClipboardPayload(value: string): ClipboardPayload | null {
  try {
    const data = JSON.parse(value) as ClipboardPayload;
    if (data?.kind !== 'infinite-whiteboard-elements' || data.version !== 1 || !Array.isArray(data.elements)) return null;
    if (!data.elements.every(el => el && typeof el.id === 'string' && typeof el.type === 'string')) return null;
    return data;
  } catch { return null; }
}

export function remapClipboardElements(elements: WBElement[], offset = 20): WBElement[] {
  const idMap = new Map(elements.map(el => [el.id, generateId()]));
  return elements.map(el => {
    let copy = structuredClone(el);
    copy.id = idMap.get(el.id)!;
    if (copy.type === 'group') copy.memberIds = copy.memberIds.map(id => idMap.get(id)).filter((id): id is string => !!id);
    if (copy.type === 'arrow') {
      if (copy.startBinding && idMap.has(copy.startBinding.elementId)) copy.startBinding.elementId = idMap.get(copy.startBinding.elementId)!;
      else if (copy.startBinding) copy.startBinding = null;
      if (copy.endBinding && idMap.has(copy.endBinding.elementId)) copy.endBinding.elementId = idMap.get(copy.endBinding.elementId)!;
      else if (copy.endBinding) copy.endBinding = null;
    }
    if (copy.type !== 'group') copy = moveElement(copy, getOffsetX(copy) + offset, getOffsetY(copy) + offset);
    return copy;
  });
}

function getOffsetX(el: WBElement) { return el.type === 'path' ? el.points[0]?.x ?? 0 : el.type === 'ellipse' ? el.x - el.rx : el.type === 'arrow' ? el.startX : el.type === 'group' ? 0 : el.x; }
function getOffsetY(el: WBElement) { return el.type === 'path' ? el.points[0]?.y ?? 0 : el.type === 'ellipse' ? el.y - el.ry : el.type === 'arrow' ? el.startY : el.type === 'group' ? 0 : el.y; }
