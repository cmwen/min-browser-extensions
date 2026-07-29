import { describe, expect, it } from "vitest";
import { shortcutLayoutForGroups } from "./shortcut-layout";

describe("shortcutLayoutForGroups", () => {
  it("assigns shortcuts by rendered row position when the LLM Workbench is open", () => {
    const layout = shortcutLayoutForGroups([
      { id: "llm:workbench", tabs: [{ id: 11 }, { id: 12 }, { id: 13 }] },
      { id: "workspace:research", tabs: [{ id: 21 }, { id: 22 }] },
    ]);

    expect(layout.offsetByGroupId.get("llm:workbench")).toBe(0);
    expect(layout.offsetByGroupId.get("workspace:research")).toBe(3);
    expect(layout.ungroupedOffset).toBe(5);
  });

  it("counts duplicate tab occurrences instead of overwriting their displayed shortcut", () => {
    const repeatedTab = { id: 42 };
    const layout = shortcutLayoutForGroups([
      { id: "llm:workbench", tabs: [repeatedTab] },
      { id: "browser-group:7", tabs: [repeatedTab] },
    ]);

    expect(layout.offsetByGroupId.get("llm:workbench")).toBe(0);
    expect(layout.offsetByGroupId.get("browser-group:7")).toBe(1);
    expect(layout.ungroupedOffset).toBe(2);
  });
});
