"use client";

import { useState, useEffect, useRef } from "react";
import { FileText, Download, ExternalLink, Search, FolderOpen, Upload, Plus } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase, authHeader } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface Doc {
  id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  category: string;
  created_at: string;
  customer_id?: string | null;
}

const FILE_ICONS: Record<string, string> = {
  pdf: "📄", word: "📝", excel: "📊", image: "🖼️", video: "🎬", link: "🔗",
};

const CATEGORY_LABELS: Record<string, string> = {
  procedure: "נוהל", contract: "חוזה", report: "דוח",
  receipt: "קבלה", payment_request: "דרישת תשלום", other: "אחר", "כללי": "כללי",
};

export default function PortalDocumentsPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [docs, setDocs]       = useState<Doc[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [newDoc, setNewDoc]   = useState({ title: "", description: "", category: "receipt" });
  const [file, setFile]       = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "client") { router.push("/dashboard"); return; }

    // Get customer context
    authHeader().then(h => fetch(`/api/portal?user_id=${user.id}`, { headers: h }))
      .then(r => r.json())
      .then(d => {
        const cid = d.customer?.id || null;
        setCustomerId(cid);
        loadDocs(cid);
      })
      .catch(() => setLoading(false));
  }, [user]);

  const loadDocs = async (cid: string | null) => {
    setLoading(true);
    try {
      let q = supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false });

      // Show public docs + docs for this customer
      if (cid) {
        q = q.or(`customer_id.is.null,customer_id.eq.${cid}`);
      } else {
        q = q.is("customer_id", null);
      }

      const { data } = await q;
      setDocs(data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!newDoc.title.trim()) { toast.error("יש להזין כותרת"); return; }
    if (!file) { toast.error("יש לבחור קובץ"); return; }
    if (!user) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("bucket", "attachments");
      form.append("path", `documents/${user.id}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_")}`);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: form, headers: await authHeader() });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error || "שגיאה בהעלאת הקובץ");

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          title: newDoc.title,
          description: newDoc.description || null,
          category: newDoc.category,
          file_url: uploadJson.url,
          file_type: file.type,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "שגיאה בשמירה");

      toast.success("המסמך נשלח בהצלחה");
      setShowUpload(false);
      setNewDoc({ title: "", description: "", category: "receipt" });
      setFile(null);
      loadDocs(customerId);
    } catch (err: any) {
      toast.error(err.message || "שגיאה בהעלאה");
    } finally {
      setUploading(false);
    }
  };

  const filteredDocs = docs.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    (d.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const grouped: Record<string, Doc[]> = {};
  filteredDocs.forEach(d => {
    const cat = d.category || "כללי";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(d);
  });

  if (loading) return (
    <div>
      <Header title="מסמכים ונהלים" />
      <div className="p-6 space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div>
      <Header title="מסמכים ונהלים" />
      <div className="p-6 space-y-4">

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
            <Input
              placeholder="חיפוש מסמך..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Button onClick={() => setShowUpload(true)}>
            <Plus className="h-4 w-4" /> העלאת קבלה / דרישת תשלום
          </Button>
        </div>

        {filteredDocs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-[#94a3b8]">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>אין מסמכים להצגה</p>
            </CardContent>
          </Card>
        ) : Object.entries(grouped).map(([category, catDocs]) => (
          <div key={category}>
            <h3 className="font-bold text-[#0f172a] mb-2 flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-[#16a34a]" /> {CATEGORY_LABELS[category] || category}
            </h3>
            <div className="space-y-2">
              {catDocs.map(doc => (
                <Card key={doc.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="text-2xl shrink-0">
                      {FILE_ICONS[doc.file_type || ""] || "📄"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#0f172a] truncate">{doc.title}</p>
                      {doc.description && (
                        <p className="text-sm text-[#64748b] truncate mt-0.5">{doc.description}</p>
                      )}
                      <p className="text-xs text-[#94a3b8] mt-1">{formatDate(doc.created_at)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {doc.file_url && (
                        <>
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[#e2e8f0] rounded-lg hover:bg-[#f8fafc] text-[#374151] transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> פתח
                          </a>
                          <a
                            href={doc.file_url}
                            download
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#16a34a] text-white rounded-lg hover:bg-[#15803d] transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" /> הורד
                          </a>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showUpload && (
        <Dialog open onOpenChange={() => setShowUpload(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>העלאת קבלה / דרישת תשלום</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-2 space-y-4">
              <div className="space-y-1.5">
                <Label>כותרת *</Label>
                <Input
                  placeholder="לדוגמה: קבלה - ינואר 2026"
                  value={newDoc.title}
                  onChange={e => setNewDoc(p => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>סוג</Label>
                <Select value={newDoc.category} onValueChange={v => setNewDoc(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receipt">קבלה</SelectItem>
                    <SelectItem value="payment_request">דרישת תשלום</SelectItem>
                    <SelectItem value="other">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>הערה (אופציונלי)</Label>
                <Input
                  placeholder="הערה קצרה..."
                  value={newDoc.description}
                  onChange={e => setNewDoc(p => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>קובץ *</Label>
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
              <Button variant="outline" onClick={() => setShowUpload(false)}>ביטול</Button>
              <Button onClick={handleUpload} loading={uploading}>שלח</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
