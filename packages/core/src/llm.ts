import { domainKeyForUrl, normalizeUrl } from "./domains";
import type { AppConfig, LlmConversation, LlmConversationStatus, LlmProvider, TabSnapshot } from "./types";

export const AUTO_PAGE_SUMMARY_PROVIDER_ID = "auto";
export const NO_PAGE_SUMMARY_PROVIDER_ID = "none";

export function providerForUrl(url: string | undefined, providers: LlmProvider[]): LlmProvider | undefined {
  const parsed = url ? normalizeUrl(url) : undefined;
  const host = parsed?.hostname.toLowerCase().replace(/^www\./, "");
  if (!host) {
    return undefined;
  }

  return providers.find((provider) =>
    provider.enabled &&
    provider.urlPatterns.some((pattern) => {
      const normalizedPattern = pattern.toLowerCase().replace(/^www\./, "");
      return host === normalizedPattern || host.endsWith(`.${normalizedPattern}`);
    }),
  );
}

export function providerSupportsDeepLink(provider: LlmProvider): boolean {
  return Boolean(provider.deepLinkTemplate?.includes("{prompt}"));
}

export function pageSummaryProvider(config: AppConfig): LlmProvider | undefined {
  const candidates = config.llmProviders.filter((provider) => provider.enabled && providerSupportsDeepLink(provider));
  const providerId = config.pageSummary.providerId;

  if (providerId === NO_PAGE_SUMMARY_PROVIDER_ID || candidates.length === 0) {
    return undefined;
  }

  if (providerId === AUTO_PAGE_SUMMARY_PROVIDER_ID) {
    return candidates[0];
  }

  return candidates.find((provider) => provider.id === providerId);
}

export function pageSummaryPrompt(url: string): string {
  return `Summarize this page:\n\n${url}`;
}

export function pageSummaryDeepLink(provider: LlmProvider, url: string): string | undefined {
  if (!providerSupportsDeepLink(provider) || !provider.deepLinkTemplate) {
    return undefined;
  }

  return provider.deepLinkTemplate
    .replaceAll("{prompt}", encodeURIComponent(pageSummaryPrompt(url)))
    .replaceAll("{url}", encodeURIComponent(url));
}

export function inferConversationTopic(tab: Pick<TabSnapshot, "title" | "url">, provider?: LlmProvider): string {
  const fallback = provider?.name ?? domainKeyForUrl(tab.url) ?? "LLM";
  const title = tab.title.replace(/\s[-|]\s.*$/, "").trim();
  return title && !title.toLowerCase().includes("new chat") ? title : `${fallback} conversation`;
}

export function statusForTabLoad(status: string | undefined): LlmConversationStatus {
  if (status === "loading") {
    return "waiting";
  }

  if (status === "complete") {
    return "responded";
  }

  return "active";
}

export function conversationFromTab(
  tab: TabSnapshot,
  provider: LlmProvider,
  status: LlmConversationStatus = "active",
): LlmConversation {
  return {
    providerId: provider.id,
    status,
    tabId: tab.id,
    title: tab.title || provider.name,
    topic: inferConversationTopic(tab, provider),
    updatedAt: Date.now(),
    url: tab.url,
    windowId: tab.windowId,
  };
}
