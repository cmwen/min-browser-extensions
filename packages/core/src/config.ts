import type { AppConfig, LlmProvider, RelationshipWeights, WorkspaceTemplate } from "./types";

export const DEFAULT_WORKSPACES: WorkspaceTemplate[] = [
  {
    color: "blue",
    id: "research",
    name: "Research",
    urls: ["https://www.google.com/search?q=", "https://chatgpt.com/", "https://claude.ai/new"],
  },
  {
    color: "green",
    id: "coding",
    name: "Coding",
    urls: ["https://github.com/", "https://chatgpt.com/", "https://stackoverflow.com/"],
  },
  {
    color: "purple",
    id: "writing",
    name: "Writing",
    urls: ["https://chatgpt.com/", "https://claude.ai/new", "https://docs.google.com/"],
  },
];

export const DEFAULT_LLM_PROVIDERS: LlmProvider[] = [
  {
    deepLinkTemplate: "https://chatgpt.com/?q={prompt}",
    enabled: true,
    groupTitle: "LLM Workbench",
    id: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    urlPatterns: ["chatgpt.com", "chat.openai.com"],
  },
  {
    enabled: true,
    groupTitle: "LLM Workbench",
    id: "claude",
    name: "Claude",
    url: "https://claude.ai/new",
    urlPatterns: ["claude.ai"],
  },
  {
    enabled: true,
    groupTitle: "LLM Workbench",
    id: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com/app",
    urlPatterns: ["gemini.google.com"],
  },
  {
    enabled: true,
    groupTitle: "LLM Workbench",
    id: "copilot",
    name: "Copilot",
    url: "https://copilot.microsoft.com/",
    urlPatterns: ["copilot.microsoft.com"],
  },
  {
    deepLinkTemplate: "https://www.perplexity.ai/search?q={prompt}",
    enabled: true,
    groupTitle: "LLM Workbench",
    id: "perplexity",
    name: "Perplexity",
    url: "https://www.perplexity.ai/",
    urlPatterns: ["perplexity.ai"],
  },
];

export const DEFAULT_RELATIONSHIP_WEIGHTS: RelationshipWeights = {
  activeHistory: 0.35,
  llmConversation: 0.35,
  opener: 1,
  openTime: 0.45,
  pinned: 0.75,
  sameDomain: 0.78,
  sameGroup: 0.72,
};

export const DEFAULT_CONFIG: AppConfig = {
  contextMap: {
    adaptiveLearning: false,
    weights: DEFAULT_RELATIONSHIP_WEIGHTS,
  },
  grouping: {
    autoGroupOpenerTabs: true,
    excludedDomains: [],
    minimumTabsPerGroup: 2,
  },
  llmProviders: DEFAULT_LLM_PROVIDERS,
  pageSummary: {
    providerId: "auto",
  },
  schemaVersion: 1,
  theme: "system",
  titleRewrite: {
    enabled: false,
    rules: [],
  },
  workspaceTemplates: DEFAULT_WORKSPACES,
};

function mergeLlmProviders(value: LlmProvider[] | undefined): LlmProvider[] {
  if (!value?.length) {
    return DEFAULT_CONFIG.llmProviders;
  }

  return value.map((provider) => ({
    ...DEFAULT_LLM_PROVIDERS.find((defaultProvider) => defaultProvider.id === provider.id),
    ...provider,
  }));
}

export function mergeConfig(value: Partial<AppConfig> | undefined): AppConfig {
  if (!value) {
    return DEFAULT_CONFIG;
  }

  return {
    contextMap: {
      adaptiveLearning: value.contextMap?.adaptiveLearning ?? DEFAULT_CONFIG.contextMap.adaptiveLearning,
      weights: {
        ...DEFAULT_CONFIG.contextMap.weights,
        ...value.contextMap?.weights,
      },
    },
    grouping: {
      ...DEFAULT_CONFIG.grouping,
      ...value.grouping,
      excludedDomains: value.grouping?.excludedDomains ?? DEFAULT_CONFIG.grouping.excludedDomains,
    },
    llmProviders: mergeLlmProviders(value.llmProviders),
    pageSummary: {
      ...DEFAULT_CONFIG.pageSummary,
      ...value.pageSummary,
    },
    schemaVersion: DEFAULT_CONFIG.schemaVersion,
    theme: value.theme ?? DEFAULT_CONFIG.theme,
    titleRewrite: {
      ...DEFAULT_CONFIG.titleRewrite,
      ...value.titleRewrite,
      rules: value.titleRewrite?.rules ?? DEFAULT_CONFIG.titleRewrite.rules,
    },
    workspaceTemplates: value.workspaceTemplates?.length ? value.workspaceTemplates : DEFAULT_CONFIG.workspaceTemplates,
  };
}
