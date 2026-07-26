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

// DELETE /api/chat-conversations?id=... — admin only. Wipes the conversation
// and everything hanging off it (messages, participants, reactions, reads).
export async function DELETE(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser || authedUser.role !== "admin") {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const db = admin();

    // chat_participants / chat_messages / chat_reactions all cascade from
    // chat_conversations via FK — but chat_message_reads was added outside
    // schema.sql and its cascade isn't guaranteed, so clear it explicitly.
    const { data: msgs } = await db.from("chat_messages").select("id").eq("conversation_id", id);
    const msgIds = (msgs || []).map(m => m.id);
    if (msgIds.length) {
      await db.from("chat_message_reads").delete().in("message_id", msgIds);
    }

    const { error } = await db.from("chat_conversations").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
