import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { toSkipTake } from "@/lib/pagination";
import {
  buildPriceListWhere,
  priceListItemInputSchema,
  priceListQuerySchema,
  type PriceListResponse,
} from "@/lib/schemas/catalog";

type PriceListRow = Awaited<ReturnType<typeof db.priceListItem.findMany>>[number];

function toDto(item: PriceListRow) {
  return { ...item, unitPrice: Number(item.unitPrice), vatRate: Number(item.vatRate) };
}

/**
 * GET /api/price-list
 * - with `page` (Artikels page): paginated + filtered,
 *   `?page=&pageSize=&name=&vatRate=&status=active|inactive|all&source=ef|manual|all`
 * - without `page` (registration flow picklist): plain array, active items
 *   only unless `?includeInactive=1`.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const params = request.nextUrl.searchParams;

    if (params.has("page")) {
      const query = priceListQuerySchema.parse(Object.fromEntries(params));
      const where = buildPriceListWhere(query);
      const [items, total] = await Promise.all([
        db.priceListItem.findMany({
          where,
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
          ...toSkipTake(query),
        }),
        db.priceListItem.count({ where }),
      ]);
      const response: PriceListResponse = {
        items: items.map(toDto),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
      return NextResponse.json(response);
    }

    const includeInactive = params.get("includeInactive") === "1";
    const items = await db.priceListItem.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(items.map(toDto));
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/price-list — new price-list item (machine, disposal, ...). */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = priceListItemInputSchema.parse(await request.json());
    const item = await db.priceListItem.create({ data: input });
    return NextResponse.json(toDto(item), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
