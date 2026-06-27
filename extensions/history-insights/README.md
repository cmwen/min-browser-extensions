# History Insights

Local-first browser history analytics for Chrome, Microsoft Edge, Firefox, and Safari-compatible WebExtension builds.

## Features

- Filter history insights by date range and domain.
- Aggregate visits, typed navigation, pages, hourly activity, and top domains.
- Track active-tab time locally per domain after installation.
- Export filtered results as JSON for LLM workflows or CSV for spreadsheets.
- Store cached dwell-time stats in extension-local browser storage only.

## Privacy

The extension does not connect to external services. It reads browser history through the browser extension API and stores local active-time aggregates in `storage.local`. Browser history does not expose reliable dwell time, so time-spent metrics are based on local active-tab tracking from the point the extension is installed.

## Commands

```sh
pnpm --filter @minext/history-insights test
pnpm --filter @minext/history-insights typecheck
pnpm --filter @minext/history-insights build:chrome
pnpm --filter @minext/history-insights build:edge
pnpm --filter @minext/history-insights build:firefox
pnpm --filter @minext/history-insights build:safari
```

## Loading Builds

Chrome and Edge builds are emitted under `dist/chrome` and `dist/edge` with a side panel manifest. Firefox and Safari use `dist/firefox` and `dist/safari` with popup fallbacks because Chromium's `side_panel` API is not portable across those browsers.
