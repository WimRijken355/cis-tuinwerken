import { db } from "../db";
import { brusselsDayRangeUtc, formatDate, formatTime } from "../time";
import { sendMail } from "./mailer";
import { getSettings } from "./settings";

/**
 * Herinneringsmails: de klant krijgt 1 dag vóór de afspraak een mail.
 *
 * De job draait elk uur tussen 16:00 en 21:00 (Europe/Brussels) en is
 * idempotent: alleen afspraken van MORGEN met reminderSentAt = NULL komen in
 * aanmerking. Een mislukte verzending blijft dus vanzelf kandidaat voor de
 * volgende run (automatische retry om het uur), en de fout is zichtbaar in de
 * UI via reminderError + EmailLog.
 */

export interface ReminderRunResult {
  candidates: number;
  sent: number;
  failed: number;
  skippedNoEmail: number;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

/**
 * Verstuurt de herinnering voor één afspraak en werkt status/log bij.
 * @returns true bij succes.
 */
export async function sendReminderForAppointment(appointmentId: number): Promise<boolean> {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { todo: { include: { customer: true } } },
  });
  if (!appointment) throw new Error("Afspraak niet gevonden");

  const customer = appointment.todo.customer;
  if (!customer.email) {
    throw new Error(`Klant ${customer.name} heeft geen e-mailadres`);
  }

  const settings = await getSettings();
  const vars = {
    naam: customer.name,
    datum: formatDate(appointment.startAt),
    uur: formatTime(appointment.startAt),
    werk: appointment.todo.title,
  };
  const subject = renderTemplate(settings.reminderEmailSubject, vars);
  const body = renderTemplate(settings.reminderEmailBody, vars);

  try {
    await sendMail(customer.email, subject, body);
    await db.$transaction([
      db.appointment.update({
        where: { id: appointment.id },
        data: { reminderSentAt: new Date(), reminderError: null },
      }),
      db.emailLog.create({
        data: {
          appointmentId: appointment.id,
          toAddress: customer.email,
          subject,
          status: "SENT",
        },
      }),
    ]);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.$transaction([
      db.appointment.update({
        where: { id: appointment.id },
        data: { reminderError: message.slice(0, 500) },
      }),
      db.emailLog.create({
        data: {
          appointmentId: appointment.id,
          toAddress: customer.email,
          subject,
          status: "FAILED",
          error: message.slice(0, 1000),
        },
      }),
    ]);
    return false;
  }
}

/** De eigenlijke cronjob: herinneringen voor alle afspraken van morgen. */
export async function runReminderJob(): Promise<ReminderRunResult> {
  const { start, end } = brusselsDayRangeUtc(1); // morgen (Brusselse dag)

  const candidates = await db.appointment.findMany({
    where: {
      startAt: { gte: start, lt: end },
      status: "PLANNED",
      reminderSentAt: null,
    },
    include: { todo: { include: { customer: { select: { email: true } } } } },
  });

  const result: ReminderRunResult = {
    candidates: candidates.length,
    sent: 0,
    failed: 0,
    skippedNoEmail: 0,
  };

  for (const appointment of candidates) {
    if (!appointment.todo.customer.email) {
      result.skippedNoEmail++;
      continue;
    }
    // Sequentieel versturen: vriendelijk voor de SMTP-provider.
    const ok = await sendReminderForAppointment(appointment.id).catch(() => false);
    if (ok) result.sent++;
    else result.failed++;
  }

  if (result.candidates > 0) {
    console.log(
      `✉ Reminder-job: ${result.sent} verstuurd, ${result.failed} mislukt, ` +
        `${result.skippedNoEmail} zonder e-mailadres (van ${result.candidates} kandidaten)`,
    );
  }
  return result;
}
