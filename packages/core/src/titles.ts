import type { TitleRewriteConfig } from "./types";

export function rewritePageTitle(title: string, config: TitleRewriteConfig): string {
  if (!config.enabled) {
    return title;
  }

  return config.rules
    .filter((rule) => rule.enabled && rule.pattern.trim())
    .reduce((current, rule) => {
      if (rule.match === "contains") {
        return current.replaceAll(rule.pattern, rule.replacement).trim();
      }

      try {
        return current.replace(new RegExp(rule.pattern, "gi"), rule.replacement).trim();
      } catch {
        return current;
      }
    }, title)
    .replace(/\s{2,}/g, " ")
    .trim();
}
