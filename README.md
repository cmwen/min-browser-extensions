# Min Browser Extensions

Monorepo for browser extensions that target Chrome, Microsoft Edge, Firefox, and Safari.

## Tooling

- Package manager: `pnpm`
- Extension/runtime language: TypeScript
- TypeScript compiler: `typescript@7.0.1-rc`
- Native TypeScript preview: `@typescript/native-preview` via `tsgo`

## First Extension

`extensions/tab-workspace-manager` is a side panel extension for managed tab groups, workspace templates, LLM multitasking shortcuts, live LLM tab status markers, pinned page shortcuts, keyboard navigation, and options/config management.

## History Insights

`extensions/history-insights` is a local-first history analytics extension. It reads browser history with date and domain filters, merges locally cached active-tab time by domain, visualizes visits and usage patterns, and exports filtered data as JSON or CSV.

## Common Commands

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm typecheck:native
pnpm build:chrome
pnpm build:edge
pnpm build:firefox
pnpm build:safari
pnpm pages:screenshots
```

Tab Workspace Manager is distributed for Chrome, Edge, and Firefox. Chrome and Edge use the Chromium `side_panel` surface; Firefox uses `sidebar_action` and requires Firefox 138 or newer for browser tab-group operations. History Insights retains its Firefox and Safari popup fallbacks. Browser tab grouping is best-effort where the target browser exposes grouping APIs; each extension still tracks its own managed state where needed.

GitHub release builds are produced per changed extension. Shared package or root tooling changes release every extension because those changes can affect all build outputs.

GitHub Pages is served from `docs/`. The Pages workflow refreshes the committed extension screenshots with Playwright before deploying the static site.
