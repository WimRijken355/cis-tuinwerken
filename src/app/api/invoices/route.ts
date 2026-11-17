import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/** GET /api/invoices?status= — overzicht met pushstatus naar EenvoudigFactureren. */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const status = request.nextUrl.searchParams.get("status");

    const invoices = await db.invoice.findMany({
      where: status
        ? { pushStatus: status as Prisma.InvoiceWhereInput["pushStatus"] }
        : undefined,
      include: {
        customer: { select: { name: true } },
        completion: {
          select: {
            completedAt: true,
            appointment: { select: { todo: { select: { title: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json(
      invoices.map((inv) => ({
        id: inv.id,
        customerId: inv.customerId,
        customerName: inv.customer.name,
        efInvoiceId: inv.efInvoiceId,
        pushStatus: inv.pushStatus,
        totalExclVat: Number(inv.totalExclVat),
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
