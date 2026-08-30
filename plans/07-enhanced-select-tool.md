# Phase 7: Enhanced Select Tool

## Overview

Upgrade the existing `SelectTool` from basic click-and-drag to a full-featured selection system with: multi-select via rubber-band (lasso), resize handles on selected elements, click-to-deselect, drag-to-move with visual feedback, and keyboard-driven nudging.

---

## 7.1 Current State

The `SelectTool` in `packages/core/src/tools.ts` already supports:
- Click to select an element
- Shift-click to toggle selection (multi-select)
- Drag selected elements to move
- Delete key removes selected elements
- Grid snapping and alignment guides during drag

It lacks:
- Rubber-band (marquee) selection for dragging a region
- Resize handles for scaling shapes
- Keyboard nudging (arrow keys)
- Visual resize cursor feedback

---

## 7.2 Data Types — `packages/core/src/types.ts`

### Selection state (already exists internally)

No new types needed in `types.ts`. The `selectedIds: Set<string>` in `Whiteboard` is sufficient. However, we do need to track whether we're in "select mode" (drawing a marquee) vs "drag mode" (moving elements).

### Resize handles

Each element type has handle positions. Define a helper:

```ts
export interface Handle {
  id: string;        // e.g. 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'
  x: number;         // world x
  y: number;         // world y
  cursor: string;    // CSS cursor name
}
```

---

## 7.3 Select Tool Rewrite — `packages/core/src/tools.ts`

The `SelectTool` class needs significant expansion. Here's the full design:

### State machine

```
IDLE → (click element) → SELECTED
IDLE → (click empty) → IDLE (deselect all)
IDLE → (drag on empty) → MARQUEE (rubber band selection)
SELECTED → (drag element) → MOVING
SELECTED → (drag handle) → RESIZING
SELECTED → (click other element) → SELECTED (change selection)
SELECTED → (click empty) → IDLE (deselect)
SELECTED → (arrow keys) → NUDGE
```

### Class structure

```ts
type SelectState = 'idle' | 'marquee' | 'moving' | 'resizing';

class SelectTool implements Tool {
  private state: SelectState = 'idle';
  private dragStart: Point | null = null;
  private dragOffset: Map<string, Point> = new Map();
  private activeHandle: string | null = null;
  private marqueeStart: Point | null = null;
  private marqueeEnd: Point | null = null;
  private guides: SnapGuides | null = null;

  onPointerDown(e: PointerEvent, ctx: ToolContext) { ... }
  onPointerMove(e: PointerEvent, ctx: ToolContext) { ... }
  onPointerUp(e: PointerEvent, ctx: ToolContext) { ... }
  onKeyDown(e: KeyboardEvent, ctx: ToolContext) { ... }

  // New:
  getMarquee(): { start: Point; end: Point } | null { ... }
}
```

### Rubber-band (marquee) selection

When `onPointerDown` clicks on empty space (no element under cursor), start a marquee:

```ts
onPointerDown(e, ctx) {
  const off = ctx.getOffset(e);
  const world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
  const clicked = [...ctx.elements].reverse().find(el => hitTest(el, world));

  if (clicked) {
    // Existing selection logic (unchanged)
    ...
  } else {
    if (!e.shiftKey) ctx.setSelectedIds(new Set());
    this.state = 'marquee';
    this.marqueeStart = world;
    this.marqueeEnd = world;
  }
}

onPointerMove(e, ctx) {
  if (this.state === 'marquee') {
    const off = ctx.getOffset(e);
    this.marqueeEnd = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    // Select all elements within the marquee rectangle
    const sel = elementsInRect(ctx.elements, this.marqueeStart, this.marqueeEnd);
    if (e.shiftKey) {
      const merged = new Set([...ctx.getSelectedIds(), ...sel.map(el => el.id)]);
      ctx.setSelectedIds(merged);
    } else {
      ctx.setSelectedIds(new Set(sel.map(el => el.id)));
    }
    ctx.scheduleRender();
    return;
  }
  // ... existing moving logic
}

onPointerUp(e, ctx) {
  if (this.state === 'marquee') {
    this.state = 'idle';
    this.marqueeStart = null;
    this.marqueeEnd = null;
    ctx.scheduleRender();
    return;
  }
  // ... existing logic
}
```

### Helper: elements in rect

```ts
function elementsInRect(elements: WBElement[], a: Point, b: Point): WBElement[] {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x, b.x);
  const maxY = Math.max(a.y, b.y);

  return elements.filter(el => {
    const bounds = getElementBounds(el);
    return bounds.left >= minX && bounds.top >= minY &&
           bounds.right <= maxX && bounds.bottom <= maxY;
  });
}
```

### Resize handles

For single-element selection, compute 8 handle positions:

```ts
function getHandles(el: WBElement): Handle[] {
  const bounds = getElementBounds(el);
  const ids = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const positions: Point[] = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.centerX, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.centerY },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.centerX, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
    { x: bounds.left, y: bounds.centerY },
  ];
  const cursors = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize',
                    'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];
  return ids.map((id, i) => ({
    id,
    x: positions[i].x,
    y: positions[i].y,
    cursor: cursors[i],
  }));
}
```

Handle hit testing (8px radius):

```ts
function hitTestHandle(point: Point, handles: Handle[]): Handle | null {
  for (const h of handles) {
    if (Math.abs(point.x - h.x) < 8 && Math.abs(point.y - h.y) < 8) {
      return h;
    }
  }
  return null;
}
```

### Resizing logic

When dragging a handle, compute the new bounds based on which handle is being dragged, then update the element dimensions:

```ts
// In onPointerMove during 'resizing' state:
const bounds = getElementBounds(primaryEl);
let newLeft = bounds.left, newTop = bounds.top, newRight = bounds.right, newBottom = bounds.bottom;

switch (this.activeHandle) {
  case 'nw': newLeft = world.x; newTop = world.y; break;
  case 'n':  newTop = world.y; break;
  case 'ne': newRight = world.x; newTop = world.y; break;
  case 'e':  newRight = world.x; break;
  case 'se': newRight = world.x; newBottom = world.y; break;
  case 's':  newBottom = world.y; break;
  case 'sw': newLeft = world.x; newBottom = world.y; break;
  case 'w':  newLeft = world.x; break;
}

// Enforce minimum size
const minSize = 5;
if (newRight - newLeft < minSize) newRight = newLeft + minSize;
if (newBottom - newTop < minSize) newBottom = newTop + minSize;

// Apply to element
ctx.updateElement(primaryEl.id, el => resizeElement(el, newLeft, newTop, newRight, newBottom));
```

### `resizeElement` helper

```ts
function resizeElement(el: WBElement, left: number, top: number, right: number, bottom: number): WBElement {
  switch (el.type) {
    case 'rectangle':
      return { ...el, x: left, y: top, width: right - left, height: bottom - top };
    case 'ellipse':
      return { ...el, x: (left + right) / 2, y: (top + bottom) / 2, rx: (right - left) / 2, ry: (bottom - top) / 2 };
    case 'text':
    case 'image':
      return { ...el, x: left, y: top, width: right - left, height: bottom - top };
    case 'arrow': {
      // Scale arrow endpoints proportionally
      const bounds = getElementBounds(el);
      const scaleX = (right - left) / bounds.width;
      const scaleY = (bottom - top) / bounds.height;
      return {
        ...el,
        startX: left + (el.startX - bounds.left) * scaleX,
        startY: top + (el.startY - bounds.top) * scaleY,
        endX: left + (el.endX - bounds.left) * scaleX,
        endY: top + (el.endY - bounds.top) * scaleY,
      };
    }
    default:
      return el;
  }
}
```

### Keyboard nudging

```ts
onKeyDown(e: KeyboardEvent, ctx: ToolContext) {
  const step = e.shiftKey ? 10 : 1; // Shift for 10px jumps
  const selectedIds = ctx.getSelectedIds();

  switch (e.key) {
    case 'ArrowUp':   e.preventDefault(); moveSelected(ctx, selectedIds, 0, -step); break;
    case 'ArrowDown': e.preventDefault(); moveSelected(ctx, selectedIds, 0, step); break;
    case 'ArrowLeft': e.preventDefault(); moveSelected(ctx, selectedIds, -step, 0); break;
    case 'ArrowRight': e.preventDefault(); moveSelected(ctx, selectedIds, step, 0); break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      ctx.deleteElements(Array.from(selectedIds));
      ctx.setSelectedIds(new Set());
      break;
  }
}

function moveSelected(ctx: ToolContext, ids: Set<string>, dx: number, dy: number) {
  for (const id of ids) {
    const el = ctx.elements.find(e => e.id === id);
    if (el) {
      const pos = getElementPos(el);
      ctx.updateElement(id, e => moveElement(e, pos.x + dx, pos.y + dy));
    }
  }
  ctx.scheduleRender();
}
```

---

## 7.4 Renderer Updates — `packages/core/src/renderer.ts`

### Draw marquee selection rectangle

```ts
private drawMarquee(start: Point, end: Point, viewport: Viewport) {
  this.ctx.save();
  this.ctx.strokeStyle = '#3b82f6';
  this.ctx.lineWidth = 1 / viewport.zoom;
  this.ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
  this.ctx.fillStyle = 'rgba(59, 130, 246, 0.05)';

  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  this.ctx.fillRect(x, y, w, h);
  this.ctx.strokeRect(x, y, w, h);
  this.ctx.setLineDash([]);
  this.ctx.restore();
}
```

Call this in `render()` when `selectState === 'marquee'` — we'll need the SelectTool to expose its marquee state. This requires passing an additional parameter to the render cycle.

### Draw resize handles

```ts
private drawResizeHandles(el: WBElement, viewport: Viewport) {
  const handles = getHandles(el);
  this.ctx.fillStyle = '#fff';
  this.ctx.strokeStyle = '#3b82f6';
  this.ctx.lineWidth = 1.5 / viewport.zoom;
  const size = 8 / viewport.zoom;

  for (const h of handles) {
    this.ctx.fillRect(h.x - size/2, h.y - size/2, size, size);
    this.ctx.strokeRect(h.x - size/2, h.y - size/2, size, size);
  }
}
```

Call after `drawSelectionHighlight` for each selected element when only one element is selected.

### Architecture: exposing tool state for rendering

The `Whiteboard.scheduleRender()` method already renders on each frame. We need the SelectTool to expose its marquee state. Add a new field to `Whiteboard`:

```ts
marquee: { start: Point; end: Point } | null = null;
```

The `SelectTool` sets `ctx.scheduleRender()` and the `Whiteboard.buildPreview()` method can check for marquee state. Alternatively, add `getMarquee()` method to `DrawTool` pattern:

```ts
// In SelectTool:
getMarquee(): { start: Point; end: Point } | null {
  if (this.state !== 'marquee') return null;
  if (!this.marqueeStart || !this.marqueeEnd) return null;
  return { start: this.marqueeStart, end: this.marqueeEnd };
}
```

Then in `Whiteboard.buildPreview()` or a new method, include the marquee in the render call. Extend `RenderPreview` type to include marquee.

### Extended `RenderPreview` type — `packages/core/src/renderer.ts`

```ts
export type RenderPreview =
  | { /* existing types */ }
  | { type: 'marquee'; start: Point; end: Point };
```

In the renderer, handle `preview.type === 'marquee'` by calling `drawMarquee`.

---

## 7.5 Cursor Changes

When hovering over a resize handle, the cursor should change to indicate the resize direction. This requires checking element handles on `pointermove` even when not in a drag state.

Approach: In `Whiteboard.onPointerMove`, check if the current tool is `select` and if the pointer is over a handle. Change `canvas.style.cursor` accordingly.

```ts
// In SelectTool:
private updateCursor(e: PointerEvent, ctx: ToolContext) {
  if (this.state !== 'idle') return;
  const off = ctx.getOffset(e);
  const world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
  const selected = ctx.getSelectedIds();
  if (selected.size === 1) {
    const el = ctx.elements.find(e => e.id === [...selected][0]);
    if (el) {
      const handles = getHandles(el);
      const handle = hitTestHandle(world, handles);
      if (handle) {
        const canvas = /* get canvas ref */;
        canvas.style.cursor = handle.cursor;
        return;
      }
    }
  }
  // reset cursor
}
```

Since `Tool.onPointerMove` doesn't return values, we'll need to either: (a) add a side channel (setting cursor on the canvas element), or (b) add an optional `getCursor(e, ctx)` method to `Tool`.

Option (b) is cleaner:

```ts
export interface Tool {
  onPointerDown(e: PointerEvent, ctx: ToolContext): void;
  onPointerMove(e: PointerEvent, ctx: ToolContext): void;
  onPointerUp(e: PointerEvent, ctx: ToolContext): void;
  onKeyDown?(e: KeyboardEvent, ctx: ToolContext): void;
  getCursor?(e: PointerEvent, ctx: ToolContext): string | null;
}
```

The `Whiteboard` calls `activeTool.getCursor?.(e, ctx)` on `pointermove` (when idle) and sets `canvas.style.cursor`.

---

## 7.6 File Touch List

| File | Change |
|------|--------|
| `packages/core/src/types.ts` | Add `Handle` interface |
| `packages/core/src/tools.ts` | Rewrite `SelectTool` with marquee, resize, nudge; add `getHandles`, `hitTestHandle`, `resizeElement`, `elementsInRect`, `moveSelected` helpers; add `getCursor` to `Tool` interface and `SelectTool` |
| `packages/core/src/renderer.ts` | Add `drawMarquee`, `drawResizeHandles`; extend `RenderPreview` to include marquee |
| `packages/core/src/whiteboard.ts` | Use `getCursor` in `onPointerMove` to set cursor; pass marquee data through `buildPreview` |
| `packages/core/src/index.ts` | Export new `Handle` type |
| `packages/core/src/index.test.ts` | Add tests for `elementsInRect`, `resizeElement`, `getHandles`, `hitTestHandle`, keyboard nudge |

---

## 7.7 Testing Checklist

- [ ] Click on element selects it
- [ ] Shift-click toggles multi-select
- [ ] Click on empty space deselects all
- [ ] Drag on empty space draws a marquee; all elements within are selected
- [ ] Shift-drag adds elements within marquee to existing selection
- [ ] Resize handles appear on single-selected rectangular/ellipse/text/image elements
- [ ] Dragging a corner handle resizes the element proportionally
- [ ] Dragging a side handle resizes in one axis
- [ ] Minimum size enforced (5px)
- [ ] Arrow keys nudge selected elements by 1px
- [ ] Shift+Arrow keys nudge by 10px
- [ ] Delete/Backspace removes selected elements
- [ ] Resize cursors show on hover over handles
- [ ] Path elements cannot be resized (only moved)
- [ ] Marquee preview renders as dashed blue rectangle