import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config";

/**
 * E-mailverzending via SMTP (provider-onafhankelijk; gestart met Brevo).
 *
 * In development zonder SMTP-configuratie valt de mailer terug op een
 * "jsonTransport": de mail wordt niet echt verstuurd maar naar de console
 * gelogd. Zo is de reminder-flow lokaal end-to-end testbaar.
 * In productie zonder configuratie faalt verzenden met een duidelijke fout.
 */

export function isMailConfigured(): boolean {
  const c = config();
  return Boolean(c.SMTP_HOST && c.SMTP_PORT && c.SMTP_USER && c.SMTP_PASS && c.MAIL_FROM);
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const c = config();
  if (isMailConfigured()) {
    transporter = nodemailer.createTransport({
      host: c.SMTP_HOST,
      port: c.SMTP_PORT,
      secure: c.SMTP_PORT === 465, // 587 = STARTTLS
      auth: { user: c.SMTP_USER, pass: c.SMTP_PASS },
    });
  } else if (process.env.NODE_ENV !== "production") {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    throw new Error(
      "E-mail is niet geconfigureerd: vul SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM in.",
    );
  }
  return transporter;
}

/** Verstuurt een platte-tekstmail. Gooit bij falen (afzender logt zelf). */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const from = config().MAIL_FROM ?? "Tuinwerken Cis <dev@localhost>";
  const result = await getTransporter().sendMail({ from, to, subject, text });

  if (!isMailConfigured()) {
    console.log(`📧 [dev-mail] aan ${to}: ${subject}\n${text}\n`, result.message?.toString?.() ?? "");
  }
}
