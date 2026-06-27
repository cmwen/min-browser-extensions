import { enableActionSidePanelOpen, openExtensionPanel, webext } from "@minext/browser-api";
import { domainKeyForUrl } from "@minext/core";
import {
  addDwellSegment,
  buildHistoryInsights,
  domainInsightsToCsv,
  type DomainDwellCache,
  type HistoryLikeItem,
  type InsightFilters,
} from "../shared/analytics";
import type { DashboardState, ExportPayload, ExtensionMessage, ExtensionResponse, RuntimeEvent } from "../shared/messages";

const DWELL_CACHE_KEY = "historyInsights.domainDwell";
const MAX_HISTORY_RESULTS = 10_000;
const MIN_SEGMENT_MS = 1_000;
const MAX_SEGMENT_MS = 30 * 60_000;

type BrowserTab = {
  active?: boolean;
  id?: number;
  url?: string;
  windowId?: number;
};

type ActiveSession = {
  domain: string;
  startedAt: number;
  tabId: number;
  windowId: number;
};

let activeSession: ActiveSession | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function notifyDashboardChanged(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(() => {
    void webext.runtime.sendMessage({ type: "HISTORY_INSIGHTS_UPDATED" } satisfies RuntimeEvent).catch(() => undefined);
  }, 250);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDwellCache(value: unknown): value is DomainDwellCache {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.domain === "string" &&
      typeof entry.totalMs === "number" &&
      typeof entry.updatedAt === "number" &&
      isRecord(entry.daily),
  );
}

async function getDwellCache(): Promise<DomainDwellCache> {
  const result = await webext.storage.local.get(DWELL_CACHE_KEY);
  const value = result[DWELL_CACHE_KEY];
  return isDwellCache(value) ? value : {};
}

async function saveDwellCache(cache: DomainDwellCache): Promise<void> {
  await webext.storage.local.set({ [DWELL_CACHE_KEY]: cache });
}

async function flushActiveSession(now = Date.now(), options: { restart?: boolean } = {}): Promise<void> {
  if (!activeSession) {
    return;
  }

  const duration = now - activeSession.startedAt;
  if (duration >= MIN_SEGMENT_MS) {
    const endedAt = Math.min(now, activeSession.startedAt + MAX_SEGMENT_MS);
    const cache = await getDwellCache();
    await saveDwellCache(addDwellSegment(cache, { domain: activeSession.domain, endedAt, startedAt: activeSession.startedAt }));
  }

  activeSession = options.restart ? { ...activeSession, startedAt: now } : undefined;
}

async function startTrackingTab(tab: BrowserTab | undefined, now = Date.now()): Promise<void> {
  await flushActiveSession(now);

  if (!tab?.url || typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    return;
  }

  const domain = domainKeyForUrl(tab.url);
  if (!domain) {
    return;
  }

  activeSession = {
    domain,
    startedAt: now,
    tabId: tab.id,
    windowId: tab.windowId,
  };
}

async function getFocusedActiveTab(): Promise<BrowserTab | undefined> {
  const windowsApi = webext.windows;
  if (!windowsApi?.getLastFocused) {
    return undefined;
  }

  const focused = await windowsApi.getLastFocused({ populate: true });
  const tabs = focused.tabs as BrowserTab[] | undefined;
  return tabs?.find((tab) => tab.active);
}

async function refreshActiveSessionFromBrowser(now = Date.now()): Promise<void> {
  await startTrackingTab(await getFocusedActiveTab(), now);
}

async function getHistoryItems(filters: InsightFilters): Promise<HistoryLikeItem[]> {
  const history = webext.history;
  if (!history?.search) {
    return [];
  }

  const items = await history.search({
    endTime: filters.endTime,
    maxResults: MAX_HISTORY_RESULTS,
    startTime: filters.startTime,
    text: "",
  });

  return items.map((item) => ({
    ...(typeof item.id === "string" ? { id: item.id } : {}),
    ...(typeof item.lastVisitTime === "number" ? { lastVisitTime: item.lastVisitTime } : {}),
    ...(typeof item.title === "string" ? { title: item.title } : {}),
    ...(typeof item.typedCount === "number" ? { typedCount: item.typedCount } : {}),
    ...(typeof item.url === "string" ? { url: item.url } : {}),
    ...(typeof item.visitCount === "number" ? { visitCount: item.visitCount } : {}),
  }));
}

async function buildDashboardState(filters: InsightFilters): Promise<DashboardState> {
  await flushActiveSession(Date.now(), { restart: true });
  const [historyItems, dwellCache] = await Promise.all([getHistoryItems(filters), getDwellCache()]);
  return {
    filters,
    historyItemCount: historyItems.length,
    insights: buildHistoryInsights(historyItems, dwellCache, filters),
    maxResults: MAX_HISTORY_RESULTS,
  };
}

async function exportInsights(filters: InsightFilters, format: "csv" | "json"): Promise<ExportPayload> {
  const state = await buildDashboardState(filters);
  const exportedAt = new Date().toISOString();

  if (format === "csv") {
    return {
      app: "history-insights",
      exportedAt,
      filters,
      format,
      mimeType: "text/csv",
      schemaVersion: 1,
      text: domainInsightsToCsv(state.insights),
    };
  }

  return {
    app: "history-insights",
    exportedAt,
    filters,
    format,
    mimeType: "application/json",
    schemaVersion: 1,
    text: JSON.stringify(
      {
        app: "history-insights",
        exportedAt,
        filters,
        historyItemCount: state.historyItemCount,
        insights: state.insights,
        localFirst: true,
        maxResults: state.maxResults,
        schemaVersion: 1,
      },
      null,
      2,
    ),
  };
}

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  try {
    switch (message.type) {
      case "GET_DASHBOARD_STATE":
        return { ok: true, state: await buildDashboardState(message.filters) };
      case "EXPORT_INSIGHTS":
        return { ok: true, payload: await exportInsights(message.filters, message.format) };
      case "FLUSH_ACTIVE_TIME":
        await flushActiveSession(Date.now(), { restart: true });
        return { ok: true };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unknown history insights error", ok: false };
  }
}

void enableActionSidePanelOpen();
void refreshActiveSessionFromBrowser();

webext.runtime.onMessage.addListener((message: unknown) => handleMessage(message as ExtensionMessage));

webext.action?.onClicked?.addListener((tab) => {
  void openExtensionPanel(tab.windowId).catch(() => undefined);
});

webext.tabs.onActivated.addListener(({ tabId }) => {
  void webext.tabs.get(tabId).then((tab) => startTrackingTab(tab as BrowserTab)).catch(() => undefined);
});

webext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (activeSession?.tabId !== tabId || !changeInfo.url) {
    return;
  }

  void startTrackingTab(tab as BrowserTab).then(notifyDashboardChanged).catch(() => undefined);
});

webext.tabs.onRemoved.addListener((tabId) => {
  if (activeSession?.tabId === tabId) {
    void flushActiveSession().then(notifyDashboardChanged).catch(() => undefined);
  }
});

webext.windows?.onFocusChanged?.addListener((windowId) => {
  const none = webext.windows.WINDOW_ID_NONE;
  if (windowId === none) {
    void flushActiveSession().then(notifyDashboardChanged).catch(() => undefined);
    return;
  }

  void refreshActiveSessionFromBrowser().then(notifyDashboardChanged).catch(() => undefined);
});

webext.runtime.onSuspend?.addListener(() => {
  void flushActiveSession();
});
