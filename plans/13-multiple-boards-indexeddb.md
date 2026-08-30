# Multiple Boards and IndexedDB Persistence

## Goal

Replace the single `localStorage` document with a durable browser-side board library. Users can create, open, rename, duplicate, and delete independent boards without requiring an account or server.

This feature must be complete against `main` and must not depend on collaboration, navigation, transform, or sticky-note work.

## User Experience

- On first launch, create and open an `Untitled Board` unless legacy state exists.
- Add a Boards control that opens a responsive board manager (desktop panel and mobile bottom sheet are acceptable).
- List boards by most recently updated, showing name and last-modified time.
- Support create, open, inline rename, duplicate, and delete. Deletion requires confirmation and cannot leave the app without an active board; create/open another board afterward.
- Show the active board name in the app chrome. Board switching must save the current board before loading the next one.
- Preserve the existing 500 ms debounced autosave and manual `Ctrl/Cmd+S` behavior, scoped to the active board.

## Storage Design

Create a small native IndexedDB adapter in `apps/web/src/storage/`; do not add a runtime database library. Use database `infinite-whiteboard`, schema version `1`, and a `boards` object store keyed by `id`, with an `updatedAt` index. A board record contains:

```ts
interface BoardRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  state: WhiteboardState;
}
```

Use collision-resistant IDs (`crypto.randomUUID()` with a safe fallback). Store the active board ID in localStorage as lightweight preference data only. Board content, including image data URLs, belongs in IndexedDB.

On first successful database open, migrate the existing `whiteboard-state` value into one board named `Imported Board`, then remove that legacy key only after the IndexedDB transaction succeeds. Invalid legacy JSON must not prevent startup. Existing `WhiteboardState.version` validation remains authoritative.

Surface storage failures with a non-blocking error message and retain the in-memory board. Never silently report a save as successful when its transaction fails.

## Architecture

- Keep IndexedDB calls behind a typed asynchronous repository interface so React components do not issue raw transactions.
- Refactor `useAutoSave` to accept an active board ID and async save callback. Prevent a delayed save from writing one board's state into a newly selected board.
- Loading a board uses `Whiteboard.setState()` and resets history/selection as it does today.
- Sanitize names by trimming whitespace; an empty name becomes `Untitled Board`. Names need not be unique.

## Non-Goals

No cloud sync, authentication, folders, thumbnails, import format changes, service worker, or collaboration-room association. Do not change core element schemas.

## Acceptance Criteria

- Board CRUD survives reload and board switching without state leakage.
- Duplicate produces a new ID and independent deep-cloned state.
- Legacy localStorage migration is one-time and lossless.
- Images too large for normal localStorage usage can be saved through IndexedDB.
- Keyboard/manual save and unload save target the correct board.
- Empty/corrupt storage and quota/transaction errors are handled without a blank-screen crash.
- Desktop and mobile layouts remain usable and keyboard controls are labeled accessibly.

## Verification

Add focused tests for repository CRUD, sorting, migration, duplicate isolation, and stale debounced-save protection. An IndexedDB test double is acceptable; keep production code browser-native. Run `pnpm test`, `pnpm --filter @whiteboard/web build`, and `pnpm lint`. Include manual verification steps in the PR description.

