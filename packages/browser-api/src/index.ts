import browser from "webextension-polyfill";

type SidePanelApi = {
  close?: (options: { tabId?: number; windowId?: number }) => Promise<void> | void;
  open?: (options?: { windowId?: number }) => Promise<void> | void;
  setPanelBehavior?: (options: { openPanelOnActionClick: boolean }) => Promise<void> | void;
};

type SidebarActionApi = {
  close?: () => Promise<void> | void;
  open?: () => Promise<void> | void;
};

type NativeExtensionApi = {
  sidePanel?: SidePanelApi;
  sidebarAction?: SidebarActionApi;
};

function nativeExtensionApi(name: "chrome" | "browser"): NativeExtensionApi | undefined {
  const runtime = globalThis as typeof globalThis & {
    browser?: NativeExtensionApi;
    chrome?: NativeExtensionApi;
  };
  return runtime[name];
}

export const webext = browser;

export function getSidePanelApi(): SidePanelApi | undefined {
  return nativeExtensionApi("chrome")?.sidePanel;
}

export function getSidebarActionApi(): SidebarActionApi | undefined {
  return nativeExtensionApi("browser")?.sidebarAction ?? (webext as unknown as NativeExtensionApi).sidebarAction;
}

export function supportsAutomaticPanelClose(): boolean {
  return Boolean(getSidePanelApi()?.close);
}

export async function enableActionSidePanelOpen(): Promise<boolean> {
  const sidePanel = getSidePanelApi();
  if (!sidePanel?.setPanelBehavior) {
    return false;
  }

  await sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  return true;
}

export async function openExtensionPanel(windowId?: number): Promise<boolean> {
  const sidePanel = getSidePanelApi();
  if (sidePanel?.open) {
    await sidePanel.open(typeof windowId === "number" ? { windowId } : undefined);
    return true;
  }

  const sidebarAction = getSidebarActionApi();
  if (sidebarAction?.open) {
    await sidebarAction.open();
    return true;
  }

  return false;
}

export async function closeExtensionPanel(windowId?: number): Promise<boolean> {
  const sidePanel = getSidePanelApi();
  if (sidePanel?.close && typeof windowId === "number") {
    await sidePanel.close({ windowId });
    return true;
  }

  const sidebarAction = getSidebarActionApi();
  if (sidebarAction?.close) {
    await sidebarAction.close();
    return true;
  }

  return false;
}

export function isExtensionPage(url: string | undefined): boolean {
  return Boolean(url?.startsWith(browser.runtime.getURL("")));
}
