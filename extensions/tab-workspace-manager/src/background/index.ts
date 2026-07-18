import { closeExtensionPanel, enableActionSidePanelOpen, openExtensionPanel, webext } from "@minext/browser-api";
import {
  conversationFromTab,
  DEFAULT_CONFIG,
  domainKeyForUrl,
  type FollowUpItem,
  type FollowUpStatus,
  groupTabsByDomain,
  mergeConfig,
  pageSummaryDeepLink,
  pageSummaryProvider,
  providerForUrl,
  rewritePageTitle,
  sanitizeWorkspace,
  statusForTabLoad,
  type AppConfig,
  type BrowserGroupColor,
  type LlmConversation,
  type ManagedGroupKind,
  type ManagedTabGroup,
  type PinnedPageShortcut,
  type TabSnapshot,
  type WorkspaceTemplate,
} from "@minext/core";
import type { ExportPayload, ExtensionMessage, ExtensionResponse, PanelState, RuntimeEvent } from "../shared/messages";

const CONFIG_KEY = "tabWorkspaceManager.config";
const CONVERSATIONS_KEY = "tabWorkspaceManager.conversations";
const MANAGED_GROUPS_KEY = "tabWorkspaceManager.managedGroups";
const PINNED_SHORTCUTS_KEY = "tabWorkspaceManager.pinnedShortcuts";
const FOLLOW_UP_ITEMS_KEY = "tabWorkspaceManager.followUps";
const TAB_METADATA_KEY = "tabWorkspaceManager.tabMetadata";
const PAGE_SUMMARY_CONTEXT_MENU_ID = "tab-workspace-manager.summarize-page";
const FOLLOW_UP_ALARM_PREFIX = "tabWorkspaceManager.followUp:";
const FOLLOW_UP_NOTIFICATION_PREFIX = "tabWorkspaceManager.followUpNotification:";

type NativeTabGroupApi = {
  tabs?: {
    group?: (options: { groupId?: number; tabIds: number[] }) => Promise<number> | number;
  };
  tabGroups?: {
    query?: (options: { windowId?: number }) => Promise<BrowserTabGroup[]> | BrowserTabGroup[];
    update?: (
      groupId: number,
      options: { collapsed?: boolean; color?: string; title?: string },
    ) => Promise<unknown> | unknown;
  };
};

type BrowserAlarm = {
  name: string;
};

type BrowserAlarmApi = {
  clear?: (name: string) => Promise<boolean> | boolean;
  create?: (name: string, alarmInfo: { when: number }) => void;
  onAlarm?: {
    addListener: (listener: (alarm: BrowserAlarm) => void) => void;
  };
};

type BrowserNotificationApi = {
  create?: (
    notificationId: string,
    options: {
      iconUrl?: string;
      message: string;
      priority?: number;
      title: string;
      type: "basic";
    },
  ) => Promise<string> | string;
  onClicked?: {
    addListener: (listener: (notificationId: string) => void) => void;
  };
};

type ReminderRuntimeApi = {
  alarms?: BrowserAlarmApi;
  notifications?: BrowserNotificationApi;
  runtime?: {
    getURL?: (path: string) => string;
  };
};

type BrowserTabGroup = {
  color?: string;
  id?: number;
  title?: string;
  windowId?: number;
};

type BrowserTab = {
  active?: boolean;
  audible?: boolean;
  favIconUrl?: string;
  groupId?: number;
  id?: number;
  mutedInfo?: {
    muted?: boolean;
  };
  openerTabId?: number;
  pinned?: boolean;
  title?: string;
  url?: string;
  windowId?: number;
};

type MessageSender = {
  tab?: BrowserTab;
};

type TabChangeInfo = {
  audible?: boolean;
  favIconUrl?: string;
  groupId?: number;
  mutedInfo?: {
    muted?: boolean;
  };
  status?: string;
  title?: string;
  url?: string;
};

type TabMetadata = {
  lastActiveAt?: number;
  openedAt: number;
};

type AutohiddenMediaPanel = {
  tabId: number;
  windowId: number;
};

const nativeTabGroupApis = (): NativeTabGroupApi => {
  const runtime = globalThis as typeof globalThis & {
    browser?: NativeTabGroupApi;
    chrome?: NativeTabGroupApi;
  };
  return runtime.chrome ?? runtime.browser ?? {};
};
const reminderApis = (): ReminderRuntimeApi => (globalThis as typeof globalThis & { chrome?: ReminderRuntimeApi }).chrome ?? (webext as ReminderRuntimeApi);

let panelRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let autohiddenMediaPanel: AutohiddenMediaPanel | undefined;

async function notifyActiveMediaStarted(tabId: number, windowId: number): Promise<void> {
  const config = await getConfig();
  if (!config.panel.autoHideWhenActiveTabPlaysMedia) {
    return;
  }

  void webext.runtime.sendMessage({ tabId, type: "MEDIA_PLAYING_IN_ACTIVE_TAB", windowId } satisfies RuntimeEvent).catch(() => undefined);
}

function notifyPanelStateChanged(): void {
  if (panelRefreshTimer) {
    clearTimeout(panelRefreshTimer);
  }

  panelRefreshTimer = setTimeout(() => {
    void webext.runtime.sendMessage({ type: "PANEL_STATE_CHANGED" } satisfies RuntimeEvent).catch(() => undefined);
  }, 120);
}

async function getConfig(): Promise<AppConfig> {
  const result = await webext.storage.local.get(CONFIG_KEY);
  return mergeConfig(result[CONFIG_KEY] as Partial<AppConfig> | undefined);
}

async function saveConfig(config: AppConfig): Promise<void> {
  await webext.storage.local.set({ [CONFIG_KEY]: mergeConfig(config) });
}

async function ensureDefaultConfig(): Promise<void> {
  const result = await webext.storage.local.get(CONFIG_KEY);
  if (!result[CONFIG_KEY]) {
    await saveConfig(DEFAULT_CONFIG);
  }
}

async function getConversations(): Promise<LlmConversation[]> {
  const result = await webext.storage.local.get(CONVERSATIONS_KEY);
  return Array.isArray(result[CONVERSATIONS_KEY]) ? (result[CONVERSATIONS_KEY] as LlmConversation[]) : [];
}

async function saveConversations(conversations: LlmConversation[]): Promise<void> {
  await webext.storage.local.set({ [CONVERSATIONS_KEY]: conversations });
}

async function pruneConversations(tabs: TabSnapshot[], config: AppConfig): Promise<LlmConversation[]> {
  const liveTabIds = new Set(tabs.map((tab) => tab.id));
  const conversations = await getConversations();
  const pruned = conversations.filter((conversation) => {
    const tab = tabs.find((candidate) => candidate.id === conversation.tabId);
    return liveTabIds.has(conversation.tabId) && Boolean(tab && providerForUrl(tab.url, config.llmProviders));
  });

  if (JSON.stringify(pruned) !== JSON.stringify(conversations)) {
    await saveConversations(pruned);
  }

  return pruned;
}

async function getManagedGroups(): Promise<ManagedTabGroup[]> {
  const result = await webext.storage.local.get(MANAGED_GROUPS_KEY);
  return Array.isArray(result[MANAGED_GROUPS_KEY]) ? (result[MANAGED_GROUPS_KEY] as ManagedTabGroup[]) : [];
}

async function saveManagedGroups(groups: ManagedTabGroup[]): Promise<void> {
  await webext.storage.local.set({ [MANAGED_GROUPS_KEY]: groups });
}

async function getPinnedShortcuts(): Promise<PinnedPageShortcut[]> {
  const result = await webext.storage.local.get(PINNED_SHORTCUTS_KEY);
  return Array.isArray(result[PINNED_SHORTCUTS_KEY]) ? (result[PINNED_SHORTCUTS_KEY] as PinnedPageShortcut[]) : [];
}

async function savePinnedShortcuts(shortcuts: PinnedPageShortcut[]): Promise<void> {
  await webext.storage.local.set({ [PINNED_SHORTCUTS_KEY]: shortcuts });
}

function normalizeFollowUpStatus(item: FollowUpItem, now = Date.now()): FollowUpItem {
  if ((item.status === "waiting" || item.status === "snoozed") && item.reminderAt && item.reminderAt <= now) {
    return { ...item, status: "due", updatedAt: now };
  }

  return item;
}

function followUpAlarmName(itemId: string): string {
  return `${FOLLOW_UP_ALARM_PREFIX}${itemId}`;
}

function followUpNotificationId(itemId: string): string {
  return `${FOLLOW_UP_NOTIFICATION_PREFIX}${itemId}`;
}

function itemIdFromAlarmName(name: string): string | undefined {
  return name.startsWith(FOLLOW_UP_ALARM_PREFIX) ? name.slice(FOLLOW_UP_ALARM_PREFIX.length) : undefined;
}

function itemIdFromNotificationId(notificationId: string): string | undefined {
  return notificationId.startsWith(FOLLOW_UP_NOTIFICATION_PREFIX) ? notificationId.slice(FOLLOW_UP_NOTIFICATION_PREFIX.length) : undefined;
}

async function clearFollowUpAlarm(itemId: string): Promise<void> {
  await Promise.resolve(reminderApis().alarms?.clear?.(followUpAlarmName(itemId))).catch(() => undefined);
}

async function scheduleFollowUpAlarm(item: FollowUpItem): Promise<void> {
  await clearFollowUpAlarm(item.id);
  if (!item.reminderAt || item.status === "done" || item.status === "due" || item.status === "needs-review") {
    return;
  }

  const alarms = reminderApis().alarms;
  if (!alarms?.create) {
    return;
  }

  alarms.create(followUpAlarmName(item.id), { when: Math.max(Date.now() + 1_000, item.reminderAt) });
}

async function scheduleFollowUpAlarms(items?: FollowUpItem[]): Promise<void> {
  const followUps = items ?? (await getFollowUps());
  await Promise.all(followUps.map((item) => scheduleFollowUpAlarm(item)));
}

async function showFollowUpNotification(item: FollowUpItem): Promise<void> {
  const notifications = reminderApis().notifications;
  if (!notifications?.create) {
    return;
  }

  const iconUrl = item.favIconUrl ?? reminderApis().runtime?.getURL?.("icons/icon-128.png");
  await Promise.resolve(
    notifications.create(followUpNotificationId(item.id), {
      ...(iconUrl ? { iconUrl } : {}),
      message: item.note || item.url,
      priority: 1,
      title: `Follow up: ${item.title}`,
      type: "basic",
    }),
  ).catch(() => undefined);
}

async function markFollowUpDue(itemId: string): Promise<void> {
  const items = await getFollowUps();
  const now = Date.now();
  let dueItem: FollowUpItem | undefined;
  const next = items.map((item) => {
    if (item.id !== itemId || item.status === "done") {
      return item;
    }

    dueItem = { ...item, status: "due", updatedAt: now };
    return dueItem;
  });

  if (!dueItem) {
    return;
  }

  await saveFollowUps(next);
  await showFollowUpNotification(dueItem);
  notifyPanelStateChanged();
}

function withoutLiveTabReference(item: FollowUpItem, updatedAt = Date.now()): FollowUpItem {
  const { tabId: _tabId, windowId: _windowId, ...rest } = item;
  return { ...rest, updatedAt };
}

function withLiveTabReference(item: FollowUpItem, tab: BrowserTab, updatedAt = Date.now()): FollowUpItem {
  return {
    ...item,
    updatedAt,
    ...(typeof tab.id === "number" ? { tabId: tab.id } : {}),
    ...(typeof tab.windowId === "number" ? { windowId: tab.windowId } : {}),
  };
}

async function getFollowUps(): Promise<FollowUpItem[]> {
  const result = await webext.storage.local.get(FOLLOW_UP_ITEMS_KEY);
  const value = result[FOLLOW_UP_ITEMS_KEY];
  if (!Array.isArray(value)) {
    return [];
  }

  const now = Date.now();
  const items = (value as FollowUpItem[]).map((item) => normalizeFollowUpStatus(item, now));
  if (JSON.stringify(items) !== JSON.stringify(value)) {
    await saveFollowUps(items);
  }

  return items;
}

async function saveFollowUps(items: FollowUpItem[]): Promise<void> {
  await webext.storage.local.set({ [FOLLOW_UP_ITEMS_KEY]: items });
  await scheduleFollowUpAlarms(items);
}

async function pruneFollowUps(tabs: TabSnapshot[]): Promise<FollowUpItem[]> {
  const liveTabIds = new Set(tabs.map((tab) => tab.id));
  const items = await getFollowUps();
  const pruned = items.map((item) => (item.tabId && !liveTabIds.has(item.tabId) ? withoutLiveTabReference(item) : item));

  if (JSON.stringify(pruned) !== JSON.stringify(items)) {
    await saveFollowUps(pruned);
  }

  return pruned;
}

async function getTabMetadata(): Promise<Record<string, TabMetadata>> {
  const result = await webext.storage.local.get(TAB_METADATA_KEY);
  const value = result[TAB_METADATA_KEY];
  return value && typeof value === "object" ? (value as Record<string, TabMetadata>) : {};
}

async function saveTabMetadata(metadata: Record<string, TabMetadata>): Promise<void> {
  await webext.storage.local.set({ [TAB_METADATA_KEY]: metadata });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function tabMetadataOrEmpty(value: unknown): Record<string, TabMetadata> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, TabMetadata] => {
      const metadata = entry[1];
      return isRecord(metadata) && typeof metadata.openedAt === "number";
    }),
  );
}

async function exportData(): Promise<ExportPayload> {
  return {
    app: "tab-workspace-manager",
    config: await getConfig(),
    data: {
      conversations: await getConversations(),
      followUps: await getFollowUps(),
      managedGroups: await getManagedGroups(),
      pinnedShortcuts: await getPinnedShortcuts(),
      tabMetadata: await getTabMetadata(),
    },
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
  };
}

async function importData(payload: unknown): Promise<void> {
  const record = isRecord(payload) ? payload : {};
  const isBackupPayload = record.app === "tab-workspace-manager" && isRecord(record.data);
  const configSource = isBackupPayload ? record.config : record;
  const nextConfig = mergeConfig(isRecord(configSource) ? (configSource as Partial<AppConfig>) : undefined);

  await saveConfig(nextConfig);

  if (!isBackupPayload) {
    return;
  }

  const data = record.data as Record<string, unknown>;
  if ("conversations" in data) {
    await saveConversations(arrayOrEmpty<LlmConversation>(data.conversations).slice(0, 80));
  }
  if ("followUps" in data) {
    await saveFollowUps(arrayOrEmpty<FollowUpItem>(data.followUps).slice(0, 200).map((item) => normalizeFollowUpStatus(item)));
  }
  if ("managedGroups" in data) {
    await saveManagedGroups(arrayOrEmpty<ManagedTabGroup>(data.managedGroups));
  }
  if ("pinnedShortcuts" in data) {
    await savePinnedShortcuts(arrayOrEmpty<PinnedPageShortcut>(data.pinnedShortcuts).slice(0, 48));
  }
  if ("tabMetadata" in data) {
    await saveTabMetadata(tabMetadataOrEmpty(data.tabMetadata));
  }
}

async function metadataForTabs(tabs: BrowserTab[]): Promise<Record<string, TabMetadata>> {
  const now = Date.now();
  const metadata = await getTabMetadata();
  const liveTabIds = new Set(tabs.map((tab) => tab.id).filter((id): id is number => typeof id === "number").map(String));
  let changed = false;

  for (const tabId of Object.keys(metadata)) {
    if (!liveTabIds.has(tabId)) {
      delete metadata[tabId];
      changed = true;
    }
  }

  for (const tab of tabs) {
    if (typeof tab.id !== "number") {
      continue;
    }

    const key = String(tab.id);
    if (!metadata[key]) {
      metadata[key] = { openedAt: now, ...(tab.active ? { lastActiveAt: now } : {}) };
      changed = true;
      continue;
    }

    if (tab.active && !metadata[key].lastActiveAt) {
      metadata[key] = { ...metadata[key], lastActiveAt: now };
      changed = true;
    }
  }

  if (changed) {
    await saveTabMetadata(metadata);
  }

  return metadata;
}

function snapshotTab(
  tab: BrowserTab | undefined,
  config: AppConfig,
  metadata?: TabMetadata,
): TabSnapshot | undefined {
  if (!tab || typeof tab.id !== "number" || typeof tab.windowId !== "number" || !tab.url) {
    return undefined;
  }

  const rawTitle = tab.title ?? domainKeyForUrl(tab.url) ?? "Untitled";
  const snapshot: TabSnapshot = {
    active: Boolean(tab.active),
    ...(typeof tab.audible === "boolean" ? { audible: tab.audible } : {}),
    id: tab.id,
    ...(typeof tab.mutedInfo?.muted === "boolean" ? { muted: tab.mutedInfo.muted } : {}),
    pinned: Boolean(tab.pinned),
    title: rewritePageTitle(rawTitle, config.titleRewrite) || rawTitle,
    url: tab.url,
    windowId: tab.windowId,
  };

  if (tab.favIconUrl) {
    snapshot.favIconUrl = tab.favIconUrl;
  }

  if (typeof tab.groupId === "number") {
    snapshot.groupId = tab.groupId;
  }

  if (typeof tab.openerTabId === "number") {
    snapshot.openerTabId = tab.openerTabId;
  }

  if (metadata) {
    snapshot.openedAt = metadata.openedAt;
    if (metadata.lastActiveAt) {
      snapshot.lastActiveAt = metadata.lastActiveAt;
    }
  }

  return snapshot;
}

async function listTabs(config: AppConfig): Promise<TabSnapshot[]> {
  const tabs = await webext.tabs.query({ currentWindow: true });
  const metadata = await metadataForTabs(tabs);
  return tabs.map((tab) => snapshotTab(tab, config, typeof tab.id === "number" ? metadata[String(tab.id)] : undefined)).filter((tab): tab is TabSnapshot => Boolean(tab));
}

function nextManagedGroup(
  groups: ManagedTabGroup[],
  input: {
    browserGroupId?: number;
    color: ManagedTabGroup["color"];
    id: string;
    kind: ManagedGroupKind;
    tabIds: number[];
    title: string;
  },
): ManagedTabGroup[] {
  const now = Date.now();
  const existing = groups.find((group) => group.id === input.id);
  const tabIds = [...new Set([...(existing?.tabIds ?? []), ...input.tabIds])];
  const browserGroupId = input.browserGroupId ?? existing?.browserGroupId;
  const next: ManagedTabGroup = {
    color: input.color,
    createdAt: existing?.createdAt ?? now,
    id: input.id,
    kind: input.kind,
    tabIds,
    title: input.title,
    updatedAt: now,
    ...(typeof browserGroupId === "number" ? { browserGroupId } : {}),
  };

  return [next, ...groups.filter((group) => group.id !== input.id)];
}

async function pruneManagedGroups(tabs: TabSnapshot[], groups?: ManagedTabGroup[]): Promise<ManagedTabGroup[]> {
  const currentGroups = groups ?? (await getManagedGroups());
  const liveTabIds = new Set(tabs.map((tab) => tab.id));
  const pruned = currentGroups
    .map((group) => ({ ...group, tabIds: group.tabIds.filter((tabId) => liveTabIds.has(tabId)) }))
    .filter((group) => group.tabIds.length > 0);

  if (JSON.stringify(pruned) !== JSON.stringify(currentGroups)) {
    await saveManagedGroups(pruned);
  }

  return pruned;
}

function browserGroupColor(value: string | undefined): BrowserGroupColor {
  const colors = new Set<BrowserGroupColor>(["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"]);
  return colors.has(value as BrowserGroupColor) ? (value as BrowserGroupColor) : "grey";
}

async function listBrowserTabGroups(tabs: TabSnapshot[]): Promise<Map<number, BrowserTabGroup>> {
  const api = nativeTabGroupApis().tabGroups;
  if (!api?.query) {
    return new Map();
  }

  const windowId = tabs[0]?.windowId;
  const groups = await Promise.resolve(api.query(typeof windowId === "number" ? { windowId } : {})).catch(() => []);
  return new Map(groups.filter((group) => typeof group.id === "number").map((group) => [group.id as number, group]));
}

async function syncManagedGroupsWithBrowser(tabs: TabSnapshot[], groups: ManagedTabGroup[]): Promise<ManagedTabGroup[]> {
  const browserGroups = await listBrowserTabGroups(tabs);
  const now = Date.now();
  const tabsByBrowserGroup = new Map<number, TabSnapshot[]>();

  for (const tab of tabs) {
    if (typeof tab.groupId === "number" && tab.groupId >= 0) {
      const groupedTabs = tabsByBrowserGroup.get(tab.groupId) ?? [];
      groupedTabs.push(tab);
      tabsByBrowserGroup.set(tab.groupId, groupedTabs);
    }
  }

  const next = groups
    .map((group) => {
      if (typeof group.browserGroupId !== "number") {
        return group;
      }

      const groupedTabs = tabsByBrowserGroup.get(group.browserGroupId) ?? [];
      const browserGroup = browserGroups.get(group.browserGroupId);
      if (!browserGroup && groupedTabs.length === 0) {
        const { browserGroupId: _browserGroupId, ...managedOnlyGroup } = group;
        return {
          ...managedOnlyGroup,
          updatedAt: now,
        };
      }

      return {
        ...group,
        color: browserGroupColor(browserGroup?.color) || group.color,
        tabIds: groupedTabs.map((tab) => tab.id),
        title: browserGroup?.title?.trim() || group.title,
        updatedAt: now,
      };
    })
    .filter((group) => group.tabIds.length > 0);

  for (const [browserGroupId, groupedTabs] of tabsByBrowserGroup.entries()) {
    if (next.some((group) => group.browserGroupId === browserGroupId)) {
      continue;
    }

    const browserGroup = browserGroups.get(browserGroupId);
    next.push({
      browserGroupId,
      color: browserGroupColor(browserGroup?.color),
      createdAt: now,
      id: `browser-group:${browserGroupId}`,
      kind: "domain",
      tabIds: groupedTabs.map((tab) => tab.id),
      title: browserGroup?.title?.trim() || "Browser group",
      updatedAt: now,
    });
  }

  if (JSON.stringify(next) !== JSON.stringify(groups)) {
    await saveManagedGroups(next);
  }

  return next;
}

async function addManagedGroup(input: Parameters<typeof nextManagedGroup>[1]): Promise<ManagedTabGroup[]> {
  const groups = await getManagedGroups();
  const next = nextManagedGroup(groups, input);
  await saveManagedGroups(next);
  return next;
}

async function buildPanelState(): Promise<PanelState> {
  const config = await getConfig();
  const tabs = await listTabs(config);
  const syncedGroups = await syncManagedGroupsWithBrowser(tabs, await pruneManagedGroups(tabs));
  const managedGroups = syncedGroups.map((group) => ({
    ...group,
    tabs: group.tabIds.map((tabId) => tabs.find((tab) => tab.id === tabId)).filter((tab): tab is TabSnapshot => Boolean(tab)),
  }));
  const conversations = await pruneConversations(tabs, config);
  const pinnedShortcuts = await getPinnedShortcuts();
  const followUps = await pruneFollowUps(tabs);

  return { config, conversations, followUps, managedGroups, pinnedShortcuts, tabs };
}

async function updateTabGroup(groupId: number, title: string, color: string): Promise<void> {
  const api = nativeTabGroupApis().tabGroups;
  if (!api?.update) {
    return;
  }

  await Promise.resolve(api.update(groupId, { collapsed: false, color, title })).catch(() => undefined);
}

async function groupTabIds(tabIds: number[], title: string, color: string, groupId?: number): Promise<number | undefined> {
  const api = nativeTabGroupApis().tabs;
  if (!api?.group || tabIds.length === 0) {
    return undefined;
  }

  const nextGroupId = await Promise.resolve(
    api.group({ tabIds, ...(typeof groupId === "number" ? { groupId } : {}) }),
  ).catch(() => undefined);
  if (typeof nextGroupId === "number") {
    await updateTabGroup(nextGroupId, title, color);
    return nextGroupId;
  }

  return undefined;
}

async function groupCurrentWindowByDomain(): Promise<void> {
  const config = await getConfig();
  const tabs = await listTabs(config);
  const groups = groupTabsByDomain(tabs, config.grouping);

  await Promise.all(
    groups.map(async (group) => {
      const tabIds = group.tabs.map((tab) => tab.id);
      const browserGroupId = await groupTabIds(tabIds, group.title, group.color);
      await addManagedGroup({
        color: group.color,
        id: `domain:${group.domain}`,
        kind: "domain",
        tabIds,
        title: group.title,
        ...(typeof browserGroupId === "number" ? { browserGroupId } : {}),
      });
    }),
  );
}

function rememberPanelAutoHiddenForMedia(tabId: number, windowId: number): void {
  autohiddenMediaPanel = { tabId, windowId };
}

async function reopenPanelHiddenForMedia(tabId: number, fallbackWindowId: number): Promise<void> {
  if (autohiddenMediaPanel?.tabId !== tabId) {
    return;
  }

  const windowId = autohiddenMediaPanel.windowId ?? fallbackWindowId;
  autohiddenMediaPanel = undefined;
  const opened = await openExtensionPanel(windowId).catch(() => false);
  if (opened) {
    notifyPanelStateChanged();
  }
}

async function moveTabsToManagedGroup(tabIds: number[], groupId: string): Promise<void> {
  const uniqueTabIds = [...new Set(tabIds)];
  if (uniqueTabIds.length === 0) {
    return;
  }

  const tabs = await listTabs(await getConfig());
  const liveTabIds = new Set(tabs.map((tab) => tab.id));
  const movableTabIds = uniqueTabIds.filter((tabId) => liveTabIds.has(tabId));
  if (movableTabIds.length === 0) {
    return;
  }

  const groups = await pruneManagedGroups(tabs);
  const targetGroup = groups.find((group) => group.id === groupId);
  if (!targetGroup) {
    throw new Error("Target group no longer exists.");
  }

  const targetTabIds = [
    ...new Set([...targetGroup.tabIds.filter((tabId) => liveTabIds.has(tabId)), ...movableTabIds]),
  ];
  const browserGroupId = await groupTabIds(
    typeof targetGroup.browserGroupId === "number" ? movableTabIds : targetTabIds,
    targetGroup.title,
    targetGroup.color,
    targetGroup.browserGroupId,
  );
  const now = Date.now();
  const next = groups
    .map((group) => {
      if (group.id === targetGroup.id) {
        return {
          ...group,
          tabIds: targetTabIds,
          updatedAt: now,
          ...(typeof browserGroupId === "number" ? { browserGroupId } : {}),
        };
      }

      return {
        ...group,
        tabIds: group.tabIds.filter((tabId) => !movableTabIds.includes(tabId)),
        updatedAt: group.tabIds.some((tabId) => movableTabIds.includes(tabId)) ? now : group.updatedAt,
      };
    })
    .filter((group) => group.tabIds.length > 0);

  await saveManagedGroups(next);
  notifyPanelStateChanged();
}

async function openWorkspace(workspace: WorkspaceTemplate): Promise<void> {
  const sanitized = sanitizeWorkspace(workspace);
  const createdTabs: number[] = [];

  for (const url of sanitized.urls) {
    const tab = await webext.tabs.create({ active: createdTabs.length === 0, url });
    if (typeof tab.id === "number") {
      createdTabs.push(tab.id);
    }
  }

  const browserGroupId = await groupTabIds(createdTabs, sanitized.name, sanitized.color);
  await addManagedGroup({
    color: sanitized.color,
    id: `workspace:${sanitized.id}`,
    kind: "workspace",
    tabIds: createdTabs,
    title: sanitized.name,
    ...(typeof browserGroupId === "number" ? { browserGroupId } : {}),
  });
}

async function groupLlmTabs(config: AppConfig, extraTabs: TabSnapshot[] = []): Promise<void> {
  const tabs = await listTabs(config);
  const llmTabs = [...tabs.filter((tab) => providerForUrl(tab.url, config.llmProviders)), ...extraTabs].filter(
    (tab, index, candidates) => candidates.findIndex((candidate) => candidate.id === tab.id) === index,
  );
  if (llmTabs.length === 0) {
    return;
  }

  const existingGroup = (await getManagedGroups()).find((group) => group.id === "llm:workbench");
  const color = existingGroup?.color ?? "purple";
  const title = existingGroup?.title ?? config.llmProviders.find((provider) => provider.enabled)?.groupTitle ?? "LLM Workbench";
  const tabIdsForBrowserGroup =
    typeof existingGroup?.browserGroupId === "number"
      ? llmTabs.filter((tab) => tab.groupId !== existingGroup.browserGroupId).map((tab) => tab.id)
      : llmTabs.map((tab) => tab.id);
  const browserGroupId = await groupTabIds(tabIdsForBrowserGroup, title, color, existingGroup?.browserGroupId);

  await addManagedGroup({
    color,
    id: "llm:workbench",
    kind: "llm",
    tabIds: llmTabs.map((tab) => tab.id),
    title,
    ...(typeof browserGroupId === "number" ? { browserGroupId } : {}),
  });
}

async function openLlmProvider(providerId: string): Promise<void> {
  const config = await getConfig();
  const provider = config.llmProviders.find((candidate) => candidate.id === providerId && candidate.enabled);
  if (!provider) {
    throw new Error(`Unknown LLM provider: ${providerId}`);
  }

  const tab = await webext.tabs.create({ active: true, url: provider.url });
  const snapshot = snapshotTab(tab, config);
  if (snapshot) {
    const conversations = await getConversations();
    await saveConversations([conversationFromTab(snapshot, provider, "waiting"), ...conversations].slice(0, 80));
  }

  await groupLlmTabs(config, snapshot ? [snapshot] : []);
  notifyPanelStateChanged();
}

async function focusGroupTabByShortcut(position: number): Promise<void> {
  if (!Number.isInteger(position) || position < 1 || position > 9) {
    return;
  }

  const config = await getConfig();
  const tabs = await listTabs(config);
  const groups = await syncManagedGroupsWithBrowser(tabs, await pruneManagedGroups(tabs));
  const activeTab = tabs.find((tab) => tab.active);
  const activeGroup = activeTab ? groups.find((group) => group.tabIds.includes(activeTab.id)) : undefined;
  const targetGroup = activeGroup ?? groups.find((group) => group.id === "llm:workbench") ?? groups[0];
  const targetTabId = targetGroup?.tabIds.filter((tabId) => tabs.some((tab) => tab.id === tabId))[position - 1];
  const targetTab = tabs.find((tab) => tab.id === targetTabId);

  if (targetTab) {
    await focusTab(targetTab.id, targetTab.windowId);
  }
}

function summarizablePageUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

async function refreshPageSummaryContextMenu(): Promise<void> {
  const contextMenus = webext.contextMenus;
  if (!contextMenus) {
    return;
  }

  await contextMenus.remove(PAGE_SUMMARY_CONTEXT_MENU_ID).catch(() => undefined);

  const config = await getConfig();
  const provider = pageSummaryProvider(config);
  if (!provider) {
    return;
  }

  contextMenus.create({
    contexts: ["page"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
    id: PAGE_SUMMARY_CONTEXT_MENU_ID,
    title: `Summarize current page with ${provider.name}`,
  });
}

async function summarizePage(url: string | undefined): Promise<void> {
  const pageUrl = summarizablePageUrl(url);
  if (!pageUrl) {
    return;
  }

  const config = await getConfig();
  const provider = pageSummaryProvider(config);
  const deepLink = provider ? pageSummaryDeepLink(provider, pageUrl) : undefined;
  if (!provider || !deepLink) {
    await refreshPageSummaryContextMenu();
    return;
  }

  const tab = await webext.tabs.create({ active: true, url: deepLink });
  const snapshot = snapshotTab(tab, config);
  if (snapshot) {
    const conversations = await getConversations();
    await saveConversations([conversationFromTab(snapshot, provider, "waiting"), ...conversations].slice(0, 80));
    await groupLlmTabs(config, [snapshot]);
  }

  notifyPanelStateChanged();
}

async function focusTab(tabId: number, windowId: number): Promise<void> {
  await webext.windows.update(windowId, { focused: true });
  await webext.tabs.update(tabId, { active: true });
}

async function closeTabs(tabIds: number[]): Promise<void> {
  const uniqueTabIds = [...new Set(tabIds)];
  if (uniqueTabIds.length === 0) {
    return;
  }

  await webext.tabs.remove(uniqueTabIds);
  const groups = await getManagedGroups();
  await saveManagedGroups(
    groups
      .map((group) => ({ ...group, tabIds: group.tabIds.filter((tabId) => !uniqueTabIds.includes(tabId)) }))
      .filter((group) => group.tabIds.length > 0),
  );
  const conversations = await getConversations();
  await saveConversations(conversations.filter((conversation) => !uniqueTabIds.includes(conversation.tabId)));
  const followUps = await getFollowUps();
  await saveFollowUps(
    followUps.map((item) =>
      item.tabId && uniqueTabIds.includes(item.tabId) ? withoutLiveTabReference(item) : item,
    ),
  );
  notifyPanelStateChanged();
}

async function addFollowUpFromTab(input: Extract<ExtensionMessage, { type: "ADD_FOLLOW_UP_FROM_TAB" }>): Promise<void> {
  const config = await getConfig();
  const tab = await webext.tabs.get(input.tabId);
  const snapshot = snapshotTab(tab, config);
  if (!snapshot) {
    return;
  }

  const now = Date.now();
  const status: FollowUpStatus = input.reminderAt && input.reminderAt <= now ? "due" : input.reminderAt ? "snoozed" : "waiting";
  const nextItem: FollowUpItem = {
    createdAt: now,
    id: `follow-up:${snapshot.url}`,
    source: input.source ?? "manual",
    status,
    tabId: snapshot.id,
    title: snapshot.title,
    updatedAt: now,
    url: snapshot.url,
    windowId: snapshot.windowId,
    ...(snapshot.favIconUrl ? { favIconUrl: snapshot.favIconUrl } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.reminderAt ? { reminderAt: input.reminderAt } : {}),
  };

  const items = await getFollowUps();
  await saveFollowUps([nextItem, ...items.filter((item) => item.id !== nextItem.id)].slice(0, 200));

  if (input.closeTab) {
    await closeTabs([snapshot.id]);
  } else {
    notifyPanelStateChanged();
  }
}

async function updateFollowUp(itemId: string, patch: Extract<ExtensionMessage, { type: "UPDATE_FOLLOW_UP" }>["patch"]): Promise<void> {
  const items = await getFollowUps();
  const now = Date.now();
  await saveFollowUps(
    items.map((item) => {
      if (item.id !== itemId) {
        return item;
      }

      return normalizeFollowUpStatus({
        ...item,
        updatedAt: now,
        ...(patch.status ? { status: patch.status } : {}),
        ...(typeof patch.reminderAt === "number" ? { reminderAt: patch.reminderAt } : {}),
        ...(patch.note?.trim() ? { note: patch.note.trim() } : {}),
      }, now);
    }),
  );
  notifyPanelStateChanged();
}

async function openFollowUp(itemId: string): Promise<void> {
  const items = await getFollowUps();
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return;
  }

  if (typeof item.tabId === "number" && typeof item.windowId === "number") {
    await focusTab(item.tabId, item.windowId).catch(async () => {
      const tab = await webext.tabs.create({ active: true, url: item.url });
      const now = Date.now();
      await saveFollowUps(items.map((candidate) => candidate.id === itemId ? withLiveTabReference(candidate, tab, now) : candidate));
    });
  } else {
    const tab = await webext.tabs.create({ active: true, url: item.url });
    const now = Date.now();
    await saveFollowUps(items.map((candidate) => candidate.id === itemId ? withLiveTabReference(candidate, tab, now) : candidate));
  }

  notifyPanelStateChanged();
}

async function removeFollowUp(itemId: string): Promise<void> {
  const items = await getFollowUps();
  await clearFollowUpAlarm(itemId);
  await saveFollowUps(items.filter((item) => item.id !== itemId));
  notifyPanelStateChanged();
}

async function pinPage(tabId: number): Promise<void> {
  const config = await getConfig();
  const tab = await webext.tabs.get(tabId);
  const snapshot = snapshotTab(tab, config);
  if (!snapshot) {
    return;
  }

  const shortcuts = await getPinnedShortcuts();
  const nextShortcut: PinnedPageShortcut = {
    id: `page:${snapshot.url}`,
    title: snapshot.title,
    url: snapshot.url,
    ...(snapshot.favIconUrl ? { favIconUrl: snapshot.favIconUrl } : {}),
  };

  await savePinnedShortcuts([nextShortcut, ...shortcuts.filter((shortcut) => shortcut.id !== nextShortcut.id)].slice(0, 24));
}

async function openPinnedShortcut(shortcutId: string): Promise<void> {
  const shortcuts = await getPinnedShortcuts();
  const shortcut = shortcuts.find((candidate) => candidate.id === shortcutId);
  if (!shortcut) {
    return;
  }

  await webext.tabs.create({ active: true, url: shortcut.url });
}

async function removePinnedShortcut(shortcutId: string): Promise<void> {
  const shortcuts = await getPinnedShortcuts();
  await savePinnedShortcuts(shortcuts.filter((shortcut) => shortcut.id !== shortcutId));
}

async function groupOpenedFromParent(tab: BrowserTab): Promise<void> {
  const config = await getConfig();
  if (!config.grouping.autoGroupOpenerTabs || typeof tab.id !== "number" || typeof tab.openerTabId !== "number") {
    return;
  }

  // Launchpad tabs are grouped explicitly by openLlmProvider. Letting the
  // opener-group handler manage them as well races its managed-group write.
  if (providerForUrl(tab.url ?? "", config.llmProviders)) {
    return;
  }

  const opener = await webext.tabs.get(tab.openerTabId).catch(() => undefined);
  if (!opener || typeof opener.id !== "number") {
    return;
  }

  const existingGroups = await getManagedGroups();
  const openerGroup = existingGroups.find((group) => group.tabIds.includes(opener.id ?? -1));
  const openerSnapshot = snapshotTab(opener, config);
  const childSnapshot = snapshotTab(tab, config);
  const tabIds = [opener.id, tab.id];
  const title = openerGroup?.title ?? openerSnapshot?.title ?? childSnapshot?.title ?? "Linked tabs";
  const color = openerGroup?.color ?? (openerSnapshot?.url ? "cyan" : "grey");
  const id = openerGroup?.id ?? `opener:${opener.id}`;
  const browserGroupId =
    typeof opener.groupId === "number" && opener.groupId >= 0
      ? await groupTabIds([tab.id], title, color, opener.groupId)
      : await groupTabIds(tabIds, title, color);

  await addManagedGroup({
    color,
    id,
    kind: openerGroup?.kind ?? "opener",
    tabIds,
    title,
    ...(typeof browserGroupId === "number" ? { browserGroupId } : {}),
  });
}

async function refreshConversationFromTab(tabId: number, changeInfo: TabChangeInfo): Promise<void> {
  const config = await getConfig();
  const tab = await webext.tabs.get(tabId).catch(() => undefined);
  const snapshot = snapshotTab(tab, config);
  const provider = snapshot ? providerForUrl(snapshot.url, config.llmProviders) : undefined;
  if (!snapshot || !provider) {
    const conversations = await getConversations();
    const withoutCurrent = conversations.filter((conversation) => conversation.tabId !== tabId);
    if (withoutCurrent.length !== conversations.length) {
      await saveConversations(withoutCurrent);
    }
    return;
  }

  const conversations = await getConversations();
  const existing = conversations.find((conversation) => conversation.tabId === tabId);
  const titleChanged = Boolean(changeInfo.title && existing && existing.title !== snapshot.title);
  const next = conversationFromTab(snapshot, provider, titleChanged ? "responded" : statusForTabLoad(changeInfo.status));
  const withoutCurrent = conversations.filter((conversation) => conversation.tabId !== tabId);
  await saveConversations([next, ...withoutCurrent].slice(0, 80));
  notifyPanelStateChanged();
}

async function markLlmActivity(
  sender: MessageSender,
  status: "active" | "waiting" | "responded",
  title: string,
): Promise<void> {
  const config = await getConfig();
  const senderTab = sender.tab ? { ...sender.tab } : undefined;
  if (senderTab && title) {
    senderTab.title = title;
  }

  const snapshot = senderTab ? snapshotTab(senderTab, config) : undefined;
  const provider = snapshot ? providerForUrl(snapshot.url, config.llmProviders) : undefined;
  if (!snapshot || !provider) {
    return;
  }

  const conversations = await getConversations();
  const next = conversationFromTab(snapshot, provider, status);
  const withoutCurrent = conversations.filter((conversation) => conversation.tabId !== snapshot.id);
  await saveConversations([next, ...withoutCurrent].slice(0, 80));
  notifyPanelStateChanged();
}

async function handleMessage(message: ExtensionMessage, sender: MessageSender = {}): Promise<ExtensionResponse> {
  try {
    switch (message.type) {
      case "GET_PANEL_STATE":
        return { ok: true, state: await buildPanelState() };
      case "GET_CONFIG":
        return { ok: true, config: await getConfig() };
      case "SAVE_CONFIG":
        await saveConfig(message.config);
        await refreshPageSummaryContextMenu();
        return { ok: true };
      case "EXPORT_DATA":
        return { ok: true, payload: await exportData() };
      case "IMPORT_DATA":
        await importData(message.payload);
        await refreshPageSummaryContextMenu();
        notifyPanelStateChanged();
        return { ok: true };
      case "GROUP_BY_DOMAIN":
        await groupCurrentWindowByDomain();
        return { ok: true };
      case "MOVE_TABS_TO_GROUP":
        await moveTabsToManagedGroup(message.tabIds, message.groupId);
        return { ok: true };
      case "PANEL_AUTOHIDDEN_FOR_MEDIA":
        rememberPanelAutoHiddenForMedia(message.tabId, message.windowId);
        await closeExtensionPanel(message.windowId).catch(() => false);
        return { ok: true };
      case "FOCUS_GROUP_TAB":
        await focusGroupTabByShortcut(message.position);
        return { ok: true };
      case "OPEN_WORKSPACE":
        await openWorkspace(message.workspace);
        return { ok: true };
      case "OPEN_LLM_PROVIDER":
        await openLlmProvider(message.providerId);
        return { ok: true };
      case "CLOSE_TABS":
        await closeTabs(message.tabIds);
        return { ok: true };
      case "ADD_FOLLOW_UP_FROM_TAB":
        await addFollowUpFromTab(message);
        return { ok: true };
      case "UPDATE_FOLLOW_UP":
        await updateFollowUp(message.itemId, message.patch);
        return { ok: true };
      case "OPEN_FOLLOW_UP":
        await openFollowUp(message.itemId);
        return { ok: true };
      case "REMOVE_FOLLOW_UP":
        await removeFollowUp(message.itemId);
        return { ok: true };
      case "PIN_PAGE":
        await pinPage(message.tabId);
        return { ok: true };
      case "OPEN_PINNED_SHORTCUT":
        await openPinnedShortcut(message.shortcutId);
        return { ok: true };
      case "REMOVE_PINNED_SHORTCUT":
        await removePinnedShortcut(message.shortcutId);
        return { ok: true };
      case "LLM_ACTIVITY":
        await markLlmActivity(sender, message.status, message.title);
        return { ok: true };
      case "FOCUS_TAB":
        await focusTab(message.tabId, message.windowId);
        return { ok: true };
      case "OPEN_OPTIONS":
        await webext.runtime.openOptionsPage();
        return { ok: true };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

webext.runtime.onInstalled.addListener(() => {
  void ensureDefaultConfig().then(refreshPageSummaryContextMenu).then(() => scheduleFollowUpAlarms());
  void enableActionSidePanelOpen();
});

webext.runtime.onStartup.addListener(() => {
  void refreshPageSummaryContextMenu().then(() => scheduleFollowUpAlarms());
  void enableActionSidePanelOpen();
});

reminderApis().alarms?.onAlarm?.addListener((alarm) => {
  const itemId = itemIdFromAlarmName(alarm.name);
  if (itemId) {
    void markFollowUpDue(itemId);
  }
});

reminderApis().notifications?.onClicked?.addListener((notificationId) => {
  const itemId = itemIdFromNotificationId(notificationId);
  if (itemId) {
    void openFollowUp(itemId);
  }
});

webext.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== PAGE_SUMMARY_CONTEXT_MENU_ID) {
    return;
  }

  void summarizePage(info.pageUrl ?? tab?.url);
});

webext.commands.onCommand.addListener((command) => {
  if (command === "open-side-panel") {
    void webext.windows.getCurrent().then((window) => openExtensionPanel(window.id));
  }

  if (command === "group-by-domain") {
    void groupCurrentWindowByDomain();
  }

  const shortcutMatch = /^focus-group-tab-([1-9])$/.exec(command);
  if (shortcutMatch) {
    void focusGroupTabByShortcut(Number(shortcutMatch[1]));
  }
});

webext.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status || changeInfo.title || changeInfo.url) {
    void refreshConversationFromTab(tabId, changeInfo);
  }

  if (changeInfo.audible === true) {
    void webext.tabs.get(tabId).then((tab) => {
      if (tab.active && tab.audible && typeof tab.windowId === "number") {
        void notifyActiveMediaStarted(tabId, tab.windowId);
      }
    }).catch(() => undefined);
  }

  if (
    changeInfo.status ||
    changeInfo.title ||
    changeInfo.url ||
    changeInfo.favIconUrl ||
    typeof changeInfo.groupId === "number" ||
    typeof changeInfo.audible === "boolean" ||
    typeof changeInfo.mutedInfo?.muted === "boolean"
  ) {
    notifyPanelStateChanged();
  }
});

webext.tabs.onCreated.addListener((tab) => {
  void groupOpenedFromParent(tab).finally(notifyPanelStateChanged);
});

webext.tabs.onRemoved.addListener((tabId, removeInfo) => {
  void reopenPanelHiddenForMedia(tabId, removeInfo.windowId);
  void getManagedGroups().then((groups) =>
    saveManagedGroups(
      groups
        .map((group) => ({ ...group, tabIds: group.tabIds.filter((candidate) => candidate !== tabId) }))
        .filter((group) => group.tabIds.length > 0),
    ),
  ).finally(notifyPanelStateChanged);
});

webext.tabs.onActivated.addListener(() => {
  void webext.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (typeof tab?.id !== "number") {
      return;
    }

    const metadata = await getTabMetadata();
    metadata[String(tab.id)] = {
      openedAt: metadata[String(tab.id)]?.openedAt ?? Date.now(),
      lastActiveAt: Date.now(),
    };
    await saveTabMetadata(metadata);

    if (tab.audible && typeof tab.windowId === "number") {
      void notifyActiveMediaStarted(tab.id, tab.windowId);
    }
  }).catch(() => undefined);
  notifyPanelStateChanged();
});

webext.runtime.onMessage.addListener((message: unknown, sender: unknown) => {
  const runtimeEventType = (message as Partial<RuntimeEvent>).type;
  if (runtimeEventType === "PANEL_STATE_CHANGED" || runtimeEventType === "MEDIA_PLAYING_IN_ACTIVE_TAB") {
    return undefined;
  }

  return handleMessage(message as ExtensionMessage, sender as MessageSender);
});
