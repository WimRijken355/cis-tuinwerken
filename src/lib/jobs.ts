import { Cron } from "croner";
import { runRecurringGenerationJob } from "./services/recurring";
import { runReminderJob } from "./services/reminders";
import { getSettings } from "./services/settings";
import { nowBrussels, ZONE } from "./time";

/**
 * Achtergrondjobs (croner), gestart vanuit instrumentation.ts.
 *
 * Ontwerp:
 * - Alle patronen draaien expliciet in Europe/Brussels → DST-correct.
 * - De app draait op precies ÉÉN instance (zie docker-compose.prod.yml),
 *   dus in-process jobs volstaan; er is geen aparte scheduler nodig.
 * - De globalThis-guard voorkomt dubbele registratie bij HMR in development.
 *
 * Herinneringen: elk uur tussen 16:00 en 21:00 wordt gecontroleerd of het
 * ingestelde verzenduur (settings) bereikt is; de job zelf is idempotent,
 * dus de latere uren fungeren als automatische retries. Bij het opstarten
 * draait er een inhaalrun (server was down om 18:00? → bij boot alsnog).
 */

const globalJobs = globalThis as unknown as { __cronStarted?: boolean };

async function reminderTick(): Promise<void> {
  const settings = await getSettings();
  if (nowBrussels().hour >= settings.reminderSendHour) {
    await runReminderJob();
  }
}

export function startCronJobs(): void {
  if (globalJobs.__cronStarted) return;
  globalJobs.__cronStarted = true;

  // Herinneringsmails: elk uur 16:00–21:00 Brussel.
  new Cron("0 16-21 * * *", { timezone: ZONE, name: "reminders" }, () => {
    reminderTick().catch((e) => console.error("Reminder-job faalde:", e));
  });

  // Terugkerend werk: dagelijks om 02:00 nieuwe beurten genereren.
  new Cron("0 2 * * *", { timezone: ZONE, name: "recurring" }, () => {
    runRecurringGenerationJob().catch((e) => console.error("Recurring-job faalde:", e));
  });

  // Inhaalruns bij het opstarten (bv. server was offline om 02:00/18:00).
  runRecurringGenerationJob().catch((e) => console.error("Recurring-inhaalrun faalde:", e));
  reminderTick().catch((e) => console.error("Reminder-inhaalrun faalde:", e));

  console.log(`⏰ Cron-jobs gestart (tijdzone ${ZONE})`);
}
