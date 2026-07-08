import {
  providerForUrl,
  type BrowserGroupColor,
  type LlmProvider,
  type ManagedTabGroup,
  type TabSnapshot,
} from "@minext/core";

export type BrowserTabGroupState = {
  color?: string;
  id: number;
  title?: string;
};

function normalizedTitle(title: string | undefined): string {
  return title?.trim().toLocaleLowerCase() ?? "";
}

function browserGroupColor(value: string | undefined): BrowserGroupColor {
  const colors = new Set<BrowserGroupColor>([
    "grey",
    "blue",
    "red",
    "yellow",
    "green",
    "pink",
    "purple",
    "cyan",
    "orange",
  ]);
  return colors.has(value as BrowserGroupColor) ? (value as BrowserGroupColor) : "grey";
}

function candidateScore(
  group: ManagedTabGroup,
  browserGroup: BrowserTabGroupState | undefined,
  browserGroupId: number,
  tabIds: Set<number>,
): readonly [number, number, number, number] {
  const titleMatches = Boolean(
    normalizedTitle(browserGroup?.title) &&
      normalizedTitle(browserGroup?.title) === normalizedTitle(group.title),
  );
  const idMatches = group.browserGroupId === browserGroupId;
  const overlap = group.tabIds.filter((tabId) => tabIds.has(tabId)).length;
  const semanticKind = group.kind === "llm" || group.kind === "workspace" ? 1 : 0;
  return [titleMatches ? 1 : 0, idMatches ? 1 : 0, overlap, semanticKind];
}

function compareScores(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export function collectLlmTabIds(
  tabs: TabSnapshot[],
  providers: LlmProvider[],
  explicitlyOpenedTabIds: number[] = [],
): number[] {
  return [
    ...new Set([
      ...tabs.filter((tab) => providerForUrl(tab.url, providers)).map((tab) => tab.id),
      ...explicitlyOpenedTabIds,
    ]),
  ];
}

export function reconcileManagedGroupsWithBrowser(
  tabs: TabSnapshot[],
  groups: ManagedTabGroup[],
  browserGroups: Map<number, BrowserTabGroupState>,
  now = Date.now(),
): ManagedTabGroup[] {
  const liveTabIds = new Set(tabs.map((tab) => tab.id));
  const tabsByBrowserGroup = new Map<number, number[]>();

  for (const tab of tabs) {
    if (typeof tab.groupId !== "number" || tab.groupId < 0) {
      continue;
    }

    const tabIds = tabsByBrowserGroup.get(tab.groupId) ?? [];
    tabIds.push(tab.id);
    tabsByBrowserGroup.set(tab.groupId, tabIds);
  }

  const assignedGroupIds = new Set<string>();
  const replacementsByGroupId = new Map<string, ManagedTabGroup>();
  const newBrowserGroups: ManagedTabGroup[] = [];

  for (const [browserGroupId, tabIds] of tabsByBrowserGroup) {
    const tabIdSet = new Set(tabIds);
    const browserGroup = browserGroups.get(browserGroupId);
    const candidates = groups
      .filter((group) => !assignedGroupIds.has(group.id))
      .map((group) => ({
        group,
        score: candidateScore(group, browserGroup, browserGroupId, tabIdSet),
      }))
      .filter(({ score }) => score[0] > 0 || score[1] > 0 || score[2] > 0)
      .sort((left, right) => {
        const scoreDifference = compareScores(right.score, left.score);
        return scoreDifference || right.group.updatedAt - left.group.updatedAt;
      });
    const candidate = candidates[0]?.group;
    const next: ManagedTabGroup = {
      browserGroupId,
      color: browserGroup?.color ? browserGroupColor(browserGroup.color) : (candidate?.color ?? "grey"),
      createdAt: candidate?.createdAt ?? now,
      id: candidate?.id ?? `browser-group:${browserGroupId}`,
      kind: candidate?.kind ?? "domain",
      tabIds,
      title: browserGroup?.title?.trim() || candidate?.title || "Browser group",
      updatedAt: now,
    };

    assignedGroupIds.add(next.id);
    if (candidate) {
      replacementsByGroupId.set(candidate.id, next);
    } else {
      newBrowserGroups.push(next);
    }
  }

  const claimedTabIds = new Set(Array.from(tabsByBrowserGroup.values()).flat());
  const emittedGroupIds = new Set<string>();
  const reconciled: ManagedTabGroup[] = [];

  for (const group of groups) {
    const replacement = replacementsByGroupId.get(group.id);
    if (replacement) {
      if (!emittedGroupIds.has(replacement.id)) {
        reconciled.push(replacement);
        emittedGroupIds.add(replacement.id);
      }
      continue;
    }

    if (typeof group.browserGroupId === "number" || emittedGroupIds.has(group.id)) {
      continue;
    }

    const tabIds = group.tabIds.filter((tabId) => liveTabIds.has(tabId) && !claimedTabIds.has(tabId));
    if (tabIds.length === 0) {
      continue;
    }

    tabIds.forEach((tabId) => claimedTabIds.add(tabId));
    reconciled.push({ ...group, tabIds });
    emittedGroupIds.add(group.id);
  }

  for (const group of newBrowserGroups) {
    if (!emittedGroupIds.has(group.id)) {
      reconciled.push(group);
      emittedGroupIds.add(group.id);
    }
  }

  return reconciled;
}
