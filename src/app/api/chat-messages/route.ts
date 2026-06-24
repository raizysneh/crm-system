import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, content, is_pinned } = body;
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const admin = getAdminClient();

    if (content !== undefined) {
      const update: any = { content };
      // Try to set is_edited if the column exists — ignore error if not
      const { error } = await admin.from("chat_messages").update({ ...update, is_edited: true }).eq("id", id);
      if (error) {
        // Column may not exist — try without it
        const { error: e2 } = await admin.from("chat_messages").update(update).eq("id", id);
        if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
      }
    }

    if (is_pinned !== undefined) {
      const { error } = await admin.from("chat_messages").update({ is_pinned }).eq("id", id);
      // Non-fatal — column may not exist yet
      if (error) console.warn("is_pinned column missing:", error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const { error } = await getAdminClient().from("chat_messages").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
