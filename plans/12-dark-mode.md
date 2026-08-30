# Phase 12: Dark Mode

## Overview

Add a dark theme that inverts the canvas background, grid dots, toolbar chrome, panels, and text colors while preserving the user's element colors as-is. Dark mode follows the system preference by default with a manual toggle. The implementation uses CSS custom properties for UI chrome and a `theme` prop on the `Renderer` for canvas rendering.

---

## 12.1 Design Decisions

### Elements stay user-colored

Strokes, fills, and text colors on elements remain exactly as the user set them. Only the **canvas environment** (background, grid, selection highlights, snap guides, tool previews) and **UI chrome** (toolbar, panels, buttons) change.

**Rationale:** A dark-blue rectangle should still look dark-blue in dark mode. Users choose element colors intentionally; inverting them would be confusing and break exports.

### System preference first, manual override second

The app checks `prefers-color-scheme: dark` on load. A toggle button in the toolbar lets the user switch manually, overriding the system setting. The override persists to `localStorage`.

### CSS custom properties, not class duplication

All color values are extracted into CSS variables. Dark mode flips those variables via a `data-theme="dark"` attribute on `<html>`. No duplicated stylesheets.

### Canvas rendering via Renderer options

The `Renderer.render()` method accepts an optional `ThemeConfig` parameter that controls grid color, background color, selection highlight color, etc. This keeps the core package theme-aware without coupling to CSS.

---

## 12.2 Theme Configuration — `packages/core/src/types.ts`

```ts
export interface ThemeConfig {
  background: string;       // Canvas background fill color
  gridDot: string;          // Grid dot color
  selectionStroke: string;  // Selection highlight stroke color
  selectionDash: string;    // Selection dash pattern color
  snapGuide: string;        // Snap guide line color
  snapHighlight: string;   // Snap highlight dot/intersection color
  marqueeFill: string;      // Marquee selection fill color
  marqueeStroke: string;    // Marquee selection stroke color
}

export const LIGHT_THEME: ThemeConfig = {
  background: '#ffffff',
  gridDot: '#d1d5db',
  selectionStroke: '#3b82f6',
  selectionDash: '#3b82f6',
  snapGuide: '#f87171',
  snapHighlight: '#3b82f6',
  marqueeFill: 'rgba(59, 130, 246, 0.05)',
  marqueeStroke: '#3b82f6',
};

export const DARK_THEME: ThemeConfig = {
  background: '#1e1e1e',
  gridDot: '#3a3a3a',
  selectionStroke: '#60a5fa',
  selectionDash: '#60a5fa',
  snapGuide: '#fb7185',
  snapHighlight: '#60a5fa',
  marqueeFill: 'rgba(96, 165, 250, 0.08)',
  marqueeStroke: '#60a5fa',
};
```

---

## 12.3 Renderer Theme Support — `packages/core/src/renderer.ts`

### Updated `render()` signature

```ts
render(
  viewport: Viewport,
  elements: WBElement[],
  selectedIds: Set<string>,
  preview?: RenderPreview,
  snapGuides?: SnapGuides | null,
  snapConfig?: SnapConfig,
  theme?: ThemeConfig,         // NEW — defaults to LIGHT_THEME
)
```

### Changes to drawing methods

**Background fill** — Instead of `clearRect` leaving the canvas transparent, fill with `theme.background`:

```ts
render(...) {
  const t = theme ?? LIGHT_THEME;
  // ... setTransform ...
  this.ctx.fillStyle = t.background;
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  // ... scale, translate ...
}
```

**Grid dots** — Use `theme.gridDot`:

```ts
private drawGrid(viewport: Viewport, width: number, height: number, theme: ThemeConfig) {
  // ...
  this.ctx.fillStyle = theme.gridDot;
  // ... rest unchanged
}
```

**Selection highlight** — Use `theme.selectionStroke`:

```ts
private drawSelectionHighlight(el: WBElement, theme: ThemeConfig) {
  this.ctx.strokeStyle = theme.selectionStroke;
  // ...
}
```

**Snap guides** — Use `theme.snapGuide`:

```ts
private drawSnapGuides(..., theme: ThemeConfig) {
  this.ctx.strokeStyle = theme.snapGuide;
  // ...
}
```

**Snap highlights** — Use `theme.snapHighlight`:

```ts
private drawSnapHighlights(..., theme: ThemeConfig) {
  this.ctx.fillStyle = theme.snapHighlight;
  // ...
}
```

**Marquee selection** (from Phase 7) — Use `theme.marqueeFill` and `theme.marqueeStroke`.

**Element drawing** stays exactly the same — element colors are user-chosen.

### `renderForExport` theme support

```ts
renderForExport(
  canvas: HTMLCanvasElement,
  elements: WBElement[],
  viewport: Viewport,
  options: { width: number; height: number; background: string; dpr: number },
) {
  // ... existing logic uses options.background for the fill color
  // This is already theme-aware since the caller passes background color
}
```

No changes needed here — the export package already takes a `background` option.

---

## 12.4 Whiteboard Theme Propagation — `packages/core/src/whiteboard.ts`

Add a `theme` field:

```ts
theme: ThemeConfig = LIGHT_THEME;
```

Pass it through in `scheduleRender`:

```ts
scheduleRender() {
  if (this.needsRender) return;
  this.needsRender = true;
  this.rafId = requestAnimationFrame(() => {
    this.needsRender = false;
    const preview = this.buildPreview();
    this.renderer.render(
      this.viewport,
      this.elements,
      this.selectedIds,
      preview,
      this.activeGuides,
      this.snapConfig,
      this.theme,     // NEW
    );
  });
}
```

---

## 12.5 CSS Custom Properties — `apps/web/src/App.scss`

Define all colors as CSS variables under `[data-theme="light"]` (default) and `[data-theme="dark"]`:

```scss
:root,
[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: rgba(255, 255, 255, 0.95);
  --bg-panel: rgba(255, 255, 255, 0.98);
  --text-primary: #1f2937;
  --text-secondary: #4b5563;
  --text-muted: #9ca3af;
  --border-color: #e5e7eb;
  --hover-bg: #f3f4f6;
  --active-bg: #eff6ff;
  --active-border: #3b82f6;
  --btn-primary-bg: #3b82f6;
  --btn-primary-hover: #2563eb;
  --btn-success-bg: #10b981;
  --btn-success-hover: #059669;
  --shadow-sm: 0 2px 12px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.15);
  --toolbar-bg: rgba(255, 255, 255, 0.95);
  --sheet-bg: #ffffff;
  --backdrop-bg: rgba(0, 0, 0, 0.4);
  --input-border: #d1d5db;
  --swatch-border: #d1d5db;
  --slider-track: #d1d5db;
  --slider-thumb: #3b82f6;

  // Mobile-specific
  --toolbar-shadow: 0 -2px 12px rgba(0, 0, 0, 0.1);
  --mobile-toolbar-bg: rgba(255, 255, 255, 0.98);
}

[data-theme="dark"] {
  --bg-primary: #1e1e1e;
  --bg-secondary: rgba(40, 40, 40, 0.95);
  --bg-panel: rgba(40, 40, 40, 0.98);
  --text-primary: #e5e7eb;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  --border-color: #3a3a3a;
  --hover-bg: #374151;
  --active-bg: #1e3a5f;
  --active-border: #60a5fa;
  --btn-primary-bg: #2563eb;
  --btn-primary-hover: #3b82f6;
  --btn-success-bg: #059669;
  --btn-success-hover: #10b981;
  --shadow-sm: 0 2px 12px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.4);
  --toolbar-bg: rgba(40, 40, 40, 0.95);
  --sheet-bg: #282828;
  --backdrop-bg: rgba(0, 0, 0, 0.6);
  --input-border: #4b5563;
  --swatch-border: #4b5563;
  --slider-track: #4b5563;
  --slider-thumb: #60a5fa;

  // Mobile-specific
  --toolbar-shadow: 0 -2px 12px rgba(0, 0, 0, 0.3);
  --mobile-toolbar-bg: rgba(40, 40, 40, 0.98);
}
```

Then replace all hardcoded colors in `App.scss` with `var(--...)` references:

```scss
.app {
  background-color: var(--bg-primary);
}

.toolbar {
  background: var(--toolbar-bg);
  box-shadow: var(--shadow-sm);

  button {
    background: var(--bg-primary);
    color: var(--text-primary);
    border-color: var(--border-color);

    &:hover { background: var(--hover-bg); }
    &.active {
      background: var(--active-bg);
      border-color: var(--active-border);
    }
  }

  input[type="color"] {
    background: none;
  }
}

.collab-toggle, .export-toggle {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  box-shadow: var(--shadow-sm);

  &:hover { background: var(--hover-bg); }
}

.collab-panel, .export-panel {
  background: var(--bg-panel);
  box-shadow: var(--shadow-md);

  h3 { color: var(--text-primary); }
  label { color: var(--text-secondary); }
  input { border-color: var(--input-border); }
}

// ... and so on for every component
```

---

## 12.6 Theme Hook and Toggle — `apps/web/src/useTheme.ts`

```ts
import { useState, useEffect, useCallback } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('whiteboard-theme');
    return (saved as ThemeMode) ?? 'system';
  });

  const resolvedTheme = mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    localStorage.setItem('whiteboard-theme', mode);
  }, [resolvedTheme, mode]);

  const toggle = useCallback(() => {
    setMode(prev => {
      if (prev === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark';
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'light';
      return 'system';
    });
  }, []);

  // Listen for system preference changes when mode is 'system'
  useEffect(() => {
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      document.documentElement.setAttribute('data-theme', mql.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  return { mode, resolvedTheme, setMode, toggle };
}
```

---

## 12.7 Theme Toggle Button — `apps/web/src/App.tsx`

Add a theme toggle button next to the export and collab toggles:

```tsx
import { useTheme } from './useTheme';

function App() {
  const { resolvedTheme, toggle } = useTheme();
  // ...

  // Sync theme to Whiteboard core
  useEffect(() => {
    const wb = wbRef.current;
    if (wb) {
      wb.theme = resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME;
      wb.scheduleRender();
    }
  }, [resolvedTheme]);

  return (
    <div className="app">
      {/* ... existing ... */}
      <button
        className="theme-toggle"
        onClick={toggle}
        title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {resolvedTheme === 'dark' ? '☀️' : '🌙'}
      </button>
      {/* ... */}
    </div>
  );
}
```

---

## 12.8 Theme Toggle Styles — `apps/web/src/App.scss`

```scss
.theme-toggle {
  position: absolute;
  top: 16px;
  right: 120px;           // Between collab and export toggles
  width: 44px;
  height: 44px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 10px;
  cursor: pointer;
  font-size: 22px;
  z-index: 10;
  box-shadow: var(--shadow-sm);

  &:hover { background: var(--hover-bg); }
}

@media (max-width: 640px) {
  .theme-toggle {
    top: 12px;
    width: 48px;
    height: 48px;
  }
}
```

---

## 12.9 Component Updates for Dark Mode

### `Toolbar.tsx`

Toolbar buttons, the `.tool-options` panel, and dividers all use CSS variables already if the SCSS is updated. No component logic changes needed.

### `BottomSheet.tsx`

Sheet background and text colors use CSS variables:

```scss
.bottom-sheet {
  background: var(--sheet-bg);
  h3 { color: var(--text-primary); }
  label { color: var(--text-secondary); }
  input { border-color: var(--input-border); }
  button { background: var(--btn-primary-bg); }
}
```

### `ColorPalette.tsx`

Swatches render their own colors (user-chosen), but the `.active` ring and `+` button use CSS variables:

```scss
.color-swatch {
  &.active {
    border-color: var(--active-border);
    box-shadow: 0 0 0 2px var(--active-border-alpha);
  }
}
```

### `StrokeWidthSlider.tsx` / `SizePicker.tsx`

Slider track and thumb use CSS variables:

```scss
.stroke-slider {
  background: linear-gradient(to right, var(--slider-track), var(--text-primary));
}

.stroke-slider::-webkit-slider-thumb {
  background: var(--slider-thumb);
}
```

---

## 12.10 Canvas Text Editor Overlay

The `text-editor-overlay` textarea needs dark mode support:

```scss
.text-editor-overlay {
  color: var(--text-primary);
  caret-color: var(--text-primary);
}

[data-theme="dark"] .text-editor-overlay {
  // Inherit the element's color property, but set caret color
  caret-color: #e5e7eb;
}
```

Since `text-editor-overlay` uses `color: inherit` from the element's color, the background needs to match:

```tsx
// In Canvas.tsx, when creating the textarea:
const bgColor = resolvedTheme === 'dark' ? '#1e1e1e' : '#ffffff';
style={{
  // ...
  background: editingEl.fill === 'transparent' ? bgColor : editingEl.fill,
}}
```

This requires passing `resolvedTheme` down to `Canvas.tsx`.

---

## 12.11 Export: Theme-Aware Background

### PNG export

The `exportToPng` function already accepts `{ background }`. Pass the current theme background:

```tsx
const bgColor = resolvedTheme === 'dark' ? '#1e1e1e' : '#ffffff';
const blob = await exportToPng(wb.elements, { scale: 2, background: bgColor });
```

### SVG export

Same: `exportToSvg(wb.elements, { background: bgColor })`.

### JSON export

No changes needed — themes are not serialized.

---

## 12.12 Collab Cursors in Dark Mode

The cursor overlay in `Canvas.tsx` uses SVG with hardcoded colors. Update to use CSS variables:

```tsx
<path d="..." fill={cursor.color} stroke="var(--text-primary)" strokeWidth="1.5" />
<span className="cursor-label" style={{ backgroundColor: cursor.color }}>
  {cursor.name}
</span>
```

However, SVG `stroke` doesn't support CSS variables directly. Change the cursor stroke to white (works on both backgrounds) or compute the value:

```tsx
stroke={resolvedTheme === 'dark' ? '#e5e7eb' : 'white'}
```

---

## 12.13 Rendering Performance

Switching themes triggers a full re-render (`wb.scheduleRender()`). This is fast (single `requestAnimationFrame` call) and only happens on user-initiated toggle or system preference change.

The `ThemeConfig` object is compared by reference. To avoid unnecessary re-renders, use `useMemo` in the React layer:

```tsx
const themeConfig = useMemo(
  () => resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME,
  [resolvedTheme]
);

useEffect(() => {
  const wb = wbRef.current;
  if (wb) {
    wb.theme = themeConfig;
    wb.scheduleRender();
  }
}, [themeConfig]);
```

---

## 12.14 Accessibility

- Ensure all text colors meet WCAG 2.1 AA contrast ratios against their backgrounds:
  - Light mode: `#1f2937` on `#ffffff` → 15.4:1 ✓
  - Dark mode: `#e5e7eb` on `#1e1e1e` → 12.6:1 ✓
  - Secondary light: `#4b5563` on `#ffffff` → 7.1:1 ✓
  - Secondary dark: `#9ca3af` on `#1e1e1e` → 5.0:1 ✓ (AA for large text)
- `prefers-color-scheme` is respected by default.
- `prefers-reduced-motion`: disable theme transition animations (see §12.15).

---

## 12.15 Transition Animation

When switching themes, add a brief cross-fade on the canvas background. This is purely cosmetic:

```scss
.app {
  transition: background-color 0.2s ease;
}

.toolbar, .collab-panel, .export-panel, .bottom-sheet {
  transition: background-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
```

For users who prefer reduced motion:

```scss
@media (prefers-reduced-motion: reduce) {
  .app, .toolbar, .collab-panel, .export-panel, .bottom-sheet {
    transition: none;
  }
}
```

---

## 12.16 Desktop (Tauri) Theme

Tauri's window title bar can follow the system theme:

```ts
// In apps/desktop/src-tauri/src/main.rs or via Tauri API:
import { appWindow } from '@tauri-apps/api/window';
// Tauri v2 handles dark mode natively via .tauri config
```

Add to `apps/desktop/src-tauri/tauri.conf.json`:

```json
{
  "windows": [{
    "titleBarStyle": "overlay",
    "decorations": true
  }]
}
```

The web content inherits the CSS theme from `data-theme` attribute.

---

## 12.17 File Touch List

| File | Change |
|------|--------|
| `packages/core/src/types.ts` | Add `ThemeConfig`, `LIGHT_THEME`, `DARK_THEME` |
| `packages/core/src/renderer.ts` | Accept `theme` param in `render()`; use theme colors for grid, selection, guides |
| `packages/core/src/whiteboard.ts` | Add `theme: ThemeConfig` field; pass to `render()`; update `renderForExport` |
| `packages/core/src/index.ts` | Export `ThemeConfig`, `LIGHT_THEME`, `DARK_THEME` |
| `apps/web/src/useTheme.ts` | **New** — Theme hook with system preference + manual override |
| `apps/web/src/App.tsx` — Add theme toggle; sync theme to `wb.theme`; pass `resolvedTheme` to Canvas |
| `apps/web/src/App.scss` | Replace all hardcoded colors with CSS variables; add `[data-theme="dark"]` overrides; add transition rules |
| `apps/web/src/Canvas.tsx` | Accept `theme` prop; use for text editor background and cursor stroke |
| `apps/web/src/Toolbar.tsx` | No logic changes (uses CSS vars) |
| `apps/web/src/BottomSheet.tsx` | No logic changes (uses CSS vars) |
| `apps/web/src/ColorPalette.tsx` | Use `var(--active-border)` for active swatch ring |
| `apps/web/src/SizePicker.tsx` | Use `var(--slider-track)`, `var(--slider-thumb)` |
| `apps/web/src/index.html` | No changes (meta viewport already set) |

---

## 12.18 Testing Checklist

- [ ] Light mode: canvas background is white, grid dots are light gray
- [ ] Dark mode: canvas background is `#1e1e1e`, grid dots are `#3a3a3a`
- [ ] Toggle button shows ☀️ in dark mode and 🌙 in light mode
- [ ] Clicking toggle switches theme immediately
- [ ] System preference `prefers-color-scheme: dark` is respected on load
- [ ] Manual override persists to localStorage across page reloads
- [ ] System preference change (while mode is "system") updates theme live
- [ ] Toolbar buttons are readable in both themes
- [ ] Collab panel text is readable in both themes
- [ ] Export panel text is readable in both themes
- [ ] Bottom sheet is readable in dark mode
- [ ] Color palette swatches look correct on both backgrounds
- [ ] Text editor overlay has correct background in dark mode
- [ ] Element colors (strokes, fills) remain unchanged in dark mode
- [ ] Selection highlights use `#60a5fa` in dark mode (instead of `#3b82f6`)
- [ ] Snap guides use `#fb7185` in dark mode (instead of `#f87171`)
- [ ] PNG export uses white background in light mode, `#1e1e1e` in dark mode
- [ ] SVG export background matches current theme
- [ ] JSON export is theme-independent
- [ ] WCAG AA contrast ratios met for all text in both themes
- [ ] `prefers-reduced-motion` disables theme transitions
- [ ] Mobile: all touch targets and panels look correct in dark mode
- [ ] Collab cursor label is readable on both backgrounds