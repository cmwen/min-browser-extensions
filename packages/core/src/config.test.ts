import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, mergeConfig } from "./config";

describe("mergeConfig", () => {
  it("defaults the media auto-hide preference off and preserves an enabled value", () => {
    expect(mergeConfig(undefined).panel.autoHideWhenActiveTabPlaysMedia).toBe(false);
    expect(mergeConfig({ panel: { autoHideWhenActiveTabPlaysMedia: true } }).panel).toEqual({
      autoHideWhenActiveTabPlaysMedia: true,
    });
    expect(DEFAULT_CONFIG.panel.autoHideWhenActiveTabPlaysMedia).toBe(false);
  });
});
