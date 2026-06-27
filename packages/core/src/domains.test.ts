import { describe, expect, it } from "vitest";
import { domainKeyForUrl, groupTabsByDomain, titleForDomain } from "./domains";

describe("domainKeyForUrl", () => {
  it("normalizes regular domains", () => {
    expect(domainKeyForUrl("https://www.example.com/docs")).toBe("example.com");
    expect(domainKeyForUrl("https://app.chatgpt.com/c/123")).toBe("chatgpt.com");
  });

  it("keeps common second-level suffixes intact", () => {
    expect(domainKeyForUrl("https://news.bbc.co.uk/story")).toBe("bbc.co.uk");
    expect(domainKeyForUrl("https://shop.example.com.au/cart")).toBe("example.com.au");
  });

  it("ignores browser internal pages", () => {
    expect(domainKeyForUrl("chrome://extensions")).toBeUndefined();
    expect(domainKeyForUrl("edge://settings")).toBeUndefined();
  });
});

describe("groupTabsByDomain", () => {
  it("groups only domains that meet the configured minimum", () => {
    const groups = groupTabsByDomain(
      [
        { id: 1, url: "https://a.example.com" },
        { id: 2, url: "https://example.com/docs" },
        { id: 3, url: "https://openai.com" },
      ],
      { minimumTabsPerGroup: 2 },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.domain).toBe("example.com");
    expect(groups[0]?.tabs.map((tab) => tab.id)).toEqual([1, 2]);
  });

  it("excludes configured domains", () => {
    const groups = groupTabsByDomain(
      [
        { id: 1, url: "https://example.com" },
        { id: 2, url: "https://docs.example.com" },
      ],
      { excludedDomains: ["example.com"], minimumTabsPerGroup: 2 },
    );

    expect(groups).toEqual([]);
  });
});

describe("titleForDomain", () => {
  it("creates short group titles", () => {
    expect(titleForDomain("example.com")).toBe("Example");
    expect(titleForDomain("my-app.example.com")).toBe("My App Example");
  });
});
