import { describe, expect, it } from "vitest";
import { canOpenWorkspace, sanitizeWorkspace } from "./workspaces";

describe("workspace helpers", () => {
  it("normalizes URLs and removes invalid entries", () => {
    const workspace = sanitizeWorkspace({
      color: "blue",
      id: "",
      name: "Research Mode",
      urls: ["chatgpt.com", " https://claude.ai/new ", "not a url with spaces"],
    });

    expect(workspace.id).toBe("research-mode");
    expect(workspace.urls).toEqual(["https://chatgpt.com/", "https://claude.ai/new"]);
  });

  it("detects whether a workspace can be opened", () => {
    expect(
      canOpenWorkspace({
        color: "green",
        id: "empty",
        name: "Empty",
        urls: [" "],
      }),
    ).toBe(false);
  });
});
