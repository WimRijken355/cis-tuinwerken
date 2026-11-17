import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { priceListItemInputSchema } from "@/lib/schemas/catalog";

/** GET /api/price-list?includeInactive=1 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";
    const items = await db.priceListItem.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(
      items.map((i) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        vatRate: Number(i.vatRate),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/price-list — nieuw prijslijst-item (machine, afvoer, ...). */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = priceListItemInputSchema.parse(await request.json());
    const item = await db.priceListItem.create({ data: input });
    return NextResponse.json(
      { ...item, unitPrice: Number(item.unitPrice), vatRate: Number(item.vatRate) },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
