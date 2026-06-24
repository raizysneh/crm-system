import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId   = searchParams.get("user_id");
    const role     = searchParams.get("role");
    const status   = searchParams.get("status");
    const priority = searchParams.get("priority");
    const custId   = searchParams.get("customer_id");

    let q = admin()
      .from("tasks")
      .select(`*, customer:customers(id,company_name,logo_url), project:projects(id,name), assigned_user:users!assigned_user_id(id,full_name), subtasks(id,completed)`)
      .order("created_at", { ascending: false });

    if (role === "employee" && userId) q = q.eq("assigned_user_id", userId);
    if (status)   q = q.eq("status", status);
    if (priority) q = q.eq("priority", priority);
    if (custId)   q = q.eq("customer_id", custId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subtasks, ...taskData } = body;

    const { data: task, error } = await admin()
      .from("tasks")
      .insert(taskData)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (subtasks?.length) {
      const rows = subtasks
        .filter((s: any) => s.title?.trim())
        .map((s: any, i: number) => ({ task_id: task.id, title: s.title, completed: false, sort_order: i }));
      if (rows.length > 0) await admin().from("subtasks").insert(rows);
    }

    return NextResponse.json({ data: task });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...taskData } = body;
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const { error } = await admin().from("tasks").update(taskData).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
