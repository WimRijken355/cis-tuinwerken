/**
 * Generic helpers for user-sortable master lists (checklist, losse todo-types):
 * items with a numeric sortOrder that can be moved up/down.
 */

/** Sort order for a newly added item: after the current last one. */
export function nextSortOrder(items: { sortOrder: number }[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((i) => i.sortOrder)) + 1;
}

/**
 * Moves the item with `id` one place up (-1) or down (+1) and returns the
 * new sortOrder per id (0..n-1) for every item whose position changed.
 */
export function reorder(
  items: { id: number; sortOrder: number }[],
  id: number,
  direction: -1 | 1,
): { id: number; sortOrder: number }[] {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const index = sorted.findIndex((i) => i.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return [];
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  return sorted
    .map((item, position) => ({ id: item.id, sortOrder: position, changed: item.sortOrder !== position }))
    .filter((i) => i.changed)
    .map(({ id: itemId, sortOrder }) => ({ id: itemId, sortOrder }));
}
