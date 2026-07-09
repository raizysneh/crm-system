import { Resend } from "resend";
import nodemailer from "nodemailer";

// Prefer Resend (just an API key, no SMTP setup needed)
// Fallback to nodemailer SMTP if SMTP_USER/SMTP_PASS are set

export const FROM_EMAIL =
  process.env.SMTP_FROM ||
  process.env.SMTP_USER ||
  "onboarding@resend.dev"; // Resend sandbox sender (works without domain verification)

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
}) {
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];

  // ── Resend (preferred) ──────────────────────────────────────
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `מערכת CRM <${FROM_EMAIL}>`,
      to: toList,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) throw new Error(error.message);
    return;
  }

  // ── Nodemailer SMTP (fallback) ──────────────────────────────
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transport = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   || "smtp.gmail.com",
      port:   Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: `"מערכת CRM" <${FROM_EMAIL}>`,
      to: toList.join(", "),
      subject: opts.subject,
      html: opts.html,
    });
    return;
  }

  throw new Error("לא הוגדר שירות מייל. הוסף RESEND_API_KEY ל-.env.local");
}
