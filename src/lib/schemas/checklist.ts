import { z } from "zod";

/**
 * Contracts for the checklist: a master list of standard tasks (managed in
 * Settings) that can be picked on todos and recurring work.
 */

export const checklistItemInputSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100000).default(0),
});
export type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;

/** PATCH: all optional, no defaults (omitted fields stay unchanged). */
export const checklistItemUpdateSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht").max(200).optional(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
});

export interface ChecklistItemDto {
  id: number;
  name: string;
  active: boolean;
  sortOrder: number;
}

/**
 * Ordered list of checklist item ids picked on a todo or recurring work.
 * The order is the order shown on the checklist.
 */
export const checklistItemIdsSchema = z
  .array(z.number().int().positive())
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Elke taak kan maar één keer voorkomen");

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
