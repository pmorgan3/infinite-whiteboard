# Complete Object Manipulation

## Goal

Turn the select tool into a complete object-editing workflow: resize, rotate, duplicate/copy/paste, reorder, lock, and edit common properties for multiple selected elements.

The implementation must work from current `main` without relying on any other proposed feature.

## Selection and Transform UX

- Draw a zoom-independent bounding box and eight resize handles for the selection, plus a rotation handle above it.
- Resize a single element or multi-selection from any handle. Opposite edges remain anchored; `Shift` preserves the starting aspect ratio. Enforce a visible minimum size.
- Rotate around the selection center. Holding `Shift` snaps to 15-degree increments.
- One pointer gesture creates one undoable history entry. Undo/redo restores exact geometry, bindings, group bounds, and selection.
- Groups transform their members as a unit. Bound arrow endpoints remain valid after transforms.

Add an optional `rotation` in radians to drawable elements, defaulting to `0` for existing documents. Rendering, hit testing, bounds, snapping, PNG/SVG export, and selection overlays must all respect rotation. Do not bump the state version for an optional backward-compatible field; normalize absent values to zero. Paths and arrows may have rotation baked into their point geometry if that keeps their model simpler, but behavior and undo must be consistent.

## Clipboard, Ordering, and Locking

- `Ctrl/Cmd+C` copies selected elements to an app-specific MIME payload and a JSON text fallback. `Ctrl/Cmd+V` pastes valid internal payloads with new IDs and a repeated 20 px offset. Preserve internal group membership and remap arrow bindings that point within the copied set.
- Keep existing image clipboard paste behavior when no valid internal element payload exists.
- `Ctrl/Cmd+D` duplicates the selection. Duplication/paste is one undoable command and selects the new elements.
- Provide Bring Forward, Bring to Front, Send Backward, and Send to Back actions. Array order remains the source of truth; group backgrounds and members must retain coherent relative order.
- Add optional `locked: boolean`. Locked elements remain selectable so users can unlock them, but cannot be moved, transformed, deleted, restyled, or reordered. Show a small lock indicator in the selection overlay.

## Property Controls

When selection is non-empty, show a compact responsive property bar with applicable stroke color, stroke width, lock toggle, and layer actions. Applying a common property to multiple unlocked elements is one undoable action. Mixed values should show an indeterminate state rather than a false shared value.

## Architecture

- Add reusable geometry helpers for rotated bounds, handle hit testing, resize transforms, and rotation transforms. Do not bury geometry in React.
- Add snapshot/batch history commands rather than emitting an entry for every pointer move.
- Keep all mutations routed through `Whiteboard`/history APIs and trigger `onChange` exactly once per committed action.
- Update every element consumer affected by new common fields, including export and collaboration's generic serialization.

## Non-Goals

No skewing, freeform path-node editing, crop UI, layer panel, alignment/distribution commands, or collaborative transform conflict UI.

## Acceptance Criteria

- Every drawable type can be resized sensibly; rotation renders and exports correctly.
- Transform handles remain the same screen size at all zoom levels and work with mouse/touch/pointer input.
- Multi-selection and groups transform without losing members or arrow bindings.
- Clipboard ID remapping prevents duplicate IDs and dangling internal references.
- Locked objects cannot be mutated through shortcuts or controls.
- Every operation is deterministic and fully undoable/redoable.

## Verification

Add unit tests for transform geometry, rotated hit tests/bounds, clipboard remapping, ordering, locking, and history coalescing. Extend export tests for rotated SVG and ensure PNG uses the same core renderer. Run `pnpm test`, `pnpm build`, and `pnpm lint`. Include screenshots or a short recording in the PR.

