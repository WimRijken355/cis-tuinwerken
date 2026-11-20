import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, jsonError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { EfApiError, efIsConfigured } from "@/lib/ef/client";
import { LINKABLE_QUOTE_STATUSES, QUOTE_STATUS_LABELS } from "@/lib/ef/quotes";
import type { CustomerQuotesResponse } from "@/lib/schemas/quotes";
import { syncQuotesForClient } from "@/lib/services/quotes";

async function loadCustomer(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig klant-id", 400);
  const customer = await db.customer.findUnique({ where: { id }, select: { id: true, efClientId: true, isDemo: true } });
  if (!customer) throw new ApiError("Klant niet gevonden", 404);
  return customer;
}

/**
 * GET /api/customers/:id/quotes — the customer's quotes (mirrored from EF,
 * newest first) with their lines, which todos they are linked to and
 * whether they were invoiced already.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const customer = await loadCustomer(params);
    if (!customer.efClientId) {
      return NextResponse.json({ linkedToEf: false, quotes: [] } satisfies CustomerQuotesResponse);
    }
    const quotes = await db.efQuote.findMany({
      where: { efClientId: customer.efClientId },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { todoLinks: { select: { todoId: true, invoiceId: true } } },
        },
      },
    });
    const body: CustomerQuotesResponse = {
      linkedToEf: true,
      quotes: quotes.map((q) => ({
        id: q.id,
        efQuoteId: q.efQuoteId,
        number: q.number,
        reference: q.reference,
        date: q.date.toISOString().slice(0, 10),
        status: q.status,
        statusLabel: QUOTE_STATUS_LABELS[q.status] ?? q.status,
        linkable: (LINKABLE_QUOTE_STATUSES as readonly string[]).includes(q.status),
        totalExclVat: Number(q.totalExclVat),
        lines: q.lines.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: Number(l.quantity),
          unit: l.unit,
          amount: Number(l.amount),
          taxRate: Number(l.taxRate),
          linkedTodoIds: l.todoLinks.map((t) => t.todoId),
          invoiced: l.todoLinks.some((t) => t.invoiceId !== null),
        })),
      })),
    };
    return NextResponse.json(body);
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/customers/:id/quotes — fetch this customer's quotes from EF right now. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    if (!efIsConfigured()) {
      return jsonError("EenvoudigFactureren is nog niet geconfigureerd (zie .env).", 400);
    }
    const customer = await loadCustomer(params);
    if (customer.isDemo) throw new ApiError("Demoklanten hebben geen offertes in EenvoudigFactureren.", 409);
    if (!customer.efClientId) {
      throw new ApiError("Deze klant is nog niet gekoppeld aan EenvoudigFactureren.", 409);
    }
    const result = await syncQuotesForClient(customer.efClientId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EfApiError) return jsonError(`Offertes ophalen mislukt: ${error.message}`, 502);
    return handleApiError(error);
  }
}
