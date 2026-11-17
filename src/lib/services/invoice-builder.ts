import type { EfInvoiceItem } from "../ef/types";
import type { CompletionInput } from "../schemas/completions";
import { formatDateShort } from "../time";

/**
 * Bouwt de factuurregels voor EenvoudigFactureren uit een werkregistratie.
 *
 * Regels:
 * 1. eigen uren          → "Tuinwerken – <titel> (<datum>)" × uren × eigen tarief
 * 2. per medewerker      → "Medewerker <naam> – uren"
 * 3. per extra           → omschrijving × aantal × eenheidsprijs (snapshot prijslijst)
 *
 * EF-constraints die hier afgedwongen worden:
 * - quantity: max 2 decimalen
 * - unit: max 10 tekens
 * - tax_rate: 0, 6, 12 of 21 (moet in de btw-tarieven van het document passen)
 * - alle geldrekenwerk in centen (geen float-drift in het totaal)
 */

export interface BuiltInvoice {
  items: EfInvoiceItem[];
  totalExclVat: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function buildInvoiceLines(params: {
  completion: CompletionInput;
  workTitle: string;
  workDate: Date;
  ownHourlyRate: number;
  laborVatRate: number;
}): BuiltInvoice {
  const { completion, workTitle, workDate, ownHourlyRate, laborVatRate } = params;

  const items: EfInvoiceItem[] = [];
  let totalCents = 0;

  function addItem(description: string, quantity: number, unit: string, amount: number, taxRate: number) {
    const qty = round2(quantity);
    const unitPrice = round2(amount);
    if (unit.length > 10) {
      throw new Error(`Eenheid "${unit}" is langer dan 10 tekens (limiet EenvoudigFactureren)`);
    }
    if (![0, 6, 12, 21].includes(taxRate)) {
      throw new Error(`Ongeldig btw-tarief: ${taxRate}`);
    }
    items.push({
      type: "item",
      description: description.slice(0, 500),
      quantity: qty,
      unit,
      amount: unitPrice,
      tax_rate: taxRate,
    });
    totalCents += Math.round(qty * Math.round(unitPrice * 100));
  }

  // 1. Eigen uren
  addItem(
    `Tuinwerken – ${workTitle} (${formatDateShort(workDate)})`,
    completion.ownHours,
    "uur",
    ownHourlyRate,
    laborVatRate,
  );

  // 2. Medewerkers
  for (const worker of completion.workers) {
    addItem(`Medewerker ${worker.name} – uren`, worker.hours, "uur", worker.hourlyRate, laborVatRate);
  }

  // 3. Extra's
  for (const extra of completion.extras) {
    addItem(extra.description, extra.quantity, extra.unit, extra.unitPrice, extra.vatRate);
  }

  return { items, totalExclVat: totalCents / 100 };
}
