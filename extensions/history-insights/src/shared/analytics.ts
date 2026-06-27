import { domainKeyForUrl, titleForDomain } from "@minext/core";

export type HistoryLikeItem = {
  id?: string;
  lastVisitTime?: number;
  title?: string;
  typedCount?: number;
  url?: string;
  visitCount?: number;
};

export type DomainDwellEntry = {
  daily: Record<string, number>;
  domain: string;
  totalMs: number;
  updatedAt: number;
};

export type DomainDwellCache = Record<string, DomainDwellEntry>;

export type InsightFilters = {
  domainQuery?: string;
  endTime: number;
  startTime: number;
};

export type PageInsight = {
  lastVisitTime: number;
  title: string;
  url: string;
  visitCount: number;
};

export type DomainInsight = {
  domain: string;
  lastVisitTime: number;
  pageCount: number;
  title: string;
  topPages: PageInsight[];
  trackedMs: number;
  typedCount: number;
  visitCount: number;
};

export type BehaviorInsight = {
  label: string;
  value: string;
};

export type HistoryInsights = {
  behavior: BehaviorInsight[];
  generatedAt: string;
  hourlyVisits: Array<{ hour: number; visits: number }>;
  localTimeCoverage: {
    hasTrackedTime: boolean;
    note: string;
    trackedMs: number;
  };
  topDomains: DomainInsight[];
  totals: {
    avgTrackedMinutesPerVisit: number;
    domainCount: number;
    pageCount: number;
    trackedMs: number;
    typedCount: number;
    visitCount: number;
  };
};

export type DwellSegment = {
  domain: string;
  endedAt: number;
  startedAt: number;
};

const DAY_MS = 24 * 60 * 60_000;

export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function rangeDateKeys(startTime: number, endTime: number): Set<string> {
  const keys = new Set<string>();
  let cursor = startOfLocalDay(startTime);
  const last = startOfLocalDay(endTime);

  while (cursor <= last) {
    keys.add(localDateKey(cursor));
    cursor += DAY_MS;
  }

  return keys;
}

export function splitDwellSegmentByLocalDay(segment: DwellSegment): Record<string, number> {
  if (segment.endedAt <= segment.startedAt) {
    return {};
  }

  const daily: Record<string, number> = {};
  let cursor = segment.startedAt;

  while (cursor < segment.endedAt) {
    const dayStart = startOfLocalDay(cursor);
    const nextDay = dayStart + DAY_MS;
    const segmentEnd = Math.min(nextDay, segment.endedAt);
    const key = localDateKey(cursor);
    daily[key] = (daily[key] ?? 0) + (segmentEnd - cursor);
    cursor = segmentEnd;
  }

  return daily;
}

export function addDwellSegment(cache: DomainDwellCache, segment: DwellSegment): DomainDwellCache {
  const daily = splitDwellSegmentByLocalDay(segment);
  const duration = Object.values(daily).reduce((sum, value) => sum + value, 0);
  if (duration <= 0) {
    return cache;
  }

  const current = cache[segment.domain] ?? {
    daily: {},
    domain: segment.domain,
    totalMs: 0,
    updatedAt: segment.endedAt,
  };

  const nextDaily = { ...current.daily };
  for (const [key, value] of Object.entries(daily)) {
    nextDaily[key] = (nextDaily[key] ?? 0) + value;
  }

  return {
    ...cache,
    [segment.domain]: {
      daily: nextDaily,
      domain: segment.domain,
      totalMs: current.totalMs + duration,
      updatedAt: segment.endedAt,
    },
  };
}

function trackedMsForRange(entry: DomainDwellEntry | undefined, filters: InsightFilters): number {
  if (!entry) {
    return 0;
  }

  const keys = rangeDateKeys(filters.startTime, filters.endTime);
  return Object.entries(entry.daily).reduce((sum, [key, value]) => (keys.has(key) ? sum + value : sum), 0);
}

function emptyHourlyVisits(): Array<{ hour: number; visits: number }> {
  return Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 0 }));
}

function matchesDomainQuery(domain: string, query: string | undefined): boolean {
  const normalized = query?.trim().toLowerCase();
  return !normalized || domain.includes(normalized);
}

function addPage(domain: DomainInsight, item: HistoryLikeItem, visitCount: number): DomainInsight {
  if (!item.url) {
    return domain;
  }

  const pageIndex = domain.topPages.findIndex((page) => page.url === item.url);
  if (pageIndex === -1) {
    return {
      ...domain,
      topPages: [
        ...domain.topPages,
        {
          lastVisitTime: item.lastVisitTime ?? 0,
          title: item.title?.trim() || item.url,
          url: item.url,
          visitCount,
        },
      ],
    };
  }

  const topPages = domain.topPages.map((page, index) =>
    index === pageIndex
      ? {
          ...page,
          lastVisitTime: Math.max(page.lastVisitTime, item.lastVisitTime ?? 0),
          visitCount: page.visitCount + visitCount,
        }
      : page,
  );
  return { ...domain, topPages };
}

export function buildHistoryInsights(
  historyItems: HistoryLikeItem[],
  dwellCache: DomainDwellCache,
  filters: InsightFilters,
): HistoryInsights {
  const hourlyVisits = emptyHourlyVisits();
  const domains = new Map<string, DomainInsight>();

  for (const item of historyItems) {
    if (!item.url || !item.lastVisitTime || item.lastVisitTime < filters.startTime || item.lastVisitTime > filters.endTime) {
      continue;
    }

    const domain = domainKeyForUrl(item.url);
    if (!domain || !matchesDomainQuery(domain, filters.domainQuery)) {
      continue;
    }

    const visitCount = Math.max(1, item.visitCount ?? 1);
    const typedCount = Math.max(0, item.typedCount ?? 0);
    const hour = new Date(item.lastVisitTime).getHours();
    const hourly = hourlyVisits[hour];
    if (hourly) {
      hourly.visits += visitCount;
    }

    const current =
      domains.get(domain) ??
      ({
        domain,
        lastVisitTime: 0,
        pageCount: 0,
        title: titleForDomain(domain),
        topPages: [],
        trackedMs: trackedMsForRange(dwellCache[domain], filters),
        typedCount: 0,
        visitCount: 0,
      } satisfies DomainInsight);

    const withPage = addPage(current, item, visitCount);
    domains.set(domain, {
      ...withPage,
      lastVisitTime: Math.max(withPage.lastVisitTime, item.lastVisitTime),
      pageCount: withPage.topPages.length,
      topPages: withPage.topPages
        .sort((left, right) => right.visitCount - left.visitCount || right.lastVisitTime - left.lastVisitTime)
        .slice(0, 5),
      typedCount: withPage.typedCount + typedCount,
      visitCount: withPage.visitCount + visitCount,
    });
  }

  const topDomains = [...domains.values()].sort(
    (left, right) =>
      right.trackedMs - left.trackedMs || right.visitCount - left.visitCount || right.lastVisitTime - left.lastVisitTime,
  );
  const totals = topDomains.reduce(
    (summary, domain) => ({
      domainCount: summary.domainCount + 1,
      pageCount: summary.pageCount + domain.pageCount,
      trackedMs: summary.trackedMs + domain.trackedMs,
      typedCount: summary.typedCount + domain.typedCount,
      visitCount: summary.visitCount + domain.visitCount,
    }),
    { domainCount: 0, pageCount: 0, trackedMs: 0, typedCount: 0, visitCount: 0 },
  );
  const busiestHour = hourlyVisits.reduce((best, item) => (item.visits > best.visits ? item : best), hourlyVisits[0] ?? { hour: 0, visits: 0 });
  const topDomain = topDomains[0];
  const topDomainShare = topDomain && totals.visitCount > 0 ? Math.round((topDomain.visitCount / totals.visitCount) * 100) : 0;
  const avgTrackedMinutesPerVisit = totals.visitCount > 0 ? totals.trackedMs / totals.visitCount / 60_000 : 0;

  return {
    behavior: [
      { label: "Most visited domain", value: topDomain ? `${topDomain.domain} (${topDomainShare}%)` : "No history in range" },
      { label: "Busiest hour", value: busiestHour.visits > 0 ? `${String(busiestHour.hour).padStart(2, "0")}:00` : "No visits" },
      { label: "Context spread", value: `${totals.domainCount} domains across ${totals.pageCount} pages` },
      { label: "Typed navigation", value: `${totals.typedCount} direct entries` },
    ],
    generatedAt: new Date().toISOString(),
    hourlyVisits,
    localTimeCoverage: {
      hasTrackedTime: totals.trackedMs > 0,
      note: "Time is tracked locally from active tabs after installation; browser history itself does not expose reliable dwell time.",
      trackedMs: totals.trackedMs,
    },
    topDomains,
    totals: {
      ...totals,
      avgTrackedMinutesPerVisit,
    },
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function domainInsightsToCsv(insights: HistoryInsights): string {
  const rows = [
    ["domain", "title", "visits", "typed_count", "page_count", "tracked_minutes", "last_visit"],
    ...insights.topDomains.map((domain) => [
      domain.domain,
      domain.title,
      domain.visitCount,
      domain.typedCount,
      domain.pageCount,
      Math.round(domain.trackedMs / 60_000),
      domain.lastVisitTime ? new Date(domain.lastVisitTime).toISOString() : "",
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
