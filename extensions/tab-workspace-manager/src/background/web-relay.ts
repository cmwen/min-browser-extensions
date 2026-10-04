import {
  CapabilityError,
  createExtensionProvider,
  LAUNCHER_ID,
  type TabContext,
} from "@web-relay/sdk/extension";
import { canOpenWorkspace, type AppConfig, type WorkspaceTemplate } from "@minext/core";

export const WEB_RELAY_PROVIDER_ID = "tab-workspace-manager";

type Actions = {
  getConfig: () => Promise<AppConfig>;
  groupByDomain: (context: TabContext | undefined) => Promise<void>;
  openWorkspace: (workspace: WorkspaceTemplate) => Promise<void>;
  openLlmProvider: (providerId: string) => Promise<void>;
  saveFollowUp: (tabId: number) => Promise<void>;
  openOptions: () => Promise<void>;
};

function findNamed<T extends { id: string; name: string }>(items: T[], input: string | undefined, label: string): T {
  const query = input?.trim().toLowerCase();
  const byId = items.find((item) => item.id.toLowerCase() === query);
  if (byId) {
    return byId;
  }

  const matches = items.filter((item) => item.name.trim().toLowerCase() === query);
  if (matches.length === 1 && matches[0]) {
    return matches[0];
  }

  const choices = items.map((item) => `${item.name} (${item.id})`).join(", ");
  throw new CapabilityError(
    matches.length > 1 ? "AMBIGUOUS_INPUT" : "NOT_FOUND",
    matches.length > 1
      ? `More than one ${label} has that name. Enter its ID: ${choices}`
      : `Enter a saved ${label} name or ID. ${choices ? `Available: ${choices}` : `Configure a ${label} in Tab Workspace Manager settings first.`}`,
  );
}

/** Chromium transport only. Register at worker startup; read saved state per invocation. */
export function registerWebRelayProvider(actions: Actions): ReturnType<typeof createExtensionProvider> {
  return createExtensionProvider({
    providerId: WEB_RELAY_PROVIDER_ID,
    name: "Tab Workspace Manager",
    launcherId: LAUNCHER_ID,
    register(registry) {
      registry.register({
        id: `${WEB_RELAY_PROVIDER_ID}.group-by-domain`,
        title: "Group tabs by domain",
        description: "Group this window's tabs using your saved grouping rules.",
        run: async (context) => {
          await actions.groupByDomain(context);
          return { message: "Grouped tabs by domain." };
        },
      });
      registry.register({
        id: `${WEB_RELAY_PROVIDER_ID}.open-workspace`,
        title: "Open a saved workspace",
        description: "Enter the workspace's exact name or ID from settings.",
        input: "text",
        run: async (_context, input) => {
          const config = await actions.getConfig();
          const workspace = findNamed(config.workspaceTemplates, input, "workspace");
          if (!canOpenWorkspace(workspace)) {
            throw new CapabilityError("EMPTY_WORKSPACE", "Add a valid URL to this workspace in settings first.");
          }
          await actions.openWorkspace(workspace);
          return { message: `Opened workspace: ${workspace.name}.` };
        },
      });
      registry.register({
        id: `${WEB_RELAY_PROVIDER_ID}.open-llm-provider`,
        title: "Open a new LLM chat",
        description: "Enter an enabled provider's exact name or ID, such as ChatGPT or Gemini.",
        input: "text",
        run: async (_context, input) => {
          const config = await actions.getConfig();
          const provider = findNamed(config.llmProviders.filter((item) => item.enabled), input, "LLM provider");
          await actions.openLlmProvider(provider.id);
          return { message: `Opened ${provider.name} in the LLM Workbench.` };
        },
      });
      registry.register({
        id: `${WEB_RELAY_PROVIDER_ID}.save-follow-up`,
        title: "Save current tab for follow-up",
        description: "Keep this page in Follow-up and leave its tab open.",
        when: (context) => Boolean(context && /^https?:\/\//.test(context.url)),
        run: async (context) => {
          if (!context) {
            throw new CapabilityError("NO_CONTEXT", "Open a website first.");
          }
          await actions.saveFollowUp(context.tabId);
          return { message: "Saved current tab for follow-up." };
        },
      });
      registry.register({
        id: `${WEB_RELAY_PROVIDER_ID}.open-settings`,
        title: "Open Tab Workspace Manager settings",
        run: async () => {
          await actions.openOptions();
          return { message: "Opened Tab Workspace Manager settings." };
        },
      });
    },
  });
}
