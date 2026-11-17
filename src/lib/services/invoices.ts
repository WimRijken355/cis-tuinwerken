import { db } from "../db";
import { createClient, createInvoice, EfApiError, efIsConfigured } from "../ef/client";
import type { EfInvoiceItem } from "../ef/types";
import { nowBrussels } from "../time";
import { getSettings } from "./settings";

/**
 * Push van een lokale factuur naar EenvoudigFactureren als CONCEPT.
 *
 * Ontwerpprincipes:
 * - De registratie zelf is al lokaal gecommit vóór deze functie draait:
 *   een EF-storing blokkeert de mobiele flow nooit.
 * - Nooit dubbele concepten: pushen kan alleen zolang efInvoiceId leeg is.
 * - Een klant zonder EF-koppeling wordt eerst aangemaakt in EF.
 */
export async function pushInvoiceToEf(invoiceId: number): Promise<{
  ok: boolean;
  efInvoiceId?: number;
  error?: string;
}> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { customer: true },
  });
  if (!invoice) throw new Error("Factuur niet gevonden");
  if (invoice.efInvoiceId) {
    return { ok: true, efInvoiceId: invoice.efInvoiceId }; // al gepusht
  }

  async function markFailed(message: string) {
    await db.invoice.update({
      where: { id: invoiceId },
      data: { pushStatus: "FAILED", errorMessage: message.slice(0, 1000) },
    });
  }

  if (!efIsConfigured()) {
    const message =
      "EenvoudigFactureren is niet geconfigureerd (EF_API_KEY in .env). De factuur staat lokaal klaar; push hem opnieuw via Facturen zodra de koppeling werkt.";
    await markFailed(message);
    return { ok: false, error: message };
  }

  try {
    // 1. Klant in EF garanderen
    let efClientId = invoice.customer.efClientId;
    if (!efClientId) {
      efClientId = await createClient({
        name: invoice.customer.name,
        street: invoice.customer.street ?? undefined,
        postal_code: invoice.customer.postalCode ?? undefined,
        city: invoice.customer.city ?? undefined,
        country_code: invoice.customer.countryCode,
        tax_code: invoice.customer.vatNumber ?? undefined,
        email_address: invoice.customer.email ?? undefined,
        phone_number: invoice.customer.phone ?? undefined,
        external_client_id: String(invoice.customer.id),
      });
      await db.customer.update({
        where: { id: invoice.customer.id },
        data: { efClientId },
      });
    }

    // 2. Conceptfactuur aanmaken
    const settings = await getSettings();
    const efInvoiceId = await createInvoice({
      client_id: efClientId,
      status: "concept",
      date: nowBrussels().toFormat("yyyy-MM-dd"),
      days_due: settings.invoiceDaysDue,
      currency: "EUR",
      language: "nl",
      tax_included: "no",
      items: invoice.linesJson as unknown as EfInvoiceItem[],
    });

    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        pushStatus: "CONCEPT_CREATED",
        efInvoiceId,
        pushedAt: new Date(),
        errorMessage: null,
      },
    });
    return { ok: true, efInvoiceId };
  } catch (error) {
    const message =
      error instanceof EfApiError
        ? `${error.message}${error.responseBody ? ` — ${error.responseBody.slice(0, 300)}` : ""}`
        : error instanceof Error
          ? error.message
          : String(error);
    await markFailed(message);
    return { ok: false, error: message };
  }
}
