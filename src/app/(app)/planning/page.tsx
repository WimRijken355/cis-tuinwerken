"use client";

import FullCalendar, {
  type DateClickInfo,
  type DateSelectInfo,
  type DropInfo,
  type EventClickInfo,
  type EventDropInfo,
  type EventResizeDoneInfo,
} from "@fullcalendar/react";
import interactionPlugin, { Draggable } from "@fullcalendar/react/interaction";
import nlLocale from "@fullcalendar/react/locales/nl";
import classicTheme from "@fullcalendar/react/themes/classic";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DayCellTop,
  MonthEventContent,
  PlanningEventContent,
  SidebarTodoCard,
} from "@/components/planning/planning-cards";
import { AppointmentDialog, NewTodoDialog, PlanDialog, TodoEditDialog } from "@/components/planning/planning-dialogs";
import { PlanningFilters } from "@/components/planning/planning-filters";
import { EmptyState, ErrorNote, Spinner } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api-client";
import { blockEmphasis, dayKey, minutesPerDay, EMPTY_PLANNING_FILTER, groupByCity, isFilterActive, matchesPlanningFilter, NO_CITY_LABEL, type PlanningFilter, toggleFocus, formatMinutesAsHours } from "@/lib/planning";
import { todoChangedQueryKeys } from "@/lib/query-keys";
import { useWorkdayMinutes } from "@/lib/use-workday";
import type { AppointmentDto } from "@/lib/schemas/appointments";
import type { TodoDto } from "@/lib/schemas/todos";

/**
 * Weekplanning (desktop-first):
 * - left: todos with time left to plan; drag one onto the grid to plan a
 *   block of at most one working day — the rest stays in the list (split)
 * - grid 06:00–24:00: drag blocks to move them, drag the top or bottom edge
 *   to change start/end (and so the planned hours); select an empty range to
 *   create a new todo (for a customer, or a "losse todo") right there
 * - click a todo in the sidebar or a block in the grid to *focus* that todo:
 *   its sidebar card and all its blocks are highlighted (the rest fades).
 *   Details/plan dialogs open via explicit buttons (or a double click on a
 *   block), never on a plain click. Escape or a click on an empty slot clears.
 */
const VIEW_STORAGE_KEY = "tc-planning-view";
/** Start time when a todo is dropped on a whole day in the month view. */
const DEFAULT_START_HOUR = 8;

export default function PlanningPage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [planTodo, setPlanTodo] = useState<TodoDto | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newBlock, setNewBlock] = useState<{ start: Date; end: Date } | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  // Max. block length (Settings); a ref so the draggable (created once) always reads the current value.
  const workdayMinutes = useWorkdayMinutes();
  const workdayRef = useRef(workdayMinutes);
  workdayRef.current = workdayMinutes;
  const [filter, setFilter] = useState<PlanningFilter>(EMPTY_PLANNING_FILTER);
  const [groupPerCity, setGroupPerCity] = useState(false);
  /** The todo selected in the sidebar or via one of its blocks (null = none). */
  const [focusTodoId, setFocusTodoId] = useState<number | null>(null);
  /** Todo open in the full editor (null = closed). */
  const [editTodoId, setEditTodoId] = useState<number | null>(null);
  const calendarApiRef = useRef<{
    gotoDate: (date: Date | string) => void;
    changeView: (view: string, date?: Date | string) => void;
  } | null>(null);

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
  const matchesFilter = (a: AppointmentDto) =>
    !filterActive ||
    matchesPlanningFilter(
      {
        title: a.todoTitle,
        customerName: a.customerName,
        city: a.customerCity,
        resourceIds: a.resources.map((r) => r.resourceId),
      },
      filter,
    );
  const selected = selectedId !== null ? (byId.get(String(selectedId)) ?? null) : null;

  // Month view: planned time per day (respecting the filter, e.g. one resource).
  const loadPerDay = useMemo(
    () => minutesPerDay((appointments ?? []).filter((a) => matchesFilter(a))),
    [appointments, filter],
  );

  // Remember week/month per browser (a viewer convenience; may be unavailable).
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_STORAGE_KEY) === "dayGridMonth") {
        calendarApiRef.current?.changeView("dayGridMonth");
      }
    } catch {
      // storage blocked: keep the week view
    }
  }, []);

  // The focused todo, wherever it is: in the sidebar list (maybe hidden by the
  // filter), or fully planned and only visible as blocks in the grid.
  const focusedTodo = focusTodoId !== null ? (todos ?? []).find((t) => t.id === focusTodoId) : undefined;
  const focusedHiddenByFilter = focusedTodo !== undefined && !visibleTodos.some((t) => t.id === focusTodoId);
  const focusedBlock =
    focusTodoId !== null && !focusedTodo ? (appointments ?? []).find((a) => a.todoId === focusTodoId) : undefined;

  // Bring the highlighted sidebar card into view.
  useEffect(() => {
    if (focusTodoId === null) return;
    sidebarRef.current
      ?.querySelector(`[data-todo-id="${focusTodoId}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [focusTodoId, groupPerCity]);

  // Escape clears the focus (while no dialog is open; dialogs handle their own Escape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !planTodo && !selected && !newBlock && editTodoId === null) setFocusTodoId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [planTodo, selected, newBlock, editTodoId]);

  /** Jumps the grid to the first (non-cancelled) block of a todo. */
  async function goToFirstBlock(todoId: number) {
    const todo = await apiGet<{ appointments: { startAt: string; status: string }[] }>(`/api/todos/${todoId}`);
    const first = todo.appointments
      .filter((a) => a.status !== "CANCELLED")
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    if (first) calendarApiRef.current?.gotoDate(first.startAt);
  }

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
        duration: { minutes: Math.min(Number(itemEl.dataset.remaining) || 60, workdayRef.current) },
        color: itemEl.dataset.color,
        create: false, // the server creates the block; see onDrop
      }),
    });
    return () => draggable.destroy();
  }, []);

  function onDrop(info: DropInfo) {
    const todoId = Number(info.draggedEl.dataset.todoId);
    if (!todoId) return;
    // Dropped on a whole day (month view): start at 08:00 that day.
    const start = new Date(info.date);
    if (info.allDay) start.setHours(DEFAULT_START_HOUR, 0, 0, 0);
    dropMutation.mutate({ todoId, startAt: start.toISOString() });
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
    const id = Number(arg.event.id);
    // The "Details…" button inside a highlighted block opens the dialog...
    if ((arg.jsEvent.target as HTMLElement | null)?.closest('[data-action="details"]')) {
      setSelectedId(id);
      return;
    }
    // ...a plain click only (de)selects the todo of this block.
    const block = byId.get(arg.event.id);
    if (block) setFocusTodoId((current) => toggleFocus(current, block.todoId));
  }

  /** A click on an empty slot clears the focus. */
  function onDateClick(_info: DateClickInfo) {
    setFocusTodoId(null);
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
          Klik om aan te duiden, sleep naar de planning om in te plannen (max. {formatMinutesAsHours(workdayMinutes)} per blok — de rest blijft hier
          staan). Selecteer een leeg vak om een nieuwe todo te maken.
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
        {todos && todos.length > 0 && visibleTodos.length === 0 && !focusedTodo && (
          <p className="px-1 py-2 text-sm text-gray-500">Geen todo&apos;s voor deze filter.</p>
        )}
        {focusedBlock && (
          <div className="mb-2 rounded-lg border-2 border-yellow-400 bg-yellow-50 p-2.5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-yellow-800">Geselecteerd</p>
            <p className="truncate font-medium">{focusedBlock.todoTitle}</p>
            <p className="truncate text-xs text-gray-600">
              {focusedBlock.customerName || "Losse todo"}
              {focusedBlock.customerCity && ` · ${focusedBlock.customerCity}`}
            </p>
            <p className="mt-1 text-xs text-gray-600">✓ Volledig ingepland — niets meer in te plannen.</p>
            <button
              type="button"
              className="mt-1 text-xs text-brand-600 hover:underline"
              onClick={() => setFocusTodoId(null)}
            >
              Selectie wissen
            </button>
          </div>
        )}
        {/* Container stays mounted: the Draggable is attached to it once. */}
        <div
          ref={sidebarRef}
          className="flex gap-2 overflow-x-auto md:min-h-0 md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-visible md:pr-1"
        >
          {focusedTodo && focusedHiddenByFilter && (
            <section className="flex gap-2 md:flex-col">
              <h3 className="hidden px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-yellow-800 md:block">
                Geselecteerd (valt buiten de filter)
              </h3>
              <div className="shrink-0 md:shrink">
                <SidebarTodoCard
                  todo={focusedTodo}
                  focused
                  onFocus={() => setFocusTodoId(null)}
                  onPlan={() => setPlanTodo(focusedTodo)}
                  onGoToBlock={() => void goToFirstBlock(focusedTodo.id)}
                  onEdit={() => setEditTodoId(focusedTodo.id)}
                />
              </div>
            </section>
          )}
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
                    <SidebarTodoCard
                      todo={t}
                      focused={t.id === focusTodoId}
                      onFocus={() => setFocusTodoId((current) => toggleFocus(current, t.id))}
                      onPlan={() => setPlanTodo(t)}
                      onGoToBlock={() => void goToFirstBlock(t.id)}
                      onEdit={() => setEditTodoId(t.id)}
                    />
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
            plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin, classicTheme]}
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
            // A new todo needs a real drag; a plain click on an empty slot only clears the focus.
            selectMinDistance={8}
            headerToolbar={{ left: "prev,next today", center: "title", right: "timeGridWeek,dayGridMonth" }}
            views={{
              // Month: overview of which days are still free; planning details in the week view.
              dayGridMonth: { selectable: false, eventDurationEditable: false, dayMaxEvents: 4 },
            }}
            navLinks
            navLinkDayClick={(date: Date) => calendarApiRef.current?.changeView("timeGridWeek", date)}
            dayCellTopContent={(info) =>
              info.view.type === "dayGridMonth" ? (
                <DayCellTop
                  workdayMinutes={workdayMinutes}
                  dayNumberText={info.dayNumberText}
                  minutes={loadPerDay.get(dayKey(info.date)) ?? 0}
                />
              ) : (
                true
              )
            }
            datesSet={(info) => {
              calendarApiRef.current = info.view.calendar;
              try {
                localStorage.setItem(VIEW_STORAGE_KEY, info.view.type);
              } catch {
                // storage blocked: not remembered, no problem
              }
              setRange({ from: info.start.toISOString(), to: info.end.toISOString() });
            }}
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
              if (!a) return true;
              const emphasis = blockEmphasis({ todoId: a.todoId, focusTodoId, matchesFilter: matchesFilter(a) });
              if (arg.view.type === "dayGridMonth") {
                return (
                  <MonthEventContent
                    appointment={a}
                    timeText={arg.timeText}
                    opacity={emphasis.opacity}
                    highlighted={emphasis.highlighted}
                    onDetails={() => setSelectedId(a.id)}
                  />
                );
              }
              return (
                <PlanningEventContent
                  appointment={a}
                  timeText={arg.timeText}
                  opacity={emphasis.opacity}
                  highlighted={emphasis.highlighted}
                  onDetails={() => setSelectedId(a.id)}
                />
              );
            }}
            drop={onDrop}
            eventDrop={onEventDrop}
            eventResize={onEventResize}
            eventClick={onEventClick}
            dateClick={onDateClick}
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
        <AppointmentDialog
          appointment={selected}
          onClose={() => setSelectedId(null)}
          onChanged={invalidate}
          onEditTodo={() => {
            setSelectedId(null);
            setEditTodoId(selected.todoId);
          }}
        />
      )}

      {editTodoId !== null && (
        <TodoEditDialog
          todoId={editTodoId}
          onClose={() => setEditTodoId(null)}
          onSaved={() => {
            for (const queryKey of todoChangedQueryKeys(editTodoId)) {
              void queryClient.invalidateQueries({ queryKey });
            }
            setEditTodoId(null);
          }}
        />
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
