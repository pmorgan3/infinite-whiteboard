# Phase 6: Multiple Whiteboards (Tabs / Board Switcher)

## Overview

Add support for creating, switching between, and managing multiple whiteboards within a single session. Users see a tab bar at the top (desktop) or a board switcher overlay (mobile), and each board maintains its own independent viewport, elements, and undo/redo history. Boards persist to `localStorage` so they survive page reloads.

---

## 6.1 Data Model

### Board metadata — `packages/core/src/types.ts`

Add a `BoardMeta` interface:

```ts
export interface BoardMeta {
  id: string;
  title: string;
  createdAt: number;   // Date.now()
  updatedAt: number;    // Date.now()
}

export interface BoardState {
  meta: BoardMeta;
  viewport: ViewportState;
  elements: WBElement[];
  // history is NOT serialized — it re-initializes empty on load
}
```

### Board store — `packages/core/src/board-store.ts` (new file)

A pure-functional store that manages an in-memory map of `BoardState` objects:

```ts
import type { BoardMeta, BoardState, ViewportState, WBElement } from './types';
import { generateId } from './tools';

export class BoardStore {
  private boards = new Map<string, BoardState>();
  private activeBoardId: string | null = null;
  private listeners = new Set<() => void>();

  createBoard(title?: string): BoardMeta {
    const meta: BoardMeta = {
      id: generateId(),
      title: title ?? 'Untitled',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.boards.set(meta.id, {
      meta,
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [],
    });
    this.activeBoardId = meta.id;
    this.notify();
    return meta;
  }

  deleteBoard(id: string): void {
    this.boards.delete(id);
    if (this.activeBoardId === id) {
      const remaining = Array.from(this.boards.keys());
      this.activeBoardId = remaining[0] ?? null;
    }
    this.notify();
  }

  switchBoard(id: string): void {
    if (this.boards.has(id)) {
      this.activeBoardId = id;
      this.notify();
    }
  }

  getActiveBoardId(): string | null {
    return this.activeBoardId;
  }

  getActiveBoard(): BoardState | undefined {
    return this.activeBoardId ? this.boards.get(this.activeBoardId) : undefined;
  }

  getAllBoards(): BoardMeta[] {
    return Array.from(this.boards.values()).map(b => b.meta)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  updateElements(id: string, elements: WBElement[]): void {
    const board = this.boards.get(id);
    if (board) {
      board.elements = elements;
      board.meta.updatedAt = Date.now();
    }
  }

  updateViewport(id: string, viewport: ViewportState): void {
    const board = this.boards.get(id);
    if (board) {
      board.viewport = viewport;
    }
  }

  renameBoard(id: string, title: string): void {
    const board = this.boards.get(id);
    if (board) {
      board.meta.title = title;
      board.meta.updatedAt = Date.now();
      this.notify();
    }
  }

  duplicateBoard(id: string): BoardMeta | null {
    const original = this.boards.get(id);
    if (!original) return null;
    const newId = generateId();
    const meta: BoardMeta = {
      id: newId,
      title: `${original.meta.title} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.boards.set(newId, {
      meta,
      viewport: { ...original.viewport },
      elements: original.elements.map(el => ({ ...el })),
    });
    this.notify();
    return meta;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  // Persistence
  toJSON(): string {
    return JSON.stringify(Array.from(this.boards.entries()));
  }

  static fromJSON(json: string): BoardStore {
    const store = new BoardStore();
    try {
      const entries = JSON.parse(json) as [string, BoardState][];
      for (const [id, state] of entries) {
        store.boards.set(id, state);
      }
      if (store.boards.size > 0) {
        store.activeBoardId = entries[0][0];
      }
    } catch { /* empty store on parse failure */ }
    return store;
  }
}
```

---

## 6.2 Whiteboard Integration

### Multiboard-aware Whiteboard — `packages/core/src/whiteboard.ts`

The `Whiteboard` class currently owns one `elements` array and one `Viewport`. To support multiple boards, we change it so the **React layer** swaps board state in/out of the Whiteboard instance.

**No changes to the Whiteboard class itself.** Instead, the React app manages `BoardStore` and swaps state:

```tsx
// When switching boards:
boardStore.updateElements(currentBoardId, wb.elements);
boardStore.updateViewport(currentBoardId, wb.viewport.toState());

const nextBoard = boardStore.getActiveBoard()!;
wb.elements = nextBoard.elements;
wb.viewport = new Viewport(nextBoard.viewport);
wb.history.clear();
wb.scheduleRender();
```

This avoids coupling `Whiteboard` to `BoardStore` and keeps the core package simple.

---

## 6.3 History per Board

### `HistoryStack.clear()` method — `packages/core/src/history.ts`

Add a `clear()` method so history resets when switching boards:

```ts
clear(): void {
  this.undoStack = [];
  this.redoStack = [];
}
```

Export `HistoryStack` is already public. Add `clear()` and expose `clear` in the `Whiteboard` class:

```ts
// In Whiteboard class:
clearHistory(): void {
  this.history.clear();
  this.scheduleRender();
}
```

---

## 6.4 UI Components

### `apps/web/src/BoardTabs.tsx` (new file)

```tsx
interface BoardTabsProps {
  boards: BoardMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}
```

Behavior:
- Horizontal tab bar at top of canvas (desktop) or top of screen (mobile).
- Each tab shows board title. Double-click to rename (inline edit).
- "+" button creates a new board.
- Right-click or long-press shows context menu: Rename, Duplicate, Delete.
- Maximum ~8 visible tabs; overflow scrolls horizontally.

### `BoardTabs.scss`

```scss
.board-tabs {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
  overflow-x: auto;
  max-width: calc(100% - 200px);

  .board-tab {
    padding: 6px 12px;
    border: none;
    background: transparent;
    font-size: 13px;
    cursor: pointer;
    border-radius: 6px;
    white-space: nowrap;

    &.active {
      background: #3b82f6;
      color: white;
    }

    &:hover:not(.active) {
      background: #f3f4f6;
    }
  }

  .board-tab-add {
    padding: 6px 10px;
    border: none;
    background: transparent;
    font-size: 16px;
    cursor: pointer;
    border-radius: 6px;
    color: #6b7280;

    &:hover {
      background: #f3f4f6;
    }
  }
}

@media (max-width: 640px) {
  .board-tabs {
    top: 8px;
    left: 8px;
    right: 8px;
    transform: none;
    max-width: none;
    font-size: 12px;
  }
}
```

---

## 6.5 App State Integration — `apps/web/src/App.tsx`

### State management

```tsx
const [boardStore] = useState(() => {
  const saved = localStorage.getItem('whiteboard-boards');
  const store = saved ? BoardStore.fromJSON(saved) : new BoardStore();
  if (store.getAllBoards().length === 0) {
    store.createBoard('First Board');
  }
  return store;
});
const [activeBoardId, setActiveBoardId] = useState(boardStore.getActiveBoardId());
```

### Save on change

```tsx
useEffect(() => {
  const save = () => {
    const active = boardStore.getActiveBoard();
    if (active && wbRef.current) {
      boardStore.updateElements(active.meta.id, wbRef.current.elements);
      boardStore.updateViewport(active.meta.id, wbRef.current.viewport.toState());
    }
    localStorage.setItem('whiteboard-boards', boardStore.toJSON());
  };
  const unsubscribe = boardStore.subscribe(save);
  // Also save on beforeunload
  window.addEventListener('beforeunload', save);
  return () => {
    unsubscribe();
    window.removeEventListener('beforeunload', save);
  };
}, [boardStore]);
```

### Board switching

```tsx
const handleBoardSwitch = (id: string) => {
  const wb = wbRef.current;
  if (!wb) return;

  // Save current board state
  const currentId = boardStore.getActiveBoardId();
  if (currentId) {
    boardStore.updateElements(currentId, wb.elements);
    boardStore.updateViewport(currentId, wb.viewport.toState());
  }

  // Switch
  boardStore.switchBoard(id);
  const nextBoard = boardStore.getActiveBoard()!;
  wb.elements = nextBoard.elements;
  wb.viewport = new Viewport(nextBoard.viewport);
  wb.clearHistory();
  wb.selectedIds = new Set();
  wb.scheduleRender();

  setActiveBoardId(id);
};
```

---

## 6.6 Persistence

### localStorage format

Key: `whiteboard-boards`

Value: JSON array of `[id, BoardState]` entries (from `BoardStore.toJSON()`).

### Auto-save throttle

Save at most once per second (use `setTimeout`). On `beforeunload`, save synchronously.

### Migration

If no saved data exists, create a default "First Board" with an empty element array.

---

## 6.7 Collab Integration

Each board has its own room. When switching boards, disconnect from the current `CollabProvider` and connect to the new one:

```tsx
// In Canvas.tsx, roomId is derived from activeBoardId
// Format: `board-{boardId}`
```

The `CollabProvider` is already scoped per `roomId`; switching boards just means changing the `roomId` prop.

---

## 6.8 Export Integration

Export should only export the **active board**. The existing export functions already take `wb.elements`, so no changes needed in `@whiteboard/export`. The "Export JSON" handler already serializes `wb.elements` and `wb.viewport`.

Add an "Export All Boards" option that serializes `boardStore.toJSON()`.

---

## 6.9 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Tab` / `Cmd+Tab` | Switch to next board |
| `Ctrl+Shift+Tab` | Switch to previous board |
| `Ctrl+N` | Create new board |

---

## 6.10 File Touch List

| File | Change |
|------|--------|
| `packages/core/src/types.ts` | Add `BoardMeta`, `BoardState` interfaces |
| `packages/core/src/board-store.ts` | **New** — BoardStore class |
| `packages/core/src/history.ts` | Add `clear()` method to HistoryStack |
| `packages/core/src/whiteboard.ts` | Add `clearHistory()` method; expose `clearHistory` and make `selectedIds` public (already public) |
| `packages/core/src/index.ts` | Export `BoardMeta`, `BoardState`, `BoardStore` |
| `apps/web/src/BoardTabs.tsx` | **New** — Tab bar component |
| `apps/web/src/BoardTabs.scss` | **New** (or add to `App.scss`) — Tab bar styles |
| `apps/web/src/App.tsx` | Add `BoardStore` state; board switching logic; save/load from localStorage; render `<BoardTabs>` |
| `apps/web/src/App.scss` | Add `.board-tabs` styles |
| `apps/web/src/Canvas.tsx` | Derive `roomId` from `boardId` prop |

---

## 6.11 Testing Checklist

- [ ] Creating a new board adds it to the store and switches to it
- [ ] Switching boards saves current state and loads next board's elements + viewport
- [ ] Undo/redo is scoped per board (history cleared on switch)
- [ ] Deleting the last board creates a new empty one
- [ ] Renaming a board updates its title in the tab bar
- [ ] Duplicating a board copies all elements
- [ ] localStorage persists across page reloads
- [ ] Auto-save works (throttled, on change)
- [ ] Export exports only the active board
- [ ] Ctrl+Tab switches boards
- [ ] Mobile: tab bar renders correctly with safe area
- [ ] Collab: switching boards disconnects old room and connects to new one

---

## 6.12 Key Decisions

- **Board store is in core** so it can be reused by desktop (Tauri) and mobile (Capacitor) shells.
- **Whiteboard is NOT multiboard-aware.** The React layer swaps state in/out. This keeps `Whiteboard` simple and testable.
- **History does NOT persist.** When a board is loaded, history starts empty. This is the simplest approach and matches Excalidraw.
- **Board IDs are random** (via `generateId()`). No sequential numbering.
- **Default board title**: "Untitled" for new boards, "First Board" for the initial one.