"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Plus, MessageSquare, Search } from "lucide-react";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase/client";
import { ChatConversation, ChatMessage, User } from "@/types";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { formatTime, getInitials, cn } from "@/lib/utils";

export default function ChatPage() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConv, setActiveConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
    loadUsers();
  }, [user]);

  useEffect(() => {
    if (activeConv) loadMessages(activeConv.id);
  }, [activeConv]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeConv) return;
    const channel = supabase
      .channel(`chat:${activeConv.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `conversation_id=eq.${activeConv.id}`,
      }, async (payload) => {
        const { data } = await supabase.from("chat_messages")
          .select("*, sender:users(id, full_name, avatar_url)")
          .eq("id", payload.new.id)
          .single();
        if (data) setMessages(prev => [...prev, data]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConv]);

  const loadConversations = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_conversations")
      .select(`
        *,
        participants:chat_participants(user:users(id, full_name, avatar_url))
      `)
      .order("updated_at", { ascending: false });
    setConversations(data || []);
  };

  const loadMessages = async (convId: string) => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*, sender:users(id, full_name, avatar_url)")
      .eq("conversation_id", convId)
      .order("created_at");
    setMessages(data || []);
  };

  const loadUsers = async () => {
    const { data } = await supabase.from("users").select("*").neq("id", user?.id).eq("status", "active");
    setUsers((data || []) as User[]);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !activeConv || !user) return;
    setSending(true);
    try {
      await supabase.from("chat_messages").insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        content: newMessage.trim(),
        message_type: "text",
      });
      setNewMessage("");
      await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", activeConv.id);
    } catch { toast.error("שגיאה בשליחה"); }
    finally { setSending(false); }
  };

  const handleNewChat = async (targetUser: User) => {
    if (!user) return;
    try {
      const { data: conv } = await supabase.from("chat_conversations").insert({
        type: "private",
        created_by: user.id,
      }).select().single();

      if (conv) {
        await supabase.from("chat_participants").insert([
          { conversation_id: conv.id, user_id: user.id },
          { conversation_id: conv.id, user_id: targetUser.id },
        ]);
        loadConversations();
        setActiveConv(conv);
      }
    } catch { toast.error("שגיאה ביצירת שיחה"); }
  };

  const getConvName = (conv: ChatConversation) => {
    if (conv.name) return conv.name;
    const other = conv.participants?.find((p: any) => (p as any)?.user?.id !== user?.id);
    return (other as any)?.user?.full_name || "שיחה פרטית";
  };

  const getConvInitials = (conv: ChatConversation) => {
    return getConvName(conv).charAt(0) || "?";
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      <Header title="צ'אט" />
      <div className="flex flex-1 overflow-hidden">
        {/* Conversations sidebar */}
        <div className="w-72 border-l border-[#e2e8f0] bg-white flex flex-col">
          <div className="p-3 border-b border-[#f1f5f9]">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
              <Input placeholder="חיפוש שיחה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 h-8" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Users to start chat with */}
            {conversations.length === 0 && (
              <div className="p-3 border-b border-[#f1f5f9]">
                <p className="text-xs text-[#94a3b8] mb-2">התחל שיחה חדשה</p>
                {users.map(u => (
                  <button key={u.id} onClick={() => handleNewChat(u)}
                    className="flex items-center gap-2.5 w-full p-2 rounded-lg hover:bg-[#f8fafc] text-right">
                    <div className="w-8 h-8 rounded-full bg-[#16a34a] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {getInitials(u.full_name)}
                    </div>
                    <span className="text-sm text-[#374151]">{u.full_name}</span>
                  </button>
                ))}
              </div>
            )}

            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                className={cn("flex items-center gap-3 w-full p-3 hover:bg-[#f8fafc] border-b border-[#f8fafc] text-right", activeConv?.id === conv.id && "bg-[#f0fdf4] border-[#d1fae5]")}
              >
                <div className="w-10 h-10 rounded-full bg-[#16a34a] flex items-center justify-center text-white font-bold shrink-0">
                  {getConvInitials(conv)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-[#0f172a] truncate">{getConvName(conv)}</p>
                  <p className="text-xs text-[#94a3b8] truncate">
                    {conv.type === "group" ? "קבוצה" : "שיחה פרטית"}
                  </p>
                </div>
              </button>
            ))}

            {conversations.length === 0 && (
              <div className="text-center py-8 text-[#94a3b8]">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">אין שיחות עדיין</p>
              </div>
            )}
          </div>

          {users.length > 0 && conversations.length > 0 && (
            <div className="p-3 border-t border-[#f1f5f9]">
              <details>
                <summary className="text-xs text-[#64748b] cursor-pointer hover:text-[#374151] mb-2">
                  + שיחה חדשה
                </summary>
                {users.map(u => (
                  <button key={u.id} onClick={() => handleNewChat(u)}
                    className="flex items-center gap-2 w-full p-1.5 rounded-lg hover:bg-[#f8fafc] text-right">
                    <div className="w-6 h-6 rounded-full bg-[#16a34a] flex items-center justify-center text-white text-xs font-bold">
                      {u.full_name.charAt(0)}
                    </div>
                    <span className="text-sm text-[#374151]">{u.full_name}</span>
                  </button>
                ))}
              </details>
            </div>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 flex flex-col bg-[#f8fafc]">
          {activeConv ? (
            <>
              {/* Conv header */}
              <div className="bg-white border-b border-[#e2e8f0] px-5 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#16a34a] flex items-center justify-center text-white font-bold">
                  {getConvInitials(activeConv)}
                </div>
                <div>
                  <p className="font-semibold text-[#0f172a]">{getConvName(activeConv)}</p>
                  <p className="text-xs text-[#64748b]">{activeConv.type === "group" ? "קבוצה" : "שיחה פרטית"}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(msg => {
                  const isOwn = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} className={cn("flex gap-2 max-w-[75%]", isOwn ? "mr-auto flex-row-reverse" : "")}>
                      {!isOwn && (
                        <div className="w-7 h-7 rounded-full bg-[#e2e8f0] flex items-center justify-center text-xs font-bold text-[#64748b] shrink-0 mt-auto">
                          {msg.sender?.full_name?.charAt(0) || "?"}
                        </div>
                      )}
                      <div>
                        {!isOwn && (
                          <p className="text-xs text-[#94a3b8] mb-1 px-1">{msg.sender?.full_name}</p>
                        )}
                        <div className={cn(
                          "rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                          isOwn
                            ? "bg-[#16a34a] text-white rounded-tl-sm"
                            : "bg-white text-[#0f172a] rounded-tr-sm border border-[#f1f5f9]"
                        )}>
                          {msg.content}
                        </div>
                        <p className={cn("text-xs mt-1 px-1", isOwn ? "text-left text-[#94a3b8]" : "text-[#94a3b8]")}>
                          {formatTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="bg-white border-t border-[#e2e8f0] p-3 flex gap-2">
                <Input
                  placeholder="כתוב הודעה..."
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                  className="flex-1"
                />
                <Button onClick={handleSend} loading={sending} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#94a3b8]">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg">בחר שיחה להתחלה</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
