# Phase 2: Arrow / Connector Shapes

## Overview

Add **arrow** and **line** (connector) elements to the whiteboard. Arrows are the most-requested whiteboard primitive after freehand, rectangles, and text. Connectors (lines between two points) are arrows without arrowheads. Both must support drawing by click-drag, selection, move (of individual endpoints or the whole shape), deletion, and collaboration.

---

## 2.1 Types — `packages/core/src/types.ts`

### New element types

```ts
export interface ArrowElement extends BaseElement {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startArrowhead: boolean;   // arrowhead at start point
  endArrowhead: boolean;     // arrowhead at end point (default true)
  color: string;
  strokeWidth: number;
}

export interface LineElement extends BaseElement {
  type: 'line';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  strokeWidth: number;
}
```

Alternatively, use a single `ArrowElement` with `startArrowhead` / `endArrowhead` booleans. A plain line is just an arrow with both arrowheads set to `false`. This is simpler for the renderer and collaboration layer.

**Decision: Use a single `ArrowElement` type with configurable arrowheads.** `ToolType` adds `'arrow'` but not `'line'` — the user can toggle arrowheads off for a plain line via tool options.

```ts
export interface ArrowElement extends BaseElement {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startArrowhead: boolean;
  endArrowhead: boolean;
}

export type WBElement =
  | PathElement
  | RectangleElement
  | EllipseElement
  | TextElement
  | ImageElement
  | ArrowElement;

export type ToolType = 'pan' | 'draw' | 'rectangle' | 'ellipse' | 'select' | 'text' | 'image' | 'arrow';
```

---

## 2.2 Arrow Tool — `packages/core/src/tools.ts`

### `ArrowTool`

- **onPointerDown**: Record the start point in world coordinates.
- **onPointerMove**: Update the end point; schedule a render for live preview.
- **onPointerUp**: If the distance between start and end is > 5px, create an `ArrowElement`. Preview is drawn during drag.

```ts
class ArrowTool implements Tool {
  private start: Point | null = null;
  private end: Point | null = null;
  private isDrawing = false;
  private arrowStart = false;  // tool option: arrowhead at start
  private arrowEnd = true;     // tool option: arrowhead at end

  constructor(private color: string, private strokeWidth: number) {}

  onPointerDown(e: PointerEvent, ctx: ToolContext) {
    if (e.button !== 0) return;
    this.isDrawing = true;
    const off = ctx.getOffset(e);
    this.start = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    this.end = this.start;
  }

  onPointerMove(e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || !this.start) return;
    const off = ctx.getOffset(e);
    this.end = ctx.viewport.screenToWorld(off, ctx.canvasWidth, ctx.canvasHeight);
    ctx.scheduleRender();
  }

  onPointerUp(_e: PointerEvent, ctx: ToolContext) {
    if (!this.isDrawing || !this.start || !this.end) { this.reset(); return; }
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
      });
    }
    this.reset();
  }

  getPreview(): { start: Point; end: Point } | null {
    if (!this.isDrawing || !this.start || !this.end) return null;
    return { start: this.start, end: this.end };
  }

  private reset() {
    this.isDrawing = false;
    this.start = null;
    this.end = null;
  }
}
```

### Update `createTool`

```ts
case 'arrow':
  return new ArrowTool(options.color, options.strokeWidth);
```

---

## 2.3 Renderer — `packages/core/src/renderer.ts`

### Drawing arrows

```ts
private drawArrow(el: Extract<WBElement, { type: 'arrow' }>) {
  const { startX, startY, endX, endY, startArrowhead, endArrowhead, color, strokeWidth } = el;

  // Line
  this.ctx.strokeStyle = color;
  this.ctx.lineWidth = strokeWidth;
  this.ctx.lineCap = 'round';
  this.ctx.beginPath();
  this.ctx.moveTo(startX, startY);
  this.ctx.lineTo(endX, endY);
  this.ctx.stroke();

  // Arrowheads
  if (endArrowhead) {
    this.drawArrowhead(startX, startY, endX, endY, strokeWidth);
  }
  if (startArrowhead) {
    this.drawArrowhead(endX, endY, startX, startY, strokeWidth);
  }
}

private drawArrowhead(
  fromX: number, fromY: number,
  toX: number, toY: number,
  strokeWidth: number
) {
  const headLength = Math.max(10, strokeWidth * 4);
  const angle = Math.atan2(toY - fromY, toX - fromX);

  this.ctx.fillStyle = this.ctx.strokeStyle;
  this.ctx.beginPath();
  this.ctx.moveTo(toX, toY);
  this.ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6),
  );
  this.ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6),
  );
  this.ctx.closePath();
  this.ctx.fill();
}
```

### Arrow preview during draw

Add to `RenderPreview` union type:

```ts
| {
    type: 'arrow';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startArrowhead: boolean;
    endArrowhead: boolean;
    color: string;
    strokeWidth: number;
  }
```

Add a `drawArrowPreview` method following the same pattern as `drawArrow`.

### Update `Whiteboard.buildPreview()`

```ts
if (this.toolType === 'arrow') {
  const tool = this.activeTool as any;
  if (tool.getPreview) {
    const p = tool.getPreview() as { start: Point; end: Point } | null;
    if (p) {
      preview = {
        type: 'arrow' as const,
        startX: p.start.x,
        startY: p.start.y,
        endX: p.end.x,
        endY: p.end.y,
        startArrowhead: false,
        endArrowhead: true,
        color: this.toolColor,
        strokeWidth: this.toolStrokeWidth,
      };
    }
  }
}
```

### Selection highlight for arrow

```ts
if (el.type === 'arrow') {
  const dx = el.endX - el.startX;
  const dy = el.endY - el.startY;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = len > 0 ? -dy / len : 0;
  const ny = len > 0 ? dx / len : 0;
  const pad = 6;

  // Draw dashed line alongside the arrow
  this.ctx.beginPath();
  this.ctx.moveTo(el.startX + nx * pad, el.startY + ny * pad);
  this.ctx.lineTo(el.endX + nx * pad, el.endY + ny * pad);
  this.ctx.stroke();
  this.ctx.beginPath();
  this.ctx.moveTo(el.startX - nx * pad, el.startY - ny * pad);
  this.ctx.lineTo(el.endX - nx * pad, el.endY - ny * pad);
  this.ctx.stroke();
}
```

Or simpler: draw a bounding box around the arrow's endpoints with padding.

---

## 2.4 Hit-testing — `packages/core/src/tools.ts`

Arrows are 1D objects (line segments). Hit-testing uses point-to-line-segment distance:

```ts
if (el.type === 'arrow') {
  const dist = pointToSegmentDistance(point, { x: el.startX, y: el.startY }, { x: el.endX, y: el.endY });
  return dist < margin + el.strokeWidth;
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}
```

---

## 2.5 Move behavior for arrows

### Whole-shape move (default)

When an arrow is selected and dragged, translate both endpoints by the same delta:

```ts
function moveElement(el: WBElement, x: number, y: number): WBElement {
  // ... existing cases ...
  if (el.type === 'arrow') {
    const orig = getPos(el);
    const dx = x - orig.x;
    const dy = y - orig.y;
    return {
      ...el,
      startX: el.startX + dx,
      startY: el.startY + dy,
      endX: el.endX + dx,
      endY: el.endY + dy,
    };
  }
}
```

### Endpoint editing (stretch goal, not MVP)

In the future, clicking near an endpoint could put the tool into "endpoint edit" mode where dragging only the near endpoint. This requires:
1. Detecting which endpoint is nearest on pointer down.
2. Only moving that endpoint (not the whole arrow).
3. Supporting Shift-constrain to snap to axis.

This is noted for future implementation but **not included in Phase 2**.

---

## 2.6 History — `packages/core/src/history.ts`

Update `getPos` and `setPos` for the `arrow` type:

```ts
function getPos(el: WBElement): PointLike {
  // ... existing cases ...
  if (el.type === 'arrow') return { x: el.startX, y: el.startY };
}

function setPos(el: WBElement, x: number, y: number) {
  // ... existing cases ...
  if (el.type === 'arrow') {
    const dx = x - el.startX;
    const dy = y - el.startY;
    el.startX += dx;
    el.startY += dy;
    el.endX += dx;
    el.endY += dy;
  }
}
```

---

## 2.7 Collaboration — `packages/collab/src/provider.ts`

### `getElements()` — add arrow case

```ts
if (obj.type === 'arrow') {
  result.push({
    id: obj.id,
    type: 'arrow',
    startX: obj.startX ?? 0,
    startY: obj.startY ?? 0,
    endX: obj.endX ?? 0,
    endY: obj.endY ?? 0,
    startArrowhead: obj.startArrowhead ?? false,
    endArrowhead: obj.endArrowhead ?? true,
    color: obj.color ?? '#1f2937',
    strokeWidth: obj.strokeWidth ?? 2,
  });
}
```

### `setElements()` and `addElement()` — add arrow fields

```ts
if (element.type === 'arrow') {
  map.set('startX', element.startX);
  map.set('startY', element.startY);
  map.set('endX', element.endX);
  map.set('endY', element.endY);
  map.set('startArrowhead', element.startArrowhead);
  map.set('endArrowhead', element.endArrowhead);
}
```

---

## 2.8 Web App — `apps/web/src/`

### `App.tsx` — tool bar changes

Add the arrow tool button:

```tsx
{ type: 'arrow', label: 'Arrow', icon: '→' },
```

### Tool options for arrow

When the arrow tool is active, show toggle buttons for:
- **Start arrowhead** on/off
- **End arrowhead** on/off (default on)

This requires extending the `Whiteboard.setToolOptions()` call:

```ts
wb.setToolOptions({
  color,
  strokeWidth,
  arrowStart: showStartArrow,
  arrowEnd: showEndArrow,
});
```

The `ArrowTool` constructor and `createTool` options need to be extended accordingly.

### `Whiteboard` changes

Extend `setToolOptions` to accept arrow configuration:

```ts
export interface ToolOptions {
  color?: string;
  strokeWidth?: number;
  arrowStart?: boolean;
  arrowEnd?: boolean;
}
```

`createTool` passes these through to `ArrowTool`.

---

## 2.9 Keyboard shortcut

Add `A` as a keyboard shortcut for the arrow tool in `Whiteboard.onKeyDown()` or in the React layer:

```ts
// In App.tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key) {
      case 'a': case 'A': setTool('arrow'); break;
      case 'v': setTool('select'); break;
      case 'p': setTool('pan'); break;
      case 'd': setTool('draw'); break;
      case 'r': setTool('rectangle'); break;
      case 'e': setTool('ellipse'); break;
      case 't': setTool('text'); break;
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

---

## 2.10 File touch list

| File | Change |
|---|---|
| `packages/core/src/types.ts` | Add `ArrowElement`, update `WBElement`, update `ToolType` |
| `packages/core/src/tools.ts` | Add `ArrowTool`, update `createTool`, `hitTest`, `moveElement`, `getPos`, `setPos` |
| `packages/core/src/renderer.ts` | Add `drawArrow`, `drawArrowhead`, arrow preview, arrow selection highlight; update `RenderPreview` |
| `packages/core/src/history.ts` | Update `getPos`/`setPos` for arrow |
| `packages/core/src/whiteboard.ts` | Update `buildPreview` for arrow, extend `ToolOptions` type |
| `packages/collab/src/provider.ts` | Handle arrow in `getElements`, `setElements`, `addElement` |
| `apps/web/src/App.tsx` | Add arrow tool button, arrowhead toggles, keyboard shortcuts |
| `apps/web/src/App.scss` | Style arrowhead toggle buttons |

---

## 2.11 Testing checklist

- [ ] Draw an arrow by clicking and dragging from start to end
- [ ] Arrow appears with an arrowhead at the end by default
- [ ] Toggle start arrowhead on; both arrowheads render
- [ ] Toggle end arrowhead off; plain line renders (no arrowheads)
- [ ] Select and move an arrow; both endpoints move together
- [ ] Delete a selected arrow; undo restores it
- [ ] Arrow hit-testing: click near the line selects it; click far away does not
- [ ] Collaboration: User A draws an arrow; User B sees it in real-time
- [ ] Arrow with dark color and thick stroke renders correctly
- [ ] Undo/redo of arrow creation works
- [ ] Keyboard shortcut `A` activates arrow tool