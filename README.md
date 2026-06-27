# Min Browser Extensions

Monorepo for browser extensions that target Chrome, Microsoft Edge, and Safari.

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
pnpm build:safari
```

Chrome and Edge builds use the side panel manifest. Safari uses the same UI through a compatible popup fallback because Safari does not expose Chromium's `side_panel` extension surface. Browser tab grouping is best-effort where the target browser exposes grouping APIs; the extension still tracks its own managed groups so tabs can be closed together from the UI.

GitHub release builds are produced per changed extension. Shared package or root tooling changes release every extension because those changes can affect all build outputs.
