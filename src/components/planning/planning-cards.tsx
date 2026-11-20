"use client";

import { ACTION_ICONS } from "@/components/action-icons";
import { dayLoad, formatMinutesAsHours, partLabel, todoColor } from "@/lib/planning";
import type { AppointmentDto } from "@/lib/schemas/appointments";
import type { TodoDto, TodoResourceDto } from "@/lib/schemas/todos";

/**
 * Visual building blocks of the planning page.
 *
 * Status styles (point 5 of the planning spec) — must be obvious at a glance:
 * - bevestigd:  solid todo colour, white text, "✓ Bevestigd" badge
 * - reservatie: hatched light background, dashed border in the todo colour,
 *               dark text, "⏳ Reservatie" badge
 * - neither:    lighter (semi-transparent) todo colour
 * Blocks of the same todo share their colour and show "2/3" (point 4).
 */

/** "#2563eb" + alpha (0..1) → "#2563ebXX". */
function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

export function blockStyle(color: string, flags: { confirmed: boolean; reservation: boolean; done?: boolean }) {
  if (flags.done) {
    return { background: "#e5e7eb", border: "1px solid #9ca3af", color: "#4b5563" };
  }
  if (flags.reservation) {
    return {
      background: `repeating-linear-gradient(135deg, ${withAlpha(color, 0.18)} 0 8px, #ffffff 8px 16px)`,
      border: `2px dashed ${color}`,
      color: "#111827",
    };
  }
  if (flags.confirmed) {
    return { background: color, border: `2px solid ${color}`, color: "#ffffff" };
  }
  return { background: withAlpha(color, 0.72), border: `1px solid ${color}`, color: "#ffffff" };
}

export function StatusFlags({ confirmed, reservation }: { confirmed: boolean; reservation: boolean }) {
  return (
    <>
      {confirmed && (
        <span className="rounded bg-white/90 px-1 text-[10px] font-bold text-green-800" title="Bevestigd aan de klant">
          ✓ Bevestigd
        </span>
      )}
      {reservation && (
        <span className="rounded bg-amber-200 px-1 text-[10px] font-bold text-amber-900" title="Voorlopig — kan nog wijzigen">
          ⏳ Reservatie
        </span>
      )}
    </>
  );
}

/** Compact resource chips: "👷 Cis · 🚜 Minigraver". */
export function ResourceChips({
  resources,
  onDark = false,
  showHours = false,
}: {
  resources: TodoResourceDto[];
  onDark?: boolean;
  showHours?: boolean;
}) {
  if (resources.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-0.5">
      {resources.map((r) => (
        <span
          key={r.resourceId}
          className={`rounded px-1 text-[10px] leading-4 ${onDark ? "bg-white/25" : "bg-gray-900/10"}`}
          title={`${r.name} — ${String(r.hours).replace(".", ",")} u`}
        >
          {r.type === "PERSON" ? "👷" : "🚜"} {r.name}
          {showHours && ` ${String(r.hours).replace(".", ",")}u`}
        </span>
      ))}
    </span>
  );
}

/** Content of a block in the calendar grid. */
export function PlanningEventContent({
  appointment: a,
  timeText,
  opacity = 1,
  highlighted = false,
  onDetails,
}: {
  appointment: AppointmentDto;
  timeText: string;
  /** < 1 when another todo is focused or the block does not match the filter (blockEmphasis). */
  opacity?: number;
  /** Block of the focused todo: yellow outline + "Details" button. */
  highlighted?: boolean;
  /** Opens the details dialog (also on double click). */
  onDetails?: () => void;
}) {
  const color = todoColor(a.todoId, a.isLoose);
  const style = blockStyle(color, {
    confirmed: a.confirmed,
    reservation: a.reservation,
    done: a.status === "DONE",
  });
  const part = partLabel(a.part);
  const onDark = !a.reservation && a.status !== "DONE";

  return (
    <div
      className="flex h-full w-full flex-col gap-0.5 overflow-hidden rounded px-1 py-0.5 text-[11px] leading-tight transition-opacity"
      style={{
        ...style,
        opacity,
        boxShadow: highlighted ? "0 0 0 3px #facc15, 0 2px 8px rgba(0,0,0,0.25)" : undefined,
      }}
      onDoubleClick={onDetails}
    >
      <div className="flex items-center gap-1">
        <span className="font-semibold tabular-nums">{timeText}</span>
        {part && (
          <span
            className={`rounded px-1 text-[10px] font-bold ${onDark ? "bg-white/30" : "bg-gray-900/10"}`}
            title={`Deel ${a.part.index} van ${a.part.total} van deze todo`}
          >
            {part}
          </span>
        )}
        {a.isDemo && <span className="text-[9px] uppercase opacity-80">demo</span>}
      </div>
      <div className="truncate font-semibold">{a.isLoose ? a.todoTitle : a.customerName}</div>
      {(!a.isLoose || a.customerName || a.customerCity) && (
        <div className="truncate opacity-90">
          {a.isLoose ? a.customerName : a.todoTitle}
          {a.customerCity && (
            <span className="opacity-80">
              {(a.isLoose ? a.customerName : a.todoTitle) ? " · " : ""}
              {a.customerCity}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-0.5">
        <StatusFlags confirmed={a.confirmed} reservation={a.reservation} />
      </div>
      <ResourceChips resources={a.resources} onDark={onDark} />
      {highlighted && onDetails && (
        <button
          type="button"
          data-action="details"
          className="mt-auto self-start rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-gray-800 shadow hover:bg-white"
        >
          Details…
        </button>
      )}
    </div>
  );
}

/** A todo in the "in te plannen" sidebar (draggable onto the grid). */
export function SidebarTodoCard({
  todo,
  focused = false,
  onFocus,
  onPlan,
  onGoToBlock,
  onEdit,
}: {
  todo: TodoDto;
  /** Highlighted because it is selected here or one of its blocks in the grid. */
  focused?: boolean;
  /** Click: select / deselect (no dialog). */
  onFocus: () => void;
  /** Opens the date/time dialog (alternative to dragging, e.g. on mobile). */
  onPlan: () => void;
  /** Jumps the grid to the first planned block of this todo. */
  onGoToBlock?: () => void;
  /** Opens the full todo editor. */
  onEdit?: () => void;
}) {
  const color = todoColor(todo.id, todo.customerId === null);
  const remaining = todo.remainingMinutes ?? Math.round(todo.estimatedHours * 60);
  const planned = todo.plannedMinutes ?? 0;
  const blocks = todo.appointmentCount ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={focused}
      onClick={onFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onFocus();
        }
      }}
      data-todo-id={todo.id}
      data-remaining={remaining}
      data-title={todo.customerId === null ? todo.title : `${todo.customerName} — ${todo.title}`}
      data-color={color}
      className={`todo-draggable w-60 cursor-grab rounded-lg border bg-white p-2.5 text-left shadow-sm active:cursor-grabbing md:w-full ${
        focused ? "border-yellow-400 ring-2 ring-yellow-400" : "border-gray-200 hover:border-brand-500"
      }`}
      style={{ borderLeft: `5px solid ${color}` }}
      title="Klik om aan te duiden · sleep naar de planning om in te plannen"
    >
      <p className="truncate text-sm font-medium">{todo.title}</p>
      <p className="truncate text-xs text-gray-500">
        {todo.customerId === null
          ? `Losse todo${todo.customerName ? ` · ${todo.customerName}` : ""}`
          : todo.customerName}
        {todo.customerCity && <span className="text-gray-400"> · {todo.customerCity}</span>}
      </p>
      <p className="mt-1 text-xs">
        <span className="font-semibold text-gray-800">
          {remaining > 0 ? `nog ${formatMinutesAsHours(remaining)}` : "vervolgdag in te plannen"}
        </span>
        {planned > 0 && (
          <span className="text-gray-400">
            {" "}
            van {formatMinutesAsHours(Math.round(todo.estimatedHours * 60))} · {blocks} blok{blocks === 1 ? "" : "ken"} gepland
          </span>
        )}
        {todo.windowLabel && (
          <span className="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-brand-700">{todo.windowLabel}</span>
        )}
      </p>
      {(todo.resources?.length ?? 0) > 0 && (
        <div className="mt-1">
          <ResourceChips resources={todo.resources ?? []} showHours />
        </div>
      )}
      {focused && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlan();
            }}
            className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
          >
            📅 Inplannen…
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              {ACTION_ICONS.edit} Bewerken
            </button>
          )}
          {blocks > 0 && onGoToBlock && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onGoToBlock();
              }}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              → Naar ingepland blok
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact one-line block for the month view: colour, time, name, x/y and flags. */
export function MonthEventContent({
  appointment: a,
  timeText,
  opacity = 1,
  highlighted = false,
  onDetails,
}: {
  appointment: AppointmentDto;
  timeText: string;
  opacity?: number;
  highlighted?: boolean;
  onDetails?: () => void;
}) {
  const color = todoColor(a.todoId, a.isLoose);
  const part = partLabel(a.part);
  return (
    <div
      className="flex w-full items-center gap-1 overflow-hidden rounded px-1 text-[11px] leading-5"
      style={{
        ...blockStyle(color, { confirmed: a.confirmed, reservation: a.reservation, done: a.status === "DONE" }),
        opacity,
        boxShadow: highlighted ? "0 0 0 2px #facc15" : undefined,
      }}
      title={`${a.isLoose ? a.todoTitle : `${a.customerName} — ${a.todoTitle}`} (${formatMinutesAsHours(a.durationMinutes)})`}
      onDoubleClick={onDetails}
    >
      <span className="shrink-0 font-semibold tabular-nums">{timeText}</span>
      <span className="truncate">{a.isLoose ? a.todoTitle : a.customerName}</span>
      <span className="ml-auto shrink-0 opacity-90">{formatMinutesAsHours(a.durationMinutes)}</span>
      {part && <span className="shrink-0 font-bold">{part}</span>}
      {a.confirmed && <span className="shrink-0" title="Bevestigd">✓</span>}
      {a.reservation && <span className="shrink-0" title="Reservatie">⏳</span>}
      {highlighted && onDetails && (
        <button
          type="button"
          data-action="details"
          className="shrink-0 rounded bg-white/95 px-1 text-[10px] font-semibold text-gray-800"
          title="Details"
        >
          ⓘ
        </button>
      )}
    </div>
  );
}

/** Top of a month day cell: day number + how full the day is (free / partial / full). */
export function DayCellTop({
  dayNumberText,
  minutes,
  workdayMinutes,
}: {
  dayNumberText: string;
  minutes: number;
  /** A full day (Settings → max. uren per ingepland blok). */
  workdayMinutes: number;
}) {
  const load = dayLoad(minutes, workdayMinutes);
  const percent = Math.min(100, Math.round((minutes / workdayMinutes) * 100));
  const tone = {
    free: { bar: "bg-green-500", text: "text-green-700", label: "vrij" },
    partial: { bar: "bg-amber-500", text: "text-amber-700", label: formatMinutesAsHours(minutes) },
    full: { bar: "bg-red-500", text: "text-red-700", label: `vol · ${formatMinutesAsHours(minutes)}` },
  }[load];
  return (
    <div className="flex w-full items-center gap-1.5 px-1 pt-0.5" title={`${formatMinutesAsHours(minutes)} gepland`}>
      <span className="text-sm font-medium">{dayNumberText}</span>
      <span className={`text-[10px] font-medium ${tone.text}`}>{tone.label}</span>
      <span className="ml-auto h-1.5 w-10 overflow-hidden rounded-full bg-gray-200">
        <span className={`block h-full ${tone.bar}`} style={{ width: `${load === "free" ? 100 : percent}%` }} />
      </span>
    </div>
  );
}
