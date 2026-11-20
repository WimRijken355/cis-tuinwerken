"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  describeRecurrence,
  NTH_LABELS_NL,
  recurrenceProblems,
  WEEKDAY_LONG_NL,
  WEEKDAY_SHORT_NL,
  type MonthlyMode,
  type RecurrenceKind,
} from "@/lib/recurrence";
import {
  MONTH_NAMES_NL,
  toRecurrenceRule,
  type RecurrencePattern,
  type RecurringTemplateDto,
  type RecurringWindowDto,
  windowLabel,
} from "@/lib/schemas/recurring";
import { apiSend } from "@/lib/api-client";
import { ActionButton } from "./action-button";
import { Button, ErrorNote, Field, FieldGroup, Modal, TextInput } from "./ui";
import {
  ChecklistPicker,
  ResourcePicker,
  resourceSelectionToInput,
  ResourceSummary,
  toResourceSelection,
  type ResourceSelection,
} from "./work-pickers";

/**
 * Recurring work on the customer page, two kinds:
 * - yearly periods, e.g. "Haag scheren, 2×/jaar: Mei + Sep–Okt" (one todo per
 *   period per year);
 * - Outlook style: every N weeks on weekdays, or every N months on a day /
 *   the Nth weekday, with start, end (never / date / N times) and an optional
 *   season, e.g. "Gras afrijden, elke week op di, apr–okt" (one todo per time).
 * Todos appear `leadTimeDays` ahead in "In te plannen". Resources (with
 * hours) and checklist tasks are copied onto every generated todo.
 */

/** One-line summary of a template's pattern for the list. */
export function templateSummary(t: Pick<RecurringTemplateDto, "windows"> & RecurrencePattern): string {
  const rule = toRecurrenceRule(t);
  if (rule) return describeRecurrence(rule);
  return `${t.windows.length}×/jaar: ${t.windows.map((w) => w.label).join(" + ")}`;
}

const KIND_OPTIONS: { value: RecurrenceKind; label: string }[] = [
  { value: "WEEKLY", label: "Wekelijks" },
  { value: "MONTHLY", label: "Maandelijks" },
  { value: "PERIODS", label: "Periodes per jaar" },
];

type EndMode = "never" | "date" | "count";

/** Days ahead a todo appears: a week for weekly work, two for monthly, a month for yearly periods. */
export function defaultLeadTime(kind: RecurrenceKind): number {
  return kind === "WEEKLY" ? 7 : kind === "MONTHLY" ? 14 : 30;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const isoWeekday = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

interface WindowDraft {
  id?: number;
  startMonth: number;
  endMonth: number;
}

export function RecurringSection({
  customerId,
  templates,
  onChanged,
}: {
  customerId: number;
  templates: RecurringTemplateDto[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<RecurringTemplateDto | "new" | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiSend(`/api/recurring-templates/${id}`, "DELETE"),
    onSuccess: onChanged,
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Terugkerend werk</h2>
        <Button variant="secondary" onClick={() => setEditing("new")}>
          + Toevoegen
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-gray-500">
          Bv. &quot;gras afrijden, elke week op dinsdag van april t/m oktober&quot; of &quot;haag scheren, 2× per
          jaar in mei en september&quot; — de todo&apos;s verschijnen dan vanzelf op tijd in &quot;In te plannen&quot;.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {templates.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0 text-sm">
                <p className={`font-medium ${t.active ? "" : "text-gray-400 line-through"}`}>
                  {t.title}
                </p>
                <p className="text-gray-500">
                  {templateSummary(t)} · ±{" "}
                  {t.estimatedHours} u · verschijnt {t.leadTimeDays} dagen vooraf
                  {t.tasks.length > 0 && ` · checklist: ${t.tasks.map((task) => task.name).join(", ")}`}
                </p>
                <div className="mt-1">
                  <ResourceSummary resources={t.resources} />
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <ActionButton action="edit" onClick={() => setEditing(t)} />
                <ActionButton
                  action="delete"
                  onClick={() => {
                    if (confirm(`"${t.title}" verwijderen? Al aangemaakte todo's blijven staan.`)) {
                      deleteMutation.mutate(t.id);
                    }
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RecurringFormModal
          customerId={customerId}
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function RecurringFormModal({
  customerId,
  template,
  onClose,
  onSaved,
}: {
  customerId: number;
  template: RecurringTemplateDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [hours, setHours] = useState(String(template?.estimatedHours ?? 2));
  const [leadTime, setLeadTime] = useState(String(template?.leadTimeDays ?? defaultLeadTime("WEEKLY")));
  const [resources, setResources] = useState<ResourceSelection>(() =>
    toResourceSelection(template?.resources),
  );
  const [taskIds, setTaskIds] = useState<number[]>(
    template?.tasks.map((t) => t.checklistItemId) ?? [],
  );
  // Pattern (Outlook style); a new template starts weekly.
  const [kind, setKind] = useState<RecurrenceKind>(template?.recurrence ?? "WEEKLY");
  const [intervalText, setIntervalText] = useState(String(template?.interval ?? 1));
  const [startDate, setStartDate] = useState(template?.startDate ?? todayIso());
  const [weekdays, setWeekdays] = useState<number[]>(
    template?.weekdays.length ? template.weekdays : [isoWeekday(template?.startDate ?? todayIso())],
  );
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>(template?.monthlyMode ?? "DAY_OF_MONTH");
  const [monthDay, setMonthDay] = useState(String(template?.monthDay ?? Number(startDate.slice(8, 10))));
  const [monthWeek, setMonthWeek] = useState(template?.monthWeek ?? 1);
  const [monthWeekday, setMonthWeekday] = useState(template?.monthWeekday ?? isoWeekday(startDate));
  const [endMode, setEndMode] = useState<EndMode>(
    template?.endDate ? "date" : template?.maxOccurrences ? "count" : "never",
  );
  const [endDate, setEndDate] = useState(template?.endDate ?? "");
  const [maxOccurrences, setMaxOccurrences] = useState(String(template?.maxOccurrences ?? 10));
  const [hasSeason, setHasSeason] = useState(Boolean(template?.seasonStartMonth));
  const [seasonStart, setSeasonStart] = useState(template?.seasonStartMonth ?? 4);
  const [seasonEnd, setSeasonEnd] = useState(template?.seasonEndMonth ?? 10);

  const pattern: RecurrencePattern = {
    recurrence: kind,
    interval: Math.max(1, Number(intervalText) || 1),
    weekdays: kind === "WEEKLY" ? [...weekdays].sort() : [],
    monthlyMode: kind === "MONTHLY" ? monthlyMode : null,
    monthDay: kind === "MONTHLY" && monthlyMode === "DAY_OF_MONTH" ? Number(monthDay) || null : null,
    monthWeek: kind === "MONTHLY" && monthlyMode === "NTH_WEEKDAY" ? monthWeek : null,
    monthWeekday: kind === "MONTHLY" && monthlyMode === "NTH_WEEKDAY" ? monthWeekday : null,
    startDate: kind === "PERIODS" ? null : startDate || null,
    endDate: kind !== "PERIODS" && endMode === "date" ? endDate || null : null,
    maxOccurrences: kind !== "PERIODS" && endMode === "count" ? Number(maxOccurrences) || null : null,
    seasonStartMonth: kind !== "PERIODS" && hasSeason ? seasonStart : null,
    seasonEndMonth: kind !== "PERIODS" && hasSeason ? seasonEnd : null,
  };
  const problems = recurrenceProblems({ ...pattern, kind, startDate: pattern.startDate ?? undefined });
  const rule = toRecurrenceRule(pattern);

  const [windows, setWindows] = useState<WindowDraft[]>(
    template?.windows.map((w: RecurringWindowDto) => ({
      id: w.id,
      startMonth: w.startMonth,
      endMonth: w.endMonth,
    })) ?? [{ startMonth: 5, endMonth: 5 }],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        estimatedHours: Number(hours.replace(",", ".")),
        leadTimeDays: Number(leadTime),
        resources: resourceSelectionToInput(resources),
        taskIds,
        ...pattern,
        windows: windows.map((w, i) => ({
          id: w.id,
          label: windowLabel(w.startMonth, w.endMonth),
          startMonth: w.startMonth,
          startDay: 1,
          endMonth: w.endMonth,
          endDay: 31,
          sortOrder: i,
        })),
      };
      if (template) {
        await apiSend(`/api/recurring-templates/${template.id}`, "PATCH", payload);
      } else {
        await apiSend("/api/recurring-templates", "POST", { ...payload, customerId });
      }
      // Meteen genereren: valt de periode nu (of binnen de leadtime), dan
      // verschijnt de todo direct in "in te plannen".
      await apiSend("/api/jobs/recurring", "POST");
    },
    onSuccess: onSaved,
  });

  return (
    <Modal
      title={template ? "Terugkerend werk bewerken" : "Terugkerend werk toevoegen"}
      open
      wide
      onClose={onClose}
    >
      {saveMutation.error && <ErrorNote message={(saveMutation.error as Error).message} />}
      <form
        className="mt-2 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Field label="Wat moet er gebeuren?">
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="bv. Haag scheren"
            required
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Geschat (uren)">
            <TextInput inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} required />
          </Field>
          <Field label="Zichtbaar (dagen vooraf)" hint="Zo lang vooraf verschijnt de todo in &quot;In te plannen&quot;">
            <TextInput inputMode="numeric" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} required />
          </Field>
        </div>

        <FieldGroup label="Herhaling">
          <div className="flex gap-1" role="radiogroup" aria-label="Soort herhaling">
            {KIND_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={kind === o.value}
                onClick={() => {
                  // Follow the kind's sensible default while the user did not change it.
                  if (leadTime === String(defaultLeadTime(kind))) setLeadTime(String(defaultLeadTime(o.value)));
                  setKind(o.value);
                }}
                className={`min-h-11 flex-1 rounded-md border px-2 text-sm ${
                  kind === o.value
                    ? "border-brand-600 bg-brand-50 font-medium text-brand-700"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </FieldGroup>

        {kind !== "PERIODS" && (
          <div className="space-y-3 rounded-md border border-gray-200 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Om de</span>
              <TextInput
                aria-label="Interval"
                inputMode="numeric"
                value={intervalText}
                onChange={(e) => setIntervalText(e.target.value)}
                className="!w-16 text-center"
              />
              <span>
                {kind === "WEEKLY"
                  ? pattern.interval === 1 ? "week, op:" : "weken, op:"
                  : pattern.interval === 1 ? "maand" : "maanden"}
              </span>
            </div>

            {kind === "WEEKLY" && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Weekdagen">
                {WEEKDAY_SHORT_NL.map((label, i) => {
                  const wd = i + 1;
                  const on = weekdays.includes(wd);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      title={WEEKDAY_LONG_NL[i]}
                      onClick={() => setWeekdays((ws) => (on ? ws.filter((w) => w !== wd) : [...ws, wd]))}
                      className={`h-11 w-11 rounded-full border text-sm ${
                        on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white text-gray-600"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {kind === "MONTHLY" && (
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthlyMode"
                    checked={monthlyMode === "DAY_OF_MONTH"}
                    onChange={() => setMonthlyMode("DAY_OF_MONTH")}
                  />
                  <span>Op dag</span>
                </label>
                {monthlyMode === "DAY_OF_MONTH" && (
                  <div className="pl-6">
                    <TextInput
                      aria-label="Dag van de maand"
                      inputMode="numeric"
                      value={monthDay}
                      onChange={(e) => setMonthDay(e.target.value)}
                      className="!w-16 text-center"
                    />
                    <span className="ml-2 text-xs text-gray-500">(31 = altijd de laatste dag)</span>
                  </div>
                )}
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthlyMode"
                    checked={monthlyMode === "NTH_WEEKDAY"}
                    onChange={() => setMonthlyMode("NTH_WEEKDAY")}
                  />
                  <span>Op de</span>
                </label>
                {monthlyMode === "NTH_WEEKDAY" && (
                  <div className="flex gap-2 pl-6">
                    <select
                      aria-label="Welke"
                      value={monthWeek}
                      onChange={(e) => setMonthWeek(Number(e.target.value))}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {NTH_LABELS_NL[n]}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Weekdag"
                      value={monthWeekday}
                      onChange={(e) => setMonthWeekday(Number(e.target.value))}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      {WEEKDAY_LONG_NL.map((name, i) => (
                        <option key={name} value={i + 1}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Begindatum">
                <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </Field>
              <FieldGroup label="Einde">
                <div className="space-y-1.5 text-sm">
                  <label className="flex items-center gap-2 whitespace-nowrap">
                    <input type="radio" name="endMode" checked={endMode === "never"} onChange={() => setEndMode("never")} />
                    Geen einddatum
                  </label>
                  <label className="flex items-center gap-2 whitespace-nowrap">
                    <input type="radio" name="endMode" checked={endMode === "date"} onChange={() => setEndMode("date")} />
                    Eindigt op
                    <TextInput
                      type="date"
                      aria-label="Einddatum"
                      value={endDate}
                      min={startDate}
                      disabled={endMode !== "date"}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="!w-40"
                    />
                  </label>
                  <label className="flex items-center gap-2 whitespace-nowrap">
                    <input type="radio" name="endMode" checked={endMode === "count"} onChange={() => setEndMode("count")} />
                    Na
                    <TextInput
                      aria-label="Aantal keer"
                      inputMode="numeric"
                      value={maxOccurrences}
                      disabled={endMode !== "count"}
                      onChange={(e) => setMaxOccurrences(e.target.value)}
                      className="!w-16 text-center"
                    />
                    keer
                  </label>
                </div>
              </FieldGroup>
            </div>

            <div className="text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hasSeason} onChange={(e) => setHasSeason(e.target.checked)} />
                Enkel in een seizoen (elk jaar)
              </label>
              {hasSeason && (
                <div className="mt-1.5 flex items-center gap-2 pl-6">
                  <MonthSelect value={seasonStart} onChange={setSeasonStart} />
                  <span className="text-gray-400">t/m</span>
                  <MonthSelect value={seasonEnd} onChange={setSeasonEnd} />
                </div>
              )}
            </div>

            {problems.length > 0 ? (
              <p className="text-xs text-amber-700">{problems.join(" ")}</p>
            ) : (
              rule && <p className="rounded bg-brand-50 px-2 py-1 text-xs text-brand-800">{describeRecurrence(rule)}</p>
            )}
            <p className="text-xs text-gray-500">
              Per keer verschijnt een todo in &quot;In te plannen&quot;, met als voorkeur die dag tot de dag vóór de
              volgende keer.
            </p>
          </div>
        )}

        {kind === "PERIODS" && (
          <div>
            <p className="text-sm font-medium text-gray-700">
              Periodes ({windows.length}×/jaar)
            </p>
            <div className="mt-1 space-y-2">
              {windows.map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <MonthSelect
                    value={w.startMonth}
                    onChange={(m) =>
                      setWindows((ws) =>
                        ws.map((x, j) =>
                          j === i ? { ...x, startMonth: m, endMonth: Math.max(m, x.endMonth) } : x,
                        ),
                      )
                    }
                  />
                  <span className="text-gray-400">t/m</span>
                  <MonthSelect
                    value={w.endMonth}
                    onChange={(m) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, endMonth: m } : x)))}
                  />
                  <span className="flex-1 text-xs text-gray-400">
                    {windowLabel(w.startMonth, w.endMonth)}
                  </span>
                  {windows.length > 1 && (
                    <ActionButton
                      action="delete"
                      iconOnly
                      label="Periode verwijderen"
                      onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))}
                    />
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-2 text-sm text-brand-600 hover:underline"
              onClick={() => setWindows((ws) => [...ws, { startMonth: 9, endMonth: 9 }])}
            >
              + Periode toevoegen
            </button>
          </div>
        )}

        <ChecklistPicker value={taskIds} onChange={setTaskIds} initial={template?.tasks} />
        <ResourcePicker
          value={resources}
          onChange={setResources}
          totalHours={hours}
          initial={template?.resources}
        />
        {template && (
          <p className="text-xs text-gray-500">
            Wijzigingen aan checklist en resources gelden voor todo&apos;s die vanaf nu
            gegenereerd worden; al bestaande todo&apos;s pas je zelf aan.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" disabled={saveMutation.isPending || (kind !== "PERIODS" && problems.length > 0)}>
            {saveMutation.isPending ? "Bezig…" : "Bewaren"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MonthSelect({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
    >
      {MONTH_NAMES_NL.map((name, i) => (
        <option key={name} value={i + 1}>
          {name}
        </option>
      ))}
    </select>
  );
}
