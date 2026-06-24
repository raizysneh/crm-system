import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phones, ...customerData } = body;

    const { data: customer, error } = await admin()
      .from("customers")
      .insert({ ...customerData, status: "active" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (phones?.length) {
      const validPhones = phones.filter((p: any) => p.phone?.trim());
      if (validPhones.length > 0) {
        await admin().from("customer_phones").insert(
          validPhones.map((p: any) => ({ customer_id: customer.id, phone: p.phone, label: p.label || null }))
        );
      }
    }

    return NextResponse.json({ data: customer });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, phones, ...customerData } = body;
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const { error } = await admin().from("customers").update(customerData).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Replace phones
    if (phones !== undefined) {
      await admin().from("customer_phones").delete().eq("customer_id", id);
      const validPhones = (phones || []).filter((p: any) => p.phone?.trim());
      if (validPhones.length > 0) {
        await admin().from("customer_phones").insert(
          validPhones.map((p: any) => ({ customer_id: id, phone: p.phone, label: p.label || null }))
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const { error } = await admin().from("customers").update({ status: "inactive" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
