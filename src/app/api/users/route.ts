import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY חסר ב-.env.local");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.from("users").select("*").order("full_name");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, full_name, role, phone } = body;

    const admin = getAdminClient();

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: password || "Temp123456!",
      user_metadata: { full_name, role },
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (authData.user) {
      const { error: dbError } = await admin.from("users").insert({
        id: authData.user.id,
        full_name,
        email,
        role: role || "employee",
        phone: phone || null,
        status: "active",
      });

      if (dbError) {
        // Rollback auth user if DB insert failed
        await admin.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json({ error: dbError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ user: authData.user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, full_name, role, phone, password } = body;

    const admin = getAdminClient();

    const { error: dbError } = await admin.from("users").update({
      full_name,
      role,
      phone: phone || null,
    }).eq("id", id);

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 });

    if (password) {
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר מזהה משתמש" }, { status: 400 });

    const admin = getAdminClient();
    await admin.from("users").update({ status: "inactive" }).eq("id", id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
