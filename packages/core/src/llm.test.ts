import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_LLM_PROVIDERS, mergeConfig } from "./config";
import {
  NO_PAGE_SUMMARY_PROVIDER_ID,
  pageSummaryDeepLink,
  pageSummaryProvider,
  providerForUrl,
} from "./llm";

describe("providerForUrl", () => {
  it("matches provider hostnames before registrable domain grouping", () => {
    expect(providerForUrl("https://gemini.google.com/app", DEFAULT_LLM_PROVIDERS)?.id).toBe("gemini");
    expect(providerForUrl("https://copilot.microsoft.com/chats/new", DEFAULT_LLM_PROVIDERS)?.id).toBe("copilot");
  });

  it("matches provider subdomains", () => {
    expect(providerForUrl("https://app.chatgpt.com/c/123", DEFAULT_LLM_PROVIDERS)?.id).toBe("chatgpt");
  });
});

describe("page summary provider", () => {
  it("uses the first enabled provider with deep-link support by default", () => {
    expect(pageSummaryProvider(DEFAULT_CONFIG)?.id).toBe("chatgpt");
  });

  it("skips disabled and unsupported providers", () => {
    const config = mergeConfig({
      ...DEFAULT_CONFIG,
      llmProviders: DEFAULT_CONFIG.llmProviders.map((provider) =>
        provider.id === "chatgpt" ? { ...provider, enabled: false } : provider,
      ),
    });

    expect(pageSummaryProvider(config)?.id).toBe("perplexity");
  });

  it("can be disabled explicitly", () => {
    const config = mergeConfig({
      ...DEFAULT_CONFIG,
      pageSummary: { providerId: NO_PAGE_SUMMARY_PROVIDER_ID },
    });

    expect(pageSummaryProvider(config)).toBeUndefined();
  });

  it("builds encoded prompt URLs", () => {
    const provider = pageSummaryProvider(DEFAULT_CONFIG);
    expect(provider).toBeDefined();

    const deepLink = pageSummaryDeepLink(provider!, "https://www.youtube.com/watch?v=abc 123");
    expect(deepLink).toContain("https://chatgpt.com/?q=");
    expect(deepLink).toContain("Summarize%20this%20page");
    expect(deepLink).toContain("https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc%20123");
  });

  it("hydrates default deep-link templates into saved provider configs", () => {
    const config = mergeConfig({
      llmProviders: DEFAULT_LLM_PROVIDERS.map((provider) => ({
        enabled: provider.enabled,
        groupTitle: provider.groupTitle,
        id: provider.id,
        name: provider.name,
        url: provider.url,
        urlPatterns: provider.urlPatterns,
      })),
    });

    expect(config.llmProviders.find((provider) => provider.id === "chatgpt")?.deepLinkTemplate).toBe("https://chatgpt.com/?q={prompt}");
  });
});
