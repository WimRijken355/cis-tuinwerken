import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, jsonError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import {
  createClient,
  EfApiError,
  efIsConfigured,
  updateClientPartial,
} from "@/lib/ef/client";
import type { EfClientInput } from "@/lib/ef/types";
import type { Customer } from "@/generated/prisma/client";

/** Lokale klant → EF-payload (app is master). */
function toEfInput(customer: Customer): EfClientInput {
  return {
    name: customer.name,
    street: customer.street ?? undefined,
    postal_code: customer.postalCode ?? undefined,
    city: customer.city ?? undefined,
    country_code: customer.countryCode,
    tax_code: customer.vatNumber ?? undefined,
    email_address: customer.email ?? undefined,
    phone_number: customer.phone ?? undefined,
    external_client_id: String(customer.id),
  };
}

/**
 * POST /api/customers/:id/push-ef
 * Maakt de klant aan in EenvoudigFactureren (of werkt hem daar bij) en
 * bewaart de koppeling. Wordt ook automatisch gebruikt vóór de factuurpush.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    if (!efIsConfigured()) {
      return jsonError("EenvoudigFactureren is nog niet geconfigureerd (zie .env).", 400);
    }

    const id = Number((await params).id);
    const customer = await db.customer.findUnique({ where: { id } });
    if (!customer) throw new ApiError("Klant niet gevonden", 404);
    if (customer.isDemo) {
      throw new ApiError("Demoklanten worden nooit naar EenvoudigFactureren gestuurd.", 409);
    }

    if (customer.efClientId) {
      await updateClientPartial(customer.efClientId, toEfInput(customer));
      return NextResponse.json({ efClientId: customer.efClientId, updated: true });
    }

    const efClientId = await createClient(toEfInput(customer));
    await db.customer.update({ where: { id }, data: { efClientId } });
    return NextResponse.json({ efClientId, created: true });
  } catch (error) {
    if (error instanceof EfApiError) {
      return jsonError(`EF-push mislukt: ${error.message}`, 502);
    }
    return handleApiError(error);
  }
}
