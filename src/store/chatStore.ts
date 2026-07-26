import { create } from "zustand";
import { supabase } from "@/lib/supabase/client";

interface ChatStore {
  unreadByConv: Record<string, number>;
  totalUnread: number;
  subscribed: boolean;
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

  // Lazily starts one global realtime subscription for the badge — safe to
  // call from multiple components, it only subscribes once per session.
  ensureSubscribed: (userId: string) => {
    if (get().subscribed) return;
    set({ subscribed: true });
    supabase
      .channel("chat-unread-badge")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload: any) => {
        if (payload.new.sender_id === userId) return;
        const { data } = await supabase
          .from("chat_participants")
          .select("conversation_id")
          .eq("conversation_id", payload.new.conversation_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (data) get().bumpConv(payload.new.conversation_id);
      })
      .subscribe();
  },
}));
