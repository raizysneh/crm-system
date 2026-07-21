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

async function requireStaff(req: NextRequest) {
  const authedUser = await getAuthedUser(req);
  return authedUser && authedUser.role !== "client" ? authedUser : null;
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireStaff(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const body = await req.json();
    const { data, error } = await admin().from("subtasks").insert(body).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireStaff(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const { error } = await admin().from("subtasks").update(fields).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await requireStaff(req))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const { error } = await admin().from("subtasks").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
