import type { WBElement, GroupElement, Bounds } from './types';
import { generateId } from './tools';
import { getElementBounds } from './snap';

export function createGroup(memberIds: string[], label: string, color: string): GroupElement {
  return {
    id: generateId(),
    type: 'group',
    label,
    color,
    memberIds,
    strokeWidth: 0,
  };
}

export function getGroupBounds(members: WBElement[]): Bounds {
  if (members.length === 0) {
    return { left: 0, top: 0, right: 0, bottom: 0, centerX: 0, centerY: 0, width: 0, height: 0 };
  }
  const allBounds = members.map(getElementBounds);
  const left = Math.min(...allBounds.map(b => b.left));
  const top = Math.min(...allBounds.map(b => b.top));
  const right = Math.max(...allBounds.map(b => b.right));
  const bottom = Math.max(...allBounds.map(b => b.bottom));
  return {
    left, top, right, bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}

export function dissolveGroup(group: GroupElement): string[] {
  return group.memberIds;
}

export function moveToGroup(
  elements: WBElement[],
  groupId: string,
  newMemberIds: string[],
): WBElement[] {
  return elements.map(el => {
    if (el.id === groupId && el.type === 'group') {
      return { ...el, memberIds: newMemberIds } as GroupElement;
    }
    return el;
  });
}
