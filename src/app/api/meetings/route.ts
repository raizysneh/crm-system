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

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("he-IL", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function sendMeetingInvite(
  meetingId: string,
  isUpdate = false,
  extraEmails: string[] = [],
  createdById?: string | null
) {
  try {
    if (!process.env.RESEND_API_KEY && (!process.env.SMTP_USER || !process.env.SMTP_PASS)) {
      console.warn("[meetings] no mail provider configured — skipping email");
      return;
    }

    const sb = admin();

    // Fetch meeting basic info + customer
    const { data: meeting, error: mErr } = await sb
      .from("meetings")
      .select("*, customer:customers(company_name)")
      .eq("id", meetingId)
      .single();

    if (mErr || !meeting) {
      console.warn("[meetings] meeting not found:", meetingId, mErr?.message);
      return;
    }

    // Collect email recipients
    const emailSet = new Set<string>(extraEmails.filter(Boolean));

    // Add meeting creator
    if (createdById) {
      const { data: creator } = await sb.from("users").select("email").eq("id", createdById).single();
      if (creator?.email) emailSet.add(creator.email);
    }

    // Add participants from meeting_participants table
    const { data: participants } = await sb
      .from("meeting_participants")
      .select("user:users(email)")
      .eq("meeting_id", meetingId);

    (participants || []).forEach((p: any) => {
      if (p.user?.email) emailSet.add(p.user.email);
    });

    const emails = [...emailSet];
    if (!emails.length) {
      console.warn("[meetings] no recipients for meeting", meetingId);
      return;
    }

    console.log(`[meetings] sending invite to: ${emails.join(", ")}`);

    const action  = isUpdate ? "עודכנה" : "נקבעה";
    const dateStr = formatDateTime(meeting.start_time);
    const endStr  = meeting.end_time ? formatDateTime(meeting.end_time) : "";
    const appUrl  = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f8fafc;border-radius:12px;">
        <h2 style="color:#16a34a;margin-bottom:8px;">📅 פגישה ${action}</h2>
        <h3 style="color:#0f172a;margin-bottom:16px;">${meeting.title}</h3>
        <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;">
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px 16px;color:#64748b;width:110px;">תאריך ושעה</td>
            <td style="padding:10px 16px;font-weight:600;">${dateStr}${endStr ? ` – ${endStr.split(" ").pop()}` : ""}</td>
          </tr>
          ${meeting.location ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 16px;color:#64748b;">מיקום</td><td style="padding:10px 16px;">${meeting.location}</td></tr>` : ""}
          ${meeting.meeting_link ? `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 16px;color:#64748b;">קישור</td><td style="padding:10px 16px;"><a href="${meeting.meeting_link}" style="color:#16a34a;">${meeting.meeting_link}</a></td></tr>` : ""}
          ${meeting.customer?.company_name ? `<tr><td style="padding:10px 16px;color:#64748b;">לקוח</td><td style="padding:10px 16px;">${meeting.customer.company_name}</td></tr>` : ""}
        </table>
        ${meeting.notes ? `<p style="margin-top:16px;color:#64748b;font-size:14px;"><strong>הערות:</strong> ${meeting.notes}</p>` : ""}
        <div style="margin-top:24px;text-align:center;">
          <a href="${appUrl}/calendar" style="background:#16a34a;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;">פתח יומן</a>
        </div>
        <p style="margin-top:20px;color:#94a3b8;font-size:12px;text-align:center;">מייל זה נשלח ממערכת CRM</p>
      </div>`;

    await sendMail({ to: emails, subject: `${action}: ${meeting.title} — ${dateStr}`, html });
    console.log("[meetings] email sent successfully");
  } catch (e) {
    console.error("[meetings] sendMeetingInvite failed:", e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to   = searchParams.get("to");
    const userId = searchParams.get("user_id");

    const select = "*, customer:customers(id,company_name), participants:meeting_participants(user:users(id,full_name))";

    let q = admin().from("meetings").select(select).order("start_time");
    if (from) q = q.gte("start_time", from);
    if (to)   q = q.lte("start_time", to);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Also fetch recurring meetings that started before 'from' (may have future instances in range)
    let extra: any[] = [];
    if (from) {
      const { data: olderRec } = await admin()
        .from("meetings")
        .select(select)
        .eq("is_recurring", true)
        .lt("start_time", from)
        .order("start_time");
      extra = olderRec || [];
    }

    // Merge, deduplicating by id
    const seenIds = new Set((data || []).map((m: any) => m.id));
    const merged = [...(data || []), ...extra.filter((m: any) => !seenIds.has(m.id))];

    // Filter by participant if userId supplied
    let result = merged;
    if (userId) {
      result = result.filter((m: any) =>
        m.created_by === userId ||
        (m.participants || []).some((p: any) => p.user?.id === userId)
      );
    }

    return NextResponse.json({ data: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, customer_id, start_time, end_time, location, meeting_link, notes, description, participant_ids, created_by, send_to_participants, extra_emails,
      is_recurring, recurrence_type, recurrence_interval, recurrence_days, recurrence_end_type, recurrence_end_date, recurrence_end_count } = body;

    const insertData: Record<string, any> = {
      title,
      customer_id: customer_id || null,
      start_time,
      end_time,
      location: location || null,
      meeting_link: meeting_link || null,
      notes: notes || null,
      description: description || null,
      created_by: created_by || null,
    };

    if (is_recurring) {
      Object.assign(insertData, {
        is_recurring: true,
        recurrence_type: recurrence_type || null,
        recurrence_interval: recurrence_interval || 1,
        recurrence_days: recurrence_days || [],
        recurrence_end_type: recurrence_end_type || "never",
        recurrence_end_date: recurrence_end_date || null,
        recurrence_end_count: recurrence_end_count || null,
      });
    }

    const { data, error } = await admin().from("meetings").insert(insertData).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (participant_ids?.length && data) {
      await admin().from("meeting_participants").insert(
        participant_ids.map((uid: string) => ({ meeting_id: data.id, user_id: uid }))
      );
    }

    if (send_to_participants !== false) {
      sendMeetingInvite(data.id, false, extra_emails || [], created_by || null);
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, participant_ids, send_to_participants, extra_emails, ...fields } = body;
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const { data: existing } = await admin().from("meetings").select("created_by").eq("id", id).single();

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

    if (send_to_participants !== false) {
      sendMeetingInvite(id, true, extra_emails || [], (existing as any)?.created_by || null);
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
