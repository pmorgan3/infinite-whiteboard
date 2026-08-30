# Phase 10: Arrows That Snap to Objects

## Overview

Add "connector arrows" that attach their start and/or end points to specific elements. When the connected element is moved, the arrow follows. This creates a diagramming experience similar to Figma, Miro, and Excalidraw where arrows act as relationships between shapes.

---

## 10.1 Current State

- `ArrowElement` has `startX`, `startY`, `endX`, `endY` — absolute world coordinates.
- Moving an arrow moves it freely; moving a rectangle does not affect connected arrows.
- There is no concept of attachment points or "binding" to elements.

---

## 10.2 Design Decisions

### Binding vs. absolute coordinates

**Decision: Use binding keys (element IDs + position hints) alongside absolute coordinates.**

Rationale:
- Bindings are stored as `startBinding` / `endBinding` fields on `ArrowElement`.
- A binding is `{ elementId: string; position: 'top' | 'right' | 'bottom' | 'left' | 'center' }`.
- When an element moves or resizes, we recalculate the arrow endpoints from the binding.
- Arrow endpoints always store the **absolute** world coordinates as well, so the arrow renders correctly even before recalculation.
- If the bound element is deleted, the binding becomes `null` and the arrow endpoint stays where it was.

### Snap threshold

When the user drags an arrow endpoint near an element (within 12px at current zoom), show a snap preview (highlight the element in blue) and auto-attach.

---

## 10.3 Data Model — `packages/core/src/types.ts`

### Binding type

```ts
export type AnchorPosition = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface ArrowBinding {
  elementId: string;
  position: AnchorPosition;
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startArrowhead: boolean;
  endArrowhead: boolean;
  startBinding: ArrowBinding | null;  // NEW
  endBinding: ArrowBinding | null;     // NEW
}
```

Default values for backward compatibility: `startBinding: null`, `endBinding: null`.

### Element bounds helper enhancement

`getElementBounds` already exists. Add a helper to compute the anchor point for a given position on a bound element:

```ts
export function getAnchorPoint(el: WBElement, position: AnchorPosition, additionalOffset?: number): Point {
  const bounds = getElementBounds(el);
  const offset = additionalOffset ?? 0;
  switch (position) {
    case 'top':    return { x: bounds.centerX, y: bounds.top - offset };
    case 'right':  return { x: bounds.right + offset, y: bounds.centerY };
    case 'bottom': return { x: bounds.centerX, y: bounds.bottom + offset };
    case 'left':   return { x: bounds.left - offset, y: bounds.centerY };
    case 'center': return { x: bounds.centerX, y: bounds.centerY };
  }
}
```

The `additionalOffset` parameter allows the arrow to stop slightly outside the element's bounding box (default 0, but could be 4–8px for visual clarity).

---

## 10.4 Binding Resolution

When an arrow has bindings, its endpoints must be recalculated whenever elements change. This happens in two places:

### 1. After element move/resize — `packages/core/src/tools.ts`

When `SelectTool` finishes dragging or resizing, call `resolveBindings`:

```ts
function resolveBindings(elements: WBElement[]): Map<string, { startX?: number; startY?: number; endX?: number; endY?: number }> {
  const updates = new Map<string, any>();
  for (const el of elements) {
    if (el.type !== 'arrow') continue;
    const arrow = el as ArrowElement;
    if (arrow.startBinding) {
      const bound = elements.find(e => e.id === arrow.startBinding!.elementId);
      if (bound) {
        const point = getAnchorPoint(bound, arrow.startBinding.position);
        updates.set(arrow.id, { ...updates.get(arrow.id), startX: point.x, startY: point.y });
      }
    }
    if (arrow.endBinding) {
      const bound = elements.find(e => e.id === arrow.endBinding!.elementId);
      if (bound) {
        const point = getAnchorPoint(bound, arrow.endBinding.position);
        updates.set(arrow.id, { ...updates.get(arrow.id), endX: point.x, endY: point.y });
      }
    }
  }
  return updates;
}
```

### 2. In `Whiteboard.scheduleRender`

Before rendering, resolve all arrow bindings. This ensures arrows always follow their bound elements:

```ts
scheduleRender() {
  if (this.needsRender) return;
  this.needsRender = true;
  this.rafId = requestAnimationFrame(() => {
    this.needsRender = false;
    this.resolveBindings();
    const preview = this.buildPreview();
    this.renderer.render(this.viewport, this.elements, this.selectedIds, preview, this.activeGuides, this.snapConfig);
  });
}

private resolveBindings() {
  for (const el of this.elements) {
    if (el.type !== 'arrow') continue;
    const arrow = el as ArrowElement;
    if (arrow.startBinding) {
      const bound = this.elements.find(e => e.id === arrow.startBinding!.elementId);
      if (bound) {
        const point = getAnchorPoint(bound, arrow.startBinding.position);
        arrow.startX = point.x;
        arrow.startY = point.y;
      }
    }
    if (arrow.endBinding) {
      const bound = this.elements.find(e => e.id === arrow.endBinding!.elementId);
      if (bound) {
        const point = getAnchorPoint(bound, arrow.endBinding.position);
        arrow.endX = point.x;
        arrow.endY = point.y;
      }
    }
  }
}
```

---

## 10.5 Arrow Tool with Snap-to-Element

### Enhanced `ArrowTool` — `packages/core/src/tools.ts`

When dragging the start or end point, detect proximity to other elements and snap:

```ts
class ArrowTool implements Tool {
  private start: Point | null = null;
  private end: Point | null = null;
  private isDrawing = false;
  private startBinding: ArrowBinding | null = null;
  private endBinding: ArrowBinding | null = null;
  private snapThreshold = 12;  // world units
  private hoveredElementId: string | null = null;

  onPointerDown(e: PointerEvent, ctx: ToolContext) {
    if (e.button !== 0) return;
    this.isDrawing = true;
    const off = ctx.getOffset(e);
    let world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    
    // Try to snap start point to an element
    const snapResult = this.snapToPoint(world, ctx.elements, ctx);
    world = snapResult.point;
    this.startBinding = snapResult.binding;
    
    this.start = world;
    this.end = world;
  }

  onPointerMove(e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || !this.start) return;
    const off = ctx.getOffset(e);
    let world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    
    // Try to snap end point to an element
    // Don't snap to the same element as startBinding
    const snapResult = this.snapToPoint(world, ctx.elements, ctx);
    if (!snapResult.binding || snapResult.binding.elementId !== this.startBinding?.elementId) {
      world = snapResult.point;
      this.endBinding = snapResult.binding;
      this.hoveredElementId = snapResult.binding?.elementId ?? null;
    }
    
    this.end = world;
    ctx.scheduleRender();
  }

  onPointerUp(_e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || !this.start || !this.end) {
      this.reset();
      return;
    }
    const dx = this.end.x - this.start.x;
    const dy = this.end.y - this.start.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      ctx.addElement({
        id: generateId(),
        type: 'arrow',
        startX: this.start.x,
        startY: this.start.y,
        endX: this.end.x,
        endY: this.end.y,
        startArrowhead: this.arrowStart,
        endArrowhead: this.arrowEnd,
        color: this.color,
        strokeWidth: this.strokeWidth,
        startBinding: this.startBinding,
        endBinding: this.endBinding,
      });
    }
    this.reset();
  }

  private snapToPoint(point: Point, elements: WBElement[], ctx: ToolContext): { point: Point; binding: ArrowBinding | null } {
    if (!ctx.snapConfig.enabled) {
      // Even without grid snap, still try element snap
    }
    
    let closestDist = this.snapThreshold / ctx.viewport.zoom * 2;
    let closestPoint = point;
    let closestBinding: ArrowBinding | null = null;
    
    for (const el of elements) {
      if (el.type === 'arrow' || el.type === 'path') continue;  // Don't snap to arrows or paths
      
      const positions: AnchorPosition[] = ['top', 'right', 'bottom', 'left', 'center'];
      for (const pos of positions) {
        const anchor = getAnchorPoint(el, pos);
        const dist = Math.hypot(point.x - anchor.x, point.y - anchor.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestPoint = anchor;
          closestBinding = { elementId: el.id, position: pos };
        }
      }
    }
    
    return { point: closestPoint, binding: closestBinding };
  }

  getHoveredElementId(): string | null {
    return this.hoveredElementId;
  }
}
```

---

## 10.6 Visual Feedback for Snap

### Snap preview highlighting — `packages/core/src/renderer.ts`

When an arrow is being drawn and the endpoint is near an element, highlight that element with a blue glow:

```ts
drawSnapHighlight(elements: WBElement[], highlightId: string | null, viewport: Viewport) {
  if (!highlightId) return;
  const el = elements.find(e => e.id === highlightId);
  if (!el) return;
  
  this.ctx.save();
  this.ctx.strokeStyle = '#3b82f6';
  this.ctx.lineWidth = 2 / viewport.zoom;
  this.ctx.setLineDash([]);
  this.ctx.shadowColor = '#3b82f6';
  this.ctx.shadowBlur = 8 / viewport.zoom;
  
  const bounds = getElementBounds(el);
  const pad = 4;
  this.ctx.strokeRect(
    bounds.left - pad,
    bounds.top - pad,
    bounds.width + pad * 2,
    bounds.height + pad * 2
  );
  
  this.ctx.restore();
}
```

The `Whiteboard` passes `hoveredElementId` from the `ArrowTool` to the renderer. This requires adding a field to `Whiteboard`:

```ts
arrowSnapTargetId: string | null = null;
```

And in `scheduleRender`:

```ts
this.renderer.render(/* ... */);
this.renderer.drawSnapHighlight(this.elements, this.arrowSnapTargetId, this.viewport);
```

### Anchor point dots

When snapping, draw small circles at the 5 anchor positions on the target element:

```ts
drawAnchorPoints(el: WBElement, viewport: Viewport) {
  const positions: AnchorPosition[] = ['top', 'right', 'bottom', 'left', 'center'];
  this.ctx.save();
  this.ctx.fillStyle = '#3b82f6';
  const r = 4 / viewport.zoom;
  for (const pos of positions) {
    const point = getAnchorPoint(el, pos);
    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
    this.ctx.fill();
  }
  this.ctx.restore();
}
```

---

## 10.7 Binding Cleanup on Element Deletion

When an element is deleted, any arrows bound to it should have their binding set to `null` but keep their last-known coordinates:

```ts
// In Whiteboard.deleteElements or in a helper:
function cleanupBindings(elements: WBElement[], deletedIds: Set<string>): void {
  for (const el of elements) {
    if (el.type !== 'arrow') continue;
    const arrow = el as ArrowElement;
    if (arrow.startBinding && deletedIds.has(arrow.startBinding.elementId)) {
      (arrow as any).startBinding = null;
    }
    if (arrow.endBinding && deletedIds.has(arrow.endBinding.elementId)) {
      (arrow as any).endBinding = null;
    }
  }
}
```

Call this in `DeleteElementsCommand.execute()` or in `Whiteboard` after deletion.

---

## 10.8 Update Existing Code

### History commands

`UpdateElementCommand` already handles partial updates. Arrow bindings are just fields on `ArrowElement`, so updating them works via:

```ts
wb.updateElementWithHistory(arrowId, { startBinding: { elementId: 'rect1', position: 'right' } });
```

### Export

`@whiteboard/export` needs to serialize `startBinding` and `endBinding` fields. Since they're part of the element, the existing JSON export already includes them. Check that `computeBounds` in `@whiteboard/export/src/bounds.ts` handles bound arrows correctly (it already uses `startX`/`startY`/`endX`/`endY` — no changes needed).

SVG export for bound arrows is the same as unbound arrows — it just draws a line between `startX/startY` and `endX/endY`.

---

## 10.9 Moving Bound Elements

### `SelectTool` enhancement

When moving elements, after the drag completes, re-resolve all arrow bindings:

```ts
// In SelectTool.onPointerUp, after moving elements:
if (ctx.resolveBindings) {
  ctx.resolveBindings();
}
```

Add `resolveBindings` to `ToolContext`:

```ts
export interface ToolContext {
  // ... existing fields ...
  resolveBindings: () => void;
}
```

In `Whiteboard.getToolContext()`:

```ts
resolveBindings: () => {
  for (const el of this.elements) {
    if (el.type !== 'arrow') continue;
    const arrow = el as ArrowElement;
    if (arrow.startBinding) {
      const bound = this.elements.find(e => e.id === arrow.startBinding!.elementId);
      if (bound) {
        const point = getAnchorPoint(bound, arrow.startBinding.position);
        arrow.startX = point.x;
        arrow.startY = point.y;
      }
    }
    if (arrow.endBinding) {
      const bound = this.elements.find(e => e.id === arrow.endBinding!.elementId);
      if (bound) {
        const point = getAnchorPoint(bound, arrow.endBinding.position);
        arrow.endX = point.x;
        arrow.endY = point.y;
      }
    }
  }
},
```

---

## 10.10 File Touch List

| File | Change |
|------|--------|
| `packages/core/src/types.ts` | Add `ArrowBinding`, `AnchorPosition`; add `startBinding`/`endBinding` to `ArrowElement` |
| `packages/core/src/snap.ts` | Add `getAnchorPoint()` function |
| `packages/core/src/tools.ts` | Enhance `ArrowTool` with snap-to-element logic; add `snapToPoint()`, binding fields, `hoveredElementId` |
| `packages/core/src/whiteboard.ts` | Add `arrowSnapTargetId`; call `resolveBindings` in `scheduleRender`; add `resolveBindings` to `ToolContext` |
| `packages/core/src/renderer.ts` | Add `drawSnapHighlight()` and `drawAnchorPoints()` methods |
| `packages/core/src/history.ts` | Call `cleanupBindings` after deletions (or add to `DeleteElementsCommand`) |
| `packages/core/src/index.ts` | Export `ArrowBinding`, `AnchorPosition`, `getAnchorPoint` |

---

## 10.11 Testing Checklist

- [ ] Creating an arrow near a rectangle snaps the start point to the nearest anchor
- [ ] Creating an arrow near an ellipse snaps the end point to the nearest anchor
- [ ] Snapped arrow has `startBinding`/`endBinding` fields populated
- [ ] Moving a bound element moves the connected arrow endpoint
- [ ] Deleting a bound element nullifies the binding without moving the arrow
- [ ] Snap preview highlights the target element in blue
- [ ] Anchor point dots appear on the target element when snapping
- [ ] Arrow endpoint is placed at the correct anchor position (top/right/bottom/left/center)
- [ ] Binding resolution happens on every render frame
- [ ] Arrow binding survives undo/redo
- [ ] Export to JSON preserves bindings
- [ ] Import from JSON restores bindings
- [ ] Bound arrow renders correctly in SVG export