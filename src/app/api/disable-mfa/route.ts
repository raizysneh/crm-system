import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Called from the login page's MFA-blocked screen, so there's no session yet.
// The caller must instead prove they know the account's password — otherwise
// anyone could strip 2FA off any account just by knowing its email address.
function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "חסרים פרטי התחברות" }, { status: 400 });

    const { error: pwError } = await anonClient().auth.signInWithPassword({ email, password });
    if (pwError) return NextResponse.json({ error: "מייל או סיסמה שגויים" }, { status: 401 });

    const { data: listData, error: listErr } = await admin().auth.admin.listUsers();
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const user = listData.users.find((u: any) => u.email === email);
    if (!user) return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });

    // Delete all enrolled MFA factors via Supabase REST API
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // List factors
    const factorsRes = await fetch(`${baseUrl}/auth/v1/admin/users/${user.id}/factors`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    });

    if (!factorsRes.ok) {
      // If endpoint doesn't exist, fall back to updating user to clear phone
      await admin().auth.admin.updateUserById(user.id, { phone: "" } as any);
      return NextResponse.json({ ok: true, message: "טלפון הוסר" });
    }

    const factors: { id: string; factor_type: string }[] = await factorsRes.json();

    // Delete each factor
    for (const factor of factors) {
      await fetch(`${baseUrl}/auth/v1/admin/users/${user.id}/factors/${factor.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      });
    }

    return NextResponse.json({ ok: true, removed: factors.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
