"use client";

import { useState, useEffect, useRef } from "react";
import { Download, BarChart3, ChevronRight, Play, Users, FileSpreadsheet, FileText, ChevronDown, List, AlignJustify, CalendarDays } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useTimerStore } from "@/store/timerStore";
import { toast } from "sonner";
import { formatDurationSeconds, formatHours, secondsToHoursDecimal, cn } from "@/lib/utils";
import * as XLSX from "xlsx";

// ── Types ──────────────────────────────────────────────────────────────────

type ReportType = "detailed" | "summary" | "weekly";

interface Entry {
  id: string; user_id: string; customer_id: string | null; task_id: string | null;
  project_id: string | null; start_time: string; end_time: string | null;
  duration: number; notes: string | null;
  customer?: { id: string; company_name: string } | null;
  task?: { id: string; title: string } | null;
  project?: { id: string; name: string } | null;
  user?: { id: string; full_name: string } | null;
}
interface CustomerGroup { customer_id: string | null; customer_name: string; totalSeconds: number; entries: Entry[]; }
interface DayGroup {
  date: string; label: string; totalSeconds: number; entries: Entry[];
  customerBreakdown: { key: string; name: string; seconds: number; count: number }[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const DAYS_HE    = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const MONTHS_HE  = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

// ── Helpers ────────────────────────────────────────────────────────────────

function isoToLocalTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function toLocalDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dayLabel(dateStr: string) {
  const d = new Date(dateStr);
  return `${DAYS_HE[d.getDay()]}, ${d.getDate()} ${MONTHS_HE[d.getMonth()]}`;
}
function applyTimeToISO(baseISO: string, timeStr: string) {
  const base = new Date(baseISO);
  const [h,m] = timeStr.split(":").map(Number);
  if (isNaN(h)||isNaN(m)) return baseISO;
  base.setHours(h,m,0,0);
  return base.toISOString();
}
function parseDurInput(str: string) {
  const parts = str.trim().split(":").map(s=>parseInt(s,10));
  if (parts.some(isNaN)) return 0;
  if (parts.length===3) return parts[0]*3600+parts[1]*60+parts[2];
  if (parts.length===2) return parts[0]*60+parts[1];
  return parts[0];
}
function secsToInput(secs: number) {
  const h=Math.floor(secs/3600), m=Math.floor((secs%3600)/60), s=secs%60;
  if (h>0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

const PDF_STYLE = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:12px;color:#0f172a;padding:24px;direction:rtl}
  h1{font-size:18px;font-weight:700;margin-bottom:4px}
  .meta{font-size:11px;color:#64748b;margin-bottom:20px}
  .summary{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
  .stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px}
  .stat-val{font-size:18px;font-weight:700;color:#16a34a}
  .stat-lbl{font-size:10px;color:#64748b}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead{background:#16a34a;color:white}
  th{padding:8px 10px;text-align:right;font-size:11px;font-weight:600}
  td{padding:7px 10px;font-size:11px;border-bottom:1px solid #f1f5f9}
  tr:nth-child(even) td{background:#f8fafc}
  .dur{font-family:monospace;color:#16a34a;font-weight:600}
  .day-header{background:#f1f5f9;font-weight:700;padding:8px 10px;font-size:12px;margin-top:12px}
  .day-total{color:#16a34a;font-family:monospace}
  .sub-row td{padding:5px 10px 5px 20px;font-size:11px;border-bottom:1px solid #f8fafc;color:#374151}
  @media print{@page{margin:15mm;size:A4}body{padding:0}}
`;

// ── EntryRow — inline-editable row ─────────────────────────────────────────

function EntryRow({ entry, clients, isAdmin, onRefresh, onContinue }: {
  entry: Entry; clients: {id:string;company_name:string}[];
  isAdmin: boolean; onRefresh: ()=>void; onContinue: (e:Entry)=>void;
}) {
  const [notes,    setNotes]    = useState(entry.notes||"");
  const [startVal, setStartVal] = useState(isoToLocalTime(entry.start_time));
  const [endVal,   setEndVal]   = useState(entry.end_time ? isoToLocalTime(entry.end_time) : "");
  const [durVal,   setDurVal]   = useState(secsToInput(entry.duration||0));
  const [custId,   setCustId]   = useState(entry.customer_id||"");
  const dirty = useRef(false);
  const mark  = () => { dirty.current = true; };

  const onStartChange = (val:string) => {
    setStartVal(val);
    const secs = parseDurInput(durVal);
    const newEnd = new Date(new Date(applyTimeToISO(entry.start_time,val)).getTime()+secs*1000);
    setEndVal(isoToLocalTime(newEnd.toISOString()));
    mark();
  };
  const onEndChange = (val:string) => {
    setEndVal(val);
    const s = applyTimeToISO(entry.start_time, startVal);
    const e = applyTimeToISO(entry.end_time||entry.start_time, val);
    setDurVal(secsToInput(Math.max(0,Math.round((new Date(e).getTime()-new Date(s).getTime())/1000))));
    mark();
  };
  const onDurChange = (val:string) => {
    setDurVal(val);
    const secs = parseDurInput(val);
    const newEnd = new Date(new Date(applyTimeToISO(entry.start_time,startVal)).getTime()+secs*1000);
    setEndVal(isoToLocalTime(newEnd.toISOString()));
    mark();
  };

  const handleRowBlur = (e:React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (!dirty.current) return;
    dirty.current = false;
    const startISO = applyTimeToISO(entry.start_time, startVal);
    const endISO   = endVal ? applyTimeToISO(entry.end_time||entry.start_time, endVal) : null;
    fetch("/api/time-entries",{method:"PATCH",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:entry.id,customer_id:custId||null,task_id:entry.task_id,
        notes,start_time:startISO,end_time:endISO,duration:parseDurInput(durVal)})
    }).then(r=>{ if(!r.ok)toast.error("שגיאה בשמירה"); else onRefresh(); });
  };

  const f = "bg-transparent border border-transparent rounded px-1 py-0.5 focus:bg-white focus:border-[#e2e8f0] focus:outline-none focus:ring-1 focus:ring-[#16a34a] hover:border-[#e2e8f0] transition-colors text-sm w-full";
  return (
    <div className="grid items-center px-5 py-2 hover:bg-[#fafafa] group gap-2"
      style={{gridTemplateColumns:"1fr 80px 80px 80px 1fr 60px"}}
      onBlur={handleRowBlur}>
      <input value={notes} onChange={e=>{setNotes(e.target.value);mark();}} placeholder="ללא תיאור" className={cn(f,"text-[#374151]")} />
      <input type="time" value={startVal} onChange={e=>onStartChange(e.target.value)} className={cn(f,"font-mono text-xs w-[72px]")} dir="ltr" />
      <input type="time" value={endVal} onChange={e=>onEndChange(e.target.value)} placeholder="--:--" className={cn(f,"font-mono text-xs w-[72px]")} dir="ltr" />
      <input value={durVal} onChange={e=>onDurChange(e.target.value)} onBlur={()=>setDurVal(secsToInput(parseDurInput(durVal)))}
        className={cn(f,"font-mono text-sm font-semibold text-[#16a34a] w-[72px]")} dir="ltr" title="MM:SS או H:MM:SS" />
      <div className="flex items-center gap-1 min-w-0">
        {isAdmin && (
          <select value={custId} onChange={e=>{setCustId(e.target.value);mark();}}
            className="bg-transparent border border-transparent rounded px-1 py-0.5 text-xs text-[#94a3b8] focus:bg-white focus:border-[#e2e8f0] focus:outline-none hover:border-[#e2e8f0] transition-colors max-w-[130px]">
            <option value="">ללא לקוח</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        )}
        {entry.user && <span className="text-xs text-[#94a3b8] truncate">{entry.user.full_name}</span>}
      </div>
      <button onClick={()=>onContinue(entry)} title="המשך טיימר"
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-green-50 text-[#16a34a] transition-opacity flex items-center justify-center">
        <Play className="h-3.5 w-3.5 fill-current" />
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { user } = useAuthStore();
  const { startTimer } = useTimerStore();

  const [entries,  setEntries]  = useState<Entry[]>([]);
  const [clients,  setClients]  = useState<{id:string;company_name:string}[]>([]);
  const [employees,setEmployees]= useState<{id:string;full_name:string}[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filterClient,   setFilterClient]   = useState("all");
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split("T")[0]);
  const [dateTo,   setDateTo]   = useState(new Date().toISOString().split("T")[0]);
  const [quickFilter, setQuickFilter] = useState("today");
  const [reportType,  setReportType]  = useState<ReportType>("detailed");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedDays,   setExpandedDays]   = useState<Set<string>>(new Set());
  const [exportOpen,      setExportOpen]     = useState(false);
  const [includeEmployee, setIncludeEmployee]= useState(true);

  useEffect(()=>{ loadData(); }, [filterClient,filterEmployee,dateFrom,dateTo]);

  useEffect(()=>{
    const now = new Date();
    switch(quickFilter){
      case "today":   setDateFrom(now.toISOString().split("T")[0]); setDateTo(now.toISOString().split("T")[0]); break;
      case "yesterday":{ const y=new Date(now); y.setDate(y.getDate()-1); const d=y.toISOString().split("T")[0]; setDateFrom(d); setDateTo(d); break; }
      case "week":    { const w=new Date(now); w.setDate(w.getDate()-7); setDateFrom(w.toISOString().split("T")[0]); setDateTo(now.toISOString().split("T")[0]); break; }
      case "month":   { const m=new Date(now.getFullYear(),now.getMonth(),1); setDateFrom(m.toISOString().split("T")[0]); setDateTo(now.toISOString().split("T")[0]); break; }
    }
  },[quickFilter]);

  const loadData = async () => {
    if(!user) return;
    setLoading(true);
    try {
      const fromISO = new Date(dateFrom+"T00:00:00").toISOString();
      const toISO   = new Date(dateTo  +"T23:59:59").toISOString();
      const params  = new URLSearchParams({from:fromISO,to:toISO,role:user.role});
      if(user.role==="employee") params.set("user_id",user.id);
      else if(filterEmployee!=="all") params.set("user_id",filterEmployee);
      if(filterClient!=="all") params.set("customer_id",filterClient);

      const [er,cr,ur] = await Promise.all([
        fetch(`/api/time-entries?${params}`).then(r=>r.json()),
        supabase.from("customers").select("id,company_name").eq("status","active"),
        user.role==="admin" ? supabase.from("users").select("id,full_name").neq("role","client") : Promise.resolve({data:[]}),
      ]);
      if(er.error){ toast.error(`שגיאת דוחות: ${er.error}`); setEntries([]); }
      else setEntries(er.data||[]);
      setClients(cr.data||[]);
      setEmployees(ur.data||[]);
    } catch(e:any){ toast.error(`שגיאה: ${e.message}`); }
    finally{ setLoading(false); }
  };

  // ── Computed groups ──────────────────────────────────────────────────────

  const totalSeconds = entries.reduce((s,e)=>s+(e.duration||0),0);

  // flat customer groups (for summary & weekly views)
  const customerGroups: CustomerGroup[] = (() => {
    const map = new Map<string,CustomerGroup>();
    for(const e of entries){
      const k=e.customer_id||"__none__";
      if(!map.has(k)) map.set(k,{customer_id:e.customer_id,customer_name:e.customer?.company_name||"ללא לקוח",totalSeconds:0,entries:[]});
      const g=map.get(k)!; g.totalSeconds+=e.duration||0; g.entries.push(e);
    }
    return Array.from(map.values()).sort((a,b)=>b.totalSeconds-a.totalSeconds);
  })();

  // nested: day → (customer+project) → entries  — for detailed view
  interface CustProjGroup {
    key: string;          // "custId__projId"
    label: string;        // "תלמונים – ניהול עבודה" | "תלמונים"
    customer_id: string | null;
    customer_name: string;
    project_id: string | null;
    totalSeconds: number;
    entries: Entry[];
  }
  interface DetailedDay {
    date: string; label: string; totalSeconds: number;
    custProjGroups: CustProjGroup[];
  }

  const detailedDays: DetailedDay[] = (() => {
    const dayMap = new Map<string, DetailedDay>();
    for (const e of entries) {
      const d = toLocalDate(e.start_time);
      if (!dayMap.has(d)) dayMap.set(d, { date:d, label:dayLabel(d), totalSeconds:0, custProjGroups:[] });
      const day = dayMap.get(d)!;
      day.totalSeconds += e.duration || 0;

      const cpKey = `${e.customer_id||"__none__"}__${e.project_id||"__none__"}`;
      let cpg = day.custProjGroups.find(g=>g.key===cpKey);
      if (!cpg) {
        const custName = e.customer?.company_name || "ללא לקוח";
        const projName = e.project?.name || null;
        cpg = { key:cpKey, label: projName ? `${custName} – ${projName}` : custName,
          customer_id:e.customer_id, customer_name:custName,
          project_id:e.project_id||null, totalSeconds:0, entries:[] };
        day.custProjGroups.push(cpg);
      }
      cpg.totalSeconds += e.duration || 0;
      cpg.entries.push(e);
    }
    const arr = Array.from(dayMap.values());
    arr.sort((a,b)=>b.date.localeCompare(a.date));
    arr.forEach(d => d.custProjGroups.sort((a,b)=>b.totalSeconds-a.totalSeconds));
    return arr;
  })();

  const dayGroups: DayGroup[] = (() => {
    const map = new Map<string,DayGroup>();
    for(const e of entries){
      const d = toLocalDate(e.start_time);
      if(!map.has(d)) map.set(d,{date:d,label:dayLabel(d),totalSeconds:0,entries:[],customerBreakdown:[]});
      const g=map.get(d)!;
      g.totalSeconds+=e.duration||0;
      g.entries.push(e);
      const ck=e.customer_id||"__none__";
      const cb=g.customerBreakdown.find(c=>c.key===ck);
      if(cb){ cb.seconds+=e.duration||0; cb.count++; }
      else g.customerBreakdown.push({key:ck,name:e.customer?.company_name||"ללא לקוח",seconds:e.duration||0,count:1});
    }
    const arr=Array.from(map.values()); arr.sort((a,b)=>b.date.localeCompare(a.date)); return arr;
  })();

  // ── Helpers ──────────────────────────────────────────────────────────────

  // expandedGroups key = "date__custProjKey" for detailed view; "custId" for summary
  const toggleGroup = (k:string) => setExpandedGroups(p=>{ const n=new Set(p); n.has(k)?n.delete(k):n.add(k); return n; });
  const toggleDay   = (k:string) => setExpandedDays(  p=>{ const n=new Set(p); n.has(k)?n.delete(k):n.add(k); return n; });

  const handleContinue = (e:Entry) => {
    startTimer({customer_id:e.customer_id||undefined,customer_name:e.customer?.company_name,
      task_id:e.task_id||undefined,task_title:e.task?.title,project_id:e.project_id||undefined});
    toast.success("טיימר הופעל");
  };

  // ── Export data builders ──────────────────────────────────────────────────

  const buildDetailedRows = () => entries.map(e => {
    const r: Record<string,string> = {
      תאריך: new Date(e.start_time).toLocaleDateString("he-IL"),
      לקוח:  e.customer?.company_name||"ללא לקוח",
      התחלה: isoToLocalTime(e.start_time),
      סיום:  e.end_time ? isoToLocalTime(e.end_time) : "",
      "משך (שע')": secondsToHoursDecimal(e.duration||0).toFixed(2),
      "משך":        formatDurationSeconds(e.duration||0),
      הערות:        e.notes||"",
    };
    if(includeEmployee) r["עובד"]=e.user?.full_name||"";
    return r;
  });

  const buildSummaryRows = () => customerGroups.map(g => {
    const employees_set = [...new Set(g.entries.map(e=>e.user?.full_name).filter(Boolean))].join(", ");
    const r: Record<string,string> = {
      לקוח: g.customer_name,
      "סה\"כ שעות": secondsToHoursDecimal(g.totalSeconds).toFixed(2),
      "משך":        formatDurationSeconds(g.totalSeconds),
      "מספר רשומות": String(g.entries.length),
    };
    if(includeEmployee) r["עובדים"]=employees_set;
    return r;
  });

  const buildWeeklyRows = () => {
    const rows: Record<string,string>[] = [];
    for(const day of dayGroups){
      rows.push({ יום: day.label, "סה\"כ שעות": formatDurationSeconds(day.totalSeconds), לקוח:"", הערה:"" });
      for(const cb of day.customerBreakdown){
        const r: Record<string,string> = { יום:"", "סה\"כ שעות": formatDurationSeconds(cb.seconds), לקוח:cb.name, "הערה":`${cb.count} רשומות` };
        rows.push(r);
      }
    }
    return rows;
  };

  const getRows = () => reportType==="summary" ? buildSummaryRows() : reportType==="weekly" ? buildWeeklyRows() : buildDetailedRows();
  const reportTitle = () => {
    const base = `${dateFrom} – ${dateTo}`;
    if(reportType==="summary") return `דוח מקוצר · ${base}`;
    if(reportType==="weekly")  return `דוח שבועי · ${base}`;
    return `דוח מפורט · ${base}`;
  };

  // ── Export handlers ──────────────────────────────────────────────────────

  const handleExportCSV = () => {
    setExportOpen(false);
    const rows=getRows(); if(!rows.length) return;
    const headers=Object.keys(rows[0]);
    const csv=[headers,...rows.map(r=>Object.values(r))].map(r=>r.join(",")).join("\n");
    const blob=new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`דוח_${dateFrom}_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    setExportOpen(false);
    const rows=getRows(); if(!rows.length) return;
    const ws=XLSX.utils.json_to_sheet(rows,{header:Object.keys(rows[0])});
    ws["!cols"]=Object.keys(rows[0]).map(()=>({wch:16}));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"דוח זמנים");
    XLSX.writeFile(wb,`דוח_${dateFrom}_${dateTo}.xlsx`);
  };

  const handleExportPDF = () => {
    setExportOpen(false);
    const title = reportTitle();
    const totalStr = formatDurationSeconds(totalSeconds);
    const now = new Date();
    const nowStr = `${now.toLocaleDateString("he-IL")} ${now.toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"})}`;

    let bodyHTML = "";

    if(reportType==="detailed"){
      const empCol = includeEmployee ? "<th>עובד</th>" : "";
      bodyHTML = `<table><thead><tr><th>תאריך</th>${empCol}<th>לקוח</th><th>התחלה</th><th>סיום</th><th>משך</th><th>הערות</th></tr></thead><tbody>
        ${entries.map(e=>`<tr><td>${new Date(e.start_time).toLocaleDateString("he-IL")}</td>
          ${includeEmployee?`<td>${e.user?.full_name||""}</td>`:""}
          <td>${e.customer?.company_name||"ללא לקוח"}</td>
          <td dir="ltr">${isoToLocalTime(e.start_time)}</td>
          <td dir="ltr">${e.end_time?isoToLocalTime(e.end_time):""}</td>
          <td dir="ltr" class="dur">${formatDurationSeconds(e.duration||0)}</td>
          <td>${e.notes||""}</td></tr>`).join("")}
      </tbody></table>`;
    } else if(reportType==="summary"){
      const empCol = includeEmployee ? "<th>עובדים</th>" : "";
      bodyHTML = `<table><thead><tr><th>לקוח</th><th>סה"כ שעות</th><th>רשומות</th>${empCol}</tr></thead><tbody>
        ${customerGroups.map(g=>{
          const emps=[...new Set(g.entries.map(e=>e.user?.full_name).filter(Boolean))].join(", ");
          return `<tr><td>${g.customer_name}</td>
            <td dir="ltr" class="dur">${formatDurationSeconds(g.totalSeconds)}</td>
            <td>${g.entries.length}</td>
            ${includeEmployee?`<td>${emps}</td>`:""}
          </tr>`;
        }).join("")}
      </tbody></table>`;
    } else {
      // weekly
      bodyHTML = dayGroups.map(day=>`
        <div class="day-header">${day.label} &nbsp;<span class="day-total">${formatDurationSeconds(day.totalSeconds)}</span></div>
        <table><thead><tr><th>לקוח</th><th>שעות</th><th>רשומות</th>${includeEmployee?"<th>עובדים</th>":""}</tr></thead><tbody>
          ${day.customerBreakdown.map(cb=>{
            const emps=includeEmployee?[...new Set(day.entries.filter(e=>(e.customer_id||"__none__")===cb.key).map(e=>e.user?.full_name).filter(Boolean))].join(", "):"";
            return `<tr class="sub-row"><td>${cb.name}</td><td dir="ltr" class="dur">${formatDurationSeconds(cb.seconds)}</td>
              <td>${cb.count}</td>${includeEmployee?`<td>${emps}</td>`:""}
            </tr>`;
          }).join("")}
        </tbody></table>`).join("");
    }

    const html=`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>${title}</title>
      <style>${PDF_STYLE}</style></head><body>
      <h1>${title}</h1><p class="meta">הופק: ${nowStr}</p>
      <div class="summary">
        <div class="stat"><div class="stat-val">${totalStr}</div><div class="stat-lbl">סה"כ שעות</div></div>
        <div class="stat"><div class="stat-val">${entries.length}</div><div class="stat-lbl">רשומות</div></div>
        <div class="stat"><div class="stat-val">${customerGroups.length}</div><div class="stat-lbl">לקוחות</div></div>
      </div>${bodyHTML}</body></html>`;

    const win=window.open("","_blank");
    if(!win) return;
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(()=>win.print(), 400);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <Header title="דוחות" />
      <div className="p-6 space-y-5">

        {/* Filters */}
        <Card><CardContent className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {[["today","היום"],["yesterday","אתמול"],["week","שבוע"],["month","החודש"]].map(([k,l])=>(
              <button key={k} onClick={()=>setQuickFilter(k)}
                className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  quickFilter===k?"bg-[#16a34a] text-white":"bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]")}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#64748b]">מ:</span>
              <Input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setQuickFilter("custom");}} className="w-40" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#64748b]">עד:</span>
              <Input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setQuickFilter("custom");}} className="w-40" />
            </div>
            {user?.role==="admin" && (<>
              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger className="w-40"><SelectValue placeholder="לקוח" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הלקוחות</SelectItem>
                  {clients.map(c=><SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                <SelectTrigger className="w-40"><SelectValue placeholder="עובד" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל העובדים</SelectItem>
                  {employees.map(e=><SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </>)}
            {/* Employee toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div onClick={()=>setIncludeEmployee(v=>!v)}
                className={cn("w-8 h-4 rounded-full transition-colors relative shrink-0",includeEmployee?"bg-[#16a34a]":"bg-[#cbd5e1]")}>
                <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform",includeEmployee?"translate-x-0.5":"translate-x-4")} />
              </div>
              <span className="text-sm text-[#64748b] whitespace-nowrap">שם עובד בדוח</span>
            </label>
            {/* Export */}
            <div className="relative">
              <button onClick={()=>setExportOpen(o=>!o)}
                className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-[#e2e8f0] bg-white text-sm font-medium text-[#374151] hover:bg-[#f8fafc] transition-colors">
                <Download className="h-4 w-4" /> ייצוא <ChevronDown className="h-3.5 w-3.5 text-[#94a3b8]" />
              </button>
              {exportOpen && (<>
                <div className="fixed inset-0 z-10" onClick={()=>setExportOpen(false)} />
                <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-[#e2e8f0] z-20 overflow-hidden" dir="rtl">
                  {[
                    {label:"CSV",        icon:<Download className="h-4 w-4 text-[#64748b]" />,  fn:handleExportCSV},
                    {label:"Excel (.xlsx)",icon:<FileSpreadsheet className="h-4 w-4 text-[#16a34a]" />,fn:handleExportExcel},
                    {label:"PDF",        icon:<FileText className="h-4 w-4 text-red-500" />,    fn:handleExportPDF},
                  ].map(({label,icon,fn},i)=>(
                    <button key={label} onClick={fn}
                      className={cn("w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#374151] hover:bg-[#f8fafc] transition-colors",i>0&&"border-t border-[#f8fafc]")}>
                      {icon}{label}
                    </button>
                  ))}
                </div>
              </>)}
            </div>
          </div>
        </CardContent></Card>

        {/* Report type tabs */}
        <div className="flex gap-2 bg-white rounded-xl border border-[#f1f5f9] p-1.5 w-fit shadow-sm">
          {([
            {k:"detailed" as ReportType, label:"דוח מפורט",     icon:<List className="h-4 w-4" />},
            {k:"summary"  as ReportType, label:"דוח מקוצר",     icon:<AlignJustify className="h-4 w-4" />},
            {k:"weekly"   as ReportType, label:"דוח שבועי",     icon:<CalendarDays className="h-4 w-4" />},
          ] as {k:ReportType;label:string;icon:React.ReactNode}[]).map(({k,label,icon})=>(
            <button key={k} onClick={()=>setReportType(k)}
              className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                reportType===k?"bg-[#16a34a] text-white shadow-sm":"text-[#64748b] hover:bg-[#f8fafc]")}>
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-[#0f172a]">{formatHours(totalSeconds)}</p>
            <p className="text-sm text-[#64748b]">סה"כ שעות</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-[#0f172a]">{entries.length}</p>
            <p className="text-sm text-[#64748b]">רשומות</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-[#0f172a]">{customerGroups.length}</p>
            <p className="text-sm text-[#64748b]">לקוחות</p>
          </CardContent></Card>
        </div>

        {/* ── DETAILED — day header + customer+project rows (expandable per row) ── */}
        {reportType==="detailed" && (
          loading ? (
            <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-28 bg-white rounded-xl animate-pulse border border-[#f1f5f9]" />)}</div>
          ) : detailedDays.length===0 ? (
            <Card><CardContent className="text-center py-12 text-[#94a3b8]">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" /><p className="font-medium">אין נתונים לתקופה זו</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-4">
              {detailedDays.map(day=>(
                <div key={day.date}>
                  {/* Day header */}
                  <div className="flex items-center justify-between px-1 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#94a3b8]">סה"כ:</span>
                      <span className="font-mono font-bold text-[#16a34a] text-sm" dir="ltr">
                        {formatDurationSeconds(day.totalSeconds)}
                      </span>
                    </div>
                    <span className="font-bold text-[#0f172a] text-sm">{day.label}</span>
                  </div>

                  {/* Customer+project rows */}
                  <div className="bg-white rounded-xl border border-[#f1f5f9] shadow-sm overflow-hidden divide-y divide-[#f8fafc]">
                    {day.custProjGroups.map(cpg=>{
                      const rowKey = `${day.date}__${cpg.key}`;
                      const isOpen = expandedGroups.has(rowKey);
                      return (
                        <div key={rowKey}>
                          {/* Summary row — always visible */}
                          <button onClick={()=>toggleGroup(rowKey)}
                            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#f8fafc] transition-colors">
                            <div className={cn("text-[#94a3b8] transition-transform shrink-0", isOpen&&"rotate-90")}>
                              <ChevronRight className="h-4 w-4" />
                            </div>
                            <span className="flex-1 text-sm font-semibold text-[#0f172a] text-right">{cpg.label}</span>
                            <span className="font-mono font-bold text-[#16a34a] text-sm" dir="ltr">
                              {formatDurationSeconds(cpg.totalSeconds)}
                            </span>
                          </button>

                          {/* Individual entries — on expand */}
                          {isOpen && (
                            <div className="bg-[#fafafa] border-t border-[#f1f5f9]">
                              <div className="grid px-5 py-1.5 text-xs font-medium text-[#94a3b8]"
                                style={{gridTemplateColumns:"1fr 80px 80px 80px 1fr 60px"}}>
                                <span>הערות</span><span>התחלה</span><span>סיום</span><span>משך</span>
                                <span>{user?.role==="admin"?"לקוח / עובד":"עובד"}</span><span/>
                              </div>
                              <div className="divide-y divide-[#f1f5f9]">
                                {cpg.entries.map(entry=>(
                                  <EntryRow key={entry.id} entry={entry} clients={clients}
                                    isAdmin={user?.role==="admin"} onRefresh={loadData} onContinue={handleContinue} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── SUMMARY ── */}
        {reportType==="summary" && (
          loading ? (
            <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-12 bg-white rounded-xl animate-pulse border border-[#f1f5f9]" />)}</div>
          ) : customerGroups.length===0 ? (
            <Card><CardContent className="text-center py-12 text-[#94a3b8]">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" /><p className="font-medium">אין נתונים לתקופה זו</p>
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-0 overflow-hidden">
              <div className="grid px-5 py-3 text-xs font-semibold text-[#64748b] bg-[#f8fafc] border-b border-[#f1f5f9]"
                style={{gridTemplateColumns:`1fr 120px 80px${includeEmployee?" 1fr":""}` }}>
                <span>לקוח</span><span className="text-center">סה"כ שעות</span><span className="text-center">רשומות</span>
                {includeEmployee && <span>עובדים</span>}
              </div>
              <div className="divide-y divide-[#f8fafc]">
                {customerGroups.map(g=>{
                  const pct=totalSeconds>0?(g.totalSeconds/totalSeconds)*100:0;
                  const emps=[...new Set(g.entries.map(e=>e.user?.full_name).filter(Boolean))].join(", ");
                  return (
                    <div key={g.customer_id||"__none__"}
                      className="grid items-center px-5 py-3 hover:bg-[#fafafa]"
                      style={{gridTemplateColumns:`1fr 120px 80px${includeEmployee?" 1fr":""}` }}>
                      <div>
                        <span className="font-medium text-[#0f172a] text-sm">{g.customer_name}</span>
                        <div className="mt-1 h-1.5 bg-[#f1f5f9] rounded-full w-48 overflow-hidden">
                          <div className="h-full bg-[#16a34a] rounded-full" style={{width:`${pct}%`}} />
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[#16a34a] text-center" dir="ltr">{formatDurationSeconds(g.totalSeconds)}</span>
                      <span className="text-sm text-[#64748b] text-center">{g.entries.length}</span>
                      {includeEmployee && <span className="text-xs text-[#94a3b8] truncate">{emps}</span>}
                    </div>
                  );
                })}
              </div>
            </CardContent></Card>
          )
        )}

        {/* ── WEEKLY ── */}
        {reportType==="weekly" && (
          loading ? (
            <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-16 bg-white rounded-xl animate-pulse border border-[#f1f5f9]" />)}</div>
          ) : dayGroups.length===0 ? (
            <Card><CardContent className="text-center py-12 text-[#94a3b8]">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" /><p className="font-medium">אין נתונים לתקופה זו</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {dayGroups.map(day=>{
                const isOpen = expandedDays.has(day.date);
                return (
                  <div key={day.date} className="bg-white rounded-xl border border-[#f1f5f9] shadow-sm overflow-hidden">
                    <button onClick={()=>toggleDay(day.date)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#f8fafc] transition-colors text-right">
                      <div className={cn("text-[#94a3b8] transition-transform shrink-0",isOpen&&"rotate-90")}><ChevronRight className="h-4 w-4" /></div>
                      <div className="flex-1 flex items-center justify-between">
                        <span className="font-semibold text-[#0f172a]">{day.label}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-[#64748b]">{day.entries.length} רשומות</span>
                          <span className="font-mono font-bold text-[#16a34a]" dir="ltr">{formatDurationSeconds(day.totalSeconds)}</span>
                        </div>
                      </div>
                    </button>
                    {/* Always show customer breakdown */}
                    <div className="border-t border-[#f8fafc] divide-y divide-[#f8fafc]">
                      {day.customerBreakdown.map(cb=>(
                        <div key={cb.key} className="flex items-center gap-3 px-8 py-2 hover:bg-[#fafafa]">
                          <div className="w-2 h-2 rounded-full bg-[#16a34a] opacity-60 shrink-0" />
                          <span className="text-sm text-[#374151] flex-1">{cb.name}</span>
                          <span className="text-xs text-[#94a3b8]">{cb.count} רשומות</span>
                          <span className="font-mono text-sm font-semibold text-[#16a34a] w-20 text-left" dir="ltr">{formatDurationSeconds(cb.seconds)}</span>
                        </div>
                      ))}
                    </div>
                    {/* Expanded: show individual entries */}
                    {isOpen && (
                      <div className="border-t border-[#e2e8f0]">
                        <div className="grid px-5 py-2 text-xs font-medium text-[#94a3b8] bg-[#f8fafc]"
                          style={{gridTemplateColumns:"1fr 80px 80px 80px 1fr 60px"}}>
                          <span>הערות</span><span>התחלה</span><span>סיום</span><span>משך</span>
                          <span>{user?.role==="admin"?"לקוח / עובד":"עובד"}</span><span />
                        </div>
                        <div className="divide-y divide-[#f8fafc]">
                          {day.entries.map(entry=>(
                            <EntryRow key={entry.id} entry={entry} clients={clients}
                              isAdmin={user?.role==="admin"} onRefresh={loadData} onContinue={handleContinue} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
