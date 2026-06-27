import type { ExtensionMessage } from "../shared/messages";

type ActivityStatus = Extract<ExtensionMessage, { type: "LLM_ACTIVITY" }>["status"];
type RuntimeApi = {
  sendMessage: (message: ExtensionMessage) => Promise<unknown> | unknown;
};

const SETTLED_RESPONSE_DELAY_MS = 2200;
const MIN_SEND_INTERVAL_MS = 900;

let lastStatus: ActivityStatus | undefined;
let lastSentAt = 0;
let responseTimer: number | undefined;

function runtimeApi(): RuntimeApi | undefined {
  const runtime = globalThis as typeof globalThis & {
    browser?: { runtime?: RuntimeApi };
    chrome?: { runtime?: RuntimeApi };
  };

  return runtime.browser?.runtime ?? runtime.chrome?.runtime;
}

function titleFromPage(): string {
  const heading = document.querySelector("h1, [data-testid*='conversation'], main h2");
  const candidate = heading?.textContent?.trim() || document.title.trim();
  return candidate || "LLM conversation";
}

function sendActivity(status: ActivityStatus): void {
  const now = Date.now();
  if (status === lastStatus && now - lastSentAt < MIN_SEND_INTERVAL_MS) {
    return;
  }

  lastStatus = status;
  lastSentAt = now;

  void runtimeApi()?.sendMessage({
    status,
    title: titleFromPage(),
    type: "LLM_ACTIVITY",
  } satisfies ExtensionMessage);
}

function markWaiting(): void {
  if (responseTimer) {
    window.clearTimeout(responseTimer);
  }

  sendActivity("waiting");
}

function scheduleResponded(): void {
  if (responseTimer) {
    window.clearTimeout(responseTimer);
  }

  responseTimer = window.setTimeout(() => sendActivity("responded"), SETTLED_RESPONSE_DELAY_MS);
}

function isLikelyPromptSubmit(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  const editable = target?.closest("textarea, input, [contenteditable='true']");
  return Boolean(editable && event.key === "Enter" && !event.shiftKey);
}

sendActivity("active");

document.addEventListener(
  "keydown",
  (event) => {
    if (isLikelyPromptSubmit(event)) {
      markWaiting();
    }
  },
  true,
);

document.addEventListener("submit", markWaiting, true);

const observer = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.type === "childList" || mutation.type === "characterData")) {
    scheduleResponded();
  }
});

observer.observe(document.documentElement, {
  characterData: true,
  childList: true,
  subtree: true,
});
