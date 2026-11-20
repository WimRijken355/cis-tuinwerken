"use client";

import { ACTION_ICONS, ACTION_LABELS, type RowAction } from "./action-icons";

/**
 * The one button for row/item actions (edit, rename, (de)activate, delete):
 * always the same icon (ACTION_ICONS) and, unless `iconOnly`, the same label.
 * `label` overrides the text (e.g. "Klant verwijderen"); with `iconOnly` it is
 * still used as tooltip and accessible name.
 */
export function ActionButton({
  action,
  onClick,
  label,
  iconOnly = false,
  disabled = false,
  title,
  className = "",
}: {
  action: RowAction;
  onClick: () => void;
  label?: string;
  iconOnly?: boolean;
  disabled?: boolean;
  /** Tooltip; defaults to the label. */
  title?: string;
  className?: string;
}) {
  const text = label ?? ACTION_LABELS[action];
  const tone =
    action === "delete"
      ? "text-red-600 hover:bg-red-50"
      : action === "deactivate"
        ? "text-gray-600 hover:bg-gray-100"
        : "text-brand-700 hover:bg-brand-50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? text}
      aria-label={iconOnly ? text : undefined}
      className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${tone} ${className}`}
    >
      <span aria-hidden="true">{ACTION_ICONS[action]}</span>
      {!iconOnly && <span>{text}</span>}
    </button>
  );
}
