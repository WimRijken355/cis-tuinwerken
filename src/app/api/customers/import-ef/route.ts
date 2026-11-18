import { NextResponse } from "next/server";
import { handleApiError, jsonError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { EfApiError, efIsConfigured, listAllClients } from "@/lib/ef/client";

/** Btw-nummers vergelijkbaar maken: "BE 0123.456.789" → "BE0123456789". */
function normalizeVat(vat: string | null | undefined): string | null {
  const cleaned = vat?.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return cleaned || null;
}

/**
 * POST /api/customers/import-ef
 *
 * Eenmalige (herhaalbare) import van bestaande klanten uit EenvoudigFactureren:
 * - al gekoppeld (efClientId bekend)           → overslaan
 * - zelfde btw-nummer of zelfde naam (case-insensitief) → koppelen + lege velden aanvullen
 * - onbekend                                    → nieuwe klant aanmaken
 *
 * Idempotent: nogmaals draaien maakt geen duplicaten.
 */
export async function POST() {
  try {
    await requireUser();
    if (!efIsConfigured()) {
      return jsonError(
        "EenvoudigFactureren is nog niet geconfigureerd. Vul EF_API_KEY (of EF_BASIC_USER/EF_BASIC_PASS) in je .env in.",
        400,
      );
    }

    const efClients = await listAllClients();
    // Demo customers never take part: a demo name that happens to match a real
    // EF client must not get linked to it.
    const existing = await db.customer.findMany({ where: { isDemo: false } });

    const byEfId = new Map(existing.filter((c) => c.efClientId).map((c) => [c.efClientId, c]));
    const byVat = new Map(
      existing
        .map((c) => [normalizeVat(c.vatNumber), c] as const)
        .filter(([vat]) => vat !== null),
    );
    const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));

    let created = 0;
    let linked = 0;
    let skipped = 0;

    for (const ef of efClients) {
      if (byEfId.has(ef.client_id)) {
        skipped++;
        continue;
      }

      const match =
        byVat.get(normalizeVat(ef.tax_code)) ?? byName.get(ef.name.trim().toLowerCase());

      if (match && !match.efClientId) {
        // Koppelen en alleen lége velden aanvullen — lokale data blijft leidend.
        await db.customer.update({
          where: { id: match.id },
          data: {
            efClientId: ef.client_id,
            email: match.email ?? ef.email_address ?? undefined,
            phone: match.phone ?? ef.phone_number ?? undefined,
            street: match.street ?? ef.street ?? undefined,
            postalCode: match.postalCode ?? ef.postal_code ?? undefined,
            city: match.city ?? ef.city ?? undefined,
            vatNumber: match.vatNumber ?? ef.tax_code ?? undefined,
          },
        });
        linked++;
      } else if (!match) {
        await db.customer.create({
          data: {
            name: ef.name,
            efClientId: ef.client_id,
            email: ef.email_address ?? null,
            phone: ef.phone_number ?? null,
            street: ef.street ?? null,
            postalCode: ef.postal_code ?? null,
            city: ef.city ?? null,
            countryCode: ef.country_code ?? "BE",
            vatNumber: ef.tax_code ?? null,
          },
        });
        created++;
      } else {
        // Naam/btw matcht maar die klant is al aan een ándere EF-klant gekoppeld.
        skipped++;
      }
    }

    return NextResponse.json({
      totalInEf: efClients.length,
      created,
      linked,
      skipped,
    });
  } catch (error) {
    if (error instanceof EfApiError) {
      return jsonError(
        `Import mislukt: ${error.message}. Antwoord: ${error.responseBody.slice(0, 300)}`,
        502,
      );
    }
    return handleApiError(error);
  }
}
