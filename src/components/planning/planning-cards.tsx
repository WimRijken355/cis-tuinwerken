"use client";

import { formatMinutesAsHours, partLabel, todoColor } from "@/lib/planning";
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
}: {
  appointment: AppointmentDto;
  timeText: string;
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
    <div className="flex h-full w-full flex-col gap-0.5 overflow-hidden rounded px-1 py-0.5 text-[11px] leading-tight" style={style}>
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
      {!a.isLoose && <div className="truncate opacity-90">{a.todoTitle}</div>}
      <div className="flex flex-wrap gap-0.5">
        <StatusFlags confirmed={a.confirmed} reservation={a.reservation} />
      </div>
      <ResourceChips resources={a.resources} onDark={onDark} />
    </div>
  );
}

/** A todo in the "in te plannen" sidebar (draggable onto the grid). */
export function SidebarTodoCard({ todo, onClick }: { todo: TodoDto; onClick: () => void }) {
  const color = todoColor(todo.id, todo.customerId === null);
  const remaining = todo.remainingMinutes ?? Math.round(todo.estimatedHours * 60);
  const planned = todo.plannedMinutes ?? 0;
  const blocks = todo.appointmentCount ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      data-todo-id={todo.id}
      data-remaining={remaining}
      data-title={todo.customerId === null ? todo.title : `${todo.customerName} — ${todo.title}`}
      data-color={color}
      className="todo-draggable w-60 cursor-grab rounded-lg border border-gray-200 bg-white p-2.5 text-left shadow-sm hover:border-brand-500 active:cursor-grabbing md:w-full"
      style={{ borderLeft: `5px solid ${color}` }}
      title="Sleep naar de planning (of klik om een datum te kiezen)"
    >
      <p className="truncate text-sm font-medium">{todo.title}</p>
      <p className="truncate text-xs text-gray-500">
        {todo.customerId === null ? "Losse todo" : todo.customerName}
      </p>
      <p className="mt-1 text-xs">
        <span className="font-semibold text-gray-800">nog {formatMinutesAsHours(remaining)}</span>
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
    </button>
  );
}
