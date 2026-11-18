import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { toSkipTake } from "@/lib/pagination";
import {
  buildResourceWhere,
  resourceInputSchema,
  resourceListQuerySchema,
  type ResourceListResponse,
} from "@/lib/schemas/resources";

type ResourceRow = Awaited<ReturnType<typeof db.resource.findMany>>[number];
const toDto = (r: ResourceRow) => ({ ...r, hourlyRate: Number(r.hourlyRate) });

/**
 * GET /api/resources
 * - with `page` (Resources page): paginated + filtered,
 *   `?page=&pageSize=&name=&type=PERSON|MACHINE&status=active|inactive|all`
 * - without `page` (picklists): plain array, active only unless
 *   `?includeInactive=1`; `?type=PERSON|MACHINE` narrows it down.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const params = request.nextUrl.searchParams;
    const query = resourceListQuerySchema.parse(Object.fromEntries(params));

    if (params.has("page")) {
      const where = buildResourceWhere(query);
      const [rows, total] = await Promise.all([
        db.resource.findMany({
          where,
          orderBy: [{ type: "asc" }, { name: "asc" }, { id: "asc" }],
          ...toSkipTake(query),
        }),
        db.resource.count({ where }),
      ]);
      const response: ResourceListResponse = {
        items: rows.map(toDto),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
      return NextResponse.json(response);
    }

    const includeInactive = params.get("includeInactive") === "1";
    const rows = await db.resource.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(rows.map(toDto));
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/resources — new person or machine. */
export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const input = resourceInputSchema.parse(await request.json());
    const resource = await db.resource.create({ data: input });
    return NextResponse.json(toDto(resource), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
