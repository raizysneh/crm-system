import { create } from "zustand";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

interface ChatStore {
  unreadByConv: Record<string, number>;
  totalUnread: number;
  subscribed: boolean;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  pendingOpenConversationId: string | null;
  setPendingOpenConversationId: (id: string | null) => void;
  refresh: (userId: string) => Promise<void>;
  clearConv: (convId: string) => void;
  bumpConv: (convId: string) => void;
  ensureSubscribed: (userId: string) => void;
}

function total(map: Record<string, number>) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

export const useChatStore = create<ChatStore>((set, get) => ({
  unreadByConv: {},
  totalUnread: 0,
  subscribed: false,
  activeConversationId: null,
  pendingOpenConversationId: null,

  setActiveConversationId: (id: string | null) => set({ activeConversationId: id }),
  setPendingOpenConversationId: (id: string | null) => set({ pendingOpenConversationId: id }),

  refresh: async (userId: string) => {
    const { data: myConvs } = await supabase.from("chat_participants").select("conversation_id").eq("user_id", userId);
    const ids = (myConvs || []).map((r: any) => r.conversation_id);
    if (!ids.length) { set({ unreadByConv: {}, totalUnread: 0 }); return; }

    const [{ data: msgs }, { data: reads }] = await Promise.all([
      supabase.from("chat_messages").select("id, conversation_id").in("conversation_id", ids).neq("sender_id", userId),
      supabase.from("chat_message_reads").select("message_id").eq("user_id", userId),
    ]);
    const readSet = new Set((reads || []).map((r: any) => r.message_id));
    const map: Record<string, number> = {};
    (msgs || []).forEach((m: any) => {
      if (!readSet.has(m.id)) map[m.conversation_id] = (map[m.conversation_id] || 0) + 1;
    });
    set({ unreadByConv: map, totalUnread: total(map) });
  },

  clearConv: (convId: string) => set(s => {
    if (!(convId in s.unreadByConv)) return s;
    const next = { ...s.unreadByConv };
    delete next[convId];
    return { unreadByConv: next, totalUnread: total(next) };
  }),

  bumpConv: (convId: string) => set(s => {
    const next = { ...s.unreadByConv, [convId]: (s.unreadByConv[convId] || 0) + 1 };
    return { unreadByConv: next, totalUnread: total(next) };
  }),

  // Lazily starts one global realtime subscription — safe to call from multiple
  // components, it only subscribes once per session. Lives here (mounted from
  // Sidebar, present on every page) rather than on the chat page itself, so the
  // unread badge AND the toast/desktop popup fire no matter what page is open —
  // not just while the user happens to have /chat open in that browser tab.
  ensureSubscribed: (userId: string) => {
    if (get().subscribed) return;
    set({ subscribed: true });
    supabase
      .channel("chat-unread-badge")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload: any) => {
        if (payload.new.sender_id === userId) return;

        const { data: membership } = await supabase
          .from("chat_participants")
          .select("conversation_id")
          .eq("conversation_id", payload.new.conversation_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (!membership) return;

        get().bumpConv(payload.new.conversation_id);

        // Already looking at this exact conversation on /chat — it renders inline there, skip the popup.
        if (payload.new.conversation_id === get().activeConversationId) return;

        const { data: sender } = await supabase.from("users").select("full_name").eq("id", payload.new.sender_id).single();
        const senderName = sender?.full_name || "הודעה חדשה";
        const body = payload.new.content?.startsWith("__IMG__")
          ? "📎 תמונה/GIF"
          : payload.new.message_type === "voice" ? "🎤 הודעה קולית"
          : payload.new.message_type === "file" ? `📎 ${payload.new.content}` : payload.new.content;

        toast.info(`💬 ${senderName}`, {
          description: body,
          action: {
            label: "פתח",
            onClick: () => {
              get().setPendingOpenConversationId(payload.new.conversation_id);
              // Already mounted (another tab/route of this same app instance) picks up the
              // pending id via its own effect; otherwise navigate there fresh.
              if (typeof window !== "undefined" && !window.location.pathname.startsWith("/chat")) {
                window.location.href = "/chat";
              }
            },
          },
          duration: 6000,
        });

        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification(senderName, { body, icon: "/favicon.ico", tag: payload.new.conversation_id });
        }
      })
      .subscribe();
  },
}));
