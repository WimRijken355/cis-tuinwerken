import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { EfInvoiceItem } from "@/lib/ef/types";
import { vatSummary } from "@/lib/invoice-content";

/** GET /api/invoices?status=&customerId= — overzicht met pushstatus naar EenvoudigFactureren. */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const status = request.nextUrl.searchParams.get("status");
    const customerId = Number(request.nextUrl.searchParams.get("customerId")) || null;

    const invoices = await db.invoice.findMany({
      where: {
        ...(status ? { pushStatus: status as Prisma.InvoiceWhereInput["pushStatus"] } : {}),
        // One customer (customer page → Facturen): all of them, not just the latest 200 overall.
        ...(customerId ? { customerId } : {}),
      },
      include: {
        customer: { select: { name: true, isDemo: true } },
        completion: {
          select: {
            completedAt: true,
            appointment: { select: { todo: { select: { title: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: customerId ? undefined : 200,
    });

    return NextResponse.json(
      invoices.map((inv) => ({
        id: inv.id,
        customerId: inv.customerId,
        customerName: inv.customer.name,
        customerIsDemo: inv.customer.isDemo,
        syncExcluded: inv.syncExcluded,
        efInvoiceId: inv.efInvoiceId,
        pushStatus: inv.pushStatus,
        totalExclVat: Number(inv.totalExclVat),
        totalInclVat: vatSummary(inv.linesJson as unknown as EfInvoiceItem[]).inclVat,
        errorMessage: inv.errorMessage,
        createdAt: inv.createdAt.toISOString(),
        pushedAt: inv.pushedAt?.toISOString() ?? null,
        workTitle: inv.completion.appointment.todo.title,
        workDate: inv.completion.completedAt.toISOString(),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
