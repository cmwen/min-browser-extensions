import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, CalendarDays, Download, FileJson2, Filter, RefreshCw, Search, TimerReset } from "lucide-react";
import { webext } from "@minext/browser-api";
import type { InsightFilters } from "../shared/analytics";
import type { DashboardState, ExportFormat, ExtensionMessage, ExtensionResponse } from "../shared/messages";
import "./styles.css";

const root = document.getElementById("root");
const FILTER_CACHE_KEY = "historyInsights.filters";

if (!root) {
  throw new Error("Missing app root");
}

type DateFilters = {
  domainQuery: string;
  endDate: string;
  startDate: string;
};

async function sendMessage<T extends ExtensionResponse>(message: ExtensionMessage): Promise<T> {
  const response = (await webext.runtime.sendMessage(message)) as T;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response;
}

function dateInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDateFilters(): DateFilters {
  const now = Date.now();
  return {
    domainQuery: "",
    endDate: dateInputValue(now),
    startDate: dateInputValue(now - 6 * 24 * 60 * 60_000),
  };
}

function readCachedFilters(): DateFilters {
  try {
    const value = localStorage.getItem(FILTER_CACHE_KEY);
    if (!value) {
      return defaultDateFilters();
    }

    const parsed = JSON.parse(value) as Partial<DateFilters>;
    const fallback = defaultDateFilters();
    return {
      domainQuery: typeof parsed.domainQuery === "string" ? parsed.domainQuery : fallback.domainQuery,
      endDate: typeof parsed.endDate === "string" ? parsed.endDate : fallback.endDate,
      startDate: typeof parsed.startDate === "string" ? parsed.startDate : fallback.startDate,
    };
  } catch {
    return defaultDateFilters();
  }
}

function toInsightFilters(filters: DateFilters): InsightFilters {
  const start = new Date(`${filters.startDate}T00:00:00`);
  const end = new Date(`${filters.endDate}T23:59:59.999`);
  return {
    ...(filters.domainQuery.trim() ? { domainQuery: filters.domainQuery.trim().toLowerCase() } : {}),
    endTime: end.getTime(),
    startTime: start.getTime(),
  };
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) {
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const dayHours = hours % 24;
  return dayHours ? `${days}d ${dayHours}h` : `${days}d`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function saveDownload(text: string, mimeType: string, filename: string): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function App(): React.ReactElement {
  const [filters, setFilters] = useState<DateFilters>(() => readCachedFilters());
  const [state, setState] = useState<DashboardState | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const insightFilters = useMemo(() => toInsightFilters(filters), [filters]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      localStorage.setItem(FILTER_CACHE_KEY, JSON.stringify(filters));
      const response = await sendMessage<{ ok: true; state: DashboardState }>({
        filters: insightFilters,
        type: "GET_DASHBOARD_STATE",
      });
      setState(response.state);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load history insights");
    } finally {
      setBusy(false);
    }
  }, [filters, insightFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const listener = (message: unknown): void => {
      if (typeof message === "object" && message !== null && "type" in message && message.type === "HISTORY_INSIGHTS_UPDATED") {
        void load();
      }
    };

    webext.runtime.onMessage.addListener(listener);
    return () => webext.runtime.onMessage.removeListener(listener);
  }, [load]);

  const exportData = useCallback(
    async (format: ExportFormat) => {
      setBusy(true);
      setError(undefined);
      try {
        const response = await sendMessage<{ ok: true; payload: { mimeType: string; text: string } }>({
          filters: insightFilters,
          format,
          type: "EXPORT_INSIGHTS",
        });
        const suffix = `${filters.startDate}_to_${filters.endDate}`;
        saveDownload(response.payload.text, response.payload.mimeType, `history-insights-${suffix}.${format}`);
      } catch (exportError) {
        setError(exportError instanceof Error ? exportError.message : "Unable to export history insights");
      } finally {
        setBusy(false);
      }
    },
    [filters.endDate, filters.startDate, insightFilters],
  );

  const insights = state?.insights;
  const topTrackedMs = Math.max(...(insights?.topDomains.map((domain) => domain.trackedMs) ?? [0]), 1);
  const topVisits = Math.max(...(insights?.topDomains.map((domain) => domain.visitCount) ?? [0]), 1);
  const topHourlyVisits = Math.max(...(insights?.hourlyVisits.map((hour) => hour.visits) ?? [0]), 1);

  return (
    <main className="app-shell">
      <header className="panel-header">
        <div>
          <h1>History Insights</h1>
          <p>Local browser history and tracked active-tab time</p>
        </div>
        <button className="icon-button" type="button" title="Refresh" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={17} />
        </button>
      </header>

      <section className="toolbar" aria-label="Filters">
        <label className="field">
          <span>
            <CalendarDays size={14} /> Start
          </span>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>
            <CalendarDays size={14} /> End
          </span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
          />
        </label>
        <label className="field domain-field">
          <span>
            <Search size={14} /> Domain
          </span>
          <input
            type="search"
            placeholder="example.com"
            value={filters.domainQuery}
            onChange={(event) => setFilters((current) => ({ ...current, domainQuery: event.target.value }))}
          />
        </label>
        <button className="primary-button" type="button" onClick={() => void load()} disabled={busy}>
          <Filter size={15} /> Apply
        </button>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="summary-grid" aria-label="Summary statistics">
        <MetricCard icon={<BarChart3 size={16} />} label="Visits" value={formatNumber(insights?.totals.visitCount ?? 0)} />
        <MetricCard icon={<TimerReset size={16} />} label="Tracked time" value={formatDuration(insights?.totals.trackedMs ?? 0)} />
        <MetricCard label="Domains" value={formatNumber(insights?.totals.domainCount ?? 0)} />
        <MetricCard label="Pages" value={formatNumber(insights?.totals.pageCount ?? 0)} />
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>Behavior</h2>
          <div className="button-row">
            <button type="button" onClick={() => void exportData("json")} disabled={busy}>
              <FileJson2 size={15} /> JSON
            </button>
            <button type="button" onClick={() => void exportData("csv")} disabled={busy}>
              <Download size={15} /> CSV
            </button>
          </div>
        </div>
        <div className="insight-list">
          {(insights?.behavior ?? []).map((item) => (
            <div className="insight-row" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        <p className="coverage-note">{insights?.localTimeCoverage.note}</p>
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>Domains</h2>
          <span>{formatNumber(state?.historyItemCount ?? 0)} history rows scanned</span>
        </div>
        <div className="domain-list">
          {(insights?.topDomains ?? []).slice(0, 12).map((domain) => (
            <article className="domain-row" key={domain.domain}>
              <div className="domain-main">
                <strong>{domain.domain}</strong>
                <span>{domain.pageCount} pages</span>
              </div>
              <div className="bar-stack" aria-label={`${domain.domain} tracked time and visits`}>
                <div className="bar-line">
                  <span style={{ inlineSize: `${Math.max(4, (domain.trackedMs / topTrackedMs) * 100)}%` }} />
                </div>
                <div className="bar-line visit-line">
                  <span style={{ inlineSize: `${Math.max(4, (domain.visitCount / topVisits) * 100)}%` }} />
                </div>
              </div>
              <div className="domain-stats">
                <strong>{formatDuration(domain.trackedMs)}</strong>
                <span>{formatNumber(domain.visitCount)} visits</span>
              </div>
            </article>
          ))}
          {insights && insights.topDomains.length === 0 ? <EmptyState /> : null}
        </div>
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>Hourly Activity</h2>
        </div>
        <div className="hour-grid" aria-label="Visits by hour">
          {(insights?.hourlyVisits ?? []).map((hour) => (
            <div className="hour-cell" key={hour.hour} title={`${hour.hour}:00, ${hour.visits} visits`}>
              <span style={{ blockSize: `${Math.max(6, (hour.visits / topHourlyVisits) * 100)}%` }} />
              <small>{hour.hour % 6 === 0 ? hour.hour : ""}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>Top Pages</h2>
        </div>
        <div className="page-list">
          {(insights?.topDomains ?? []).slice(0, 5).flatMap((domain) =>
            domain.topPages.slice(0, 3).map((page) => (
              <div className="page-row" key={`${domain.domain}:${page.url}`}>
                <div>
                  <strong title={page.title}>{page.title}</strong>
                  <span title={page.url}>{domain.domain}</span>
                </div>
                <div>
                  <strong>{formatNumber(page.visitCount)}</strong>
                  <span>{formatDateTime(page.lastVisitTime)}</span>
                </div>
              </div>
            )),
          )}
        </div>
      </section>
    </main>
  );
}

function MetricCard({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }): React.ReactElement {
  return (
    <div className="metric-card">
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="empty-state">
      <Search size={18} />
      <strong>No matching history</strong>
    </div>
  );
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
