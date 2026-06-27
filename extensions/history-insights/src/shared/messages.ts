import type { HistoryInsights, InsightFilters } from "./analytics";

export type ExportFormat = "csv" | "json";

export type DashboardState = {
  filters: InsightFilters;
  historyItemCount: number;
  insights: HistoryInsights;
  maxResults: number;
};

export type ExportPayload = {
  app: "history-insights";
  exportedAt: string;
  filters: InsightFilters;
  format: ExportFormat;
  mimeType: string;
  schemaVersion: 1;
  text: string;
};

export type ExtensionMessage =
  | { filters: InsightFilters; type: "GET_DASHBOARD_STATE" }
  | { filters: InsightFilters; format: ExportFormat; type: "EXPORT_INSIGHTS" }
  | { type: "FLUSH_ACTIVE_TIME" };

export type RuntimeEvent = { type: "HISTORY_INSIGHTS_UPDATED" };

export type ExtensionResponse =
  | { ok: true }
  | { ok: true; payload: ExportPayload }
  | { ok: true; state: DashboardState }
  | { error: string; ok: false };
