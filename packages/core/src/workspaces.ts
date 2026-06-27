import type { WorkspaceTemplate } from "./types";

export function normalizeWorkspaceUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return undefined;
    }
  }
}

export function sanitizeWorkspace(template: WorkspaceTemplate): WorkspaceTemplate {
  return {
    ...template,
    id: template.id.trim() || template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: template.name.trim() || "Untitled Workspace",
    urls: template.urls.map(normalizeWorkspaceUrl).filter((url): url is string => Boolean(url)),
  };
}

export function canOpenWorkspace(template: WorkspaceTemplate): boolean {
  return sanitizeWorkspace(template).urls.length > 0;
}

