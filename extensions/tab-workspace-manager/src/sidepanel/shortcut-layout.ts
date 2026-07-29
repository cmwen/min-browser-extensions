type ShortcutGroup = {
  id: string;
  tabs: readonly unknown[];
};

export function shortcutLayoutForGroups(groups: readonly ShortcutGroup[]): {
  offsetByGroupId: Map<string, number>;
  ungroupedOffset: number;
} {
  const offsetByGroupId = new Map<string, number>();
  let ungroupedOffset = 0;

  for (const group of groups) {
    offsetByGroupId.set(group.id, ungroupedOffset);
    ungroupedOffset += group.tabs.length;
  }

  return { offsetByGroupId, ungroupedOffset };
}
