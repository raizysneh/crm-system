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

// Same lookup /api/portal uses: customer_id column on the user row first,
// falling back to matching the customer's email.
async function findOwnCustomerId(db: ReturnType<typeof admin>, userId: string): Promise<string | null> {
  // select("*") — not an explicit column list — since customer_id isn't a
  // guaranteed column on users (mirrors the same fallback in /api/portal)
  const { data: user } = await db.from("users").select("*").eq("id", userId).single();
  if (!user) return null;
  if ((user as any).customer_id) return (user as any).customer_id;
  if (user.email) {
    const { data: customer } = await db.from("customers").select("id").eq("email", user.email).maybeSingle();
    if (customer) return customer.id;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

    const body = await req.json();
    const { title, description, category, file_url, file_type } = body;
    if (!title?.trim()) return NextResponse.json({ error: "חסרה כותרת" }, { status: 400 });

    const db = admin();
    let customer_id: string | null = body.customer_id || null;

    if (authedUser.role === "client") {
      // A client can only ever upload against their own linked customer record.
      customer_id = await findOwnCustomerId(db, authedUser.id);
      if (!customer_id) return NextResponse.json({ error: "החשבון שלך לא מקושר ללקוח" }, { status: 400 });
    }

    const { data, error } = await db.from("documents").insert({
      title: title.trim(),
      description: description || null,
      category: category || "other",
      file_url: file_url || null,
      file_type: file_type || null,
      customer_id,
      created_by: authedUser.id,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const db = admin();
    if (authedUser.role !== "admin") {
      const { data: existing } = await db.from("documents").select("created_by").eq("id", id).single();
      if (!existing || existing.created_by !== authedUser.id) {
        return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
      }
    }

    const { error } = await db.from("documents").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
