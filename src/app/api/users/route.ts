import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";
import { getAuthedUser } from "@/lib/supabase/authServer";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

    const { data, error } = await getAdminClient().from("users").select("*").order("full_name");
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Two legitimate callers: (1) the public self-registration form on the
    // login page — no session yet, always creates a plain "employee" account;
    // (2) an admin creating a user from Settings, who may pick any role.
    // Anyone already logged in as employee/client is neither — reject.
    const authedUser = await getAuthedUser(req);
    if (authedUser && authedUser.role !== "admin") {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }
    const isAdminCaller = authedUser?.role === "admin";

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

    // Insert into public.users — only an authenticated admin may choose the role
    const { error: dbError } = await admin.from("users").insert({
      id: authUserId,
      full_name,
      email,
      role: isAdminCaller ? (role || "employee") : "employee",
      phone: phone || null,
      status: "active",
    });

    if (dbError) {
      // Only rollback if we just created the auth user (not recovered)
      if (!authError) await admin.auth.admin.deleteUser(authUserId);
      return NextResponse.json({ error: dbError.message }, { status: 400 });
    }

    // Send welcome email with login credentials (non-fatal)
    let emailError: string | null = null;
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const usedPassword = password || "Temp123456!";
      await sendMail({
        to: email,
        subject: "ברוכים הבאים למערכת CRM – פרטי כניסה",
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc;border-radius:12px;">
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:#16a34a;border-radius:16px;margin-bottom:12px;">
                <span style="color:white;font-size:28px;">🏢</span>
              </div>
              <h1 style="color:#0f172a;margin:0;font-size:22px;">ברוכים הבאים למערכת CRM</h1>
            </div>
            <p style="color:#374151;text-align:center;">שלום ${full_name}, נוצר עבורך חשבון במערכת הניהול.</p>
            <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin:20px 0;">
              <p style="margin:0 0 10px;color:#374151;font-weight:600;">פרטי כניסה:</p>
              <p style="margin:4px 0;color:#374151;">📧 <strong>מייל:</strong> ${email}</p>
              <p style="margin:4px 0;color:#374151;">🔑 <strong>סיסמה:</strong> ${usedPassword}</p>
            </div>
            <div style="margin:28px 0;text-align:center;">
              <a href="${appUrl}/login" style="background:#16a34a;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">כניסה למערכת</a>
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center;">מומלץ לשנות את הסיסמה לאחר הכניסה הראשונה.</p>
            <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0;" />
            <p style="color:#94a3b8;font-size:11px;text-align:center;">מייל זה נשלח ממערכת CRM</p>
          </div>`,
      });
    } catch (mailErr: any) {
      console.warn("Failed to send welcome email:", mailErr);
      emailError = mailErr?.message || "שגיאת מייל לא ידועה";
    }

    return NextResponse.json({ ok: true, emailError });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser || authedUser.role !== "admin") {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const body = await req.json();
    const { id, full_name, role, phone, password, send_invite, email, status } = body;
    const admin = getAdminClient();

    if (send_invite && email) {
      // Generate magic invite link
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login` },
      });
      if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 });

      const inviteUrl = (linkData as any)?.properties?.action_link || "";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      await sendMail({
        to: email,
        subject: "הוזמנת למערכת CRM",
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc;border-radius:12px;">
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:#16a34a;border-radius:16px;margin-bottom:12px;">
                <span style="color:white;font-size:28px;">🏢</span>
              </div>
              <h1 style="color:#0f172a;margin:0;font-size:22px;">ברוכים הבאים למערכת CRM</h1>
            </div>
            <p style="color:#374151;text-align:center;">הוזמנת להצטרף למערכת הניהול שלנו.</p>
            <div style="margin:28px 0;text-align:center;">
              <a href="${inviteUrl}" style="background:#16a34a;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">הגדר סיסמה והצטרף</a>
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center;">הקישור בתוקף ל-24 שעות.<br/>אם לא ביקשת הזמנה זו, ניתן להתעלם ממייל זה.</p>
            <hr style="border:none;border-top:1px solid #f1f5f9;margin:20px 0;" />
            <p style="color:#94a3b8;font-size:11px;text-align:center;">מייל זה נשלח ממערכת CRM</p>
          </div>`,
      });
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
    const authedUser = await getAuthedUser(req);
    if (!authedUser || authedUser.role !== "admin") {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const hard = searchParams.get("hard") === "true";
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    if (hard) {
      // Permanent delete — removes the auth account; public.users and any
      // owned time_entries cascade-delete with it (see schema.sql FKs).
      const { error } = await getAdminClient().auth.admin.deleteUser(id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    await getAdminClient().from("users").update({ status: "inactive" }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
