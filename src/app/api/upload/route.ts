import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const bucket = (form.get("bucket") as string) || "attachments";
    const path = form.get("path") as string | null;

    if (!file) return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
    if (!path)  return NextResponse.json({ error: "חסר path" },      { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const sb = admin();

    // Auto-create bucket if it doesn't exist
    const { data: buckets } = await sb.storage.listBuckets();
    const exists = buckets?.some(b => b.name === bucket);
    if (!exists) {
      const { error: bucketErr } = await sb.storage.createBucket(bucket, { public: true });
      if (bucketErr && !bucketErr.message.includes("already exists")) {
        return NextResponse.json({ error: `שגיאה ביצירת bucket: ${bucketErr.message}` }, { status: 500 });
      }
    }

    const { error } = await sb.storage.from(bucket).upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
