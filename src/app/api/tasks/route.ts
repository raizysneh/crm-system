import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser, AuthedUser } from "@/lib/supabase/authServer";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Employees may only touch tasks they created or are assigned to; admins get full access.
async function canTouchTask(db: ReturnType<typeof admin>, taskId: string, authedUser: AuthedUser) {
  if (authedUser.role === "admin") return true;
  const { data } = await db.from("tasks").select("assigned_user_id, created_by").eq("id", taskId).single();
  return !!data && (data.assigned_user_id === authedUser.id || data.created_by === authedUser.id);
}

export async function GET(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser || authedUser.role === "client") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get("user_id");
    const status     = searchParams.get("status");
    const priority   = searchParams.get("priority");
    const custId     = searchParams.get("customer_id");
    const hideFuture = searchParams.get("hide_future") === "true";

    let q = admin()
      .from("tasks")
      .select(`*, customer:customers(id,company_name,logo_url), project:projects(id,name), assigned_user:users!assigned_user_id(id,full_name), subtasks(id,completed)`)
      .order("created_at", { ascending: false });

    // Employees can never see anyone else's tasks, regardless of what's requested.
    const userId = authedUser.role === "admin" ? requestedUserId : authedUser.id;
    if (userId) q = q.eq("assigned_user_id", userId);
    if (status)   q = q.eq("status", status);
    else if (searchParams.get("exclude_completed") === "true") q = q.neq("status", "completed");
    if (priority) q = q.eq("priority", priority);
    if (custId)   q = q.eq("customer_id", custId);
    // Hide tasks with a future due date — show only today/overdue/no-date
    if (hideFuture) {
      const today = new Date().toISOString().split("T")[0];
      q = q.or(`due_date.is.null,due_date.lte.${today}`);
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser || authedUser.role === "client") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const body = await req.json();
    const { subtasks, ...taskData } = body;
    // Never trust a client-supplied creator — always the verified caller.
    taskData.created_by = authedUser.id;

    const { data: task, error } = await admin()
      .from("tasks")
      .insert(taskData)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (subtasks?.length) {
      const rows = subtasks
        .filter((s: any) => s.title?.trim())
        .map((s: any, i: number) => ({ task_id: task.id, title: s.title, completed: false, sort_order: i }));
      if (rows.length > 0) await admin().from("subtasks").insert(rows);
    }

    return NextResponse.json({ data: task });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser || authedUser.role === "client") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const body = await req.json();
    const { id, ...taskData } = body;
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

    const db = admin();
    if (!(await canTouchTask(db, id, authedUser))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const { error } = await db.from("tasks").update(taskData).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Notifications and recurring logic on status change
    if (taskData.status) {
      const { data: task } = await db.from("tasks").select("*").eq("id", id).single();

      // Notify assigned user on status change (if not the one changing it)
      if (task?.assigned_user_id && taskData.status === "completed") {
        await db.from("notifications").insert({
          user_id: task.assigned_user_id,
          type: "task",
          title: "משימה הושלמה",
          body: `המשימה "${task.title}" סומנה כהושלמה`,
          is_read: false,
        }).then(() => {});
      }

      // Notify creator when assigned user updates status
      if (task?.created_by && task.created_by !== task.assigned_user_id) {
        await db.from("notifications").insert({
          user_id: task.created_by,
          type: "task",
          title: taskData.status === "completed" ? "משימה הושלמה" : "עדכון משימה",
          body: `"${task.title}" עודכנה לסטטוס: ${taskData.status}`,
          is_read: false,
        }).then(() => {});
      }
    }

    // If marking a recurring task as completed, create the next occurrence
    if (taskData.status === "completed") {
      const { data: task } = await db.from("tasks").select("*").eq("id", id).single();
      if (task?.is_recurring && task.due_date) {
        const nextDate = computeNextDate(task);
        if (nextDate) {
          // Check end condition
          let shouldCreate = true;
          if (task.recurrence_end_type === "date" && task.recurrence_end_date) {
            shouldCreate = nextDate <= new Date(task.recurrence_end_date);
          }
          // "count" end type would need a counter stored on the task — skip for now
          if (shouldCreate) {
            const { id: _id, created_at, updated_at, status, ...rest } = task;
            await db.from("tasks").insert({
              ...rest,
              status: "new",
              due_date: nextDate.toISOString().split("T")[0],
              recurrence_parent_id: task.recurrence_parent_id || task.id,
            });
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function computeNextDate(task: any): Date | null {
  const current = new Date(task.due_date);
  const type     = task.recurrence_type;
  const interval = task.recurrence_interval || 1;

  if (type === "daily" || type === "custom") {
    current.setDate(current.getDate() + interval);
    return current;
  }

  if (type === "weekly") {
    if (task.recurrence_days?.length) {
      // Find next matching day of week after current
      const dayMap: Record<string, number> = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
      const activeDays = task.recurrence_days.map((d: string) => dayMap[d]).sort((a: number, b: number) => a - b);
      const today = current.getDay();
      const next = activeDays.find((d: number) => d > today);
      if (next !== undefined) {
        current.setDate(current.getDate() + (next - today));
      } else {
        // Roll to next week's first day
        current.setDate(current.getDate() + (7 - today + activeDays[0]));
      }
      return current;
    }
    current.setDate(current.getDate() + 7 * interval);
    return current;
  }

  if (type === "monthly") {
    current.setMonth(current.getMonth() + interval);
    return current;
  }

  if (type === "yearly") {
    current.setFullYear(current.getFullYear() + 1);
    return current;
  }

  return null;
}

export async function DELETE(req: NextRequest) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser || authedUser.role === "client") return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });
    const db = admin();
    if (!(await canTouchTask(db, id, authedUser))) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    // Delete subtasks first
    await db.from("subtasks").delete().eq("task_id", id);
    await db.from("time_entries").update({ task_id: null }).eq("task_id", id);
    const { error } = await db.from("tasks").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
