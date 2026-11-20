import { z } from "zod";
import { checklistItemIdsSchema } from "./checklist";
import type { ResourceType } from "./resources";

/** Contracten voor /api/todos. */

const hoursField = (label: string) =>
  z.coerce
    .number()
    .positive(`${label} moeten groter dan 0 zijn`)
    .max(999, `${label} zijn onrealistisch hoog`)
    // Stored as Decimal(5,2).
    .transform((v) => Math.round(v * 100) / 100);

/**
 * Planned resource for a todo: how many hours of this person/machine are
 * needed. Independent of the todo's total estimate — the sum does not have
 * to match (e.g. a machine running in parallel with two people).
 */
export const todoResourceInputSchema = z.object({
  resourceId: z.number().int().positive(),
  hours: hoursField("Uren per resource"),
});
export type TodoResourceInput = z.infer<typeof todoResourceInputSchema>;

export const resourcesSchema = z
  .array(todoResourceInputSchema)
  .max(50)
  .refine(
    (list) => new Set(list.map((r) => r.resourceId)).size === list.length,
    "Elke resource kan maar één keer per todo voorkomen",
  );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

/** Free-text name/address of a losse todo (not a customer record). */
const contactFields = {
  contactName: optionalText(200),
  contactStreet: optionalText(200),
  contactPostalCode: optionalText(20),
  contactCity: optionalText(100),
};

/** "yyyy-MM" (from <input type="month">); "" = none. */
const monthField = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2})?$/, "Maand als jjjj-mm")
  .optional()
  .transform((v) => v || undefined);

export const todoInputSchema = z.object({
  /** null/omitted = "losse todo" (holiday, doctor, ...): no customer, never invoiced. */
  customerId: z.number().int().positive().nullable().default(null),
  title: z.string().trim().min(1, "Titel is verplicht").max(200),
  description: z.string().max(5000).optional(),
  /** Total estimated time of the job. */
  estimatedHours: hoursField("Geschatte uren"),
  resources: resourcesSchema.default([]),
  /** Checklist item ids (ordered) that make up this todo's checklist. */
  taskIds: checklistItemIdsSchema.default([]),
  ...contactFields,
  /** Project: invoiced directly in EF; registrations never create an invoice. */
  isProject: z.boolean().default(false),
  /** Preferred period, e.g. "2027-04" (to "2027-05"): stored as windowStart/windowEnd. */
  preferredFrom: monthField,
  preferredTo: monthField,
});
export type TodoInput = z.infer<typeof todoInputSchema>;

/**
 * PATCH: `resources` / `taskIds`, when given, replace the whole set (empty
 * array = none). Tasks that stay keep their "done" state.
 */
export const todoUpdateSchema = z.object({
  /** Change the owner: a customer id, or null to make it a losse todo. */
  customerId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1, "Titel is verplicht").max(200).optional(),
  description: z.string().max(5000).optional(),
  estimatedHours: hoursField("Geschatte uren").optional(),
  resources: resourcesSchema.optional(),
  taskIds: checklistItemIdsSchema.optional(),
  ...contactFields,
  isProject: z.boolean().optional(),
  status: z.enum(["OPEN", "PLANNED", "DONE", "CANCELLED"]).optional(),
});
export type TodoUpdate = z.infer<typeof todoUpdateSchema>;

export interface TodoResourceDto {
  resourceId: number;
  name: string;
  type: ResourceType;
  hours: number;
}

export interface TodoDto {
  id: number;
  /** null for a "losse todo". */
  customerId: number | null;
  customerName?: string;
  title: string;
  description: string | null;
  /** Als number geserialiseerd (Prisma Decimal → number in de API-laag). */
  estimatedHours: number;
  status: "OPEN" | "PLANNED" | "DONE" | "CANCELLED";
  /** Project: invoiced directly in EF, hours only registered here. */
  isProject: boolean;
  completedAt: string | null;
  /** Gezet voor todo's die uit terugkerend werk gegenereerd zijn. */
  recurringWindowId: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  windowLabel?: string | null;
  /** Planned resources (persons/machines) with hours per resource. */
  resources?: TodoResourceDto[];
  /** Checklist of tasks to carry out, in order. */
  tasks?: TodoTaskDto[];
  /** Free-text name/address of a losse todo (null for customer todos). */
  contactName?: string | null;
  contactStreet?: string | null;
  contactPostalCode?: string | null;
  contactCity?: string | null;
  /** Customer location (GET /api/todos), for filtering/grouping in the planning. */
  customerCity?: string | null;
  customerPostalCode?: string | null;
  /** Planning: minutes already planned in blocks / still to plan (GET /api/todos). */
  plannedMinutes?: number;
  remainingMinutes?: number;
  appointmentCount?: number;
  /** Invoice state of the registered work (GET /api/todos, todoInvoiceState()). */
  invoiceState?: TodoInvoiceState;
  /** Work date of the last registered block, else completedAt (registeredOn()). */
  registeredOn?: string | null;
}

/**
 * Invoice state of a todo, derived from its registered days:
 * none = nothing registered; uninvoiced = registered, no invoice; partly =
 * some days invoiced, others not; then the state of its invoice(s):
 * in_ef (concept in EenvoudigFactureren), not_synced, failed, pending,
 * excluded ("niet versturen").
 */
export type TodoInvoiceState =
  | "none"
  | "uninvoiced"
  | "partly"
  | "in_ef"
  | "not_synced"
  | "failed"
  | "pending"
  | "excluded"
  /** Project with registered work: invoiced directly in EF, not from this app. */
  | "project";

/** One registered day of a todo (GET /api/todos/:id → registrations). */
export interface TodoRegistrationDto {
  completionId: number;
  appointmentId: number;
  /** Start of the registered block (ISO). */
  date: string;
  note: string | null;
  labor: {
    /** LaborEntry id (to change the invoiced hours afterwards). */
    id: number;
    name: string;
    type: "PERSON" | "MACHINE";
    registeredHours: number;
    invoicedHours: number;
  }[];
  extras: { description: string; quantity: number; unit: string; unitPrice: number }[];
  /** The invoice this day is on; null = not invoiced (yet). */
  invoice: {
    id: number;
    pushStatus: "PENDING" | "CONCEPT_CREATED" | "FAILED" | "NOT_SYNCED";
    efInvoiceId: number | null;
    syncExcluded: boolean;
    totalExclVat: number;
    /** Not in EF yet: hours can still change (the invoice is rebuilt). */
    editable: boolean;
  } | null;
}

export interface TodoTaskDto {
  id: number;
  checklistItemId: number | null;
  label: string;
  done: boolean;
  /** Not planned: added as "extra done" during a registration. */
  unplanned?: boolean;
}

/** Body for PATCH /api/todos/:id/tasks/:taskId. */
export const todoTaskToggleSchema = z.object({ done: z.boolean() });

/** Prisma `include` for a todo's resources and checklist, shared by all todo endpoints. */
export const todoResourcesInclude = {
  resources: {
    include: { resource: { select: { name: true, type: true } } },
    orderBy: { id: "asc" as const },
  },
  tasks: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
};

/** Maps TodoTask rows to DTOs. */
export function toTodoTaskDtos(
  rows: { id: number; checklistItemId: number | null; label: string; done: boolean; unplanned?: boolean }[],
): TodoTaskDto[] {
  return rows.map(({ id, checklistItemId, label, done, unplanned }) => ({
    id,
    checklistItemId,
    label,
    done,
    unplanned: unplanned ?? false,
  }));
}

export interface TaskSyncPlan {
  deleteIds: number[];
  create: { checklistItemId: number; label: string; sortOrder: number }[];
  updateSortOrder: { id: number; sortOrder: number }[];
}

/**
 * Turns the desired ordered list of checklist item ids into the changes on a
 * todo's existing tasks: tasks that stay keep their row (and so their
 * "done" state) and only get a new position; removed ones are deleted; new
 * ones are created with the current name of the checklist item as snapshot.
 */
export function planTodoTaskSync(
  existing: { id: number; checklistItemId: number | null; sortOrder: number }[],
  desiredIds: number[],
  namesById: Map<number, string>,
): TaskSyncPlan {
  const byItemId = new Map(
    existing.filter((t) => t.checklistItemId !== null).map((t) => [t.checklistItemId as number, t]),
  );
  const desired = new Set(desiredIds);
  const plan: TaskSyncPlan = {
    deleteIds: existing
      .filter((t) => t.checklistItemId === null || !desired.has(t.checklistItemId))
      .map((t) => t.id),
    create: [],
    updateSortOrder: [],
  };
  desiredIds.forEach((itemId, sortOrder) => {
    const current = byItemId.get(itemId);
    if (current) {
      if (current.sortOrder !== sortOrder) plan.updateSortOrder.push({ id: current.id, sortOrder });
    } else {
      plan.create.push({ checklistItemId: itemId, label: namesById.get(itemId) ?? "Taak", sortOrder });
    }
  });
  return plan;
}

/** Maps the included TodoResource rows to DTOs (Decimal → number). */
export function toTodoResourceDtos(
  rows: { resourceId: number; hours: unknown; resource: { name: string; type: ResourceType } }[],
): TodoResourceDto[] {
  return rows.map((r) => ({
    resourceId: r.resourceId,
    name: r.resource.name,
    type: r.resource.type,
    hours: Number(r.hours),
  }));
}

/** Sum of the hours planned per resource (shown next to the total estimate). */
export function sumResourceHours(resources: { hours: number }[]): number {
  return Math.round(resources.reduce((sum, r) => sum + r.hours, 0) * 100) / 100;
}

export interface TodoContact {
  contactName: string | null;
  contactStreet: string | null;
  contactPostalCode: string | null;
  contactCity: string | null;
}

/**
 * Contact fields to store: only a losse todo (no customer) keeps a free-text
 * name/address; a customer todo always gets them cleared (the customer record
 * is the single source of its name/address).
 */
export function contactForTodo(
  customerId: number | null,
  input: Partial<Record<keyof TodoContact, string | undefined>>,
): TodoContact {
  if (customerId !== null) {
    return { contactName: null, contactStreet: null, contactPostalCode: null, contactCity: null };
  }
  return {
    contactName: input.contactName ?? null,
    contactStreet: input.contactStreet ?? null,
    contactPostalCode: input.contactPostalCode ?? null,
    contactCity: input.contactCity ?? null,
  };
}

/** Name/city/address to show for a todo: the customer's, or the losse todo contact. */
export function todoPlace(
  customer: { name: string; street: string | null; postalCode: string | null; city: string | null } | null,
  contact: TodoContact,
): { name: string; city: string | null; street: string | null; postalCode: string | null } {
  if (customer) {
    return { name: customer.name, city: customer.city, street: customer.street, postalCode: customer.postalCode };
  }
  return {
    name: contact.contactName ?? "",
    city: contact.contactCity,
    street: contact.contactStreet,
    postalCode: contact.contactPostalCode,
  };
}

/**
 * Project flag to store: only a customer todo can be a project (a losse todo
 * is never invoiced anyway). `requested` undefined keeps the current value.
 */
export function projectFlagForTodo(customerId: number | null, requested: boolean | undefined, current = false): boolean {
  if (customerId === null) return false;
  return requested ?? current;
}

export const CONTACT_KEYS = ["contactName", "contactStreet", "contactPostalCode", "contactCity"] as const;

/**
 * Customer / contact to store on a PATCH of a todo:
 * - `customerId` omitted keeps the current owner; a number = (other) customer;
 *   null = losse todo.
 * - A customer todo never keeps contact fields.
 * - For a losse todo the four contact fields are replaced as a whole, but
 *   only when the request touched them (`contactTouched`: a key was present in
 *   the body, or the owner changed) — so a plain status update never wipes
 *   them, while emptying a field in the editor does clear it.
 * Returns `contact: undefined` when the contact fields must stay as they are.
 */
export function resolveTodoOwner(
  current: { customerId: number | null },
  input: { customerId?: number | null } & Partial<Record<keyof TodoContact, string | undefined>>,
  contactTouched: boolean,
): { customerId: number | null; ownerChanged: boolean; contact: TodoContact | undefined } {
  const customerId = input.customerId === undefined ? current.customerId : input.customerId;
  const ownerChanged = customerId !== current.customerId;
  if (customerId !== null) {
    return { customerId, ownerChanged, contact: ownerChanged ? contactForTodo(customerId, {}) : undefined };
  }
  return {
    customerId,
    ownerChanged,
    contact: contactTouched || ownerChanged ? contactForTodo(null, input) : undefined,
  };
}
