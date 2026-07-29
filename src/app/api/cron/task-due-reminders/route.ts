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

// Triggered daily by Vercel Cron (see vercel.json). Emails whoever's assigned
// and the client for every task whose due_date is today and hasn't been
// reminded about yet, so postponing/reassigning a task doesn't spam.
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 401 });
    }
  }

  if (!process.env.RESEND_API_KEY && (!process.env.SMTP_USER || !process.env.SMTP_PASS)) {
    return NextResponse.json({ ok: true, skipped: "no mail service configured" });
  }

  const db = admin();
  const today = new Date().toISOString().split("T")[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { data: tasks, error } = await db
    .from("tasks")
    .select("*, customer:customers(company_name,email), assignee:users!assigned_user_id(full_name,email)")
    .eq("due_date", today)
    .is("due_reminder_sent_at", null)
    .not("status", "in", "(completed,cancelled)")
    .eq("pending_deletion", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tasks?.length) return NextResponse.json({ ok: true, checked: 0, sent: 0 });

  let sent = 0;
  for (const task of tasks) {
    const emailSet = new Set<string>();
    if ((task.customer as any)?.email) emailSet.add((task.customer as any).email);
    if ((task.assignee as any)?.email) emailSet.add((task.assignee as any).email);
    const emails = [...emailSet];

    if (emails.length) {
      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc;border-radius:12px;">
          <h2 style="color:#dc2626;margin-bottom:8px;">📅 משימה מגיעה היום</h2>
          <h3 style="color:#0f172a;margin-bottom:16px;">${task.title}</h3>
          <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;">
            ${(task.customer as any)?.company_name ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 16px;color:#64748b;width:100px;">לקוח</td><td style="padding:10px 16px;font-weight:600;">${(task.customer as any).company_name}</td></tr>` : ""}
            ${(task.assignee as any)?.full_name ? `<tr><td style="padding:10px 16px;color:#64748b;">אחראי</td><td style="padding:10px 16px;">${(task.assignee as any).full_name}</td></tr>` : ""}
          </table>
          ${task.description ? `<p style="margin-top:16px;color:#64748b;font-size:14px;">${task.description}</p>` : ""}
          <div style="margin-top:24px;text-align:center;">
            <a href="${appUrl}/tasks/${task.id}" style="background:#16a34a;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;">צפה במשימה</a>
          </div>
          <p style="margin-top:20px;color:#94a3b8;font-size:12px;text-align:center;">מייל זה נשלח ממערכת CRM</p>
        </div>`;

      try {
        await sendMail({ to: emails, subject: `📅 מגיעה היום: ${task.title}`, html });
        sent++;
      } catch (e: any) {
        console.error(`[cron/task-due-reminders] failed to email task ${task.id}:`, e.message);
        continue; // leave due_reminder_sent_at null so it retries tomorrow
      }
    }

    await db.from("tasks").update({ due_reminder_sent_at: new Date().toISOString() }).eq("id", task.id);
  }

  return NextResponse.json({ ok: true, checked: tasks.length, sent });
}
