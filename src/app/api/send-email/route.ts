import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";
import { getAuthedUser } from "@/lib/supabase/authServer";

export async function POST(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser || authedUser.role !== "admin") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const { to, subject, html } = await req.json();
    if (!to || !subject || !html)
      return NextResponse.json({ error: "חסרים שדות חובה" }, { status: 400 });

    if (!process.env.RESEND_API_KEY && (!process.env.SMTP_USER || !process.env.SMTP_PASS)) {
      return NextResponse.json(
        { error: "לא הוגדר שירות מייל. הוסף RESEND_API_KEY ל-.env.local" },
        { status: 503 }
      );
    }

    await sendMail({ to, subject, html });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
