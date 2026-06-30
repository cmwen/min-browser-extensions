export type ThemeMode = "system" | "light" | "dark";

export type LlmConversationStatus = "active" | "waiting" | "responded" | "pinned" | "stale" | "needs-review";

export type TabSnapshot = {
  active: boolean;
  audible?: boolean;
  favIconUrl?: string;
  groupId?: number;
  id: number;
  lastActiveAt?: number;
  muted?: boolean;
  openedAt?: number;
  openerTabId?: number;
  pinned: boolean;
  title: string;
  url: string;
  windowId: number;
};

export type PinnedPageShortcut = {
  favIconUrl?: string;
  id: string;
  title: string;
  url: string;
};

export type FollowUpStatus = "waiting" | "due" | "snoozed" | "needs-review" | "done";

export type FollowUpSource = "manual" | "llm" | "read-later";

export type FollowUpItem = {
  createdAt: number;
  favIconUrl?: string;
  id: string;
  note?: string;
  reminderAt?: number;
  source: FollowUpSource;
  status: FollowUpStatus;
  tabId?: number;
  title: string;
  updatedAt: number;
  url: string;
  windowId?: number;
};

export type ManagedGroupKind = "workspace" | "llm" | "domain" | "opener";

export type ManagedTabGroup = {
  browserGroupId?: number;
  color: BrowserGroupColor;
  createdAt: number;
  id: string;
  kind: ManagedGroupKind;
  tabIds: number[];
  title: string;
  updatedAt: number;
  windowId?: number;
};

export type ManagedTabGroupView<TTab = TabSnapshot> = Omit<ManagedTabGroup, "tabIds"> & {
  tabs: TTab[];
};

export type DomainGroup<TTab = TabSnapshot> = {
  color: BrowserGroupColor;
  domain: string;
  title: string;
  tabs: TTab[];
};

export type BrowserGroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

export type WorkspaceTemplate = {
  color: BrowserGroupColor;
  id: string;
  name: string;
  urls: string[];
};

export type LlmProvider = {
  deepLinkTemplate?: string;
  enabled: boolean;
  groupTitle: string;
  id: string;
  name: string;
  url: string;
  urlPatterns: string[];
};

export type LlmConversation = {
  providerId: string;
  status: LlmConversationStatus;
  tabId: number;
  title: string;
  topic: string;
  updatedAt: number;
  url: string;
  windowId: number;
};

export type GroupingRules = {
  autoGroupOpenerTabs: boolean;
  excludedDomains: string[];
  minimumTabsPerGroup: number;
};

export type TitleReplacementRule = {
  enabled: boolean;
  id: string;
  match: "contains" | "regex";
  pattern: string;
  replacement: string;
};

export type TitleRewriteConfig = {
  enabled: boolean;
  rules: TitleReplacementRule[];
};

export type PageSummaryConfig = {
  providerId: string;
};

export type RelationshipWeights = {
  activeHistory: number;
  llmConversation: number;
  opener: number;
  openTime: number;
  pinned: number;
  sameDomain: number;
  sameGroup: number;
};

export type ContextMapConfig = {
  adaptiveLearning: boolean;
  weights: RelationshipWeights;
};

export type AppConfig = {
  contextMap: ContextMapConfig;
  grouping: GroupingRules;
  llmProviders: LlmProvider[];
  pageSummary: PageSummaryConfig;
  schemaVersion: number;
  theme: ThemeMode;
  titleRewrite: TitleRewriteConfig;
  workspaceTemplates: WorkspaceTemplate[];
};
