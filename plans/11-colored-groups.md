# Phase 11: Colored Groups

## Overview

Add the ability to group elements together so they move, resize, and select as a unit. Groups have a colored label/tag (like sticky-note colors in Miro, or group tints in Figma). Groups are shown with a subtle colored border/background around all member elements.

---

## 11.1 Motivation

Current state: `SelectTool` supports multi-select (shift-click), but grouped elements are just a transient selection. There is no persistent grouping mechanism.

What groups add:
- **Persistent grouping** — elements stay grouped across operations.
- **Group color** — a visual tint and label that identifies the group.
- **Group operations** — move all group members together, resize proportionally, delete all.
- **Ungroup** — dissolve a group back to individual elements.

---

## 11.2 Data Model — `packages/core/src/types.ts`

### Group type

```ts
export interface GroupElement extends BaseElement {
  type: 'group';
  label: string;        // Display name, e.g. "Team Alpha"
  color: string;        // Group tint color, e.g. '#fef3c7' (amber-100)
  memberIds: string[];  // IDs of elements in this group
}
```

Add `'group'` to the `WBElement` union:

```ts
export type WBElement = PathElement | RectangleElement | EllipseElement | TextElement | ImageElement | ArrowElement | GroupElement;
```

### Group color palette

```ts
export const GROUP_COLORS = [
  '#fef3c7',  // Amber 100
  '#d1fae5',  // Green 100
  '#dbeafe',  // Blue 100
  '#fce7f3',  // Pink 100
  '#ede9fe',  // Violet 100
  '#fed7aa',  // Orange 100
  '#e0e7ff',  // Indigo 100
  '#f3e8ff',  // Purple 100
];
```

This palette lives in `packages/core/src/types.ts` or as a shared constant.

---

## 11.3 Group Operations — `packages/core/src/group-utils.ts` (new file)

Pure utility functions for group management:

```ts
import type { WBElement, GroupElement, Bounds } from './types';
import { generateId, getElementBounds } from './tools';

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
      return { ...el, memberIds: newMemberIds };
    }
    return el;
  });
}
```

---

## 11.4 Whiteboard Integration — `packages/core/src/whiteboard.ts`

Add group-related methods:

```ts
createGroupFromSelection(label?: string, color?: string): string | null {
  if (this.selectedIds.size < 2) return null;
  const groupColor = color ?? GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
  const groupLabel = label ?? 'Group';
  const group = createGroup([...this.selectedIds], groupLabel, groupColor);
  this.addElement(group);
  this.selectedIds = new Set([group.id]);
  this.scheduleRender();
  this.onChange?.();
  return group.id;
}

ungroupSelection(): void {
  const selected = [...this.selectedIds];
  for (const id of selected) {
    const el = this.elements.find(e => e.id === id);
    if (el && el.type === 'group') {
      const group = el as GroupElement;
      // Remove the group element
      this.history.execute(new DeleteElementsCommand(this.elements, [group.id]));
      // Select the former members
      for (const memberId of group.memberIds) {
        this.selectedIds.add(memberId);
      }
    }
  }
  this.scheduleRender();
  this.onChange?.();
}

addToGroup(groupId: string, elementIds: string[]): void {
  const group = this.elements.find(e => e.id === groupId);
  if (!group || group.type !== 'group') return;
  const g = group as GroupElement;
  const newMembers = [...new Set([...g.memberIds, ...elementIds])];
  this.updateElementWithHistory(groupId, { memberIds: newMembers });
}

removeFromGroup(groupId: string, elementId: string): void {
  const group = this.elements.find(e => e.id === groupId);
  if (!group || group.type !== 'group') return;
  const g = group as GroupElement;
  const newMembers = g.memberIds.filter(id => id !== elementId);
  if (newMembers.length === 0) {
    // Auto-dissolve empty group
    this.history.execute(new DeleteElementsCommand(this.elements, [groupId]));
  } else {
    this.updateElementWithHistory(groupId, { memberIds: newMembers });
  }
}
```

---

## 11.5 Select Tool Group Handling

### Click propagation

When the user clicks on a group member, the entire group should be selected:

```ts
// In SelectTool.onPointerDown:
const clicked = [...ctx.elements].reverse().find(el => hitTest(el, world));

if (clicked) {
  // Check if the clicked element is a group member
  const parentGroup = ctx.elements.find(
    el => el.type === 'group' && (el as GroupElement).memberIds.includes(clicked.id)
  );
  
  if (parentGroup && !e.shiftKey) {
    // Select the entire group instead
    ctx.setSelectedIds(new Set([parentGroup.id]));
  } else {
    // Normal single selection
    ...
  }
} else {
  // Check if clicking on a GroupElement directly
  const groupClicked = [...ctx.elements].reverse().find(
    el => el.type === 'group' && hitTestGroupBounds(el, world)
  );
  if (groupClicked) {
    ctx.setSelectedIds(new Set([groupClicked.id]));
  }
}
```

### Group bounding box hit testing

```ts
function hitTestGroupBounds(group: WBElement, point: Point): boolean {
  if (group.type !== 'group') return false;
  const g = group as GroupElement;
  // Group hit testing is based on its bounding box
  // (Computed from member elements at render time)
  // For now, store cached bounds on the group element
  return false; // Handled differently
}
```

Since `GroupElement` doesn't have position coordinates (members define the bounds), group hit testing requires computing bounds from members. This is expensive per-frame, so we cache it.

### Cached group bounds

Add an optional `bounds` field to `GroupElement` that is recomputed when members change:

```ts
export interface GroupElement extends BaseElement {
  type: 'group';
  label: string;
  color: string;
  memberIds: string[];
  bounds?: Bounds;  // Cached, recomputed on render
}
```

On each `scheduleRender`, recompute group bounds:

```ts
// In resolveBindings or a new method:
private resolveGroupBounds() {
  for (const el of this.elements) {
    if (el.type === 'group') {
      const g = el as GroupElement;
      const members = g.memberIds
        .map(id => this.elements.find(e => e.id === id))
        .filter(Boolean) as WBElement[];
      (el as GroupElement).bounds = getGroupBounds(members);
    }
  }
}
```

### Moving a group moves all members

In `SelectTool`, when a group element is being dragged:

```ts
// In onPointerMove:
if (isDragging && dragStart) {
  const selected = ctx.getSelectedIds();
  // Collect all member elements of selected groups
  const allIds = new Set<string>();
  for (const id of selected) {
    const el = ctx.elements.find(e => e.id === id);
    if (el?.type === 'group') {
      for (const mid of (el as GroupElement).memberIds) {
        allIds.add(mid);
      }
    } else {
      allIds.add(id);
    }
  }
  // Move all collected elements
  for (const id of allIds) {
    // ... move logic
  }
  // Also move the group element itself (so bounds can be recomputed)
}
```

---

## 11.6 Renderer — Group Visualization

### `packages/core/src/renderer.ts`

```ts
private drawGroup(group: GroupElement, elements: WBElement[]) {
  const members = group.memberIds
    .map(id => elements.find(e => e.id === id))
    .filter(Boolean) as WBElement[];
  if (members.length === 0) return;

  const bounds = getGroupBounds(members);
  const pad = 8;

  // Background tint
  this.ctx.fillStyle = group.color + '40';  // 25% opacity
  this.ctx.fillRect(
    bounds.left - pad,
    bounds.top - pad,
    bounds.width + pad * 2,
    bounds.height + pad * 2,
  );

  // Border
  this.ctx.strokeStyle = group.color;
  this.ctx.lineWidth = 2;
  this.ctx.setLineDash([8, 4]);
  this.ctx.strokeRect(
    bounds.left - pad,
    bounds.top - pad,
    bounds.width + pad * 2,
    bounds.height + pad * 2,
  );
  this.ctx.setLineDash([]);

  // Label
  if (group.label) {
    this.ctx.fillStyle = group.color;
    this.ctx.font = '12px sans-serif';
    this.ctx.fillText(group.label, bounds.left - pad, bounds.top - pad - 4);
  }
}

private drawGroupSelection(group: GroupElement, elements: WBElement[]) {
  const members = group.memberIds
    .map(id => elements.find(e => e.id === id))
    .filter(Boolean) as WBElement[];
  if (members.length === 0) return;

  const bounds = getGroupBounds(members);
  const pad = 8;
  this.ctx.strokeStyle = '#3b82f6';
  this.ctx.lineWidth = 2;
  this.ctx.setLineDash([]);
  this.ctx.strokeRect(
    bounds.left - pad,
    bounds.top - pad,
    bounds.width + pad * 2,
    bounds.height + pad * 2,
  );
}
```

Update `drawElements` to skip group members when drawing their group's background:

```ts
private drawElements(elements: WBElement[], selectedIds: Set<string>) {
  // First pass: draw group backgrounds
  const drawnInGroup = new Set<string>();
  for (const el of elements) {
    if (el.type === 'group') {
      this.drawGroup(el as GroupElement, elements);
      for (const mid of (el as GroupElement).memberIds) {
        drawnInGroup.add(mid);
      }
    }
  }

  // Second pass: draw all non-group elements
  for (const el of elements) {
    if (el.type === 'group') continue;  // Groups are drawn above
    this.drawElement(el);
    if (selectedIds.has(el.id)) {
      this.drawSelectionHighlight(el);
    }
  }

  // Third pass: draw group labels and selection highlights
  for (const el of elements) {
    if (el.type === 'group' && selectedIds.has(el.id)) {
      this.drawGroupSelection(el as GroupElement, elements);
    }
  }
}
```

---

## 11.7 UI — Group Controls

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+G` / `Cmd+G` | Group selected elements |
| `Ctrl+Shift+G` / `Cmd+Shift+G` | Ungroup selected group |
| Double-click on group | Enter group (select individual members) |

### Toolbar group button

Add a group/ungroup button to the toolbar that appears when elements are selected (similar to how arrow toggles appear conditionally):

```tsx
// In Toolbar.tsx, conditionally show group button when select tool is active:
{tool === 'select' && selectedCount >= 2 && (
  <button onClick={onGroup} title="Group (Ctrl+G)">⬚ Group</button>
)}
{tool === 'select' && selectedGroupCount > 0 && (
  <button onClick={onUngroup} title="Ungroup (Ctrl+Shift+G)">⬛ Ungroup</button>
)}
```

### Group color picker

When a group is selected, show a color picker in the options panel that lets the user change the group tint color. Uses the `GROUP_COLORS` palette.

### `apps/web/src/Toolbar.tsx`

Add new props:

```tsx
interface ToolbarProps {
  // ... existing props ...
  selectedCount: number;
  selectedGroupCount: number;
  onGroup: () => void;
  onUngroup: () => void;
}
```

---

## 11.8 Group Creation Flow

1. User selects multiple elements (shift-click or rubber-band).
2. User presses `Ctrl+G` or clicks the "Group" button.
3. A `GroupElement` is created with the selected IDs as members.
4. The group color is automatically assigned (cycling through `GROUP_COLORS`).
5. The group label defaults to "Group N" (incrementing number).
6. The selection switches to the group element.

### Group naming counter

```ts
// In App.tsx:
const groupCounter = useRef(1);
const handleGroup = () => {
  const wb = wbRef.current;
  if (!wb) return;
  const label = `Group ${groupCounter.current++}`;
  wb.createGroupFromSelection(label);
};
```

---

## 11.9 Export: Groups

### JSON

Groups are just another `WBElement` type, so they serialize naturally. Export and import handle groups without changes.

### SVG

In `@whiteboard/export/src/svg.ts`, add group rendering:

```ts
function groupToSvg(group: GroupElement, elements: WBElement[]): string {
  const members = group.memberIds
    .map(id => elements.find(e => e.id === id))
    .filter(Boolean) as WBElement[];
  const bounds = getGroupBounds(members);
  const pad = 8;

  let svg = `<g>`;
  // Background rect
  svg += `<rect x="${bounds.left - pad}" y="${bounds.top - pad}" ` +
    `width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" ` +
    `fill="${group.color}" fill-opacity="0.25" ` +
    `stroke="${group.color}" stroke-width="2" stroke-dasharray="8,4" />`;
  // Label
  if (group.label) {
    svg += `<text x="${bounds.left - pad}" y="${bounds.top - pad - 4}" ` +
      `fill="${group.color}" font-size="12">${escapeXml(group.label)}</text>`;
  }
  svg += `</g>`;
  return svg;
}
```

### PNG

The existing `renderForExport` in the renderer will draw groups naturally since `drawElements` handles them. No changes needed for PNG export.

---

## 11.10 Edge Cases

### Nested groups

Groups cannot contain other groups for MVP. If a user tries to group elements that include a group, flatten the structure:

```ts
// In createGroupFromSelection:
const allMemberIds = [...this.selectedIds].flatMap(id => {
  const el = this.elements.find(e => e.id === id);
  if (el?.type === 'group') {
    return (el as GroupElement).memberIds;  // Flatten
  }
  return [id];
});
```

### Orphaned members

If a member element is deleted, remove it from any group's `memberIds`. If a group has only one or zero members, auto-dissolve it.

```ts
// In Whiteboard, after deleting elements:
private cleanupOrphanedMembers() {
  const deletedIds = new Set(/* recently deleted IDs */);
  for (const el of this.elements) {
    if (el.type === 'group') {
      const g = el as GroupElement;
      const remaining = g.memberIds.filter(id => !deletedIds.has(id) && this.elements.some(e => e.id === id));
      if (remaining.length <= 1) {
        // Auto-dissolve: remove the group element
        this.elements = this.elements.filter(e => e.id !== g.id);
      } else if (remaining.length !== g.memberIds.length) {
        g.memberIds = remaining;
      }
    }
  }
}
```

### Undo/redo with groups

`AddElementCommand` already handles adding group elements. `DeleteElementsCommand` handles removing them. Group member cleanup happens in a post-undo hook.

---

## 11.11 File Touch List

| File | Change |
|------|--------|
| `packages/core/src/types.ts` | Add `GroupElement`, `GROUP_COLORS`, add to `WBElement` union |
| `packages/core/src/group-utils.ts` | **New** — `createGroup`, `getGroupBounds`, `dissolveGroup`, `moveToGroup` |
| `packages/core/src/tools.ts` | Update `SelectTool` to handle group selection; `hitTest` for groups; group-aware drag |
| `packages/core/src/whiteboard.ts` | Add `createGroupFromSelection`, `ungroupSelection`, `addToGroup`, `removeFromGroup`; add `resolveGroupBounds`; add keyboard shortcuts Ctrl+G/Ctrl+Shift+G |
| `packages/core/src/renderer.ts` | Add `drawGroup`, `drawGroupSelection`; update `drawElements` for group pass |
| `packages/core/src/history.ts` | Ensure group cleanup after undo |
| `packages/core/src/index.ts` | Export `GroupElement`, `GROUP_COLORS`, `createGroup`, `getGroupBounds` |
| `packages/export/src/svg.ts` | Add `groupToSvg` conversion |
| `packages/export/src/bounds.ts` | Handle `GroupElement` in `computeBounds` (iterate member IDs) |
| `apps/web/src/Toolbar.tsx` | Add Group/Ungroup buttons; `selectedCount` / `selectedGroupCount` props |
| `apps/web/src/App.tsx` | Add `handleGroup`, `handleUngroup`, keyboard shortcut for Ctrl+G |
| `apps/web/src/App.scss` | Group button styles |

---

## 11.12 Testing Checklist

- [ ] Selecting 2+ elements and pressing Ctrl+G creates a group with a colored tint
- [ ] Group has an auto-generated label ("Group 1", "Group 2", etc.)
- [ ] Group background is rendered with 25% opacity tint
- [ ] Group border is dashed with the group color
- [ ] Group label appears above the group bounds
- [ ] Clicking a group member selects the entire group
- [ ] Moving a group moves all member elements
- [ ] Deleting a group (Delete key) deletes all members
- [ ] Ctrl+Shift+G dissolves a group, keeping individual elements
- [ ] Removing a member from a group shrinks the group
- [ ] If a group has ≤1 member, it auto-dissolves
- [ ] Deleting a member element removes it from the group
- [ ] Undo restores a dissolved group
- [ ] Redo re-dissolves a group
- [ ] Groups render correctly in SVG export
- [ ] Groups render correctly in PNG export
- [ ] Groups round-trip through JSON export/import
- [ ] Group color can be changed from the options panel
- [ ] Nested groups are flattened (not allowed in MVP)
- [ ] Group bounds update when member elements are moved