import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/portal?user_id=xxx
// Returns customer + projects + tasks + progress for a client user
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("user_id");
    if (!userId) return NextResponse.json({ error: "חסר user_id" }, { status: 400 });

    const db = admin();

    // Get the user to find their email
    const { data: user, error: userErr } = await db.from("users").select("*").eq("id", userId).single();
    if (userErr || !user) return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
    if (user.role !== "client") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    // Find customer by matching email OR by customer_id on users table
    let customer: any = null;
    const email = user.email;

    // Try customer_id field first (if column exists on users)
    if ((user as any).customer_id) {
      const { data } = await db.from("customers").select("*").eq("id", (user as any).customer_id).single();
      customer = data;
    }

    // Fallback: match by email
    if (!customer && email) {
      const { data } = await db.from("customers").select("*").eq("email", email).maybeSingle();
      customer = data;
    }

    if (!customer) {
      return NextResponse.json({ customer: null, projects: [], tasks: [] });
    }

    // Get projects for this customer
    const { data: projects } = await db
      .from("projects")
      .select("*, tasks:tasks(id,status)")
      .eq("customer_id", customer.id)
      .neq("status","cancelled")
      .order("created_at", { ascending: false });

    // Get tasks for this customer (not internal/cancelled)
    const { data: tasks } = await db
      .from("tasks")
      .select("*, project:projects(id,name), assigned_user:users!assigned_user_id(id,full_name), subtasks(id,completed)")
      .eq("customer_id", customer.id)
      .neq("status","cancelled")
      .order("created_at", { ascending: false });

    // Augment projects with progress
    const augmentedProjects = (projects || []).map((p: any) => {
      const allTasks = p.tasks || [];
      const completedTasks = allTasks.filter((t: any) => t.status === "completed").length;
      const progress = allTasks.length ? Math.round((completedTasks / allTasks.length) * 100) : 0;
      return { ...p, tasks_count: allTasks.length, completed_tasks: completedTasks, progress };
    });

    // Augment tasks with progress
    const augmentedTasks = (tasks || []).map((t: any) => {
      const subs = t.subtasks || [];
      const completedSubs = subs.filter((s: any) => s.completed).length;
      const progress = subs.length ? Math.round((completedSubs / subs.length) * 100) : 0;
      return { ...t, subtasks_count: subs.length, completed_subtasks: completedSubs, progress };
    });

    return NextResponse.json({ customer, projects: augmentedProjects, tasks: augmentedTasks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
