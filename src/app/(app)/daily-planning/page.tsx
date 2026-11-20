"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RescheduleSheet } from "@/components/daily/reschedule-sheet";
import { ResourceChips, StatusFlags } from "@/components/planning/planning-cards";
import { TodoEditDialog } from "@/components/planning/planning-dialogs";
import { EmptyState, ErrorNote, Spinner, StatusBadge } from "@/components/ui";
import { TodoChecklist } from "@/components/work-pickers";
import { apiGet, apiSend } from "@/lib/api-client";
import { formatMinutesAsHours, partLabel, todoColor } from "@/lib/planning";
import { todoChangedQueryKeys } from "@/lib/query-keys";
import { registerHref } from "@/lib/register-link";
import { type AppointmentDto, wazeUrl } from "@/lib/schemas/appointments";
import type { TodoTaskDto } from "@/lib/schemas/todos";
import { formatDate, formatTime, isIsoDay, shiftDay, todayBrussels } from "@/lib/time";

/**
 * Dagplanning — built for a PHONE (see CLAUDE.md): the blocks of one day
 * (default today, ‹ › to browse; the day lives in the URL so "back" from a
 * registration returns to the same day). Each card opens to show what has to
 * be done (description + checklist, tickable on site) and offers Waze,
 * "Klaarmelden" (registration) and "Verplaatsen"; ✏️ opens the full todo
 * editor (TodoEditDialog, the same one as on the planning page).
 */
export default function DailyPlanningPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DailyPlanning />
    </Suspense>
  );
}

function DailyPlanning() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const today = todayBrussels();
  const requested = searchParams.get("date");
  const day = requested && isIsoDay(requested) ? requested : today;

  const [openId, setOpenId] = useState<number | null>(null);
  const [moving, setMoving] = useState<AppointmentDto | null>(null);
  /** Todo open in the full editor (same dialog as on the planning page). */
  const [editTodoId, setEditTodoId] = useState<number | null>(null);

  const { data: appointments, isLoading, error } = useQuery({
    queryKey: ["appointments", "day", day],
    queryFn: () => apiGet<AppointmentDto[]>(`/api/appointments/day?date=${day}`),
    placeholderData: keepPreviousData,
  });

  const toggleTask = useMutation({
    mutationFn: ({ todoId, task }: { todoId: number; task: TodoTaskDto }) =>
      apiSend(`/api/todos/${todoId}/tasks/${task.id}`, "PATCH", { done: !task.done }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["appointments", "day", day] }),
  });

  const goTo = (target: string) =>
    router.replace(target === today ? "/daily-planning" : `/daily-planning?date=${target}`, { scroll: false });
  const totalMinutes = (appointments ?? []).reduce((sum, a) => sum + a.durationMinutes, 0);

  return (
    <div className="mx-auto max-w-lg p-3 sm:p-4">
      {/* Day navigation */}
      <div className="sticky top-0 z-10 -mx-3 mb-3 flex items-center gap-2 bg-gray-50/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
        <button
          type="button"
          onClick={() => goTo(shiftDay(day, -1))}
          aria-label="Vorige dag"
          className="h-11 w-11 shrink-0 rounded-full border border-gray-300 bg-white text-xl text-gray-700 active:bg-gray-100"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-bold capitalize text-brand-900">{day === today ? "Vandaag" : formatDate(day)}</p>
          <p className="text-xs text-gray-500">
            {day === today ? formatDate(day) : day === shiftDay(today, 1) ? "morgen" : day === shiftDay(today, -1) ? "gisteren" : ""}
            {appointments && appointments.length > 0 && ` · ${appointments.length} afspraken · ${formatMinutesAsHours(totalMinutes)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => goTo(shiftDay(day, 1))}
          aria-label="Volgende dag"
          className="h-11 w-11 shrink-0 rounded-full border border-gray-300 bg-white text-xl text-gray-700 active:bg-gray-100"
        >
          ›
        </button>
      </div>
      {day !== today && (
        <button type="button" onClick={() => goTo(today)} className="mb-3 w-full text-center text-sm text-brand-600">
          ↩ Terug naar vandaag
        </button>
      )}

      {isLoading && <Spinner />}
      {error && <ErrorNote message={(error as Error).message} />}
      {appointments && appointments.length === 0 && <EmptyState>Niets gepland op deze dag. 🌿</EmptyState>}

      <ul className="space-y-3">
        {appointments?.map((a) => {
          const open = openId === a.id;
          const color = todoColor(a.todoId, a.isLoose);
          const part = partLabel(a.part);
          const doneCount = a.tasks.filter((t) => t.done).length;
          const end = new Date(new Date(a.startAt).getTime() + a.durationMinutes * 60000);
          return (
            <li
              key={a.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              style={{ borderLeft: `6px solid ${color}` }}
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : a.id)}
                aria-expanded={open}
                className="w-full p-3 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-brand-900">
                      {formatTime(a.startAt)}–{formatTime(end)}
                      {part && <span className="ml-2 align-middle text-xs font-semibold text-gray-500">dag {part}</span>}
                    </p>
                    <p className="truncate font-medium">
                      {a.isLoose ? `📌 ${a.todoTitle}` : a.customerName}
                    </p>
                    {!a.isLoose && <p className="truncate text-sm text-gray-600">{a.todoTitle}</p>}
                    {a.isLoose && a.customerName && <p className="truncate text-sm text-gray-600">{a.customerName}</p>}
                    {a.address && <p className="truncate text-sm text-gray-400">{a.address}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={a.status} />
                    <div className="flex flex-col items-end gap-0.5">
                      <StatusFlags confirmed={a.confirmed} reservation={a.reservation} />
                    </div>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <ResourceChips resources={a.resources} />
                  {a.tasks.length > 0 && (
                    <span className="shrink-0 text-xs text-gray-500">
                      ☑ {doneCount}/{a.tasks.length} {open ? "▲" : "▼"}
                    </span>
                  )}
                </div>
              </button>

              {open && (
                <div className="border-t border-gray-100 px-3 pb-3 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Wat moet er gebeuren</p>
                  {a.todoDescription && <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{a.todoDescription}</p>}
                  {a.tasks.length > 0 ? (
                    <TodoChecklist
                      tasks={a.tasks}
                      disabled={toggleTask.isPending}
                      onToggle={(task) => toggleTask.mutate({ todoId: a.todoId, task })}
                    />
                  ) : (
                    !a.todoDescription && <p className="mt-1 text-sm text-gray-400">Geen checklist of omschrijving.</p>
                  )}
                  {a.resources.length > 0 && (
                    <div className="mt-2">
                      <ResourceChips resources={a.resources} showHours />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditTodoId(a.todoId)}
                    className="mt-3 w-full rounded-md border border-gray-300 py-2.5 text-sm text-gray-700 active:bg-gray-50"
                  >
                    ✏️ Todo bewerken (omschrijving, checklist, resources…)
                  </button>
                </div>
              )}

              <div className="flex gap-2 border-t border-gray-100 p-2">
                {a.address ? (
                  <a
                    href={wazeUrl(a.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-md bg-sky-500 py-2.5 text-center text-sm font-semibold text-white active:bg-sky-600"
                  >
                    🧭 Waze
                  </a>
                ) : (
                  <span className="flex-1 rounded-md bg-gray-100 py-2.5 text-center text-sm text-gray-400">Geen adres</span>
                )}
                <button
                  type="button"
                  onClick={() => setEditTodoId(a.todoId)}
                  aria-label="Todo bewerken"
                  title="Todo bewerken"
                  className="w-11 shrink-0 rounded-md border border-gray-300 py-2.5 text-sm active:bg-gray-50"
                >
                  ✏️
                </button>
                {a.status === "PLANNED" && (
                  <button
                    type="button"
                    onClick={() => setMoving(a)}
                    className="rounded-md border border-gray-300 px-3 py-2.5 text-sm text-gray-700 active:bg-gray-50"
                  >
                    Verplaatsen
                  </button>
                )}
                {a.status === "PLANNED" && !a.isLoose && (
                  <Link
                    href={registerHref(a.id, { date: day !== today ? day : undefined })}
                    className="flex-1 rounded-md bg-brand-600 py-2.5 text-center text-sm font-semibold text-white active:bg-brand-700"
                  >
                    ✓ Klaarmelden
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

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

      {moving && (
        <RescheduleSheet
          appointment={moving}
          onClose={() => setMoving(null)}
          onChanged={() => {
            setMoving(null);
            void queryClient.invalidateQueries({ queryKey: ["appointments"] });
          }}
        />
      )}
    </div>
  );
}
