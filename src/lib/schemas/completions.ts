import { z } from "zod";
import { ceilToQuarterHour } from "../registration";

/**
 * Contract for registering a day's work on an appointment ("klaarmelden",
 * mostly from a phone): hours per resource, extras, checklist, note, and
 * whether the job is invoiced now (multi-day jobs: only with the last block).
 */

/** Hours "per begonnen kwartier": 1,1 → 1,25; 0 allowed (e.g. registered but not invoiced). */
const quarterHours = z.coerce
  .number()
  .min(0, "Uren kunnen niet negatief zijn")
  .max(24, "Meer dan 24 uur op één dag kan niet")
  .transform(ceilToQuarterHour);

export const completionResourceSchema = z.object({
  resourceId: z.number().int().positive(),
  /** Actually worked (for reporting / the hours dashboard). */
  registeredHours: quarterHours,
  /** Charged to the customer (sent to EenvoudigFactureren); may differ. */
  invoicedHours: quarterHours,
});

export const completionInputSchema = z
  .object({
    resources: z
      .array(completionResourceSchema)
      .max(50)
      .refine(
        (list) => new Set(list.map((r) => r.resourceId)).size === list.length,
        "Elke resource kan maar één keer voorkomen",
      ),
    /** Extra charges (artikels), snapshots of the price list. */
    extras: z
      .array(
        z.object({
          priceListItemId: z.number().int().positive().optional(),
          description: z.string().trim().min(1).max(200),
          quantity: z.coerce
            .number()
            .positive()
            .max(10000)
            .transform((v) => Math.round(v * 100) / 100),
          unit: z.string().trim().min(1).max(10),
          unitPrice: z.coerce.number().min(0).max(100000),
          vatRate: z.coerce.number().refine((v) => [0, 6, 12, 21].includes(v)),
        }),
      )
      .default([]),
    /** Desired done-state of the todo's checklist tasks (TodoTask ids). */
    taskStates: z.array(z.object({ id: z.number().int().positive(), done: z.boolean() })).default([]),
    /** Tasks that were done but not on the planned checklist. */
    extraTasks: z
      .array(
        z.object({
          checklistItemId: z.number().int().positive().optional(),
          label: z.string().trim().min(1).max(200),
        }),
      )
      .max(50)
      .default([]),
    note: z.string().max(2000).optional(),
    /**
     * Invoice the job now (all registered, not yet invoiced days of this todo)
     * and close it. Off for an intermediate day of a multi-day job.
     */
    invoiceNow: z.boolean(),
    /**
     * The job is finished (also without invoicing now): todo DONE, remaining
     * planned blocks cancelled. Implied by invoiceNow. See jobOutcome().
     */
    closeJob: z.boolean().optional(),
    /**
     * Only with invoiceNow: a remark per invoice line (key from buildJobInvoice),
     * sent to EF as a text line right below that line.
     */
    lineRemarks: z.record(z.string().max(200), z.string().max(500)).default({}),
    /** Only with invoiceNow: extra note lines at the bottom of the invoice. */
    invoiceNotes: z.array(z.string().trim().max(1000)).max(20).default([]),
  })
  .refine(
    (c) => c.resources.some((r) => r.registeredHours > 0 || r.invoicedHours > 0),
    "Geef voor minstens één resource uren in",
  );
export type CompletionInput = z.infer<typeof completionInputSchema>;

/**
 * PATCH /api/todos/:id/invoiced-hours — change the hours to invoice of
 * registered days afterwards (from the todo's details), as long as those days
 * are not on an invoice that is already in EenvoudigFactureren.
 */
export const invoicedHoursUpdateSchema = z.object({
  entries: z
    .array(z.object({ laborEntryId: z.number().int().positive(), invoicedHours: quarterHours }))
    .min(1)
    .max(100)
    .refine((list) => new Set(list.map((e) => e.laborEntryId)).size === list.length, "Elke lijn kan maar één keer voorkomen"),
});
export type InvoicedHoursUpdate = z.infer<typeof invoicedHoursUpdateSchema>;

/** Planned resource of the todo, with the hours proposal for today. */
export interface RegistrationResourceDto {
  resourceId: number;
  name: string;
  type: "PERSON" | "MACHINE";
  hourlyRate: number;
  /** Hours planned for this resource on the whole todo. */
  todoHours: number;
  /** Registered on earlier days of this todo. */
  alreadyRegisteredHours: number;
  proposedHours: number;
}

/** Everything the registration screen needs (GET /api/appointments/:id/registration). */
export interface RegistrationContextDto {
  plannedResources: RegistrationResourceDto[];
  tasks: { id: number; label: string; done: boolean; unplanned: boolean; checklistItemId: number | null }[];
  blockMinutes: number;
  otherPlannedBlocks: number;
  remainingUnplannedMinutes: number;
  defaultInvoiceNow: boolean;
  /** Earlier registered days of this todo that are not invoiced yet. */
  uninvoicedDays: {
    date: string;
    labor: {
      resourceId: number | null;
      name: string;
      type: "PERSON" | "MACHINE";
      invoicedHours: number;
      hourlyRate: number;
      vatRate: number;
    }[];
    extras: {
      priceListItemId: number | null;
      description: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      vatRate: number;
    }[];
  }[];
  laborVatRate: number;
}

export interface InvoiceDto {
  id: number;
  customerId: number;
  customerName: string;
  efInvoiceId: number | null;
  pushStatus: "PENDING" | "CONCEPT_CREATED" | "FAILED" | "NOT_SYNCED";
  /** Invoice of a demo customer: never sent to EF. */
  customerIsDemo?: boolean;
  /** "Niet versturen": excluded from (bulk) sync to EF. */
  syncExcluded: boolean;
  totalExclVat: number;
  /** Computed from the EF lines (VAT per rate), for display. */
  totalInclVat: number;
  errorMessage: string | null;
  createdAt: string;
  pushedAt: string | null;
  workTitle: string;
  workDate: string;
}

/** GET /api/invoices/:id — the invoice as sent to EF + the hours it was built from. */
export interface InvoiceDetailDto extends Omit<InvoiceDto, "workDate"> {
  /** Exactly the lines sent (or to be sent) to EenvoudigFactureren, incl. text lines. */
  items: { type: "item" | "text"; description: string; quantity?: number; unit?: string; amount?: number; tax_rate?: number }[];
  /** Editable structure (lines with remark, notes) — see src/lib/invoice-content.ts. */
  content: import("../invoice-content").InvoiceContent;
  /** Not in EF yet → can still be edited (canEditInvoice). */
  editable: boolean;
  /** Set when edited by hand after the registration. */
  editedAt: string | null;
  /** Registered days on this invoice, oldest first. */
  days: {
    date: string;
    note: string | null;
    labor: {
      name: string;
      type: "PERSON" | "MACHINE";
      registeredHours: number;
      invoicedHours: number;
      hourlyRate: number;
    }[];
    extras: { description: string; quantity: number; unit: string; unitPrice: number }[];
  }[];
}
