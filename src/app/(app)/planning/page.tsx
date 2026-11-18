"use client";

import FullCalendar, {
  type DateSelectInfo,
  type DropInfo,
  type EventClickInfo,
  type EventDropInfo,
  type EventResizeDoneInfo,
} from "@fullcalendar/react";
import interactionPlugin, { Draggable } from "@fullcalendar/react/interaction";
import nlLocale from "@fullcalendar/react/locales/nl";
import classicTheme from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlanningEventContent, SidebarTodoCard } from "@/components/planning/planning-cards";
import { AppointmentDialog, NewTodoDialog, PlanDialog } from "@/components/planning/planning-dialogs";
import { PlanningFilters } from "@/components/planning/planning-filters";
import { EmptyState, ErrorNote, Spinner } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import {
  EMPTY_PLANNING_FILTER,
  groupByCity,
  isFilterActive,
  matchesPlanningFilter,
  NO_CITY_LABEL,
  type PlanningFilter,
  WORKDAY_MINUTES,
} from "@/lib/planning";
import type { AppointmentDto } from "@/lib/schemas/appointments";
import type { TodoDto } from "@/lib/schemas/todos";

/**
 * Weekplanning (desktop-first):
 * - left: todos with time left to plan; drag one onto the grid to plan a
 *   block of at most one working day — the rest stays in the list (split)
 * - grid 06:00–24:00: drag blocks to move them, drag the top or bottom edge
 *   to change start/end (and so the planned hours); select an empty range to
 *   create a new todo (for a customer, or a "losse todo") right there
 * - click a block for details and the bevestigd / reservatie switches
 */
export default function PlanningPage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [planTodo, setPlanTodo] = useState<TodoDto | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newBlock, setNewBlock] = useState<{ start: Date; end: Date } | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<PlanningFilter>(EMPTY_PLANNING_FILTER);
  const [groupPerCity, setGroupPerCity] = useState(false);

  const { data: todos, isLoading: todosLoading } = useQuery({
    queryKey: ["todos", "plannable"],
    queryFn: () => apiGet<TodoDto[]>("/api/todos?plannable=1"),
  });

  const { data: appointments } = useQuery({
    queryKey: ["appointments", range?.from, range?.to],
    queryFn: () => apiGet<AppointmentDto[]>(`/api/appointments?from=${range!.from}&to=${range!.to}`),
    enabled: range !== null,
  });

  const byId = useMemo(() => new Map((appointments ?? []).map((a) => [String(a.id), a])), [appointments]);

  // Sidebar filter; the same predicate fades non-matching blocks in the grid.
  const filterActive = isFilterActive(filter);
  const visibleTodos = useMemo(
    () =>
      (todos ?? []).filter((t) =>
        matchesPlanningFilter(
          {
            title: t.title,
            customerName: t.customerName ?? "",
            city: t.customerCity ?? null,
            resourceIds: (t.resources ?? []).map((r) => r.resourceId),
          },
          filter,
        ),
      ),
    [todos, filter],
  );
  const cities = useMemo(() => {
    const all = [
      ...(todos ?? []).map((t) => t.customerCity),
      ...(appointments ?? []).map((a) => a.customerCity),
    ].map((c) => c?.trim() || NO_CITY_LABEL);
    return [...new Set(all)].sort((a, b) =>
      a === NO_CITY_LABEL ? 1 : b === NO_CITY_LABEL ? -1 : a.localeCompare(b, "nl-BE"),
    );
  }, [todos, appointments]);
  const isDimmed = (a: AppointmentDto) =>
    filterActive &&
    !matchesPlanningFilter(
      {
        title: a.todoTitle,
        customerName: a.customerName,
        city: a.customerCity,
        resourceIds: a.resources.map((r) => r.resourceId),
      },
      filter,
    );
  const selected = selectedId !== null ? (byId.get(String(selectedId)) ?? null) : null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["todos"] });
  };

  const changeMutation = useMutation({
    mutationFn: ({ id, startAt, durationMinutes }: { id: number; startAt: string; durationMinutes?: number }) =>
      apiSend(`/api/appointments/${id}`, "PATCH", { startAt, durationMinutes }),
    onSettled: invalidate, // on error this also puts the grid back to the server state
  });

  const dropMutation = useMutation({
    // No duration: the server plans the remaining time, max. one working day.
    mutationFn: ({ todoId, startAt }: { todoId: number; startAt: string }) =>
      apiSend("/api/appointments", "POST", { todoId, startAt }),
    onSettled: invalidate,
  });

  // Make the sidebar todos draggable onto the grid (external drag & drop).
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    const draggable = new Draggable(el, {
      itemSelector: ".todo-draggable",
      eventData: (itemEl: HTMLElement) => ({
        title: itemEl.dataset.title ?? "",
        duration: { minutes: Math.min(Number(itemEl.dataset.remaining) || 60, WORKDAY_MINUTES) },
        color: itemEl.dataset.color,
        create: false, // the server creates the block; see onDrop
      }),
    });
    return () => draggable.destroy();
  }, []);

  function onDrop(info: DropInfo) {
    const todoId = Number(info.draggedEl.dataset.todoId);
    if (todoId) dropMutation.mutate({ todoId, startAt: info.date.toISOString() });
  }

  function onEventDrop(arg: EventDropInfo) {
    changeMutation.mutate({ id: Number(arg.event.id), startAt: arg.event.start!.toISOString() });
  }

  // Works for both edges: the top edge changes start (and duration), the bottom edge the duration.
  function onEventResize(arg: EventResizeDoneInfo) {
    const minutes = Math.round((arg.event.end!.getTime() - arg.event.start!.getTime()) / 60000);
    changeMutation.mutate({
      id: Number(arg.event.id),
      startAt: arg.event.start!.toISOString(),
      durationMinutes: minutes,
    });
  }

  function onEventClick(arg: EventClickInfo) {
    setSelectedId(Number(arg.event.id));
  }

  function onSelect(info: DateSelectInfo) {
    setNewBlock({ start: info.start, end: info.end });
    info.view.calendar.unselect();
  }

  const mutationError = changeMutation.error ?? dropMutation.error;

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4 p-4 md:h-dvh md:flex-row md:p-6">
      {/* Sidebar: still to plan */}
      <aside className="flex shrink-0 flex-col md:w-72">
        <h2 className="mb-1 font-semibold text-brand-900">In te plannen</h2>
        <p className="mb-2 hidden text-xs text-gray-500 md:block">
          Sleep een todo naar de planning (max. 8 u per blok — de rest blijft hier staan). Selecteer een leeg vak om
          een nieuwe todo te maken.
        </p>
        <PlanningFilters
          filter={filter}
          onChange={setFilter}
          cities={cities}
          groupByCity={groupPerCity}
          onGroupByCityChange={setGroupPerCity}
          shown={visibleTodos.length}
          total={todos?.length ?? 0}
        />
        {todosLoading && <Spinner />}
        {todos && todos.length === 0 && <EmptyState>Niets meer in te plannen.</EmptyState>}
        {todos && todos.length > 0 && visibleTodos.length === 0 && (
          <p className="px-1 py-2 text-sm text-gray-500">Geen todo&apos;s voor deze filter.</p>
        )}
        {/* Container stays mounted: the Draggable is attached to it once. */}
        <div
          ref={sidebarRef}
          className="flex gap-2 overflow-x-auto md:min-h-0 md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-visible md:pr-1"
        >
          {(groupPerCity ? groupByCity(visibleTodos, (t) => t.customerCity ?? null) : [{ city: "", items: visibleTodos }]).map(
            (group) => (
              <section key={group.city || "all"} className="flex gap-2 md:flex-col">
                {group.city && (
                  <h3 className="sticky top-0 z-10 hidden items-center justify-between bg-gray-50 px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500 md:flex">
                    <span>📍 {group.city}</span>
                    <span className="font-normal normal-case">{group.items.length}</span>
                  </h3>
                )}
                {group.items.map((t) => (
                  <div key={t.id} className="shrink-0 md:shrink">
                    <SidebarTodoCard todo={t} onClick={() => setPlanTodo(t)} />
                  </div>
                ))}
              </section>
            ),
          )}
        </div>
        <Legend />
      </aside>

      {/* Calendar */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {mutationError && <ErrorNote message={(mutationError as Error).message} />}
        <div className="min-h-0 flex-1 rounded-lg border border-gray-200 bg-white p-2 [&_.fc]:h-full">
          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin, classicTheme]}
            initialView="timeGridWeek"
            locale={nlLocale}
            height="100%"
            firstDay={1}
            slotMinTime="06:00:00"
            slotMaxTime="24:00:00"
            scrollTime="07:00:00"
            slotDuration="00:30:00"
            snapDuration="00:15:00"
            allDaySlot={false}
            nowIndicator
            editable
            eventResizableFromStart
            droppable
            selectable
            selectMirror
            headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
            datesSet={(info) => setRange({ from: info.start.toISOString(), to: info.end.toISOString() })}
            events={appointments?.map((a) => ({
              id: String(a.id),
              title: a.isLoose ? a.todoTitle : `${a.customerName} — ${a.todoTitle}`,
              start: a.startAt,
              end: new Date(new Date(a.startAt).getTime() + a.durationMinutes * 60000).toISOString(),
              // Transparent: PlanningEventContent paints the whole block itself
              // (colour per todo + bevestigd/reservatie styles).
              color: "transparent",
              className: "tc-planning-event",
              editable: a.status !== "DONE",
            }))}
            eventContent={(arg) => {
              const a = byId.get(arg.event.id);
              return a ? (
                <PlanningEventContent appointment={a} timeText={arg.timeText} dimmed={isDimmed(a)} />
              ) : (
                true
              );
            }}
            drop={onDrop}
            eventDrop={onEventDrop}
            eventResize={onEventResize}
            eventClick={onEventClick}
            select={onSelect}
          />
        </div>
      </div>

      {planTodo && (
        <PlanDialog
          todo={planTodo}
          onClose={() => setPlanTodo(null)}
          onPlanned={() => {
            setPlanTodo(null);
            invalidate();
          }}
        />
      )}

      {selected && (
        <AppointmentDialog appointment={selected} onClose={() => setSelectedId(null)} onChanged={invalidate} />
      )}

      {newBlock && (
        <NewTodoDialog
          start={newBlock.start}
          end={newBlock.end}
          onClose={() => setNewBlock(null)}
          onCreated={() => {
            setNewBlock(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

/** Legend for the bevestigd / reservatie styles. */
function Legend() {
  return (
    <div className="mt-3 hidden space-y-1 border-t border-gray-200 pt-2 text-xs text-gray-600 md:block">
      <p className="font-medium text-gray-700">Legende</p>
      <p className="flex items-center gap-2">
        <span className="inline-block h-3 w-5 rounded-sm border-2 border-[#2f7d4f] bg-[#2f7d4f]" /> ✓ Bevestigd
      </p>
      <p className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-5 rounded-sm border-2 border-dashed border-[#2f7d4f]"
          style={{ background: "repeating-linear-gradient(135deg, #2f7d4f2e 0 4px, #fff 4px 8px)" }}
        />{" "}
        ⏳ Reservatie (voorlopig)
      </p>
      <p className="flex items-center gap-2">
        <span className="inline-block h-3 w-5 rounded-sm border border-[#2f7d4f] bg-[#2f7d4fb8]" /> Gepland, nog niet
        bevestigd
      </p>
      <p className="text-gray-400">Zelfde kleur + 1/3, 2/3… = blokken van dezelfde todo.</p>
    </div>
  );
}
