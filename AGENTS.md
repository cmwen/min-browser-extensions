# AGENTS.md

This repository is a monorepo for multiple browser extensions. All work should keep Chrome, Microsoft Edge, and Safari support in mind from the start.

## Repository Direction

- Build extensions as separate apps under `extensions/`.
- Put shared TypeScript packages under `packages/`.
- Use `pnpm` workspaces for JavaScript and TypeScript packages.
- Use TypeScript for extension code, shared UI, shared browser APIs, build tooling, and tests.
- Use the TypeScript 7 RC compiler and the native TypeScript preview compiler (`tsgo`) for fast typechecking.
- Prefer small packages with clear ownership over broad shared utility buckets.
- Support development and usage on both Windows and macOS.

Expected structure:

```text
.
├── extensions/
│   └── tab-workspace-manager/
├── packages/
│   ├── browser-api/
│   ├── ui/
│   └── config/
├── tools/
├── pnpm-workspace.yaml
├── package.json
└── AGENTS.md
```

## Browser Compatibility

- Target Chrome, Edge, and Safari. Do not rely on Chrome-only behavior without a compatibility wrapper.
- Prefer the WebExtensions API shape. Add adapters for browser-specific differences.
- Keep Manifest V3 as the primary baseline unless a target browser requires a specific adaptation.
- Treat Safari as a first-class browser, not a later port. Account for Safari Web Extension packaging, permission prompts, side panel differences, background limitations, and API gaps.
- Safari does not provide the Chromium `side_panel` extension surface. For Safari, use a popup/options fallback or a companion native app design instead of assuming a persistent browser side panel.
- Keep browser-specific manifests, icons, permissions, and build outputs explicit.
- Avoid hard-coding `chrome.*` directly in feature code. Use a shared browser API package or compatibility layer.
- Be conservative with permissions. Request the minimum needed for tabs, tab groups, storage, side panel, and host access.

## First Extension: Tab Workspace Manager

The first extension is a side panel extension for managing tabs and tab groups.

Core features:

- Show current tabs and tab groups in a side panel.
- Auto-group tabs by domain URL.
- Let users create workspace templates that open multiple tabs with one click.
- Open workspace tabs into a named tab group.
- Provide quick actions for common LLM chatbots.
- Group LLM chatbot tabs together when useful.
- Help users track multiple LLM conversations by topic, status, and progress.
- Make it easy to jump back to a conversation once a chatbot responds.
- Provide a configuration page for themes, workspace templates, LLM shortcuts, grouping rules, and notification behavior.

LLM workflow expectations:

- Support multiple conversations across different topics.
- Track enough metadata to help users identify what each conversation is for.
- Use clear status indicators such as waiting, responded, active, pinned, stale, or needs review.
- Prefer fast navigation back to the exact tab over opening duplicate chatbot tabs.
- Make common LLM actions sticky or persistently available in the side panel.

## UI And UX Guidelines

- Support light and dark themes from the first implementation.
- Use native-feeling visual indicators: status dots, small badges, icons, subtle borders, focus rings, and browser-like grouping colors.
- Prefer modern CSS: container queries, cascade layers, logical properties, `:has()` where appropriate, `color-scheme`, CSS custom properties, and media queries for user preferences.
- Keep side panel UI dense, scannable, and utility-focused. This is an operational tool, not a marketing page.
- Use sticky controls for common actions such as open workspace, group by domain, open LLM tools, search tabs, and create template.
- Make all important actions keyboard accessible.
- Support keyboard shortcuts for frequent actions such as opening the side panel, searching tabs, grouping by domain, opening a workspace, switching between groups, and jumping to LLM conversations.
- Support keyboard navigation throughout the side panel and configuration page, including predictable focus order, visible focus states, arrow-key navigation where it fits, and Escape behavior for dismissible UI.
- Design shortcuts with both Windows and macOS conventions in mind. Avoid assuming `Ctrl` and `Command` are interchangeable without testing.
- Avoid layout shifts in lists of tabs, groups, templates, and statuses.
- Ensure text truncation, wrapping, and tooltips are handled deliberately for long page titles and URLs.
- Favor browser-native affordances over decorative UI.
- Use icons where they clarify action meaning, but keep labels for ambiguous or destructive actions.

## Configuration Page Guidelines

The configuration page should include:

- Theme mode: system, light, dark.
- Workspace template management.
- LLM provider shortcuts and preferred grouping behavior.
- Domain grouping rules and exclusions.
- Tab status and notification preferences.
- Import and export for templates and rules.
- Permission education only where needed; keep copy concise.

## Engineering Standards

- Use strict TypeScript.
- Use `pnpm` for installs, scripts, workspace orchestration, and lockfile management.
- Keep scripts cross-platform. Avoid shell syntax that only works on Unix-like systems unless it is isolated behind a documented tool.
- Keep shared browser API code typed and tested.
- Keep extension state schemas versioned and migration-friendly.
- Use structured storage APIs instead of ad hoc serialized blobs when practical.
- Keep background, side panel, options/config, content scripts, and shared packages clearly separated.
- Avoid leaking browser-specific code across package boundaries.
- Prefer deterministic grouping logic with tests for URL normalization, domain extraction, and workspace opening.
- Validate user-authored templates and config before saving.
- Treat tab and group operations as asynchronous and failure-prone. Handle closed tabs, missing permissions, discarded tabs, and unsupported APIs.

## Testing And Verification

- Add unit tests for URL/domain grouping, template expansion, browser API adapters, config migrations, and LLM tab status logic.
- Add integration or browser-level tests for key extension flows when practical.
- Verify at least Chrome and Edge during normal development.
- Verify Safari-specific behavior before claiming Safari support for a feature.
- Test both light and dark themes.
- Test side panel layout at narrow widths.
- Test keyboard navigation and focus states.
- Test keyboard shortcuts on Windows and macOS where behavior can differ.

## Build And Scripts

Prefer these root-level script names once the workspace is scaffolded:

- `pnpm install`
- `pnpm build`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm format`
- `pnpm dev`

Browser-specific builds should be explicit:

- `pnpm build:chrome`
- `pnpm build:edge`
- `pnpm build:safari`

## Documentation Expectations

- Each extension should have its own `README.md` with setup, build, test, and browser loading instructions.
- Shared packages should document their public API when exported outside their owning extension.
- Keep compatibility notes close to the code that needs them.
- Document known Safari limitations honestly.

## Contribution Rules For Agents

- Read existing package scripts and local conventions before adding new ones.
- Keep changes scoped to the requested extension or package.
- Do not add large frameworks or runtime dependencies without a clear reason.
- Do not make Chrome-only assumptions in shared code.
- Do not introduce unrelated refactors while implementing a feature.
- Before finishing code changes, run the narrowest relevant checks available and report anything that could not be verified.
