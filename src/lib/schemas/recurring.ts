import { z } from "zod";
import { checklistItemIdsSchema } from "./checklist";
import { recurrenceProblems, type MonthlyMode, type RecurrenceKind, type RecurrenceRule } from "../recurrence";
import { resourcesSchema, type TodoResourceDto } from "./todos";

/** Contracten voor terugkerend werk. */

const windowSchema = z
  .object({
    /** Bestaand window-id bij een update; weglaten = nieuw window. */
    id: z.number().int().positive().optional(),
    label: z.string().trim().min(1).max(50),
    startMonth: z.number().int().min(1).max(12),
    startDay: z.number().int().min(1).max(31).default(1),
    endMonth: z.number().int().min(1).max(12),
    endDay: z.number().int().min(1).max(31).default(31),
    sortOrder: z.number().int().default(0),
  })
  // endMonth < startMonth is toegestaan: het venster loopt over de jaargrens (bv. dec–jan).
  .refine((w) => w.startDay <= 31 && w.endDay <= 31, "Ongeldige dag");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als jjjj-mm-dd");
const month = z.number().int().min(1).max(12);

/** Outlook-style pattern fields (see src/lib/recurrence.ts); nullable = "not set". */
const patternFields = {
  recurrence: z.enum(["PERIODS", "WEEKLY", "MONTHLY"]),
  interval: z.number().int().min(1).max(52),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  monthlyMode: z.enum(["DAY_OF_MONTH", "NTH_WEEKDAY"]).nullable(),
  monthDay: z.number().int().min(1).max(31).nullable(),
  monthWeek: z.number().int().min(1).max(5).nullable(),
  monthWeekday: z.number().int().min(1).max(7).nullable(),
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  maxOccurrences: z.number().int().min(1).max(1000).nullable(),
  seasonStartMonth: month.nullable(),
  seasonEndMonth: month.nullable(),
};

export const recurringTemplateInputSchema = z.object({
  customerId: z.number().int().positive(),
  title: z.string().trim().min(1, "Titel is verplicht").max(200),
  description: z.string().max(5000).optional(),
  estimatedHours: z.coerce.number().positive().max(999),
  /** Zoveel dagen vóór het venster verschijnt de todo als "in te plannen". */
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(30),
  active: z.boolean().default(true),
  /** PERIODS only: the yearly windows (at least one). */
  windows: z.array(windowSchema).default([]),
  /** Resources (with hours) copied onto every generated todo. */
  resources: resourcesSchema.default([]),
  /** Checklist item ids (ordered) copied onto every generated todo. */
  taskIds: checklistItemIdsSchema.default([]),
  recurrence: patternFields.recurrence.default("PERIODS"),
  interval: patternFields.interval.default(1),
  weekdays: patternFields.weekdays.default([]),
  monthlyMode: patternFields.monthlyMode.default(null),
  monthDay: patternFields.monthDay.default(null),
  monthWeek: patternFields.monthWeek.default(null),
  monthWeekday: patternFields.monthWeekday.default(null),
  startDate: patternFields.startDate.default(null),
  endDate: patternFields.endDate.default(null),
  maxOccurrences: patternFields.maxOccurrences.default(null),
  seasonStartMonth: patternFields.seasonStartMonth.default(null),
  seasonEndMonth: patternFields.seasonEndMonth.default(null),
});
export type RecurringTemplateInput = z.infer<typeof recurringTemplateInputSchema>;

/**
 * PATCH: every field optional and WITHOUT defaults. (`.partial()` on the
 * input schema would keep the defaults, so omitting e.g. `resources` would
 * wipe them and omitting `active` would reactivate the template.)
 */
export const recurringTemplateUpdateSchema = z.object({
  title: z.string().trim().min(1, "Titel is verplicht").max(200).optional(),
  description: z.string().max(5000).optional(),
  estimatedHours: z.coerce.number().positive().max(999).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  active: z.boolean().optional(),
  windows: z.array(windowSchema).optional(),
  resources: resourcesSchema.optional(),
  taskIds: checklistItemIdsSchema.optional(),
  recurrence: patternFields.recurrence.optional(),
  interval: patternFields.interval.optional(),
  weekdays: patternFields.weekdays.optional(),
  monthlyMode: patternFields.monthlyMode.optional(),
  monthDay: patternFields.monthDay.optional(),
  monthWeek: patternFields.monthWeek.optional(),
  monthWeekday: patternFields.monthWeekday.optional(),
  startDate: patternFields.startDate.optional(),
  endDate: patternFields.endDate.optional(),
  maxOccurrences: patternFields.maxOccurrences.optional(),
  seasonStartMonth: patternFields.seasonStartMonth.optional(),
  seasonEndMonth: patternFields.seasonEndMonth.optional(),
});
export type RecurringTemplateUpdate = z.infer<typeof recurringTemplateUpdateSchema>;

export interface RecurringWindowDto {
  id: number;
  label: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  sortOrder: number;
}

/** The pattern part of a template (as stored, dates as "yyyy-MM-dd"). */
export interface RecurrencePattern {
  recurrence: RecurrenceKind;
  interval: number;
  weekdays: number[];
  monthlyMode: MonthlyMode | null;
  monthDay: number | null;
  monthWeek: number | null;
  monthWeekday: number | null;
  startDate: string | null;
  endDate: string | null;
  maxOccurrences: number | null;
  seasonStartMonth: number | null;
  seasonEndMonth: number | null;
}

const dateOnly = (d: Date | string | null | undefined): string | null =>
  d == null ? null : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);

/** Stored template (Prisma row) → pattern with "yyyy-MM-dd" dates. */
export function toRecurrencePattern(t: {
  recurrence: RecurrenceKind;
  interval: number;
  weekdays: number[];
  monthlyMode: MonthlyMode | null;
  monthDay: number | null;
  monthWeek: number | null;
  monthWeekday: number | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  maxOccurrences: number | null;
  seasonStartMonth: number | null;
  seasonEndMonth: number | null;
}): RecurrencePattern {
  return {
    recurrence: t.recurrence,
    interval: t.interval,
    weekdays: t.weekdays,
    monthlyMode: t.monthlyMode,
    monthDay: t.monthDay,
    monthWeek: t.monthWeek,
    monthWeekday: t.monthWeekday,
    startDate: dateOnly(t.startDate),
    endDate: dateOnly(t.endDate),
    maxOccurrences: t.maxOccurrences,
    seasonStartMonth: t.seasonStartMonth,
    seasonEndMonth: t.seasonEndMonth,
  };
}

/** WEEKLY/MONTHLY pattern → rule for src/lib/recurrence.ts; null for PERIODS or without start date. */
export function toRecurrenceRule(p: RecurrencePattern): RecurrenceRule | null {
  if (p.recurrence === "PERIODS" || !p.startDate) return null;
  return { ...p, kind: p.recurrence, startDate: p.startDate };
}

/**
 * Everything wrong with a (merged) template, in Dutch: PERIODS needs at least
 * one window, WEEKLY/MONTHLY a complete pattern (recurrenceProblems).
 */
export function templateProblems(p: RecurrencePattern & { windowCount: number }): string[] {
  if (p.recurrence === "PERIODS") return p.windowCount > 0 ? [] : ["Minstens één periode per jaar."];
  return recurrenceProblems({ ...p, kind: p.recurrence, startDate: p.startDate ?? undefined });
}

const PATTERN_KEYS = [
  "recurrence", "interval", "weekdays", "monthlyMode", "monthDay", "monthWeek", "monthWeekday",
  "startDate", "endDate", "maxOccurrences", "seasonStartMonth", "seasonEndMonth",
] as const satisfies readonly (keyof RecurrencePattern)[];

/** Only the pattern fields that are present (a PATCH body may hold any subset). */
export function pickPatternFields(input: Partial<RecurrencePattern> & Record<string, unknown>): Partial<RecurrencePattern> {
  return Object.fromEntries(PATTERN_KEYS.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
}

/** Pattern columns to store (dates as calendar days, UTC midnight like the @db.Date columns). */
export function patternData(p: Partial<RecurrencePattern>) {
  const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00Z`));
  return {
    recurrence: p.recurrence,
    interval: p.interval,
    weekdays: p.weekdays,
    monthlyMode: p.monthlyMode,
    monthDay: p.monthDay,
    monthWeek: p.monthWeek,
    monthWeekday: p.monthWeekday,
    startDate: toDate(p.startDate),
    endDate: toDate(p.endDate),
    maxOccurrences: p.maxOccurrences,
    seasonStartMonth: p.seasonStartMonth,
    seasonEndMonth: p.seasonEndMonth,
  };
}

export interface RecurringTemplateDto extends RecurrencePattern {
  id: number;
  customerId: number;
  customerName?: string;
  title: string;
  description: string | null;
  estimatedHours: number;
  leadTimeDays: number;
  active: boolean;
  windows: RecurringWindowDto[];
  resources: TodoResourceDto[];
  tasks: RecurringTaskDto[];
}

export interface RecurringTaskDto {
  checklistItemId: number;
  name: string;
}

/** Prisma `include` for a template's resources and checklist tasks. */
export const recurringExtrasInclude = {
  resources: {
    include: { resource: { select: { name: true, type: true } } },
    orderBy: { id: "asc" as const },
  },
  tasks: {
    include: { checklistItem: { select: { name: true } } },
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  },
};

/** Maps a template with `recurringExtrasInclude` to its resource + task DTOs. */
export function toRecurringExtrasDto(t: {
  resources: { resourceId: number; hours: unknown; resource: { name: string; type: "PERSON" | "MACHINE" } }[];
  tasks: { checklistItemId: number; checklistItem: { name: string } }[];
}): { resources: TodoResourceDto[]; tasks: RecurringTaskDto[] } {
  return {
    resources: t.resources.map((r) => ({
      resourceId: r.resourceId,
      name: r.resource.name,
      type: r.resource.type,
      hours: Number(r.hours),
    })),
    tasks: t.tasks.map((task) => ({ checklistItemId: task.checklistItemId, name: task.checklistItem.name })),
  };
}

/**
 * Data to copy from a recurring template onto a freshly generated todo:
 * its resources (with hours) and its checklist (name snapshot, in order).
 */
export function generatedTodoExtras(
  todoId: number,
  template: {
    resources: { resourceId: number; hours: unknown }[];
    tasks: { checklistItemId: number; checklistItem: { name: string } }[];
  },
): {
  resources: { todoId: number; resourceId: number; hours: unknown }[];
  tasks: { todoId: number; checklistItemId: number; label: string; sortOrder: number }[];
} {
  return {
    resources: template.resources.map((r) => ({ todoId, resourceId: r.resourceId, hours: r.hours })),
    tasks: template.tasks.map((t, sortOrder) => ({
      todoId,
      checklistItemId: t.checklistItemId,
      label: t.checklistItem.name,
      sortOrder,
    })),
  };
}

export const MONTH_NAMES_NL = [
  "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
] as const;

/** Automatisch label voor een venster: "Mei" of "Sep–Okt". */
export function windowLabel(startMonth: number, endMonth: number): string {
  return startMonth === endMonth
    ? MONTH_NAMES_NL[startMonth - 1]
    : `${MONTH_NAMES_NL[startMonth - 1]}–${MONTH_NAMES_NL[endMonth - 1]}`;
}
