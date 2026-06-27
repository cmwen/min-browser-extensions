import type { BrowserGroupColor, DomainGroup } from "./types";

const GROUP_COLORS: BrowserGroupColor[] = ["blue", "green", "purple", "cyan", "orange", "pink", "yellow", "red", "grey"];
const COMMON_SECOND_LEVEL_SUFFIXES = new Set(["co.uk", "com.au", "co.nz", "com.br", "co.jp", "com.sg", "com.mx"]);

export type UrlLikeTab = {
  id?: number;
  title?: string;
  url?: string;
};

export function normalizeUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

export function domainKeyForUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = normalizeUrl(value);
  if (!parsed || parsed.protocol === "chrome:" || parsed.protocol === "edge:" || parsed.protocol === "about:") {
    return undefined;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return host || undefined;
  }

  const parts = host.split(".");
  if (parts.length <= 2) {
    return host;
  }

  const suffix = parts.slice(-2).join(".");
  if (COMMON_SECOND_LEVEL_SUFFIXES.has(suffix) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

export function titleForDomain(domain: string): string {
  if (domain === "localhost") {
    return "Localhost";
  }

  return domain
    .split(".")
    .filter(Boolean)
    .slice(0, -1)
    .join(".")
    .replace(/[.-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function groupColorForDomain(domain: string): BrowserGroupColor {
  const hash = [...domain].reduce((value, char) => value + char.charCodeAt(0), 0);
  return GROUP_COLORS[hash % GROUP_COLORS.length] ?? "grey";
}

export function groupTabsByDomain<TTab extends UrlLikeTab>(
  tabs: TTab[],
  options: { excludedDomains?: string[]; minimumTabsPerGroup?: number } = {},
): DomainGroup<TTab>[] {
  const minimumTabsPerGroup = options.minimumTabsPerGroup ?? 2;
  const excluded = new Set(options.excludedDomains ?? []);
  const groups = new Map<string, TTab[]>();

  for (const tab of tabs) {
    const domain = domainKeyForUrl(tab.url);
    if (!domain || excluded.has(domain)) {
      continue;
    }

    const group = groups.get(domain) ?? [];
    group.push(tab);
    groups.set(domain, group);
  }

  return [...groups.entries()]
    .filter(([, groupedTabs]) => groupedTabs.length >= minimumTabsPerGroup)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([domain, groupedTabs]) => ({
      color: groupColorForDomain(domain),
      domain,
      tabs: groupedTabs,
      title: titleForDomain(domain),
    }));
}
