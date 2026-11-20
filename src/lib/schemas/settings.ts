import { z } from "zod";

/**
 * Zakelijke instellingen (settings-tabel, bewerkbaar in de UI).
 * Secrets en infrastructuur horen hier NIET — die staan in .env.
 */
export const settingsSchema = z.object({
  /** Eigen uurtarief in euro (excl. btw). */
  ownHourlyRate: z.coerce.number().min(0).max(1000),
  /** Btw op arbeid: 21%, of 6% (verlaagd tarief, bv. bepaalde woningtuinen). */
  laborVatRate: z.coerce.number().refine((v) => v === 6 || v === 21, "Btw op arbeid is 6 of 21"),
  /** Uur (Brusselse tijd) waarop de herinneringsmails vertrekken, 16–21. */
  reminderSendHour: z.coerce.number().int().min(16).max(21),
  /** Betaaltermijn op facturen, in dagen. */
  invoiceDaysDue: z.coerce.number().int().min(0).max(365),
  reminderEmailSubject: z.string().min(1).max(200),
  /** Placeholders: {{naam}} {{datum}} {{uur}} {{werk}} */
  reminderEmailBody: z.string().min(1).max(5000),
  /** Master switch: may invoices go to EenvoudigFactureren at all (default on). Off = never synced. */
  efInvoiceSyncEnabled: z.boolean(),
  /** Push a new invoice immediately on registration (default on). Off = send manually from Facturen. Only effective while efInvoiceSyncEnabled is on. */
  efInvoiceAutoSync: z.boolean(),
  /** Planning: max. hours of one planned block (a longer todo is split over several days); default 10. */
  maxBlockHours: z.coerce.number().min(1, "Minstens 1 uur").max(24, "Hoogstens 24 uur"),
});

export type Settings = z.infer<typeof settingsSchema>;

export const settingsUpdateSchema = settingsSchema.partial();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
