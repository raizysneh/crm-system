import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  try {
    const { data, error } = await getAdminClient().from("users").select("*").order("full_name");
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

    // Check if the email already has a public.users row
    const { data: existingRow } = await admin.from("users").select("id").eq("email", email).maybeSingle();
    if (existingRow) {
      return NextResponse.json({ error: "משתמש עם מייל זה כבר קיים במערכת" }, { status: 400 });
    }

    // Try to create in Supabase Auth
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: password || "Temp123456!",
      email_confirm: true, // auto-confirm — no email verification needed
    });

    let authUserId: string;

    if (authError) {
      // If auth user already exists (from a previous failed attempt), recover it
      if (authError.message.includes("already been registered") || authError.message.includes("already registered")) {
        // Find existing auth user by listing and filtering
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const existing = list?.users?.find(u => u.email === email);
        if (!existing) return NextResponse.json({ error: authError.message }, { status: 400 });
        authUserId = existing.id;
        // Update password if provided
        if (password) {
          await admin.auth.admin.updateUserById(authUserId, { password });
        }
      } else {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }
    } else {
      authUserId = authData.user.id;
    }

    // Insert into public.users
    const { error: dbError } = await admin.from("users").insert({
      id: authUserId,
      full_name,
      email,
      role: role || "employee",
      phone: phone || null,
      status: "active",
    });

    if (dbError) {
      // Only rollback if we just created the auth user (not recovered)
      if (!authError) await admin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, full_name, role, phone, password, send_invite, email, status } = body;
    const admin = getAdminClient();

    // Send password-reset / invite email
    if (send_invite && email) {
      const { error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || ""}/login` },
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const updateData: any = { full_name, role, phone: phone || null };
    if (status !== undefined) updateData.status = status;
    const { error: dbError } = await admin.from("users").update(updateData).eq("id", id);

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 });

    if (password) {
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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

    await getAdminClient().from("users").update({ status: "inactive" }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
