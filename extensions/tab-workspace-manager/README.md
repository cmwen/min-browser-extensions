# Tab Workspace Manager

Side panel extension for choosing the right tab workflow for the moment: focus on a research task, manage ordinary groups, or keep follow-up tabs visible for later.

## Features

- Chrome and Edge side panel UI.
- Safari-compatible popup fallback using the same UI. Safari does not support Chromium's persistent `side_panel` extension surface.
- Auto-group tabs by registrable domain.
- Auto-group tabs opened from another tab, such as search results opened from a Google results page. This is enabled by default and can be disabled in preferences.
- One-click workspace templates that open multiple tabs, group them in the browser where supported, and track them as managed extension groups.
- LLM launchpad for ChatGPT, Claude, Gemini, Copilot, and Perplexity. Each click opens a new session and adds it to the shared LLM Workbench group for multitasking.
- LLM tab status markers shown directly on live tabs when a provider is active, waiting, or responded.
- Managed groups with one-click close for all tabs in the group.
- Individual tab rows include close and shortcut actions.
- Ungrouped Tabs list that hides tabs already shown inside managed Groups.
- Pinned page shortcuts under the search field for quick relaunch without keeping those pages open.
- Context map mode that keeps the active tab centered and ranks nearby tabs by opener, domain, group, open time, activation history, pins, and LLM conversation signals.
- Context map rows expose a compact signal detail view so users can inspect why a tab was ranked without crowding the main panel.
- Grouped tabs mode that preserves the original managed groups and ungrouped tabs workflow.
- Follow-up mode for saving tabs as TODO/read-later items, reopening saved URLs, setting custom reminder times, receiving due notifications where supported, snoozing until tomorrow, marking items for review, marking done, and removing items.
- Save-and-close flow for moving the current tab into Follow-up without keeping it open.
- Read-later cleanup suggestions in Follow-up mode, with explicit save-and-close controls and a reopen-batch restore path.
- Suggested modes are indicated through subtle mode-toggle styling instead of extra chips in the main panel.
- Configurable context-map weights and optional adaptive learning from the tabs users choose next.
- Optional title cleanup rules for replacing redundant page title text in the panel. This is disabled by default.
- Options page for theme, workspaces, LLM shortcuts, grouping rules, context-map ranking, title cleanup, import, and export.
- Import/export supports a full backup payload with configuration, follow-ups, pinned shortcuts, managed groups, LLM conversation metadata, and local tab signal metadata. Legacy config-only JSON can still be imported.
- Light, dark, and system theme modes.
- Keyboard shortcuts for side panel access, search, and domain grouping.

## Product Direction

The extension should be user-directed rather than invisibly smart. It may compute transparent local signals and suggest a mode, but the user chooses the workflow from the side panel mode switch.

Planned modes:

- Context map: for research or focused work. The panel should hide unrelated already-open tabs by default and show workspace entry points, LLM launchers, the active tab, and directly related tabs. This keeps attention on one task.
- Grouped tabs: for general browsing and cleanup. The panel shows managed groups, ungrouped tabs, search, close, pin, and grouping actions.
- Follow-up: for tabs that behave like TODOs, reminders, or read-later items. Users can keep a tab for later without keeping it open all the time, then return when it is due or when they have attention again.

Follow-up is the next major feature priority. It should combine reminder and read-later behavior instead of splitting them into separate modes. A follow-up item can represent a task to resume, an LLM conversation to check, a page to read later, a form to finish, or a research branch to revisit.

Follow-up statuses should start simple:

- Waiting: user is waiting on a page, LLM response, external event, or future context.
- Due: the item needs attention now.
- Snoozed: the item is intentionally hidden until a later time.
- Needs review: the item is probably ready for user action.
- Done: the item can be archived or removed.

Follow-up actions should be explicit and reversible:

- Add reminder.
- Snooze.
- Jump to live tab.
- Reopen saved URL.
- Mark done.
- Archive.
- Close tab after saving the follow-up item.

Read-later cleanup should be part of Follow-up. The extension can suggest moving old, unread, low-urgency tabs into the follow-up bucket, but it should never close tabs automatically. User confirmation and restore paths are required.

App mode is intentionally deferred. App-like pages such as Gmail, YouTube, Netflix, Slack, Calendar, dashboards, and docs may eventually get quiet-mode or companion behavior, but this work should not block Context map, Grouped tabs, or Follow-up.

Transparent signals should not clutter the main panel. They should live in a secondary detail view, settings/debug view, or future per-tab inspector. Examples include time active, opened time, last active time, visit count, child tabs opened, app/media detection, pinned state, workspace/group membership, and read-later age.

Suggested mode should not be shown as a space-consuming chip. Prefer subtle treatment on the existing mode control, such as a color accent, dot, or border on the suggested mode. Any suggestion must expose its reason in a secondary view, for example: "Suggested Context map because 5 related tabs were opened from this search."

## Group Model

The extension tracks managed groups separately from browser tab groups. Browser tab groups are still created where the browser supports them, because they provide a fallback way to close or inspect tabs outside the extension. The side panel is the primary source of organization:

- Workspace groups are created when a workspace template opens.
- The LLM Workbench group collects multiple LLM sessions opened from the launchpad.
- Domain groups are created when the domain grouping action runs.
- Opener groups are created when a tab opens another tab and auto-grouping is enabled.

Closing a managed group from the side panel closes all live tabs in that group and removes the group record.
The side panel also listens for real tab title, URL, favicon, activation, removal, and group changes while it is open, then refreshes its state so title cleanup and browser group changes are reflected without switching tabs.

## Preferences

- Theme mode: system, light, or dark. The main panel does not expose a theme toggle.
- Workspace templates: configure names, colors, and URLs.
- LLM shortcuts: enable or disable providers.
- Domain grouping: configure minimum tabs, excluded domains, and opener-tab auto grouping.
- Title cleanup: add contains or regex replacement rules for panel titles. Rules run only when title cleanup is enabled.
- Import and export: move configuration between browsers or profiles.

## Commands

```sh
pnpm --filter @minext/tab-workspace-manager build:chrome
pnpm --filter @minext/tab-workspace-manager build:edge
pnpm --filter @minext/tab-workspace-manager build:firefox
pnpm --filter @minext/tab-workspace-manager build:safari
pnpm --filter @minext/tab-workspace-manager typecheck
pnpm --filter @minext/tab-workspace-manager typecheck:native
```

## Loading Locally

Chrome:

1. Build with `pnpm build:chrome`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Load unpacked from `extensions/tab-workspace-manager/dist/chrome`.

Edge:

1. Build with `pnpm build:edge`.
2. Open `edge://extensions`.
3. Enable Developer mode.
4. Load unpacked from `extensions/tab-workspace-manager/dist/edge`.

Firefox:

1. Build with `pnpm build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose Load Temporary Add-on.
4. Select `extensions/tab-workspace-manager/dist/firefox/manifest.json`.
5. The Firefox manifest uses a popup fallback. Native tab group mirroring requires Firefox 138 or newer.

Safari:

1. Build with `pnpm build:safari`.
2. Use Safari's Web Extension conversion/signing flow from `extensions/tab-workspace-manager/dist/safari`.
3. The Safari manifest uses a popup fallback because Chromium's `side_panel` API is not available in Safari Web Extensions.

## Safari Limitations

- No Chromium-style `side_panel` manifest key or `chrome.sidePanel` API.
- No persistent extension panel alongside the webpage through WebExtensions alone.
- Safari extensions must be converted into an Xcode app/extension project and signed before real browser testing.
- Site access is more permission-forward in Safari, so content-script behavior depends on the user granting website access.
- Some Chromium extension APIs, including tab grouping APIs, need browser-specific fallbacks or graceful no-op behavior.
- Managed extension groups still work in the UI when browser tab grouping is unavailable, but Safari cannot mirror every group into a native browser tab group.

## Firefox Notes

- The Firefox build uses an action popup because Chromium's side panel API is not portable.
- The manifest sets a Firefox 138 minimum for native tab group mirroring.
- Media indicators use standard tab `audible` and `mutedInfo` fields when the browser reports them.

## Keyboard

- Browser command: `Ctrl+Shift+Period` or `Command+Shift+Period` opens the side panel where supported.
- Browser command: `Ctrl+Shift+G` or `Command+Shift+G` groups tabs by domain.
- Panel shortcut: `Ctrl+K` or `Command+K` focuses search.
- Panel shortcut: `Ctrl+Shift+G` or `Command+Shift+G` groups tabs by domain.
- `Escape` clears search and releases focus.
