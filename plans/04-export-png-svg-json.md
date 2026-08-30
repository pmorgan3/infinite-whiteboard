# Phase 4: Export (PNG, SVG, JSON)

## Overview

Implement export functionality allowing users to save the whiteboard content as **PNG** (rasterized), **SVG** (vector), or **JSON** (data serialization). This is implemented in `@whiteboard/export` and exposed via the web app UI.

---

## 4.1 Export Package Architecture

The `@whiteboard/export` package currently contains only `export const VERSION = '0.0.1'`. It needs to be built out with three export formats.

### `packages/export/src/index.ts`

```ts
export { exportToPng } from './png';
export { exportToSvg } from './svg';
export { exportToJson, importFromJson } from './json';
export type { ExportOptions, JsonExport } from './types';
```

### `packages/export/src/types.ts` (new file)

```ts
import type { WBElement, ViewportState } from '@whiteboard/core';

export interface ExportOptions {
  background: string;         // background color, default '#ffffff'
  padding: number;           // padding around content in pixels, default 40
  scale: number;             // resolution multiplier for PNG, default 2
  viewport?: ViewportState; // if omitted, auto-fit to content bounds
}

export interface JsonExport {
  version: string;
  elements: WBElement[];
  viewport: ViewportState;
  exportedAt: string;        // ISO timestamp
}
```

---

## 4.2 PNG Export — `packages/export/src/png.ts`

### Approach

PNG export works by creating an off-screen canvas, rendering all elements onto it, and calling `canvas.toBlob()` or `canvas.toDataURL()`.

### Challenge: Canvas rendering dependency

The `Renderer` class in `@whiteboard/core` is tightly coupled to a real `<canvas>` element. For export, we need to either:

1. **Create an off-screen canvas** in a browser environment and use `Renderer.render()` directly.
2. **Factor out the drawing logic** into a canvas-agnostic module that can draw to any `CanvasRenderingContext2D`.

**Decision: Option 1.** PNG export only runs in the browser (not server-side). We create an off-screen canvas, instantiate a new `Renderer` pointing to it, and call `render()` with a viewport that auto-fits the content.

### Implementation

```ts
import { Renderer, Viewport } from '@whiteboard/core';
import type { WBElement, ViewportState } from '@whiteboard/core';
import type { ExportOptions } from './types';
import { computeBounds } from './bounds';

export async function exportToPng(
  elements: WBElement[],
  options: Partial<ExportOptions> = {},
): Promise<Blob> {
  const opts: ExportOptions = {
    background: options.background ?? '#ffffff',
    padding: options.padding ?? 40,
    scale: options.scale ?? 2,
    viewport: options.viewport,
  };

  const bounds = computeBounds(elements);
  if (!bounds) {
    // Empty canvas — export a blank image
    const canvas = document.createElement('canvas');
    canvas.width = 100 * opts.scale;
    canvas.height = 100 * opts.scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas);
  }

  const contentWidth = (bounds.maxX - bounds.minX) + opts.padding * 2;
  const contentHeight = (bounds.maxY - bounds.minY) + opts.padding * 2;
  const canvasWidth = contentWidth * opts.scale;
  const canvasHeight = contentHeight * opts.scale;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.width = `${contentWidth}px`;
  canvas.style.height = `${contentHeight}px`;

  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Set up viewport to center content
  const viewport = new Viewport(opts.viewport ?? {
    x: 0,
    y: 0,
    zoom: 1,
  });

  // If no viewport provided, compute one that fits all content
  if (!opts.viewport) {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    viewport.x = -centerX * opts.scale;
    viewport.y = -centerY * opts.scale;
    viewport.zoom = opts.scale;
  }

  const renderer = new Renderer(canvas);
  renderer.render(viewport, elements, new Set());

  return canvasToBlob(canvas);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create PNG blob'));
    }, 'image/png');
  });
}
```

---

## 4.3 SVG Export — `packages/export/src/svg.ts`

### Approach

SVG export constructs an SVG string by converting each element type to its SVG equivalent. No canvas needed. This could also run server-side if needed.

### Implementation

```ts
import type { WBElement } from '@whiteboard/core';
import type { ExportOptions } from './types';
import { computeBounds } from './bounds';

export function exportToSvg(
  elements: WBElement[],
  options: Partial<ExportOptions> = {},
): string {
  const opts: ExportOptions = {
    background: options.background ?? '#ffffff',
    padding: options.padding ?? 40,
    scale: options.scale ?? 1,
    viewport: options.viewport,
  };

  const bounds = computeBounds(elements);

  // Default dimensions for empty canvas
  const minX = bounds?.minX ?? 0;
  const minY = bounds?.minY ?? 0;
  const maxX = bounds?.maxX ?? 100;
  const maxY = bounds?.maxY ?? 100;

  const width = (maxX - minX) + opts.padding * 2;
  const height = (maxY - minY) + opts.padding * 2;

  const offsetX = -minX + opts.padding;
  const offsetY = -minY + opts.padding;

  const lines: string[] = [];

  // SVG header
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);

  // Background
  lines.push(`  <rect width="${width}" height="${height}" fill="${opts.background}" />`);

  // Group with transform to offset content
  lines.push(`  <g transform="translate(${offsetX}, ${offsetY})">`);

  for (const el of elements) {
    lines.push('    ' + elementToSvg(el));
  }

  lines.push('  </g>');
  lines.push('</svg>');

  return lines.join('\n');
}

function elementToSvg(el: WBElement): string {
  switch (el.type) {
    case 'path':
      return pathToSvg(el);
    case 'rectangle':
      return rectToSvg(el);
    case 'ellipse':
      return ellipseToSvg(el);
    case 'text':
      return textToSvg(el);
    case 'image':
      return imageToSvg(el);
    case 'arrow':
      return arrowToSvg(el);
  }
}

function pathToSvg(el: Extract<WBElement, { type: 'path' }>): string {
  const d = el.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
  return `<path d="${d}" stroke="${el.color}" stroke-width="${el.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
}

function rectToSvg(el: Extract<WBElement, { type: 'rectangle' }>): string {
  return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" stroke="${el.color}" stroke-width="${el.strokeWidth}" fill="none" />`;
}

function ellipseToSvg(el: Extract<WBElement, { type: 'ellipse' }>): string {
  return `<ellipse cx="${el.x}" cy="${el.y}" rx="${el.rx}" ry="${el.ry}" stroke="${el.color}" stroke-width="${el.strokeWidth}" fill="none" />`;
}

function textToSvg(el: Extract<WBElement, { type: 'text' }>): string {
  // SVG <text> with word-wrapping using <tspan>
  const lines = el.text.split('\n');
  const lineHeight = el.fontSize * 1.3;
  const tspans = lines
    .map((line, i) => `<tspan x="${el.x + 4}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  return `<text x="${el.x}" y="${el.y + el.fontSize}" font-size="${el.fontSize}" font-family="${el.fontFamily}" fill="${el.color}">${tspans}</text>`;
}

function imageToSvg(el: Extract<WBElement, { type: 'image' }>): string {
  return `<image x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" href="${el.src}" />`;
}

function arrowToSvg(el: Extract<WBElement, { type: 'arrow' }>): string {
  const parts: string[] = [];
  parts.push(`<line x1="${el.startX}" y1="${el.startY}" x2="${el.endX}" y2="${el.endY}" stroke="${el.color}" stroke-width="${el.strokeWidth}" stroke-linecap="round" />`);

  if (el.endArrowhead) {
    parts.push(arrowheadSvg(el.startX, el.startY, el.endX, el.endY, el.color));
  }
  if (el.startArrowhead) {
    parts.push(arrowheadSvg(el.endX, el.endY, el.startX, el.startY, el.color));
  }
  return parts.join('\n    ');
}

function arrowheadSvg(fromX: number, fromY: number, toX: number, toY: number, color: string): string {
  const headLength = 10;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const p1x = toX - headLength * Math.cos(angle - Math.PI / 6);
  const p1y = toY - headLength * Math.sin(angle - Math.PI / 6);
  const p2x = toX - headLength * Math.cos(angle + Math.PI / 6);
  const p2y = toY - headLength * Math.sin(angle + Math.PI / 6);
  return `<polygon points="${toX},${toY} ${p1x},${p1y} ${p2x},${p2y}" fill="${color}" />`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

---

## 4.4 JSON Export — `packages/export/src/json.ts`

### Serialization format

```ts
import type { WBElement, ViewportState } from '@whiteboard/core';
import type { JsonExport, ExportOptions } from './types';

export function exportToJson(
  elements: WBElement[],
  viewport: ViewportState,
): JsonExport {
  return {
    version: '0.0.1',
    elements: structuredClone(elements),  // deep clone to detach references
    viewport: { ...viewport },
    exportedAt: new Date().toISOString(),
  };
}

export function importFromJson(json: string): JsonExport {
  const data = JSON.parse(json);
  // Basic validation
  if (!data.version || !Array.isArray(data.elements)) {
    throw new Error('Invalid whiteboard JSON: missing version or elements');
  }
  return data as JsonExport;
}
```

### File download helpers

The web app needs to trigger file downloads. Add a utility:

```ts
// apps/web/src/download.ts
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadString(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}
```

---

## 4.5 Bounds Computation — `packages/export/src/bounds.ts`

Shared utility for computing the bounding box of all elements (used by both PNG and SVG export):

```ts
import type { WBElement } from '@whiteboard/core';

export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computeBounds(elements: WBElement[]): ContentBounds | null {
  if (elements.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of elements) {
    const bounds = getElementBounds(el);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  return { minX, minY, maxX, maxY };
}

function getElementBounds(el: WBElement): { minX: number; minY: number; maxX: number; maxY: number } {
  const pad = el.strokeWidth ?? 0;
  switch (el.type) {
    case 'path': {
      const xs = el.points.map(p => p.x);
      const ys = el.points.map(p => p.y);
      return {
        minX: Math.min(...xs) - pad,
        minY: Math.min(...ys) - pad,
        maxX: Math.max(...xs) + pad,
        maxY: Math.max(...ys) + pad,
      };
    }
    case 'rectangle':
      return { minX: el.x - pad, minY: el.y - pad, maxX: el.x + el.width + pad, maxY: el.y + el.height + pad };
    case 'ellipse':
      return { minX: el.x - el.rx - pad, minY: el.y - el.ry - pad, maxX: el.x + el.rx + pad, maxY: el.y + el.ry + pad };
    case 'text':
      return { minX: el.x - pad, minY: el.y - pad, maxX: el.x + el.width + pad, maxY: el.y + el.height + pad };
    case 'image':
      return { minX: el.x - pad, minY: el.y - pad, maxX: el.x + el.width + pad, maxY: el.y + el.height + pad };
    case 'arrow':
      return {
        minX: Math.min(el.startX, el.endX) - pad,
        minY: Math.min(el.startY, el.endY) - pad,
        maxX: Math.max(el.startX, el.endX) + pad,
        maxY: Math.max(el.startY, el.endY) + pad,
      };
  }
}
```

---

## 4.6 Renderer Refactor for Export

The `Renderer` class currently creates the canvas context in its constructor. For PNG export, we need to create an off-screen canvas and use the `Renderer` to draw on it. The constructor already accepts a `canvas` argument, so this works.

**However**, the `Renderer.render()` method currently calls `resize()` which reads `canvas.clientWidth`/`clientHeight`. For off-screen canvases, these are 0. We need to handle this:

### Option A: Set canvas dimensions before export

Set `canvas.width`, `canvas.height`, `canvas.style.width`, and `canvas.style.height` before passing to `Renderer`. The `resize()` method in `Renderer` uses `getBoundingClientRect()`, which for off-screen canvases returns 0.

### Option B: Add an export-specific render path

Add a `renderForExport()` method that takes explicit width/height:

```ts
renderForExport(
  elements: WBElement[],
  bounds: ContentBounds,
  options: ExportOptions,
): HTMLCanvasElement {
  const width = (bounds.maxX - bounds.minX) + options.padding * 2;
  const height = (bounds.maxY - bounds.minY) + options.padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * options.scale;
  canvas.height = height * options.scale;

  const ctx = canvas.getContext('2d')!;
  const dpr = options.scale;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, width, height);

  // Translate to fit content
  const viewport = new Viewport();
  // ... compute viewport offset to center content ...

  ctx.save();
  ctx.translate(width / 2 + viewport.x, height / 2 + viewport.y);
  ctx.scale(1, 1); // No zoom for export; content is at 1:1 scale

  // Draw elements directly
  for (const el of elements) {
    this.drawElement(el);
  }

  ctx.restore();
  return canvas;
}
```

**Decision: Option B** is cleaner. The `Renderer` class gets a new method that doesn't depend on `clientWidth`/`clientHeight`. It renders directly to a provided context with explicit dimensions.

### Changes to Renderer

```ts
// New method that doesn't use the internal canvas dimensions
exportToCanvas(
  canvas: HTMLCanvasElement,
  elements: WBElement[],
  viewport: Viewport,
  options: { width: number; height: number; background: string; dpr: number },
) {
  canvas.width = options.width * options.dpr;
  canvas.height = options.height * options.dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(options.dpr, options.dpr);

  // Background
  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, options.width, options.height);

  // Transform
  ctx.save();
  ctx.translate(options.width / 2 + viewport.x, options.height / 2 + viewport.y);
  ctx.scale(viewport.zoom, viewport.zoom);

  // Draw grid (optional — off by default for export)
  // this.drawGrid(viewport, options.width, options.height);

  // Draw elements
  for (const el of elements) {
    this.drawElement(el);
  }

  ctx.restore();
}
```

Make `drawElement`, `drawPath`, etc. accessible (they're currently private). Either make them `public` or create a separate `drawElements(ctx, elements)` method.

**Decision: Extract drawing into standalone functions** that take a `CanvasRenderingContext2D` parameter. This makes them testable and reusable for both live rendering and export.

```ts
// packages/core/src/draw.ts (new file)
export function drawElement(ctx: CanvasRenderingContext2D, el: WBElement) { ... }
export function drawPath(ctx: CanvasRenderingContext2D, el: PathElement) { ... }
export function drawRectangle(ctx: CanvasRenderingContext2D, el: RectangleElement) { ... }
// etc.
```

The `Renderer` class calls these functions, and the export package also calls them.

---

## 4.7 Web App UI — Export Panel

### `apps/web/src/App.tsx` additions

Add an export button/menu to the toolbar:

```tsx
const [showExport, setShowExport] = useState(false);

// In JSX:
<button
  className="export-toggle"
  onClick={() => setShowExport(s => !s)}
  title="Export"
>
  💾
</button>

{showExport && (
  <div className="export-panel">
    <h3>Export</h3>
    <button onClick={handleExportPng}>Export as PNG</button>
    <button onClick={handleExportSvg}>Export as SVG</button>
    <button onClick={handleExportJson}>Export as JSON</button>
    <button onClick={handleImportJson}>Import from JSON</button>
  </div>
)}
```

### Export handlers

```tsx
import { exportToPng, exportToSvg, exportToJson, importFromJson } from '@whiteboard/export';
import { downloadBlob, downloadString } from './download';

function handleExportPng() {
  const wb = wbRef.current;
  if (!wb) return;
  exportToPng(wb.elements, { scale: 2 }).then(blob => {
    downloadBlob(blob, 'whiteboard.png');
  });
}

function handleExportSvg() {
  const wb = wbRef.current;
  if (!wb) return;
  const svg = exportToSvg(wb.elements, { background: '#ffffff' });
  downloadString(svg, 'whiteboard.svg', 'image/svg+xml');
}

function handleExportJson() {
  const wb = wbRef.current;
  if (!wb) return;
  const json = exportToJson(wb.elements, wb.viewport.toState());
  const str = JSON.stringify(json, null, 2);
  downloadString(str, 'whiteboard.json', 'application/json');
}

function handleImportJson() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = importFromJson(reader.result as string);
        wb.elements = data.elements;
        wb.viewport = new Viewport(data.viewport);
        wb.scheduleRender();
      } catch (e) {
        alert('Invalid file format');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
```

### Image element handling in PNG export

The `Renderer` already caches `HTMLImageElement` objects. For export, images in the off-screen canvas need to be loaded before rendering. The `exportToPng` function must:

1. Pre-load all `ImageElement.src` data URLs into `HTMLImageElement` objects.
2. Wait for all `onload` events.
3. Then render.

```ts
async function preloadImages(elements: WBElement[]): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>();
  const imageElements = elements.filter((el): el is ImageElement => el.type === 'image');
  await Promise.all(imageElements.map(el => new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => { images.set(el.src, img); resolve(); };
    img.onerror = () => resolve(); // skip broken images
    img.src = el.src;
  })));
  return images;
}
```

---

## 4.8 `@whiteboard/export` package configuration

### New dependency on `@whiteboard/core`

`packages/export/package.json` already lists `@whiteboard/core` as unused. Now it needs it:

```json
{
  "dependencies": {
    "@whiteboard/core": "workspace:*"
  }
}
```

### New source files

```
packages/export/src/
  index.ts       (barrel export)
  types.ts       (ExportOptions, JsonExport)
  png.ts         (exportToPng)
  svg.ts         (exportToSvg)
  json.ts        (exportToJson, importFromJson)
  bounds.ts      (computeBounds, ContentBounds)
```

---

## 4.9 File touch list

| File | Change |
|---|---|
| `packages/export/src/index.ts` | Re-export from new modules |
| `packages/export/src/types.ts` | **New** — ExportOptions, JsonExport |
| `packages/export/src/png.ts` | **New** — exportToPng |
| `packages/export/src/svg.ts` | **New** — exportToSvg |
| `packages/export/src/json.ts` | **New** — exportToJson, importFromJson |
| `packages/export/src/bounds.ts` | **New** — computeBounds |
| `packages/export/package.json` | Add `@whiteboard/core` dependency |
| `packages/core/src/renderer.ts` | Refactor: extract draw functions, add `exportToCanvas` method |
| `packages/core/src/draw.ts` | **New** — standalone drawing functions (or keep private and add `exportToCanvas`) |
| `packages/core/src/index.ts` | Export new types/functions if drawing is extracted |
| `apps/web/src/App.tsx` | Add export panel with PNG/SVG/JSON buttons |
| `apps/web/src/App.scss` | Style export panel |
| `apps/web/src/download.ts` | **New** — download helpers |

---

## 4.10 Testing checklist

- [ ] Export to PNG: empty canvas produces a blank white image
- [ ] Export to PNG: canvas with freehand paths produces correct image
- [ ] Export to PNG: canvas with rectangles, ellipses, arrows renders correctly
- [ ] Export to PNG: scale=2 produces a retina-resolution image
- [ ] Export to PNG: custom background color renders correctly
- [ ] Export to PNG: images embedded as data URLs render in the export
- [ ] Export to SVG: all element types render correctly
- [ ] Export to SVG: SVG file is valid XML and opens in browsers/vector tools
- [ ] Export to SVG: text elements render with correct font and wrapping
- [ ] Export to JSON: round-trip (export + import) preserves all elements and positions
- [ ] Import from invalid JSON shows an error message
- [ ] Import sets viewport to saved state
- [ ] Download filenames are correct (whiteboard.png, whiteboard.svg, whiteboard.json)
- [ ] Export panel UI opens/closes correctly
- [ ] Large canvases (many elements) export without hanging