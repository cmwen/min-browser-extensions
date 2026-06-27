import type {
  AppConfig,
  LlmConversation,
  LlmConversationStatus,
  ManagedTabGroupView,
  PinnedPageShortcut,
  TabSnapshot,
  WorkspaceTemplate,
} from "@minext/core";

export type PanelState = {
  config: AppConfig;
  conversations: LlmConversation[];
  managedGroups: ManagedTabGroupView<TabSnapshot>[];
  pinnedShortcuts: PinnedPageShortcut[];
  tabs: TabSnapshot[];
};

export type ExtensionMessage =
  | { type: "GET_PANEL_STATE" }
  | { type: "GET_CONFIG" }
  | { type: "SAVE_CONFIG"; config: AppConfig }
  | { type: "GROUP_BY_DOMAIN" }
  | { type: "OPEN_WORKSPACE"; workspace: WorkspaceTemplate }
  | { type: "OPEN_LLM_PROVIDER"; providerId: string }
  | { type: "CLOSE_TABS"; tabIds: number[] }
  | { type: "PIN_PAGE"; tabId: number }
  | { type: "OPEN_PINNED_SHORTCUT"; shortcutId: string }
  | { type: "REMOVE_PINNED_SHORTCUT"; shortcutId: string }
  | { type: "LLM_ACTIVITY"; status: Extract<LlmConversationStatus, "active" | "waiting" | "responded">; title: string }
  | { type: "FOCUS_TAB"; tabId: number; windowId: number }
  | { type: "OPEN_OPTIONS" };

export type RuntimeEvent = { type: "PANEL_STATE_CHANGED" };

export type ExtensionResponse =
  | { ok: true }
  | { ok: true; config: AppConfig }
  | { ok: true; state: PanelState }
  | { ok: false; error: string };
