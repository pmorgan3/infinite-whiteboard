# Phase 9: Color System — Presets + Color Wheel

## Overview

Replace the simple `<input type="color">` and the basic `ColorPalette` preset row with a full color system consisting of:

1. **Preset palette** — A curated row of 10 colors covering the full hue spectrum, plus white/black.
2. **Color wheel** — An HSV color wheel for granular, intuitive color selection.
3. **Opacity slider** — An alpha channel slider for semi-transparent elements.
4. **Recent colors** — A row of the last 6 colors the user actually used.

The system is built as standalone components (`ColorWheel`, `ColorPicker`) that can be used in both the desktop tool options and the mobile expanded toolbar.

---

## 9.1 Current State

- `ColorPalette.tsx` renders 8 preset color swatches (`PRESET_COLORS`) with a hidden `<input type="color">` for custom picks.
- Each tool that supports color uses `color` state from `App.tsx`.
- The `BaseElement` type has a `color: string` field.

---

## 9.2 Data Model — `packages/core/src/types.ts`

### Opacity support

Add an `opacity` field to `BaseElement`:

```ts
export interface BaseElement {
  id: string;
  type: string;
  color: string;
  strokeWidth: number;
  opacity?: number;  // 0–1, default 1
}
```

The `opacity` field is optional for backward compatibility — elements without it default to full opacity.

### Renderer changes for opacity

In `packages/core/src/renderer.ts`, apply `globalAlpha` before drawing each element:

```ts
private drawElement(el: WBElement) {
  const prevAlpha = this.ctx.globalAlpha;
  this.ctx.globalAlpha = el.opacity ?? 1;
  // ... existing drawing code ...
  this.ctx.globalAlpha = prevAlpha;
}
```

---

## 9.3 Color Presets — `apps/web/src/presets.ts`

Expand the color presets to include more colors and opacity levels:

```ts
export const COLOR_PRESETS = [
  '#1f2937',  // Gray 800 (near black)
  '#6b7280',  // Gray 500
  '#ef4444',  // Red 500
  '#f97316',  // Orange 500
  '#eab308',  // Yellow 500
  '#22c55e',  // Green 500
  '#06b6d4',  // Cyan 500
  '#3b82f6',  // Blue 500
  '#8b5cf6',  // Violet 500
  '#ec4899',  // Pink 500
  '#ffffff',  // White
  '#000000',  // Black
];
```

---

## 9.4 Color Wheel Component — `apps/web/src/ColorWheel.tsx`

A **circular HSV color wheel** rendered on a `<canvas>` element. The user picks a hue by clicking/dragging around the wheel, and the saturation/brightness is selected in a center square.

### Architecture decision

Implementing a full HSV wheel from scratch is ~200 lines of canvas drawing code. For a realistic MVP, we use a **simpler approach**: a vertical hue strip + a saturation-value gradient square. This is what Excalidraw and most drawing tools use, and it's much more usable on small screens.

### Approach: Hue strip + SV square

```tsx
interface ColorWheelProps {
  color: string;          // current hex color
  onChange: (color: string) => void;
}

export default function ColorWheel({ color, onChange }: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(1);
  const [val, setVal] = useState(0);
  // Convert color ↔ HSV on change...
}
```

**Implementation plan:**

1. **Hue strip** — A 200×20 horizontal bar showing the full rainbow spectrum (0°–360°). Clicking/dragging selects the hue.
2. **SV square** — A 200×200 square below the hue strip. X-axis = saturation (left=0, right=1). Y-axis = value (bottom=0, top=1). Clicking picks saturation + brightness.
3. **HSV ↔ Hex conversion** — Pure utility functions.

### HSV utility — `apps/web/src/color-utils.ts`

```ts
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  // Standard HSV→RGB algorithm
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, s, v];
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

export function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

export function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}
```

### Hue strip rendering

```ts
function drawHueStrip(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  for (let i = 0; i <= 360; i += 30) {
    gradient.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
```

### SV square rendering

```ts
function drawSVSquare(ctx: CanvasRenderingContext2D, hue: number, width: number, height: number) {
  // Left-to-right: white → hue color (saturation)
  const satGradient = ctx.createLinearGradient(0, 0, width, 0);
  satGradient.addColorStop(0, '#ffffff');
  const [r, g, b] = hsvToRgb(hue, 1, 1);
  satGradient.addColorStop(1, rgbToHex(r, g, b));
  ctx.fillStyle = satGradient;
  ctx.fillRect(0, 0, width, height);

  // Top-to-bottom: transparent → black (value)
  const valGradient = ctx.createLinearGradient(0, 0, 0, height);
  valGradient.addColorStop(0, 'transparent');
  valGradient.addColorStop(1, '#000000');
  ctx.fillStyle = valGradient;
  ctx.fillRect(0, 0, width, height);
}
```

---

## 9.5 Opacity Slider — `apps/web/src/OpacitySlider.tsx`

```tsx
interface OpacitySliderProps {
  value: number;  // 0–1
  onChange: (v: number) => void;
}

export default function OpacitySlider({ value, onChange }: OpacitySliderProps) {
  return (
    <div className="opacity-slider-container">
      <label>Opacity</label>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="opacity-slider"
      />
      <span className="opacity-value">{Math.round(value * 100)}%</span>
    </div>
  );
}
```

---

## 9.6 Color Picker Component — `apps/web/src/ColorPicker.tsx`

Combines presets, hue strip, SV square, and opacity into a single panel:

```tsx
interface ColorPickerProps {
  color: string;           // hex
  opacity: number;        // 0–1
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  recentColors: string[];
}

export default function ColorPicker({ color, opacity, onColorChange, onOpacityChange, recentColors }: ColorPickerProps) {
  return (
    <div className="color-picker">
      <ColorWheel color={color} onChange={onColorChange} />
      <OpacitySlider value={opacity} onChange={onOpacityChange} />
      <div className="color-presets">
        {COLOR_PRESETS.map(c => (
          <button
            key={c}
            className={`color-swatch ${color === c ? 'active' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => onColorChange(c)}
          />
        ))}
      </div>
      {recentColors.length > 0 && (
        <div className="recent-colors">
          {recentColors.map(c => (
            <button
              key={c}
              className="color-swatch small"
              style={{ backgroundColor: c }}
              onClick={() => onColorChange(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 9.7 Recent Colors

Track the last 6 unique colors used. Store in React state and persist to localStorage:

```tsx
// In App.tsx:
const [recentColors, setRecentColors] = useState<string[]>(() => {
  const saved = localStorage.getItem('whiteboard-recent-colors');
  return saved ? JSON.parse(saved) : [];
});

const handleColorChange = (newColor: string) => {
  setColor(newColor);
  setRecentColors(prev => {
    const filtered = prev.filter(c => c !== newColor);
    return [newColor, ...filtered].slice(0, 6);
  });
};

useEffect(() => {
  localStorage.setItem('whiteboard-recent-colors', JSON.stringify(recentColors));
}, [recentColors]);
```

---

## 9.8 Opacity in Tool Options

Add an `opacity` prop alongside `color` and `strokeWidth`:

```tsx
// In Toolbar.tsx / App.tsx:
const [opacity, setOpacity] = useState(1);

// Pass to Whiteboard:
wb.setToolOptions({ color, strokeWidth, opacity });
```

In `packages/core/src/whiteboard.ts`, add `toolOpacity`:

```ts
toolOpacity = 1;

setToolOptions(options: { color?: string; strokeWidth?: number; arrowStart?: boolean; arrowEnd?: boolean; opacity?: number }) {
  // ... existing fields ...
  if (options.opacity !== undefined) this.toolOpacity = options.opacity;
}
```

All tools that create elements should include `opacity: this.toolOpacity` in the element they produce.

---

## 9.9 Renderer: Drawing with Opacity

Already covered in §9.2 — `drawElement` sets `ctx.globalAlpha` to `el.opacity ?? 1` before drawing and restores afterward.

The renderer must also handle opacity in:
- `drawPreview` — apply `globalAlpha` to the current tool preview using `this.toolOpacity` (passed via render options)
- `drawSelectionHighlight` — always use `globalAlpha = 1` (selection feedback is always fully visible)
- `drawGrid` — always `globalAlpha = 1`
- Export — `renderForExport` must also respect element opacity

---

## 9.10 Export: Opacity in SVG

In `packages/export/src/svg.ts`, add `opacity` attribute:

```ts
// For each SVG element:
if (el.opacity !== undefined && el.opacity !== 1) {
  attrs.push(`opacity="${el.opacity}"`);
}
```

---

## 9.11 Mobile Layout

On mobile (≤640px), the color picker appears in the expanded tool options. The SV square is scaled down to 180×180px to fit the screen.

```scss
@media (max-width: 640px) {
  .color-picker {
    .sv-square {
      width: 180px;
      height: 180px;
    }
    .hue-strip {
      width: 180px;
    }
  }
}
```

---

## 9.12 File Touch List

| File | Change |
|------|--------|
| `packages/core/src/types.ts` | Add optional `opacity` to `BaseElement` |
| `packages/core/src/renderer.ts` | Apply `globalAlpha` before drawing each element; restore after |
| `packages/core/src/whiteboard.ts` | Add `toolOpacity` field; propagate to tools |
| `packages/core/src/tools.ts` | Include `opacity` in created elements |
| `packages/core/src/index.ts` | No changes (opacity is part of BaseElement) |
| `packages/export/src/svg.ts` | Add `opacity` attribute to SVG elements |
| `packages/export/src/png.ts` | Opacity renders natively via canvas globalAlpha |
| `packages/export/src/json.ts` | Opacity serialized automatically (part of element) |
| `apps/web/src/color-utils.ts` | **New** — HSV/RGB/Hex conversion utilities |
| `apps/web/src/ColorWheel.tsx` | **New** — Hue strip + SV square canvas component |
| `apps/web/src/OpacitySlider.tsx` | **New** — Opacity range slider |
| `apps/web/src/ColorPicker.tsx` | **New** — Combined presets + wheel + opacity panel |
| `apps/web/src/presets.ts` | Add `COLOR_PRESETS` array |
| `apps/web/src/Toolbar.tsx` | Use `ColorPicker` instead of `ColorPalette`; add opacity prop |
| `apps/web/src/App.tsx` | Add `opacity` state; `recentColors` state + localStorage; pass to Toolbar |
| `apps/web/src/App.scss` | Add `.color-picker`, `.color-wheel`, `.hue-strip`, `.sv-square`, `.opacity-slider` styles |
| `apps/web/src/ColorPalette.tsx` | Remove (replaced by ColorPicker) |

---

## 9.13 Unit Tests

### `apps/web/src/color-utils.test.ts`

- `hsvToRgb` / `rgbToHsv` round-trip conversion
- `hexToHsv` / `hsvToHex` round-trip conversion
- Known color values (red, green, blue, white, black)

### `packages/core/src/index.test.ts`

- Elements with `opacity: 0.5` serialize and deserialize correctly
- Elements without `opacity` default to `1`
- Drawing with `globalAlpha` applied

---

## 9.14 Testing Checklist

- [ ] Color preset row shows 12 colors
- [ ] Clicking a preset sets the active color
- [ ] Hue strip: clicking changes hue, cursor indicator shows position
- [ ] SV square: clicking changes saturation and brightness
- [ ] Custom picked color updates hex display
- [ ] Opacity slider: 0% = fully transparent, 100% = fully opaque
- [ ] Drawing with 50% opacity produces semi-transparent strokes
- [ ] Recent colors row updates when a new color is used
- [ ] Recent colors persist to localStorage
- [ ] SVG export includes `opacity` attribute for semi-transparent elements
- [ ] PNG export renders semi-transparent elements correctly
- [ ] JSON export/import round-trips opacity
- [ ] Mobile: color picker fits in expanded toolbar
- [ ] Desktop: color picker appears in tool options sidebar