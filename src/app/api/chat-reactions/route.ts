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

// POST — add reaction (upsert-style: ignore if already exists)
export async function POST(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

    const { message_id, emoji } = await req.json();
    if (!message_id || !emoji)
      return NextResponse.json({ error: "חסרים פרמטרים" }, { status: 400 });

    const { data, error } = await admin()
      .from("chat_reactions")
      .insert({ message_id, user_id: authedUser.id, emoji })
      .select()
      .single();

    if (error) {
      // duplicate (user already reacted with same emoji) → not an error
      if (error.code === "23505") return NextResponse.json({ duplicate: true });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — remove reaction by id
export async function DELETE(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const db = admin();
    if (authedUser.role !== "admin") {
      const { data: existing } = await db.from("chat_reactions").select("user_id").eq("id", id).single();
      if (!existing || existing.user_id !== authedUser.id) {
        return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
      }
    }

    const { error } = await db.from("chat_reactions").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
