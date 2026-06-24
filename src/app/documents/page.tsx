"use client";

import { useState, useEffect, useRef } from "react";
import { FileText, Upload, Download, Trash2, Search, FolderOpen, Eye, Plus } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

interface Doc {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  category: string;
  created_at: string;
  created_by: string;
  uploader?: { full_name: string };
  customer_id?: string | null;
  customer?: { company_name: string } | null;
}

const CATEGORIES = [
  { value: "all", label: "הכל" },
  { value: "procedure", label: "נוהל" },
  { value: "contract", label: "חוזה" },
  { value: "report", label: "דוח" },
  { value: "other", label: "אחר" },
];

export default function DocumentsPage() {
  const { user } = useAuthStore();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: "", description: "", category: "procedure" });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadDocs(); }, [category, user]);

  const loadDocs = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase.from("documents")
        .select("*, uploader:users(full_name), customer:customers(company_name)")
        .order("created_at", { ascending: false });

      if (category !== "all") query = query.eq("category", category);

      const { data } = await query;
      setDocs(data || []);
    } catch { toast.error("שגיאה בטעינה"); }
    finally { setLoading(false); }
  };

  const handleUpload = async () => {
    if (!newDoc.title.trim()) { toast.error("יש להזין כותרת"); return; }
    if (!user) return;
    setUploading(true);
    try {
      let fileUrl = null;
      let fileType = null;

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `documents/${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
        fileUrl = urlData.publicUrl;
        fileType = file.type;
      }

      const { error } = await supabase.from("documents").insert({
        title: newDoc.title,
        description: newDoc.description || null,
        category: newDoc.category,
        file_url: fileUrl,
        file_type: fileType,
        created_by: user.id,
      });

      if (error) throw error;
      toast.success("המסמך נוסף בהצלחה");
      setShowAdd(false);
      setNewDoc({ title: "", description: "", category: "procedure" });
      setFile(null);
      loadDocs();
    } catch (err: any) {
      toast.error(err.message || "שגיאה בהוספה");
    } finally { setUploading(false); }
  };

  const handleDelete = async (doc: Doc) => {
    if (!confirm(`למחוק את "${doc.title}"?`)) return;
    try {
      await supabase.from("documents").delete().eq("id", doc.id);
      toast.success("המסמך נמחק");
      loadDocs();
    } catch { toast.error("שגיאה במחיקה"); }
  };

  const filtered = docs.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.description?.toLowerCase().includes(search.toLowerCase())
  );

  const getCategoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;
  const getCategoryColor = (cat: string) => ({
    procedure: "info", contract: "warning", report: "success", other: "secondary"
  }[cat] || "secondary") as any;

  const getFileIcon = (type: string | null) => {
    if (!type) return "📄";
    if (type.includes("pdf")) return "📕";
    if (type.includes("word") || type.includes("document")) return "📘";
    if (type.includes("sheet") || type.includes("excel")) return "📗";
    if (type.includes("image")) return "🖼️";
    return "📄";
  };

  return (
    <div>
      <Header title="נהלים ומסמכים" />
      <div className="p-6 space-y-5">
        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
            <Input placeholder="חיפוש מסמך..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> מסמך חדש
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {CATEGORIES.slice(1).map(cat => {
            const count = docs.filter(d => d.category === cat.value).length;
            return (
              <Card key={cat.value} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCategory(cat.value)}>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-[#0f172a]">{count}</p>
                  <p className="text-sm text-[#64748b]">{cat.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Docs list */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-36 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[#94a3b8]">
            <FolderOpen className="h-16 w-16 mx-auto mb-3 opacity-20" />
            <p className="text-lg">אין מסמכים להצגה</p>
            <p className="text-sm mt-1">לחצי על "מסמך חדש" כדי להוסיף</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(doc => (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl mt-0.5">{getFileIcon(doc.file_type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-[#0f172a] text-sm leading-tight">{doc.title}</p>
                        <Badge variant={getCategoryColor(doc.category)} className="text-[10px] shrink-0">
                          {getCategoryLabel(doc.category)}
                        </Badge>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-[#64748b] mt-1 line-clamp-2">{doc.description}</p>
                      )}
                      {doc.customer && (
                        <p className="text-xs text-[#94a3b8] mt-1">לקוח: {doc.customer.company_name}</p>
                      )}
                      <p className="text-xs text-[#94a3b8] mt-2">
                        {doc.uploader?.full_name} · {formatDate(doc.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#f1f5f9]">
                    {doc.file_url ? (
                      <>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            <Eye className="h-3 w-3" /> צפייה
                          </Button>
                        </a>
                        <a href={doc.file_url} download>
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            <Download className="h-3 w-3" /> הורדה
                          </Button>
                        </a>
                      </>
                    ) : (
                      <span className="text-xs text-[#94a3b8]">ללא קובץ מצורף</span>
                    )}
                    {(user?.role === "admin" || doc.created_by === user?.id) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-500 hover:text-red-600 mr-auto"
                        onClick={() => handleDelete(doc)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add dialog */}
      {showAdd && (
        <Dialog open onOpenChange={() => setShowAdd(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>מסמך חדש</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-2 space-y-4">
              <div className="space-y-1.5">
                <Label>כותרת *</Label>
                <Input
                  placeholder="שם המסמך"
                  value={newDoc.title}
                  onChange={e => setNewDoc(p => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>תיאור</Label>
                <Textarea
                  placeholder="תיאור קצר..."
                  value={newDoc.description}
                  onChange={e => setNewDoc(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>קטגוריה</Label>
                <Select value={newDoc.category} onValueChange={v => setNewDoc(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.slice(1).map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>קובץ (אופציונלי)</Label>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-[#e2e8f0] rounded-lg p-4 text-center cursor-pointer hover:border-[#16a34a] hover:bg-[#f0fdf4] transition-colors"
                >
                  {file ? (
                    <p className="text-sm text-[#16a34a]">✓ {file.name}</p>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 mx-auto mb-1 text-[#94a3b8]" />
                      <p className="text-sm text-[#64748b]">לחצי להעלאת קובץ</p>
                      <p className="text-xs text-[#94a3b8]">PDF, Word, Excel, תמונות</p>
                    </>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>ביטול</Button>
              <Button onClick={handleUpload} loading={uploading}>הוסף מסמך</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
