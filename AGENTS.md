# Repository Guidelines

## Project Structure & Module Organization

This pnpm/Turborepo monorepo separates reusable logic from platform shells. `apps/web` contains the React/Vite interface, `apps/desktop` wraps it with Tauri, and `apps/mobile` provides the Capacitor shell. Shared packages live under `packages/`: `core` owns canvas behavior and element types, `collab` integrates Yjs, `export` handles PNG/SVG/JSON output, and `ui` contains shared components and styles. The `server` directory hosts the y-websocket service. Shared TypeScript settings are in `tooling/ts-config`; historical feature specifications live in `plans/`. Tests currently sit beside source as `*.test.ts` in `packages/core/src` and `packages/export/src`.

## Build, Test, and Development Commands

Use pnpm 10 (`pnpm install`) from the repository root.

- `pnpm --filter @whiteboard/web dev` starts the web app on Vite's default port.
- `pnpm --filter @whiteboard/server dev` starts collaboration on `ws://localhost:1234`.
- `pnpm build`, `pnpm test`, and `pnpm lint` run each available workspace task through Turbo.
- `pnpm --filter @whiteboard/core test -- <pattern>` runs a focused Vitest test.
- `./dev-linux.sh` launches the Tauri desktop app with the Linux WebKit workaround.
- `pnpm --filter @whiteboard/mobile sync` regenerates native mobile projects from the web build.

## Coding Style & Naming Conventions

Write strict TypeScript/ES modules using two-space indentation, single quotes, and semicolons, matching existing files. Use `PascalCase` for React components and classes, `camelCase` for functions and hooks, and `UPPER_SNAKE_CASE` for constants. Name hooks `useThing.ts` and tests `<subject>.test.ts`. Keep core code framework-agnostic. Route element mutations through history commands so undo/redo remains valid; when adding an element type, update rendering, snapping, export, and collaboration serialization.

## Testing Guidelines

Vitest covers `packages/core` and `packages/export`; jsdom supplies browser APIs. Add tests beside changed source and describe observable behavior. Run `pnpm test` before submitting. No coverage threshold is configured, so prioritize regression cases, state transitions, serialization, and edge conditions.

## Commit & Pull Request Guidelines

There is no Git history yet to establish a house style. Use short, imperative, scoped subjects such as `core: preserve arrow bindings on move`. Keep commits focused. Pull requests should explain behavior and architecture impact, list verification commands, link relevant issues or plans, and include screenshots or recordings for visible web, desktop, or mobile changes. Document schema, environment-variable, or persistence changes explicitly.

## Configuration & Safety

Never commit secrets or generated native/mobile build directories. Use `PORT` to override the collaboration port and `WHITEBOARD_PERSISTENCE_DIR` for room persistence. Treat exported/imported state changes as versioned schema changes.
