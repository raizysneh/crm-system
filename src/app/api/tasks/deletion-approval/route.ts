import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { verifyDeletionToken } from "@/lib/taskDeletionToken";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/tasks/deletion-approval?id=&token= — used by the confirmation
// page to show the task before the admin decides. Token-gated, no login.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const token = searchParams.get("token");
    if (!id || !token || !verifyDeletionToken(id, token)) {
      return NextResponse.json({ error: "קישור לא תקין" }, { status: 403 });
    }

    const { data: task } = await admin().from("tasks").select("id, title, pending_deletion").eq("id", id).single();
    if (!task) return NextResponse.json({ error: "המשימה כבר לא קיימת" }, { status: 404 });

    return NextResponse.json({ title: task.title, resolved: !task.pending_deletion });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/tasks/deletion-approval — { id, token, action: "approve" | "reject" }
export async function POST(req: NextRequest) {
  try {
    const { id, token, action } = await req.json();
    if (!id || !token || !verifyDeletionToken(id, token)) {
      return NextResponse.json({ error: "קישור לא תקין" }, { status: 403 });
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "פעולה לא תקינה" }, { status: 400 });
    }

    const db = admin();
    const { data: task } = await db.from("tasks").select("id, pending_deletion").eq("id", id).single();
    if (!task) return NextResponse.json({ error: "המשימה כבר לא קיימת" }, { status: 404 });
    if (!task.pending_deletion) return NextResponse.json({ error: "הבקשה כבר טופלה" }, { status: 409 });

    if (action === "reject") {
      await db.from("tasks").update({ pending_deletion: false }).eq("id", id);
      return NextResponse.json({ ok: true, action: "reject" });
    }

    // approve — same cleanup as the regular hard-delete path
    await db.from("subtasks").delete().eq("task_id", id);
    await db.from("time_entries").update({ task_id: null }).eq("task_id", id);
    const { error } = await db.from("tasks").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, action: "approve" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
