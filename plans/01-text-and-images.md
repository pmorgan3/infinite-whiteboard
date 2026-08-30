# Phase 1: Text Boxes and Image Upload

## Overview

Add two new element types to the whiteboard: **text** (editable, multi-line text boxes) and **image** (uploaded or pasted images positioned on the canvas). Both must integrate with the existing tool system, renderer, history (undo/redo), selection/drag, and Yjs collaboration.

---

## 1.1 Types — `packages/core/src/types.ts`

Add two new element interfaces to the `WBElement` union:

```ts
export interface TextElement extends BaseElement {
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;       // background fill color ("" means transparent)
}

export interface ImageElement extends BaseElement {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;        // data URL or object URL
  naturalWidth: number;
  naturalHeight: number;
}

export type WBElement =
  | PathElement
  | RectangleElement
  | EllipseElement
  | TextElement
  | ImageElement;
```

Update `ToolType`:

```ts
export type ToolType = 'pan' | 'draw' | 'rectangle' | 'ellipse' | 'select' | 'text' | 'image';
```

---

## 1.2 Text Tool — `packages/core/src/tools.ts`

### `TextTool`

- **onPointerDown**: If clicking empty space, create a new `TextElement` at the world-space click position with default dimensions (200×40) and empty `text`. If clicking an existing text element, select it for editing.
- No drag behavior — text boxes are created with defaults and resized via selection handles (future enhancement) or by typing.
- Expose a `getPendingText()` method so the whiteboard can read the text being drafted.

### Creating text elements

The TextTool adds elements through `ctx.addElement()` so the operation is undoable:

```ts
ctx.addElement({
  id: generateId(),
  type: 'text',
  x: worldPoint.x,
  y: worldPoint.y,
  width: 200,
  height: 40,
  text: '',
  fontSize: 16,
  fontFamily: 'sans-serif',
  fill: 'transparent',
  color: ctx.activeColor,   // new: color property on ToolContext
  strokeWidth: 1,
});
```

### Text editing model

The text tool puts the whiteboard into "editing" mode. The `Whiteboard` class needs a new concept: an **active element ID** that indicates which element is being edited. When a text element is active:

1. The whiteboard emits an `onStartEditing(elementId)` callback.
2. The React layer renders a `<textarea>` or `<div contenteditable>` overlay at the element's screen position.
3. On blur or Enter (without Shift), the overlay commits the text back to the element via `ctx.updateElement()`.
4. The whiteboard exits editing mode via `wb.stopEditing()`.

**Why overlay, not canvas-rendered text editing?** Canvas cannot receive keyboard input or show a text cursor natively. Using a DOM overlay is the standard approach (Excalidraw, tldraw, etc.).

### `Whiteboard` changes

```ts
// whiteboard.ts
export class Whiteboard {
  // ... existing fields ...
  editingElementId: string | null = null;
  private onStartEditing?: (elementId: string) => void;

  startEditing(elementId: string) {
    this.editingElementId = elementId;
    this.onStartEditing?.(elementId);
    this.scheduleRender();
  }

  stopEditing() {
    this.editingElementId = null;
    this.scheduleRender();
  }

  // Add to constructor options:
  // onStartEditing?: (elementId: string) => void;
}
```

---

## 1.3 Image Tool — `packages/core/src/tools.ts`

### `ImageTool`

- **onPointerDown**: Opens a file picker (or await a paste event — see below) and creates an `ImageElement` at the click position.
- The tool stores a pending image state. On pointer down, it triggers a hidden `<input type="file" accept="image/*">` click.
- When the file is loaded, it reads it as a data URL, then calls `ctx.addElement()` with the image.
- **Paste support**: The `Whiteboard` class also listens for `paste` events. If the clipboard contains an image, it creates an `ImageElement` at the center of the viewport.

### Creating image elements

```ts
ctx.addElement({
  id: generateId(),
  type: 'image',
  x: worldPoint.x - naturalWidth / 2,
  y: worldPoint.y - naturalHeight / 2,
  width: naturalWidth,   // scaled later if needed
  height: naturalHeight,
  src: dataUrl,
  naturalWidth,
  naturalHeight,
  color: '',
  strokeWidth: 0,
});
```

### Image loading concern

Canvas requires an `HTMLImageElement` to `drawImage()`. The renderer must:

1. Maintain an `ImageCache: Map<string, HTMLImageElement>` keyed by `element.src`.
2. When rendering an image element, check the cache. If not loaded, create a new `Image()`, set `onload` to trigger a re-render, and draw a placeholder rectangle in the meantime.
3. For collaboration (Yjs), the `src` field carries the data URL. This works for small images but need to consider size limits (see Section 1.7).

---

## 1.4 Renderer changes — `packages/core/src/renderer.ts`

### Drawing text elements

```ts
private drawText(el: Extract<WBElement, { type: 'text' }>) {
  // Background fill
  if (el.fill && el.fill !== 'transparent') {
    this.ctx.fillStyle = el.fill;
    this.ctx.fillRect(el.x, el.y, el.width, el.height);
  }

  // Border
  this.ctx.strokeStyle = el.color;
  this.ctx.lineWidth = el.strokeWidth;
  this.ctx.strokeRect(el.x, el.y, el.width, el.height);

  // Text content
  this.ctx.fillStyle = el.color;
  this.ctx.font = `${el.fontSize}px ${el.fontFamily}`;
  this.ctx.textBaseline = 'top';

  const lines = wrapText(this.ctx, el.text, el.width - 8);
  const lineHeight = el.fontSize * 1.3;
  for (let i = 0; i < lines.length; i++) {
    this.ctx.fillText(lines[i], el.x + 4, el.y + 4 + i * lineHeight);
  }
}

private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  // Simple word-wrap implementation
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}
```

### Drawing image elements

```ts
private imageCache = new Map<string, HTMLImageElement>();

private drawImageElement(el: Extract<WBElement, { type: 'image' }>) {
  const cached = this.imageCache.get(el.src);
  if (cached && cached.complete) {
    this.ctx.drawImage(cached, el.x, el.y, el.width, el.height);
  } else if (!cached) {
    const img = new Image();
    img.onload = () => {
      // Trigger parent whiteboard re-render
      this.imageCache.set(el.src, img);
      this.onImageLoaded?.();
    };
    img.src = el.src;
    this.imageCache.set(el.src, img);
    // Draw placeholder
    this.ctx.strokeStyle = '#9ca3af';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    this.ctx.strokeRect(el.x, el.y, el.width, el.height);
    this.ctx.setLineDash([]);
  }
}
```

### Update `drawElement` dispatch

```ts
private drawElement(el: WBElement) {
  switch (el.type) {
    case 'path': this.drawPath(el); break;
    case 'rectangle': this.drawRectangle(el); break;
    case 'ellipse': this.drawEllipse(el); break;
    case 'text': this.drawText(el); break;
    case 'image': this.drawImageElement(el); break;
  }
}
```

### Selection highlight for text and image

Add to `drawSelectionHighlight`:

```ts
// For 'text':
bounds = { x: el.x, y: el.y, w: el.width, h: el.height };

// For 'image':
bounds = { x: el.x, y: el.y, w: el.width, h: el.height };
```

### Update `RenderPreview` type

Add `'text'` and `'image'` to the preview union type (though these tools don't drag-preview in the same way; text previews a dotted rectangle, image shows nothing while the file picker is open).

---

## 1.5 History changes — `packages/core/src/history.ts`

### Move command updates

`getPos()` and `setPos()` in `MoveElementsCommand` need cases for `text` and `image`:

```ts
function getPos(el: WBElement): PointLike {
  switch (el.type) {
    case 'path': { const first = el.points[0]; return first ? { x: first.x, y: first.y } : { x: 0, y: 0 }; }
    case 'rectangle': return { x: el.x, y: el.y };
    case 'ellipse': return { x: el.x - el.rx, y: el.y - el.ry };
    case 'text': return { x: el.x, y: el.y };
    case 'image': return { x: el.x, y: el.y };
  }
}

function setPos(el: WBElement, x: number, y: number) {
  switch (el.type) {
    case 'path': { /* translate all points */ break; }
    case 'rectangle': el.x = x; el.y = y; break;
    case 'ellipse': el.x = x + el.rx; el.y = y + el.ry; break;
    case 'text': el.x = x; el.y = y; break;
    case 'image': el.x = x; el.y = y; break;
  }
}
```

### New: `UpdateElementCommand`

For text editing (when the user updates text content or resizes), we need a command that stores before/after snapshots:

```ts
export class UpdateElementCommand implements Command {
  constructor(
    private elements: WBElement[],
    private elementId: string,
    private before: Partial<WBElement>,
    private after: Partial<WBElement>,
  ) {}

  execute() {
    const el = this.elements.find(e => e.id === this.elementId);
    if (el) Object.assign(el, this.after);
  }

  undo() {
    const el = this.elements.find(e => e.id === this.elementId);
    if (el) Object.assign(el, this.before);
  }
}
```

---

## 1.6 Selection/Hit-testing — `packages/core/src/tools.ts`

Update `hitTest()` for text and image:

```ts
if (el.type === 'text' || el.type === 'image') {
  return (
    point.x >= el.x - margin &&
    point.x <= el.x + el.width + margin &&
    point.y >= el.y - margin &&
    point.y <= el.y + el.height + margin
  );
}
```

Update `getElementPos()` and `moveElement()` for the new types (they use the same (x, y) top-left origin as rectangle).

---

## 1.7 Collaboration — `packages/collab/src/provider.ts`

### `getElements()` — add cases:

```ts
if (obj.type === 'text') {
  result.push({
    id: obj.id,
    type: 'text',
    x: obj.x ?? 0,
    y: obj.y ?? 0,
    width: obj.width ?? 200,
    height: obj.height ?? 40,
    text: obj.text ?? '',
    fontSize: obj.fontSize ?? 16,
    fontFamily: obj.fontFamily ?? 'sans-serif',
    fill: obj.fill ?? 'transparent',
    color: obj.color ?? '#1f2937',
    strokeWidth: obj.strokeWidth ?? 1,
  });
}
if (obj.type === 'image') {
  result.push({
    id: obj.id,
    type: 'image',
    x: obj.x ?? 0,
    y: obj.y ?? 0,
    width: obj.width ?? 100,
    height: obj.height ?? 100,
    src: obj.src ?? '',
    naturalWidth: obj.naturalWidth ?? 100,
    naturalHeight: obj.naturalHeight ?? 100,
    color: '',
    strokeWidth: 0,
  });
}
```

### `setElements()` and `addElement()` — add cases:

Map the new element fields to `Y.Map` entries for both `text` and `image` types.

### Image size concern

Data URLs for images can be large (several MB). For the MVP, we cap image uploads at 2 MB and compress client-side before storing. Future enhancement: use a blob storage service and store only URLs in Yjs.

---

## 1.8 Web App — `apps/web/src/`

### `App.tsx` changes

Add tool buttons for text and image:

```tsx
{ type: 'text', label: 'Text', icon: 'T' },
{ type: 'image', label: 'Image', icon: '🖼' },
```

When the text tool is active and `wb.editingElementId` transitions to non-null, render a `TextEditor` overlay.

When the image tool is active, render a hidden `<input type="file">` and trigger its click.

### New component: `TextEditor.tsx`

```tsx
interface TextEditorProps {
  whiteboard: Whiteboard;
  elementId: string;
  viewport: Viewport;
  canvasWidth: number;
  canvasHeight: number;
}
```

- Renders a `<textarea>` (or `contentEditable` div) absolutely positioned at the text element's screen coordinates.
- On mount, focuses the textarea.
- On blur or Ctrl+Enter: commits text via `ctx.updateElement()`, calls `wb.stopEditing()`.
- Auto-resizes the textarea height as the user types.
- Styled to match the canvas-rendered text (same font, size, color).

### New component: `ImageUploader.tsx`

A minimal component that:

1. Renders a hidden `<input type="file" accept="image/*">`.
2. On file selection, reads the file as a data URL.
3. Creates an `Image()` to get `naturalWidth`/`naturalHeight`.
4. Optionally resizes if the image exceeds 2 MB (draw to a canvas at reduced size, re-export as JPEG).
5. Calls the whiteboard's ToolContext `addElement` to place the image.

### Paste handler in `Canvas.tsx`

Add a `paste` event listener on the canvas. When the clipboard contains image data:

```ts
canvas.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      // Read as data URL, create ImageElement at viewport center
    }
  }
});
```

---

## 1.9 `Whiteboard` class changes summary

| Addition | Purpose |
|---|---|
| `editingElementId: string \| null` | Tracks which element is being text-edited |
| `startEditing(id)` | Sets `editingElementId`, calls `onStartEditing` callback |
| `stopEditing()` | Clears `editingElementId` |
| `onStartEditing` option in constructor | Callback for React overlay |
| Paste event listener in `attach()` | Creates image from clipboard |
| `ToolContext` gains `activeColor` property | Text color passthrough |

---

## 1.10 File touch list

| File | Change |
|---|---|
| `packages/core/src/types.ts` | Add `TextElement`, `ImageElement`, update `WBElement` and `ToolType` |
| `packages/core/src/tools.ts` | Add `TextTool`, `ImageTool`; update `createTool`, `hitTest`, `getElementPos`, `moveElement` |
| `packages/core/src/renderer.ts` | Add `drawText`, `drawImageElement`, `wrapText`; add `imageCache` map; update `drawElement`, `drawSelectionHighlight`, `RenderPreview` |
| `packages/core/src/history.ts` | Add `UpdateElementCommand`; update `getPos`/`setPos` for new types |
| `packages/core/src/whiteboard.ts` | Add `editingElementId`, `startEditing`, `stopEditing`, paste handler, `onStartEditing` callback |
| `packages/collab/src/provider.ts` | Handle `text` and `image` in `getElements`, `setElements`, `addElement` |
| `apps/web/src/Canvas.tsx` | Add paste handler, pass `onStartEditing` callback |
| `apps/web/src/App.tsx` | Add text/image tool buttons, `TextEditor` overlay, `ImageUploader` |
| `apps/web/src/TextEditor.tsx` | New file — overlay textarea |
| `apps/web/src/ImageUploader.tsx` | New file — hidden file input with compression |

---

## 1.11 Testing checklist

- [ ] Create text element by clicking canvas; type text; press Escape or click outside to commit
- [ ] Select and drag a text element; undo the move
- [ ] Select and delete a text element; undo the deletion
- [ ] Collaborative: User A creates text, User B sees it in real-time
- [ ] Upload image via toolbar button; image appears at click position
- [ ] Paste image from clipboard (Ctrl+V); image appears at viewport center
- [ ] Large image (>2 MB) is compressed before upload
- [ ] Image loads incrementally: placeholder → loaded image
- [ ] Select and drag an image element
- [ ] Undo/redo works for text content changes
- [ ] Undo/redo works for image additions and deletions