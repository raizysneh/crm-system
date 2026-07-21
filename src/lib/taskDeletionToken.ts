import { createHmac, timingSafeEqual } from "crypto";

// Stateless, unguessable per-task token for the "approve deletion by email"
// link — no DB column needed, no login required to click it. Anyone who
// receives the email (i.e. an admin) can approve/reject with it.
function sign(taskId: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(taskId).digest("hex").slice(0, 40);
}

export function makeDeletionToken(taskId: string): string {
  return sign(taskId);
}

export function verifyDeletionToken(taskId: string, token: string): boolean {
  const expected = Buffer.from(sign(taskId));
  const actual = Buffer.from(String(token || ""));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
