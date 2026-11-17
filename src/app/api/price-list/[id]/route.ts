import { type NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { priceListItemInputSchema } from "@/lib/schemas/catalog";

async function parseId(params: Promise<{ id: string }>): Promise<number> {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Ongeldig id", 400);
  return id;
}

/** PATCH /api/price-list/:id */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    const input = priceListItemInputSchema.partial().parse(await request.json());
    const item = await db.priceListItem.update({ where: { id }, data: input });
    return NextResponse.json({
      ...item,
      unitPrice: Number(item.unitPrice),
      vatRate: Number(item.vatRate),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/price-list/:id — veilig: aangerekende extra's zijn snapshots,
 * dus bestaande registraties/facturen veranderen niet.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = await parseId(params);
    await db.priceListItem.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
