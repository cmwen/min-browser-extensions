import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  Bell,
  Bot,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Globe2,
  Info,
  Keyboard,
  LayoutPanelLeft,
  Layers2,
  Pin,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  DEFAULT_CONFIG,
  type AppConfig,
  type FollowUpItem,
  type FollowUpStatus,
  type LlmConversationStatus,
  type TabSnapshot,
  type WorkspaceTemplate,
} from "@minext/core";
import { webext } from "@minext/browser-api";
import type { ExtensionMessage, ExtensionResponse, PanelState, RuntimeEvent } from "../shared/messages";
import "./styles.css";

const root = document.getElementById("root");
type PanelMode = "context" | "grouped" | "follow-up";

if (!root) {
  throw new Error("Missing app root");
}

async function sendMessage<T extends ExtensionResponse>(message: ExtensionMessage): Promise<T> {
  const response = (await webext.runtime.sendMessage(message)) as T;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response;
}

function statusLabel(status: LlmConversationStatus): string {
  switch (status) {
    case "needs-review":
      return "Needs review";
    case "responded":
      return "Responded";
    case "waiting":
      return "Waiting";
    case "pinned":
      return "Pinned";
    case "stale":
      return "Stale";
    case "active":
      return "Active";
  }
}

function followUpStatusLabel(status: FollowUpStatus): string {
  switch (status) {
    case "needs-review":
      return "Needs review";
    case "snoozed":
      return "Snoozed";
    case "waiting":
      return "Waiting";
    case "done":
      return "Done";
    case "due":
      return "Due";
  }
}

function applyTheme(config: AppConfig): void {
  document.documentElement.dataset.theme = config.theme;
}

function tabMatchesQuery(tab: TabSnapshot, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return `${tab.title} ${tab.url}`.toLowerCase().includes(needle);
}

type RelationshipReason = {
  key: keyof AppConfig["contextMap"]["weights"];
  label: string;
  value: number;
};

type ContextTabItem = {
  dimension: "active" | "domain" | "time";
  groupTitle: string | undefined;
  relation: {
    reasons: RelationshipReason[];
    score: number;
  };
  slot: number;
  tab: TabSnapshot;
};

type SuggestedMode = {
  mode: PanelMode;
  reason: string;
};

type ReadLaterCleanupCandidate = {
  reason: string;
  tab: TabSnapshot;
};

type CleanupBatch = {
  itemIds: string[];
  savedAt: number;
};

function hostForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function minutesAgo(timestamp: number | undefined): string {
  if (!timestamp) {
    return "observed just now";
  }

  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  return `${Math.round(minutes / 60)}h ago`;
}

function formatReminder(timestamp: number | undefined): string {
  if (!timestamp) {
    return "No reminder";
  }

  const diff = timestamp - Date.now();
  const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
  if (diff <= 0) {
    return `Due ${absolute}`;
  }

  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) {
    return `Due in ${minutes}m`;
  }
  if (minutes < 60 * 24) {
    return `Due in ${Math.round(minutes / 60)}h`;
  }

  return `Due ${absolute}`;
}

function followUpSortValue(item: FollowUpItem): number {
  const statusRank: Record<FollowUpStatus, number> = {
    due: 0,
    "needs-review": 1,
    waiting: 2,
    snoozed: 3,
    done: 4,
  };
  return statusRank[item.status] * 10_000_000_000_000 + (item.reminderAt ?? item.updatedAt);
}

function reminderPreset(preset: "later" | "tomorrow" | "week"): number {
  const now = Date.now();
  if (preset === "later") {
    return now + 3 * 60 * 60_000;
  }
  if (preset === "tomorrow") {
    return now + 24 * 60 * 60_000;
  }
  return now + 7 * 24 * 60 * 60_000;
}

function dateTimeLocalValue(timestamp: number | undefined): string {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function durationLabel(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.round(hours / 24)}d`;
}

function isWebUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

function followUpIdForUrl(url: string): string {
  return `follow-up:${url}`;
}

function readLaterCandidateReason(tab: TabSnapshot, now = Date.now()): string | undefined {
  if (tab.active || tab.pinned || !isWebUrl(tab.url)) {
    return undefined;
  }

  const openedAt = tab.openedAt ?? tab.lastActiveAt;
  const lastActiveAt = tab.lastActiveAt ?? tab.openedAt;
  const openAge = openedAt ? now - openedAt : 0;
  const inactiveAge = lastActiveAt ? now - lastActiveAt : 0;

  if (openAge >= 24 * 60 * 60_000) {
    return `Open for ${durationLabel(openAge)}`;
  }
  if (inactiveAge >= 3 * 60 * 60_000 && openAge >= 45 * 60_000) {
    return `Inactive for ${durationLabel(inactiveAge)}`;
  }
  if (openAge >= 6 * 60 * 60_000) {
    return `Open for ${durationLabel(openAge)}`;
  }

  return undefined;
}

function buildReadLaterCleanupCandidates(input: {
  followUps: FollowUpItem[];
  query: string;
  tabs: TabSnapshot[];
}): ReadLaterCleanupCandidate[] {
  const { followUps, query, tabs } = input;
  const existingUrls = new Set(followUps.filter((item) => item.status !== "done").map((item) => item.url));
  const needle = query.trim().toLowerCase();

  return tabs
    .filter((tab) => !existingUrls.has(tab.url) && (!needle || tabMatchesQuery(tab, needle)))
    .map((tab) => ({ reason: readLaterCandidateReason(tab), tab }))
    .filter((candidate): candidate is ReadLaterCleanupCandidate => Boolean(candidate.reason))
    .sort((a, b) => (a.tab.lastActiveAt ?? a.tab.openedAt ?? 0) - (b.tab.lastActiveAt ?? b.tab.openedAt ?? 0));
}

function suggestPanelMode(input: {
  contextItems: ContextTabItem[];
  followUps: FollowUpItem[];
  readLaterCandidates: ReadLaterCleanupCandidate[];
}): SuggestedMode {
  const dueCount = input.followUps.filter((item) => item.status === "due" || item.status === "needs-review").length;
  if (dueCount > 0) {
    return { mode: "follow-up", reason: `${dueCount} follow-up item${dueCount === 1 ? " needs" : "s need"} attention` };
  }

  if (input.readLaterCandidates.length >= 3) {
    return { mode: "follow-up", reason: `${input.readLaterCandidates.length} tabs look ready to save for later` };
  }

  const relatedCount = input.contextItems.filter((item) => item.slot !== 0 && item.relation.score >= 0.42).length;
  if (relatedCount >= 3) {
    return { mode: "context", reason: `${relatedCount} tabs look related to the current tab` };
  }

  return { mode: "grouped", reason: "General tab management looks like the best fit" };
}

function relationSignalRows(item: ContextTabItem): Array<{ label: string; value: string }> {
  const reasonRows = item.relation.reasons.slice(0, 4).map((reason) => ({
    label: reason.label,
    value: `${Math.round(reason.value * 100)}%`,
  }));

  return [
    { label: "Rank score", value: `${Math.round(item.relation.score * 100)}%` },
    ...reasonRows,
    { label: "Opened", value: minutesAgo(item.tab.openedAt) },
    { label: "Last active", value: minutesAgo(item.tab.lastActiveAt) },
  ];
}

function scoreContextTab(input: {
  activeTab: TabSnapshot;
  conversationStatusByTabId: Map<number, LlmConversationStatus>;
  groupTitleByTabId: Map<number, string>;
  pinnedUrls: Set<string>;
  tab: TabSnapshot;
  weights: AppConfig["contextMap"]["weights"];
}): ContextTabItem["relation"] {
  const { activeTab, conversationStatusByTabId, groupTitleByTabId, pinnedUrls, tab, weights } = input;
  const reasons: RelationshipReason[] = [];
  let rawScore = 0;
  let maxScore = 0;

  const addReason = (key: RelationshipReason["key"], label: string, value: number) => {
    const weight = weights[key];
    maxScore += weight;
    if (value <= 0) {
      return;
    }

    rawScore += weight * value;
    reasons.push({ key, label, value });
  };

  if (tab.id === activeTab.id) {
    return { reasons: [{ key: "opener", label: "current tab", value: 1 }], score: 1 };
  }

  const activeHost = hostForUrl(activeTab.url);
  const tabHost = hostForUrl(tab.url);
  const sameBrowserGroup = typeof activeTab.groupId === "number" && activeTab.groupId >= 0 && activeTab.groupId === tab.groupId;
  const sameManagedGroup = groupTitleByTabId.get(activeTab.id) && groupTitleByTabId.get(activeTab.id) === groupTitleByTabId.get(tab.id);
  const openedGap = activeTab.openedAt && tab.openedAt ? Math.abs(activeTab.openedAt - tab.openedAt) : undefined;
  const activeGap = activeTab.lastActiveAt && tab.lastActiveAt ? Math.abs(activeTab.lastActiveAt - tab.lastActiveAt) : undefined;
  const activeStatus = conversationStatusByTabId.get(activeTab.id);
  const tabStatus = conversationStatusByTabId.get(tab.id);

  addReason(
    "opener",
    tab.openerTabId === activeTab.id || activeTab.openerTabId === tab.id ? "opened from this tab" : "opener branch",
    tab.openerTabId === activeTab.id || activeTab.openerTabId === tab.id ? 1 : 0,
  );
  addReason("sameDomain", "same site", activeHost === tabHost ? 1 : 0);
  addReason("sameGroup", "same group", sameBrowserGroup || sameManagedGroup ? 1 : 0);
  addReason("openTime", "opened nearby", openedGap === undefined ? 0 : Math.max(0, 1 - openedGap / (45 * 60_000)));
  addReason("activeHistory", "recently active", activeGap === undefined ? 0 : Math.max(0, 1 - activeGap / (30 * 60_000)));
  addReason("pinned", tab.pinned || pinnedUrls.has(tab.url) ? "pinned page" : "not pinned", tab.pinned || pinnedUrls.has(tab.url) ? 1 : 0);
  addReason("llmConversation", "LLM conversation", activeStatus && tabStatus ? 1 : 0);

  return {
    reasons: reasons.sort((a, b) => b.value - a.value),
    score: maxScore > 0 ? Math.min(1, rawScore / maxScore) : 0,
  };
}

function buildContextRailItems(input: {
  activeTab: TabSnapshot | undefined;
  conversationStatusByTabId: Map<number, LlmConversationStatus>;
  groupTitleByTabId: Map<number, string>;
  pinnedUrls: Set<string>;
  tabs: TabSnapshot[];
  weights: AppConfig["contextMap"]["weights"];
}): ContextTabItem[] {
  const { activeTab, conversationStatusByTabId, groupTitleByTabId, pinnedUrls, tabs, weights } = input;
  if (!activeTab) {
    return [];
  }

  const related = tabs
    .filter((tab) => tab.id !== activeTab.id)
    .map((tab) => ({
      groupTitle: groupTitleByTabId.get(tab.id),
      relation: scoreContextTab({ activeTab, conversationStatusByTabId, groupTitleByTabId, pinnedUrls, tab, weights }),
      tab,
    }))
    .sort((a, b) => b.relation.score - a.relation.score || (b.tab.lastActiveAt ?? 0) - (a.tab.lastActiveAt ?? 0));

  const timeDimension = related
    .filter((item) => item.tab.openedAt && activeTab.openedAt)
    .sort((a, b) => Math.abs((a.tab.openedAt ?? 0) - (activeTab.openedAt ?? 0)) - Math.abs((b.tab.openedAt ?? 0) - (activeTab.openedAt ?? 0)));
  const timeIds = new Set(timeDimension.slice(0, Math.ceil(related.length / 2)).map((item) => item.tab.id));
  const domainDimension = related.filter((item) => !timeIds.has(item.tab.id));

  const activeItem: ContextTabItem = {
    dimension: "active",
    groupTitle: groupTitleByTabId.get(activeTab.id),
    relation: { reasons: [{ key: "opener", label: "current tab", value: 1 }], score: 1 },
    slot: 0,
    tab: activeTab,
  };

  return [
    activeItem,
    ...timeDimension.slice(0, Math.ceil(related.length / 2)).map((item, index) => ({ ...item, dimension: "time" as const, slot: -(index + 1) })),
    ...domainDimension.map((item, index) => ({ ...item, dimension: "domain" as const, slot: index + 1 })),
  ].sort((a, b) => a.slot - b.slot);
}

function App(): React.ReactElement {
  const [state, setState] = useState<PanelState>({
    config: DEFAULT_CONFIG,
    conversations: [],
    followUps: [],
    managedGroups: [],
    pinnedShortcuts: [],
    tabs: [],
  });
  const [query, setQuery] = useState("");
  const [panelMode, setPanelMode] = useState<PanelMode>("grouped");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [recentFollowUpTabIds, setRecentFollowUpTabIds] = useState<Set<number>>(() => new Set());
  const [recentPinnedUrls, setRecentPinnedUrls] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    const response = await sendMessage<{ ok: true; state: PanelState }>({ type: "GET_PANEL_STATE" });
    setState(response.state);
    applyTheme(response.state.config);
  }, []);

  useEffect(() => {
    void load().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, [load]);

  useEffect(() => {
    let pending: number | undefined;
    const onMessage = (message: unknown) => {
      if ((message as RuntimeEvent).type !== "PANEL_STATE_CHANGED") {
        return;
      }

      if (pending) {
        window.clearTimeout(pending);
      }

      pending = window.setTimeout(() => {
        void load().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
      }, 80);
    };

    webext.runtime.onMessage.addListener(onMessage);
    return () => {
      if (pending) {
        window.clearTimeout(pending);
      }
      webext.runtime.onMessage.removeListener(onMessage);
    };
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("#tab-search")?.focus();
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        void runAction({ type: "GROUP_BY_DOMAIN" });
      }
      if (event.key === "Escape") {
        setQuery("");
        document.querySelector<HTMLInputElement>("#tab-search")?.blur();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const conversationStatusByTabId = useMemo(
    () => new Map(state.conversations.map((conversation) => [conversation.tabId, conversation.status])),
    [state.conversations],
  );

  const groupedTabIds = useMemo(
    () => new Set(state.managedGroups.flatMap((group) => group.tabs.map((tab) => tab.id))),
    [state.managedGroups],
  );

  const tabIdsByGroupId = useMemo(
    () => new Map(state.managedGroups.map((group) => [group.id, group.tabs.map((tab) => tab.id)])),
    [state.managedGroups],
  );

  const groupTitleByTabId = useMemo(
    () =>
      new Map(
        state.managedGroups.flatMap((group) =>
          group.tabs.map((tab) => [tab.id, group.title] as const),
        ),
      ),
    [state.managedGroups],
  );

  const pinnedUrls = useMemo(
    () => new Set(state.pinnedShortcuts.map((shortcut) => shortcut.url)),
    [state.pinnedShortcuts],
  );

  const followUpUrls = useMemo(
    () => new Set(state.followUps.filter((item) => item.status !== "done").map((item) => item.url)),
    [state.followUps],
  );
  const activeFollowUpCount = useMemo(
    () => state.followUps.filter((item) => item.status !== "done").length,
    [state.followUps],
  );

  const hasSearchQuery = query.trim().length > 0;

  const visibleUngroupedTabs = useMemo(
    () => state.tabs.filter((tab) => !groupedTabIds.has(tab.id)),
    [groupedTabIds, state.tabs],
  );

  const filteredManagedGroups = useMemo(() => {
    if (!hasSearchQuery) {
      return state.managedGroups;
    }

    return state.managedGroups
      .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => tabMatchesQuery(tab, query)) }))
      .filter((group) => group.tabs.length > 0);
  }, [hasSearchQuery, query, state.managedGroups]);

  const filteredUngroupedTabs = useMemo(
    () => visibleUngroupedTabs.filter((tab) => tabMatchesQuery(tab, query)),
    [query, visibleUngroupedTabs],
  );

  const filteredTabs = useMemo(
    () => state.tabs.filter((tab) => tabMatchesQuery(tab, query)),
    [query, state.tabs],
  );

  const matchingGroupedTabCount = useMemo(
    () => filteredManagedGroups.reduce((count, group) => count + group.tabs.length, 0),
    [filteredManagedGroups],
  );

  const matchingTabCount = filteredUngroupedTabs.length + matchingGroupedTabCount;

  const activeTab = useMemo(
    () => state.tabs.find((tab) => tab.active) ?? state.tabs[0],
    [state.tabs],
  );

  const contextItems = useMemo(
    () =>
      buildContextRailItems({
        activeTab,
        conversationStatusByTabId,
        groupTitleByTabId,
        pinnedUrls,
        tabs: filteredTabs,
        weights: state.config.contextMap.weights,
      }),
    [activeTab, conversationStatusByTabId, filteredTabs, groupTitleByTabId, pinnedUrls, state.config.contextMap.weights],
  );

  const readLaterCandidates = useMemo(
    () => buildReadLaterCleanupCandidates({ followUps: state.followUps, query, tabs: state.tabs }),
    [query, state.followUps, state.tabs],
  );

  const suggestedMode = useMemo(
    () => suggestPanelMode({ contextItems, followUps: state.followUps, readLaterCandidates }),
    [contextItems, readLaterCandidates, state.followUps],
  );

  const runAction = useCallback(
    async (message: ExtensionMessage) => {
      setBusy(true);
      setError(undefined);
      try {
        await sendMessage(message);
        await load();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : String(actionError));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const tuneWeightsForSelection = useCallback(
    async (item: ContextTabItem) => {
      if (!state.config.contextMap.adaptiveLearning || item.tab.id === activeTab?.id) {
        return;
      }

      const boostedKeys = new Set(item.relation.reasons.slice(0, 2).map((reason) => reason.key));
      const nextConfig: AppConfig = {
        ...state.config,
        contextMap: {
          ...state.config.contextMap,
          weights: Object.fromEntries(
            Object.entries(state.config.contextMap.weights).map(([key, value]) => [
              key,
              Math.max(0, Math.min(1.5, value + (boostedKeys.has(key as RelationshipReason["key"]) ? 0.03 : -0.006))),
            ]),
          ) as AppConfig["contextMap"]["weights"],
        },
      };

      await sendMessage({ type: "SAVE_CONFIG", config: nextConfig });
      setState((current) => ({ ...current, config: nextConfig }));
    },
    [activeTab?.id, state.config],
  );

  const focusContextItem = useCallback(
    async (item: ContextTabItem) => {
      await tuneWeightsForSelection(item);
      await runAction({ type: "FOCUS_TAB", tabId: item.tab.id, windowId: item.tab.windowId });
    },
    [runAction, tuneWeightsForSelection],
  );

  const saveTabForFollowUp = useCallback(
    async (tab: TabSnapshot) => {
      setRecentFollowUpTabIds((current) => new Set(current).add(tab.id));
      await runAction({ source: "manual", tabId: tab.id, type: "ADD_FOLLOW_UP_FROM_TAB" });
      window.setTimeout(() => {
        setRecentFollowUpTabIds((current) => {
          const next = new Set(current);
          next.delete(tab.id);
          return next;
        });
      }, 1_200);
    },
    [runAction],
  );

  const pinTabShortcut = useCallback(
    async (tab: TabSnapshot) => {
      setRecentPinnedUrls((current) => new Set(current).add(tab.url));
      await runAction({ type: "PIN_PAGE", tabId: tab.id });
      window.setTimeout(() => {
        setRecentPinnedUrls((current) => {
          const next = new Set(current);
          next.delete(tab.url);
          return next;
        });
      }, 1_200);
    },
    [runAction],
  );

  return (
    <main className={`app-shell mode-${panelMode}`}>
      <header className="panel-header">
        <div>
          <p className="eyebrow">Side panel</p>
          <h1>Tab Workspace</h1>
        </div>
        <div className="header-actions" aria-label="Panel actions">
          <button className="icon-button" type="button" title="Refresh tabs" onClick={() => void load()} disabled={busy}>
            <RefreshCw size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Group domains"
            onClick={() => void runAction({ type: "GROUP_BY_DOMAIN" })}
            disabled={busy}
          >
            <FolderKanban size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Open settings"
            onClick={() => void runAction({ type: "OPEN_OPTIONS" })}
          >
            <Settings size={17} />
          </button>
        </div>
      </header>

      <section className="sticky-tools" aria-label="Common tab actions">
        <label className="search-box" htmlFor="tab-search">
          <Search size={16} />
          <input
            id="tab-search"
            type="search"
            placeholder="Search tabs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>{navigator.platform.includes("Mac") ? "⌘K" : "Ctrl K"}</kbd>
        </label>

        <div className="mode-toggle" role="tablist" aria-label="Panel mode">
          <button
            aria-selected={panelMode === "context"}
            className={[
              panelMode === "context" ? "is-selected" : "",
              suggestedMode.mode === "context" ? "is-suggested" : "",
            ].filter(Boolean).join(" ")}
            role="tab"
            title={suggestedMode.mode === "context" ? `Suggested: ${suggestedMode.reason}` : undefined}
            type="button"
            onClick={() => setPanelMode("context")}
          >
            Context map
          </button>
          <button
            aria-selected={panelMode === "grouped"}
            className={[
              panelMode === "grouped" ? "is-selected" : "",
              suggestedMode.mode === "grouped" ? "is-suggested" : "",
            ].filter(Boolean).join(" ")}
            role="tab"
            title={suggestedMode.mode === "grouped" ? `Suggested: ${suggestedMode.reason}` : undefined}
            type="button"
            onClick={() => setPanelMode("grouped")}
          >
            Grouped tabs
          </button>
          <button
            aria-selected={panelMode === "follow-up"}
            className={[
              panelMode === "follow-up" ? "is-selected" : "",
              suggestedMode.mode === "follow-up" ? "is-suggested" : "",
              activeFollowUpCount > 0 ? "has-follow-ups" : "",
            ].filter(Boolean).join(" ")}
            role="tab"
            title={suggestedMode.mode === "follow-up" ? `Suggested: ${suggestedMode.reason}` : undefined}
            type="button"
            onClick={() => setPanelMode("follow-up")}
          >
            Follow-up
          </button>
        </div>

        <PinnedShortcuts shortcuts={state.pinnedShortcuts} runAction={runAction} />
      </section>

      {error ? <p className="inline-error" role="alert">{error}</p> : null}

      <section className="section-stack" aria-labelledby="workspace-heading">
        <div className="section-title">
          <h2 id="workspace-heading">Workspaces</h2>
          <span>{state.config.workspaceTemplates.length}</span>
        </div>
        <div className="workspace-list">
          {state.config.workspaceTemplates.map((workspace) => (
            <WorkspaceButton key={workspace.id} workspace={workspace} onOpen={(template) => runAction({ type: "OPEN_WORKSPACE", workspace: template })} />
          ))}
        </div>
      </section>

      <section className="section-stack" aria-labelledby="llm-heading">
        <div className="section-title">
          <h2 id="llm-heading">LLM launchpad</h2>
          <Sparkles size={15} />
        </div>
        <div className="llm-grid">
          {state.config.llmProviders
            .filter((provider) => provider.enabled)
            .map((provider) => (
              <button key={provider.id} type="button" onClick={() => void runAction({ type: "OPEN_LLM_PROVIDER", providerId: provider.id })}>
                <Bot size={16} />
                {provider.name}
              </button>
            ))}
        </div>
      </section>

      {panelMode === "context" ? (
        <section className="section-stack context-map-section" aria-labelledby="tabs-heading">
          <div className="section-title">
            <h2 id="tabs-heading">Context map</h2>
            <span>{filteredTabs.length}</span>
          </div>
          {contextItems.length ? (
            <ContextRail
              conversationStatusByTabId={conversationStatusByTabId}
              followUpUrls={followUpUrls}
              items={contextItems}
              onFocusTab={focusContextItem}
              onPinTab={pinTabShortcut}
              onSaveFollowUp={saveTabForFollowUp}
              pinnedUrls={pinnedUrls}
              recentFollowUpTabIds={recentFollowUpTabIds}
              recentPinnedUrls={recentPinnedUrls}
              runAction={runAction}
            />
          ) : hasSearchQuery ? (
            <EmptyState icon={<Search size={18} />} title="No tab matches" detail="Search checks tab titles and URLs across all tabs." />
          ) : null}
        </section>
      ) : panelMode === "grouped" ? (
        <GroupedTabsView
          conversationStatusByTabId={conversationStatusByTabId}
          filteredManagedGroups={filteredManagedGroups}
          filteredTabs={filteredUngroupedTabs}
          followUpUrls={followUpUrls}
          hasSearchQuery={hasSearchQuery}
          matchingGroupedTabCount={matchingGroupedTabCount}
          matchingTabCount={matchingTabCount}
          onPinTab={pinTabShortcut}
          onSaveFollowUp={saveTabForFollowUp}
          pinnedUrls={pinnedUrls}
          recentFollowUpTabIds={recentFollowUpTabIds}
          recentPinnedUrls={recentPinnedUrls}
          runAction={runAction}
          tabIdsByGroupId={tabIdsByGroupId}
        />
      ) : (
        <FollowUpView activeTab={activeTab} followUps={state.followUps} query={query} runAction={runAction} tabs={state.tabs} />
      )}

      <footer className="shortcut-footer">
        <Keyboard size={14} />
        <span>{navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+K search, {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Shift+G group</span>
      </footer>
    </main>
  );
}

function GroupedTabsView({
  conversationStatusByTabId,
  filteredManagedGroups,
  filteredTabs,
  followUpUrls,
  hasSearchQuery,
  matchingGroupedTabCount,
  matchingTabCount,
  onPinTab,
  onSaveFollowUp,
  pinnedUrls,
  recentFollowUpTabIds,
  recentPinnedUrls,
  runAction,
  tabIdsByGroupId,
}: {
  conversationStatusByTabId: Map<number, LlmConversationStatus>;
  filteredManagedGroups: PanelState["managedGroups"];
  filteredTabs: TabSnapshot[];
  followUpUrls: Set<string>;
  hasSearchQuery: boolean;
  matchingGroupedTabCount: number;
  matchingTabCount: number;
  onPinTab: (tab: TabSnapshot) => Promise<void>;
  onSaveFollowUp: (tab: TabSnapshot) => Promise<void>;
  pinnedUrls: Set<string>;
  recentFollowUpTabIds: Set<number>;
  recentPinnedUrls: Set<string>;
  runAction: (message: ExtensionMessage) => Promise<void>;
  tabIdsByGroupId: Map<string, number[]>;
}): React.ReactElement {
  return (
    <>
      <section className="section-stack" aria-labelledby="managed-groups-heading">
        <div className="section-title">
          <h2 id="managed-groups-heading">Groups</h2>
          <span>{hasSearchQuery ? matchingGroupedTabCount : filteredManagedGroups.length}</span>
        </div>
        <div className="domain-list">
          {filteredManagedGroups.length ? (
            filteredManagedGroups.map((group) => (
              <details key={group.id} className="domain-group" open>
                <summary>
                  <span className={`group-swatch color-${group.color}`} />
                  <span className="group-title-copy">
                    <strong>{group.title}</strong>
                    <small>{group.kind} - {group.tabs.length} tabs</small>
                  </span>
                  <button
                    className="group-close-button"
                    type="button"
                    title={`Close ${group.title}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void runAction({ type: "CLOSE_TABS", tabIds: tabIdsByGroupId.get(group.id) ?? group.tabs.map((tab) => tab.id) });
                    }}
                  >
                    <X size={14} />
                  </button>
                </summary>
                <TabList
                  conversationStatusByTabId={conversationStatusByTabId}
                  followUpUrls={followUpUrls}
                  onPinTab={onPinTab}
                  onSaveFollowUp={onSaveFollowUp}
                  pinnedUrls={pinnedUrls}
                  recentFollowUpTabIds={recentFollowUpTabIds}
                  recentPinnedUrls={recentPinnedUrls}
                  runAction={runAction}
                  tabs={group.tabs}
                />
              </details>
            ))
          ) : hasSearchQuery ? (
            <EmptyState icon={<Search size={18} />} title="No grouped tab matches" detail="Try a title, domain, or URL from a grouped tab." />
          ) : (
            <EmptyState icon={<FolderKanban size={18} />} title="No managed groups yet" detail="Open a workspace, launch LLM sessions, or group domains." />
          )}
        </div>
      </section>

      <section className="section-stack" aria-labelledby="ungrouped-tabs-heading">
        <div className="section-title">
          <h2 id="ungrouped-tabs-heading">Tabs</h2>
          <span>{filteredTabs.length}</span>
        </div>
        {filteredTabs.length ? (
          <TabList
            conversationStatusByTabId={conversationStatusByTabId}
            followUpUrls={followUpUrls}
            onPinTab={onPinTab}
            onSaveFollowUp={onSaveFollowUp}
            pinnedUrls={pinnedUrls}
            recentFollowUpTabIds={recentFollowUpTabIds}
            recentPinnedUrls={recentPinnedUrls}
            runAction={runAction}
            tabs={filteredTabs}
          />
        ) : hasSearchQuery && matchingTabCount === 0 ? (
          <EmptyState icon={<Search size={18} />} title="No tab matches" detail="Search checks tab titles and URLs across groups and ungrouped tabs." />
        ) : null}
      </section>
    </>
  );
}

function FollowUpView({
  activeTab,
  followUps,
  query,
  runAction,
  tabs,
}: {
  activeTab: TabSnapshot | undefined;
  followUps: FollowUpItem[];
  query: string;
  runAction: (message: ExtensionMessage) => Promise<void>;
  tabs: TabSnapshot[];
}): React.ReactElement {
  const [lastCleanupBatch, setLastCleanupBatch] = useState<CleanupBatch | undefined>();
  const needle = query.trim().toLowerCase();
  const visibleItems = followUps
    .filter((item) => !needle || `${item.title} ${item.url} ${item.note ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => followUpSortValue(a) - followUpSortValue(b));
  const activeItems = visibleItems.filter((item) => item.status !== "done");
  const doneItems = visibleItems.filter((item) => item.status === "done").slice(0, 6);
  const cleanupCandidates = buildReadLaterCleanupCandidates({ followUps, query, tabs }).slice(0, 5);

  const saveCleanupCandidates = async (candidates: ReadLaterCleanupCandidate[]) => {
    const itemIds = candidates.map((candidate) => followUpIdForUrl(candidate.tab.url));
    for (const candidate of candidates) {
      await runAction({
        closeTab: true,
        reminderAt: reminderPreset("week"),
        source: "read-later",
        tabId: candidate.tab.id,
        type: "ADD_FOLLOW_UP_FROM_TAB",
      });
    }
    setLastCleanupBatch({ itemIds, savedAt: Date.now() });
  };

  return (
    <section className="section-stack follow-up-section" aria-labelledby="follow-up-heading">
      <div className="section-title">
        <h2 id="follow-up-heading">Follow-up</h2>
        <span>{activeItems.length}</span>
      </div>

      {activeTab ? (
        <div className="follow-up-capture">
          <button type="button" onClick={() => void runAction({ source: "manual", tabId: activeTab.id, type: "ADD_FOLLOW_UP_FROM_TAB" })}>
            <Bell size={15} />
            Save current
          </button>
          <button
            type="button"
            onClick={() => void runAction({
              closeTab: true,
              reminderAt: reminderPreset("tomorrow"),
              source: "read-later",
              tabId: activeTab.id,
              type: "ADD_FOLLOW_UP_FROM_TAB",
            })}
          >
            <Archive size={15} />
            Save and close
          </button>
        </div>
      ) : null}

      {cleanupCandidates.length ? (
        <section className="read-later-cleanup" aria-labelledby="read-later-cleanup-heading">
          <div className="section-title">
            <h3 id="read-later-cleanup-heading">Read-later cleanup</h3>
            <button type="button" onClick={() => void saveCleanupCandidates(cleanupCandidates)}>
              Save top {cleanupCandidates.length}
            </button>
          </div>
          <div className="cleanup-candidate-list" role="list">
            {cleanupCandidates.map((candidate) => (
              <div key={candidate.tab.id} className="cleanup-candidate-row" role="listitem">
                <span className="favicon" aria-hidden="true">
                  {candidate.tab.favIconUrl ? <img src={candidate.tab.favIconUrl} alt="" /> : <LayoutPanelLeft size={14} />}
                </span>
                <span className="tab-copy">
                  <strong>{candidate.tab.title}</strong>
                  <small>{candidate.reason} - {hostForUrl(candidate.tab.url)}</small>
                </span>
                <button
                  className="row-icon-button"
                  type="button"
                  title="Save and close"
                  onClick={() => void saveCleanupCandidates([candidate])}
                >
                  <Archive size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {lastCleanupBatch ? (
        <div className="cleanup-restore">
          <small>{lastCleanupBatch.itemIds.length} saved for later</small>
          <button
            type="button"
            onClick={() => void (async () => {
              for (const itemId of lastCleanupBatch.itemIds) {
                await runAction({ itemId, type: "OPEN_FOLLOW_UP" });
              }
              setLastCleanupBatch(undefined);
            })()}
          >
            <RotateCcw size={14} />
            Reopen batch
          </button>
        </div>
      ) : null}

      {activeItems.length ? (
        <div className="follow-up-list" role="list">
          {activeItems.map((item) => (
            <FollowUpRow key={item.id} item={item} runAction={runAction} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Bell size={18} />} title="No follow-ups yet" detail="Save tabs here when you want to come back later without keeping everything open." />
      )}

      {doneItems.length ? (
        <details className="done-follow-ups">
          <summary>Done items</summary>
          <div className="follow-up-list" role="list">
            {doneItems.map((item) => (
              <FollowUpRow key={item.id} item={item} runAction={runAction} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function FollowUpRow({
  item,
  runAction,
}: {
  item: FollowUpItem;
  runAction: (message: ExtensionMessage) => Promise<void>;
}): React.ReactElement {
  const [reminderValue, setReminderValue] = useState(dateTimeLocalValue(item.reminderAt));
  useEffect(() => {
    setReminderValue(dateTimeLocalValue(item.reminderAt));
  }, [item.reminderAt]);

  return (
    <article className={`follow-up-row status-${item.status}`} role="listitem">
      <button className="follow-up-main" type="button" onClick={() => void runAction({ itemId: item.id, type: "OPEN_FOLLOW_UP" })}>
        <span className="favicon" aria-hidden="true">
          {item.favIconUrl ? <img src={item.favIconUrl} alt="" /> : <LayoutPanelLeft size={14} />}
        </span>
        <span className="tab-copy">
          <strong>{item.title}</strong>
          <small>{item.note || item.url}</small>
        </span>
      </button>
      <span className={`tab-status-badge status-${item.status}`}>{followUpStatusLabel(item.status)}</span>
      <small className="follow-up-time">{formatReminder(item.reminderAt)}</small>
      <div className="follow-up-actions">
        <button
          className="row-icon-button"
          type="button"
          title="Snooze until tomorrow"
          onClick={() => void runAction({ itemId: item.id, patch: { reminderAt: reminderPreset("tomorrow"), status: "snoozed" }, type: "UPDATE_FOLLOW_UP" })}
        >
          <Clock3 size={14} />
        </button>
        <button
          className="row-icon-button"
          type="button"
          title="Needs review"
          onClick={() => void runAction({ itemId: item.id, patch: { status: "needs-review" }, type: "UPDATE_FOLLOW_UP" })}
        >
          <Bell size={14} />
        </button>
        <button
          className="row-icon-button"
          type="button"
          title="Mark done"
          onClick={() => void runAction({ itemId: item.id, patch: { status: "done" }, type: "UPDATE_FOLLOW_UP" })}
        >
          <CheckCircle2 size={14} />
        </button>
        <button
          className="row-icon-button"
          type="button"
          title="Remove follow-up"
          onClick={() => void runAction({ itemId: item.id, type: "REMOVE_FOLLOW_UP" })}
        >
          <X size={14} />
        </button>
      </div>
      <div className="follow-up-reminder-editor">
        <label>
          Reminder
          <input
            type="datetime-local"
            value={reminderValue}
            onChange={(event) => setReminderValue(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const timestamp = reminderValue ? new Date(reminderValue).getTime() : undefined;
            if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
              void runAction({ itemId: item.id, patch: { reminderAt: timestamp, status: timestamp <= Date.now() ? "due" : "snoozed" }, type: "UPDATE_FOLLOW_UP" });
            }
          }}
        >
          Set
        </button>
      </div>
    </article>
  );
}

function WorkspaceButton({
  onOpen,
  workspace,
}: {
  onOpen: (workspace: WorkspaceTemplate) => Promise<void>;
  workspace: WorkspaceTemplate;
}): React.ReactElement {
  return (
    <button className="workspace-button" type="button" onClick={() => void onOpen(workspace)}>
      <span className={`group-swatch color-${workspace.color}`} />
      <span>
        <strong>{workspace.name}</strong>
        <small>{workspace.urls.length} tabs</small>
      </span>
    </button>
  );
}

function MediaBadge({ tab }: { tab: TabSnapshot }): React.ReactElement | null {
  if (!tab.audible && !tab.muted) {
    return null;
  }

  const muted = Boolean(tab.muted);
  return (
    <span className={muted ? "media-badge is-muted" : "media-badge"} title={muted ? "Tab audio is muted" : "Tab is playing media"}>
      {muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
      {muted ? "Muted" : "Playing"}
    </span>
  );
}

function ContextRail({
  conversationStatusByTabId,
  followUpUrls,
  items,
  onFocusTab,
  onPinTab,
  onSaveFollowUp,
  pinnedUrls,
  recentFollowUpTabIds,
  recentPinnedUrls,
  runAction,
}: {
  conversationStatusByTabId: Map<number, LlmConversationStatus>;
  followUpUrls: Set<string>;
  items: ContextTabItem[];
  onFocusTab: (item: ContextTabItem) => Promise<void>;
  onPinTab: (tab: TabSnapshot) => Promise<void>;
  onSaveFollowUp: (tab: TabSnapshot) => Promise<void>;
  pinnedUrls: Set<string>;
  recentFollowUpTabIds: Set<number>;
  recentPinnedUrls: Set<string>;
  runAction: (message: ExtensionMessage) => Promise<void>;
}): React.ReactElement {
  const activeItem = items.find((item) => item.slot === 0);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home") {
      return;
    }

    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".context-tab-main")];
    const currentIndex = buttons.findIndex((button) => button === document.activeElement);
    const nextIndex =
      event.key === "Home"
        ? buttons.findIndex((button) => button.dataset.slot === "0")
        : Math.max(0, Math.min(buttons.length - 1, currentIndex + (event.key === "ArrowDown" ? 1 : -1)));
    buttons[nextIndex]?.focus();
  };

  return (
    <div className="context-rail" role="list" onKeyDown={onKeyDown} aria-label="Tabs related to the active tab">
      <div className="context-axis context-axis-time" aria-hidden="true">
        <Clock3 size={13} />
        Opened near this tab
      </div>
      <div className="context-axis context-axis-domain" aria-hidden="true">
        <Globe2 size={13} />
        Same site or group
      </div>
      {items.map((item) => {
        const tab = item.tab;
        const status = conversationStatusByTabId.get(tab.id);
        const isStrong = item.relation.score >= 0.62 && item.slot !== 0;
        const isFollowUpSaved = followUpUrls.has(tab.url);
        const isFollowUpRecent = recentFollowUpTabIds.has(tab.id);
        const isShortcutSaved = pinnedUrls.has(tab.url);
        const isShortcutRecent = recentPinnedUrls.has(tab.url);

        return (
          <div
            key={tab.id}
            className={[
              "context-tab-row",
              tab.active ? "is-active" : "",
              isStrong ? "is-strong" : "",
              `dimension-${item.dimension}`,
            ].filter(Boolean).join(" ")}
            style={{
              "--relation-strength": item.relation.score,
              "--row-opacity": Math.max(0.34, 1.04 - Math.abs(item.slot) * 0.11),
              "--slot": item.slot,
              "--slot-distance": Math.abs(item.slot),
            } as React.CSSProperties}
            title={tab.url}
            role="listitem"
          >
            {isStrong ? <span className="connection-line" aria-hidden="true" /> : null}
          <button
            className="context-tab-main"
            data-slot={item.slot}
            type="button"
            onClick={() => void onFocusTab(item)}
          >
            <span className="favicon" aria-hidden="true">
              {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <LayoutPanelLeft size={14} />}
            </span>
            <span className="tab-copy">
              <strong>{tab.title}</strong>
              <small>{tab.active ? "Current tab" : relationSummary(item, activeItem)}</small>
            </span>
          </button>
          <MediaBadge tab={tab} />
          {tab.pinned ? <span className="pin-badge">Pinned</span> : null}
          {status ? (
            <span className={`tab-status-badge status-${status}`}>
              {statusLabel(status)}
            </span>
          ) : null}
          {item.groupTitle ? <span className="tab-status-badge group-badge"><Layers2 size={11} />{item.groupTitle}</span> : null}
          <button
            className={[
              "row-icon-button",
              "context-hover-action",
              "tab-follow-up-button",
              isFollowUpSaved || isFollowUpRecent ? "is-saved" : "",
              isFollowUpRecent ? "is-confirming" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            title={isFollowUpSaved || isFollowUpRecent ? "Saved for follow-up" : "Save for follow-up"}
            onClick={() => void onSaveFollowUp(tab)}
          >
            {isFollowUpSaved || isFollowUpRecent ? <CheckCircle2 size={14} /> : <Bell size={14} />}
          </button>
          <button
            className={[
              "row-icon-button",
              "context-hover-action",
              "tab-pin-button",
              isShortcutSaved || isShortcutRecent ? "is-saved" : "",
              isShortcutRecent ? "is-confirming" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            title={isShortcutSaved || isShortcutRecent ? "Shortcut saved" : "Save shortcut"}
            onClick={() => void onPinTab(tab)}
          >
            {isShortcutSaved || isShortcutRecent ? <CheckCircle2 size={14} /> : <Pin size={14} />}
          </button>
          <button
            className="row-icon-button"
            type="button"
            title="Close tab"
            onClick={() => void runAction({ type: "CLOSE_TABS", tabIds: [tab.id] })}
          >
            <X size={14} />
          </button>
          <details className="context-signal-details context-hover-action">
            <summary title="Show ranking signals">
              <Info size={13} />
            </summary>
            <div className="context-signal-panel">
              {relationSignalRows(item).map((signal) => (
                <span key={`${signal.label}:${signal.value}`} className="context-signal-row">
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                </span>
              ))}
            </div>
          </details>
        </div>
        );
      })}
    </div>
  );
}

function relationSummary(item: ContextTabItem, activeItem: ContextTabItem | undefined): string {
  const reason = item.relation.reasons[0]?.label;
  const host = hostForUrl(item.tab.url);
  const prefix = item.dimension === "time" ? "Above by time" : item.dimension === "domain" ? "Below by site/group" : "Current";
  const activeHost = activeItem ? hostForUrl(activeItem.tab.url) : undefined;

  if (reason) {
    return `${prefix} - ${reason} - ${host}`;
  }

  if (activeHost && activeHost === host) {
    return `${prefix} - same site - ${host}`;
  }

  return `${prefix} - ${minutesAgo(item.tab.openedAt)} - ${host}`;
}

function TabList({
  conversationStatusByTabId,
  followUpUrls,
  onPinTab,
  onSaveFollowUp,
  pinnedUrls,
  recentFollowUpTabIds,
  recentPinnedUrls,
  runAction,
  tabs,
}: {
  conversationStatusByTabId: Map<number, LlmConversationStatus>;
  followUpUrls: Set<string>;
  onPinTab: (tab: TabSnapshot) => Promise<void>;
  onSaveFollowUp: (tab: TabSnapshot) => Promise<void>;
  pinnedUrls: Set<string>;
  recentFollowUpTabIds: Set<number>;
  recentPinnedUrls: Set<string>;
  runAction: (message: ExtensionMessage) => Promise<void>;
  tabs: TabSnapshot[];
}): React.ReactElement {
  return (
    <div className="tab-list" role="list">
      {tabs.map((tab) => {
        const status = conversationStatusByTabId.get(tab.id);
        const isFollowUpSaved = followUpUrls.has(tab.url);
        const isFollowUpRecent = recentFollowUpTabIds.has(tab.id);
        const isShortcutSaved = pinnedUrls.has(tab.url);
        const isShortcutRecent = recentPinnedUrls.has(tab.url);

        return (
          <div
            key={tab.id}
            className={tab.active ? "tab-row is-active" : "tab-row"}
            title={tab.url}
            role="listitem"
          >
            <button
              className="tab-main"
              type="button"
              onClick={() => void runAction({ type: "FOCUS_TAB", tabId: tab.id, windowId: tab.windowId })}
            >
              <span className="favicon" aria-hidden="true">
                {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" /> : <LayoutPanelLeft size={14} />}
              </span>
              <span className="tab-copy">
                <strong>{tab.title}</strong>
                <small>{tab.url}</small>
              </span>
            </button>
            <MediaBadge tab={tab} />
            {tab.pinned ? <span className="pin-badge">Pinned</span> : null}
            {status ? (
              <span className={`tab-status-badge status-${status}`}>
                {statusLabel(status)}
              </span>
            ) : null}
            <button
              className={[
                "row-icon-button",
                "tab-follow-up-button",
                isFollowUpSaved || isFollowUpRecent ? "is-saved" : "",
                isFollowUpRecent ? "is-confirming" : "",
              ].filter(Boolean).join(" ")}
              type="button"
              title={isFollowUpSaved || isFollowUpRecent ? "Saved for follow-up" : "Save for follow-up"}
              onClick={() => void onSaveFollowUp(tab)}
            >
              {isFollowUpSaved || isFollowUpRecent ? <CheckCircle2 size={14} /> : <Bell size={14} />}
            </button>
            <button
              className={[
                "row-icon-button",
                "tab-pin-button",
                isShortcutSaved || isShortcutRecent ? "is-saved" : "",
                isShortcutRecent ? "is-confirming" : "",
              ].filter(Boolean).join(" ")}
              type="button"
              title={isShortcutSaved || isShortcutRecent ? "Shortcut saved" : "Save shortcut"}
              onClick={() => void onPinTab(tab)}
            >
              {isShortcutSaved || isShortcutRecent ? <CheckCircle2 size={14} /> : <Pin size={14} />}
            </button>
            <button
              className="row-icon-button"
              type="button"
              title="Close tab"
              onClick={() => void runAction({ type: "CLOSE_TABS", tabIds: [tab.id] })}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PinnedShortcuts({
  runAction,
  shortcuts,
}: {
  runAction: (message: ExtensionMessage) => Promise<void>;
  shortcuts: PanelState["pinnedShortcuts"];
}): React.ReactElement | null {
  if (!shortcuts.length) {
    return null;
  }

  return (
    <div className="pinned-shortcuts" aria-label="Pinned page shortcuts">
      {shortcuts.map((shortcut) => (
        <span key={shortcut.id} className="shortcut-chip">
          <button
            className="shortcut-button"
            type="button"
            title={shortcut.title}
            onClick={() => void runAction({ type: "OPEN_PINNED_SHORTCUT", shortcutId: shortcut.id })}
          >
            {shortcut.favIconUrl ? <img src={shortcut.favIconUrl} alt="" /> : <LayoutPanelLeft size={14} />}
          </button>
          <button
            className="shortcut-remove"
            type="button"
            title={`Remove ${shortcut.title}`}
            onClick={() => void runAction({ type: "REMOVE_PINNED_SHORTCUT", shortcutId: shortcut.id })}
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}

function EmptyState({ detail, icon, title }: { detail: string; icon: React.ReactNode; title: string }): React.ReactElement {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

createRoot(root).render(<App />);
