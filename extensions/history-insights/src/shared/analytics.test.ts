import { describe, expect, it } from "vitest";
import { addDwellSegment, buildHistoryInsights, domainInsightsToCsv, localDateKey } from "./analytics";

describe("addDwellSegment", () => {
  it("adds local active time by domain and day", () => {
    const startedAt = new Date(2026, 0, 1, 10, 0).getTime();
    const endedAt = new Date(2026, 0, 1, 10, 30).getTime();
    const cache = addDwellSegment({}, { domain: "example.com", endedAt, startedAt });

    expect(cache["example.com"]?.totalMs).toBe(30 * 60_000);
    expect(cache["example.com"]?.daily[localDateKey(startedAt)]).toBe(30 * 60_000);
  });

  it("splits a segment that crosses local midnight", () => {
    const startedAt = new Date(2026, 0, 1, 23, 50).getTime();
    const endedAt = new Date(2026, 0, 2, 0, 10).getTime();
    const cache = addDwellSegment({}, { domain: "example.com", endedAt, startedAt });

    expect(cache["example.com"]?.daily["2026-01-01"]).toBe(10 * 60_000);
    expect(cache["example.com"]?.daily["2026-01-02"]).toBe(10 * 60_000);
  });
});

describe("buildHistoryInsights", () => {
  it("aggregates visits, pages, typed counts, and tracked time by normalized domain", () => {
    const startTime = new Date(2026, 0, 1).getTime();
    const endTime = new Date(2026, 0, 2).getTime() - 1;
    const cache = addDwellSegment(
      {},
      {
        domain: "example.com",
        endedAt: new Date(2026, 0, 1, 10, 20).getTime(),
        startedAt: new Date(2026, 0, 1, 10, 0).getTime(),
      },
    );

    const insights = buildHistoryInsights(
      [
        {
          lastVisitTime: new Date(2026, 0, 1, 9, 0).getTime(),
          title: "Docs",
          typedCount: 1,
          url: "https://docs.example.com/start",
          visitCount: 3,
        },
        {
          lastVisitTime: new Date(2026, 0, 1, 11, 0).getTime(),
          title: "Home",
          url: "https://www.example.com/",
          visitCount: 2,
        },
      ],
      cache,
      { endTime, startTime },
    );

    expect(insights.totals.domainCount).toBe(1);
    expect(insights.totals.visitCount).toBe(5);
    expect(insights.totals.typedCount).toBe(1);
    expect(insights.topDomains[0]?.domain).toBe("example.com");
    expect(insights.topDomains[0]?.pageCount).toBe(2);
    expect(insights.topDomains[0]?.trackedMs).toBe(20 * 60_000);
    expect(insights.hourlyVisits[9]?.visits).toBe(3);
  });

  it("filters by domain query", () => {
    const insights = buildHistoryInsights(
      [
        {
          lastVisitTime: new Date(2026, 0, 1, 9, 0).getTime(),
          url: "https://example.com/",
          visitCount: 1,
        },
        {
          lastVisitTime: new Date(2026, 0, 1, 9, 5).getTime(),
          url: "https://openai.com/",
          visitCount: 4,
        },
      ],
      {},
      {
        domainQuery: "openai",
        endTime: new Date(2026, 0, 2).getTime() - 1,
        startTime: new Date(2026, 0, 1).getTime(),
      },
    );

    expect(insights.totals.domainCount).toBe(1);
    expect(insights.topDomains[0]?.domain).toBe("openai.com");
  });

  it("exports domain rows as csv", () => {
    const insights = buildHistoryInsights(
      [
        {
          lastVisitTime: new Date(2026, 0, 1, 9, 0).getTime(),
          title: "Example",
          url: "https://example.com/",
          visitCount: 1,
        },
      ],
      {},
      {
        endTime: new Date(2026, 0, 2).getTime() - 1,
        startTime: new Date(2026, 0, 1).getTime(),
      },
    );

    expect(domainInsightsToCsv(insights).split("\n")[0]).toBe(
      "domain,title,visits,typed_count,page_count,tracked_minutes,last_visit",
    );
  });
});
