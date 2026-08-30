# Phase 8: Pencil Sizes

## Overview

Replace the single `strokeWidth` property with a proper **pencil size system** that includes named preset sizes (Thin, Regular, Thick, Heavy) and a continuous range slider. The UI presents size presets as visual dots/lines of varying thickness, plus a custom slider for fine-tuned control. Both desktop and mobile layouts are supported.

---

## 8.1 Current State

- `Whiteboard.toolStrokeWidth` holds a single `number` (1–20).
- The `StrokeWidthSlider` component provides a horizontal `<input type="range">`.
- The desktop toolbar has a vertical range input.
- Each `Tool` receives `strokeWidth` in its `ToolOptions`.

No changes needed to the core data model — `strokeWidth` is already a number. The enhancement is purely UI + preset system.

---

## 8.2 Design: Preset Sizes

### `apps/web/src/presets.ts` (new file)

```ts
export interface SizePreset {
  label: string;
  value: number;
  icon: 'dot' | 'line';  // Visual representation style
}

export const SIZE_PRESETS: SizePreset[] = [
  { label: 'Thin',    value: 1,  icon: 'dot' },
  { label: 'Regular', value: 3,  icon: 'dot' },
  { label: 'Thick',   value: 6,  icon: 'line' },
  { label: 'Heavy',   value: 12, icon: 'line' },
];
```

---

## 8.3 UI Components

### `apps/web/src/SizePicker.tsx` (new file)

Replaces `StrokeWidthSlider` in the tool options. Combines preset buttons with a custom range slider.

```tsx
import { SIZE_PRESETS, type SizePreset } from './presets';

interface SizePickerProps {
  value: number;
  onChange: (v: number) => void;
}

export default function SizePicker({ value, onChange }: SizePickerProps) {
  const isPresetActive = (preset: SizePreset) => value === preset.value;

  return (
    <div className="size-picker">
      <div className="size-presets">
        {SIZE_PRESETS.map(preset => (
          <button
            key={preset.value}
            className={`size-preset ${isPresetActive(preset) ? 'active' : ''}`}
            onClick={() => onChange(preset.value)}
            title={preset.label}
          >
            {preset.icon === 'dot' ? (
              <span
                className="size-dot"
                style={{ width: `${4 + preset.value * 2}px`, height: `${4 + preset.value * 2}px` }}
              />
            ) : (
              <span
                className="size-line"
                style={{ height: `${2 + preset.value}px` }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="size-slider-row">
        <span className="size-label">{value}px</span>
        <input
          type="range"
          min={1}
          max={30}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="size-slider"
        />
      </div>
    </div>
  );
}
```

### Styles — `apps/web/src/App.scss`

Add `.size-picker` styles:

```scss
.size-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.size-presets {
  display: flex;
  gap: 4px;
}

.size-preset {
  width: 36px;
  height: 36px;
  border: 2px solid transparent;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;

  &.active {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  &:hover:not(.active) {
    background: #f3f4f6;
  }
}

.size-dot {
  border-radius: 50%;
  background: #1f2937;
}

.size-line {
  width: 20px;
  background: #1f2937;
  border-radius: 2px;
}

.size-slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-label {
  font-size: 11px;
  color: #6b7280;
  min-width: 28px;
  text-align: right;
}

// Mobile-specific overrides
@media (max-width: 640px) {
  .size-picker {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .size-presets {
    gap: 6px;
  }

  .size-preset {
    width: 40px;
    height: 40px;
  }
}
```

---

## 8.4 Integration with Toolbar

### `apps/web/src/Toolbar.tsx`

Replace the `StrokeWidthSlider` usage with `SizePicker`:

```tsx
import SizePicker from './SizePicker';

// In the tool options section:
{showSizePicker && (
  <SizePicker value={strokeWidth} onChange={onStrokeWidthChange} />
)}
```

The `showSizePicker` visibility logic is the same as `showStrokeSlider` — visible when the expanded tool supports stroke width (draw, rectangle, ellipse, arrow).

---

## 8.5 Integration with Whiteboard Core

No changes needed. `toolStrokeWidth` already accepts any number value. The `DrawTool`, `RectangleTool`, `EllipseTool`, and `ArrowTool` constructors already take `strokeWidth` and use it.

However, we increase the max from 20 to 30 in the slider to accommodate the "Heavy" preset at 12px plus room for custom sizes up to 30.

---

## 8.6 Stroke Width Preview in Cursor

When using the draw tool, show a circle cursor that matches the current stroke width. This gives visual feedback about how thick the line will be.

### `packages/core/src/whiteboard.ts`

Add cursor preview rendering:

```ts
// In the render cycle, after drawing elements, draw a cursor preview if using the draw tool
private renderCursorPreview() {
  if (this.toolType !== 'draw' || !this.cursorWorldPos) return;
  const canvas = this.renderer['canvas'] as HTMLCanvasElement;
  // ... draw a circle at the cursor position matching toolStrokeWidth
}
```

Implementation: track the last pointer position in world coordinates and draw a circle outline on the canvas. This is optional and can be added later.

---

## 8.7 Mobile-Specific Behavior

- On mobile (≤640px), the size picker appears in the expanded tool options row above the toolbar.
- Preset buttons are 40×40px touch targets.
- The slider thumb is 24×24px for easy touch.
- Haptic feedback (`navigator.vibrate(10)`) when switching presets.

---

## 8.8 Stroke Width Persistence

The selected stroke width is currently stored in React state (`strokeWidth`) and persists for the session. To persist across reloads, add to the board state or a user preferences object:

```ts
// In App.tsx:
const [strokeWidth, setStrokeWidth] = useState(() => {
  const saved = localStorage.getItem('whiteboard-stroke-width');
  return saved ? Number(saved) : 3;
});

useEffect(() => {
  localStorage.setItem('whiteboard-stroke-width', String(strokeWidth));
}, [strokeWidth]);
```

---

## 8.9 File Touch List

| File | Change |
|------|--------|
| `apps/web/src/presets.ts` | **New** — SizePreset interface and SIZE_PRESETS array |
| `apps/web/src/SizePicker.tsx` | **New** — Preset buttons + slider component |
| `apps/web/src/Toolbar.tsx` | Replace StrokeWidthSlider with SizePicker |
| `apps/web/src/App.scss` | Add `.size-picker` styles (desktop + mobile) |
| `apps/web/src/App.tsx` | Persist strokeWidth to localStorage (optional) |
| `apps/web/src/StrokeWidthSlider.tsx` | Remove (replaced by SizePicker) |

---

## 8.10 Testing Checklist

- [ ] Preset "Thin" sets strokeWidth to 1
- [ ] Preset "Regular" sets strokeWidth to 3
- [ ] Preset "Thick" sets strokeWidth to 6
- [ ] Preset "Heavy" sets strokeWidth to 12
- [ ] Custom slider changes strokeWidth continuously (1–30)
- [ ] Active preset is visually highlighted
- [ ] Size picker appears in expanded toolbar for draw/rect/ellipse/arrow tools
- [ ] Size picker hidden for pan/select/text tools
- [ ] Mobile: 40×40px touch targets for presets
- [ ] Mobile: 24px slider thumb
- [ ] Drawing with Thin produces thin lines; Heavy produces thick lines
- [ ] StrokeWidth persisted to localStorage
- [ ] StrokeWidthSlider.tsx removed and not imported anywhere