"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { openWhatsApp } from "@/src/lib/whatsapp";

function openWADirect(phone: string, message: string = ""): void {
  openWhatsApp(phone, message);
}
import { useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import Link from "next/link";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { studioPdfHeader, studioHeaderCss, studioPdfFooter, type StudioHeaderData } from "@/src/lib/pdfHeader";
import { BuildInfo } from "@/src/components/BuildInfo";
import NotificationsBell from "@/src/components/NotificationsBell";

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  appBg:"#f1f5f9", panelBg:"#ffffff", soft:"#f7f9fd",
  text:"#0f172a", sub:"#1e293b", muted:"#64748b",
  border:"#e2e8f0", borderSoft:"#94a3b8",
  blue:"#2563eb", teal:"#0d9488", green:"#16a34a",
  red:"#dc2626", amber:"#f97316", gray:"#94a3b8",
  gradient:"linear-gradient(135deg,#0d9488,#2563eb)",
};

type Period = "day"|"week"|"month"|"quarter"|"semester"|"year";
type MainTab = "overview"|"patients"|"operations"|"transactions";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toYMD(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function soD(d:Date){const x=new Date(d);x.setHours(0,0,0,0);return x;}
function eoD(d:Date){const x=new Date(d);x.setHours(23,59,59,999);return x;}
function soW(d:Date){const x=new Date(d);x.setDate(x.getDate()-((x.getDay()+6)%7));x.setHours(0,0,0,0);return x;}
function eoW(d:Date){const s=soW(d);const x=new Date(s);x.setDate(s.getDate()+6);x.setHours(23,59,59,999);return x;}
function soM(d:Date){return new Date(d.getFullYear(),d.getMonth(),1,0,0,0,0);}
function eoM(d:Date){return new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59,999);}
function getRange(p:Period,b:Date){
  if(p==="day") return{from:soD(b),to:eoD(b)};
  if(p==="week")return{from:soW(b),to:eoW(b)};
  if(p==="quarter"){
    const q=Math.floor(b.getMonth()/3);
    const from=new Date(b.getFullYear(),q*3,1,0,0,0,0);
    const to=new Date(b.getFullYear(),q*3+3,0,23,59,59,999);
    return{from,to};
  }
  if(p==="semester"){
    const half=b.getMonth()<6?0:1;
    const from=new Date(b.getFullYear(),half*6,1,0,0,0,0);
    const to=new Date(b.getFullYear(),half*6+6,0,23,59,59,999);
    return{from,to};
  }
  if(p==="year"){
    const from=new Date(b.getFullYear(),0,1,0,0,0,0);
    const to=new Date(b.getFullYear(),11,31,23,59,59,999);
    return{from,to};
  }
  return{from:soM(b),to:eoM(b)};
}
const euro  = new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:0,maximumFractionDigits:0});
const euro2 = new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2});

// ─── Types ────────────────────────────────────────────────────────────────────
type UnpaidRow  = {id:string;patient_id:string;name:string;amount:number;date:string;type:string;days:number;};
type PaidRow    = {id:string;patient_id:string;name:string;amount:number;date:string;type:string;};
type MonthBar   = {label:string;monthKey:string;revenue:number;unpaid:number;};
type TopPat     = {id:string;name:string;total:number;count:number;};
type TreatBreak = {type:string;count:number;revenue:number;};
type AgingBucket= {label:string;count:number;total:number;color:string;};
type CancelDay  = {day:string;total:number;cancelled:number;rate:number;};

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({data,color,height=48}:{data:number[];color:string;height?:number;}){
  const max=Math.max(...data,0.01);
  const W=400,H=height,P=4;
  const pts=data.map((v,i)=>`${P+(i/(data.length-1||1))*(W-P*2)},${H-P-(v/max)*(H-P*2)}`).join(" ");
  const area=`M ${pts.split(" ")[0]} L ${pts} L ${W-P},${H} L ${P},${H} Z`;
  const id=`sg_${color.replace("#","")}`;
  return(
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height}} preserveAspectRatio="none">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2"/><stop offset="100%" stopColor={color} stopOpacity="0.01"/></linearGradient></defs>
      <path d={area} fill={`url(#${id})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(rows:PaidRow[],unpaid:UnpaidRow[],label:string){
  const header="Paziente,Tipo,Data,Stato,Importo\n";
  const paid=rows.map(r=>`"${r.name}","${r.type}","${new Date(r.date).toLocaleDateString("it-IT")}","Pagato","${r.amount.toFixed(2)}"`).join("\n");
  const unp=unpaid.map(r=>`"${r.name}","${r.type}","${new Date(r.date).toLocaleDateString("it-IT")}","Non pagato","${r.amount.toFixed(2)}"`).join("\n");
  const csv=header+paid+"\n"+unp;
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`fisiohub_report_${label.replace(/\s/g,"_")}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Print ────────────────────────────────────────────────────────────────────
function printUnpaid(rows:UnpaidRow[],title:string,studio?:StudioHeaderData){
  const pw=window.open("","_blank");if(!pw)return;
  const esc=(s:any)=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;");
  const byPat:{[k:string]:{rows:UnpaidRow[];tot:number}}={};
  rows.forEach(r=>{if(!byPat[r.name])byPat[r.name]={rows:[],tot:0};byPat[r.name].rows.push(r);byPat[r.name].tot+=r.amount;});
  let body="";let grand=0;
  Object.keys(byPat).sort().forEach(n=>{const g=byPat[n];grand+=g.tot;body+=`<tr style="background:#f5f5f5"><td colspan="3"><b>${esc(n)}</b></td><td><b>${euro2.format(g.tot)}</b></td></tr>`;g.rows.forEach(r=>{body+=`<tr><td></td><td>${esc(r.type)}</td><td>${new Date(r.date).toLocaleDateString("it-IT")} (${r.days}gg)</td><td>${euro2.format(r.amount)}</td></tr>`;});});
  body+=`<tr style="background:#e8e8e8"><td colspan="3"><b>TOTALE</b></td><td><b>${euro2.format(grand)}</b></td></tr>`;
  pw.document.write(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;padding:2cm;color:#0f172a}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #ccc;padding:6pt;font-size:10pt}th{background:#eee}button{padding:8px 16px;cursor:pointer;margin-bottom:24px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:700}@media print{button{display:none}}${studioHeaderCss}</style></head><body><button onclick="window.print()">🖨 Stampa / Salva PDF</button>${studioPdfHeader(studio,{docTitle:title})}<table><thead><tr><th>Paziente</th><th>Tipo</th><th>Data</th><th>Importo</th></tr></thead><tbody>${body}</tbody></table>${studioPdfFooter(studio)}<script>window.onload=()=>setTimeout(()=>window.print(),400);</script></body></html>`);
  pw.document.close();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ReportsPage(){
  const params  =useSearchParams();
  const { studio: currentStudio } = useCurrentStudio();
  const[period, setPeriod] =useState<Period>((params.get("period") as Period)||"month");
  const[dateStr,setDateStr]=useState(params.get("date")||toYMD(new Date()));
  const[tab,    setTab]    =useState<MainTab>("overview");
  const[loading,setLoading]=useState(true);
  const[error,  setError]  =useState<string|null>(null);

  // ── Toggle gruppi (mig. 014) ──
  // Se OFF (default): 1 gruppo = 1 seduta, ricavo = somma price partecipanti pagati
  // Se ON: ogni partecipante pagato = 1 seduta separata
  const[groupStatsSeparate, setGroupStatsSeparate] = useState<boolean>(false);
  useEffect(() => {
    const v = (currentStudio as unknown as { group_stats_count_as_separate?: boolean | null })
      ?.group_stats_count_as_separate;
    setGroupStatsSeparate(v === true);
  }, [currentStudio]);

  // ── Dati finanziari ──
  const[revenue,    setRevenue]    =useState(0);
  const[unpaidTot,  setUnpaidTot]  =useState(0);
  const[sessions,   setSessions]   =useState(0);
  const[prevRev,    setPrevRev]    =useState<number|null>(null);
  const[monthBars,  setMonthBars]  =useState<MonthBar[]>([]);
  const[goal,       setGoal]       =useState(2000);
  const[compBars,   setCompBars]   =useState<{label:string;period:string;revenue:number;sessions:number;isActive:boolean}[]>([]);
  const[editGoal,   setEditGoal]   =useState(false);
  const[goalInput,  setGoalInput]  =useState("2000");

  // ── Liste transazioni ──
  const[unpaidRows, setUnpaidRows] =useState<UnpaidRow[]>([]);
  const[paidRows,   setPaidRows]   =useState<PaidRow[]>([]);
  const[showAllPaid,setShowAllPaid]=useState(false);
  const[unpaidFilter,setUnpaidFilter]=useState("");

  // ── Pazienti ──
  const[newPatients,    setNewPatients]    =useState(0);
  const[returnPatients, setReturnPatients] =useState(0);
  const[unscheduled,    setUnscheduled]    =useState<{id:string;name:string;lastVisit:string;days:number;phone:string|null}[]>([]);
  const[avgVisitsPerPat,setAvgVisitsPerPat]=useState<number|null>(null);
  const[ltv,            setLtv]            =useState<number|null>(null);
  const[topPats,        setTopPats]        =useState<TopPat[]>([]);

  // ── Operativo ──
  const[treatBreak,   setTreatBreak]  =useState<TreatBreak[]>([]);
  const[cancelByDay,  setCancelByDay] =useState<CancelDay[]>([]);
  const[capacityPct,  setCapacityPct] =useState<number|null>(null);
  const[agingBuckets, setAgingBuckets]=useState<AgingBucket[]>([]);
  const[presentRate,  setPresentRate] =useState<number|null>(null);
  const[bestDay,      setBestDay]     =useState<string|null>(null);
  const[revenuePerVisit,setRevPerVisit]=useState<number|null>(null);

  // ── Aggregati per metodo di pagamento ──
  // Calcolati nelle fetch principali; mostrati nella sezione "Incassi del periodo".
  type PaymentBreakdown = {
    cash: number; pos: number; bank_transfer: number; none: number;
    cashCount: number; posCount: number; bankCount: number; noneCount: number;
    cashRegimeTotal: number; cashRegimeCount: number;
  };
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown>({
    cash: 0, pos: 0, bank_transfer: 0, none: 0,
    cashCount: 0, posCount: 0, bankCount: 0, noneCount: 0,
    cashRegimeTotal: 0, cashRegimeCount: 0,
  });

  const baseDate=useMemo(()=>{const[y,m,d]=dateStr.split("-").map(Number);return new Date(y,m-1,d);},[dateStr]);

  // ── User menu / dropdown navbar ──
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const periodMenuRef = useRef<HTMLDivElement | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [unpaidSubmenuOpen, setUnpaidSubmenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data?.user?.email ?? null);
    })();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(t)) setUserMenuOpen(false);
      if (periodMenuOpen && periodMenuRef.current && !periodMenuRef.current.contains(t)) setPeriodMenuOpen(false);
      if (actionsMenuOpen && actionsMenuRef.current && !actionsMenuRef.current.contains(t)) {
        setActionsMenuOpen(false);
        setUnpaidSubmenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen, periodMenuOpen, actionsMenuOpen]);

  const handleLogout = useCallback(async () => {
    try { await supabase.auth.signOut(); } finally {
      setUserMenuOpen(false);
      window.location.href = "/login";
    }
  }, []);

  const userInitials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "?";

  // ref per annullare chiamate in corso se period/date cambiano prima che finiscano
  const loadIdRef = useRef(0);

  // Carica obiettivo fatturato dalle impostazioni all'avvio
  useEffect(()=>{
    (async()=>{
      try{
        const{data:{user}}=await supabase.auth.getUser();
        if(!user)return;
        const{data}=await supabase.from("practice_settings").select("monthly_revenue_goal").eq("owner_id",user.id).maybeSingle();
        if(data?.monthly_revenue_goal){ setGoal(data.monthly_revenue_goal); setGoalInput(String(data.monthly_revenue_goal)); }
      }catch(e){ console.warn(e); }
    })();
  },[]);

  // ─── Load ──────────────────────────────────────────────────────────────────
  async function loadData(){
    const currentId = ++loadIdRef.current;
    setLoading(true);setError(null);
    try{
      const{from,to}=getRange(period,baseDate);
      const fs=from.toISOString(),ts=to.toISOString();

      async function pats(ids:string[]){
        if(!ids.length)return new Map<string,{name:string;phone:string|null}>();
        const{data}=await supabase.from("patients").select("id,first_name,last_name,phone").in("id",ids);
        const m=new Map<string,{name:string;phone:string|null}>();
        (data||[]).forEach((p:any)=>m.set(p.id,{name:`${p.last_name||""} ${p.first_name||""}`.trim()||"Sconosciuto",phone:p.phone??null}));
        return m;
      }

      // ── Appuntamenti periodo ──
      const[{data:done},{data:unp},{data:allA},{data:cancelled},{data:groups}]=await Promise.all([
        supabase.from("appointments").select("id,amount,start_at,treatment_type,patient_id,price_type,payment_method").eq("status","done").gte("amount",0.01).gte("start_at",fs).lte("start_at",ts).order("start_at",{ascending:false}),
        supabase.from("appointments").select("id,amount,start_at,treatment_type,patient_id").eq("status","not_paid").gte("start_at",fs).lte("start_at",ts).order("start_at",{ascending:false}),
        supabase.from("appointments").select("status,start_at,patient_id").gte("start_at",fs).lte("start_at",ts),
        supabase.from("appointments").select("status,start_at").eq("status","cancelled").gte("start_at",fs).lte("start_at",ts),
        // ─── GRUPPI (mig. 014) ─────────────────────────────────────────────
        // Per ogni gruppo "done" nel periodo, prendiamo i partecipanti pagati con dati paziente.
        // I gruppi padre hanno amount=null quindi NON vengono presi dalla query "done" sopra.
        supabase.from("appointments")
          .select(`
            id, start_at, group_title,
            appointment_participants (
              id, patient_id, price, payment_status, paid_at,
              attendance_status, payment_method,
              patients:patient_id ( first_name, last_name )
            )
          `)
          .eq("is_group", true)
          .eq("status", "done")
          .gte("start_at", fs)
          .lte("start_at", ts)
          .order("start_at", { ascending: false }),
      ]);

      const doneData=done||[],unpData=unp||[],allData=allA||[];
      const allIds=Array.from(new Set([...doneData,...unpData].map((r:any)=>r.patient_id).filter(Boolean)));
      const patMap=await pats(allIds);

      const paidList:PaidRow[]=doneData.map((r:any)=>({
        id:r.id,patient_id:r.patient_id,
        name:patMap.get(r.patient_id)?.name||"Sconosciuto",
        amount:parseFloat(String(r.amount))||0,
        date:r.start_at,type:r.treatment_type||"Seduta",
      })).filter(r=>r.amount>0);

      // ─── GRUPPI (mig. 014) ───────────────────────────────────────────────
      // Aggiungiamo righe per i partecipanti pagati dei gruppi "done" del periodo.
      // - Sedute eseguite: solo attendance_status='present' (assenti non contano)
      // - Ricavi: solo payment_status='paid' (uguale al singoli: solo pagati contano)
      // - Modalità del toggle:
      //   • OFF (default): 1 riga per gruppo, name="Gruppo: <titolo>", amount=somma price
      //   • ON: 1 riga per partecipante (counta come visita individuale)
      const groupRows: PaidRow[] = [];
      const groupsByMethod = { cash: 0, pos: 0, bank_transfer: 0, none: 0 };
      const groupsByMethodCount = { cash: 0, pos: 0, bank_transfer: 0, none: 0 };
      for (const g of (groups ?? [])) {
        const parts = ((g as any).appointment_participants ?? []) as Array<{
          id: string; patient_id: string; price: number | null;
          payment_status?: string | null; paid_at?: string | null;
          attendance_status?: string | null;
          payment_method?: string | null;
          patients?: Array<{first_name?: string; last_name?: string}> | {first_name?: string; last_name?: string} | null;
        }>;
        // Filtra solo presenti E pagati (per ricavi/sedute)
        const paidPresent = parts.filter(p =>
          p.attendance_status === "present" && p.payment_status === "paid"
        );
        if (paidPresent.length === 0) continue;

        // Aggrega per metodo di pagamento
        for (const p of paidPresent) {
          const amt = Number(p.price) || 0;
          const m = (p.payment_method ?? "none") as keyof typeof groupsByMethod;
          if (m in groupsByMethod) {
            groupsByMethod[m] += amt;
            groupsByMethodCount[m] += 1;
          } else {
            groupsByMethod.none += amt;
            groupsByMethodCount.none += 1;
          }
        }

        if (groupStatsSeparate) {
          // ON: 1 riga per partecipante presente
          for (const p of paidPresent) {
            const pp = Array.isArray(p.patients) ? p.patients[0] : p.patients;
            const fullName = pp ? `${pp.last_name ?? ""} ${pp.first_name ?? ""}`.trim() : "Sconosciuto";
            groupRows.push({
              id: p.id,
              patient_id: p.patient_id,
              name: fullName || "Sconosciuto",
              amount: Number(p.price) || 0,
              date: (g as any).start_at,
              type: `Gruppo: ${(g as any).group_title || "Gruppo"}`,
            });
          }
        } else {
          // OFF: 1 riga per gruppo, totale = somma dei price dei presenti+pagati
          const totalPaid = paidPresent.reduce((s, p) => s + (Number(p.price) || 0), 0);
          groupRows.push({
            id: (g as any).id,
            patient_id: "", // gruppo, non c'è patient singolo
            name: `Gruppo: ${(g as any).group_title || "Gruppo"}`,
            amount: totalPaid,
            date: (g as any).start_at,
            type: `Gruppo (${paidPresent.length} pers.)`,
          });
        }
      }

      // Concateno: ricavi gruppi insieme ai singoli
      const fullPaidList = [...paidList, ...groupRows];
      setPaidRows(fullPaidList);

      const rev=fullPaidList.reduce((s,r)=>s+r.amount,0);
      const sess=fullPaidList.length;
      setRevenue(rev);setSessions(sess);
      setRevPerVisit(sess>0?rev/sess:null);

      // ── Aggregati per metodo di pagamento (sedute fatturate eseguite) ──
      // Solo quelle con price_type === "invoiced" hanno un metodo significativo
      const byMethod = { cash: 0, pos: 0, bank_transfer: 0, none: 0 };
      const byMethodCount = { cash: 0, pos: 0, bank_transfer: 0, none: 0 };
      let cashRegimeTotal = 0; // sedute "Contanti" (= price_type "cash")
      let cashRegimeCount = 0;
      doneData.forEach((r:any)=>{
        const amt = parseFloat(String(r.amount))||0;
        if (amt <= 0) return;
        if (r.price_type === "cash") {
          cashRegimeTotal += amt;
          cashRegimeCount++;
        } else if (r.price_type === "invoiced") {
          const m = (r.payment_method as keyof typeof byMethod) || "none";
          if (m in byMethod) {
            byMethod[m] += amt;
            byMethodCount[m]++;
          } else {
            byMethod.none += amt;
            byMethodCount.none++;
          }
        }
      });
      setPaymentBreakdown({
        cash: byMethod.cash + groupsByMethod.cash,
        pos: byMethod.pos + groupsByMethod.pos,
        bank_transfer: byMethod.bank_transfer + groupsByMethod.bank_transfer,
        none: byMethod.none + groupsByMethod.none,
        cashCount: byMethodCount.cash + groupsByMethodCount.cash,
        posCount: byMethodCount.pos + groupsByMethodCount.pos,
        bankCount: byMethodCount.bank_transfer + groupsByMethodCount.bank_transfer,
        noneCount: byMethodCount.none + groupsByMethodCount.none,
        cashRegimeTotal, cashRegimeCount,
      });

      // ── Tutti i non pagati (storico) ──
      const{data:allUnp}=await supabase.from("appointments").select("id,amount,start_at,treatment_type,patient_id").eq("status","not_paid").order("start_at",{ascending:false}).limit(2000);
      const unpIds=Array.from(new Set((allUnp||[]).map((r:any)=>r.patient_id).filter(Boolean))) as string[];
      const unpPatMap=await pats(unpIds);
      const today=new Date();
      const unpList:UnpaidRow[]=(allUnp||[]).map((r:any)=>({
        id:r.id,patient_id:r.patient_id,
        name:unpPatMap.get(r.patient_id)?.name||"Sconosciuto",
        amount:parseFloat(String(r.amount))||0,
        date:r.start_at,type:r.treatment_type||"Seduta",
        days:Math.floor((today.getTime()-new Date(r.start_at).getTime())/86400000),
      })).filter(r=>r.amount>0);
      setUnpaidRows(unpList);
      const unpTot=unpList.reduce((s,r)=>s+r.amount,0);
      setUnpaidTot(unpTot);

      // ── Aging buckets ──
      const b0:AgingBucket={label:"0–30 gg",count:0,total:0,color:T.amber};
      const b31:AgingBucket={label:"31–60 gg",count:0,total:0,color:T.red};
      const b60:AgingBucket={label:">60 gg",count:0,total:0,color:"#7f1d1d"};
      unpList.forEach(r=>{
        if(r.days<=30){b0.count++;b0.total+=r.amount;}
        else if(r.days<=60){b31.count++;b31.total+=r.amount;}
        else{b60.count++;b60.total+=r.amount;}
      });
      setAgingBuckets([b0,b31,b60]);

      // ── Tasso presentazione ──
      const ap=allData as{status:string;patient_id:string}[];
      const conf=ap.filter(a=>a.status==="done"||a.status==="not_paid").length;
      const canc=ap.filter(a=>a.status==="cancelled").length;
      setPresentRate(conf+canc>0?Math.round(conf/(conf+canc)*100):null);

      // ── Top pazienti ──
      const topMap=new Map<string,{name:string;total:number;count:number}>();
      paidList.forEach(r=>{const p=topMap.get(r.patient_id)||{name:r.name,total:0,count:0};topMap.set(r.patient_id,{...p,total:p.total+r.amount,count:p.count+1});});
      setTopPats(Array.from(topMap.values()).sort((a,b)=>b.total-a.total).slice(0,5).map((v,i)=>({id:Array.from(topMap.keys())[i]||String(i),...v})));

      // ── Periodo precedente ──
      const prevBase=new Date(baseDate);
      if(period==="day")prevBase.setDate(prevBase.getDate()-1);
      else if(period==="week")prevBase.setDate(prevBase.getDate()-7);
      else if(period==="quarter")prevBase.setMonth(prevBase.getMonth()-3);
      else if(period==="semester")prevBase.setMonth(prevBase.getMonth()-6);
      else if(period==="year")prevBase.setFullYear(prevBase.getFullYear()-1);
      else prevBase.setMonth(prevBase.getMonth()-1);
      const{from:pf,to:pt}=getRange(period,prevBase);
      const{data:prevD}=await supabase.from("appointments").select("amount").eq("status","done").gte("amount",0.01).gte("start_at",pf.toISOString()).lte("start_at",pt.toISOString());
      setPrevRev((prevD||[]).reduce((s:number,r:any)=>s+(parseFloat(String(r.amount))||0),0));

      // ── Trend: mensile dentro il periodo selezionato (o ultimi 6 mesi per day/week/month) ──
      const bars:MonthBar[]=[];
      if(period==="year"||period==="semester"||period==="quarter"){
        // Mostra tutti i mesi dentro il periodo selezionato
        const{from:pFrom,to:pTo}=getRange(period,baseDate);
        const cur=new Date(pFrom.getFullYear(),pFrom.getMonth(),1);
        while(cur<=pTo){
          const mf=soM(cur).toISOString(),mt=eoM(cur).toISOString();
          const[{data:mp},{data:mu}]=await Promise.all([
            supabase.from("appointments").select("amount").eq("status","done").gte("amount",0.01).gte("start_at",mf).lte("start_at",mt),
            supabase.from("appointments").select("amount").eq("status","not_paid").gte("amount",0.01).gte("start_at",mf).lte("start_at",mt),
          ]);
          bars.push({monthKey:toYMD(cur),label:cur.toLocaleDateString("it-IT",{month:"short",year:period==="year"?"2-digit":undefined}),revenue:(mp||[]).reduce((s:number,r:any)=>s+(parseFloat(String(r.amount))||0),0),unpaid:(mu||[]).reduce((s:number,r:any)=>s+(parseFloat(String(r.amount))||0),0)});
          cur.setMonth(cur.getMonth()+1);
        }
      } else {
        // Ultimi 6 mesi per day/week/month
        const now=new Date();
        for(let i=5;i>=0;i--){
          const d=new Date(now.getFullYear(),now.getMonth()-i,1);
          const mf=soM(d).toISOString(),mt=eoM(d).toISOString();
          const[{data:mp},{data:mu}]=await Promise.all([
            supabase.from("appointments").select("amount").eq("status","done").gte("amount",0.01).gte("start_at",mf).lte("start_at",mt),
            supabase.from("appointments").select("amount").eq("status","not_paid").gte("amount",0.01).gte("start_at",mf).lte("start_at",mt),
          ]);
          bars.push({monthKey:toYMD(d),label:d.toLocaleDateString("it-IT",{month:"short"}),revenue:(mp||[]).reduce((s:number,r:any)=>s+(parseFloat(String(r.amount))||0),0),unpaid:(mu||[]).reduce((s:number,r:any)=>s+(parseFloat(String(r.amount))||0),0)});
        }
      }
      setMonthBars(bars);

      // ── Confronto periodi vicini (±2 periodi) ──
      const compData:{label:string;period:string;revenue:number;sessions:number;isActive:boolean}[]=[];
      for(let i=-2;i<=2;i++){
        const d=new Date(baseDate);
        if(period==="day")d.setDate(d.getDate()+i);
        else if(period==="week")d.setDate(d.getDate()+i*7);
        else if(period==="month")d.setMonth(d.getMonth()+i);
        else if(period==="quarter")d.setMonth(d.getMonth()+i*3);
        else if(period==="semester")d.setMonth(d.getMonth()+i*6);
        else if(period==="year")d.setFullYear(d.getFullYear()+i);
        const{from:cf,to:ct}=getRange(period,d);
        const[{data:cDone}]=await Promise.all([
          supabase.from("appointments").select("amount,status").in("status",["done","not_paid"]).gte("start_at",cf.toISOString()).lte("start_at",ct.toISOString()),
        ]);
        const cRev=(cDone||[]).filter((r:any)=>r.status==="done").reduce((s:number,r:any)=>s+(parseFloat(String(r.amount))||0),0);
        const cSess=(cDone||[]).length;
        let label="";
        if(period==="month")label=d.toLocaleDateString("it-IT",{month:"short",year:"2-digit"});
        else if(period==="quarter"){const q=Math.floor(d.getMonth()/3)+1;label=`Q${q}'${String(d.getFullYear()).slice(2)}`;}
        else if(period==="semester"){const h=d.getMonth()<6?"S1":"S2";label=`${h}'${String(d.getFullYear()).slice(2)}`;}
        else if(period==="year")label=String(d.getFullYear());
        else if(period==="week")label=`Sett.${i===0?"":""+i}`;
        else label=d.toLocaleDateString("it-IT",{day:"2-digit",month:"short"});
        compData.push({label,period:cf.toISOString().slice(0,10),revenue:cRev,sessions:cSess,isActive:i===0});
      }
      if(currentId===loadIdRef.current) setCompBars(compData);

      // ── Nuovi vs ritorni ──
      const patientIdsInPeriod=Array.from(new Set(ap.filter(a=>a.patient_id).map((a:any)=>a.patient_id)));
      let newCount=0,returnCount=0;
      if(patientIdsInPeriod.length>0){
        const{data:firstVisits}=await supabase.from("appointments").select("patient_id,start_at").in("patient_id",patientIdsInPeriod).neq("status","cancelled").order("start_at",{ascending:true});
        const firstVisitMap=new Map<string,string>();
        (firstVisits||[]).forEach((r:any)=>{if(!firstVisitMap.has(r.patient_id))firstVisitMap.set(r.patient_id,r.start_at);});
        patientIdsInPeriod.forEach(pid=>{
          const first=firstVisitMap.get(pid);
          if(!first)return;
          if(new Date(first)>=from&&new Date(first)<=to)newCount++;
          else returnCount++;
        });
      }
      setNewPatients(newCount);setReturnPatients(returnCount);

      // ── Media visite per paziente (storico) ──
      const{data:allDoneHist}=await supabase.from("appointments").select("patient_id").eq("status","done").limit(10000);
      if(allDoneHist&&allDoneHist.length>0){
        const visitMap=new Map<string,number>();
        (allDoneHist as{patient_id:string}[]).forEach(r=>{visitMap.set(r.patient_id,(visitMap.get(r.patient_id)||0)+1);});
        const vals=Array.from(visitMap.values());
        setAvgVisitsPerPat(vals.length>0?Math.round((vals.reduce((s,v)=>s+v,0)/vals.length)*10)/10:null);
      }

      // ── LTV ──
      const{data:allRevHist}=await supabase.from("appointments").select("patient_id,amount").eq("status","done").gte("amount",0.01).limit(10000);
      if(allRevHist&&allRevHist.length>0){
        const revMap=new Map<string,number>();
        (allRevHist as{patient_id:string;amount:number}[]).forEach(r=>{revMap.set(r.patient_id,(revMap.get(r.patient_id)||0)+(parseFloat(String(r.amount))||0));});
        const vals=Array.from(revMap.values());
        setLtv(vals.length>0?Math.round(vals.reduce((s,v)=>s+v,0)/vals.length):null);
      }

      // ── Pazienti non rischedulati ──
      const{data:futureAppts}=await supabase.from("appointments").select("patient_id").gte("start_at",today.toISOString()).neq("status","cancelled");
      const futureIds=new Set((futureAppts||[]).map((r:any)=>r.patient_id).filter(Boolean));
      const{data:recentDone}=await supabase.from("appointments").select("patient_id,start_at,patients:patient_id(first_name,last_name,phone)").eq("status","done").order("start_at",{ascending:false}).limit(500);
      const seenUnsch=new Set<string>();
      const unschList:{id:string;name:string;lastVisit:string;days:number;phone:string|null}[]=[];
      for(const r of (recentDone||[]) as any[]){
        if(!r.patient_id||seenUnsch.has(r.patient_id)||futureIds.has(r.patient_id))continue;
        seenUnsch.add(r.patient_id);
        const p=Array.isArray(r.patients)?r.patients[0]:r.patients;
        const name=p?`${p.last_name||""} ${p.first_name||""}`.trim():"Sconosciuto";
        unschList.push({id:r.patient_id,name,lastVisit:r.start_at,days:Math.floor((today.getTime()-new Date(r.start_at).getTime())/86400000),phone:p?.phone??null});
        if(unschList.length>=20)break;
      }
      setUnscheduled(unschList);

      // ── Breakdown per trattamento ──
      const treatMap=new Map<string,{count:number;revenue:number}>();
      paidList.forEach(r=>{
        const t=r.type||"Seduta generica";
        const prev=treatMap.get(t)||{count:0,revenue:0};
        treatMap.set(t,{count:prev.count+1,revenue:prev.revenue+r.amount});
      });
      setTreatBreak(Array.from(treatMap.entries()).map(([type,v])=>({type,...v})).sort((a,b)=>b.revenue-a.revenue));

      // ── Cancellazioni per giorno settimana ──
      const{data:allApptsDow}=await supabase.from("appointments").select("status,start_at").gte("start_at",fs).lte("start_at",ts);
      const GG=["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
      const dowData:CancelDay[]=GG.map(day=>({day,total:0,cancelled:0,rate:0}));
      (allApptsDow||[]).forEach((r:any)=>{
        const dow=(new Date(r.start_at).getDay()+6)%7;
        if(dow>=0&&dow<7){
          dowData[dow].total++;
          if(r.status==="cancelled")dowData[dow].cancelled++;
        }
      });
      dowData.forEach(d=>{d.rate=d.total>0?Math.round((d.cancelled/d.total)*100):0;});
      setCancelByDay(dowData);

      // ── Utilizzo capacità ──
      // Slot disponibili = ore lavorative (8-20) × giorni lavorativi nel periodo (escluse domeniche)
      const{from:capFrom,to:capTo}=getRange(period,baseDate);
      let workDays=0;
      const cur=new Date(capFrom);
      while(cur<=capTo){if(cur.getDay()!==0)workDays++;cur.setDate(cur.getDate()+1);}
      const slotsAvailable=workDays*12; // 12 slot/ora da 8 a 20
      const slotsUsed=allData.filter((a:any)=>a.status!=="cancelled").length;
      setCapacityPct(slotsAvailable>0?Math.min(Math.round((slotsUsed/slotsAvailable)*100),100):null);

      // ── Best day ──
      const{data:bestDoneEver}=await supabase.from("appointments").select("start_at,amount").eq("status","done").gte("amount",0.01).limit(10000);
      if(bestDoneEver&&bestDoneEver.length>0){
        const dayTotals=new Array(7).fill(0);
        (bestDoneEver as{start_at:string;amount:number}[]).forEach(a=>{
          const dow=(new Date(a.start_at).getDay()+6)%7;
          dayTotals[dow]+=(parseFloat(String(a.amount))||0);
        });
        const best=dayTotals.indexOf(Math.max(...dayTotals));
        setBestDay(["Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato","Domenica"][best]);
      }

    }catch(e:any){
      if(loadIdRef.current === currentId) setError(e.message||"Errore");
    }
    finally{if(loadIdRef.current === currentId) setLoading(false);}
  }

  useEffect(()=>{loadData();},[period,dateStr]); // eslint-disable-line

  // ─── Export completo per commercialista (apre in Excel con BOM UTF-8) ─────
  const [exporting, setExporting] = useState(false);
  async function exportCSVFull(){
    setExporting(true);
    try{
      const{from,to}=getRange(period,baseDate);
      const fs=from.toISOString(),ts=to.toISOString();

      const{data,error}=await supabase
        .from("appointments")
        .select("start_at,end_at,status,location,clinic_site,domicile_address,treatment_type,price_type,payment_method,amount,is_paid,calendar_note,patients:patient_id(first_name,last_name,phone)")
        .gte("start_at",fs).lte("start_at",ts)
        .order("start_at",{ascending:true});
      if(error) throw new Error(error.message);

      // Mappa status → label leggibile
      const statusLabel:Record<string,string>={done:"Eseguito",confirmed:"Confermato",booked:"Prenotato",cancelled:"Annullato",not_paid:"Non pagato"};

      // Intestazioni (separatore punto e virgola — standard Excel italiano)
      const headers=["Data","Ora inizio","Ora fine","Cognome","Nome","Telefono","Stato","Tipo trattamento","Fatturazione","Metodo pagamento","Sede","Indirizzo domicilio","Importo (€)","Pagato","Note"];

      // Mappa metodo pagamento → label
      const paymentMethodLabel: Record<string, string> = {
        cash: "Contanti",
        pos: "POS",
        bank_transfer: "Bonifico",
      };

      // Righe
      const rows=(data||[]).map((r:any)=>{
        const p=Array.isArray(r.patients)?r.patients[0]:r.patients;
        const d=new Date(r.start_at);
        const dend=r.end_at?new Date(r.end_at):null;
        const importo=r.amount!=null?Number(r.amount).toFixed(2).replace(".",","):"";
        const treatment=r.treatment_type==="seduta"?"Seduta":r.treatment_type==="macchinario"?"Macchinario":(r.treatment_type||"");
        const priceLabel=r.price_type==="invoiced"?"Con ricevuta":r.price_type==="cash"?"Contanti":"";
        const paymentLabel = r.payment_method ? (paymentMethodLabel[r.payment_method] || r.payment_method) : "";
        const sede=r.location==="studio"?(r.clinic_site||"Studio"):"Domicilio";
        const indirizzo=r.location==="domicile"?(r.domicile_address||""):"";
        const pagato=r.is_paid?"Sì":"No";
        const note=(r.calendar_note||"").replace(/[\r\n;"]/g," ").trim();
        return [
          d.toLocaleDateString("it-IT"),
          d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}),
          dend?dend.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}):"",
          (p?.last_name||"").toUpperCase(),
          (p?.first_name||"").toUpperCase(),
          p?.phone||"",
          statusLabel[r.status]||r.status,
          treatment,
          priceLabel,
          paymentLabel,
          sede,
          indirizzo,
          importo,
          pagato,
          note,
        ];
      });

      // Escape dei campi: se contiene ; o " o newline → circonda con virgolette e raddoppia "
      const esc=(v:string)=>{const s=String(v??"");return /[;"\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
      const csvLines=[headers.map(esc).join(";"), ...rows.map(r=>r.map(esc).join(";"))];
      // BOM UTF-8 per Excel
      const csv="\uFEFF"+csvLines.join("\r\n");
      const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});

      // Nome file: fisiohub_YYYY-MM.csv per il mese, fisiohub_YYYY-MM-DD.csv altrimenti
      const ymd=toYMD(baseDate);
      const fileLabel=period==="month"?ymd.slice(0,7):period==="quarter"?`Q${Math.floor(new Date(ymd).getMonth()/3)+1}-${new Date(ymd).getFullYear()}`:period==="semester"?`S${new Date(ymd).getMonth()<6?1:2}-${new Date(ymd).getFullYear()}`:period==="year"?ymd.slice(0,4):ymd;
      const filename=`fisiohub_${fileLabel}.csv`;

      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=filename;
      document.body.appendChild(a);a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }catch(e:any){
      alert("Errore export: "+(e?.message||"sconosciuto"));
    }finally{
      setExporting(false);
    }
  }

  // ─── Derived ───────────────────────────────────────────────────────────────
  const delta=prevRev!=null&&prevRev>0?Math.round(((revenue-prevRev)/prevRev)*100):null;
  const goalPct=Math.min(Math.round((revenue/goal)*100),100);

  const filteredUnpaid=useMemo(()=>{
    const q=unpaidFilter.toLowerCase();
    return unpaidRows.filter(r=>!q||r.name.toLowerCase().includes(q));
  },[unpaidRows,unpaidFilter]);

  const unpaidByPat=useMemo(()=>{
    const m=new Map<string,{name:string;total:number;count:number;oldest:number}>();
    filteredUnpaid.forEach(r=>{const p=m.get(r.patient_id)||{name:r.name,total:0,count:0,oldest:0};m.set(r.patient_id,{name:r.name,total:p.total+r.amount,count:p.count+1,oldest:Math.max(p.oldest,r.days)});});
    return Array.from(m.values()).sort((a,b)=>b.total-a.total);
  },[filteredUnpaid]);

  const topPatMax=topPats[0]?.total||1;
  const treatMax=treatBreak[0]?.revenue||1;
  const uniquePatients=useMemo(()=>Array.from(new Set(unpaidRows.map(r=>r.name))).sort(),[unpaidRows]);
  const sparkData=monthBars.map(b=>b.revenue);

  function navigate(dir:1|-1){
    const d=new Date(baseDate);
    if(period==="day")d.setDate(d.getDate()+dir);
    else if(period==="week")d.setDate(d.getDate()+dir*7);
    else if(period==="quarter")d.setMonth(d.getMonth()+dir*3);
    else if(period==="semester")d.setMonth(d.getMonth()+dir*6);
    else if(period==="year")d.setFullYear(d.getFullYear()+dir);
    else d.setMonth(d.getMonth()+dir);
    setDateStr(toYMD(d));
  }
  function periodLabel(){
    const{from,to}=getRange(period,baseDate);
    if(period==="day") return from.toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long"});
    if(period==="week")return `${from.toLocaleDateString("it-IT",{day:"2-digit",month:"short"})} – ${to.toLocaleDateString("it-IT",{day:"2-digit",month:"short",year:"numeric"})}`;
    if(period==="quarter"){const q=Math.floor(from.getMonth()/3)+1;return `Q${q} ${from.getFullYear()}`;}
    if(period==="semester"){const h=from.getMonth()<6?"1°":"2°";return `${h} semestre ${from.getFullYear()}`;}
    if(period==="year")return `Anno ${from.getFullYear()}`;
    const MM=["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
    const{from:f}=getRange(period,baseDate);
    return`${MM[f.getMonth()]} ${f.getFullYear()}`;
  }

  const card:React.CSSProperties={background:T.panelBg,borderRadius:14,border:`1px solid ${T.border}`,boxShadow:"0 1px 4px rgba(15,23,42,0.05)"};
  const cardH=(extra?:React.CSSProperties):React.CSSProperties=>({display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 18px",borderBottom:`1px solid ${T.border}`,...extra});

  // ─── Tabs ──────────────────────────────────────────────────────────────────
  const TABS:[MainTab,string][]=[["overview","Panoramica"],["patients","Pazienti"],["operations","Operativo"],["transactions","Transazioni"]];

  // ─── Render ────────────────────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",background:T.appBg,fontFamily:"'Outfit','Segoe UI',system-ui,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        *{-webkit-font-smoothing:antialiased;box-sizing:border-box;}
        body{margin:0;background:${T.appBg};}
        button,input,select{font-family:inherit;}
        a{text-decoration:none;}
        input:focus{border-color:${T.blue}!important;box-shadow:0 0 0 3px rgba(37,99,235,0.1)!important;outline:none!important;}
        .rh:hover{background:rgba(37,99,235,0.025)!important;}
        .sc::-webkit-scrollbar{width:4px;} .sc::-webkit-scrollbar-thumb{background:rgba(37,99,235,0.12);border-radius:99px;}
        @media print{.np{display:none!important}}
        /* Search compatta sotto 900px */
        @media (max-width: 900px){
          .rep-search-text{display:none;}
          .rep-search-kbd{display:none;}
        }
        /* Mobile: chip nascoste, period label compatta */
        @media (max-width: 640px){
          .rep-chip{display:none;}
          .rep-period-label{font-size:12px!important;max-width:120px;}
          .rep-subheader{padding:0 12px!important;}
        }
      `}</style>

      {/* ━━━ NAVBAR GLOBALE — riga 1 ━━━ */}
      <header className="np" style={{position:"sticky",top:0,zIndex:50,background:T.gradient,padding:"0 20px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 2px 12px rgba(13,148,136,0.18)",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:20,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,borderRadius:7,background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13,border:"1.5px solid rgba(255,255,255,0.3)"}}>F</div>
            <span style={{fontWeight:700,fontSize:14,color:"#fff",letterSpacing:0.5,textTransform:"uppercase" as const}}>Fisio<span style={{fontWeight:800}}>Hub</span></span>
          </div>
          <nav style={{display:"flex",gap:2}}>
            {[{href:"/",l:"Home"},{href:"/calendar",l:"Calendario"},{href:"/reports",l:"Report",a:true},{href:"/noleggio",l:"Noleggio"},{href:"/patients",l:"Pazienti"}].map((item,i)=>(
              <Link key={`nav-${i}`} href={item.href} style={{padding:"6px 11px",borderRadius:7,fontSize:12,fontWeight:700,background:(item as any).a?"rgba(255,255,255,0.22)":"transparent",color:(item as any).a?"#fff":"rgba(255,255,255,0.8)",letterSpacing:0.2}}>{item.l}</Link>
            ))}
          </nav>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <button
            className="rep-search-btn"
            onClick={()=>window.dispatchEvent(new CustomEvent("fisiohub:open-search"))}
            title="Cerca pazienti e appuntamenti (Ctrl+K)"
            style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.14)",border:"1px solid rgba(255,255,255,0.22)",borderRadius:7,padding:"0 11px",height:30,color:"rgba(255,255,255,0.85)",fontSize:12,fontWeight:500,cursor:"pointer"}}
          >
            <span style={{color:"rgba(255,255,255,0.65)",fontSize:13}}>⌕</span>
            <span className="rep-search-text">Cerca pazienti…</span>
            <span className="rep-search-kbd" style={{marginLeft:6,padding:"1px 6px",borderRadius:4,background:"rgba(255,255,255,0.18)",fontSize:10,fontWeight:700,letterSpacing:0.3}}>Ctrl K</span>
          </button>
          <button onClick={()=>loadData()} title="Aggiorna" style={{width:30,height:30,borderRadius:7,border:"1px solid rgba(255,255,255,0.28)",background:"rgba(255,255,255,0.14)",color:"#fff",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>↺</button>
          <NotificationsBell
            enabled={(currentStudio as any)?.notify_bell_enabled !== false}
          />
          <div ref={userMenuRef} style={{position:"relative"}}>
            <button onClick={()=>setUserMenuOpen(v=>!v)} style={{width:30,height:30,borderRadius:7,border:"1px solid rgba(255,255,255,0.32)",background:"rgba(255,255,255,0.18)",color:"#fff",fontWeight:800,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              {userInitials}
            </button>
            {userMenuOpen && (
              <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:200,background:"#fff",border:`1px solid ${T.border}`,borderRadius:10,boxShadow:"0 8px 28px rgba(15,23,42,0.12)",overflow:"hidden",zIndex:60}}>
                <div style={{padding:"10px 15px",borderBottom:`1px solid ${T.border}`,fontSize:12,color:T.muted}}>{userEmail}</div>
                <Link href="/settings" onClick={()=>setUserMenuOpen(false)} style={{display:"block",padding:"10px 15px",color:T.text,fontSize:13,fontWeight:600,borderBottom:`1px solid ${T.border}`}}>Impostazioni</Link>
                <Link href="/piano" onClick={()=>setUserMenuOpen(false)} style={{display:"block",padding:"10px 15px",color:T.text,fontSize:13,fontWeight:600,borderBottom:`1px solid ${T.border}`,textDecoration:"none"}}>💎 Piano</Link>
                <button onClick={handleLogout} style={{width:"100%",padding:"10px 15px",background:"transparent",border:"none",cursor:"pointer",color:T.red,fontWeight:600,fontSize:13,textAlign:"left"}}>Logout</button>
                <BuildInfo />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ━━━ SUB-HEADER REPORT — riga 2 (sticky sotto navbar) ━━━ */}
      <div className="np rep-subheader" style={{position:"sticky",top:54,zIndex:40,background:T.panelBg,borderBottom:`1px solid ${T.border}`,padding:"0 20px",height:48,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,boxShadow:"0 1px 3px rgba(15,23,42,0.04)"}}>
        {/* Sinistra: periodo + navigazione */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,minWidth:0}}>
          <span className="rep-period-label" style={{fontWeight:700,fontSize:13,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{periodLabel()}</span>
          {/* Frecce + Oggi come segmented control unico */}
          <div style={{display:"flex",border:`1px solid ${T.border}`,borderRadius:7,overflow:"hidden",flexShrink:0}}>
            <button onClick={()=>navigate(-1)} title="Periodo precedente" style={{padding:"5px 9px",border:"none",borderRight:`1px solid ${T.border}`,background:T.panelBg,color:T.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>◀</button>
            <button onClick={()=>setDateStr(toYMD(new Date()))} style={{padding:"5px 11px",border:"none",borderRight:`1px solid ${T.border}`,background:T.panelBg,color:T.text,cursor:"pointer",fontSize:11,fontWeight:700}}>Oggi</button>
            <button onClick={()=>navigate(1)} title="Periodo successivo" style={{padding:"5px 9px",border:"none",background:T.panelBg,color:T.muted,cursor:"pointer",fontSize:12,fontWeight:700}}>▶</button>
          </div>
          {/* Dropdown periodo */}
          <div ref={periodMenuRef} style={{position:"relative",flexShrink:0}}>
            {(() => {
              const labels:Record<Period,string> = {day:"Giorno",week:"Settimana",month:"Mese",quarter:"Trimestre",semester:"Semestre",year:"Anno"};
              return (
                <button onClick={()=>setPeriodMenuOpen(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",border:`1px solid ${T.border}`,borderRadius:7,background:T.panelBg,color:T.text,cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
                  <span>{labels[period]}</span>
                  <span style={{fontSize:9,color:T.muted}}>{periodMenuOpen?"▲":"▼"}</span>
                </button>
              );
            })()}
            {periodMenuOpen && (
              <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:T.panelBg,border:`1px solid ${T.border}`,borderRadius:9,boxShadow:"0 6px 22px rgba(15,23,42,0.10)",overflow:"hidden",zIndex:55,minWidth:140}}>
                {([{k:"day",l:"Giorno"},{k:"week",l:"Settimana"},{k:"month",l:"Mese"},{k:"quarter",l:"Trimestre"},{k:"semester",l:"Semestre"},{k:"year",l:"Anno"}] as{k:Period;l:string}[]).map(p=>(
                  <button key={`pm-${p.k}`} onClick={()=>{setPeriod(p.k);setPeriodMenuOpen(false);}} style={{width:"100%",padding:"9px 14px",border:"none",background:period===p.k?"rgba(13,148,136,0.08)":"transparent",color:period===p.k?T.teal:T.text,cursor:"pointer",fontSize:12,fontWeight:period===p.k?700:600,textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span>{p.l}</span>
                    {period===p.k && <span style={{fontSize:11,color:T.teal}}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Destra: chip + dropdown azioni */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {!loading && (
            <>
              <span className="rep-chip" title="Incassato nel periodo" style={{fontSize:11,fontWeight:800,color:T.green,background:"rgba(22,163,74,0.08)",padding:"4px 10px",borderRadius:6,border:`1px solid rgba(22,163,74,0.18)`,whiteSpace:"nowrap"}}>↗ {euro.format(revenue)}</span>
              {unpaidTot>0 && (
                <span className="rep-chip" title="Da incassare" style={{fontSize:11,fontWeight:800,color:T.red,background:"rgba(220,38,38,0.06)",padding:"4px 10px",borderRadius:6,border:`1px solid rgba(220,38,38,0.18)`,whiteSpace:"nowrap"}}>! {euro.format(unpaidTot)}</span>
              )}
            </>
          )}
          {/* Dropdown azioni unico */}
          <div ref={actionsMenuRef} style={{position:"relative"}}>
            <button onClick={()=>{setActionsMenuOpen(v=>!v);setUnpaidSubmenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 11px",border:`1px solid ${T.teal}`,borderRadius:7,background:T.teal,color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>
              <span>Azioni</span>
              <span style={{fontSize:9}}>{actionsMenuOpen?"▲":"▼"}</span>
            </button>
            {actionsMenuOpen && (
              <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:T.panelBg,border:`1px solid ${T.border}`,borderRadius:9,boxShadow:"0 8px 28px rgba(15,23,42,0.12)",overflow:"visible",zIndex:55,minWidth:230}}>
                <button
                  onClick={()=>{exportCSVFull();setActionsMenuOpen(false);}}
                  disabled={exporting}
                  style={{width:"100%",padding:"11px 14px",border:"none",background:"transparent",borderBottom:`1px solid ${T.border}`,color:T.text,cursor:exporting?"wait":"pointer",fontSize:12,fontWeight:600,textAlign:"left",display:"flex",alignItems:"center",gap:8,opacity:exporting?0.6:1}}
                >
                  <span style={{fontSize:14}}>↓</span>
                  <span>{exporting?"Download in corso…":"Esporta Excel (commercialista)"}</span>
                </button>
                <button
                  onClick={()=>{printUnpaid(unpaidRows,"Terapie Non Pagate",currentStudio);setActionsMenuOpen(false);}}
                  disabled={unpaidRows.length===0}
                  style={{width:"100%",padding:"11px 14px",border:"none",background:"transparent",borderBottom:`1px solid ${T.border}`,color:unpaidRows.length===0?T.muted:T.text,cursor:unpaidRows.length===0?"not-allowed":"pointer",fontSize:12,fontWeight:600,textAlign:"left",display:"flex",alignItems:"center",gap:8,opacity:unpaidRows.length===0?0.5:1}}
                >
                  <span style={{fontSize:14}}>⎙</span>
                  <span>Stampa tutti i non pagati</span>
                </button>
                {/* Sottomenu per paziente */}
                <div style={{position:"relative"}}>
                  <button
                    onClick={()=>setUnpaidSubmenuOpen(v=>!v)}
                    disabled={uniquePatients.length===0}
                    style={{width:"100%",padding:"11px 14px",border:"none",background:unpaidSubmenuOpen?"rgba(13,148,136,0.06)":"transparent",color:uniquePatients.length===0?T.muted:T.text,cursor:uniquePatients.length===0?"not-allowed":"pointer",fontSize:12,fontWeight:600,textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,opacity:uniquePatients.length===0?0.5:1}}
                  >
                    <span style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:14}}>⎙</span>
                      <span>Stampa non pagati per paziente</span>
                    </span>
                    <span style={{fontSize:10,color:T.muted}}>{unpaidSubmenuOpen?"▲":"▶"}</span>
                  </button>
                  {unpaidSubmenuOpen && uniquePatients.length>0 && (
                    <div className="sc" style={{maxHeight:280,overflowY:"auto",background:T.soft,borderTop:`1px solid ${T.border}`}}>
                      {uniquePatients.map((p,i)=>(
                        <button
                          key={`unp-pat-${i}`}
                          onClick={()=>{printUnpaid(unpaidRows.filter(r=>r.name===p),`Non pagati — ${p}`,currentStudio);setActionsMenuOpen(false);setUnpaidSubmenuOpen(false);}}
                          style={{width:"100%",padding:"9px 14px 9px 30px",border:"none",background:"transparent",borderBottom:i<uniquePatients.length-1?`1px solid ${T.border}`:"none",color:T.text,cursor:"pointer",fontSize:11,fontWeight:500,textAlign:"left"}}
                        >{p}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ TAB BAR ━━━ */}
      <div className="np" style={{background:T.panelBg,borderBottom:`1px solid ${T.border}`,padding:"0 24px",display:"flex",gap:0}}>
        {TABS.map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)} style={{
            padding:"13px 20px",border:"none",background:"transparent",cursor:"pointer",
            fontWeight:700,fontSize:13,position:"relative",
            color:tab===key?T.blue:T.muted,
            borderBottom:tab===key?`2px solid ${T.blue}`:"2px solid transparent",
          }}>{label}</button>
        ))}
      </div>

      <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:18}}>
        {error&&<div style={{padding:12,background:"rgba(220,38,38,0.06)",borderRadius:8,border:`1px solid rgba(220,38,38,0.18)`,color:T.red,fontWeight:600,fontSize:13}}>{error}</div>}

        {/* ═══════════════════════════════════════════════════════
            TAB 1 — PANORAMICA
        ═══════════════════════════════════════════════════════ */}
        {tab==="overview"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Riga principale: incassato + non pagato */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

              {/* Incassato */}
              <div style={{...card,background:"linear-gradient(135deg,#f0fdf4,#dcfce7)",border:`1px solid rgba(22,163,74,0.2)`,padding:"28px 32px",position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",bottom:0,left:0,right:0,opacity:0.3}}>
                  <Sparkline data={sparkData.length>0?sparkData:[0]} color={T.green} height={80}/>
                </div>
                <div style={{position:"relative",zIndex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:T.green,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:8}}>Incassato — {periodLabel()}</div>
                  <div style={{fontSize:52,fontWeight:900,color:"#14532d",lineHeight:1,letterSpacing:-2}}>{loading?"…":euro.format(revenue)}</div>
                  <div style={{marginTop:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,color:"#166534",fontWeight:600}}>{sessions} sedute pagate</span>
                    {revenuePerVisit!=null&&<span style={{fontSize:13,color:"#166534",fontWeight:600}}>· {euro.format(revenuePerVisit)} / seduta</span>}
                    {delta!==null&&!loading&&(
                      <span style={{padding:"4px 10px",borderRadius:7,background:delta>=0?"rgba(22,163,74,0.15)":"rgba(220,38,38,0.1)",color:delta>=0?"#166534":T.red,fontSize:12,fontWeight:700}}>
                        {delta>=0?`↑ +${delta}%`:`↓ ${delta}%`} vs periodo prec.
                      </span>
                    )}
                  </div>
                  {(period==="month"||period==="quarter"||period==="semester"||period==="year")&&(
                    <div style={{marginTop:16}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:11,color:"#166534",fontWeight:600}}>Obiettivo: {euro.format(goal)} · {goalPct>=100?"Raggiunto!":""}</span>
                        {!editGoal?(
                          <button onClick={()=>{setGoalInput(String(goal));setEditGoal(true);}} style={{padding:"2px 8px",borderRadius:5,border:"1px solid rgba(22,163,74,0.35)",background:"rgba(255,255,255,0.5)",color:"#166534",fontSize:10,fontWeight:700,cursor:"pointer"}}>modifica</button>
                        ):(
                          <div style={{display:"flex",gap:4}}>
                            <input type="number" value={goalInput} onChange={e=>setGoalInput(e.target.value)} style={{width:70,padding:"2px 6px",borderRadius:5,border:`1.5px solid ${T.green}`,fontSize:11,background:"rgba(255,255,255,0.8)"}}/>
                            <button onClick={()=>{setGoal(Number(goalInput)||2000);setEditGoal(false);}} style={{padding:"2px 8px",borderRadius:5,border:"none",background:T.green,color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>OK</button>
                          </div>
                        )}
                      </div>
                      <div style={{height:7,borderRadius:999,background:"rgba(22,163,74,0.15)",overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:999,width:`${goalPct}%`,background:goalPct>=100?T.green:`linear-gradient(90deg,${T.teal},${T.green})`,transition:"width 0.7s ease"}}/>
                      </div>
                      <div style={{fontSize:11,color:"#166534",marginTop:5,fontWeight:600}}>{goalPct}% — {goalPct<100?`mancano ${euro.format(goal-revenue)}`:"obiettivo superato"}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Non pagato */}
              <div style={{...card,background:unpaidTot>0?"linear-gradient(135deg,#fff7f7,#fee2e2)":"#f0fdf4",border:unpaidTot>0?`1px solid rgba(220,38,38,0.2)`:`1px solid rgba(22,163,74,0.2)`,padding:"28px 32px"}}>
                <div style={{fontSize:12,fontWeight:700,color:unpaidTot>0?T.red:T.green,textTransform:"uppercase" as const,letterSpacing:1,marginBottom:8}}>Da incassare — storico aperto</div>
                <div style={{fontSize:52,fontWeight:900,color:unpaidTot>0?"#7f1d1d":"#14532d",lineHeight:1,letterSpacing:-2}}>{loading?"…":euro.format(unpaidTot)}</div>
                {unpaidTot===0?(
                  <div style={{marginTop:14,fontSize:14,color:T.green,fontWeight:700}}>Tutto incassato</div>
                ):(
                  <>
                    <div style={{marginTop:14,display:"flex",gap:10,flexWrap:"wrap"}}>
                      {agingBuckets.map((b,i)=>(
                        <div key={`ag-${i}`} style={{padding:"8px 14px",borderRadius:9,background:"rgba(220,38,38,0.06)",border:`1px solid rgba(220,38,38,0.15)`}}>
                          <div style={{fontSize:10,fontWeight:700,color:b.color,textTransform:"uppercase" as const,letterSpacing:0.5}}>{b.label}</div>
                          <div style={{fontSize:18,fontWeight:800,color:b.color}}>{euro.format(b.total)}</div>
                          <div style={{fontSize:10,color:T.muted}}>{b.count} sedute</div>
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:5}}>
                      {unpaidByPat.slice(0,3).map((p,i)=>(
                        <div key={`mpay-${i}`} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",borderRadius:8,background:"rgba(220,38,38,0.06)"}}>
                          <div>
                            <div style={{fontSize:12,fontWeight:700,color:"#7f1d1d"}}>{p.name}</div>
                            <div style={{fontSize:10,color:"#991b1b",marginTop:1}}>{p.count} sed. · {p.oldest}gg fa</div>
                          </div>
                          <div style={{fontSize:14,fontWeight:800,color:T.red}}>{euro.format(p.total)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Trend + KPI secondari */}
            <div className="rep-trend-row" style={{display:"grid",gridTemplateColumns:"1fr 140px 140px 140px 140px",gap:14}}>
              <div style={{...card,padding:"18px 22px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>
                    {period==="year"?"Andamento mensile anno":period==="semester"?"Andamento mensile semestre":period==="quarter"?"Andamento mensile trimestre":"Confronto ultimi 6 mesi"}
                  </div>
                  <div style={{fontSize:10,color:T.muted,fontWeight:600}}>
                    <span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:`linear-gradient(90deg,${T.teal},${T.blue})`,marginRight:4}}/>incassato&nbsp;
                    <span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:"rgba(220,38,38,0.5)",marginRight:4}}/>non pagato
                  </div>
                </div>
                {monthBars.length===0&&!loading&&(
                  <div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:12}}>Nessun dato disponibile per questo periodo</div>
                )}
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {monthBars.map((b,bi)=>{
                    const maxV=Math.max(...monthBars.map(x=>x.revenue+x.unpaid),1);
                    const isCurrentPeriod=b.monthKey===dateStr.slice(0,7);
                    const total=b.revenue+b.unpaid;
                    return(
                      <div key={`mb-${b.monthKey}-${bi}`} style={{display:"flex",alignItems:"center",gap:10,padding:"4px 0",borderRadius:6,background:isCurrentPeriod?"rgba(13,148,136,0.04)":"transparent"}}>
                        <div style={{width:32,fontSize:10,fontWeight:isCurrentPeriod?800:700,color:isCurrentPeriod?T.teal:T.muted,flexShrink:0,textAlign:"right"}}>{b.label}</div>
                        <div style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
                          <div style={{height:12,borderRadius:4,background:"rgba(13,148,136,0.08)",overflow:"hidden",position:"relative"}}>
                            {b.revenue>0&&<div style={{position:"absolute",left:0,top:0,height:"100%",borderRadius:4,width:`${(b.revenue/maxV)*100}%`,background:`linear-gradient(90deg,${T.teal},${T.blue})`}}/>}
                            {b.unpaid>0&&<div style={{position:"absolute",left:`${(b.revenue/maxV)*100}%`,top:0,height:"100%",borderRadius:"0 4px 4px 0",width:`${(b.unpaid/maxV)*100}%`,background:"rgba(220,38,38,0.55)"}}/>}
                          </div>
                        </div>
                        <div style={{width:70,fontSize:11,fontWeight:700,color:isCurrentPeriod?T.teal:T.text,flexShrink:0,textAlign:"right"}}>
                          {euro.format(b.revenue)}
                          {b.unpaid>0&&<div style={{fontSize:9,color:T.red,fontWeight:600}}>+{euro.format(b.unpaid)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {monthBars.length>1&&(()=>{
                  const sorted=[...monthBars].sort((a,b)=>b.revenue-a.revenue);
                  const best=sorted[0];
                  const worst=sorted[sorted.length-1];
                  const avg=monthBars.reduce((s,b)=>s+b.revenue,0)/monthBars.length;
                  return(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:12,paddingTop:12,borderTop:`1px solid ${T.border}`}}>
                      {[
                        {l:"Migliore",v:best.label,n:euro.format(best.revenue),c:T.green},
                        {l:"Media",v:"",n:euro.format(avg),c:T.blue},
                        {l:"Peggiore",v:worst.label,n:euro.format(worst.revenue),c:T.red},
                      ].map((k,i)=>(
                        <div key={i} style={{textAlign:"center"}}>
                          <div style={{fontSize:9,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:0.4}}>{k.l}</div>
                          {k.v&&<div style={{fontSize:10,color:k.c,fontWeight:700}}>{k.v}</div>}
                          <div style={{fontSize:13,fontWeight:800,color:k.c}}>{k.n}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {[
                {label:"Sedute",value:loading?"—":String(sessions),sub:`${revenuePerVisit!=null?euro.format(revenuePerVisit):""} / seduta`,color:T.teal},
                {label:"Presentazione",value:loading||presentRate==null?"—":`${presentRate}%`,sub:"confermati vs annullati",color:presentRate!=null?(presentRate>=80?T.green:presentRate>=60?T.amber:T.red):T.muted},
                {label:"Incassato %",value:loading||!(revenue+unpaidTot)?"—":`${Math.round(revenue/(revenue+unpaidTot)*100)}%`,sub:"del fatturato totale",color:T.blue},
                {label:"Best day",value:loading||!bestDay?"—":bestDay,sub:"revenue storica",color:T.blue},
              ].map((k,i)=>(
                <div key={`kpi2-${i}`} style={{...card,padding:"18px 16px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase" as const,letterSpacing:0.7,marginBottom:8}}>{k.label}</div>
                  <div style={{fontSize:22,fontWeight:900,color:k.color,lineHeight:1}}>{k.value}</div>
                  <div style={{fontSize:10,color:T.muted,marginTop:6}}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Ripartizione metodi di pagamento ── */}
            {(() => {
              const pb = paymentBreakdown;
              const totFatt = pb.cash + pb.pos + pb.bank_transfer + pb.none;
              const totGen = totFatt + pb.cashRegimeTotal;
              if (totGen === 0) return null;
              const items = [
                { label: "Contanti (fatt.)", value: pb.cash, count: pb.cashCount, color: T.amber },
                { label: "POS",              value: pb.pos, count: pb.posCount, color: T.blue },
                { label: "Bonifico",         value: pb.bank_transfer, count: pb.bankCount, color: T.teal },
                ...(pb.none > 0 ? [{ label: "Non specificato", value: pb.none, count: pb.noneCount, color: T.muted }] : []),
                ...(pb.cashRegimeTotal > 0 ? [{ label: "Contanti (non fatt.)", value: pb.cashRegimeTotal, count: pb.cashRegimeCount, color: T.red }] : []),
              ];
              return (
                <div style={{...card,padding:"18px 22px"}}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:T.text }}>Incassi per metodo di pagamento</div>
                    <div style={{ fontSize:11,color:T.muted }}>{euro.format(totGen)} totale</div>
                  </div>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10 }}>
                    {items.map((it, i) => {
                      const pct = totGen > 0 ? (it.value / totGen) * 100 : 0;
                      return (
                        <div key={i} style={{
                          padding: "12px 14px", borderRadius: 10,
                          background: T.soft, border: `1px solid ${T.borderSoft}`,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase" as const, letterSpacing: 0.7, marginBottom: 6 }}>
                            {it.label}
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: it.color, lineHeight: 1 }}>
                            {euro.format(it.value)}
                          </div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                            {it.count} sed. · {pct.toFixed(0)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Confronto periodi vicini ── */}
            {compBars.length>0&&(
              <div style={{...card,padding:"18px 22px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>Confronto periodi vicini</div>
                  <div style={{fontSize:11,color:T.muted}}>±2 periodi rispetto al selezionato</div>
                </div>
                <div className="rep-compare-grid" style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                  {compBars.map((b,i)=>{
                    const maxRev=Math.max(...compBars.map(x=>x.revenue),1);
                    return(
                      <div key={i} style={{
                        borderRadius:10,padding:"12px 10px",textAlign:"center",
                        background:b.isActive?"linear-gradient(135deg,rgba(13,148,136,0.12),rgba(37,99,235,0.08))":"rgba(248,250,252,1)",
                        border:b.isActive?`2px solid ${T.teal}`:`1px solid ${T.border}`,
                        cursor:"pointer",transition:"all 0.15s",
                      }} onClick={()=>setDateStr(b.period)}>
                        <div style={{fontSize:10,fontWeight:700,color:b.isActive?T.teal:T.muted,textTransform:"uppercase",letterSpacing:0.4,marginBottom:6}}>{b.label}</div>
                        <div style={{height:40,display:"flex",alignItems:"flex-end",justifyContent:"center",marginBottom:6}}>
                          <div style={{width:24,borderRadius:"3px 3px 0 0",background:b.isActive?`linear-gradient(180deg,${T.teal},${T.blue})`:`rgba(148,163,184,0.4)`,height:`${Math.max((b.revenue/maxRev)*100,4)}%`,minHeight:4,transition:"height 0.4s"}}/>
                        </div>
                        <div style={{fontSize:14,fontWeight:800,color:b.isActive?T.teal:T.text,letterSpacing:-0.3}}>{euro.format(b.revenue)}</div>
                        <div style={{fontSize:10,color:T.muted,marginTop:2}}>{b.sessions} sed.</div>
                        {b.isActive&&<div style={{fontSize:9,fontWeight:700,color:T.teal,marginTop:4,textTransform:"uppercase",letterSpacing:0.3}}>▲ attuale</div>}
                      </div>
                    );
                  })}
                </div>
                {compBars.length>=3&&(()=>{
                  const active=compBars.find(b=>b.isActive);
                  const prev=compBars[compBars.findIndex(b=>b.isActive)-1];
                  if(!active||!prev||prev.revenue===0) return null;
                  const diff=Math.round(((active.revenue-prev.revenue)/prev.revenue)*100);
                  return(
                    <div style={{marginTop:12,padding:"8px 14px",borderRadius:8,background:diff>=0?"rgba(22,163,74,0.06)":"rgba(220,38,38,0.06)",border:`1px solid ${diff>=0?"rgba(22,163,74,0.2)":"rgba(220,38,38,0.2)"}`,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16}}>{diff>=0?"📈":"📉"}</span>
                      <span style={{fontSize:12,fontWeight:700,color:diff>=0?T.green:T.red}}>
                        {diff>=0?`+${diff}%`:`${diff}%`} rispetto al periodo precedente ({prev.label})
                      </span>
                      <span style={{fontSize:11,color:T.muted,marginLeft:"auto"}}>{euro.format(active.revenue-prev.revenue)}</span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            TAB 2 — PAZIENTI
        ═══════════════════════════════════════════════════════ */}
        {tab==="patients"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* KPI pazienti */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
              {[
                {label:"Nuovi pazienti",value:loading?"—":String(newPatients),sub:"prima visita nel periodo",color:T.blue,note:"Pazienti che vengono per la prima volta"},
                {label:"Pazienti di ritorno",value:loading?"—":String(returnPatients),sub:"già seguiti in passato",color:T.teal,note:"Pazienti che tornano"},
                {label:"Media visite / paziente",value:loading||avgVisitsPerPat==null?"—":String(avgVisitsPerPat),sub:"storico completo · bench. settore: ~8",color:T.green,note:"APTA benchmark: 8 visite/paziente MSK"},
                {label:"LTV medio",value:loading||ltv==null?"—":euro.format(ltv),sub:"revenue media per paziente",color:T.amber,note:"Lifetime Value = revenue totale / pazienti unici"},
              ].map((k,i)=>(
                <div key={`pkpi-${i}`} style={{...card,padding:"18px 20px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase" as const,letterSpacing:0.7,marginBottom:8}}>{k.label}</div>
                  <div style={{fontSize:32,fontWeight:900,color:k.color,lineHeight:1}}>{k.value}</div>
                  <div style={{fontSize:11,color:T.muted,marginTop:8}}>{k.sub}</div>
                  <div style={{fontSize:10,color:T.borderSoft,marginTop:4,fontStyle:"italic"}}>{k.note}</div>
                </div>
              ))}
            </div>

            {/* Nuovi vs ritorni visuale */}
            {(newPatients+returnPatients)>0&&(
              <div style={{...card,padding:"18px 22px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:14}}>Nuovi vs pazienti di ritorno</div>
                <div style={{display:"flex",gap:16,alignItems:"center"}}>
                  <div style={{flex:1,height:14,borderRadius:999,background:T.border,overflow:"hidden",display:"flex"}}>
                    <div style={{height:"100%",width:`${Math.round(newPatients/(newPatients+returnPatients)*100)}%`,background:T.blue,transition:"width 0.6s ease"}}/>
                    <div style={{height:"100%",flex:1,background:T.teal}}/>
                  </div>
                  <div style={{display:"flex",gap:16,fontSize:12,fontWeight:700,flexShrink:0}}>
                    <span style={{color:T.blue}}>Nuovi: {newPatients} ({Math.round(newPatients/(newPatients+returnPatients)*100)}%)</span>
                    <span style={{color:T.teal}}>Ritorni: {returnPatients} ({Math.round(returnPatients/(newPatients+returnPatients)*100)}%)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Top pazienti + non rischedulati */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

              {/* Top 5 pazienti */}
              <div style={{...card}}>
                <div style={cardH()}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>Top pazienti per revenue</div>
                  <span style={{fontSize:11,color:T.muted}}>periodo selezionato</span>
                </div>
                <div style={{padding:"8px 0"}}>
                  {loading?<div style={{padding:30,textAlign:"center",color:T.muted,fontSize:12}}>Caricamento…</div>
                  :topPats.length===0?<div style={{padding:30,textAlign:"center",color:T.muted,fontSize:12}}>Nessun dato</div>
                  :topPats.map((p,i)=>(
                    <div key={`tp-${i}`} className="rh" style={{display:"flex",alignItems:"center",gap:12,padding:"11px 18px",transition:"background 0.1s"}}>
                      <span style={{fontSize:12,fontWeight:800,color:i===0?T.teal:T.muted,width:18,textAlign:"center",flexShrink:0}}>{i+1}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                        <div style={{marginTop:4,height:4,borderRadius:999,background:T.border,overflow:"hidden"}}>
                          <div style={{height:"100%",borderRadius:999,width:`${(p.total/topPatMax)*100}%`,background:i===0?T.gradient:`linear-gradient(90deg,${T.gray},${T.borderSoft})`}}/>
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:14,fontWeight:800,color:T.text}}>{euro.format(p.total)}</div>
                        <div style={{fontSize:10,color:T.muted}}>{p.count} sed.</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pazienti non rischedulati */}
              <div style={{...card,display:"flex",flexDirection:"column",maxHeight:400}}>
                <div style={cardH()}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:T.text}}>Pazienti da rischedulare</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:2}}>hanno fatto sedute ma non hanno appuntamenti futuri</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:T.amber,background:"rgba(249,115,22,0.08)",padding:"2px 8px",borderRadius:5}}>{unscheduled.length}</span>
                </div>
                <div className="sc" style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
                  {loading?<div style={{padding:30,textAlign:"center",color:T.muted,fontSize:12}}>Caricamento…</div>
                  :unscheduled.length===0?<div style={{padding:30,textAlign:"center",color:T.green,fontSize:12,fontWeight:700}}>Tutti i pazienti hanno appuntamenti futuri</div>
                  :unscheduled.map((p,i)=>(
                    <div key={`us-${i}`} className="rh" style={{display:"flex",alignItems:"center",gap:12,padding:"10px 18px",borderBottom:`1px solid ${T.border}`,transition:"background 0.1s"}}>
                      <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:p.days>60?T.red:p.days>30?T.amber:T.gray}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                        <div style={{fontSize:10,color:T.muted,marginTop:1}}>Ultima seduta: {p.days}gg fa · {new Date(p.lastVisit).toLocaleDateString("it-IT")}</div>
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        {p.phone&&<a href={`tel:${p.phone}`} style={{width:28,height:28,borderRadius:7,background:"rgba(37,99,235,0.08)",border:`1px solid rgba(37,99,235,0.2)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>📞</a>}
                        {p.phone&&<button onClick={()=>openWADirect(p.phone!)} style={{width:28,height:28,borderRadius:7,background:"rgba(22,163,74,0.08)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,cursor:"pointer"}}>💬</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            TAB 3 — OPERATIVO
        ═══════════════════════════════════════════════════════ */}
        {tab==="operations"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* KPI operativi */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>

              {/* Utilizzo capacità */}
              <div style={{...card,padding:"20px 22px"}}>
                <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase" as const,letterSpacing:0.7,marginBottom:8}}>Utilizzo capacità</div>
                <div style={{fontSize:40,fontWeight:900,color:capacityPct!=null?(capacityPct>=75?T.green:capacityPct>=50?T.amber:T.red):T.muted,lineHeight:1}}>
                  {loading||capacityPct==null?"—":`${capacityPct}%`}
                </div>
                <div style={{marginTop:10,height:7,borderRadius:999,background:T.border,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:999,width:`${capacityPct||0}%`,background:capacityPct!=null?(capacityPct>=75?T.green:capacityPct>=50?T.amber:T.red):T.gray,transition:"width 0.6s ease"}}/>
                </div>
                <div style={{fontSize:11,color:T.muted,marginTop:8}}>Target settore: 75–85%</div>
              </div>

              {/* Revenue per visita */}
              <div style={{...card,padding:"20px 22px"}}>
                <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase" as const,letterSpacing:0.7,marginBottom:8}}>Revenue per visita</div>
                <div style={{fontSize:40,fontWeight:900,color:T.teal,lineHeight:1}}>{loading||revenuePerVisit==null?"—":euro.format(revenuePerVisit)}</div>
                <div style={{fontSize:11,color:T.muted,marginTop:12}}>{sessions} sedute nel periodo</div>
              </div>

              {/* Presentazione */}
              <div style={{...card,padding:"20px 22px"}}>
                <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase" as const,letterSpacing:0.7,marginBottom:8}}>Tasso presentazione</div>
                <div style={{fontSize:40,fontWeight:900,color:presentRate!=null?(presentRate>=80?T.green:presentRate>=60?T.amber:T.red):T.muted,lineHeight:1}}>
                  {loading||presentRate==null?"—":`${presentRate}%`}
                </div>
                <div style={{marginTop:10,height:7,borderRadius:999,background:T.border,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:999,width:`${presentRate||0}%`,background:presentRate!=null?(presentRate>=80?T.green:presentRate>=60?T.amber:T.red):T.gray}}/>
                </div>
                <div style={{fontSize:11,color:T.muted,marginTop:8}}>No-show settore: 10–73%</div>
              </div>
            </div>

            {/* Breakdown trattamenti + cancellazioni per giorno */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

              {/* Breakdown trattamenti */}
              <div style={{...card}}>
                <div style={cardH()}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>Revenue per tipo trattamento</div>
                  <span style={{fontSize:11,color:T.muted}}>periodo selezionato</span>
                </div>
                <div style={{padding:"12px 18px",display:"flex",flexDirection:"column",gap:10}}>
                  {loading?<div style={{padding:20,textAlign:"center",color:T.muted,fontSize:12}}>Caricamento…</div>
                  :treatBreak.length===0?<div style={{padding:20,textAlign:"center",color:T.muted,fontSize:12}}>Nessun dato</div>
                  :treatBreak.map((t,i)=>(
                    <div key={`tb-${i}`}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:700,color:T.text}}>{t.type}</div>
                          <div style={{fontSize:10,color:T.muted,marginTop:1}}>{t.count} sedute · {euro.format(t.revenue/t.count)} / seduta</div>
                        </div>
                        <div style={{fontSize:14,fontWeight:800,color:T.teal}}>{euro.format(t.revenue)}</div>
                      </div>
                      <div style={{height:6,borderRadius:999,background:T.border,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:999,width:`${(t.revenue/treatMax)*100}%`,background:i===0?T.gradient:`linear-gradient(90deg,${T.gray},${T.borderSoft})`}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cancellazioni per giorno */}
              <div style={{...card}}>
                <div style={cardH()}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:T.text}}>Cancellazioni per giorno</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:2}}>% appuntamenti cancellati</div>
                  </div>
                </div>
                <div style={{padding:"12px 18px",display:"flex",flexDirection:"column",gap:8}}>
                  {loading?<div style={{padding:20,textAlign:"center",color:T.muted,fontSize:12}}>Caricamento…</div>
                  :cancelByDay.filter(d=>d.total>0).length===0?<div style={{padding:20,textAlign:"center",color:T.muted,fontSize:12}}>Nessun dato nel periodo</div>
                  :cancelByDay.map((d,i)=>(
                    <div key={`cd-${i}`} style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:28,fontSize:11,fontWeight:700,color:T.muted,flexShrink:0}}>{d.day}</div>
                      <div style={{flex:1,height:10,borderRadius:999,background:T.border,overflow:"hidden"}}>
                        {d.total>0&&<div style={{height:"100%",borderRadius:999,width:`${d.rate}%`,background:d.rate>30?T.red:d.rate>15?T.amber:T.teal,transition:"width 0.5s ease"}}/>}
                      </div>
                      <div style={{width:50,textAlign:"right",fontSize:11,fontWeight:700,color:d.rate>30?T.red:d.rate>15?T.amber:T.muted,flexShrink:0}}>{d.total>0?`${d.rate}%`:"—"}</div>
                      <div style={{width:40,textAlign:"right",fontSize:10,color:T.muted,flexShrink:0}}>{d.total>0?`${d.cancelled}/${d.total}`:""}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            TAB 4 — TRANSAZIONI
        ═══════════════════════════════════════════════════════ */}
        {tab==="transactions"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Aging buckets */}
            {unpaidTot>0&&(
              <div style={{...card,padding:"16px 20px"}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>Distribuzione non pagato per anzianità</div>
                <div style={{display:"flex",gap:12}}>
                  {agingBuckets.map((b,i)=>(
                    <div key={`agb-${i}`} style={{flex:1,padding:"12px 16px",borderRadius:10,background:`${b.color}0d`,border:`1px solid ${b.color}30`}}>
                      <div style={{fontSize:11,fontWeight:700,color:b.color,textTransform:"uppercase" as const,letterSpacing:0.5,marginBottom:6}}>{b.label}</div>
                      <div style={{fontSize:22,fontWeight:900,color:b.color}}>{euro.format(b.total)}</div>
                      <div style={{fontSize:11,color:T.muted,marginTop:4}}>{b.count} sedute</div>
                      <div style={{marginTop:8,height:4,borderRadius:999,background:`${b.color}20`,overflow:"hidden"}}>
                        <div style={{height:"100%",borderRadius:999,width:`${unpaidTot>0?Math.round((b.total/unpaidTot)*100):0}%`,background:b.color}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista non pagati + lista pagati */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

              {/* Non pagati */}
              <div style={{...card,display:"flex",flexDirection:"column",maxHeight:560}}>
                <div style={{...cardH(),gap:10}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:T.text}}>Chi non ha ancora pagato</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:2}}>Storico aperto · {euro.format(unpaidTot)}</div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input type="text" placeholder="Cerca…" value={unpaidFilter} onChange={e=>setUnpaidFilter(e.target.value)} style={{padding:"4px 9px",borderRadius:7,border:`1.5px solid ${T.border}`,fontSize:11,background:T.soft,color:T.text,width:130}}/>
                  </div>
                </div>
                <div className="sc" style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
                  {loading?<div style={{padding:40,textAlign:"center",color:T.muted,fontSize:12}}>Caricamento…</div>
                  :unpaidByPat.length===0?<div style={{padding:40,textAlign:"center",color:T.green,fontSize:12,fontWeight:700}}>{unpaidFilter?"Nessun risultato":"Tutto incassato"}</div>
                  :unpaidByPat.map((p,i)=>(
                    <div key={`up2-${i}`} className="rh" style={{display:"flex",alignItems:"center",gap:12,padding:"10px 18px",borderBottom:`1px solid ${T.border}`,transition:"background 0.1s"}}>
                      <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:p.oldest>60?T.red:p.oldest>30?T.amber:T.gray}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                        <div style={{fontSize:10,color:T.muted,marginTop:1}}>{p.count} seduta{p.count!==1?"e":""} · ultima {p.oldest}gg fa</div>
                      </div>
                      <div style={{fontSize:15,fontWeight:800,color:p.oldest>60?T.red:p.oldest>30?T.amber:T.sub,flexShrink:0}}>{euro.format(p.total)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pagate */}
              <div style={{...card,display:"flex",flexDirection:"column",maxHeight:560}}>
                <div style={cardH()}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:T.text}}>Transazioni pagate</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:2}}>{paidRows.length} elementi · {euro.format(revenue)}</div>
                  </div>
                  {paidRows.length>10&&(
                    <button onClick={()=>setShowAllPaid(v=>!v)} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${T.border}`,background:T.soft,color:T.muted,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                      {showAllPaid?"Meno":"Tutti"}
                    </button>
                  )}
                </div>
                <div className="sc" style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
                  {loading?<div style={{padding:40,textAlign:"center",color:T.muted,fontSize:12}}>Caricamento…</div>
                  :paidRows.length===0?<div style={{padding:40,textAlign:"center",color:T.muted,fontSize:12}}>Nessuna transazione nel periodo</div>
                  :(showAllPaid?paidRows:paidRows.slice(0,10)).map((r,i)=>(
                    <div key={`pr-${r.id||i}`} className="rh" style={{display:"flex",alignItems:"center",gap:12,padding:"10px 18px",borderBottom:i<(showAllPaid?paidRows:paidRows.slice(0,10)).length-1?`1px solid ${T.border}`:"none",transition:"background 0.1s"}}>
                      <div style={{width:34,height:34,borderRadius:8,background:"rgba(13,148,136,0.08)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14}}>🩺</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div>
                        <div style={{fontSize:10,color:T.muted,marginTop:1}}>{r.type} · {new Date(r.date).toLocaleDateString("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                      </div>
                      <div style={{fontSize:15,fontWeight:800,color:T.green,flexShrink:0}}>{euro2.format(r.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Export CSV */}
            <div style={{...card,padding:"18px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:T.text}}>Export dati per commercialista</div>
                <div style={{fontSize:11,color:T.muted,marginTop:2}}>Tutti gli appuntamenti del periodo: paziente, importo, stato, tipo, sede — pronto da aprire in Excel</div>
              </div>
              <button onClick={()=>exportCSVFull()} disabled={exporting} style={{padding:"10px 20px",borderRadius:9,border:"none",background:T.teal,color:"#fff",fontWeight:700,fontSize:13,cursor:exporting?"wait":"pointer",display:"flex",alignItems:"center",gap:8,flexShrink:0,whiteSpace:"nowrap" as const,boxShadow:"0 2px 8px rgba(13,148,136,0.25)",opacity:exporting?0.6:1}}>
                {exporting?"Download in corso…":"↓ Scarica per Excel"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
