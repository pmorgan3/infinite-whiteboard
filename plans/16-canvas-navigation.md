# Canvas Navigation, Minimap, and Search

## Goal

Make large boards easy to navigate with explicit zoom controls, fit commands, a minimap, and element search. The feature must stand alone on current `main` and must not require the document-manager or transform work.

## Zoom and Focus Controls

- Add a responsive navigation control with Zoom Out, current zoom percentage, Zoom In, Reset to 100%, Fit All, and Fit Selection.
- Zoom buttons use the canvas center as focal point and clamp to the core viewport limits. The percentage control opens a small menu for 25%, 50%, 100%, 200%, Fit All, and Fit Selection.
- Keyboard shortcuts: `Ctrl/Cmd+0` resets to 100%, `Shift+1` fits all, and `Shift+2` fits selection. Do not intercept shortcuts while editing text or typing in a form field.
- Fit commands add screen-space padding, handle empty/zero-sized bounds safely, and never produce non-finite viewport state.
- Animate button/search-initiated viewport moves over roughly 150–250 ms while respecting `prefers-reduced-motion`. Direct pan, wheel, and pinch gestures remain immediate.

Add tested core APIs for setting zoom around a point, fitting world bounds, fitting all drawable elements, and fitting selected elements. Viewport changes must notify the React shell without creating document history or triggering content autosaves.

## Minimap

- Show a collapsible minimap in a corner that does not cover primary tool controls. Persist only its collapsed preference.
- Render simplified element bounds, group regions, and a viewport rectangle using current theme colors. It should update after content or viewport changes without running an unconditional full-window animation loop.
- Clicking or dragging within the minimap recenters the main viewport. Clamp pathological bounds and support high-DPI displays.
- Provide an accessible label and a non-canvas Hide Minimap control.

## Search

- `Ctrl/Cmd+F` opens an in-app search popover instead of browser find.
- Case-insensitively search `TextElement.text` and `GroupElement.label`. Show match count and next/previous controls; Enter/Shift+Enter cycles results and Escape closes.
- Focusing a result selects it and fits it into view without modifying the board. Results update when document content changes and handle deletion of the active result.
- Search is literal substring matching only. Keep all query state in the web shell.

## Architecture

- Put reusable content-bounds and viewport math in `packages/core`; reuse existing snapping/export bounds concepts where practical without coupling core to React.
- Replace the cursor-only forced RAF render in `Canvas` with event-driven viewport/cursor invalidation where feasible; do not introduce another permanent render loop.
- Keep minimap drawing isolated in a component/helper with no core DOM dependency.

## Non-Goals

No spatial outline/tree, bookmarks, named frames, presentation mode, fuzzy search, OCR, or remote-user following.

## Acceptance Criteria

- Controls and shortcuts remain correct from 5% through 1000% zoom.
- Fit All/Selection works for all current element types and groups, including negative coordinates.
- Minimap viewport rectangle tracks pan/zoom and navigation works with mouse and touch.
- Search cycles deterministically, selects the match, and makes it visible.
- No document mutation, undo entry, or autosave is caused solely by navigation.
- Desktop, mobile, light/dark themes, and reduced-motion behavior are usable.

## Verification

Add core tests for bounds-to-viewport math, padding, clamping, empty content, and selection bounds. Add focused tests for search matching/order and minimap coordinate transforms. Run `pnpm test`, `pnpm --filter @whiteboard/web build`, and `pnpm lint`. Include screenshots for desktop and mobile layouts.

