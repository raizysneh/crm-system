"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, MessageSquare, Search, Smile, Pencil, Trash2,
  Pin, Users, X, Check, Plus, Reply, SearchIcon, Mic,
  StopCircle, Play, Pause, Settings, UserMinus, UserPlus, Film,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import { ChatConversation, ChatMessage, User } from "@/types";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { formatTime, cn } from "@/lib/utils";

const QUICK_EMOJIS = ["👍","❤️","😂","😮","😢","🙏","🔥","💯","✅","🎉"];
const ALL_EMOJIS = [
  "😀","😊","😂","🤣","😍","🥰","😎","🤔","😢","😡","🤩","🥳",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️","💕","💯",
  "👍","👎","👏","🙌","🤝","🙏","💪","✌️","🤞","👋","🤜","🤛",
  "🔥","⭐","✅","❌","📌","💡","🚀","🎯","🎉","🎊","🎁","🏆",
  "😴","🤧","🥺","😤","🤭","🫡","🫂","💬","📝","📅","⏰","🔔",
];

// Aggregate reactions: { emoji: [userId, ...] }
function aggregateReactions(rawReactions: any[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of rawReactions) {
    if (!out[r.emoji]) out[r.emoji] = [];
    out[r.emoji].push(r.user_id);
  }
  return out;
}

export default function ChatPage() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConv, setActiveConv]       = useState<ChatConversation | null>(null);
  const [messages, setMessages]           = useState<ChatMessage[]>([]);
  const [rawReactions, setRawReactions]   = useState<any[]>([]); // DB rows
  const [newMessage, setNewMessage]       = useState("");
  const [sending, setSending]             = useState(false);
  const [users, setUsers]                 = useState<User[]>([]);
  const [convSearch, setConvSearch]       = useState("");
  const [msgSearch, setMsgSearch]         = useState("");
  const [showMsgSearch, setShowMsgSearch] = useState(false);

  // UI modals
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker]     = useState(false);
  const [gifSearch, setGifSearch]             = useState("");
  const [gifResults, setGifResults]           = useState<any[]>([]);
  const [gifLoading, setGifLoading]           = useState(false);
  const [gifTab, setGifTab]                   = useState<"search" | "saved">("search");
  const [savedGifs, setSavedGifs]             = useState<string[]>([]);
  const [savedGifsLoading, setSavedGifsLoading] = useState(false);
  const [showNewChat, setShowNewChat]         = useState(false);
  const [showNewGroup, setShowNewGroup]       = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [groupName, setGroupName]             = useState("");
  const [groupMembers, setGroupMembers]       = useState<string[]>([]);

  // Message actions
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editedIds, setEditedIds]     = useState<Set<string>>(new Set());
  const [pinnedMessages, setPinnedMessages] = useState<Set<string>>(new Set());
  const [showReactionFor, setShowReactionFor] = useState<string | null>(null);
  const [replyTo, setReplyTo]         = useState<ChatMessage | null>(null);

  // Voice recording
  const [recording, setRecording]         = useState(false);
  const [recordSecs, setRecordSecs]       = useState(0);
  const [playingVoice, setPlayingVoice]   = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const recordTimerRef   = useRef<any>(null);
  const audioRefs        = useRef<Record<string, HTMLAudioElement>>({});

  // Read receipts: { messageId: [userId, ...] }
  const [readReceipts, setReadReceipts] = useState<Record<string, string[]>>({});

  // Typing
  const [typingUsers, setTypingUsers]     = useState<string[]>([]);
  const typingTimeoutRef  = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const msgSearchRef   = useRef<HTMLInputElement>(null);
  const gifFileRef     = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) { loadConversations(); loadUsers(); }
  }, [user]);

  useEffect(() => {
    if (activeConv) { loadMessages(activeConv.id); setupPresence(activeConv.id); }
    return () => { if (presenceChannelRef.current) supabase.removeChannel(presenceChannelRef.current); };
  }, [activeConv?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handler = () => { setShowReactionFor(null); setShowEmojiPicker(false); setShowGifPicker(false); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Request desktop notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Realtime messages + reactions
  useEffect(() => {
    if (!activeConv) return;
    const channel = supabase
      .channel(`chat-msgs:${activeConv.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${activeConv.id}` },
        async (payload) => {
          const { data } = await supabase.from("chat_messages")
            .select("*, sender:users(id, full_name, avatar_url)")
            .eq("id", payload.new.id).single();
          if (!data) return;
          // Only add if not already in state (own messages added optimistically)
          setMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data]);
          // Desktop notification for messages from others when tab is not focused
          if (data.sender_id !== user?.id && document.hidden) {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(data.sender?.full_name || "הודעה חדשה", {
                body: (data as any).message_type === "voice" ? "🎤 הודעה קולית" : data.content,
                icon: "/favicon.ico",
                tag: data.conversation_id,
              });
            }
          }
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${activeConv.id}` },
        (payload) => {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
          if (payload.new.is_edited) setEditedIds(prev => new Set([...prev, payload.new.id]));
          setPinnedMessages(prev => {
            const next = new Set(prev);
            if (payload.new.is_pinned) next.add(payload.new.id); else next.delete(payload.new.id);
            return next;
          });
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${activeConv.id}` },
        (payload) => setMessages(prev => prev.filter(m => m.id !== payload.old.id)))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_reactions" }, loadReactions)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_reactions" }, loadReactions)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_message_reads" },
        (payload) => {
          setReadReceipts(prev => {
            const mid = payload.new.message_id;
            const uid = payload.new.user_id;
            const existing = prev[mid] || [];
            if (existing.includes(uid)) return prev;
            return { ...prev, [mid]: [...existing, uid] };
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeConv?.id]);

  const setupPresence = (convId: string) => {
    if (presenceChannelRef.current) supabase.removeChannel(presenceChannelRef.current);
    const ch = supabase.channel(`typing:${convId}`, { config: { presence: { key: user?.id } } })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const typers = Object.values(state).flat()
          .filter((p: any) => p.typing && p.user_id !== user?.id)
          .map((p: any) => p.name as string);
        setTypingUsers(typers);
      })
      .subscribe();
    presenceChannelRef.current = ch;
  };

  const broadcastTyping = useCallback(() => {
    if (!presenceChannelRef.current || !user) return;
    presenceChannelRef.current.track({ typing: true, user_id: user.id, name: user.full_name });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      presenceChannelRef.current?.track({ typing: false, user_id: user.id, name: user.full_name });
    }, 2000);
  }, [user]);

  const loadConversations = async () => {
    if (!user) return;

    if (user.role === "admin") {
      // Admin sees all conversations
      const { data } = await supabase
        .from("chat_conversations")
        .select("*, participants:chat_participants(user:users(id, full_name, avatar_url))")
        .order("updated_at", { ascending: false });
      setConversations(data || []);
    } else {
      // Employee sees only conversations they participate in
      const { data: myConvs } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      const ids = (myConvs || []).map(r => r.conversation_id);
      if (ids.length === 0) { setConversations([]); return; }

      const { data } = await supabase
        .from("chat_conversations")
        .select("*, participants:chat_participants(user:users(id, full_name, avatar_url))")
        .in("id", ids)
        .order("updated_at", { ascending: false });
      setConversations(data || []);
    }
  };

  const loadMessages = async (convId: string) => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*, sender:users(id, full_name, avatar_url)")
      .eq("conversation_id", convId)
      .order("created_at");
    setMessages(data || []);
    const pinned = new Set<string>();
    (data || []).forEach((m: any) => { if (m.is_pinned) pinned.add(m.id); });
    setPinnedMessages(pinned);
    const edited = new Set<string>();
    // Mark messages as read + load read receipts
    if (data?.length && user) {
      fetch("/api/chat-reads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: convId, user_id: user.id }),
      }).catch(() => {});
      const ids = data.map((m: any) => m.id).join(",");
      fetch(`/api/chat-reads?ids=${ids}`)
        .then(r => r.json())
        .then(j => {
          const map: Record<string, string[]> = {};
          (j.data || []).forEach((r: any) => {
            if (!map[r.message_id]) map[r.message_id] = [];
            map[r.message_id].push(r.user_id);
          });
          setReadReceipts(map);
        }).catch(() => {});
    }
    (data || []).forEach((m: any) => { if (m.is_edited) edited.add(m.id); });
    setEditedIds(edited);
    // Load reactions for these messages
    if (data?.length) {
      const ids = data.map((m: any) => m.id);
      const { data: rxns } = await supabase.from("chat_reactions").select("*").in("message_id", ids);
      setRawReactions(rxns || []);
    }
  };

  const loadReactions = async () => {
    if (!activeConv || messages.length === 0) return;
    const ids = messages.map(m => m.id);
    const { data } = await supabase.from("chat_reactions").select("*").in("message_id", ids);
    setRawReactions(data || []);
  };

  const loadUsers = async () => {
    const { data } = await supabase.from("users").select("*").neq("id", user?.id).eq("status", "active");
    setUsers((data || []) as User[]);
  };

  const loadSavedGifs = async () => {
    if (!user) return;
    setSavedGifsLoading(true);
    const { data } = await supabase.storage
      .from("attachments")
      .list(`gifs/${user.id}`, { limit: 50, sortBy: { column: "name", order: "desc" } });
    const urls = (data || [])
      .filter(f => f.name && !f.name.startsWith("."))
      .map(f => supabase.storage.from("attachments").getPublicUrl(`gifs/${user.id}/${f.name}`).data.publicUrl);
    setSavedGifs(urls);
    setSavedGifsLoading(false);
  };

  const searchGifs = async (q: string) => {
    if (!q.trim()) { setGifResults([]); return; }
    setGifLoading(true);
    try {
      const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=LIVDSRZULELA&limit=16&media_filter=gif`);
      const json = await res.json();
      setGifResults(json.results || []);
    } catch { setGifResults([]); }
    finally { setGifLoading(false); }
  };

  const handleSendGif = async (gifUrl: string) => {
    if (!activeConv || !user) return;
    setShowGifPicker(false);
    setGifSearch("");
    setGifResults([]);
    const res = await fetch("/api/chat-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: activeConv.id, sender_id: user.id, content: gifUrl, message_type: "gif" }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "שגיאה בשליחת GIF");
    if (json.id) setMessages(prev => prev.some(m => m.id === json.id) ? prev : [...prev, json]);
  };

  const handleGifFileUpload = async (file: File) => {
    if (!activeConv || !user) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("הקובץ גדול מדי (מקסימום 10MB)"); return; }
    const toastId = toast.loading("מעלה GIF...");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("bucket", "attachments");
      form.append("path", `gifs/${user.id}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_")}`);

      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "שגיאה בהעלאה");

      setSavedGifs(prev => [json.url, ...prev]);
      await handleSendGif(json.url);
      toast.success("GIF נשלח ונשמר! 🎉", { id: toastId });
    } catch (err: any) {
      toast.error(`שגיאה: ${err.message}`, { id: toastId });
    }
    if (gifFileRef.current) gifFileRef.current.value = "";
  };

  // ─── Send text ───────────────────────────────────────────────
  const handleSend = async () => {
    if (!newMessage.trim() || !activeConv || !user) return;
    setSending(true);
    const content = newMessage.trim();
    const replyToId = replyTo?.id || null;
    setNewMessage("");
    setReplyTo(null);
    if (textareaRef.current) textareaRef.current.style.height = "40px";
    try {
      const { data: inserted } = await supabase.from("chat_messages").insert({
        conversation_id: activeConv.id,
        sender_id: user.id,
        content,
        message_type: "text",
        reply_to: replyToId,
      }).select("*, sender:users(id, full_name, avatar_url)").single();
      // Add immediately to state — don't wait for realtime event
      if (inserted) setMessages(prev => prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]);
      await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", activeConv.id);
    } catch { toast.error("שגיאה בשליחה"); }
    finally { setSending(false); }
  };

  // ─── Voice recording ─────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); sendVoice(); };
      mr.start(200);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
    } catch { toast.error("לא ניתן לגשת למיקרופון"); }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    clearInterval(recordTimerRef.current);
    setRecording(false);
    setRecordSecs(0);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    audioChunksRef.current = [];
    clearInterval(recordTimerRef.current);
    setRecording(false);
    setRecordSecs(0);
  };

  const sendVoice = async () => {
    if (!user || !activeConv || audioChunksRef.current.length === 0) return;
    const mimeUsed = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const ext = mimeUsed === "audio/webm" ? "webm" : "mp4";
    const blob = new Blob(audioChunksRef.current, { type: mimeUsed });
    const path = `voice/${activeConv.id}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("attachments").upload(path, blob);
    if (uploadErr) { toast.error(`שגיאה בהעלאה: ${uploadErr.message}`); return; }
    const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);
    const replyToId = replyTo?.id || null;
    setReplyTo(null);
    const { data: inserted } = await supabase.from("chat_messages").insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      content: publicUrl,
      message_type: "voice",
      reply_to: replyToId,
    }).select("*, sender:users(id, full_name, avatar_url)").single();
    if (inserted) setMessages(prev => prev.some(m => m.id === inserted.id) ? prev : [...prev, inserted]);
    await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", activeConv.id);
  };

  const togglePlay = (msgId: string, url: string) => {
    if (playingVoice === msgId) {
      audioRefs.current[msgId]?.pause();
      setPlayingVoice(null);
    } else {
      if (playingVoice && audioRefs.current[playingVoice]) {
        audioRefs.current[playingVoice].pause();
      }
      if (!audioRefs.current[msgId]) {
        const a = new Audio(url);
        a.onended = () => setPlayingVoice(null);
        audioRefs.current[msgId] = a;
      }
      audioRefs.current[msgId].play();
      setPlayingVoice(msgId);
    }
  };

  // ─── Edit / Delete / Pin ──────────────────────────────────────
  const handleEditSave = async (msgId: string) => {
    if (!editContent.trim()) return;
    const res = await fetch("/api/chat-messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: msgId, content: editContent.trim() }),
    });
    if (res.ok) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: editContent.trim() } : m));
      setEditedIds(prev => new Set([...prev, msgId]));
      setEditingId(null);
    } else toast.error("שגיאה בעריכה");
  };

  const handleDelete = async (msgId: string) => {
    if (!confirm("למחוק הודעה זו?")) return;
    const res = await fetch(`/api/chat-messages?id=${msgId}`, { method: "DELETE" });
    if (res.ok) setMessages(prev => prev.filter(m => m.id !== msgId));
    else toast.error("שגיאה במחיקה");
  };

  const handlePin = async (msgId: string) => {
    const isPinned = pinnedMessages.has(msgId);
    const next = new Set(pinnedMessages);
    if (isPinned) next.delete(msgId); else next.add(msgId);
    setPinnedMessages(next);
    await fetch("/api/chat-messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: msgId, is_pinned: !isPinned }),
    });
    toast.success(isPinned ? "הצמדה הוסרה" : "הודעה הוצמדה ✓");
  };

  // ─── Emoji reactions (via API — bypasses RLS) ────────────────
  const handleReaction = async (msgId: string, emoji: string) => {
    if (!user) return;
    setShowReactionFor(null);
    const existing = rawReactions.find(r => r.message_id === msgId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      // Optimistic remove
      setRawReactions(prev => prev.filter(r => r.id !== existing.id));
      const res = await fetch(`/api/chat-reactions?id=${existing.id}`, { method: "DELETE" });
      if (!res.ok) { setRawReactions(prev => [...prev, existing]); toast.error("שגיאה בהסרת תגובה"); }
    } else {
      // Optimistic add
      const tempId = `temp-${Date.now()}`;
      setRawReactions(prev => [...prev, { id: tempId, message_id: msgId, user_id: user.id, emoji }]);
      const res = await fetch("/api/chat-reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: msgId, user_id: user.id, emoji }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRawReactions(prev => prev.filter(r => r.id !== tempId));
        toast.error(`שגיאה בתגובה: ${json.error}`);
      } else if (json.id) {
        setRawReactions(prev => prev.map(r => r.id === tempId ? json : r));
      }
    }
  };

  // ─── Conversations ────────────────────────────────────────────
  const handleNewPrivateChat = async (targetUser: User) => {
    if (!user) return;
    const existing = conversations.find(c =>
      c.type === "private" && c.participants?.some((p: any) => p.user?.id === targetUser.id)
    );
    if (existing) { setActiveConv(existing); setShowNewChat(false); return; }
    try {
      const { data: conv } = await supabase.from("chat_conversations")
        .insert({ type: "private", created_by: user.id }).select().single();
      if (conv) {
        await supabase.from("chat_participants").insert([
          { conversation_id: conv.id, user_id: user.id },
          { conversation_id: conv.id, user_id: targetUser.id },
        ]);
        await loadConversations();
        setActiveConv(conv);
      }
    } catch { toast.error("שגיאה ביצירת שיחה"); }
    setShowNewChat(false);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0 || !user) return;
    try {
      const { data: conv } = await supabase.from("chat_conversations")
        .insert({ type: "group", name: groupName.trim(), created_by: user.id }).select().single();
      if (conv) {
        await supabase.from("chat_participants").insert(
          [user.id, ...groupMembers].map(uid => ({ conversation_id: conv.id, user_id: uid }))
        );
        await loadConversations();
        setActiveConv(conv);
        toast.success("הקבוצה נוצרה!");
      }
    } catch { toast.error("שגיאה ביצירת קבוצה"); }
    setShowNewGroup(false);
    setGroupName("");
    setGroupMembers([]);
  };

  const handleAddMember = async (userId: string) => {
    if (!activeConv) return;
    const { error } = await supabase.from("chat_participants")
      .insert({ conversation_id: activeConv.id, user_id: userId });
    if (!error) {
      toast.success("החבר נוסף לקבוצה");
      await loadConversations();
      // Refresh active conv
      const { data } = await supabase.from("chat_conversations")
        .select("*, participants:chat_participants(user:users(id, full_name, avatar_url))")
        .eq("id", activeConv.id).single();
      if (data) setActiveConv(data);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeConv) return;
    if (!confirm("להסיר חבר מהקבוצה?")) return;
    await supabase.from("chat_participants")
      .delete().eq("conversation_id", activeConv.id).eq("user_id", userId);
    toast.success("החבר הוסר מהקבוצה");
    await loadConversations();
    const { data } = await supabase.from("chat_conversations")
      .select("*, participants:chat_participants(user:users(id, full_name, avatar_url))")
      .eq("id", activeConv.id).single();
    if (data) setActiveConv(data);
  };

  // ─── Helpers ──────────────────────────────────────────────────
  const getConvName = (conv: ChatConversation) => {
    if (conv.name) return conv.name;
    const other = conv.participants?.find((p: any) => p.user?.id !== user?.id);
    return (other as any)?.user?.full_name || "שיחה פרטית";
  };

  const getConvMembers = (conv: ChatConversation): User[] =>
    (conv.participants || []).map((p: any) => p.user).filter(Boolean) as User[];

  const msgById = Object.fromEntries(messages.map(m => [m.id, m]));
  const pinnedList = messages.filter(m => pinnedMessages.has(m.id));
  const filteredConvs = conversations.filter(c =>
    getConvName(c).toLowerCase().includes(convSearch.toLowerCase())
  );
  const displayMessages = msgSearch
    ? messages.filter(m => m.content.toLowerCase().includes(msgSearch.toLowerCase()))
    : messages;

  // Members not yet in group
  const nonMembers = activeConv
    ? users.filter(u => !getConvMembers(activeConv).some(m => m.id === u.id))
    : [];

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      <Header title="צ'אט" />
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <div className="w-72 border-l border-[#e2e8f0] bg-[#fafbfc] flex flex-col shrink-0">
          <div className="p-3 border-b border-[#f1f5f9] space-y-2 bg-white">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
              <Input placeholder="חיפוש שיחה..." value={convSearch} onChange={e => setConvSearch(e.target.value)} className="pr-9 h-8 bg-[#f8fafc]" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowNewChat(true)}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-[#16a34a] text-white rounded-lg py-1.5 hover:bg-[#15803d] font-medium transition-colors">
                <Plus className="h-3.5 w-3.5" /> שיחה חדשה
              </button>
              <button onClick={() => setShowNewGroup(true)}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-[#e2e8f0] bg-white rounded-lg py-1.5 hover:bg-[#f1f5f9] text-[#374151] font-medium transition-colors">
                <Users className="h-3.5 w-3.5" /> קבוצה
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {filteredConvs.length === 0 ? (
              <div className="text-center py-10 text-[#94a3b8]">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">אין שיחות</p>
              </div>
            ) : filteredConvs.map(conv => (
              <button key={conv.id} onClick={() => { setActiveConv(conv); setReplyTo(null); setMsgSearch(""); setShowMsgSearch(false); setShowGroupSettings(false); }}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2.5 text-right transition-colors relative border-r-2",
                  activeConv?.id === conv.id
                    ? "bg-[#f0fdf4] border-[#16a34a]"
                    : "hover:bg-white border-transparent"
                )}>
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 text-sm shadow-sm",
                  conv.type === "group" ? "bg-gradient-to-br from-blue-400 to-blue-600" : "bg-gradient-to-br from-[#16a34a] to-[#15803d]")}>
                  {conv.type === "group" ? <Users className="h-5 w-5" /> : getConvName(conv).charAt(0)}
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <p className={cn("font-semibold text-sm truncate", activeConv?.id === conv.id ? "text-[#0f172a]" : "text-[#374151]")}>{getConvName(conv)}</p>
                  <p className="text-xs text-[#94a3b8] truncate">
                    {conv.type === "group" ? `קבוצה · ${conv.participants?.length ?? 0} משתתפים` : "שיחה פרטית"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Chat Area ── */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col bg-[#f0f4f8] min-w-0">
            {activeConv ? (
              <>
                {/* Header */}
                <div className="bg-white border-b border-[#e2e8f0] px-5 py-3 flex items-center gap-3 shrink-0">
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-bold shrink-0",
                    activeConv.type === "group" ? "bg-blue-500" : "bg-[#16a34a]")}>
                    {activeConv.type === "group" ? <Users className="h-5 w-5" /> : getConvName(activeConv).charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[#0f172a]">{getConvName(activeConv)}</p>
                    <p className="text-xs text-[#64748b]">
                      {activeConv.type === "group" ? `${activeConv.participants?.length ?? 0} משתתפים` : "שיחה פרטית"}
                    </p>
                  </div>
                  {pinnedList.length > 0 && !showMsgSearch && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                      <Pin className="h-3 w-3" /> {pinnedList.length} מוצמד
                    </div>
                  )}
                  <button onClick={e => { e.stopPropagation(); setShowMsgSearch(v => !v); if (!showMsgSearch) setTimeout(() => msgSearchRef.current?.focus(), 50); }}
                    className={cn("p-1.5 rounded-lg transition-colors", showMsgSearch ? "bg-[#16a34a] text-white" : "text-[#94a3b8] hover:bg-[#f1f5f9]")} title="חיפוש">
                    <SearchIcon className="h-4 w-4" />
                  </button>
                  {activeConv.type === "group" && (
                    <button onClick={() => setShowGroupSettings(v => !v)}
                      className={cn("p-1.5 rounded-lg transition-colors", showGroupSettings ? "bg-[#16a34a] text-white" : "text-[#94a3b8] hover:bg-[#f1f5f9]")} title="הגדרות קבוצה">
                      <Settings className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Message search bar */}
                {showMsgSearch && (
                  <div className="bg-white border-b border-[#e2e8f0] px-4 py-2 flex gap-2 shrink-0">
                    <div className="relative flex-1">
                      <SearchIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
                      <Input ref={msgSearchRef} placeholder="חיפוש בהודעות..." value={msgSearch} onChange={e => setMsgSearch(e.target.value)} className="pr-9 h-8" />
                    </div>
                    {msgSearch && <span className="text-xs text-[#64748b] self-center whitespace-nowrap">{displayMessages.length} תוצאות</span>}
                    <button onClick={() => { setShowMsgSearch(false); setMsgSearch(""); }} className="text-[#94a3b8] hover:text-[#374151]"><X className="h-4 w-4" /></button>
                  </div>
                )}

                {/* Pinned bar */}
                {pinnedList.length > 0 && !showMsgSearch && (
                  <div className="bg-amber-50 border-b border-amber-100 px-4 py-1.5 space-y-0.5 shrink-0">
                    {pinnedList.map(pm => (
                      <div key={pm.id} className="flex items-center gap-2 text-xs text-amber-700">
                        <Pin className="h-3 w-3 shrink-0" />
                        <span className="font-medium">{pm.sender?.full_name}:</span>
                        <span className="truncate">{pm.content}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-0.5 chat-bg">
                  {displayMessages.map((msg, idx) => {
                    const isOwn    = msg.sender_id === user?.id;
                    const isPinned = pinnedMessages.has(msg.id);
                    const isEdited = editedIds.has(msg.id) || (msg as any).is_edited;
                    const isEditing = editingId === msg.id;
                    const isVoice  = (msg as any).message_type === "voice";
                    const prevMsg  = displayMessages[idx - 1];
                    const showName = !isOwn && prevMsg?.sender_id !== msg.sender_id;
                    const sameGroup = !showName && !isOwn;
                    const quotedMsg = (msg as any).reply_to ? msgById[(msg as any).reply_to] : null;
                    const highlighted = msgSearch && msg.content.toLowerCase().includes(msgSearch.toLowerCase());

                    // Reactions for this message
                    const msgReactions = aggregateReactions(rawReactions.filter(r => r.message_id === msg.id));

                    return (
                      <div key={msg.id} className={cn("group flex gap-2 relative", isOwn ? "flex-row-reverse" : "")}>
                        <div className="w-7 shrink-0 flex items-end">
                          {!isOwn && showName && (
                            <div className="w-7 h-7 rounded-full bg-[#e2e8f0] flex items-center justify-center text-xs font-bold text-[#64748b]">
                              {msg.sender?.full_name?.charAt(0) || "?"}
                            </div>
                          )}
                        </div>

                        <div className={cn("max-w-[70%] flex flex-col", isOwn ? "items-end" : "items-start", sameGroup && "mt-0.5")}>
                          {showName && <p className="text-xs text-[#94a3b8] mb-0.5 px-1">{msg.sender?.full_name}</p>}

                          {/* ── Inline action bar (no absolute = no off-screen clipping) ── */}
                          <div className={cn(
                            "flex items-center gap-0.5 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
                            "bg-white rounded-full shadow-sm border border-[#e2e8f0] px-1 py-0.5",
                            isOwn ? "self-end" : "self-start"
                          )}>
                            <button onClick={e => { e.nativeEvent.stopImmediatePropagation(); setShowReactionFor(showReactionFor === msg.id ? null : msg.id); }}
                              className="p-1 rounded-full hover:bg-[#f1f5f9] text-[#64748b] text-sm" title="תגובה">😊</button>
                            <button onClick={() => { setReplyTo(msg); textareaRef.current?.focus(); }}
                              className="p-1 rounded-full hover:bg-[#f1f5f9] text-[#64748b]" title="ענה">
                              <Reply className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handlePin(msg.id)}
                              className={cn("p-1 rounded-full hover:bg-[#f1f5f9]", isPinned ? "text-amber-500" : "text-[#64748b]")} title={isPinned ? "הסר הצמדה" : "הצמד"}>
                              <Pin className="h-3.5 w-3.5" />
                            </button>
                            {isOwn && !isVoice && (
                              <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }}
                                className="p-1 rounded-full hover:bg-[#f1f5f9] text-[#64748b]" title="ערוך">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {isOwn && (
                              <button onClick={() => handleDelete(msg.id)}
                                className="p-1 rounded-full hover:bg-red-50 text-red-400" title="מחק">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* ── Inline emoji reaction picker ── */}
                          {showReactionFor === msg.id && (
                            <div className={cn(
                              "flex gap-1 mb-1 p-1.5 bg-white rounded-2xl shadow-md border border-[#e2e8f0] flex-wrap",
                              isOwn ? "self-end" : "self-start"
                            )} onClick={e => e.nativeEvent.stopImmediatePropagation()}>
                              {QUICK_EMOJIS.map(em => (
                                <button key={em} onClick={e => { e.nativeEvent.stopImmediatePropagation(); handleReaction(msg.id, em); }}
                                  className="text-xl hover:scale-125 transition-transform p-0.5">{em}</button>
                              ))}
                            </div>
                          )}

                          <div>

                            {/* Edit mode */}
                            {isEditing ? (
                              <div className="flex gap-2 items-end">
                                <textarea
                                  className="rounded-xl px-3 py-2 text-sm border-2 border-[#16a34a] focus:outline-none resize-none bg-white"
                                  value={editContent}
                                  onChange={e => setEditContent(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSave(msg.id); }
                                    if (e.key === "Escape") setEditingId(null);
                                  }}
                                  rows={2} autoFocus style={{ minWidth: "200px" }} dir="rtl"
                                />
                                <div className="flex flex-col gap-1">
                                  <button onClick={() => handleEditSave(msg.id)} className="p-1.5 rounded-full bg-[#16a34a] text-white"><Check className="h-3.5 w-3.5" /></button>
                                  <button onClick={() => setEditingId(null)} className="p-1.5 rounded-full bg-[#e2e8f0] text-[#64748b]"><X className="h-3.5 w-3.5" /></button>
                                </div>
                              </div>
                            ) : (
                              <div className={cn(
                                "rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                                isOwn ? "bg-[#16a34a] text-white rounded-tl-sm" : "bg-white text-[#0f172a] rounded-tr-sm border border-[#f0f0f0]",
                                isPinned && "ring-2 ring-amber-400 ring-offset-1",
                                highlighted && "ring-2 ring-yellow-300"
                              )}>
                                {/* Reply quote */}
                                {quotedMsg && (
                                  <div className={cn("mb-2 px-2.5 py-1.5 rounded-lg text-xs border-r-2",
                                    isOwn ? "bg-[#15803d]/40 border-white/60 text-white/90" : "bg-[#f1f5f9] border-[#16a34a] text-[#374151]")}>
                                    <p className="font-semibold mb-0.5">{quotedMsg.sender?.full_name || "הודעה"}</p>
                                    <p className="truncate">{(quotedMsg as any).message_type === "voice" ? "🎤 הודעה קולית" : quotedMsg.content}</p>
                                  </div>
                                )}

                                {/* GIF / image — detected by __IMG__ prefix */}
                                {msg.content?.startsWith("__IMG__") ? (
                                  <img src={msg.content.slice(7)} alt="GIF" className="rounded-xl max-w-[240px] max-h-[200px] object-contain" loading="lazy" />
                                ) : /* Voice message */ isVoice ? (
                                  <div className="flex items-center gap-2 min-w-[160px]">
                                    <button onClick={() => togglePlay(msg.id, msg.content)}
                                      className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                        isOwn ? "bg-white/20 hover:bg-white/30" : "bg-[#16a34a] text-white hover:bg-[#15803d]")}>
                                      {playingVoice === msg.id
                                        ? <Pause className="h-4 w-4" />
                                        : <Play className="h-4 w-4 ml-0.5" />}
                                    </button>
                                    {/* Simple waveform bars */}
                                    <div className="flex items-center gap-0.5 flex-1">
                                      {[3,5,8,6,4,7,5,3,6,8,4,5].map((h, i) => (
                                        <div key={i} className={cn("rounded-full w-1 transition-all",
                                          isOwn ? "bg-white/70" : "bg-[#16a34a]/60",
                                          playingVoice === msg.id && "animate-pulse")}
                                          style={{ height: `${h * 2}px` }} />
                                      ))}
                                    </div>
                                    <span className={cn("text-xs shrink-0", isOwn ? "text-white/70" : "text-[#94a3b8]")}>
                                      🎤
                                    </span>
                                  </div>
                                ) : (
                                  <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                                ) /* end gif/voice/text */}

                                {isEdited && !isVoice && (
                                  <span className={cn("text-xs opacity-60", isOwn ? "text-white" : "text-[#94a3b8]")}> (ערוך)</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Reactions */}
                          {Object.keys(msgReactions).length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {Object.entries(msgReactions).map(([emoji, uids]) => (
                                <button key={emoji} onClick={() => handleReaction(msg.id, emoji)}
                                  className={cn("flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors",
                                    uids.includes(user?.id || "")
                                      ? "bg-[#16a34a] text-white border-[#16a34a]"
                                      : "bg-white text-[#374151] border-[#e2e8f0] hover:border-[#16a34a]")}>
                                  {emoji} <span>{uids.length}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          <div className={cn("flex items-center gap-1 mt-0.5 px-1", isOwn ? "justify-end" : "justify-start")}>
                            <p className="text-xs text-[#94a3b8]">{formatTime(msg.created_at)}</p>
                            {isOwn && (() => {
                              const otherMembers = getConvMembers(activeConv).filter(m => m.id !== user?.id);
                              const readers = readReceipts[msg.id] || [];
                              const allRead = otherMembers.length > 0 && otherMembers.every(m => readers.includes(m.id));
                              return allRead
                                ? <span className="text-[10px] font-bold text-blue-400" title="נקרא">✓✓</span>
                                : <span className="text-[10px] text-[#94a3b8]" title="נשלח">✓</span>;
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />

                  {typingUsers.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-[#64748b] pr-9 mt-1">
                      <div className="flex gap-0.5">
                        {[0,1,2].map(i => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#94a3b8] animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                        ))}
                      </div>
                      {typingUsers.join(", ")} {typingUsers.length === 1 ? "מקליד/ה..." : "מקלידים..."}
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="bg-white border-t border-[#e2e8f0] p-3 shrink-0" onClick={e => e.nativeEvent.stopImmediatePropagation()}>
                  {replyTo && (
                    <div className="flex items-center gap-2 mb-2 p-2 bg-[#f0fdf4] rounded-xl border border-[#bbf7d0]">
                      <Reply className="h-4 w-4 text-[#16a34a] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#16a34a]">תגובה ל{replyTo.sender?.full_name}</p>
                        <p className="text-xs text-[#64748b] truncate">
                          {(replyTo as any).message_type === "voice" ? "🎤 הודעה קולית" : replyTo.content}
                        </p>
                      </div>
                      <button onClick={() => setReplyTo(null)} className="text-[#94a3b8] hover:text-[#374151] shrink-0"><X className="h-4 w-4" /></button>
                    </div>
                  )}

                  {showEmojiPicker && (
                    <div className="mb-2 p-2.5 bg-[#f8fafc] rounded-xl border border-[#e2e8f0] max-h-40 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {ALL_EMOJIS.map(em => (
                          <button key={em} onClick={e => { e.nativeEvent.stopImmediatePropagation(); setNewMessage(prev => prev + em); setShowEmojiPicker(false); textareaRef.current?.focus(); }}
                            className="text-xl hover:scale-125 transition-transform p-0.5">{em}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {showGifPicker && (
                    <div className="mb-2 bg-white rounded-xl border border-[#e2e8f0] shadow-lg overflow-hidden" onClick={e => e.nativeEvent.stopImmediatePropagation()}>
                      {/* Tabs */}
                      <div className="flex items-center border-b border-[#f1f5f9]">
                        <button onClick={() => setGifTab("search")}
                          className={cn("flex-1 text-xs py-2.5 font-semibold transition-colors border-b-2",
                            gifTab === "search" ? "text-[#16a34a] border-[#16a34a]" : "text-[#94a3b8] border-transparent hover:text-[#374151]")}>
                          חיפוש
                        </button>
                        <button onClick={() => { setGifTab("saved"); loadSavedGifs(); }}
                          className={cn("flex-1 text-xs py-2.5 font-semibold transition-colors border-b-2",
                            gifTab === "saved" ? "text-[#16a34a] border-[#16a34a]" : "text-[#94a3b8] border-transparent hover:text-[#374151]")}>
                          שמורים {savedGifs.length > 0 && `(${savedGifs.length})`}
                        </button>
                        <button onClick={() => { setShowGifPicker(false); setGifSearch(""); setGifResults([]); }}
                          className="px-2.5 text-[#94a3b8] hover:text-[#374151]">
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Search tab */}
                      {gifTab === "search" && (
                        <>
                          <div className="p-2 border-b border-[#f1f5f9] flex gap-2 items-center">
                            <input
                              className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-[#e2e8f0] focus:outline-none focus:border-[#16a34a]"
                              placeholder="חפש GIF... (לדוגמה: funny, hello, yes)"
                              value={gifSearch}
                              onChange={e => { setGifSearch(e.target.value); searchGifs(e.target.value); }}
                              dir="ltr" autoFocus
                            />
                          </div>
                          <div className="p-2 max-h-48 overflow-y-auto">
                            {gifLoading ? (
                              <p className="text-center text-sm text-[#94a3b8] py-4">טוען...</p>
                            ) : gifResults.length === 0 ? (
                              <p className="text-center text-sm text-[#94a3b8] py-4">{gifSearch ? "לא נמצאו תוצאות" : "הקלד לחיפוש GIF"}</p>
                            ) : (
                              <div className="grid grid-cols-4 gap-1.5">
                                {gifResults.map((g: any) => {
                                  const url = g.media_formats?.gif?.url || g.media_formats?.tinygif?.url;
                                  if (!url) return null;
                                  return (
                                    <button key={g.id} onClick={() => handleSendGif(url).catch(e => toast.error(e.message))}
                                      className="rounded-lg overflow-hidden hover:ring-2 hover:ring-[#16a34a] transition-all aspect-square bg-[#f1f5f9]">
                                      <img src={g.media_formats?.tinygif?.url || url} alt={g.title} className="w-full h-full object-cover" loading="lazy" />
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* Saved tab */}
                      {gifTab === "saved" && (
                        <div className="p-2 max-h-56 overflow-y-auto">
                          <div className="mb-2">
                            <button onClick={() => gifFileRef.current?.click()}
                              className="w-full py-2 text-xs rounded-lg border border-dashed border-[#16a34a] text-[#16a34a] hover:bg-[#f0fdf4] font-medium transition-colors">
                              + העלה GIF חדש מהמחשב
                            </button>
                            <input ref={gifFileRef} type="file" accept="image/gif,.gif" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleGifFileUpload(f); }} />
                          </div>
                          {savedGifsLoading ? (
                            <p className="text-center text-sm text-[#94a3b8] py-4">טוען...</p>
                          ) : savedGifs.length === 0 ? (
                            <p className="text-center text-sm text-[#94a3b8] py-4">אין GIF שמורים — העלה את הראשון!</p>
                          ) : (
                            <div className="grid grid-cols-4 gap-1.5">
                              {savedGifs.map((url, i) => (
                                <button key={i} onClick={() => handleSendGif(url).catch(e => toast.error(e.message))}
                                  className="rounded-lg overflow-hidden hover:ring-2 hover:ring-[#16a34a] transition-all aspect-square bg-[#f1f5f9]">
                                  <img src={url} alt="GIF שמור" className="w-full h-full object-cover" loading="lazy" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recording UI */}
                  {recording ? (
                    <div className="flex items-center gap-3 px-2 py-2 bg-red-50 rounded-xl border border-red-200">
                      <div className="flex gap-1 items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm font-mono text-red-600">
                          {String(Math.floor(recordSecs / 60)).padStart(2,"0")}:{String(recordSecs % 60).padStart(2,"0")}
                        </span>
                      </div>
                      <div className="flex gap-1 flex-1">
                        {[2,5,8,4,7,3,6,8,4,6,3,5].map((h, i) => (
                          <div key={i} className="w-1 rounded-full bg-red-400 animate-pulse"
                            style={{ height: `${h*2}px`, animationDelay: `${i*100}ms` }} />
                        ))}
                      </div>
                      <button onClick={cancelRecording} className="p-1.5 rounded-full bg-white text-[#94a3b8] hover:text-red-500 border border-[#e2e8f0]" title="ביטול">
                        <X className="h-4 w-4" />
                      </button>
                      <button onClick={stopRecording} className="p-2 rounded-full bg-red-500 text-white hover:bg-red-600" title="שלח">
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-end">
                      <button onClick={e => { e.nativeEvent.stopImmediatePropagation(); setShowEmojiPicker(v => !v); setShowGifPicker(false); }}
                        className={cn("p-2 rounded-lg transition-colors shrink-0",
                          showEmojiPicker ? "bg-[#16a34a] text-white" : "text-[#94a3b8] hover:text-[#374151] hover:bg-[#f1f5f9]")} title="אימוג'י">
                        😊
                      </button>
                      <button onClick={e => { e.nativeEvent.stopImmediatePropagation(); setShowGifPicker(v => !v); setShowEmojiPicker(false); }}
                        className={cn("p-2 rounded-lg transition-colors shrink-0 text-xs font-bold",
                          showGifPicker ? "bg-[#16a34a] text-white" : "text-[#94a3b8] hover:text-[#374151] hover:bg-[#f1f5f9]")} title="GIF">
                        GIF
                      </button>
                      <textarea
                        ref={textareaRef}
                        className="flex-1 rounded-xl border border-[#e2e8f0] px-3 py-2 text-sm focus:outline-none focus:border-[#16a34a] resize-none bg-white"
                        placeholder="כתוב הודעה... (Enter לשליחה, Shift+Enter לשורה חדשה)"
                        value={newMessage}
                        onChange={e => {
                          setNewMessage(e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                          broadcastTyping();
                        }}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        rows={1} style={{ maxHeight: "120px", minHeight: "40px" }} dir="rtl"
                      />
                      {newMessage.trim() ? (
                        <Button onClick={handleSend} loading={sending} size="icon" className="shrink-0"><Send className="h-4 w-4" /></Button>
                      ) : (
                        <button onMouseDown={startRecording} onTouchStart={startRecording}
                          className="p-2.5 rounded-xl bg-[#f1f5f9] text-[#64748b] hover:bg-[#16a34a] hover:text-white transition-colors shrink-0" title="לחץ להקלטה">
                          <Mic className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-4 border border-[#e2e8f0]">
                    <MessageSquare className="h-10 w-10 text-[#16a34a] opacity-60" />
                  </div>
                  <p className="text-lg font-semibold text-[#374151]">בחר שיחה להתחלה</p>
                  <p className="text-sm text-[#94a3b8] mt-1">או פתח שיחה חדשה מהתפריט הצד</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Group Settings Panel ── */}
          {showGroupSettings && activeConv?.type === "group" && (
            <div className="w-64 bg-white border-r border-[#e2e8f0] flex flex-col shrink-0 overflow-y-auto">
              <div className="p-4 border-b border-[#f1f5f9]">
                <p className="font-semibold text-[#0f172a]">הגדרות קבוצה</p>
                <p className="text-xs text-[#64748b] mt-0.5">{getConvName(activeConv)}</p>
              </div>

              {/* Members list */}
              <div className="p-3">
                <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-2">חברים ({getConvMembers(activeConv).length})</p>
                <div className="space-y-1">
                  {getConvMembers(activeConv).map(member => (
                    <div key={member.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#f8fafc] group">
                      <div className="w-8 h-8 rounded-full bg-[#16a34a] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {member.full_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#0f172a] truncate">{member.full_name}</p>
                        {member.id === activeConv.created_by && (
                          <p className="text-[10px] text-[#16a34a]">מנהל</p>
                        )}
                      </div>
                      {member.id !== user?.id && activeConv.created_by === user?.id && (
                        <button onClick={() => handleRemoveMember(member.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 transition-all" title="הסר">
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Add members */}
              {nonMembers.length > 0 && activeConv.created_by === user?.id && (
                <div className="p-3 border-t border-[#f1f5f9]">
                  <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-2">הוסף חברים</p>
                  <div className="space-y-1">
                    {nonMembers.map(u => (
                      <button key={u.id} onClick={() => handleAddMember(u.id)}
                        className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-[#f0fdf4] text-right">
                        <div className="w-7 h-7 rounded-full bg-[#e2e8f0] flex items-center justify-center text-xs font-bold text-[#64748b] shrink-0">
                          {u.full_name.charAt(0)}
                        </div>
                        <span className="text-sm text-[#374151] flex-1 truncate">{u.full_name}</span>
                        <UserPlus className="h-3.5 w-3.5 text-[#16a34a]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Leave group */}
              <div className="p-3 border-t border-[#f1f5f9] mt-auto">
                <button
                  onClick={async () => {
                    if (!confirm("לעזוב את הקבוצה?")) return;
                    await supabase.from("chat_participants").delete().eq("conversation_id", activeConv.id).eq("user_id", user!.id);
                    setActiveConv(null);
                    setShowGroupSettings(false);
                    await loadConversations();
                    toast.success("עזבת את הקבוצה");
                  }}
                  className="w-full text-sm text-red-500 hover:text-red-700 py-1.5 flex items-center justify-center gap-1.5"
                >
                  <UserMinus className="h-4 w-4" /> עזוב קבוצה
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── New Private Chat Modal ── */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowNewChat(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-5 w-80 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[#0f172a]">שיחה חדשה</h3>
              <button onClick={() => setShowNewChat(false)} className="text-[#94a3b8]"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1 overflow-y-auto">
              {users.map(u => (
                <button key={u.id} onClick={() => handleNewPrivateChat(u)}
                  className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-[#f0fdf4] text-right">
                  <div className="w-9 h-9 rounded-full bg-[#16a34a] flex items-center justify-center text-white font-bold text-sm shrink-0">{u.full_name.charAt(0)}</div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-[#0f172a]">{u.full_name}</p>
                    <p className="text-xs text-[#94a3b8]">{u.email}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── New Group Modal ── */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowNewGroup(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-5 w-96 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[#0f172a]">קבוצה חדשה</h3>
              <button onClick={() => setShowNewGroup(false)} className="text-[#94a3b8]"><X className="h-4 w-4" /></button>
            </div>
            <Input placeholder="שם הקבוצה" value={groupName} onChange={e => setGroupName(e.target.value)} className="mb-3" dir="rtl" />
            <p className="text-xs text-[#64748b] mb-2">בחר משתתפים:</p>
            <div className="space-y-1 overflow-y-auto flex-1 mb-4">
              {users.map(u => (
                <label key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#f8fafc] cursor-pointer">
                  <input type="checkbox" checked={groupMembers.includes(u.id)}
                    onChange={e => setGroupMembers(prev => e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id))}
                    className="w-4 h-4 accent-[#16a34a] shrink-0" />
                  <div className="w-8 h-8 rounded-full bg-[#16a34a] flex items-center justify-center text-white text-xs font-bold shrink-0">{u.full_name.charAt(0)}</div>
                  <span className="text-sm text-[#0f172a]">{u.full_name}</span>
                </label>
              ))}
            </div>
            <Button onClick={handleCreateGroup} disabled={!groupName.trim() || groupMembers.length === 0} className="w-full">
              <Users className="h-4 w-4" />
              צור קבוצה{groupMembers.length > 0 ? ` (${groupMembers.length} משתתפים)` : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
