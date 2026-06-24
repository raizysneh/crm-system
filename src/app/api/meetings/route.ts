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
    const from = searchParams.get("from");
    const to   = searchParams.get("to");

    let q = admin()
      .from("meetings")
      .select("*, customer:customers(id,company_name), participants:meeting_participants(user:users(id,full_name))")
      .order("start_time");

    if (from) q = q.gte("start_time", from);
    if (to)   q = q.lte("start_time", to);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, customer_id, start_time, end_time, location, meeting_link, notes, description, participant_ids, created_by } = body;

    const { data, error } = await admin().from("meetings").insert({
      title, customer_id: customer_id || null, start_time, end_time,
      location: location || null, meeting_link: meeting_link || null,
      notes: notes || null, description: description || null,
      created_by: created_by || null,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (participant_ids?.length && data) {
      await admin().from("meeting_participants").insert(
        participant_ids.map((uid: string) => ({ meeting_id: data.id, user_id: uid }))
      );
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, participant_ids, ...fields } = body;
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const { error } = await admin().from("meetings").update(fields).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (participant_ids) {
      await admin().from("meeting_participants").delete().eq("meeting_id", id);
      if (participant_ids.length) {
        await admin().from("meeting_participants").insert(
          participant_ids.map((uid: string) => ({ meeting_id: id, user_id: uid }))
        );
      }
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

    await admin().from("meeting_participants").delete().eq("meeting_id", id);
    const { error } = await admin().from("meetings").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
