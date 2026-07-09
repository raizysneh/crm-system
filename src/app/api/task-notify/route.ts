import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { task_id } = await req.json();
    if (!task_id) return NextResponse.json({ error: "חסר task_id" }, { status: 400 });

    if (!process.env.RESEND_API_KEY && (!process.env.SMTP_USER || !process.env.SMTP_PASS)) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { data: task, error } = await admin()
      .from("tasks")
      .select("*, customer:customers(company_name,email), assignee:users!assigned_user_id(full_name,email)")
      .eq("id", task_id)
      .single();

    if (error || !task) return NextResponse.json({ error: "משימה לא נמצאה" }, { status: 404 });

    const emailSet = new Set<string>();
    if ((task.customer as any)?.email) emailSet.add((task.customer as any).email);
    if ((task.assignee as any)?.email) emailSet.add((task.assignee as any).email);

    const emails = [...emailSet];
    if (!emails.length) return NextResponse.json({ ok: true, skipped: "no emails" });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc;border-radius:12px;">
        <h2 style="color:#16a34a;margin-bottom:8px;">✅ משימה הושלמה</h2>
        <h3 style="color:#0f172a;margin-bottom:16px;">${task.title}</h3>
        <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;">
          ${(task.customer as any)?.company_name ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 16px;color:#64748b;width:100px;">לקוח</td><td style="padding:10px 16px;font-weight:600;">${(task.customer as any).company_name}</td></tr>` : ""}
          ${(task.assignee as any)?.full_name ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 16px;color:#64748b;">בוצע ע"י</td><td style="padding:10px 16px;">${(task.assignee as any).full_name}</td></tr>` : ""}
          ${task.due_date ? `<tr><td style="padding:10px 16px;color:#64748b;">תאריך יעד</td><td style="padding:10px 16px;">${new Date(task.due_date).toLocaleDateString("he-IL")}</td></tr>` : ""}
        </table>
        ${task.description ? `<p style="margin-top:16px;color:#64748b;font-size:14px;">${task.description}</p>` : ""}
        <div style="margin-top:24px;text-align:center;">
          <a href="${appUrl}/tasks/${task.id}" style="background:#16a34a;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;">צפה במשימה</a>
        </div>
        <p style="margin-top:20px;color:#94a3b8;font-size:12px;text-align:center;">מייל זה נשלח ממערכת CRM</p>
      </div>`;

    await sendMail({ to: emails, subject: `✅ הושלמה: ${task.title}`, html });
    return NextResponse.json({ ok: true, sent_to: emails });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
