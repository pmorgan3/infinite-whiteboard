# Phase 3: Grid Snapping and Alignment Guides

## Overview

Add **grid snapping** (elements snap to a configurable grid when moved/placed) and **alignment guides** (smart guides that appear when an element's edges or center aligns with other elements' edges or centers). These features make precise layout trivial and are standard in tools like Excalidraw, Figma, and tldraw.

---

## 3.1 Grid Snapping

### Concept

When grid snapping is enabled, element positions during creation and movement are rounded to the nearest grid intersection. The grid snap value is independent of the visual grid spacing.

### Configuration — `packages/core/src/types.ts`

```ts
export interface SnapConfig {
  enabled: boolean;
  gridSize: number;        // default: 20 (matches visual grid smallest spacing)
  threshold: number;       // pixels from grid line before snapping kicks in (default: 8)
}
```

### `Whiteboard` class additions

```ts
export class Whiteboard {
  snapConfig: SnapConfig = { enabled: false, gridSize: 20, threshold: 8 };
  // ...
}
```

### Snapping function — `packages/core/src/snap.ts` (new file)

```ts
import type { Point } from './types';
import type { Viewport } from './viewport';
import type { SnapConfig } from './types';

export function snapToGrid(point: Point, config: SnapConfig): Point {
  if (!config.enabled) return point;
  return {
    x: Math.round(point.x / config.gridSize) * config.gridSize,
    y: Math.round(point.y / config.gridSize) * config.gridSize,
  };
}

export interface SnapGuides {
  horizontal: number[];    // y-values where guides should appear
  vertical: number[];      // x-values where guides should appear
  snappedPoint: Point;     // the final position after snapping
}

export function snapToGuides(
  movingBounds: Bounds,
  allElements: Bounds[],
  config: SnapConfig,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
): SnapGuides {
  if (!config.enabled) {
    return {
      horizontal: [],
      vertical: [],
      snappedPoint: { x: movingBounds.centerX, y: movingBounds.centerY },
    };
  }

  const threshold = config.threshold / viewport.zoom;
  const horizontal: number[] = [];
  const vertical: number[] = [];

  let snappedX = movingBounds.centerX;
  let snappedY = movingBounds.centerY;

  for (const other of allElements) {
    // Check vertical alignment (x-axis)
    for (const ref of [other.left, other.centerX, other.right]) {
      for (const moving of [movingBounds.left, movingBounds.centerX, movingBounds.right]) {
        if (Math.abs(moving - ref) < threshold) {
          vertical.push(ref);
          // Snap the difference
          const diff = ref - moving;
          snappedX += diff;
          break;
        }
      }
    }

    // Check horizontal alignment (y-axis)
    for (const ref of [other.top, other.centerY, other.bottom]) {
      for (const moving of [movingBounds.top, movingBounds.centerY, movingBounds.bottom]) {
        if (Math.abs(moving - ref) < threshold) {
          horizontal.push(ref);
          const diff = ref - moving;
          snappedY += diff;
          break;
        }
      }
    }
  }

  return { horizontal, vertical, snappedPoint: { x: snappedX, y: snappedY } };
}
```

### When snapping is applied

1. **Shape creation** (rectangle, ellipse, arrow endpoints): After computing the final position, snap to grid.
2. **Element move (drag)**: During `onPointerMove` in `SelectTool`, snap the target position.
3. **Freehand drawing**: Do NOT snap individual points (would distort the path), but can optionally snap the overall bounding box endpoint.

### Integration in tools

The `ToolContext` gains a `snapConfig` property and a `snapToGrid(point)` helper:

```ts
export interface ToolContext {
  // ... existing ...
  snapConfig: SnapConfig;
  snapToGrid(point: Point): Point;
}
```

In `Whiteboard.getToolContext()`:

```ts
snapConfig: this.snapConfig,
snapToGrid: (point: Point) => snapToGrid(point, this.snapConfig),
```

### Visual grid emphasis during snap

When grid snap is enabled, the `Renderer` should highlight the nearest grid points that an element would snap to. This is a subtle visual cue:

- Draw small crosshairs or highlighted dots at snap points near the cursor when dragging.
- Only show when `snapConfig.enabled` and the user is actively dragging.

---

## 3.2 Alignment Guides

### Concept

When the user drags an element, alignment guides (thin colored lines spanning the full viewport width or height) appear when the element's edges or center align with other elements. This is similar to Figma's smart guides.

### Guide rendering

In the `Renderer.render()` method, after drawing all elements and selection highlights, draw any active snap guides:

```ts
render(
  viewport: Viewport,
  elements: WBElement[],
  selectedIds: Set<string>,
  preview?: RenderPreview,
  snapGuides?: SnapGuides,
) {
  // ... existing rendering ...
  if (snapGuides) {
    this.drawSnapGuides(viewport, width, height, snapGuides);
  }
}
```

```ts
private drawSnapGuides(
  viewport: Viewport,
  width: number,
  height: number,
  guides: SnapGuides,
) {
  this.ctx.save();
  this.ctx.strokeStyle = '#f87171';  // red-400
  this.ctx.lineWidth = 1 / viewport.zoom;
  this.ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);

  // Vertical guides (full height lines at specific x positions)
  for (const x of guides.vertical) {
    const topLeft = viewport.screenToWorld({ x: 0, y: 0 }, width, height);
    const bottomRight = viewport.screenToWorld({ x: width, y: height }, width, height);
    this.ctx.beginPath();
    this.ctx.moveTo(x, topLeft.y);
    this.ctx.lineTo(x, bottomRight.y);
    this.ctx.stroke();
  }

  // Horizontal guides (full width lines at specific y positions)
  for (const y of guides.horizontal) {
    const topLeft = viewport.screenToWorld({ x: 0, y: 0 }, width, height);
    const bottomRight = viewport.screenToWorld({ x: width, y: height }, width, height);
    this.ctx.beginPath();
    this.ctx.moveTo(topLeft.x, y);
    this.ctx.lineTo(bottomRight.x, y);
    this.ctx.stroke();
  }

  this.ctx.restore();
}
```

### Bounds computation

Each element type needs a `getBounds()` function that returns its bounding box:

```ts
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export function getElementBounds(el: WBElement): Bounds {
  switch (el.type) {
    case 'rectangle':
      return {
        left: el.x,
        top: el.y,
        right: el.x + el.width,
        bottom: el.y + el.height,
        centerX: el.x + el.width / 2,
        centerY: el.y + el.height / 2,
        width: el.width,
        height: el.height,
      };
    case 'ellipse':
      return {
        left: el.x - el.rx,
        top: el.y - el.ry,
        right: el.x + el.rx,
        bottom: el.y + el.ry,
        centerX: el.x,
        centerY: el.y,
        width: el.rx * 2,
        height: el.ry * 2,
      };
    case 'path': {
      const xs = el.points.map(p => p.x);
      const ys = el.points.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      return {
        left: minX, top: minY, right: maxX, bottom: maxY,
        centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2,
        width: maxX - minX, height: maxY - minY,
      };
    }
    case 'text':
    case 'image':
      return {
        left: el.x, top: el.y, right: el.x + el.width, bottom: el.y + el.height,
        centerX: el.x + el.width / 2, centerY: el.y + el.height / 2,
        width: el.width, height: el.height,
      };
    case 'arrow': {
      const minX = Math.min(el.startX, el.endX);
      const maxX = Math.max(el.startX, el.endX);
      const minY = Math.min(el.startY, el.endY);
      const maxY = Math.max(el.startY, el.endY);
      return {
        left: minX, top: minY, right: maxX, bottom: maxY,
        centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2,
        width: maxX - minX, height: maxY - minY,
      };
    }
  }
}
```

---

## 3.3 SelectTool Integration

The `SelectTool` is where alignment guides are computed during drag operations. When the user drags a selected element:

1. Compute the moving element's tentative bounds (at the drag destination).
2. Compute all other elements' bounds.
3. Call `snapToGuides()` to get snap results.
4. If guides are found, adjust the element position to align.
5. Store the guides for rendering.
6. On `pointerUp`, clear the guides.

### Modified `Whiteboard` state

```ts
export class Whiteboard {
  // ...
  activeGuides: SnapGuides | null = null;
}
```

The `scheduleRender` method passes `activeGuides` to `Renderer.render()`.

### Modified `SelectTool`

```ts
class SelectTool implements Tool {
  private isDragging = false;
  private dragStart: Point | null = null;
  private dragOffset: Map<string, Point> = new Map();
  private guides: SnapGuides | null = null;

  onPointerMove(e: PointerEvent, ctx: ToolContext) {
    if (!this.isDragging || !this.dragStart) return;
    const off = ctx.getOffset(e);
    let world = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);

    // Grid snap first
    world = ctx.snapToGrid(world);

    const dx = world.x - this.dragStart.x;
    const dy = world.y - this.dragStart.y;

    // Compute alignment guides for the primary selected element
    const primaryId = ctx.getSelectedIds().values().next().value;
    if (primaryId) {
      const primaryEl = ctx.elements.find(el => el.id === primaryId);
      if (primaryEl) {
        const movedBounds = shiftBounds(getElementBounds(primaryEl), dx, dy);
        const otherBounds = ctx.elements
          .filter(el => !ctx.getSelectedIds().has(el.id))
          .map(getElementBounds);
        this.guides = snapToGuides(
          movedBounds,
          otherBounds,
          ctx.snapConfig,
          ctx.viewport,
          ctx.canvasWidth,
          ctx.canvasHeight,
        );
        // Adjust dx/dy based on guide snapping
        // (the snappedPoint tells us where the center should be)
      }
    }

    for (const id of this.dragOffset.keys()) {
      const orig = this.dragOffset.get(id)!;
      ctx.updateElement(id, (el) => moveElement(el, orig.x + dx, orig.y + dy));
    }

    ctx.whiteboard.activeGuides = this.guides;
    ctx.scheduleRender();
  }

  onPointerUp() {
    this.isDragging = false;
    this.dragStart = null;
    this.dragOffset.clear();
    this.guides = null;
    ctx.whiteboard.activeGuides = null;
    ctx.scheduleRender();
  }
}
```

### `ToolContext` additions

The `ToolContext` needs access to the `Whiteboard` instance to set `activeGuides`. Either:
- Add a `setGuides(guides: SnapGuides | null)` callback to `ToolContext`, or
- Pass the `Whiteboard` reference.

For simplicity, add a `setGuides` method:

```ts
export interface ToolContext {
  // ... existing ...
  snapConfig: SnapConfig;
  snapToGrid(point: Point): Point;
  setGuides(guides: SnapGuides | null): void;
}
```

---

## 3.4 Viewing Grid Snap Setting in the UI

### Toggle button in toolbar

Add a snap-toggle button to `App.tsx`:

```tsx
<button
  className={`snap-toggle ${snapEnabled ? 'active' : ''}`}
  onClick={() => setSnapEnabled(!snapEnabled)}
  title={snapEnabled ? 'Grid snap: ON' : 'Grid snap: OFF'}
>
  ⊞
</button>
```

Props flow:

```tsx
<Canvas
  tool={tool}
  color={color}
  strokeWidth={strokeWidth}
  roomId={joinedRoom || undefined}
  userName={userName}
  snapEnabled={snapEnabled}
  gridSize={20}
/>
```

In `Canvas.tsx`:

```tsx
useEffect(() => {
  const wb = wbRef.current;
  if (!wb) return;
  wb.snapConfig.enabled = snapEnabled;
  wb.snapConfig.gridSize = 20;
}, [snapEnabled, gridSize]);
```

---

## 3.5 Grid dot Highlighting During Snap

When grid snapping is on and the user is creating/resizing an element, highlight the grid points near the cursor. This is done in the renderer:

```ts
// In render(), after drawing grid, if snap is enabled and a preview exists:
if (snapConfig.enabled && preview) {
  this.drawSnapHighlights(viewport, width, height, preview);
}

private drawSnapHighlights(
  viewport: Viewport,
  width: number,
  height: number,
  preview: RenderPreview,
) {
  // Get the relevant point from the preview (e.g., the endpoint for arrows,
  // the bottom-right corner for rectangles, etc.)
  // Highlight nearest grid points within threshold
  const gridSize = 20; // from config
  this.ctx.fillStyle = '#3b82f6'; // blue highlight
  // Draw slightly larger dots at grid intersections near the snap point
}
```

---

## 3.6 Equal-spacing guides (stretch goal)

When three or more elements are aligned and evenly spaced, show "equal spacing" guides indicating that the dragged element maintains equal distance. This is noted for future implementation but **not included in Phase 3**.

---

## 3.7 File touch list

| File | Change |
|---|---|
| `packages/core/src/types.ts` | Add `SnapConfig`, `Bounds`, `SnapGuides` interfaces |
| `packages/core/src/snap.ts` | **New file** — `snapToGrid()`, `snapToGuides()`, `getElementBounds()`, `shiftBounds()` |
| `packages/core/src/tools.ts` | Update `ToolContext` with snap helpers; update `SelectTool` to compute guides; snap shape creation endpoints |
| `packages/core/src/whiteboard.ts` | Add `snapConfig`, `activeGuides` fields; update `getToolContext()`; pass guides to renderer |
| `packages/core/src/renderer.ts` | Add `drawSnapGuides()`, `drawSnapHighlights()`; accept `SnapGuides` param in `render()` |
| `packages/collab/src/provider.ts` | No changes needed (snapping is local-only, not synced) |
| `apps/web/src/App.tsx` | Add snap toggle button, `snapEnabled` state |
| `apps/web/src/Canvas.tsx` | Pass `snapEnabled`/`gridSize` to whiteboard |
| `apps/web/src/App.scss` | Style snap toggle button |

---

## 3.8 Testing checklist

- [ ] Enable grid snap; draw a rectangle — corners snap to grid
- [ ] Enable grid snap; draw an ellipse — center snaps to grid
- [ ] Enable grid snap; draw an arrow — endpoints snap to grid
- [ ] Enable grid snap; select and drag an element — position snaps to grid
- [ ] Disable grid snap — no snapping occurs
- [ ] Alignment guides: drag an element near another; a red line appears when edges/centers align
- [ ] Alignment guides: element snaps to the aligned position
- [ ] Alignment guides: releasing the mouse clears the guide lines
- [ ] Grid highlight dots appear at snap points during creation/drag
- [ ] Alignment guides work with viewport zoom (threshold scales correctly)
- [ ] Undo/redo still works correctly with snapped positions
- [ ] Collaboration: snapping is local-only; remote users see final positions without guide lines