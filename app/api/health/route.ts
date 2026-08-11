import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Health / keep-alive endpoint.
 *
 * Runs one trivial read against Supabase so the database registers activity —
 * a Supabase free-tier project pauses after ~7 days idle, and a plain page load
 * may be served from cache without ever touching the DB. A scheduled ping to
 * this route (see .github/workflows/keepalive.yml) keeps the project warm.
 *
 * Public and read-only: it uses only the anon key + a HEAD count (no rows
 * returned), so it exposes nothing and needs no secret. `count: exact, head`
 * issues a real query against help_requests without transferring any data.
 */
export const dynamic = "force-dynamic"; // never cache — the point is to hit the DB

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "missing_env" },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(url, anonKey);
    const { error, count } = await supabase
      .from("help_requests")
      .select("id", { count: "exact", head: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "db_error" },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      db: "reachable",
      openRequestsSeen: count ?? 0,
      ts: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "unreachable" }, { status: 503 });
  }
}
