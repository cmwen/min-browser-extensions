import { DEFAULT_LLM_PROVIDERS, type ManagedTabGroup, type TabSnapshot } from "@minext/core";
import { describe, expect, it } from "vitest";
import {
  collectLlmTabIds,
  reconcileManagedGroupsWithBrowser,
  type BrowserTabGroupState,
} from "./group-state";

function tab(id: number, url: string, groupId = -1): TabSnapshot {
  return {
    active: false,
    groupId,
    id,
    pinned: false,
    title: `Tab ${id}`,
    url,
    windowId: 1,
  };
}

function group(
  id: string,
  title: string,
  tabIds: number[],
  browserGroupId?: number,
): ManagedTabGroup {
  return {
    color: id === "llm:workbench" ? "purple" : "cyan",
    createdAt: 1,
    id,
    kind: id === "llm:workbench" ? "llm" : "domain",
    tabIds,
    title,
    updatedAt: 1,
    ...(typeof browserGroupId === "number" ? { browserGroupId } : {}),
  };
}

describe("collectLlmTabIds", () => {
  it("includes a newly opened Launchpad tab before its URL is observable", () => {
    const tabs = [tab(1, "https://gemini.google.com/app")];

    expect(collectLlmTabIds(tabs, DEFAULT_LLM_PROVIDERS, [2])).toEqual([1, 2]);
  });
});

describe("reconcileManagedGroupsWithBrowser", () => {
  it("removes stale duplicate records and mirrors native tab membership", () => {
    const tabs = [
      tab(1, "https://aistudio.google.com", 5),
      tab(2, "https://example.com"),
    ];
    const groups = [
      group("domain:google", "Google", [1], 5),
      group("browser-group:old-a", "Google", [2], 5),
      group("browser-group:old-b", "Google", [2], 5),
    ];
    const browserGroups = new Map<number, BrowserTabGroupState>([
      [5, { color: "cyan", id: 5, title: "Google" }],
    ]);

    expect(reconcileManagedGroupsWithBrowser(tabs, groups, browserGroups, 10)).toEqual([
      {
        browserGroupId: 5,
        color: "cyan",
        createdAt: 1,
        id: "domain:google",
        kind: "domain",
        tabIds: [1],
        title: "Google",
        updatedAt: 10,
      },
    ]);
  });

  it("prefers the matching native title when a browser group ID was reused", () => {
    const tabs = [
      tab(1, "https://gemini.google.com/app", 5),
      tab(2, "https://chatgpt.com", 5),
    ];
    const groups = [
      group("domain:google", "Google", [1], 5),
      group("llm:workbench", "LLM Workbench", [2], 8),
    ];
    const browserGroups = new Map<number, BrowserTabGroupState>([
      [5, { color: "purple", id: 5, title: "LLM Workbench" }],
    ]);

    expect(reconcileManagedGroupsWithBrowser(tabs, groups, browserGroups, 10)).toEqual([
      {
        browserGroupId: 5,
        color: "purple",
        createdAt: 1,
        id: "llm:workbench",
        kind: "llm",
        tabIds: [1, 2],
        title: "LLM Workbench",
        updatedAt: 10,
      },
    ]);
  });

  it("preserves managed-only fallback groups without duplicating native tabs", () => {
    const tabs = [
      tab(1, "https://gemini.google.com/app", 5),
      tab(2, "https://example.com"),
    ];
    const groups = [
      group("llm:workbench", "LLM Workbench", [1], 5),
      group("fallback", "Fallback", [1, 2]),
    ];
    const browserGroups = new Map<number, BrowserTabGroupState>([
      [5, { color: "purple", id: 5, title: "LLM Workbench" }],
    ]);

    expect(reconcileManagedGroupsWithBrowser(tabs, groups, browserGroups, 10)).toEqual([
      expect.objectContaining({ id: "llm:workbench", tabIds: [1] }),
      expect.objectContaining({ id: "fallback", tabIds: [2] }),
    ]);
  });
});
