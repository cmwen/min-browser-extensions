import browser from "webextension-polyfill";

type SidePanelApi = {
  close?: (options: { tabId?: number; windowId?: number }) => Promise<void> | void;
  open?: (options?: { windowId?: number }) => Promise<void> | void;
  setPanelBehavior?: (options: { openPanelOnActionClick: boolean }) => Promise<void> | void;
};

type ChromeRuntimeApi = {
  sidePanel?: SidePanelApi;
};

function chromeRuntime(): ChromeRuntimeApi | undefined {
  const runtime = globalThis as typeof globalThis & { chrome?: ChromeRuntimeApi };
  return runtime.chrome;
}

export const webext = browser;

export function getSidePanelApi(): SidePanelApi | undefined {
  return chromeRuntime()?.sidePanel;
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
  if (!sidePanel?.open) {
    return false;
  }

  await sidePanel.open(typeof windowId === "number" ? { windowId } : undefined);
  return true;
}

export async function closeExtensionPanel(windowId?: number): Promise<boolean> {
  const sidePanel = getSidePanelApi();
  if (!sidePanel?.close || typeof windowId !== "number") {
    return false;
  }

  await sidePanel.close({ windowId });
  return true;
}

export function isExtensionPage(url: string | undefined): boolean {
  return Boolean(url?.startsWith(browser.runtime.getURL("")));
}
