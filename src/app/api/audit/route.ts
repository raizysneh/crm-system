import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/supabase/authServer";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/audit?page=1&limit=50&user_id=&entity_type=&from=&to=
export async function GET(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser || authedUser.role !== "admin") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const page       = parseInt(searchParams.get("page") || "1");
    const limit      = parseInt(searchParams.get("limit") || "50");
    const userId     = searchParams.get("user_id");
    const entityType = searchParams.get("entity_type");
    const from       = searchParams.get("from");
    const to         = searchParams.get("to");

    const db = admin();
    let q = db
      .from("audit_logs")
      .select("*, user:users(id, full_name, email)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (userId)     q = q.eq("user_id", userId);
    if (entityType) q = q.eq("entity_type", entityType);
    if (from)       q = q.gte("created_at", from);
    if (to)         q = q.lte("created_at", to + "T23:59:59");

    const { data, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data, total: count || 0, page, limit });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/audit — log an action
export async function POST(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser || authedUser.role === "client") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const body = await req.json();
    const { action, entity_type, entity_id, old_value, new_value } = body;
    if (!action || !entity_type) {
      return NextResponse.json({ error: "חסרים שדות חובה" }, { status: 400 });
    }
    const db = admin();
    // Never trust a client-supplied user_id for an audit trail — use the verified caller.
    const { data, error } = await db.from("audit_logs").insert({
      user_id: authedUser.id, action, entity_type, entity_id: entity_id || null,
      old_value: old_value || null, new_value: new_value || null,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
