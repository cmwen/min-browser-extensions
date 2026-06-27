import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Download, Plus, Save, Trash2, Upload } from "lucide-react";
import {
  AUTO_PAGE_SUMMARY_PROVIDER_ID,
  DEFAULT_CONFIG,
  mergeConfig,
  NO_PAGE_SUMMARY_PROVIDER_ID,
  providerSupportsDeepLink,
  sanitizeWorkspace,
  type AppConfig,
  type RelationshipWeights,
  type TitleReplacementRule,
  type WorkspaceTemplate,
} from "@minext/core";
import { webext } from "@minext/browser-api";
import type { ExportPayload, ExtensionMessage, ExtensionResponse } from "../shared/messages";
import "../sidepanel/styles.css";
import "./options.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing options root");
}

const RELATIONSHIP_WEIGHT_LABELS: Record<keyof RelationshipWeights, { detail: string; label: string }> = {
  activeHistory: {
    detail: "Boost tabs that were active near the current tab in the recent focus path.",
    label: "Recent activation",
  },
  llmConversation: {
    detail: "Boost active chatbot conversations and LLM follow-up tabs.",
    label: "LLM conversations",
  },
  opener: {
    detail: "Strongly connect tabs opened from the current tab or its parent.",
    label: "Opened from tab",
  },
  openTime: {
    detail: "Place tabs opened around the same time above the active tab.",
    label: "Opened nearby",
  },
  pinned: {
    detail: "Keep pinned tabs and pinned shortcuts close to the active context.",
    label: "Pinned pages",
  },
  sameDomain: {
    detail: "Place tabs from the same site below the active tab.",
    label: "Same domain",
  },
  sameGroup: {
    detail: "Boost browser tab groups and managed workspace groups.",
    label: "Same group",
  },
};

async function sendMessage<T extends ExtensionResponse>(message: ExtensionMessage): Promise<T> {
  const response = (await webext.runtime.sendMessage(message)) as T;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response;
}

function App(): React.ReactElement {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState("Unsaved changes are applied after Save.");
  const [importValue, setImportValue] = useState("");

  const loadConfig = useCallback(async () => {
    await sendMessage<{ ok: true; config: AppConfig }>({ type: "GET_CONFIG" }).then((response) => {
      setConfig(response.config);
      document.documentElement.dataset.theme = response.config.theme;
    });
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const save = useCallback(async () => {
    const next = mergeConfig({
      ...config,
      workspaceTemplates: config.workspaceTemplates.map(sanitizeWorkspace),
    });
    await sendMessage({ type: "SAVE_CONFIG", config: next });
    setConfig(next);
    document.documentElement.dataset.theme = next.theme;
    setStatus("Saved.");
  }, [config]);

  const updateWorkspace = (workspaceId: string, patch: Partial<WorkspaceTemplate>) => {
    setConfig((current) => ({
      ...current,
      workspaceTemplates: current.workspaceTemplates.map((workspace) =>
        workspace.id === workspaceId ? { ...workspace, ...patch } : workspace,
      ),
    }));
    setStatus("Unsaved changes.");
  };

  const updateTitleRule = (ruleId: string, patch: Partial<TitleReplacementRule>) => {
    setConfig((current) => ({
      ...current,
      titleRewrite: {
        ...current.titleRewrite,
        rules: current.titleRewrite.rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
      },
    }));
    setStatus("Unsaved changes.");
  };

  const updateRelationshipWeight = (key: keyof RelationshipWeights, value: number) => {
    setConfig((current) => ({
      ...current,
      contextMap: {
        ...current.contextMap,
        weights: {
          ...current.contextMap.weights,
          [key]: value,
        },
      },
    }));
    setStatus("Unsaved changes.");
  };

  const exportData = async () => {
    const response = await sendMessage<{ ok: true; payload: ExportPayload }>({ type: "EXPORT_DATA" });
    setImportValue(JSON.stringify(response.payload, null, 2));
    setStatus("Full backup exported below.");
  };

  const importData = async () => {
    try {
      const parsed = JSON.parse(importValue) as unknown;
      await sendMessage({ type: "IMPORT_DATA", payload: parsed });
      await loadConfig();
      setStatus("Imported backup.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Invalid JSON.");
    }
  };

  const summaryProviders = config.llmProviders.filter(providerSupportsDeepLink);

  return (
    <main className="options-shell">
      <header className="options-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Tab Workspace Manager</h1>
        </div>
        <button type="button" onClick={() => void save()}>
          <Save size={16} />
          Save
        </button>
      </header>

      <p className="options-status" role="status">{status}</p>

      <section className="settings-section">
        <h2>Theme</h2>
        <div className="segmented-control" role="radiogroup" aria-label="Theme mode">
          {(["system", "light", "dark"] as const).map((theme) => (
            <button
              key={theme}
              className={config.theme === theme ? "is-selected" : ""}
              type="button"
              onClick={() => {
                setConfig((current) => ({ ...current, theme }));
                document.documentElement.dataset.theme = theme;
                setStatus("Unsaved changes.");
              }}
            >
              {theme}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="section-title">
          <h2>Workspace templates</h2>
          <button
            type="button"
            onClick={() => {
              const id = `workspace-${Date.now()}`;
              setConfig((current) => ({
                ...current,
                workspaceTemplates: [
                  ...current.workspaceTemplates,
                  { color: "blue", id, name: "New Workspace", urls: ["https://chatgpt.com/"] },
                ],
              }));
              setStatus("Unsaved changes.");
            }}
          >
            <Plus size={16} />
            Add
          </button>
        </div>
        <div className="workspace-editor-list">
          {config.workspaceTemplates.map((workspace) => (
            <article key={workspace.id} className="settings-card">
              <div className="field-grid">
                <label>
                  Name
                  <input value={workspace.name} onChange={(event) => updateWorkspace(workspace.id, { name: event.target.value })} />
                </label>
                <label>
                  Color
                  <select
                    value={workspace.color}
                    onChange={(event) => updateWorkspace(workspace.id, { color: event.target.value as WorkspaceTemplate["color"] })}
                  >
                    {["blue", "green", "purple", "cyan", "orange", "pink", "yellow", "red", "grey"].map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                URLs, one per line
                <textarea
                  rows={4}
                  value={workspace.urls.join("\n")}
                  onChange={(event) => updateWorkspace(workspace.id, { urls: event.target.value.split("\n") })}
                />
              </label>
              <button
                className="danger-button"
                type="button"
                onClick={() => {
                  setConfig((current) => ({
                    ...current,
                    workspaceTemplates: current.workspaceTemplates.filter((candidate) => candidate.id !== workspace.id),
                  }));
                  setStatus("Unsaved changes.");
                }}
              >
                <Trash2 size={16} />
                Remove
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>LLM shortcuts</h2>
        <div className="provider-list">
          {config.llmProviders.map((provider) => (
            <label key={provider.id} className="provider-row">
              <input
                type="checkbox"
                checked={provider.enabled}
                onChange={(event) => {
                  setConfig((current) => ({
                    ...current,
                    llmProviders: current.llmProviders.map((candidate) =>
                      candidate.id === provider.id ? { ...candidate, enabled: event.target.checked } : candidate,
                    ),
                  }));
                  setStatus("Unsaved changes.");
                }}
              />
              <Bot size={16} />
              <span>{provider.name}</span>
            </label>
          ))}
        </div>
        <article className="settings-card summary-settings-card">
          <label>
            Summarize current page
            <select
              value={config.pageSummary.providerId}
              onChange={(event) => {
                setConfig((current) => ({
                  ...current,
                  pageSummary: { ...current.pageSummary, providerId: event.target.value },
                }));
                setStatus("Unsaved changes.");
              }}
            >
              <option value={AUTO_PAGE_SUMMARY_PROVIDER_ID}>First supported enabled provider</option>
              <option value={NO_PAGE_SUMMARY_PROVIDER_ID}>Off</option>
              {summaryProviders.map((provider) => (
                <option key={provider.id} value={provider.id} disabled={!provider.enabled}>
                  {provider.enabled ? provider.name : `${provider.name} (disabled)`}
                </option>
              ))}
            </select>
            <small>Shows a context menu item only when the selected provider is enabled and supports prompt links.</small>
          </label>
        </article>
      </section>

      <section className="settings-section">
        <h2>Domain grouping</h2>
        <div className="field-grid">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={config.grouping.autoGroupOpenerTabs}
              onChange={(event) => {
                setConfig((current) => ({
                  ...current,
                  grouping: { ...current.grouping, autoGroupOpenerTabs: event.target.checked },
                }));
                setStatus("Unsaved changes.");
              }}
            />
            <span>
              Auto-group tabs opened from another tab
              <small>Enabled by default for search results and multitasking branches.</small>
            </span>
          </label>
          <label>
            Minimum tabs per group
            <input
              min={2}
              type="number"
              value={config.grouping.minimumTabsPerGroup}
              onChange={(event) => {
                setConfig((current) => ({
                  ...current,
                  grouping: { ...current.grouping, minimumTabsPerGroup: Number(event.target.value) },
                }));
                setStatus("Unsaved changes.");
              }}
            />
          </label>
          <label>
            Excluded domains
            <textarea
              rows={4}
              value={config.grouping.excludedDomains.join("\n")}
              onChange={(event) => {
                setConfig((current) => ({
                  ...current,
                  grouping: {
                    ...current.grouping,
                    excludedDomains: event.target.value
                      .split("\n")
                      .map((domain) => domain.trim())
                      .filter(Boolean),
                  },
                }));
                setStatus("Unsaved changes.");
              }}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2>Context map ranking</h2>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={config.contextMap.adaptiveLearning}
            onChange={(event) => {
              setConfig((current) => ({
                ...current,
                contextMap: { ...current.contextMap, adaptiveLearning: event.target.checked },
              }));
              setStatus("Unsaved changes.");
            }}
          />
          <span>
            Learn from selected tabs
            <small>When enabled, selecting a related tab slightly boosts the signals that explained that choice.</small>
          </span>
        </label>
        <div className="relationship-weight-list">
          {(Object.keys(RELATIONSHIP_WEIGHT_LABELS) as Array<keyof RelationshipWeights>).map((key) => (
            <label key={key} className="weight-row">
              <span>
                <strong>{RELATIONSHIP_WEIGHT_LABELS[key].label}</strong>
                <small>{RELATIONSHIP_WEIGHT_LABELS[key].detail}</small>
              </span>
              <input
                min={0}
                max={1.5}
                step={0.05}
                type="range"
                value={config.contextMap.weights[key]}
                onChange={(event) => updateRelationshipWeight(key, Number(event.target.value))}
              />
              <output>{config.contextMap.weights[key].toFixed(2)}</output>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="section-title">
          <h2>Title cleanup</h2>
          <button
            type="button"
            onClick={() => {
              const id = `title-rule-${Date.now()}`;
              setConfig((current) => ({
                ...current,
                titleRewrite: {
                  ...current.titleRewrite,
                  rules: [
                    ...current.titleRewrite.rules,
                    { enabled: true, id, match: "contains", pattern: " - Google Docs", replacement: "" },
                  ],
                },
              }));
              setStatus("Unsaved changes.");
            }}
          >
            <Plus size={16} />
            Add rule
          </button>
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={config.titleRewrite.enabled}
            onChange={(event) => {
              setConfig((current) => ({
                ...current,
                titleRewrite: { ...current.titleRewrite, enabled: event.target.checked },
              }));
              setStatus("Unsaved changes.");
            }}
          />
          <span>
            Replace page titles in the panel
            <small>Disabled by default. Rules only run when this is enabled.</small>
          </span>
        </label>
        <div className="workspace-editor-list">
          {config.titleRewrite.rules.map((rule) => (
            <article key={rule.id} className="settings-card">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(event) => updateTitleRule(rule.id, { enabled: event.target.checked })}
                />
                <span>Rule enabled</span>
              </label>
              <div className="field-grid">
                <label>
                  Match type
                  <select value={rule.match} onChange={(event) => updateTitleRule(rule.id, { match: event.target.value as TitleReplacementRule["match"] })}>
                    <option value="contains">contains</option>
                    <option value="regex">regex</option>
                  </select>
                </label>
                <label>
                  Pattern
                  <input value={rule.pattern} onChange={(event) => updateTitleRule(rule.id, { pattern: event.target.value })} />
                </label>
                <label>
                  Replacement
                  <input value={rule.replacement} onChange={(event) => updateTitleRule(rule.id, { replacement: event.target.value })} />
                </label>
              </div>
              <button
                className="danger-button"
                type="button"
                onClick={() => {
                  setConfig((current) => ({
                    ...current,
                    titleRewrite: {
                      ...current.titleRewrite,
                      rules: current.titleRewrite.rules.filter((candidate) => candidate.id !== rule.id),
                    },
                  }));
                  setStatus("Unsaved changes.");
                }}
              >
                <Trash2 size={16} />
                Remove
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Import and export</h2>
        <div className="tool-grid">
          <button type="button" onClick={() => void exportData()}>
            <Download size={16} />
            Export
          </button>
          <button type="button" onClick={() => void importData()}>
            <Upload size={16} />
            Import
          </button>
        </div>
        <textarea
          className="config-json"
          rows={8}
          value={importValue}
          onChange={(event) => setImportValue(event.target.value)}
          placeholder="Paste a full backup JSON or legacy config JSON"
        />
      </section>
    </main>
  );
}

createRoot(root).render(<App />);
