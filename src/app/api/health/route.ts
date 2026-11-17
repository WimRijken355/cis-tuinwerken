import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Healthcheck voor Docker/Caddy: app bereikbaar + database bereikbaar. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unreachable" },
      { status: 503 },
    );
  }
}
