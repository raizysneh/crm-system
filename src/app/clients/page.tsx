"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Building2, Phone, Mail, MoreVertical, Edit, Trash2, Power } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase/client";
import { Customer } from "@/types";
import { toast } from "sonner";
import Link from "next/link";
import ClientFormDialog from "@/components/clients/ClientFormDialog";

export default function ClientsPage() {
  const [clients, setClients] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState<Customer | null>(null);

  useEffect(() => {
    loadClients();
  }, [showInactive]);

  const loadClients = async () => {
    setLoading(true);
    try {
      let query = supabase.from("customers").select(`
        *,
        phones:customer_phones(id, phone, label)
      `).order("company_name");

      if (!showInactive) query = query.eq("status", "active");

      const { data, error } = await query;
      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      toast.error("שגיאה בטעינת לקוחות");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (client: Customer) => {
    const newStatus = client.status === "active" ? "inactive" : "active";
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: client.id, status: newStatus }),
    });
    if (!res.ok) toast.error("שגיאה בעדכון סטטוס");
    else {
      toast.success(newStatus === "active" ? "הלקוח הופעל מחדש" : "הלקוח הושבת");
      loadClients();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק לקוח זה?")) return;
    const res = await fetch(`/api/customers?id=${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("שגיאה במחיקה");
    else { toast.success("הלקוח הוסר"); loadClients(); }
  };

  const filtered = clients.filter(c =>
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const getUsageColor = (pct?: number) => {
    if (!pct) return "bg-[#16a34a]";
    if (pct >= 100) return "bg-red-500";
    if (pct >= 80) return "bg-yellow-500";
    return "bg-[#16a34a]";
  };

  return (
    <div>
      <Header title="לקוחות" />
      <div className="p-6 space-y-5">
        {/* Actions bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
            <Input
              placeholder="חיפוש לקוח..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Button variant="outline" onClick={() => setShowInactive(!showInactive)} size="sm">
            {showInactive ? "הסתר לא פעילים" : "הצג לא פעילים"}
          </Button>
          <Button onClick={() => { setEditClient(null); setShowForm(true); }}>
            <Plus className="h-4 w-4" />
            לקוח חדש
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "סה\"כ לקוחות", value: clients.length,                                        color: "text-[#0f172a]",  bg: "bg-white",          border: "border-[#e2e8f0]", accent: "bg-[#e2e8f0]" },
            { label: "פעילים",        value: clients.filter(c => c.status === "active").length,    color: "text-green-600",  bg: "bg-green-50/60",    border: "border-green-100", accent: "bg-green-200" },
            { label: "לא פעילים",     value: clients.filter(c => c.status === "inactive").length,  color: "text-[#94a3b8]",  bg: "bg-slate-50/60",    border: "border-slate-100", accent: "bg-slate-200" },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl border ${s.border} p-4 flex items-center gap-4`}>
              <div className={`w-10 h-10 rounded-full ${s.accent} flex items-center justify-center shrink-0`}>
                <Building2 className="h-5 w-5 text-white opacity-70" />
              </div>
              <div>
                <p className={`text-2xl font-bold leading-none ${s.color}`}>{s.value}</p>
                <p className="text-sm text-[#64748b] mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Clients Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton h-44 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[#94a3b8]">
            <Building2 className="h-14 w-14 mx-auto mb-3 opacity-20" />
            <p className="text-lg">לא נמצאו לקוחות</p>
            <p className="text-sm mt-1">
              {search ? "נסה חיפוש אחר" : "לחץ על 'לקוח חדש' להוספה"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((client) => (
              <Card key={client.id} className={`relative transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${client.status === "inactive" ? "opacity-55" : ""}`}>
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-4">
                    {client.logo_url ? (
                      <img src={client.logo_url} alt={client.company_name} className="w-12 h-12 rounded-lg object-contain border border-[#e2e8f0]" />
                    ) : (
                      <div className="w-12 h-12 bg-[#f1f5f9] rounded-lg flex items-center justify-center text-[#64748b] font-bold text-lg">
                        {client.company_name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <Link href={`/clients/${client.id}`}>
                        <h3 className="font-semibold text-[#0f172a] hover:text-[#16a34a] truncate">{client.company_name}</h3>
                      </Link>
                      {client.contact_name && (
                        <p className="text-sm text-[#64748b] truncate">{client.contact_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={client.status === "active" ? "success" : "ghost"}>
                        {client.status === "active" ? "פעיל" : "לא פעיל"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1 rounded-md hover:bg-[#f1f5f9] text-[#64748b]">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => { setEditClient(client); setShowForm(true); }}>
                            <Edit className="h-4 w-4" /> ערוך
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(client)}>
                            <Power className="h-4 w-4" />
                            {client.status === "active" ? "השבת" : "הפעל"}
                          </DropdownMenuItem>
                          <DropdownMenuItem destructive onClick={() => handleDelete(client.id)}>
                            <Trash2 className="h-4 w-4" /> מחק
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="space-y-1.5 mb-4">
                    {client.email && (
                      <div className="flex items-center gap-2 text-xs text-[#64748b]">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phones && client.phones[0] && (
                      <div className="flex items-center gap-2 text-xs text-[#64748b]">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span dir="ltr">{client.phones[0].phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Hours package */}
                  {client.monthly_hours && (
                    <div>
                      <div className="flex justify-between text-xs text-[#64748b] mb-1.5">
                        <span>חבילת שעות</span>
                        <span className={client.usage_percentage && client.usage_percentage >= 80 ? "text-red-500 font-medium" : ""}>
                          {Math.round(client.usage_percentage || 0)}%
                        </span>
                      </div>
                      <Progress
                        value={Math.min(client.usage_percentage || 0, 100)}
                        color={getUsageColor(client.usage_percentage)}
                      />
                      <div className="flex justify-between text-xs text-[#94a3b8] mt-1">
                        <span>{client.hours_used || 0} שע' שנוצלו</span>
                        <span>{client.monthly_hours} שע' בחודש</span>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ClientFormDialog
          client={editClient}
          onClose={() => { setShowForm(false); setEditClient(null); }}
          onSave={loadClients}
        />
      )}
    </div>
  );
}
