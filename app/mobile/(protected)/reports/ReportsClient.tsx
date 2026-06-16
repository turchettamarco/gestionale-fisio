"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import Link from "next/link";
import ReportPrintModal from "@/src/components/mobile/ReportPrintModal";

/* ─── Theme ───────────────────────────────────────────────────────────── */
const THEME = {
  appBg:     "#f1f5f9",
  panelBg:   "#ffffff",
  panelSoft: "#f7f9fd",
  text:      "#0f172a",
  textSoft:  "#1e293b",
  muted:     "#334155",
  border:    "#cbd5e1",
  blue:      "#2563eb",
  green:     "#16a34a",
  red:       "#dc2626",
  amber:     "#f97316",
  gray:      "#94a3b8",
  teal:      "#0d9488",
  gradient:  "linear-gradient(135deg, #0d9488, #2563eb)",
};

const BOTTOM_TAB_H = 62;

const currency = new Intl.NumberFormat("it-IT", {
  style: "currency", currency: "EUR",
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

/* ─── Types ───────────────────────────────────────────────────────────── */
type Period = "day" | "week" | "month" | "quarter" | "semester" | "year";

type FinancialItem = {
  amount: number; date: string;
  source: "invoice" | "appointment";
  description?: string;
  patient_name?: string; patient_id?: string; status?: string;
};
type UnpaidTherapy = {
  id: string; patient_id: string; patient_name: string;
  amount: number; date: string; treatment_type: string;
  days_since: number; status: string;
};
type AppointmentTherapy = {
  id: string; patient_id: string; patient_name: string;
  amount: number; date: string; treatment_type: string;
  status: "done" | "not_paid"; price_type?: string | null;
};
type Statistic = {
  total: number; invoiceCount: number; appointmentCount: number;
  averageAmount: number; maxAmount: number; minAmount: number;
  unpaidTotal: number; unpaidCount: number;
  unpaidAppointmentCount: number; unpaidInvoiceCount: number;
};

/* ─── Date helpers ────────────────────────────────────────────────────── */
function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function startOfDay(d: Date)   { const x=new Date(d); x.setHours(0,0,0,0);       return x; }
function endOfDay(d: Date)     { const x=new Date(d); x.setHours(23,59,59,999);   return x; }
function startOfWeek(d: Date)  { const x=new Date(d); x.setDate(x.getDate()-((x.getDay()+6)%7)); x.setHours(0,0,0,0); return x; }
function endOfWeek(d: Date)    { const s=startOfWeek(d); const x=new Date(s); x.setDate(s.getDate()+6); x.setHours(23,59,59,999); return x; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(),d.getMonth(),1,0,0,0,0); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59,999); }
function getRange(period: Period, base: Date) {
  if (period==="day")   return {from:startOfDay(base),  to:endOfDay(base)};
  if (period==="week")  return {from:startOfWeek(base), to:endOfWeek(base)};
  if (period==="quarter"){const q=Math.floor(base.getMonth()/3);return{from:new Date(base.getFullYear(),q*3,1,0,0,0,0),to:new Date(base.getFullYear(),q*3+3,0,23,59,59,999)};}
  if (period==="semester"){const h=base.getMonth()<6?0:1;return{from:new Date(base.getFullYear(),h*6,1,0,0,0,0),to:new Date(base.getFullYear(),h*6+6,0,23,59,59,999)};}
  if (period==="year")  return {from:new Date(base.getFullYear(),0,1,0,0,0,0),to:new Date(base.getFullYear(),11,31,23,59,59,999)};
  return {from:startOfMonth(base), to:endOfMonth(base)};
}
function prevBase(period: Period, base: Date): Date {
  const d = new Date(base);
  if (period==="day")   d.setDate(d.getDate()-1);
  if (period==="week")  d.setDate(d.getDate()-7);
  if (period==="month") d.setMonth(d.getMonth()-1);
  if (period==="quarter") d.setMonth(d.getMonth()-3);
  if (period==="semester") d.setMonth(d.getMonth()-6);
  if (period==="year")  d.setFullYear(d.getFullYear()-1);
  return d;
}
function nextBase(period: Period, base: Date): Date {
  const d = new Date(base);
  if (period==="day")   d.setDate(d.getDate()+1);
  if (period==="week")  d.setDate(d.getDate()+7);
  if (period==="month") d.setMonth(d.getMonth()+1);
  if (period==="quarter") d.setMonth(d.getMonth()+3);
  if (period==="semester") d.setMonth(d.getMonth()+6);
  if (period==="year")  d.setFullYear(d.getFullYear()+1);
  return d;
}
function periodLabel(period: Period, base: Date): string {
  if (period==="day")  return base.toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});
  if (period==="quarter") {const q=Math.floor(base.getMonth()/3)+1;return `Q${q} ${base.getFullYear()}`;}
  if (period==="semester") {const h=base.getMonth()<6?"1°":"2°";return `${h} semestre ${base.getFullYear()}`;}
  if (period==="year")  return `Anno ${base.getFullYear()}`;
  if (period==="week") {
    const s=startOfWeek(base), e=endOfWeek(base);
    return `${s.toLocaleDateString("it-IT",{day:"2-digit",month:"short"})} – ${e.toLocaleDateString("it-IT",{day:"2-digit",month:"short",year:"numeric"})}`;
  }
  return base.toLocaleDateString("it-IT",{month:"long",year:"numeric"});
}
function makeLabels(period: Period, base: Date): string[] {
  if (period==="day")  return Array.from({length:24},(_,h)=>`${String(h).padStart(2,"0")}:00`);
  if (period==="week") return ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
  const days=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
  return Array.from({length:days},(_,i)=>String(i+1));
}
function getBucketIndex(dt: Date, period: Period): number {
  if (period==="day")  return dt.getHours();
  if (period==="week") return (dt.getDay()+6)%7;
  return dt.getDate()-1;
}

/* ─── Print helpers ───────────────────────────────────────────────────── */
// I builder restituiscono SOLO l'HTML, niente window.open.
// Il rendering avviene tramite <ReportPrintModal /> (full-screen iframe),
// così su iOS PWA l'utente non resta bloccato in una WebView senza navigazione.

const fmt = (v: number) => new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(v);

function buildReportHtml(therapies: UnpaidTherapy[], title: string): string {
  const today = new Date().toLocaleDateString("it-IT",{year:"numeric",month:"long",day:"numeric"});
  const patients: Record<string,{items:UnpaidTherapy[];total:number}> = {};
  therapies.forEach(t=>{
    if(!patients[t.patient_name]) patients[t.patient_name]={items:[],total:0};
    patients[t.patient_name].items.push(t);
    patients[t.patient_name].total+=t.amount;
  });
  let rows=""; let grand=0;
  Object.keys(patients).forEach(name=>{
    const pd=patients[name]; grand+=pd.total;
    rows+=`<tr style="background:#f0f0f0"><td colspan="4"><b>${name}</b></td><td><b>${fmt(pd.total)}</b></td></tr>`;
    pd.items.forEach((it,i)=>{
      rows+=`<tr><td>${i===0?"":""}</td><td>${it.treatment_type}</td><td>${new Date(it.date).toLocaleDateString("it-IT")}</td><td>${it.days_since}g</td><td>${fmt(it.amount)}</td></tr>`;
    });
  });
  rows+=`<tr style="background:#e8e8e8;font-weight:bold"><td colspan="4">TOTALE</td><td>${fmt(grand)}</td></tr>`;
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${title}</title>
  <style>body{font-family:sans-serif;padding:2cm;color:#000;margin:0}table{width:100%;border-collapse:collapse;margin-top:1cm}
  th,td{border:1px solid #000;padding:6pt;font-size:10pt}th{background:#f0f0f0;font-weight:bold}
  h1{font-size:18pt;text-align:center;margin-top:0}
  @media screen and (max-width:768px){body{padding:14px}}
  @media print{@page{margin:1.5cm}body{padding:0}}</style></head><body>
  <h1>${title}</h1><div style="text-align:center;color:#555;margin-bottom:1cm">${today}</div>
  <table><thead><tr><th>Paziente</th><th>Tipo</th><th>Data</th><th>Giorni</th><th>Importo</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <p style="margin-top:2cm;font-size:9pt;color:#555">Generato da FisioHub — ${new Date().toLocaleString("it-IT")}</p>
  </body></html>`;
}

function buildTotalReportHtml(
  statistics: Statistic,
  reportTherapies: AppointmentTherapy[],
  rawData: FinancialItem[],
  period: Period, baseDate: Date,
): string {
  const today = new Date().toLocaleDateString("it-IT",{year:"numeric",month:"long",day:"numeric"});
  const {from,to}=getRange(period,baseDate);
  const rangeLabel = period==="month"
    ? from.toLocaleDateString("it-IT",{month:"long",year:"numeric"})
    : `${from.toLocaleDateString("it-IT")} → ${to.toLocaleDateString("it-IT")}`;

  const escHtml=(s:unknown)=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const byPatient = reportTherapies.reduce<Record<string,AppointmentTherapy[]>>((a,t)=>{
    const k=(t.patient_name||"Senza nome").trim();
    if(!a[k]) a[k]=[];
    a[k].push(t); return a;
  },{});

  // rawData parameter resta per compatibilità con la firma esistente
  void rawData;

  const therapyRows = Object.keys(byPatient).sort((a,b)=>a.localeCompare(b,"it")).map(name=>{
    const list=[...byPatient[name]].sort((x,y)=>new Date(x.date).getTime()-new Date(y.date).getTime());
    const tot=list.reduce((s,x)=>s+x.amount,0);
    const paid=list.filter(x=>x.status==="done").reduce((s,x)=>s+x.amount,0);
    const unpaid=list.filter(x=>x.status==="not_paid").reduce((s,x)=>s+x.amount,0);
    return `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #ddd">
      <b>${escHtml(name)}</b> — Tot: ${escHtml(fmt(tot))} — Incassato: <span style="color:#16a34a">${escHtml(fmt(paid))}</span> — Non pagato: <span style="color:#dc2626">${escHtml(fmt(unpaid))}</span>
      <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:10pt">
        <tr><th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Data</th><th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Trattamento</th><th style="border-bottom:1px solid #ccc;padding:4px">Stato</th><th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">€</th></tr>
        ${list.map(t=>`<tr><td style="padding:4px">${new Date(t.date).toLocaleDateString("it-IT")}</td><td style="padding:4px">${escHtml(t.treatment_type)}</td><td style="padding:4px;color:${t.status==="done"?"#16a34a":"#dc2626"}">${t.status==="done"?"PAGATO":"NON PAGATO"}</td><td style="padding:4px;text-align:right">${fmt(t.amount)}</td></tr>`).join("")}
      </table></div>`;
  }).join("");

  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Report Totali</title>
  <style>body{font-family:sans-serif;padding:2cm;color:#000;margin:0}
  h1{margin-top:0}
  @media screen and (max-width:768px){body{padding:14px}.summary{grid-template-columns:1fr !important}}
  @media print{@page{margin:1.5cm}body{padding:0}}</style></head><body>
  <h1 style="text-align:center">REPORT TOTALI — FISIOHUB</h1>
  <p style="text-align:center;color:#555">${today} — ${escHtml(rangeLabel)}</p>
  <div class="summary" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:2cm 0">
    <div style="padding:20px;border:1px solid #000;border-radius:8px;text-align:center;background:#f0fdf4">
      <div style="font-weight:bold">TOTALE INCASSATO</div>
      <div style="font-size:24pt;font-weight:bold;color:#16a34a">${fmt(statistics.total)}</div>
      <div style="font-size:10pt;color:#555">${statistics.invoiceCount} fatture • ${statistics.appointmentCount} appuntamenti</div>
    </div>
    <div style="padding:20px;border:1px solid #000;border-radius:8px;text-align:center;background:#fef2f2">
      <div style="font-weight:bold">TOTALE NON PAGATO</div>
      <div style="font-size:24pt;font-weight:bold;color:#dc2626">${fmt(statistics.unpaidTotal)}</div>
      <div style="font-size:10pt;color:#555">${statistics.unpaidCount} terapie in sospeso</div>
    </div>
  </div>
  <h2>🧑‍⚕️ Terapie per paziente</h2>${therapyRows}
  <p style="margin-top:2cm;font-size:9pt;color:#555">Generato da FisioHub — ${new Date().toLocaleString("it-IT")}</p>
  </body></html>`;
}

/* ─── MobileBarChart ──────────────────────────────────────────────────── */
function MobileBarChart({labels,values,unpaidValues,period,onBarClick,selectedDay}:{
  labels:string[]; values:number[]; unpaidValues:number[];
  period:Period; onBarClick:(i:number)=>void; selectedDay:number|null;
}) {
  const max=Math.max(1,...values,...unpaidValues);
  const chartH=180;
  const bw=period==="day"?18:period==="week"?28:9;
  const gap=period==="day"?3:period==="week"?6:2;
  const cw=labels.length*(bw+gap);
  const hasData=values.some(v=>v>0)||unpaidValues.some(v=>v>0);

  if(!hasData) return(
    <div style={{height:chartH,display:"flex",alignItems:"center",justifyContent:"center",
      color:THEME.muted,fontSize:13,fontWeight:600}}>
      Nessun dato disponibile
    </div>
  );

  return(
    <div style={{width:"100%",overflowX:"auto"}}>
      <div style={{minWidth:cw,display:"flex",alignItems:"flex-end",
        gap:gap,height:chartH,borderBottom:`1.5px solid ${THEME.border}`,paddingBottom:28,position:"relative"}}>
        {values.map((v,i)=>{
          const label=labels[i]; if(!label) return null;
          const unpaid=unpaidValues[i]||0;
          const pH=Math.max(v>0?3:0,(v/max)*(chartH-36));
          const uH=Math.max(unpaid>0?3:0,(unpaid/max)*(chartH-36));
          const sel=selectedDay===i;
          const active=(v+unpaid)>0;
          return(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",
              width:bw,minWidth:bw,cursor:active?"pointer":"default"}}
              onClick={()=>active&&onBarClick(i)}>
              {unpaid>0&&<div style={{width:"75%",height:uH,
                background:"linear-gradient(to top,rgba(220,38,38,0.85),rgba(220,38,38,0.6))",
                borderRadius:"3px 3px 0 0",minHeight:unpaid>0?3:0}}/>}
              <div style={{width:"75%",height:pH,
                background:active?"linear-gradient(to top,#0d9488,#2563eb)":"rgba(203,213,225,0.4)",
                borderRadius:unpaid>0?"0 0 3px 3px":"3px 3px 0 0",
                transform:sel?"scaleX(1.15)":"scaleX(1)",transition:"transform 0.15s",
                minHeight:v>0?3:0}}/>
              <div style={{marginTop:6,fontSize:period==="month"?8:9,
                color:sel?THEME.blue:active?THEME.muted:THEME.gray,
                fontWeight:sel?700:500,textAlign:"center",height:20,
                overflow:"hidden",writingMode:period==="month"?"vertical-rl":"horizontal-tb",
                transform:period==="month"?"rotate(180deg)":"none"}}>
                {period==="month"?label:label.substring(0,3)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:12,fontSize:10,color:THEME.muted,fontWeight:700}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{width:10,height:10,background:THEME.teal,borderRadius:2}}/>Pagati
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <div style={{width:10,height:10,background:THEME.red,borderRadius:2}}/>Non pagati
        </div>
      </div>
    </div>
  );
}

/* ─── Main ────────────────────────────────────────────────────────────── */
export default function ReportsMobile() {
  const params = useSearchParams();
  const [period,  setPeriod]  = useState<Period>((params.get("period") as Period)||"month");
  const [dateStr, setDateStr] = useState(params.get("date")||toISODate(new Date()));
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string|null>(null);

  const [statistics,       setStatistics]       = useState<Statistic>({total:0,invoiceCount:0,appointmentCount:0,averageAmount:0,maxAmount:0,minAmount:0,unpaidTotal:0,unpaidCount:0,unpaidAppointmentCount:0,unpaidInvoiceCount:0});
  const [sessionBreak, setSessionBreak] = useState({ done: 0, paid: 0, unpaid: 0, free: 0 });
  const [freeList, setFreeList] = useState<{id:string;start_at:string;patient_id:string|null;name:string}[]>([]);
  const [freeModalOpen, setFreeModalOpen] = useState(false);
  const [freeRowBusy, setFreeRowBusy] = useState<Record<string,boolean>>({});
  const [series,           setSeries]           = useState<number[]>([]);
  const [unpaidSeries,     setUnpaidSeries]     = useState<number[]>([]);
  const [rawData,          setRawData]          = useState<FinancialItem[]>([]);
  const [unpaidTherapies,  setUnpaidTherapies]  = useState<UnpaidTherapy[]>([]);
  const [unpaidTherapiesAll, setUnpaidTherapiesAll] = useState<UnpaidTherapy[]>([]);
  const [arrearsMonths,    setArrearsMonths]    = useState<{month:string;count:number;total:number}[]>([]);
  const [reportTherapies,  setReportTherapies]  = useState<AppointmentTherapy[]>([]);
  const [prevPeriodTotal,  setPrevPeriodTotal]  = useState<number|null>(null);
  const [compBars, setCompBars] = useState<{label:string;dateStr:string;revenue:number;isActive:boolean}[]>([]);

  const [selectedDay, setSelectedDay] = useState<number|null>(null);
  const [dayDetails,  setDayDetails]  = useState<FinancialItem[]>([]);
  const [activeTab,   setActiveTab]   = useState<"summary"|"graph"|"paid"|"unpaid"|"details">("summary");
  const [expandedPaid,   setExpandedPaid]   = useState(false);
  const [expandedUnpaid, setExpandedUnpaid] = useState(false);
  const [showUnpaidDropdown, setShowUnpaidDropdown] = useState(false);

  // Anteprima report come modale full-screen (vedi ReportPrintModal).
  // Sostituisce window.open che su iOS PWA lasciava l'utente bloccato.
  const [previewReport, setPreviewReport] = useState<{ html: string; title: string } | null>(null);

  /* user */
  const [userEmail,    setUserEmail]    = useState<string|null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>setUserEmail(data?.user?.email??null)).catch(()=>{});
  },[]);
  useEffect(()=>{
    const fn=(e:MouseEvent)=>{
      if(userMenuOpen&&userMenuRef.current&&!userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown",fn);
    return ()=>document.removeEventListener("mousedown",fn);
  },[userMenuOpen]);

  const userInitials = useMemo(()=>{
    if(!userEmail) return "U";
    const parts=(userEmail.split("@")[0]??"U").replace(/[^a-zA-Z0-9]/g," ").split(" ").filter(Boolean);
    return ((parts[0]?.[0]??"U")+(parts[1]?.[0]??"")).toUpperCase().slice(0,2);
  },[userEmail]);

  async function handleLogout(){
    try{await supabase.auth.signOut();}finally{window.location.href="/login";}
  }

  const baseDate = useMemo(()=>{
    const [y,m,d]=dateStr.split("-").map(Number);
    return new Date(y,(m||1)-1,d||1);
  },[dateStr]);

  const labels = useMemo(()=>makeLabels(period,baseDate),[period,baseDate]);

  /* ── Load ──────────────────────────────────────────────────────────── */
  async function fetchPaidData(from: Date, to: Date) {
    const fromStr=from.toISOString(), toStr=to.toISOString();

    const [{data:paidInv},{data:paidAppt}] = await Promise.all([
      supabase.from("invoices").select("id,amount,paid_at,status,patient_id").eq("status","paid").gte("paid_at",fromStr).lte("paid_at",toStr).order("paid_at",{ascending:true}),
      supabase.from("appointments").select("id,amount,start_at,status,treatment_type,price_type,patient_id").eq("status","done").gte("amount",0.01).gte("start_at",fromStr).lte("start_at",toStr).order("start_at",{ascending:true}),
    ]);
    const total = [
      ...(paidInv||[]).map((i:any)=>parseFloat(String(i.amount))||0),
      ...(paidAppt||[]).map((a:any)=>parseFloat(String(a.amount))||0),
    ].reduce((s,v)=>s+v,0);
    return total;
  }

  async function saveFreeAmount(apptId: string, raw: string) {
    const parsed = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (parsed !== null && !isFinite(parsed)) return;
    setFreeRowBusy(m => ({ ...m, [apptId]: true }));
    const res = await supabase.from("appointments").update({ amount: parsed }).eq("id", apptId);
    setFreeRowBusy(m => ({ ...m, [apptId]: false }));
    if (res.error) return;
    if (parsed != null && parsed > 0) {
      setFreeList(l => l.filter(x => x.id !== apptId));
      setSessionBreak(b => ({ ...b, free: Math.max(0, b.free - 1) }));
    }
    void loadData();
  }

  async function loadData() {
    setLoading(true); setError(null);
    setSelectedDay(null); setDayDetails([]);

    try {
      const {from,to}=getRange(period,baseDate);
      const fromStr=from.toISOString(), toStr=to.toISOString();

      // Scomposizione sedute svolte (pagate / da incassare / gratuite)
      void (async () => {
        const { data: allDone } = await supabase
          .from("appointments")
          .select("id, start_at, patient_id, amount, is_paid")
          .eq("status", "done")
          .gte("start_at", fromStr).lte("start_at", toStr)
          .is("guest_practitioner_id", null);
        const rows = allDone ?? [];
        const free = rows.filter(r => r.amount == null || Number(r.amount) === 0);
        setSessionBreak({
          done: rows.length,
          paid: rows.filter(r => Number(r.amount) > 0 && r.is_paid).length,
          unpaid: rows.filter(r => Number(r.amount) > 0 && !r.is_paid).length,
          free: free.length,
        });
        const freePatIds = [...new Set(free.map(r => r.patient_id).filter(Boolean))] as string[];
        const nameMap = new Map<string, string>();
        if (freePatIds.length > 0) {
          const { data: pats } = await supabase.from("patients")
            .select("id, first_name, last_name").in("id", freePatIds);
          for (const p of (pats ?? [])) nameMap.set(p.id, `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "Paziente");
        }
        setFreeList(free.map(r => ({
          id: r.id, start_at: r.start_at, patient_id: r.patient_id,
          name: r.patient_id ? (nameMap.get(r.patient_id) || "Paziente") : "Senza paziente",
        })).sort((a, b) => b.start_at.localeCompare(a.start_at)));
      })();

      // Parallel fetches
      const [
        {data:paidInv},
        {data:unpaidInv},
        {data:paidAppt},
        {data:unpaidApptRaw},
        {data:arrearsAppt},
        {data:unpaidInvAll},
        {data:unpaidApptAll},
        {data:groups},
      ] = await Promise.all([
        supabase.from("invoices").select("id,amount,paid_at,status,patient_id").eq("status","paid").gte("paid_at",fromStr).lte("paid_at",toStr).order("paid_at",{ascending:true}),
        supabase.from("invoices").select("id,amount,paid_at,created_at,status,patient_id").eq("status","not_paid").gte("created_at",fromStr).lte("created_at",toStr).order("created_at",{ascending:true}),
        supabase.from("appointments").select("id,amount,start_at,status,treatment_type,price_type,patient_id").eq("status","done").gte("amount",0.01).gte("start_at",fromStr).lte("start_at",toStr).order("start_at",{ascending:true}),
        supabase.from("appointments").select("id,amount,start_at,status,treatment_type,price_type,patient_id").eq("status","not_paid").gte("start_at",fromStr).lte("start_at",toStr).order("start_at",{ascending:true}),
        supabase.from("appointments").select("id,amount,start_at,status").eq("status","not_paid").lt("start_at",fromStr).order("start_at",{ascending:false}).limit(1000),
        supabase.from("invoices").select("id,amount,paid_at,created_at,status,patient_id").eq("status","not_paid").order("created_at",{ascending:true}).limit(1000),
        supabase.from("appointments").select("id,amount,start_at,status,treatment_type,price_type,patient_id").eq("status","not_paid").order("start_at",{ascending:true}).limit(1000),
        // ─── GRUPPI (mig. 014) ───────────────────────────────────────────
        supabase.from("appointments")
          .select(`
            id, start_at, group_title,
            appointment_participants (
              id, patient_id, price, payment_status, paid_at,
              attendance_status,
              patients:patient_id ( first_name, last_name )
            )
          `)
          .eq("is_group", true)
          .eq("status", "done")
          .gte("start_at", fromStr)
          .lte("start_at", toStr)
          .order("start_at", { ascending: true }),
      ]);

      // Collect all patient IDs
      const allIds = Array.from(new Set([
        ...(paidInv||[]).map((x:any)=>x.patient_id),
        ...(unpaidInv||[]).map((x:any)=>x.patient_id),
        ...(paidAppt||[]).map((x:any)=>x.patient_id),
        ...(unpaidApptRaw||[]).map((x:any)=>x.patient_id),
        ...(unpaidInvAll||[]).map((x:any)=>x.patient_id),
        ...(unpaidApptAll||[]).map((x:any)=>x.patient_id),
      ].filter(Boolean)));

      let patients: Record<string,{first_name:string;last_name:string}> = {};
      if(allIds.length>0){
        const {data:pd}=await supabase.from("patients").select("id,first_name,last_name").in("id",allIds);
        (pd||[]).forEach((p:any)=>{patients[p.id]=p;});
      }

      const pName=(pid:string)=>{const p=patients[pid]; return p?`${p.last_name||""} ${p.first_name||""}`.trim():"Sconosciuto";};

      // Paid invoices
      const invoicesItems: FinancialItem[] = (paidInv||[]).map((i:any)=>({
        amount:parseFloat(String(i.amount))||0, date:i.paid_at, source:"invoice" as const,
        description:`Fattura #${i.id}`, patient_name:pName(i.patient_id), patient_id:i.patient_id, status:"paid",
      })).filter(x=>x.amount>0);

      // Paid appointments
      const apptItems: FinancialItem[] = (paidAppt||[]).map((a:any)=>({
        amount:parseFloat(String(a.amount))||0, date:a.start_at, source:"appointment" as const,
        description:`${a.treatment_type||"Seduta"}`, patient_name:pName(a.patient_id), patient_id:a.patient_id, status:"paid",
      })).filter(x=>x.amount>0);

      // ─── GRUPPI (mig. 014) ─────────────────────────────────────────────
      // Aggreghiamo i partecipanti pagati e presenti dei gruppi del periodo.
      // Toggle group_stats_count_as_separate non disponibile su mobile reports
      // (manca currentStudio); usiamo modalità OFF (default): 1 riga per gruppo.
      const groupItems: FinancialItem[] = [];
      for (const g of (groups ?? [])) {
        const parts = ((g as any).appointment_participants ?? []) as Array<{
          id: string; patient_id: string; price: number | null;
          payment_status?: string | null; attendance_status?: string | null;
          patients?: Array<{first_name?: string; last_name?: string}> | {first_name?: string; last_name?: string} | null;
        }>;
        const paidPresent = parts.filter(p =>
          p.attendance_status === "present" && p.payment_status === "paid"
        );
        if (paidPresent.length === 0) continue;
        const totalPaid = paidPresent.reduce((s, p) => s + (Number(p.price) || 0), 0);
        groupItems.push({
          amount: totalPaid,
          date: (g as any).start_at,
          source: "appointment" as const,
          description: `Gruppo: ${(g as any).group_title || "Gruppo"} (${paidPresent.length} pers.)`,
          patient_name: `Gruppo: ${(g as any).group_title || "Gruppo"}`,
          patient_id: "",
          status: "paid",
        });
      }

      const allData=[...invoicesItems,...apptItems,...groupItems];
      setRawData(allData);

      // Unpaid therapies (period)
      const today=new Date();
      const unpaidList: UnpaidTherapy[]=[];
      (unpaidInv||[]).forEach((inv:any)=>{
        const amount=parseFloat(String(inv.amount))||0; if(amount<=0) return;
        const date=inv.paid_at||inv.created_at;
        unpaidList.push({id:inv.id,patient_id:inv.patient_id,patient_name:pName(inv.patient_id),amount,date,
          treatment_type:"Fattura",days_since:Math.floor((today.getTime()-new Date(date).getTime())/(864e5)),status:"not_paid"});
      });
      (unpaidApptRaw||[]).forEach((app:any)=>{
        const amount=parseFloat(String(app.amount))||0; if(amount<=0) return;
        unpaidList.push({id:app.id,patient_id:app.patient_id,patient_name:pName(app.patient_id),amount,date:app.start_at,
          treatment_type:app.treatment_type||"Seduta",days_since:Math.floor((today.getTime()-new Date(app.start_at).getTime())/(864e5)),status:app.status});
      });
      unpaidList.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
      setUnpaidTherapies(unpaidList);

      // Unpaid all time
      const unpaidAllList: UnpaidTherapy[]=[];
      (unpaidInvAll||[]).forEach((inv:any)=>{
        const amount=parseFloat(String(inv.amount))||0; if(amount<=0) return;
        const date=inv.paid_at||inv.created_at;
        unpaidAllList.push({id:inv.id,patient_id:inv.patient_id,patient_name:pName(inv.patient_id),amount,date,
          treatment_type:"Fattura",days_since:Math.floor((today.getTime()-new Date(date).getTime())/(864e5)),status:"not_paid"});
      });
      (unpaidApptAll||[]).forEach((app:any)=>{
        const amount=parseFloat(String(app.amount))||0; if(amount<=0) return;
        unpaidAllList.push({id:app.id,patient_id:app.patient_id,patient_name:pName(app.patient_id),amount,date:app.start_at,
          treatment_type:app.treatment_type||"Seduta",days_since:Math.floor((today.getTime()-new Date(app.start_at).getTime())/(864e5)),status:app.status});
      });
      unpaidAllList.sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
      setUnpaidTherapiesAll(unpaidAllList);

      // Arrears
      if(arrearsAppt){
        const map=new Map<string,{count:number;total:number}>();
        arrearsAppt.forEach((a:any)=>{
          const amt=parseFloat(String(a.amount))||0; if(amt<=0) return;
          const dt=new Date(a.start_at);
          const key=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
          const prev=map.get(key)||{count:0,total:0};
          map.set(key,{count:prev.count+1,total:prev.total+amt});
        });
        setArrearsMonths(Array.from(map.entries()).map(([month,v])=>({month,...v})).sort((a,b)=>b.month.localeCompare(a.month)));
      }

      // Report therapies for print
      const rp: AppointmentTherapy[]=[
        ...(paidAppt||[]).map((a:any)=>({id:String(a.id),patient_id:String(a.patient_id||""),patient_name:pName(a.patient_id),amount:parseFloat(String(a.amount))||0,date:a.start_at,treatment_type:a.treatment_type||"Terapia",status:"done" as const,price_type:a.price_type??null})),
        ...(unpaidApptRaw||[]).map((a:any)=>({id:String(a.id),patient_id:String(a.patient_id||""),patient_name:pName(a.patient_id),amount:parseFloat(String(a.amount))||0,date:a.start_at,treatment_type:a.treatment_type||"Terapia",status:"not_paid" as const,price_type:a.price_type??null})),
      ];
      setReportTherapies(rp);

      // Statistics
      const amounts=allData.map(x=>x.amount).filter(x=>x>0);
      const total=amounts.reduce((s,v)=>s+v,0);
      const unpaidTotal=unpaidList.reduce((s,x)=>s+x.amount,0);
      setStatistics({
        total, invoiceCount:invoicesItems.length, appointmentCount:apptItems.length,
        averageAmount:amounts.length>0?total/amounts.length:0,
        maxAmount:amounts.length>0?Math.max(...amounts):0,
        minAmount:amounts.length>0?Math.min(...amounts):0,
        unpaidTotal, unpaidCount:unpaidList.length,
        unpaidAppointmentCount:(unpaidApptRaw||[]).length,
        unpaidInvoiceCount:(unpaidInv||[]).length,
      });

      // Series for chart
      const pBuckets=new Array(labels.length).fill(0);
      const uBuckets=new Array(labels.length).fill(0);
      allData.forEach(item=>{if(!item.date) return; const idx=getBucketIndex(new Date(item.date),period); if(idx>=0&&idx<labels.length) pBuckets[idx]+=item.amount;});
      unpaidList.forEach(item=>{const idx=getBucketIndex(new Date(item.date),period); if(idx>=0&&idx<labels.length) uBuckets[idx]+=item.amount;});
      setSeries(pBuckets);
      setUnpaidSeries(uBuckets);

      // Prev period comparison
      const prev=prevBase(period,baseDate);
      const {from:pf,to:pt}=getRange(period,prev);
      const prevTotal=await fetchPaidData(pf,pt);
      setPrevPeriodTotal(prevTotal);

      // Confronto ±2 periodi
      const comp:{label:string;dateStr:string;revenue:number;isActive:boolean}[]=[];
      for(let i=-2;i<=2;i++){
        const d=new Date(baseDate);
        if(period==="day")d.setDate(d.getDate()+i);
        else if(period==="week")d.setDate(d.getDate()+i*7);
        else if(period==="month")d.setMonth(d.getMonth()+i);
        else if(period==="quarter")d.setMonth(d.getMonth()+i*3);
        else if(period==="semester")d.setMonth(d.getMonth()+i*6);
        else if(period==="year")d.setFullYear(d.getFullYear()+i);
        const{from:cf,to:ct}=getRange(period,d);
        const rev=await fetchPaidData(cf,ct);
        let lbl="";
        if(period==="month")lbl=d.toLocaleDateString("it-IT",{month:"short",year:"2-digit"});
        else if(period==="quarter"){const q=Math.floor(d.getMonth()/3)+1;lbl=`Q${q}'${String(d.getFullYear()).slice(2)}`;}
        else if(period==="semester"){const h=d.getMonth()<6?"S1":"S2";lbl=`${h}'${String(d.getFullYear()).slice(2)}`;}
        else if(period==="year")lbl=String(d.getFullYear());
        else lbl=d.toLocaleDateString("it-IT",{day:"2-digit",month:"short"});
        comp.push({label:lbl,dateStr:toISODate(d),revenue:rev,isActive:i===0});
      }
      setCompBars(comp);

    } catch(e:any) {
      setError(e.message||"Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ loadData(); },[period,dateStr]);

  function handleBarClick(idx: number) {
    setSelectedDay(idx);
    const items: FinancialItem[]=[];
    rawData.forEach(item=>{
      if(!item.date) return;
      if(getBucketIndex(new Date(item.date),period)===idx) items.push({...item,status:"paid"});
    });
    unpaidTherapies.forEach(item=>{
      if(getBucketIndex(new Date(item.date),period)===idx)
        items.push({amount:item.amount,date:item.date,source:"appointment",
          description:`${item.treatment_type} (Non pagato)`,patient_name:item.patient_name,
          patient_id:item.patient_id,status:"not_paid"});
    });
    setDayDetails(items);
  }

  /* ── Derived ─────────────────────────────────────────────────────── */
  const grandTotal  = statistics.total + statistics.unpaidTotal;
  const diffPct     = prevPeriodTotal!=null&&prevPeriodTotal>0
    ? Math.round(((statistics.total-prevPeriodTotal)/prevPeriodTotal)*100) : null;

  const formatMonthKey=(k:string)=>{
    const [y,m]=k.split("-").map(Number);
    return new Date(y,(m||1)-1,1).toLocaleDateString("it-IT",{month:"short",year:"numeric"});
  };

  /* ─── RENDER ──────────────────────────────────────────────────────── */
  return (
    <div style={{minHeight:"100vh",background:THEME.appBg,
      paddingBottom:BOTTOM_TAB_H+16,fontFamily:"Inter,-apple-system,sans-serif"}}>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position:"sticky",top:0,zIndex:30,
        background:THEME.gradient,padding:"0 14px",height:54,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        boxShadow:"0 2px 12px rgba(13,148,136,0.18)",gap:8,
      }}>
        {/* Logo + KPI chips */}
        <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0,overflow:"hidden"}}>
          <div style={{fontWeight:800,fontSize:14,color:"#fff",flexShrink:0}}>
            <span style={{opacity:0.85}}>F</span>
            <span style={{fontSize:11,opacity:0.7,marginLeft:1}}>Report</span>
          </div>
          {!loading&&(
            <div style={{display:"flex",gap:5,overflowX:"auto",flexShrink:1}}>
              <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99,
                background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",
                color:"#fff",whiteSpace:"nowrap",flexShrink:0}}>
                ✓ {currency.format(statistics.total)}
              </span>
              {statistics.unpaidTotal>0&&(
                <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99,
                  background:"rgba(220,38,38,0.35)",border:"1px solid rgba(255,255,255,0.25)",
                  color:"#fff",whiteSpace:"nowrap",flexShrink:0}}>
                  💸 {currency.format(statistics.unpaidTotal)}
                </span>
              )}
              {diffPct!=null&&(
                <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99,
                  background:diffPct>=0?"rgba(22,163,74,0.35)":"rgba(220,38,38,0.35)",
                  border:"1px solid rgba(255,255,255,0.25)",color:"#fff",whiteSpace:"nowrap",flexShrink:0}}>
                  {diffPct>=0?`▲ +${diffPct}%`:`▼ ${diffPct}%`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Avatar menu */}
        <div ref={userMenuRef} style={{position:"relative",flexShrink:0}}>
          <button onClick={()=>setUserMenuOpen(v=>!v)} style={{
            width:30,height:30,borderRadius:7,border:"1.5px solid rgba(255,255,255,0.35)",
            background:"rgba(255,255,255,0.2)",color:"#fff",fontWeight:800,fontSize:11,
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
          }}>{userInitials}</button>
          {userMenuOpen&&(
            <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:190,
              background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
              borderRadius:12,boxShadow:"0 12px 32px rgba(30,64,175,0.15)",overflow:"hidden",zIndex:60}}>
              <button onClick={handleLogout} style={{
                width:"100%",display:"flex",alignItems:"center",gap:8,
                padding:"12px 16px",background:"transparent",border:"none",
                cursor:"pointer",color:THEME.red,fontWeight:600,fontSize:13,
              }}>⏻ Logout</button>
            </div>
          )}
        </div>
      </header>

      {/* ━━━ BOTTOM TAB BAR ━━━ */}
      <nav style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:30,
        background:THEME.panelBg,borderTop:`1.5px solid ${THEME.border}`,
        display:"flex",boxShadow:"0 -4px 16px rgba(15,23,42,0.08)",
        paddingBottom:"env(safe-area-inset-bottom,0px)",
      }}>
        {[
          {href:"/mobile",          label:"Home",      icon:"⌂"},
          {href:"/mobile/calendar", label:"Calendario",icon:"▦"},
          {href:"/mobile/patients", label:"Pazienti",  icon:"◉"},
          {href:"/mobile/reports",  label:"Report",    icon:"◈",active:true},
        ].map(item=>(
          <Link key={item.href} href={item.href} style={{
            flex:1,display:"flex",flexDirection:"column",alignItems:"center",
            justifyContent:"center",padding:"10px 4px 9px",textDecoration:"none",
            gap:3,position:"relative",
          }}>
            <span style={{fontSize:18,lineHeight:1,
              ...(item.active
                ?{background:THEME.gradient,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}
                :{color:THEME.muted})}}>
              {item.icon}
            </span>
            <span style={{fontSize:10,fontWeight:item.active?700:600,
              color:item.active?THEME.blue:THEME.muted}}>{item.label}</span>
            {item.active&&(
              <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",
                width:28,height:2.5,borderRadius:999,background:THEME.gradient}}/>
            )}
          </Link>
        ))}
      </nav>

      {/* ━━━ PERIOD CONTROLS ━━━ */}
      <div style={{
        background:THEME.panelBg,borderBottom:`1.5px solid ${THEME.border}`,
        padding:"10px 14px",position:"sticky",top:54,zIndex:20,
        display:"flex",flexDirection:"column",gap:8,
      }}>
        {/* Toggle periodo */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {(["day","week","month","quarter","semester","year"] as Period[]).map(p=>(
            <button key={p} onClick={()=>setPeriod(p)} style={{
              flex:"1 1 auto",padding:"7px 6px",borderRadius:9,fontSize:10,fontWeight:700,
              border:"none",cursor:"pointer",fontFamily:"Inter,-apple-system,sans-serif",
              background:period===p?THEME.gradient:THEME.panelSoft,
              color:period===p?"#fff":THEME.muted,minWidth:48,
            }}>
              {p==="day"?"Oggi":p==="week"?"Sett.":p==="month"?"Mese":p==="quarter"?"Trim.":p==="semester"?"Sem.":"Anno"}
            </button>
          ))}
        </div>

        {/* Navigazione ‹ periodo › */}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setDateStr(toISODate(prevBase(period,baseDate)))} style={{
            width:30,height:30,borderRadius:8,border:`1.5px solid ${THEME.border}`,
            background:THEME.panelSoft,cursor:"pointer",fontSize:14,fontWeight:700,color:THEME.muted,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
          }}>‹</button>
          <div style={{flex:1,textAlign:"center",fontSize:12,fontWeight:700,color:THEME.text,
            textTransform:"capitalize"}}>
            {periodLabel(period,baseDate)}
          </div>
          <button onClick={()=>setDateStr(toISODate(nextBase(period,baseDate)))} style={{
            width:30,height:30,borderRadius:8,border:`1.5px solid ${THEME.border}`,
            background:THEME.panelSoft,cursor:"pointer",fontSize:14,fontWeight:700,color:THEME.muted,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
          }}>›</button>
          <button onClick={()=>setDateStr(toISODate(new Date()))} style={{
            padding:"5px 10px",borderRadius:8,fontSize:10,fontWeight:700,
            border:`1.5px solid ${THEME.border}`,background:THEME.panelSoft,
            cursor:"pointer",color:THEME.blue,flexShrink:0,
          }}>Oggi</button>
          <button onClick={()=>{setLoading(true);loadData();}} style={{
            width:30,height:30,borderRadius:8,border:`1.5px solid ${THEME.border}`,
            background:THEME.panelSoft,cursor:"pointer",fontSize:13,color:THEME.muted,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
          }}>↻</button>
        </div>
      </div>

      {/* ━━━ CONTENT TABS ━━━ */}
      <div style={{
        display:"flex",overflowX:"auto",
        background:THEME.panelBg,borderBottom:`1.5px solid ${THEME.border}`,
        padding:"0 12px",position:"sticky",top:54+88,zIndex:19,
      }}>
        {([
          {id:"summary", label:"Riepilogo", icon:"📊"},
          {id:"graph",   label:"Grafico",   icon:"📈"},
          {id:"paid",    label:"Pagati",    icon:"💰"},
          {id:"unpaid",  label:"Arretrati", icon:"⚠️", badge: unpaidTherapiesAll.length},
          {id:"details", label:"Dettagli",  icon:"📋"},
        ] as {id:"summary"|"graph"|"paid"|"unpaid"|"details";label:string;icon:string;badge?:number}[]).map(tab=>(
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
            padding:"11px 12px",background:"none",border:"none",
            borderBottom:`2.5px solid ${activeTab===tab.id?THEME.blue:"transparent"}`,
            color:activeTab===tab.id?THEME.blue:THEME.muted,
            fontWeight:activeTab===tab.id?700:600,fontSize:12,
            whiteSpace:"nowrap",cursor:"pointer",
            fontFamily:"Inter,-apple-system,sans-serif",
            display:"flex",alignItems:"center",gap:4,position:"relative",
          }}>
            <span style={{fontSize:13}}>{tab.icon}</span>
            {tab.label}
            {tab.badge!=null&&tab.badge>0&&(
              <span style={{fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:99,
                background:THEME.red,color:"#fff",marginLeft:2}}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ━━━ MAIN CONTENT ━━━ */}
      <div style={{padding:"14px 14px 0"}}>
        {loading?(
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",
            height:"40vh",color:THEME.muted,fontSize:14}}>
            Caricamento…
          </div>
        ):error?(
          <div style={{padding:"12px 14px",borderRadius:12,
            background:"rgba(220,38,38,0.06)",border:`1.5px solid rgba(220,38,38,0.25)`,
            color:"#7f1d1d",fontWeight:600,fontSize:13}}>
            ⚠️ {error}
          </div>
        ):(
          <>
            {/* ─── RIEPILOGO ─── */}
            {activeTab==="summary"&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>

                {/* KPI grid */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {[
                    {label:"Incassato",    value:currency.format(statistics.total),        color:THEME.green,  sub:`${statistics.invoiceCount} fatt. · ${statistics.appointmentCount} appt.`},
                    {label:"Da incassare", value:currency.format(statistics.unpaidTotal),   color:statistics.unpaidTotal>0?THEME.red:THEME.muted, sub:`${statistics.unpaidCount} terapie`},
                    {label:"Fatture np",   value:currency.format(unpaidTherapies.filter(t=>t.treatment_type==="Fattura").reduce((s,t)=>s+t.amount,0)), color:THEME.amber, sub:`${statistics.unpaidInvoiceCount} fatture`},
                    {label:"Appunt. np",   value:currency.format(unpaidTherapies.filter(t=>t.treatment_type!=="Fattura").reduce((s,t)=>s+t.amount,0)), color:THEME.amber, sub:`${statistics.unpaidAppointmentCount} appt.`},
                  ].map(k=>(
                    <div key={k.label} style={{
                      background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                      borderRadius:14,padding:"14px 14px",
                      boxShadow:"0 1px 4px rgba(15,23,42,0.05)",
                    }}>
                      <div style={{fontSize:10,fontWeight:700,color:THEME.muted,
                        textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>{k.label}</div>
                      <div style={{fontSize:18,fontWeight:800,color:k.color,lineHeight:1}}>{k.value}</div>
                      <div style={{fontSize:10,color:THEME.muted,marginTop:5}}>{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Scomposizione sedute svolte */}
                {sessionBreak.done > 0 && (
                  <div style={{background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                    borderRadius:14,padding:"16px",boxShadow:"0 1px 4px rgba(15,23,42,0.05)"}}>
                    <div style={{fontSize:10,fontWeight:700,color:THEME.muted,textTransform:"uppercase",
                      letterSpacing:"0.07em",marginBottom:6}}>Sedute svolte</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:12}}>
                      <span style={{fontSize:30,fontWeight:800,color:THEME.teal,lineHeight:1}}>{sessionBreak.done}</span>
                      <span style={{fontSize:11,color:THEME.muted}}>lavoro fatto</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      {[
                        {l:"Pagate",v:sessionBreak.paid,c:THEME.green,click:false},
                        {l:"Da incass.",v:sessionBreak.unpaid,c:THEME.red,click:false},
                        {l:"Gratuite",v:sessionBreak.free,c:THEME.amber,click:sessionBreak.free>0},
                      ].map(x=>(
                        <div key={x.l} onClick={x.click?()=>setFreeModalOpen(true):undefined}
                          style={{textAlign:"center",cursor:x.click?"pointer":"default",
                            background:x.click?"rgba(245,158,11,0.06)":"transparent",
                            borderRadius:10,padding:x.click?"6px 2px":"0"}}>
                          <div style={{fontSize:19,fontWeight:800,color:x.c}}>{x.v}</div>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginTop:3}}>
                            <span style={{width:6,height:6,borderRadius:"50%",background:x.c}}/>
                            <span style={{fontSize:10,color:THEME.muted,fontWeight:600}}>{x.l}</span>
                          </div>
                          {x.click&&<div style={{fontSize:9,color:THEME.amber,fontWeight:700,marginTop:2}}>tocca →</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Totale generale con confronto */}
                <div style={{
                  background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                  borderRadius:14,padding:"16px",
                  boxShadow:"0 1px 4px rgba(15,23,42,0.05)",
                }}>
                  <div style={{fontSize:10,fontWeight:700,color:THEME.muted,
                    textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Totale periodo</div>
                  <div style={{fontSize:28,fontWeight:800,color:THEME.blue,lineHeight:1}}>
                    {currency.format(grandTotal)}
                  </div>
                  <div style={{display:"flex",gap:16,marginTop:8,fontSize:12,color:THEME.muted}}>
                    <span>✓ {currency.format(statistics.total)}</span>
                    <span style={{color:statistics.unpaidTotal>0?THEME.red:THEME.muted}}>
                      💸 {currency.format(statistics.unpaidTotal)}
                    </span>
                    {diffPct!=null&&(
                      <span style={{fontWeight:700,color:diffPct>=0?THEME.green:THEME.red}}>
                        {diffPct>=0?`▲ +${diffPct}%`:`▼ ${diffPct}%`} vs precedente
                      </span>
                    )}
                  </div>
                </div>

                {/* Confronto periodi vicini */}
                {compBars.length>0&&(
                  <div style={{background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,borderRadius:14,padding:"14px 16px",boxShadow:"0 1px 4px rgba(15,23,42,0.05)"}}>
                    <div style={{fontSize:12,fontWeight:700,color:THEME.text,marginBottom:12}}>Confronto periodi vicini</div>
                    <div style={{display:"flex",gap:6,alignItems:"flex-end",height:80}}>
                      {compBars.map((b,i)=>{
                        const maxRev=Math.max(...compBars.map(x=>x.revenue),1);
                        const barH=Math.max((b.revenue/maxRev)*56,4);
                        return(
                          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer"}}
                            onClick={()=>setDateStr(b.dateStr)}>
                            <div style={{fontSize:9,fontWeight:700,color:b.isActive?THEME.teal:THEME.muted,marginBottom:4,textAlign:"center"}}>{currency.format(b.revenue)}</div>
                            <div style={{width:"100%",height:barH,borderRadius:"3px 3px 0 0",background:b.isActive?THEME.gradient:"rgba(148,163,184,0.35)",border:b.isActive?`1.5px solid ${THEME.teal}`:"none"}}/>
                            <div style={{fontSize:9,fontWeight:b.isActive?800:600,color:b.isActive?THEME.teal:THEME.muted,marginTop:4,textAlign:"center"}}>{b.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Arretrati */}
                {arrearsMonths.length>0&&(
                  <div style={{
                    background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                    borderRadius:14,overflow:"hidden",
                    boxShadow:"0 1px 4px rgba(15,23,42,0.05)",
                  }}>
                    <div style={{padding:"12px 16px",borderBottom:`1px solid ${THEME.border}`,
                      fontSize:12,fontWeight:700,color:THEME.text}}>
                      ⏰ Arretrati mesi precedenti
                    </div>
                    {arrearsMonths.slice(0,4).map((m,i)=>(
                      <div key={m.month} style={{
                        padding:"10px 16px",display:"flex",justifyContent:"space-between",
                        alignItems:"center",fontSize:12,
                        borderBottom:i<Math.min(arrearsMonths.length,4)-1?`1px solid ${THEME.border}`:"none",
                      }}>
                        <span style={{fontWeight:600,color:THEME.text,textTransform:"capitalize"}}>
                          {formatMonthKey(m.month)}
                        </span>
                        <span style={{fontWeight:700,color:THEME.red}}>
                          {m.count} terapie · {currency.format(m.total)}
                        </span>
                      </div>
                    ))}
                    {arrearsMonths.length>4&&(
                      <div style={{padding:"8px 16px",fontSize:11,color:THEME.muted,textAlign:"center"}}>
                        +{arrearsMonths.length-4} altri mesi
                      </div>
                    )}
                  </div>
                )}

                {/* Stampa */}
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>setPreviewReport({
                    html: buildTotalReportHtml(statistics,reportTherapies,rawData,period,baseDate),
                    title: "Report totali"
                  })}
                    style={{flex:1,padding:"12px",borderRadius:12,border:"none",
                      background:THEME.gradient,color:"#fff",fontWeight:700,fontSize:13,
                      cursor:"pointer",fontFamily:"Inter,-apple-system,sans-serif"}}>
                    🖨️ Report totale
                  </button>
                  <div style={{position:"relative",flex:1}}>
                    <button onClick={()=>setShowUnpaidDropdown(v=>!v)}
                      style={{width:"100%",padding:"12px",borderRadius:12,
                        border:`1.5px solid rgba(220,38,38,0.3)`,
                        background:"rgba(220,38,38,0.08)",color:THEME.red,
                        fontWeight:700,fontSize:13,cursor:"pointer",
                        fontFamily:"Inter,-apple-system,sans-serif"}}>
                      🖨️ Non pagati {showUnpaidDropdown?"▲":"▼"}
                    </button>
                    {showUnpaidDropdown&&(
                      <div style={{position:"absolute",bottom:"calc(100% + 8px)",left:0,right:0,
                        background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                        borderRadius:12,boxShadow:"0 -8px 24px rgba(15,23,42,0.12)",overflow:"hidden",zIndex:40}}>
                        <button onClick={()=>{
                          setPreviewReport({
                            html: buildReportHtml(unpaidTherapiesAll,"Report Terapie Non Pagate"),
                            title: "Report Terapie Non Pagate"
                          });
                          setShowUnpaidDropdown(false);
                        }}
                          style={{width:"100%",padding:"12px 16px",background:"none",border:"none",
                            textAlign:"left",fontSize:13,color:THEME.text,fontWeight:600,cursor:"pointer",
                            borderBottom:`1px solid ${THEME.border}`}}>
                          Tutti i non pagati
                        </button>
                        {Array.from(new Set(unpaidTherapiesAll.map(t=>t.patient_name))).sort().map(name=>(
                          <button key={name} onClick={()=>{
                            setPreviewReport({
                              html: buildReportHtml(unpaidTherapiesAll.filter(t=>t.patient_name===name),`Non Pagati — ${name}`),
                              title: `Non Pagati — ${name}`
                            });
                            setShowUnpaidDropdown(false);
                          }} style={{width:"100%",padding:"10px 16px",background:"none",border:"none",
                            textAlign:"left",fontSize:12,color:THEME.muted,cursor:"pointer",
                            borderBottom:`1px solid ${THEME.border}`}}>
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── GRAFICO ─── */}
            {activeTab==="graph"&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{
                  background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                  borderRadius:14,padding:16,boxShadow:"0 1px 4px rgba(15,23,42,0.05)",
                }}>
                  <div style={{fontSize:13,fontWeight:700,color:THEME.text,marginBottom:14}}>
                    Distribuzione incassi
                  </div>
                  <MobileBarChart labels={labels} values={series} unpaidValues={unpaidSeries}
                    period={period} onBarClick={handleBarClick} selectedDay={selectedDay}/>

                  {selectedDay!==null&&(
                    <div style={{marginTop:14,padding:14,background:THEME.panelSoft,
                      borderRadius:12,border:`1.5px solid ${THEME.border}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",
                        alignItems:"center",marginBottom:10}}>
                        <span style={{fontSize:13,fontWeight:700,color:THEME.text}}>
                          📅 {labels[selectedDay]}
                        </span>
                        <button onClick={()=>{setSelectedDay(null);setDayDetails([]);}} style={{
                          background:"none",border:"none",cursor:"pointer",
                          fontSize:16,color:THEME.muted,}}>✕</button>
                      </div>
                      {dayDetails.length===0?(
                        <div style={{textAlign:"center",color:THEME.muted,fontSize:12}}>Nessun dato</div>
                      ):(
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {dayDetails.map((item,i)=>{
                            const unpaid=item.status==="not_paid";
                            const col=unpaid?THEME.red:item.source==="invoice"?THEME.blue:THEME.teal;
                            return(
                              <div key={i} style={{padding:"10px 12px",borderRadius:10,
                                borderLeft:`3px solid ${col}`,
                                background:unpaid?"rgba(220,38,38,0.04)":item.source==="invoice"?"rgba(37,99,235,0.04)":"rgba(13,148,136,0.04)"}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <span style={{fontSize:14,fontWeight:700,color:THEME.text}}>
                                    {currency.format(item.amount)}
                                  </span>
                                  <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99,
                                    background:`${col}18`,color:col}}>
                                    {unpaid?"NON PAGATO":item.source==="invoice"?"FATTURA":"APPUNT."}
                                  </span>
                                </div>
                                {item.patient_name&&(
                                  <div style={{fontSize:11,color:THEME.muted,marginTop:3}}>
                                    👤 {item.patient_name}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── PAGATI ─── */}
            {activeTab==="paid"&&(
              <div style={{
                background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(15,23,42,0.05)",
              }}>
                <div style={{padding:"13px 16px",borderBottom:`1.5px solid ${THEME.border}`,
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:700,color:THEME.text}}>
                    💰 Pagati ({rawData.length})
                  </span>
                  <span style={{fontSize:12,fontWeight:700,color:THEME.green}}>
                    {currency.format(statistics.total)}
                  </span>
                </div>
                {rawData.length===0?(
                  <div style={{padding:24,textAlign:"center",color:THEME.muted,fontSize:13}}>
                    Nessuna transazione pagata nel periodo
                  </div>
                ):(
                  <>
                    {(expandedPaid?rawData:rawData.slice(0,10)).map((item,i)=>{
                      const col=item.source==="invoice"?THEME.blue:THEME.teal;
                      return(
                        <div key={i} style={{padding:"11px 16px",
                          borderBottom:i<(expandedPaid?rawData:rawData.slice(0,10)).length-1?`1px solid ${THEME.border}`:"none",
                          borderLeft:`3px solid ${col}`,
                        }}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                            <span style={{fontSize:14,fontWeight:700,color:THEME.text}}>
                              {currency.format(item.amount)}
                            </span>
                            <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99,
                              background:`${col}15`,color:col}}>
                              {item.source==="invoice"?"FATTURA":"APPUNT."}
                            </span>
                          </div>
                          {item.patient_name&&<div style={{fontSize:11,color:THEME.muted}}>👤 {item.patient_name}</div>}
                          <div style={{fontSize:10,color:THEME.gray,marginTop:2}}>
                            {new Date(item.date).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"})}
                            {item.description&&` · ${item.description}`}
                          </div>
                        </div>
                      );
                    })}
                    {rawData.length>10&&(
                      <button onClick={()=>setExpandedPaid(v=>!v)} style={{
                        width:"100%",padding:"12px",background:"none",border:"none",
                        borderTop:`1px solid ${THEME.border}`,color:THEME.blue,
                        fontSize:12,fontWeight:700,cursor:"pointer",
                        fontFamily:"Inter,-apple-system,sans-serif",
                      }}>
                        {expandedPaid?`▲ Mostra meno`:`▼ Mostra tutti (${rawData.length})`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ─── ARRETRATI ─── */}
            {activeTab==="unpaid"&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {/* Totale arretrati */}
                {unpaidTherapiesAll.length>0&&(
                  <div style={{padding:"14px 16px",borderRadius:14,
                    background:"rgba(220,38,38,0.06)",border:`1.5px solid rgba(220,38,38,0.2)`,
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,color:THEME.red}}>
                      Totale arretrati
                    </span>
                    <span style={{fontSize:18,fontWeight:800,color:THEME.red}}>
                      {currency.format(unpaidTherapiesAll.reduce((s,t)=>s+t.amount,0))}
                    </span>
                  </div>
                )}

                <div style={{
                  background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                  borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(15,23,42,0.05)",
                }}>
                  <div style={{padding:"13px 16px",borderBottom:`1.5px solid ${THEME.border}`,
                    fontSize:13,fontWeight:700,color:THEME.text}}>
                    ⚠️ Non pagati ({unpaidTherapiesAll.length})
                  </div>
                  {unpaidTherapiesAll.length===0?(
                    <div style={{padding:28,textAlign:"center",color:THEME.green,
                      fontSize:14,fontWeight:700}}>
                      🎉 Tutti i pagamenti sono saldati!
                    </div>
                  ):(
                    <>
                      {(expandedUnpaid?unpaidTherapiesAll:unpaidTherapiesAll.slice(0,10)).map((t,i)=>(
                        <Link key={t.id} href={`/mobile/patients/${t.patient_id}`}
                          style={{textDecoration:"none",display:"block"}}>
                          <div style={{padding:"11px 16px",
                            borderBottom:i<(expandedUnpaid?unpaidTherapiesAll:unpaidTherapiesAll.slice(0,10)).length-1?`1px solid ${THEME.border}`:"none",
                            borderLeft:`3px solid ${THEME.red}`,
                            background:i%2===0?"rgba(254,242,242,0.4)":"transparent",
                          }}>
                            <div style={{display:"flex",justifyContent:"space-between",
                              alignItems:"center",marginBottom:3}}>
                              <span style={{fontSize:14,fontWeight:700,color:THEME.text}}>
                                {currency.format(t.amount)}
                              </span>
                              <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99,
                                background:"rgba(220,38,38,0.1)",color:THEME.red}}>
                                NON PAGATO
                              </span>
                            </div>
                            <div style={{fontSize:12,fontWeight:600,color:THEME.textSoft}}>
                              👤 {t.patient_name}
                            </div>
                            <div style={{display:"flex",gap:10,fontSize:10,color:THEME.gray,marginTop:3}}>
                              <span>{new Date(t.date).toLocaleDateString("it-IT")}</span>
                              <span>{t.treatment_type}</span>
                              <span style={{color:t.days_since>30?THEME.red:THEME.amber,fontWeight:700}}>
                                ⏰ {t.days_since}g fa
                              </span>
                            </div>
                          </div>
                        </Link>
                      ))}
                      {unpaidTherapiesAll.length>10&&(
                        <button onClick={()=>setExpandedUnpaid(v=>!v)} style={{
                          width:"100%",padding:"12px",background:"none",border:"none",
                          borderTop:`1px solid ${THEME.border}`,color:THEME.blue,
                          fontSize:12,fontWeight:700,cursor:"pointer",
                          fontFamily:"Inter,-apple-system,sans-serif",
                        }}>
                          {expandedUnpaid?`▲ Mostra meno`:`▼ Mostra tutti (${unpaidTherapiesAll.length})`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ─── DETTAGLI ─── */}
            {activeTab==="details"&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{
                  background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                  borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(15,23,42,0.05)",
                }}>
                  <div style={{padding:"13px 16px",borderBottom:`1.5px solid ${THEME.border}`,
                    fontSize:13,fontWeight:700,color:THEME.text}}>
                    📊 Statistiche dettagliate
                  </div>
                  {[
                    {label:"Importo medio",        value:currency.format(statistics.averageAmount), color:THEME.blue},
                    {label:"Importo massimo",       value:currency.format(statistics.maxAmount),     color:THEME.green},
                    {label:"Importo minimo",        value:currency.format(statistics.minAmount),     color:THEME.amber},
                    {label:"Totale transazioni",    value:String(rawData.length),                   color:THEME.teal},
                    {label:"Fatture totali",        value:String(statistics.invoiceCount+statistics.unpaidInvoiceCount), color:THEME.blue},
                    {label:"Appuntamenti totali",   value:String(statistics.appointmentCount+statistics.unpaidAppointmentCount), color:THEME.teal},
                  ].map((s,i,arr)=>(
                    <div key={s.label} style={{
                      padding:"12px 16px",display:"flex",justifyContent:"space-between",
                      alignItems:"center",
                      borderBottom:i<arr.length-1?`1px solid ${THEME.border}`:"none",
                    }}>
                      <span style={{fontSize:13,color:THEME.muted}}>{s.label}</span>
                      <span style={{fontSize:14,fontWeight:700,color:s.color}}>{s.value}</span>
                    </div>
                  ))}
                </div>

                <div style={{
                  background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                  borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(15,23,42,0.05)",
                }}>
                  <div style={{padding:"13px 16px",borderBottom:`1.5px solid ${THEME.border}`,
                    fontSize:13,fontWeight:700,color:THEME.text}}>
                    📅 Periodo selezionato
                  </div>
                  {(()=>{
                    const {from,to}=getRange(period,baseDate);
                    const days=Math.ceil((to.getTime()-from.getTime())/(864e5))+1;
                    return[
                      {label:"Inizio", value:from.toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"})},
                      {label:"Fine",   value:to.toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"})},
                      {label:"Giorni", value:String(days)},
                    ].map((r,i,arr)=>(
                      <div key={r.label} style={{
                        padding:"12px 16px",display:"flex",justifyContent:"space-between",
                        borderBottom:i<arr.length-1?`1px solid ${THEME.border}`:"none",
                      }}>
                        <span style={{fontSize:13,color:THEME.muted}}>{r.label}</span>
                        <span style={{fontSize:13,fontWeight:600,color:THEME.text,textTransform:"capitalize"}}>{r.value}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Anteprima report full-screen (mobile-safe per PWA iOS) */}
      {previewReport && (
        <ReportPrintModal
          html={previewReport.html}
          title={previewReport.title}
          onClose={() => setPreviewReport(null)}
        />
      )}

      {/* Modale sedute gratuite (mobile) */}
      {freeModalOpen && (
        <div onClick={()=>setFreeModalOpen(false)}
          style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",zIndex:300,
            display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxHeight:"85vh",
              display:"flex",flexDirection:"column"}}>
            <div style={{padding:"16px 18px",borderBottom:`1px solid ${THEME.border}`,
              display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:THEME.text}}>Sedute gratuite / a 0€</div>
                <div style={{fontSize:11,color:THEME.muted,marginTop:2}}>{freeList.length} sedute · assegna un importo per spostarle</div>
              </div>
              <button onClick={()=>setFreeModalOpen(false)} style={{background:"none",border:"none",
                fontSize:24,color:THEME.muted,cursor:"pointer",lineHeight:1,padding:0}}>×</button>
            </div>
            <div style={{overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"4px 0 20px"}}>
              {freeList.length===0?(
                <div style={{padding:36,textAlign:"center",color:THEME.muted,fontSize:13}}>Nessuna seduta gratuita.</div>
              ):freeList.map((f,idx)=>(
                <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 18px",
                  borderBottom:idx<freeList.length-1?`1px solid ${THEME.border}`:"none"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:THEME.text,whiteSpace:"nowrap",
                      overflow:"hidden",textOverflow:"ellipsis"}}>{f.name}</div>
                    <div style={{fontSize:11,color:THEME.muted,marginTop:1}}>
                      {new Date(f.start_at).toLocaleDateString("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{fontSize:13,color:THEME.muted,fontWeight:700}}>€</span>
                    <input type="text" inputMode="decimal" placeholder="0,00" defaultValue=""
                      disabled={!!freeRowBusy[f.id]}
                      onBlur={e=>{const v=e.target.value.trim();if(v!=="")saveFreeAmount(f.id,v);}}
                      style={{width:78,padding:"8px 9px",borderRadius:8,border:`1px solid ${THEME.border}`,
                        fontSize:14,fontWeight:700,textAlign:"right",fontFamily:"inherit",color:THEME.text}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
