import { describe, expect, it } from "vitest";
import { rewritePageTitle } from "./titles";

describe("rewritePageTitle", () => {
  it("does nothing while disabled", () => {
    expect(
      rewritePageTitle("Project notes - Google Docs", {
        enabled: false,
        rules: [{ enabled: true, id: "docs", match: "contains", pattern: " - Google Docs", replacement: "" }],
      }),
    ).toBe("Project notes - Google Docs");
  });

  it("applies enabled contains and regex rules", () => {
    expect(
      rewritePageTitle("Project notes - Google Docs", {
        enabled: true,
        rules: [
          { enabled: true, id: "docs", match: "contains", pattern: " - Google Docs", replacement: "" },
          { enabled: true, id: "spaces", match: "regex", pattern: "^Project", replacement: "Client" },
        ],
      }),
    ).toBe("Client notes");
  });
});
