import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "@minext/core";
import { LAUNCHER_ID } from "@web-relay/sdk/extension";
import { registerWebRelayProvider } from "./web-relay";

type Listener = (
  request: unknown,
  sender: { id: string },
  respond: (response: unknown) => void,
) => true | undefined;

describe("Web Relay extension provider", () => {
  let listener: Listener;
  let config: typeof DEFAULT_CONFIG;
  let actions: Parameters<typeof registerWebRelayProvider>[0];
  let provider: ReturnType<typeof registerWebRelayProvider>;
  const context = { tabId: 42, url: "https://example.com/research" };
  const query = vi.fn();
  const removeListener = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    config = structuredClone(DEFAULT_CONFIG);
    config.workspaceTemplates = [
      { id: "research", name: "Research", color: "blue", urls: ["https://example.com"] },
    ];
    actions = {
      getConfig: vi.fn(async () => config),
      groupByDomain: vi.fn(async () => undefined),
      openWorkspace: vi.fn(async () => undefined),
      openLlmProvider: vi.fn(async () => undefined),
      saveFollowUp: vi.fn(async () => undefined),
      openOptions: vi.fn(async () => undefined),
    };
    query.mockResolvedValue([{ id: context.tabId, url: context.url }]);
    vi.stubGlobal("chrome", {
      tabs: { query },
      runtime: {
        onMessageExternal: {
          addListener: (callback: Listener) => { listener = callback; },
          removeListener,
        },
      },
    });
    provider = registerWebRelayProvider(actions);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("disposes the external listener without executing commands", () => {
    provider.dispose();
    expect(removeListener).toHaveBeenCalledExactlyOnceWith(listener);
    for (const action of Object.values(actions)) {
      expect(action).not.toHaveBeenCalled();
    }
  });

  function request(type: "describe" | "discover" | "execute", extra: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve) => {
      listener({ channel: "web-relay", version: 1, requestId: "test", type, ...extra }, { id: LAUNCHER_ID }, resolve);
    });
  }

  it("describes its pairing identity without reading configuration, querying tabs, or running actions", async () => {
    const response = await request("describe");
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({
      providerId: "tab-workspace-manager",
      name: "Tab Workspace Manager",
      protocolVersion: 1,
    });
    expect(query).not.toHaveBeenCalled();
    for (const action of Object.values(actions)) {
      expect(action).not.toHaveBeenCalled();
    }
  });

  it("registers synchronously and discovers only global commands without page context", async () => {
    const response = await request("discover");
    expect(response.ok).toBe(true);
    expect(response.data).toHaveLength(4);
    expect(response.data.every((item: { providerId: string }) => item.providerId === "tab-workspace-manager")).toBe(true);
    expect(response.data.some((item: { id: string }) => item.id.endsWith("save-follow-up"))).toBe(false);
    expect(actions.groupByDomain).not.toHaveBeenCalled();
  });

  it("ignores unpaired senders and malformed messages", () => {
    const respond = vi.fn();
    expect(listener({ channel: "web-relay", version: 1, requestId: "test", type: "discover" }, { id: "unpaired" }, respond)).toBeUndefined();
    expect(listener({ channel: "web-relay", version: 1, requestId: "test", type: "describe" }, { id: "unpaired" }, respond)).toBeUndefined();
    expect(listener({ type: "execute" }, { id: LAUNCHER_ID }, respond)).toBeUndefined();
    expect(respond).not.toHaveBeenCalled();
    expect(actions.getConfig).not.toHaveBeenCalled();
  });

  it("rejects a stale active tab before invoking any action", async () => {
    query.mockResolvedValue([{ id: 99, url: context.url }]);
    const response = await request("execute", { capabilityId: "tab-workspace-manager.save-follow-up", context });
    expect(response.error.code).toBe("STALE_CONTEXT");
    expect(actions.saveFollowUp).not.toHaveBeenCalled();
  });

  it("requires website context for follow-ups and saves the exact active tab", async () => {
    const unavailable = await request("execute", { capabilityId: "tab-workspace-manager.save-follow-up" });
    expect(unavailable.ok).toBe(false);
    const discovered = await request("discover", { context });
    expect(discovered.data).toHaveLength(5);
    const saved = await request("execute", { capabilityId: "tab-workspace-manager.save-follow-up", context });
    expect(saved.ok).toBe(true);
    expect(actions.saveFollowUp).toHaveBeenCalledExactlyOnceWith(42);
    query.mockResolvedValue([{ id: 42, url: "chrome://extensions/" }]);
    const internal = await request("discover", { context: { tabId: 42, url: "chrome://extensions/" } });
    expect(internal.data).toHaveLength(4);
  });

  it("uses fresh workspace configuration and accepts exact names or IDs", async () => {
    config.workspaceTemplates[0]!.id = "research-template";
    await request("discover");
    config.workspaceTemplates[0]!.name = "New Research";
    const oldName = await request("execute", { capabilityId: "tab-workspace-manager.open-workspace", input: "Research" });
    expect(oldName.error.code).toBe("NOT_FOUND");
    const opened = await request("execute", { capabilityId: "tab-workspace-manager.open-workspace", input: " new research " });
    expect(opened.ok).toBe(true);
    expect(actions.openWorkspace).toHaveBeenCalledExactlyOnceWith(config.workspaceTemplates[0]);
    expect((await request("execute", { capabilityId: "tab-workspace-manager.open-workspace", input: "research-template" })).ok).toBe(true);
  });

  it("rejects ambiguous workspace names, empty workspaces, and blank text", async () => {
    config.workspaceTemplates.push({ id: "other", name: "Research", color: "red", urls: [] });
    const ambiguous = await request("execute", { capabilityId: "tab-workspace-manager.open-workspace", input: "RESEARCH" });
    // An exact ID is authoritative even if multiple workspaces share its name.
    expect(ambiguous.ok).toBe(true);
    config.workspaceTemplates[0]!.id = "first";
    const duplicate = await request("execute", { capabilityId: "tab-workspace-manager.open-workspace", input: "Research" });
    expect(duplicate.error.code).toBe("AMBIGUOUS_INPUT");
    const empty = await request("execute", { capabilityId: "tab-workspace-manager.open-workspace", input: "other" });
    expect(empty.error.code).toBe("EMPTY_WORKSPACE");
    const blank = await request("execute", { capabilityId: "tab-workspace-manager.open-workspace", input: " " });
    expect(blank.ok).toBe(false);
    expect(actions.openWorkspace).toHaveBeenCalledTimes(1);
  });

  it("rejects disabled LLM providers and launches an enabled provider by name", async () => {
    const provider = config.llmProviders[0]!;
    provider.enabled = false;
    const disabled = await request("execute", { capabilityId: "tab-workspace-manager.open-llm-provider", input: provider.id });
    expect(disabled.error.code).toBe("NOT_FOUND");
    provider.enabled = true;
    const enabled = await request("execute", { capabilityId: "tab-workspace-manager.open-llm-provider", input: provider.name });
    expect(enabled.ok).toBe(true);
    expect(actions.openLlmProvider).toHaveBeenCalledExactlyOnceWith(provider.id);
  });

  it("passes page context to grouping and returns action failures without retrying", async () => {
    expect((await request("execute", { capabilityId: "tab-workspace-manager.group-by-domain", context })).ok).toBe(true);
    expect(actions.groupByDomain).toHaveBeenCalledExactlyOnceWith(context);
    vi.mocked(actions.openOptions).mockRejectedValueOnce(new Error("Options unavailable"));
    const failed = await request("execute", { capabilityId: "tab-workspace-manager.open-settings" });
    expect(failed.ok).toBe(false);
    expect(failed.error.message).toBe("Options unavailable");
    expect(actions.openOptions).toHaveBeenCalledTimes(1);
  });
});
