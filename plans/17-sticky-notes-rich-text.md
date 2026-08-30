# Sticky Notes and Richer Text

## Goal

Add first-class sticky notes and practical block-level text formatting while preserving canvas performance, export fidelity, persistence, and direct editing.

This feature must be complete on current `main` and cannot depend on the transform, storage, collaboration-hardening, or navigation PRs.

## Element Model

Add `StickyNoteElement` to `WBElement` with:

```ts
interface StickyNoteElement extends BaseElement {
  type: 'sticky';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fill: string;
  fontSize: number;
  fontFamily: string;
  textAlign: 'left' | 'center' | 'right';
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
}
```

Add the same optional alignment/weight/style fields to `TextElement`, defaulting absent values for backward compatibility. Sticky notes use `color` as text color and `strokeWidth: 0`. Extend all exhaustive consumers: tool/type registration, renderer, hit testing, bounds/snapping, history movement, grouping, PNG/SVG/JSON export, and tests. Generic collaboration serialization must continue to round-trip the new type.

## Creation and Editing UX

- Add a Sticky tool with shortcut `N` and a clear toolbar icon/title.
- Clicking creates a 220×160 note centered at the pointer with a theme-readable default yellow fill, selects it, and immediately starts editing. Dragging before release may set the initial size, with a sensible minimum.
- Reuse and generalize the existing text-edit overlay. It must match canvas zoom, dimensions, alignment, weight, style, colors, wrapping, and padding closely enough to avoid a visible jump on commit.
- `Ctrl/Cmd+Enter` commits; Escape cancels the edit; clicking outside commits. Empty newly created notes are removed as one undoable action.
- Notes support multiline wrapped text and expand vertically when content exceeds their current height; do not shrink automatically below the user's current size.

## Formatting Controls

When a text element or sticky note is selected/editing, show a responsive formatting bar with:

- Font size presets plus a validated numeric value (8–96 px).
- System font choices only: sans-serif, serif, and monospace.
- Left, center, and right alignment.
- Bold and italic toggles.
- Bulleted and numbered list actions that add/remove `- ` or `1. `-style prefixes for the selected/current lines. Store plain text prefixes; no HTML or inline rich-text document model.
- Sticky fill palette and text color; normal text retains its existing transparent fill behavior.

Formatting actions must be undoable, apply to all compatible selected elements, and show mixed states accurately.

## Rendering and Export

Create one shared line-layout helper used by canvas rendering and SVG export for padding, wrapping, explicit newlines, alignment, and line height. Escape SVG content. PNG export inherits the core renderer. Sticky fills must remain legible in both themes without automatically changing user-selected colors.

## Non-Goals

No inline mixed formatting, arbitrary Markdown rendering, hyperlinks, embedded media, remote fonts, collaborative caret presence, comments, or sticky-note templates.

## Acceptance Criteria

- Sticky notes create, edit, move, group, save/load, export, and undo/redo like other elements.
- Existing saved text elements render with unchanged defaults.
- Canvas and SVG wrapping/alignment are materially consistent, including Unicode and explicit blank lines.
- Formatting controls work with keyboard and pointer input on desktop and mobile.
- Empty-note cancellation/removal and invalid font-size input do not corrupt history.
- New types remain exhaustive under strict TypeScript compilation.

## Verification

Add core tests for sticky creation, hit testing, movement, grouping, defaults, line layout, and edit history. Add export tests for fill, escaping, wrapping, alignment, bold/italic, and list text. Run `pnpm test`, `pnpm build`, and `pnpm lint`. Include screenshots of editing and exported output in both themes.
