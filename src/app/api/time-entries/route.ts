import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, customer_id, task_id, project_id, start_time, end_time, duration, notes } = body;

    if (!user_id) return NextResponse.json({ error: "חסר user_id" }, { status: 400 });
    if (!start_time) return NextResponse.json({ error: "חסר start_time" }, { status: 400 });

    const { data, error } = await admin()
      .from("time_entries")
      .insert({
        user_id,
        customer_id: customer_id || null,
        task_id: task_id || null,
        project_id: project_id || null,
        start_time,
        end_time: end_time || new Date().toISOString(),
        duration: duration || 0,
        notes: notes || "",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[API time-entries] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.id });
  } catch (e: any) {
    console.error("[API time-entries] exception:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from    = searchParams.get("from");
    const to      = searchParams.get("to");
    const userId  = searchParams.get("user_id");
    const custId  = searchParams.get("customer_id");
    const role    = searchParams.get("role"); // "admin" | "employee"

    let q = admin()
      .from("time_entries")
      .select("*, customer:customers(id,company_name), task:tasks(id,title), project:projects(id,name), user:users!user_id(id,full_name)")
      .order("start_time", { ascending: false });

    if (from) q = q.gte("start_time", from);
    if (to)   q = q.lte("start_time", to);
    if (role === "employee" && userId) q = q.eq("user_id", userId);
    else if (userId && role !== "admin") q = q.eq("user_id", userId);
    if (custId) q = q.eq("customer_id", custId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const { error } = await admin().from("time_entries").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, customer_id, task_id, notes, start_time, end_time, duration } = body;
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const { error } = await admin().from("time_entries").update({
      customer_id: customer_id || null,
      task_id: task_id || null,
      notes: notes || "",
      start_time,
      end_time,
      duration,
    }).eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
