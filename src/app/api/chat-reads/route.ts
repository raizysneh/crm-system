import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// POST — mark all messages in a conversation as read for a user
export async function POST(req: NextRequest) {
  try {
    const { conversation_id, user_id } = await req.json();
    if (!conversation_id || !user_id) return NextResponse.json({ error: "חסרים פרמטרים" }, { status: 400 });

    // Get all message IDs in this conversation (not sent by this user)
    const { data: msgs } = await admin()
      .from("chat_messages")
      .select("id")
      .eq("conversation_id", conversation_id)
      .neq("sender_id", user_id);

    if (!msgs?.length) return NextResponse.json({ ok: true });

    // Upsert read records (ignore duplicates)
    await admin()
      .from("chat_message_reads")
      .upsert(
        msgs.map(m => ({ message_id: m.id, user_id })),
        { onConflict: "message_id,user_id", ignoreDuplicates: true }
      );

    return NextResponse.json({ ok: true, marked: msgs.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — get read receipts for given message IDs
export async function GET(req: NextRequest) {
  try {
    const ids = req.nextUrl.searchParams.get("ids");
    if (!ids) return NextResponse.json({ data: [] });

    const messageIds = ids.split(",").filter(Boolean);
    const { data, error } = await admin()
      .from("chat_message_reads")
      .select("message_id, user_id")
      .in("message_id", messageIds);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
