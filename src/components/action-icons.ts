/**
 * Single source of truth for the icons + labels of the recurring row/item
 * actions, so they look the same everywhere in the app (see <ActionButton>).
 * Kept free of React so it can be unit tested.
 */

export type RowAction = "edit" | "rename" | "deactivate" | "activate" | "delete";

export const ACTION_ICONS: Record<RowAction, string> = {
  edit: "✏️",
  rename: "🏷️",
  deactivate: "⏸️",
  activate: "▶️",
  delete: "🗑️",
};

export const ACTION_LABELS: Record<RowAction, string> = {
  edit: "Bewerken",
  rename: "Hernoemen",
  deactivate: "Deactiveren",
  activate: "Activeren",
  delete: "Verwijderen",
};

/** The toggle action for an item that can be (de)activated. */
export function toggleActiveAction(active: boolean): "deactivate" | "activate" {
  return active ? "deactivate" : "activate";
}
