import { db } from "../db";
import { type Settings, settingsSchema, type SettingsUpdate } from "../schemas/settings";

/**
 * Leest/schrijft de zakelijke instellingen uit de settings-tabel.
 * Opslag: key-value met snake_case sleutels (zie seed.ts), API/UI werkt met
 * het getypeerde Settings-object.
 */

const KEY_MAP: Record<keyof Settings, string> = {
  ownHourlyRate: "own_hourly_rate",
  laborVatRate: "labor_vat_rate",
  reminderSendHour: "reminder_send_hour",
  invoiceDaysDue: "invoice_days_due",
  reminderEmailSubject: "reminder_email_subject",
  reminderEmailBody: "reminder_email_body",
  efInvoiceSyncEnabled: "ef_invoice_sync_enabled",
  efInvoiceAutoSync: "ef_invoice_auto_sync",
};

const DEFAULTS: Settings = {
  ownHourlyRate: 45,
  laborVatRate: 21,
  reminderSendHour: 18,
  invoiceDaysDue: 30,
  reminderEmailSubject: "Afspraak morgen — Tuinwerken Cis",
  // On by default: keeps the existing behaviour until switched off in Settings.
  efInvoiceSyncEnabled: true,
  // On by default as well: new invoices keep being pushed immediately.
  efInvoiceAutoSync: true,
  reminderEmailBody:
    "Beste {{naam}},\n\nMorgen, {{datum}} om {{uur}}, komen wij bij u langs voor: {{werk}}.\n\n" +
    "Kan de afspraak niet doorgaan? Laat het ons gerust weten.\n\nMet vriendelijke groeten\nTuinwerken Cis",
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const raw = Object.fromEntries(
    (Object.keys(KEY_MAP) as (keyof Settings)[]).map((prop) => [
      prop,
      byKey.get(KEY_MAP[prop]) ?? DEFAULTS[prop],
    ]),
  );
  // safeParse: een corrupte waarde in de DB mag de app niet platleggen.
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULTS;
}

export async function updateSettings(update: SettingsUpdate): Promise<Settings> {
  const entries = Object.entries(update) as [keyof Settings, Settings[keyof Settings]][];
  await db.$transaction(
    entries.map(([prop, value]) =>
      db.setting.upsert({
        where: { key: KEY_MAP[prop] },
        update: { value },
        create: { key: KEY_MAP[prop], value },
      }),
    ),
  );
  return getSettings();
}
