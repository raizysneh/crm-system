import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/supabase/authServer";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

    const body = await req.json();
    const { conversation_id, content, message_type, reply_to } = body;
    if (!conversation_id || !content)
      return NextResponse.json({ error: "חסרים שדות חובה" }, { status: 400 });

    const admin = getAdminClient();
    // DB only allows 'text' / 'voice' — store gif/image as "text" with __IMG__ prefix
    const safeType = (message_type === "gif" || message_type === "image") ? "text" : (message_type || "text");
    const safeContent = (message_type === "gif" || message_type === "image") ? `__IMG__${content}` : content;

    // sender_id is always the verified caller — never trust the client to say who's speaking
    const { data, error } = await admin
      .from("chat_messages")
      .insert({ conversation_id, sender_id: authedUser.id, content: safeContent, message_type: safeType, reply_to: reply_to || null })
      .select("*, sender:users(id, full_name, avatar_url)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Bump conversation updated_at
    await admin.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation_id);

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

    const body = await req.json();
    const { id, content, is_pinned } = body;
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const admin = getAdminClient();

    // Editing content is limited to the message's own sender; pinning (is_pinned-only
    // calls) is a moderation action anyone in the conversation can do.
    if (content !== undefined && authedUser.role !== "admin") {
      const { data: existing } = await admin.from("chat_messages").select("sender_id").eq("id", id).single();
      if (!existing || existing.sender_id !== authedUser.id) {
        return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
      }
    }

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
    const authedUser = await getAuthedUser(req);
    if (!authedUser) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const admin = getAdminClient();
    if (authedUser.role !== "admin") {
      const { data: existing } = await admin.from("chat_messages").select("sender_id").eq("id", id).single();
      if (!existing || existing.sender_id !== authedUser.id) {
        return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
      }
    }

    const { error } = await admin.from("chat_messages").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
