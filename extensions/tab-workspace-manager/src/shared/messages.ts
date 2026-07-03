import type {
  AppConfig,
  FollowUpItem,
  FollowUpSource,
  FollowUpStatus,
  LlmConversation,
  LlmConversationStatus,
  ManagedTabGroup,
  ManagedTabGroupView,
  PinnedPageShortcut,
  TabSnapshot,
  WorkspaceTemplate,
} from "@minext/core";

export type PanelState = {
  config: AppConfig;
  conversations: LlmConversation[];
  followUps: FollowUpItem[];
  managedGroups: ManagedTabGroupView<TabSnapshot>[];
  pinnedShortcuts: PinnedPageShortcut[];
  tabs: TabSnapshot[];
};

export type FollowUpPatch = {
  note?: string;
  reminderAt?: number;
  status?: FollowUpStatus;
};

export type ExportPayload = {
  app: "tab-workspace-manager";
  config: AppConfig;
  data: {
    conversations: LlmConversation[];
    followUps: FollowUpItem[];
    managedGroups: ManagedTabGroup[];
    pinnedShortcuts: PinnedPageShortcut[];
    tabMetadata: Record<string, { lastActiveAt?: number; openedAt: number }>;
  };
  exportedAt: string;
  schemaVersion: 1;
};

export type ExtensionMessage =
  | { type: "GET_PANEL_STATE" }
  | { type: "GET_CONFIG" }
  | { type: "SAVE_CONFIG"; config: AppConfig }
  | { type: "EXPORT_DATA" }
  | { type: "IMPORT_DATA"; payload: unknown }
  | { type: "GROUP_BY_DOMAIN" }
  | { type: "MOVE_TABS_TO_GROUP"; groupId: string; tabIds: number[] }
  | { type: "OPEN_WORKSPACE"; workspace: WorkspaceTemplate }
  | { type: "OPEN_LLM_PROVIDER"; providerId: string }
  | { type: "CLOSE_TABS"; tabIds: number[] }
  | { type: "ADD_FOLLOW_UP_FROM_TAB"; closeTab?: boolean; note?: string; reminderAt?: number; source?: FollowUpSource; tabId: number }
  | { type: "UPDATE_FOLLOW_UP"; itemId: string; patch: FollowUpPatch }
  | { type: "OPEN_FOLLOW_UP"; itemId: string }
  | { type: "REMOVE_FOLLOW_UP"; itemId: string }
  | { type: "PIN_PAGE"; tabId: number }
  | { type: "OPEN_PINNED_SHORTCUT"; shortcutId: string }
  | { type: "REMOVE_PINNED_SHORTCUT"; shortcutId: string }
  | { type: "LLM_ACTIVITY"; status: Extract<LlmConversationStatus, "active" | "waiting" | "responded">; title: string }
  | { type: "FOCUS_TAB"; tabId: number; windowId: number }
  | { type: "OPEN_OPTIONS" };

export type RuntimeEvent = { type: "PANEL_STATE_CHANGED" } | { type: "MEDIA_PLAYING_IN_ACTIVE_TAB"; tabId: number };

export type ExtensionResponse =
  | { ok: true }
  | { ok: true; config: AppConfig }
  | { ok: true; payload: ExportPayload }
  | { ok: true; state: PanelState }
  | { ok: false; error: string };
