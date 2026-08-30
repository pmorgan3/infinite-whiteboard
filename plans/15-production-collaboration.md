# Production-Ready Collaboration

## Goal

Harden the existing Yjs collaboration path so a board can be shared by URL, reports its true connection state, reconnects safely, and applies concurrent changes incrementally instead of replacing the entire shared array on every local edit.

This work must be independently mergeable into current `main`. Do not depend on multiple-board storage or new element types.

## Connection and Sharing UX

- Read the WebSocket base URL from `VITE_COLLAB_WS_URL`. If unset, use `ws://localhost:1234` during local development and derive `ws:`/`wss:` from the page host for production builds.
- Represent room membership in the page URL as `?room=<validated-id>`. Opening such a URL joins after the canvas is ready; joining/leaving updates browser history without a reload.
- Validate room IDs with the server-compatible `^[A-Za-z0-9._-]+$` rule and show an inline error for invalid values.
- Add explicit `Disconnected`, `Connecting`, `Connected`, and `Reconnecting` states driven by provider events—not by the Join button click.
- Provide Copy Share Link and Leave Room actions plus an awareness-based participant list with names/colors. Preserve remote cursors.
- Show recoverable connection errors without blocking local editing.

## Synchronization Model

Replace `setElements()` whole-array replacement with ID-based incremental reconciliation inside Yjs transactions:

- Insert new element maps, update changed keys on existing maps, delete removed IDs, and maintain deterministic element order.
- Tag local transactions with an origin and suppress echo callbacks; remote transactions update the whiteboard without creating local history entries or immediate write-back loops.
- Nested arrays/objects must round-trip without sharing mutable references outside Yjs.
- After initial provider sync, use the room state when it is non-empty. Seed an empty room once from the current local canvas. Do not erase a non-empty local canvas merely because the provider has not synced yet.
- Reconnection must converge without duplicated IDs or losing offline local edits made while disconnected.

Expose typed status, participant, sync, and error callbacks from `CollabProvider`. Clean up every provider and awareness listener in `destroy()`.

## Server and Configuration

Keep the current room-name path validation and optional filesystem persistence. Add a documented `.env.example` for the web endpoint. The server should handle connection errors without crashing and log lifecycle events concisely. Do not commit environment-specific URLs.

## Non-Goals

No authentication, authorization, private-room cryptography, hosted deployment, comments, per-user undo, or database-backed room administration. Security boundaries must be clearly stated in documentation: possession of a room URL grants access.

## Acceptance Criteria

- Two browser sessions joining a shared URL converge and display participants/cursors.
- Concurrent additions and edits do not clobber unrelated elements.
- Initial sync never replaces established room content with a stale local snapshot.
- Offline edits synchronize after reconnection without duplicates.
- Leaving destroys the provider, removes the URL parameter, clears remote presence, and keeps the current canvas locally editable.
- Status UI reflects actual provider events and remains usable on mobile.

## Verification

Add collaboration-package tests using two Yjs documents/providers or a deterministic in-memory harness for reconciliation, origin suppression, initial seeding, offline edits, and cleanup. Add web-level tests for room parsing/validation and URL generation. Run `pnpm test`, `pnpm build`, and `pnpm lint`. The PR description must include a manual two-client test and configuration instructions.

