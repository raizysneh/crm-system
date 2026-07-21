"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Trash2, Building2 } from "lucide-react";

type State = "loading" | "invalid" | "resolved" | "ready" | "approved" | "rejected" | "error";

function Content() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const token = params.get("token") || "";

  const [state, setState] = useState<State>("loading");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id || !token) { setState("invalid"); return; }
    fetch(`/api/tasks/deletion-approval?id=${id}&token=${token}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) { setState("invalid"); return; }
        setTitle(j.title);
        setState(j.resolved ? "resolved" : "ready");
      })
      .catch(() => setState("error"));
  }, [id, token]);

  const act = async (action: "approve" | "reject") => {
    setBusy(true);
    try {
      const res = await fetch("/api/tasks/deletion-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, token, action }),
      });
      if (!res.ok) { setState("error"); return; }
      setState(action === "approve" ? "approved" : "rejected");
    } catch { setState("error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7] p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-[#e2e8f0] p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-[#16a34a] rounded-2xl mb-4">
          <Building2 className="h-7 w-7 text-white" />
        </div>

        {state === "loading" && <p className="text-[#64748b]">טוען...</p>}

        {state === "invalid" && (
          <>
            <XCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="font-semibold text-[#0f172a]">קישור לא תקין</p>
            <p className="text-sm text-[#64748b] mt-1">הקישור פגום או שפג תוקפו.</p>
          </>
        )}

        {state === "error" && (
          <>
            <XCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="font-semibold text-[#0f172a]">שגיאה</p>
            <p className="text-sm text-[#64748b] mt-1">נסה שוב מאוחר יותר.</p>
          </>
        )}

        {state === "resolved" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-[#16a34a] mx-auto mb-3" />
            <p className="font-semibold text-[#0f172a]">הבקשה כבר טופלה</p>
            <p className="text-sm text-[#64748b] mt-1">מנהל אחר כבר הגיב לבקשה הזו.</p>
          </>
        )}

        {state === "ready" && (
          <>
            <Trash2 className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <p className="font-semibold text-[#0f172a] mb-1">בקשת מחיקת משימה</p>
            <p className="text-sm text-[#64748b] mb-6">"{title}"</p>
            <div className="flex gap-2">
              <button onClick={() => act("reject")} disabled={busy}
                className="flex-1 h-10 rounded-xl border border-[#e2e8f0] text-sm font-medium text-[#374151] hover:bg-[#f8fafc] disabled:opacity-50">
                דחה בקשה
              </button>
              <button onClick={() => act("approve")} disabled={busy}
                className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold disabled:opacity-50">
                אשר מחיקה
              </button>
            </div>
          </>
        )}

        {state === "approved" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-[#16a34a] mx-auto mb-3" />
            <p className="font-semibold text-[#0f172a]">המשימה נמחקה</p>
          </>
        )}

        {state === "rejected" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-[#16a34a] mx-auto mb-3" />
            <p className="font-semibold text-[#0f172a]">הבקשה נדחתה</p>
            <p className="text-sm text-[#64748b] mt-1">המשימה לא נמחקה.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function TaskDeletionPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
