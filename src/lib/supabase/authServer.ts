import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export interface AuthedUser {
  id: string;
  role: "admin" | "employee" | "client";
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Verifies the bearer token against Supabase Auth and looks up the caller's
// real role from the DB — never trust a role/user_id sent by the client.
export async function getAuthedUser(req: NextRequest): Promise<AuthedUser | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const client = admin();
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await client
    .from("users")
    .select("id, role")
    .eq("id", authData.user.id)
    .single();
  if (profileError || !profile) return null;

  return { id: profile.id, role: profile.role };
}
