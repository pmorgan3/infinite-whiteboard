# Phase 5: Mobile-Optimized Bottom-Sheet Toolbar

## Overview

Redesign the toolbar and controls for touch-first mobile usage. The current desktop-oriented side toolbar becomes a **bottom sheet** on small screens (width ≤ 640px), with larger touch targets, swipe-to-expand panels, and gesture-based tool switching. The desktop layout remains unchanged.

---

## 5.1 Current State Analysis

The existing toolbar (`apps/web/src/App.scss`) already has a `@media (max-width: 640px)` breakpoint that flips the toolbar from vertical (left side) to horizontal (bottom). However, it has several mobile UX problems:

1. **Touch targets too small**: 40×40px buttons are below the recommended 44×44px minimum.
2. **Color picker**: The native `<input type="color">` is tiny and hard to use on mobile.
3. **Stroke width slider**: The vertical range input is unusable on mobile.
4. **Collaboration panel**: Overlaps content and has no swipe gesture.
5. **Shortcuts bar**: Hidden on mobile (correct), but no replacement hints.
6. **No haptic feedback**: No vibration on tool switch or actions.
7. **No gesture support**: No pinch-to-zoom conflict resolution with page scroll; no two-finger pan.

---

## 5.2 Design Decisions

### Bottom sheet vs. fixed bottom bar

**Decision: Fixed bottom bar (default) with expandable sheet for options.**

Rationale: A full bottom sheet requires a drag gesture that conflicts with canvas panning. Instead:

- **Default state**: Fixed bottom bar showing tool icons.
- **Expanded state**: Tapping a tool icon expands a secondary options row (color, stroke width, arrowheads) above the bar. Tapping elsewhere or selecting a different tool collapses it.

### Touch target sizes

All interactive elements must be at least **44×44px** (WCAG 2.5.5 / Apple HIG). Increase button sizes to **48×48px** for comfort.

---

## 5.3 Component Architecture

### `apps/web/src/Toolbar.tsx` (new file)

Extract toolbar logic from `App.tsx` into a separate component with responsive behavior:

```tsx
interface ToolbarProps {
  tool: ToolType;
  onToolChange: (tool: ToolType) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  arrowStart: boolean;
  arrowEnd: boolean;
  onArrowStartChange: (v: boolean) => void;
  onArrowEndChange: (v: boolean) => void;
  isMobile: boolean;
}
```

### `apps/web/src/BottomSheet.tsx` (new file)

For collaboration panel and export panel on mobile:

```tsx
interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}
```

Behavior:
- Slides up from the bottom.
- Has a drag handle (22×4px rounded bar at the top).
- Can be dismissed by swiping down or tapping the backdrop.
- Uses `touch-action: none` on the sheet to prevent scroll-through.

---

## 5.4 Mobile Toolbar — Layout

### Default state (collapsed)

```
┌──────────────────────────────────────────────┐
│                                              │
│              Canvas area                     │
│                                              │
│                                              │
├──────────────────────────────────────────────┤
│  🖐  ↖  ✏️  ▭  ⬭  →  T  🖼               │
│ Pan Sel Draw Rect Elli Arrow Text Image      │
└──────────────────────────────────────────────┘
```

Touch targets: 48×48px with 4px gaps. Horizontal scroll if needed on very narrow screens.

### Expanded state (tool options visible)

When a tool is tapped, its options appear in a row above the toolbar:

```
┌──────────────────────────────────────────────┐
│  Color: [■] [■] [■] [■] [■]  Width: ====   │
├──────────────────────────────────────────────┤
│  🖐* ↖  ✏️  ▭  ⬭  →  T  🖼               │
│ Pan Sel Draw Rect Elli Arrow Text Image      │
└──────────────────────────────────────────────┘
```

The active tool has a highlighted state. Tool options are context-dependent:
- **Draw, Rectangle, Ellipse, Arrow**: Color row + stroke width slider.
- **Arrow**: Extra toggles for start/end arrowheads.
- **Text**: Font size selector.
- **Select**: No options (or a "delete" button for selected items).

---

## 5.5 Mobile-Specific Interactions

### Color picker — preset palette

Replace native `<input type="color">` on mobile with a **preset color palette** plus a "Custom" button that opens the native picker.

```tsx
const PRESET_COLORS = [
  '#1f2937', // gray-800
  '#ef4444', // red-500
  '#f59e0b', // amber-500
  '#22c55e', // green-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#ffffff', // white (with border)
];
```

Layout: horizontal row of 32×32px circles with a check mark on the active color. Last circle is a "+" that opens `<input type="color">`.

### Stroke width — mobile-friendly slider

Replace the vertical range input with a **horizontal slider** above the toolbar. Use a wider thumb (24×24px) for easy touch control.

```css
.stroke-slider-mobile {
  width: 100%;
  height: 24px;
  appearance: none;
  background: linear-gradient(to right, #d1d5db, #1f2937);
  border-radius: 12px;
}

.stroke-slider-mobile::-webkit-slider-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #3b82f6;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
```

### Long-press for tool options

On mobile, **long-pressing** a tool icon opens its options panel. A quick tap simply selects the tool. This mimics the UX of drawing apps like Procreate.

Implementation:
- `onTouchStart`: Start a 500ms timer.
- `onTouchEnd` (before timer): Select tool (short tap).
- Timer fires: Expand options panel (long press).
- `onTouchMove`: Cancel timer (user is scrolling/dragging).

---

## 5.6 Gesture Handling

### Two-finger pan and pinch-to-zoom

The current implementation uses `wheel` events for zoom. On mobile, we need `touch` events:

1. **Single finger**: Drawing/selecting (current behavior via pointer events).
2. **Two-finger pan**: Pan the viewport.
3. **Pinch-to-zoom**: Scale the viewport, keeping the midpoint between fingers as the zoom center.

Implementation in `Whiteboard` class:

```ts
private touchStartIds: number[] = [];
private touchStartDist: number | null = null;
private touchStartZoom: number = 1;

private onTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    e.preventDefault();
    this.touchStartIds = [e.touches[0].identifier, e.touches[1].identifier];
    this.touchStartDist = this.getTouchDistance(e.touches[0], e.touches[1]);
    this.touchStartZoom = this.viewport.zoom;
  }
}

private onTouchMove(e: TouchEvent) {
  if (e.touches.length === 2 && this.touchStartDist !== null) {
    e.preventDefault();
    const dist = this.getTouchDistance(e.touches[0], e.touches[1]);
    const scale = dist / this.touchStartDist;
    const newZoom = Math.max(0.05, Math.min(10, this.touchStartZoom * scale));

    // Zoom toward midpoint
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    // ... adjust viewport.x, viewport.y, viewport.zoom ...

    this.viewport.zoom = newZoom;
    this.scheduleRender();
  }
}

private getTouchDistance(t1: Touch, t2: Touch): number {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}
```

**Important: Canvas must have `touch-action: none`** to prevent browser default gestures (scroll, zoom). The existing `touchAction: 'none'` style on the canvas element handles this.

### Double-tap to reset zoom

On double-tap, reset viewport to center (0, 0) with zoom 1.0:

```ts
private lastTapTime = 0;

private onTouchEnd(e: TouchEvent) {
  const now = Date.now();
  if (now - this.lastTapTime < 300 && e.touches.length === 0) {
    // Double tap
    this.viewport.x = 0;
    this.viewport.y = 0;
    this.viewport.zoom = 1;
    this.scheduleRender();
  }
  this.lastTapTime = now;
  this.touchStartDist = null;
}
```

---

## 5.7 Toolbar Responsive Styles — `apps/web/src/App.scss`

### Desktop (width > 640px) — unchanged

The current left-side vertical toolbar stays as-is.

### Mobile (width ≤ 640px) — new styles

```scss
@media (max-width: 640px) {
  .toolbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    transform: none;
    flex-direction: row;
    justify-content: space-around;
    padding: 8px 4px 20px 4px; // 20px bottom safe area for iPhone notch
    padding-bottom: calc(20px + env(safe-area-inset-bottom));
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;

    button {
      width: 48px;
      height: 48px;
      font-size: 22px;
      flex-shrink: 0;
    }

    .divider {
      width: 1px;
      height: 32px;
      margin: 0 4px;
    }

    input[type="color"] {
      display: none; // Hidden on mobile; replaced by color palette
    }

    input[type="range"] {
      display: none; // Hidden on mobile; replaced by horizontal slider
    }
  }

  .tool-options {
    position: fixed;
    bottom: 88px; // above the toolbar (48px button + padding)
    left: 8px;
    right: 8px;
    background: rgba(255, 255, 255, 0.98);
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 11;

    .color-palette {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;

      .color-swatch {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;

        &.active {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
        }
      }
    }

    .stroke-slider {
      flex: 1;
      height: 24px;
      appearance: none;
      // ... styled range input ...
    }
  }

  .collab-toggle {
    top: 12px;
    right: 12px;
    width: 48px;
    height: 48px;
  }

  .collab-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    width: 100%;
    max-height: 60vh;
    border-radius: 16px 16px 0 0;
    transform: translateY(100%);
    transition: transform 0.3s ease;

    &.open {
      transform: translateY(0);
    }
  }

  .shortcuts {
    display: none;
  }
}
```

### Safe area insets

For iPhone X+ and other notched devices:

```scss
.app {
  padding-bottom: env(safe-area-inset-bottom);
}

.toolbar {
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
}
```

Add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` to `index.html`.

---

## 5.8 Component Refactor — `apps/web/src/App.tsx`

### Extract `Toolbar` component

Move toolbar logic into `Toolbar.tsx`:

```tsx
export default function Toolbar({ tool, onToolChange, color, onColorChange, strokeWidth, onStrokeWidthChange, arrowStart, arrowEnd, onArrowStartChange, onArrowEndChange }: ToolbarProps) {
  const [expanded, setExpanded] = useState<ToolType | null>(null);
  const isMobile = useMediaQuery('(max-width: 640px)');

  const tools = [/* ... */];

  return (
    <div className="toolbar" role="toolbar" aria-label="Drawing tools">
      {tools.map(t => (
        <button
          key={t.type}
          className={tool === t.type ? 'active' : ''}
          onClick={() => onToolChange(t.type)}
          onContextMenu={(e) => { e.preventDefault(); setExpanded(t.type); }}
          aria-pressed={tool === t.type}
          aria-label={t.label}
        >
          {t.icon}
        </button>
      ))}
      <div className="divider" />
      {/* Desktop-only: color picker and range input */}
      {/* Mobile: shown in expanded options panel */}
      {expanded && (
        <div className="tool-options">
          <ColorPalette selected={color} onSelect={onColorChange} />
          <StrokeWidthSlider value={strokeWidth} onChange={onStrokeWidthChange} />
          {expanded === 'arrow' && (
            <>
              <Toggle label="Start ↗" value={arrowStart} onChange={onArrowStartChange} />
              <Toggle label="End ↗" value={arrowEnd} onChange={onArrowEndChange} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

### New hooks

```tsx
// apps/web/src/useMediaQuery.ts
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
```

### New sub-components

- `ColorPalette.tsx`: Circle swatches + custom picker button
- `StrokeWidthSlider.tsx`: Styled range input
- `Toggle.tsx`: Simple boolean toggle button

These are small, reusable components that could live in `@whiteboard/ui` if needed.

---

## 5.9 Touch Event Handling in `Whiteboard`

### Add touch listeners to `Whiteboard.attach()`

```ts
private onTouchStartBind: (e: TouchEvent) => void;
private onTouchMoveBind: (e: TouchEvent) => void;
private onTouchEndBind: (e: TouchEvent) => void;

// In constructor:
this.onTouchStartBind = this.onTouchStart.bind(this);
this.onTouchMoveBind = this.onTouchMove.bind(this);
this.onTouchEndBind = this.onTouchEnd.bind(this);

// In attach():
canvas.addEventListener('touchstart', this.onTouchStartBind, { passive: false });
canvas.addEventListener('touchmove', this.onTouchMoveBind, { passive: false });
canvas.addEventListener('touchend', this.onTouchEndBind, { passive: false });
```

### Prevent default on two-finger gestures

Two-finger pan and pinch-to-zoom must call `e.preventDefault()` to prevent browser scrolling and zooming. This requires `{ passive: false }` on the event listener.

---

## 5.10 Pointer Event Compatibility

Current implementation uses `pointerdown`, `pointermove`, `pointerup` events. On mobile:
- **Single touch**: Fires as pointer events (works as-is).
- **Two-finger touch**: Fires pointer events for each finger. The `pointerType` is `"touch"`.

The existing `onPointerDown` handler in each Tool should check `e.pointerType === 'touch'` and adjust behavior:
- For drawing tools, the first touch draws. A second touch cancels the current stroke and initiates pan.
- This requires the `Whiteboard` class to track active pointer count and switch modes.

### Simplified approach for MVP

- First pointer (finger 1): Normal tool behavior (draw, select, etc.).
- Second pointer (finger 2): Switch to pan mode for the duration of the two-finger gesture.
- When second finger lifts: Resume previous tool behavior.

```ts
private pointerCount = 0;
private savedToolType: ToolType | null = null;

onPointerDown(e: PointerEvent) {
  this.pointerCount++;
  if (this.pointerCount >= 2) {
    // Save current tool and switch to pan
    if (!this.savedToolType) {
      this.savedToolType = this.toolType;
    }
    this.activeTool = createTool('pan', { color: this.toolColor, strokeWidth: this.toolStrokeWidth });
    return;
  }
  // Normal tool handling...
}

onPointerUp(e: PointerEvent) {
  this.pointerCount = Math.max(0, this.pointerCount - 1);
  if (this.pointerCount < 2 && this.savedToolType) {
    // Restore previous tool
    this.activeTool = createTool(this.savedToolType, { color: this.toolColor, strokeWidth: this.toolStrokeWidth });
    this.savedToolType = null;
  }
}
```

---

## 5.11 Haptic Feedback (optional, nice-to-have)

On mobile, trigger a short vibration when switching tools:

```ts
if (navigator.vibrate) {
  navigator.vibrate(10); // 10ms vibration
}
```

Add this to the tool change handler in `App.tsx` or `Toolbar.tsx`.

---

## 5.12 Viewport Meta Tag

Update `apps/web/index.html`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

This prevents the browser from zooming the page on double-tap and ensures the viewport doesn't scale. Pinch-to-zoom is handled within the canvas JavaScript, not by the browser.

---

## 5.13 PWA Considerations (stretch goal, not Phase 5)

For future mobile deployment:
- Add a `manifest.json` for "Add to Home Screen".
- Add a service worker for offline support (levaraging Yjs local persistence).
- This is noted for future phases but **not included in Phase 5**.

---

## 5.14 File touch list

| File | Change |
|---|---|
| `apps/web/src/Toolbar.tsx` | **New** — Extracted toolbar component with mobile/desktop layouts |
| `apps/web/src/BottomSheet.tsx` | **New** — Swipeable bottom sheet component |
| `apps/web/src/ColorPalette.tsx` | **New** — Color swatch palette component |
| `apps/web/src/StrokeWidthSlider.tsx` | **New** — Styled stroke width slider |
| `apps/web/src/Toggle.tsx` | **New** — Boolean toggle button |
| `apps/web/src/useMediaQuery.ts` | **New** — Responsive hook |
| `apps/web/src/App.tsx` | Refactor: extract toolbar to `Toolbar.tsx`; add mobile state management; add export panel |
| `apps/web/src/App.scss` | Major mobile redesign: bottom bar, expanded options, safe areas, color palette, bottom sheet |
| `apps/web/src/Canvas.tsx` | Add touch event forwarding; pointer count tracking for two-finger pan |
| `packages/core/src/whiteboard.ts` | Add touch event handlers; two-finger pan/zoom; double-tap reset; pointer count tracking |
| `packages/core/src/viewport.ts` | Add `zoomToPoint(point, newZoom)` method for pinch center |
| `apps/web/index.html` | Update viewport meta tag |

---

## 5.15 Testing checklist

- [ ] Desktop layout (>640px): left-side vertical toolbar, unmodified
- [ ] Mobile layout (≤640px): bottom horizontal toolbar with 48×48px buttons
- [ ] Mobile: tapping a tool selects it; long-pressing shows options panel
- [ ] Mobile: color palette renders correctly with preset colors
- [ ] Mobile: custom color picker opens from "+" swatch
- [ ] Mobile: stroke width slider is horizontal and easy to drag
- [ ] Mobile: two-finger pan works (viewport moves, no page scroll)
- [ ] Mobile: pinch-to-zoom works (viewport zooms, no browser zoom)
- [ ] Mobile: double-tap resets zoom and center
- [ ] Mobile: single-finger drawing still works during two-finger gesture cancellation
- [ ] Mobile: collaboration panel opens as bottom sheet, can be swiped to dismiss
- [ ] Mobile: export panel opens as bottom sheet on mobile
- [ ] Mobile: safe area insets respected on iPhone X+ (toolbar above home indicator)
- [ ] Mobile: no browser scroll bounce (touch-action: none on canvas)
- [ ] Tablet: landscape orientation uses desktop layout; portrait uses mobile layout
- [ ] Keyboard shortcuts still work on desktop