"use client";

import Link from "next/link";
import { BuildInfo } from "@/src/components/BuildInfo";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { normalizePhoneForWA } from "@/src/lib/whatsapp";
import { studioPdfHeader, studioHeaderCss, studioPdfFooter } from "@/src/lib/pdfHeader";

type Status       = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";
type LocationType = "studio" | "domicile";

type AppointmentRow = {
  id: string; patient_id: string; start_at: string; end_at: string;
  status: Status; location: LocationType; clinic_site: string | null;
  domicile_address: string | null; amount: number | string | null;
  whatsapp_sent_at?: string | null; whatsapp_sent?: boolean | null;
  is_paid?: boolean | null; price_type?: string | null;
  treatment_type?: string | null; calendar_note?: string | null;
  patients?: { first_name: string | null; last_name: string | null; phone: string | null; status?: string | null; }[] | null;
};

type InactivePatientRow = {
  patient_id: string; first_name: string; last_name: string;
  phone: string | null; last_done_at: string; days_since_last: number;
};

type OpenBalanceRow = {
  id: string; patient_id: string; patient_name: string;
  amount: number; start_at: string; days_ago: number;
  phone: string | null;
};

type OpenBalanceGroup = {
  patient_id: string; patient_name: string; phone: string | null;
  sessions: number; total: number; last_at: string;
};

type BirthdayRow = {
  patient_id: string; name: string; first_name: string; birth_date: string;
  age: number; weekday: string; phone: string | null; isToday: boolean;
};

type FreeSlot = { day: "oggi"|"domani"; time: string; dateYMD: string; };

const WORK_START = 8; const WORK_END = 20;
const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
function computeFreeSlots(dayAppts: AppointmentRow[], dateYMD: string, label: "oggi"|"domani"): FreeSlot[] {
  // Domenica = 0 → nessuno slot
  if (new Date(`${dateYMD}T00:00:00`).getDay() === 0) return [];
  const slots: FreeSlot[] = [];
  for (let h = WORK_START; h < WORK_END; h++) {
    const slotStart = `${dateYMD}T${pad2(h)}:00:00`;
    const slotEnd   = `${dateYMD}T${pad2(h+1)}:00:00`;
    // Overlap reale: considera la durata effettiva dell'appuntamento (end_at)
    const occupied  = dayAppts.some(a =>
      a.status !== "cancelled" &&
      a.start_at < slotEnd &&
      (a.end_at ?? slotEnd) > slotStart
    );
    if (!occupied) slots.push({ day: label, time: `${pad2(h)}:00`, dateYMD });
  }
  return slots;
}

const THEME = {
  appBg:"#f1f5f9", panelBg:"#ffffff", panelSoft:"#f7f9fd",
  text:"#0f172a", textSoft:"#1e293b", muted:"#334155", border:"#cbd5e1",
  blue:"#2563eb", blueDark:"#1e40af", green:"#16a34a", teal:"#0d9488",
  red:"#dc2626", amber:"#f97316", gray:"#94a3b8",
};

const startOfDay  = (d: Date) => { const x=new Date(d); x.setHours(0,0,0,0); return x; };
const addDays     = (d: Date, n: number) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const maxDate     = (a: Date, b: Date) => (a>=b?a:b);
const isSameDay   = (a: Date, b: Date) => a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
const mondayStart = (d: Date) => { const x=startOfDay(d); return addDays(x,(x.getDay()===0?-6:1)-x.getDay()); };
const fmtTime     = (iso: string) => new Date(iso).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
const fmtDate     = (iso: string) => new Date(iso).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});
const fmtWeekday  = (d: Date) => d.toLocaleDateString("it-IT",{weekday:"long"});
const pad2        = (n: number) => String(n).padStart(2,"0");
const formatDateRelative = (date: Date) => {
  const oggi=startOfDay(new Date()); const d=startOfDay(date);
  if(isSameDay(d,oggi)) return "oggi";
  if(isSameDay(d,addDays(oggi,1))) return "domani";
  return d.toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"2-digit"});
};
const money      = (n: number) => (Number.isFinite(n)?n:0).toLocaleString("it-IT",{maximumFractionDigits:0})+"€";
const sumAmount  = (rows: AppointmentRow[]) => rows.reduce((s,r)=>{ const n=typeof r.amount==="string"?Number(r.amount):r.amount; return s+(Number.isFinite(n as number)?(n as number):0); },0);
const pctDelta   = (c: number, p: number) => p===0?(c===0?0:100):((c-p)/p)*100;
// Normalizza qualsiasi numero italiano → stringa di sole cifre con prefisso 39
// Casi gestiti: +39xxx, 0039xxx, 39xxx (già con prefisso), 3xx (mobile senza prefisso),
//               0xx (fisso senza prefisso), numeri con spazi/trattini/parentesi
function cleanPhoneWA(phone: string): string {
  // Delegato alla utility centrale in src/lib/whatsapp.ts per consistenza
  return normalizePhoneForWA(phone);
}
const fmtPhone = cleanPhoneWA; // alias compatibilità

function openWA(phone: string, message: string): void {
  const clean = cleanPhoneWA(phone);
  if (!clean) { alert("Numero non valido."); return; }
  const isMobile = /iPhone|iPad|iPod|Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
  const url = isMobile
    ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
    : `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(message)}`;
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click();
  setTimeout(() => document.body.removeChild(a), 200);
}
type PatientRef = { first_name?: string|null; last_name?: string|null; phone?: string|null; status?: string|null } | null;
const pickPatient = (p: PatientRef | PatientRef[] | undefined): PatientRef => Array.isArray(p) ? (p[0] ?? null) : (p ?? null);
const patientName = (p: PatientRef | PatientRef[] | undefined): string => { const pt=pickPatient(p); return `${pt?.last_name??""} ${pt?.first_name??""}`.trim()||"Paziente sconosciuto"; };
const buildWAMsg  = (a: AppointmentRow) => { const fn=(pickPatient(a.patients)?.first_name||"").trim()||"Cliente"; const luogo=a.location==="studio"?a.clinic_site||"Studio":`Domicilio (${a.domicile_address||"indirizzo da confermare"})`; return `Buongiorno ${fn},\n\nLe ricordiamo il suo appuntamento di ${formatDateRelative(new Date(a.start_at))} alle ore ${fmtTime(a.start_at)}.\n\n📍 ${luogo}\n\nA presto,\nFisioHub - Studi Galileo`; };
const todayNoteKey = () => `fisiohub_daynote_${new Date().toISOString().slice(0,10)}`;

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status,{label:string;color:string;bg:string}> = {
    done:{label:"Eseguito",color:THEME.green,bg:"rgba(22,163,74,0.10)"},
    confirmed:{label:"Confermato",color:THEME.blue,bg:"rgba(37,99,235,0.10)"},
    booked:{label:"Prenotato",color:THEME.teal,bg:"rgba(13,148,136,0.10)"},
    cancelled:{label:"Annullato",color:THEME.gray,bg:"rgba(148,163,184,0.12)"},
    not_paid:{label:"Non pagato",color:THEME.amber,bg:"rgba(249,115,22,0.10)"},
  };
  const m=map[status]??{label:status,color:THEME.gray,bg:"rgba(148,163,184,0.12)"};
  return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 8px",borderRadius:5,fontSize:11,fontWeight:700,background:m.bg,color:m.color,whiteSpace:"nowrap"}}>{m.label}</span>;
}

function useCountdown(targetISO: string | null) {
  const [t,setT]=useState("");
  useEffect(()=>{ if(!targetISO){setT("");return;} const target=new Date(targetISO).getTime(); const tick=()=>{ const diff=target-Date.now(); if(diff<=0){setT("adesso");return;} const h=Math.floor(diff/3600000); const m=Math.floor((diff%3600000)/60000); setT(h>0?`${h}h ${m}m`:`${m}m`); }; tick(); const id=setInterval(tick,60000); return()=>clearInterval(id); },[targetISO]);
  return t;
}

export default function HomePage() {
  const router = useRouter();

  // Studio corrente (multi-tenancy)
  const { studio: currentStudio } = useCurrentStudio();

  const [userEmail,setUserEmail]=useState<string|null>(null);
  const [userMenuOpen,setUserMenuOpen]=useState(false);
  const userMenuRef=useRef<HTMLDivElement|null>(null);

  useEffect(()=>{(async()=>{ const{data}=await supabase.auth.getUser(); setUserEmail(data.user?.email??null); })();},[]);
  useEffect(()=>{ const onDown=(e:MouseEvent)=>{ if(!userMenuOpen) return; if(userMenuRef.current&&!userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false); }; document.addEventListener("mousedown",onDown); return()=>document.removeEventListener("mousedown",onDown); },[userMenuOpen]);
  const handleLogout=useCallback(async()=>{ try{await supabase.auth.signOut();}finally{setUserMenuOpen(false);router.push("/login");} },[router]);
  const userInitials=useMemo(()=>{ const l=(userEmail||"").split("@")[0].replace(/[^a-zA-Z]/g,"").toUpperCase(); return (l.slice(0,2)||"U").padEnd(2,"U"); },[userEmail]);

  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState("");
  const [appointments,setAppts]=useState<AppointmentRow[]>([]);

  const today=useMemo(()=>startOfDay(new Date()),[]);
  const tomorrow=useMemo(()=>addDays(today,1),[today]);
  const yesterday=useMemo(()=>addDays(today,-1),[today]);
  const thisWeekStart=useMemo(()=>mondayStart(new Date()),[]);
  const thisWeekEnd=useMemo(()=>addDays(thisWeekStart,7),[thisWeekStart]);
  const lastWeekStart=useMemo(()=>addDays(thisWeekStart,-7),[thisWeekStart]);
  const lastWeekEnd=useMemo(()=>thisWeekStart,[thisWeekStart]);

  const fetchAppts=useCallback(async()=>{ try{ setLoading(true); const end=maxDate(thisWeekEnd,addDays(startOfDay(new Date()),8)); const{data,error}=await supabase.from("appointments").select("id,patient_id,start_at,end_at,status,location,clinic_site,domicile_address,amount,price_type,treatment_type,is_paid,calendar_note,whatsapp_sent_at,whatsapp_sent,patients:patient_id(first_name,last_name,phone,status)").gte("start_at",lastWeekStart.toISOString()).lt("start_at",end.toISOString()).order("start_at",{ascending:true}); if(error) throw new Error(error.message); setAppts((data||[]) as AppointmentRow[]); }catch(e:any){setErr(e?.message||"Errore.");} finally{setLoading(false);} },[lastWeekStart,thisWeekEnd]);
  useEffect(()=>{fetchAppts();},[fetchAppts]);

  const [inactiveThreshold,setInactiveThreshold]=useState<30|45|60>(45);
  const [inactivePatients,setInactivePatients]=useState<InactivePatientRow[]>([]);
  const [inactiveLoading,setInactiveLoading]=useState(false);
  const [contactedPatients,setContactedPatients]=useState<Set<string>>(new Set());

  /* ── Saldi aperti ── */
  const [openBalances,setOpenBalances]=useState<OpenBalanceRow[]>([]);
  const [loadingBalances,setLoadingBalances]=useState(false);
  const [openBalanceGroups, setOpenBalanceGroups] = useState<OpenBalanceGroup[]>([]);
  const fetchOpenBalances=useCallback(async()=>{
    setLoadingBalances(true);
    try{
      const{data,error}=await supabase.from("appointments")
        .select("id,patient_id,amount,start_at,patients:patient_id(first_name,last_name,phone)")
        .in("status",["done","not_paid"]).eq("is_paid",false).not("amount","is",null).gt("amount",0)
        .order("start_at",{ascending:false}).limit(200);
      if(error) throw error;
      const nowMs=Date.now();
      const rows=(data||[]).map((r:any)=>{
        const p=Array.isArray(r.patients)?r.patients[0]:r.patients;
        return{id:r.id,patient_id:r.patient_id,patient_name:`${p?.last_name||""} ${p?.first_name||""}`.trim()||"Paziente",amount:Number(r.amount)||0,start_at:r.start_at,days_ago:Math.floor((nowMs-new Date(r.start_at).getTime())/86400000),phone:p?.phone??null};
      });
      setOpenBalances(rows);
      // Raggruppa per paziente
      const map=new Map<string,OpenBalanceGroup>();
      rows.forEach((r:OpenBalanceRow)=>{
        if(!map.has(r.patient_id)) map.set(r.patient_id,{patient_id:r.patient_id,patient_name:r.patient_name,phone:r.phone,sessions:0,total:0,last_at:r.start_at});
        const g=map.get(r.patient_id)!;
        g.sessions++;
        g.total+=r.amount;
        if(r.start_at>g.last_at) g.last_at=r.start_at;
      });
      setOpenBalanceGroups(Array.from(map.values()).sort((a,b)=>b.total-a.total));
    }catch(e:any){console.error(e?.message);}
    finally{setLoadingBalances(false);}
  },[]);
  useEffect(()=>{fetchOpenBalances();},[fetchOpenBalances]);

  /* ── Compleanni settimana ── */
  const [birthdays,setBirthdays]=useState<BirthdayRow[]>([]);
  const [loadingBirthdays,setLoadingBirthdays]=useState(false);
  const fetchBirthdays=useCallback(async()=>{
    setLoadingBirthdays(true);
    try{
      const{data,error}=await supabase.from("patients").select("id,first_name,last_name,birth_date,phone").not("birth_date","is",null);
      if(error) throw error;
      const now=new Date(); const thisYear=now.getFullYear();
      const todayMs=startOfDay(now).getTime(); const weekEnd=addDays(startOfDay(now),7).getTime();
      const gg=["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
      const result:BirthdayRow[]=[];
      for(const p of (data||[]) as any[]){
        if(!p.birth_date) continue;
        const[y,m,d]=p.birth_date.split("-").map(Number);
        if(!y||!m||!d) continue;
        const bd=new Date(thisYear,m-1,d,0,0,0,0);
        if(bd.getTime()>=todayMs&&bd.getTime()<weekEnd){
          result.push({patient_id:p.id,name:`${p.last_name||""} ${p.first_name||""}`.trim()||"Paziente",first_name:(p.first_name||"").trim()||"Paziente",birth_date:p.birth_date,age:thisYear-y,weekday:isSameDay(bd,now)?"Oggi":gg[bd.getDay()],phone:p.phone??null,isToday:isSameDay(bd,now)});
        }
      }
      result.sort((a,b)=>{const[,ma,da]=a.birth_date.split("-").map(Number);const[,mb,db]=b.birth_date.split("-").map(Number);return new Date(thisYear,ma-1,da).getTime()-new Date(thisYear,mb-1,db).getTime();});
      setBirthdays(result);
    }catch(e:any){console.error(e?.message);}
    finally{setLoadingBirthdays(false);}
  },[]);
  useEffect(()=>{fetchBirthdays();},[fetchBirthdays]);

  // Prenotazioni web
  const fetchWebBookings = useCallback(async () => {
    const { data } = await supabase
      .from("booking_requests")
      .select("*")
      .in("status", ["pending","confirmed","cancelled"])
      .order("created_at", { ascending: false })
      .limit(30);
    setWebBookings((data ?? []) as WebBooking[]);
  }, []);
  useEffect(()=>{ void fetchWebBookings(); },[fetchWebBookings]);

  // Check push notification permission on load
  useEffect(()=>{
    if("Notification" in window) setPushEnabled(Notification.permission==="granted");
  },[]);

  // ── Noleggio scadenze ────────────────────────────────────────────────────
  const [noleggioExpiring, setNoleggioExpiring] = useState<{id:string;patient_name:string;end_date:string;device_name:string;days_remaining:number;patient_phone:string|null}[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  async function requestPushPermission() {
    setPushLoading(true);
    try {
      if (!("Notification" in window)) { alert("Il tuo browser non supporta le notifiche push."); return; }
      const perm = await Notification.requestPermission();
      setPushEnabled(perm === "granted");
      if (perm === "granted") {
        new Notification("FisioHub — Notifiche attivate! ✅", {
          body: "Riceverai avvisi per nuove prenotazioni e scadenze noleggio.",
          icon: "/favicon.ico",
        });
      } else {
        alert("Notifiche rifiutate. Puoi attivarle dalle impostazioni del browser.");
      }
    } catch(e) { console.error(e); }
    finally { setPushLoading(false); }
  }
  const [noleggioWarningDays, setNoleggioWarningDays] = useState(3);
  useEffect(()=>{
    (async()=>{
      try{
        const{data:cfg}=await supabase.from("noleggio_settings").select("warning_days").maybeSingle();
        const wd=cfg?.warning_days??3; setNoleggioWarningDays(wd);
        const{data}=await supabase.from("noleggios").select("id,patient_name,end_date,device_name,patient_phone").eq("is_returned",false).order("end_date",{ascending:true});
        const today=new Date(); today.setHours(0,0,0,0);
        const expiring=(data||[]).map((n:any)=>{
          const end=new Date(n.end_date+"T00:00:00"); 
          const dr=Math.ceil((end.getTime()-today.getTime())/86400000);
          return{...n,days_remaining:dr};
        }).filter((n:any)=>n.days_remaining<=wd);
        setNoleggioExpiring(expiring);
      }catch(e){console.error(e);}
    })();
  },[]);

  // ── Previsione incasso ───────────────────────────────────────────────────
  const forecastRevenue = useMemo(()=>{
    const today=startOfDay(new Date());
    const endWeek=addDays(today,7);
    const future=appointments.filter(a=>
      a.status!=="cancelled" && 
      new Date(a.start_at)>=today && 
      new Date(a.start_at)<endWeek
    );
    const confirmed=future.filter(a=>a.status==="confirmed"||a.status==="booked");
    const total=confirmed.reduce((s,a)=>{ const n=typeof a.amount==="string"?Number(a.amount):a.amount; return s+(Number.isFinite(n as number)?(n as number):0); },0);
    const sessCount=confirmed.length;
    return{total:Math.round(total),sessCount,days:7};
  },[appointments]);

  async function confirmWebBooking(req: WebBooking) {
    setWebBookingActionId(req.id);
    const timeStr = req.requested_time.slice(0,5);
    const [th,tm] = timeStr.split(":").map(Number);
    const [dy,dm,dd] = req.requested_date.split("-").map(Number);
    const startDt = new Date(dy, dm-1, dd, th, tm, 0, 0);
    const endDt   = new Date(startDt.getTime() + Number(req.service_duration)*60000);
    const isHome  = req.service_name.toLowerCase().includes("domicil");
    const note    = `[WEB|${req.patient_name}|${req.patient_phone}] ${req.service_name}`;
    await supabase.from("booking_requests").update({ status:"confirmed" }).eq("id", req.id);
    await supabase.from("appointments").insert({
      start_at:  startDt.toISOString(),
      end_at:    endDt.toISOString(),
      status:    "booked",
      is_paid:   false,
      location:  isHome ? "domicile" : "studio",
      clinic_site: isHome ? null : "Studio Pontecorvo",
      domicile_address: isHome ? (req.notes ?? "da definire") : null,
      calendar_note: note,
      studio_id: currentStudio?.id,       // ← FIX multi-tenancy
    });
    setWebBookingActionId(null);
    setWebPopup(null);
    await fetchWebBookings();
    await fetchAppts();
  }

  async function rejectWebBooking(id: string) {
    setWebBookingActionId(id);
    await supabase.from("booking_requests").update({ status:"cancelled" }).eq("id", id);
    setWebBookingActionId(null);
    setWebPopup(null);
    await fetchWebBookings();
  }

  async function deleteWebBooking(id: string) {
    if (!confirm("Eliminare definitivamente questa prenotazione?")) return;
    setWebBookingActionId(id);
    await supabase.from("booking_requests").delete().eq("id", id);
    setWebBookingActionId(null);
    setWebPopup(null);
    await fetchWebBookings();
  }

  const fetchInactive=useCallback(async()=>{
    try{
      setInactiveLoading(true);
      // Prende TUTTI gli appuntamenti done degli ultimi 2 anni
      // Filtra lato client: pazienti la cui ULTIMA seduta è > soglia giorni fa
      // (la vecchia logica filtrava col .lt() server-side e mostrava sedute vecchie
      //  anche per pazienti che ne avevano di più recenti non ancora nella query)
      const twoYearsAgo=new Date(Date.now()-730*86400000).toISOString();
      const{data,error}=await supabase
        .from("appointments")
        .select("patient_id,start_at,patients:patient_id!inner(first_name,last_name,phone,status)")
        .eq("status","done")
        .gte("start_at",twoYearsAgo)
        .order("start_at",{ascending:false})
        .limit(1000);
      if(error) throw new Error(error.message);
      const rows=(data||[]) as any[];
      // Tieni solo l'appuntamento PIÙ RECENTE per paziente
      const byP=new Map<string,any>();
      for(const r of rows){ if(r.patient_id&&!byP.has(r.patient_id)) byP.set(r.patient_id,r); }
      // Filtra: solo chi non ha sedute da > inactiveThreshold giorni
      const list:InactivePatientRow[]=[];
      for(const[pid,r] of byP.entries()){
        const p=pickPatient(r.patients);
        if((p?.status||"").toString().toLowerCase()==="inactive") continue;
        const days=Math.floor((Date.now()-new Date(r.start_at).getTime())/86400000);
        if(days>inactiveThreshold) list.push({patient_id:pid,first_name:p?.first_name||"",last_name:p?.last_name||"",phone:p?.phone??null,last_done_at:r.start_at,days_since_last:days});
      }
      list.sort((a,b)=>b.days_since_last-a.days_since_last);
      setInactivePatients(list.slice(0,12));
    }catch(e:any){console.error(e?.message);}
    finally{setInactiveLoading(false);}
  },[inactiveThreshold]);
  useEffect(()=>{fetchInactive();},[fetchInactive]);

  const [searchInput,setSearchInput]=useState("");
  const [debounced,setDebounced]=useState("");
  useEffect(()=>{const t=setTimeout(()=>setDebounced(searchInput),300);return()=>clearTimeout(t);},[searchInput]);

  const [dayNote,setDayNote]=useState("");
  useEffect(()=>{try{setDayNote(localStorage.getItem(todayNoteKey())||"");}catch{}},[]);
  const saveDayNote=useCallback((val:string)=>{setDayNote(val);try{localStorage.setItem(todayNoteKey(),val);}catch{}},[]);

  const [expandedId,setExpandedId]=useState<string|null>(null);
  const [rowNotes,setRowNotes]=useState<Record<string,string>>({});
  const [savingNote,setSavingNote]=useState<string|null>(null);
  const [busyRow,setBusyRow]=useState<Record<string,boolean>>({});
  useEffect(()=>{const map:Record<string,string>={};appointments.forEach(a=>{map[a.id]=a.calendar_note||"";}); setRowNotes(prev=>({...map,...prev}));},[appointments]);

  const [editNextTime,setEditNextTime]=useState(false);
  const [editDate,setEditDate]=useState("");
  const [editStart,setEditStart]=useState("");
  const [editDuration,setEditDuration]=useState<"1"|"1.5"|"2">("1");
  const [savingTime,setSavingTime]=useState(false);

  const [tab,setTab]=useState<"today"|"next7"|"thisWeek">("today");

  // ── Prenotazioni web ──────────────────────────────────────────────────────
  type WebBooking = {
    id: string;
    service_name: string;
    service_duration: number;
    requested_date: string;
    requested_time: string;
    patient_name: string;
    patient_phone: string;
    patient_email: string | null;
    notes: string | null;
    status: "pending" | "confirmed" | "cancelled";
    created_at: string;
  };
  const [webBookings, setWebBookings] = useState<WebBooking[]>([]);
  const [webBookingActionId, setWebBookingActionId] = useState<string|null>(null);
  const [webPopup, setWebPopup] = useState<WebBooking|null>(null);

  // Trigger push notification for new web bookings (after webBookings is declared)
  useEffect(()=>{
    if(!pushEnabled) return;
    const pending = webBookings.filter((r:any)=>r.status==="pending");
    if(pending.length>0 && Notification.permission==="granted") {
      new Notification(`FisioHub — ${pending.length} nuova/e prenotazione/i online`,{
        body: pending.map((r:any)=>r.patient_name||"Paziente").join(", "),
        icon:"/favicon.ico"
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[webBookings.length]);

  const filtered=useMemo(()=>{ const q=debounced.trim().toLowerCase(); if(!q) return appointments; return appointments.filter(a=>patientName(a.patients).toLowerCase().includes(q)); },[appointments,debounced]);
  const todayAppts=useMemo(()=>filtered.filter(a=>isSameDay(new Date(a.start_at),today)),[filtered,today]);
  const domicilesToday=useMemo(()=>todayAppts.filter(a=>a.location==="domicile"),[todayAppts]);
  const next7Appts=useMemo(()=>{const s=startOfDay(new Date());const e=addDays(s,8);return filtered.filter(a=>{const d=new Date(a.start_at);return d>=s&&d<e&&!isSameDay(d,today);});},[filtered,today]);
  const thisWeekAppts=useMemo(()=>filtered.filter(a=>{const d=new Date(a.start_at);return d>=thisWeekStart&&d<thisWeekEnd;}),[filtered,thisWeekStart,thisWeekEnd]);

  const focusNext=useMemo(()=>appointments.filter(a=>a.status!=="cancelled"&&new Date(a.start_at).getTime()>=Date.now()).sort((a,b)=>new Date(a.start_at).getTime()-new Date(b.start_at).getTime())[0]||null,[appointments]);
  const tomorrowAppts=useMemo(()=>appointments.filter(a=>isSameDay(new Date(a.start_at),tomorrow)&&a.status!=="cancelled"),[appointments,tomorrow]);
  const remindersToSend=useMemo(()=>tomorrowAppts.filter(a=>!a.whatsapp_sent_at).slice(0,6),[tomorrowAppts]);
  const remainingToday=useMemo(()=>{ if(!focusNext) return todayAppts; return todayAppts.filter(a=>a.id!==focusNext.id&&new Date(a.start_at).getTime()>=new Date(focusNext.start_at).getTime()).sort((a,b)=>new Date(a.start_at).getTime()-new Date(b.start_at).getTime()).slice(0,6); },[todayAppts,focusNext]);

  const todayDone=useMemo(()=>todayAppts.filter(a=>a.status==="done").length,[todayAppts]);
  const todayTotal=todayAppts.filter(a=>a.status!=="cancelled").length;
  const todayPct=todayTotal>0?Math.round((todayDone/todayTotal)*100):0;
  const todayExpected=useMemo(()=>sumAmount(todayAppts.filter(a=>a.status!=="cancelled")),[todayAppts]);
  const todayIncassato=useMemo(()=>sumAmount(todayAppts.filter(a=>a.is_paid)),[todayAppts]);

  const alertAppts=useMemo(()=>{ const now=Date.now(); const limit=now+60*60*1000; return appointments.filter(a=>{ const t=new Date(a.start_at).getTime(); return t>=now&&t<=limit&&a.status==="booked"; }); },[appointments]);

  const weekStats=useMemo(()=>{ const tw=appointments.filter(a=>{const d=new Date(a.start_at);return d>=thisWeekStart&&d<thisWeekEnd;}); const lw=appointments.filter(a=>{const d=new Date(a.start_at);return d>=lastWeekStart&&d<lastWeekEnd;}); return{this:{done:tw.filter(a=>a.status==="done").length,notPaid:tw.filter(a=>a.status==="not_paid").length,expected:sumAmount(tw.filter(a=>a.status!=="cancelled"))},last:{done:lw.filter(a=>a.status==="done").length,notPaid:lw.filter(a=>a.status==="not_paid").length,expected:sumAmount(lw.filter(a=>a.status!=="cancelled"))}}; },[appointments,thisWeekStart,thisWeekEnd,lastWeekStart,lastWeekEnd]);

  const recentPatients=useMemo(()=>{ const u=new Map<string,AppointmentRow>(); appointments.forEach(a=>{if(!u.has(a.patient_id)||new Date(a.start_at)>new Date(u.get(a.patient_id)!.start_at)) u.set(a.patient_id,a);}); return Array.from(u.values()).sort((a,b)=>new Date(b.start_at).getTime()-new Date(a.start_at).getTime()).slice(0,5); },[appointments]);

  /* ── Slot liberi oggi e domani ── */
  const freeSlots=useMemo(()=>[
    ...computeFreeSlots(todayAppts,   toYMD(today),    "oggi"),
    ...computeFreeSlots(tomorrowAppts,toYMD(tomorrow), "domani"),
  ],[todayAppts,tomorrowAppts,today,tomorrow]);

  const groupByDay=(appts:AppointmentRow[])=>{ const map=new Map<string,{dayKey:string;date:Date;items:AppointmentRow[]}>(); for(const a of appts){const d=startOfDay(new Date(a.start_at));const key=d.toISOString().slice(0,10);const ex=map.get(key);if(ex) ex.items.push(a);else map.set(key,{dayKey:key,date:d,items:[a]});} return Array.from(map.values()).sort((x,y)=>x.date.getTime()-y.date.getTime()); };
  const activeBuckets=useMemo(()=>groupByDay(tab==="today"?todayAppts:tab==="next7"?next7Appts:thisWeekAppts),[tab,todayAppts,next7Appts,thisWeekAppts]);

  const setStatus=useCallback(async(id:string,next:Status)=>{ setBusyRow(m=>({...m,[id]:true})); const patch:any={status:next}; if(next==="done") patch.is_paid=true; if(next==="not_paid") patch.is_paid=false; if(next==="confirmed"||next==="booked") patch.is_paid=false; const{error}=await supabase.from("appointments").update(patch).eq("id",id); setBusyRow(m=>({...m,[id]:false})); if(error) alert("Errore: "+error.message); else fetchAppts(); },[fetchAppts]);
  const togglePaid=useCallback(async(id:string,isPaid:boolean)=>{ setBusyRow(m=>({...m,[id]:true})); const{error}=await supabase.from("appointments").update({is_paid:isPaid}).eq("id",id); setBusyRow(m=>({...m,[id]:false})); if(error) alert("Errore: "+error.message); else{ fetchAppts(); fetchOpenBalances(); } },[fetchAppts,fetchOpenBalances]);
  const saveNote=useCallback(async(id:string)=>{ setSavingNote(id); const note=(rowNotes[id]||"").trim(); await supabase.from("appointments").update({calendar_note:note||null}).eq("id",id); setSavingNote(null); },[rowNotes]);
  const saveNextTime=useCallback(async()=>{ if(!focusNext||!editDate||!editStart) return; setSavingTime(true); const[y,m,d]=editDate.split("-").map(Number); const[hh,mm]=editStart.split(":").map(Number); const ns=new Date(y,m-1,d,hh,mm,0,0); const ne=new Date(ns.getTime()+parseFloat(editDuration)*3600000); const{error}=await supabase.from("appointments").update({start_at:ns.toISOString(),end_at:ne.toISOString()}).eq("id",focusNext.id); setSavingTime(false); if(error) alert("Errore: "+error.message); else{setEditNextTime(false);fetchAppts();} },[focusNext,editDate,editStart,editDuration,fetchAppts]);
  const sendWA=useCallback(async(appt:AppointmentRow)=>{ const phone=pickPatient(appt.patients)?.phone||""; if(!fmtPhone(phone)){alert("Numero non valido.");return;} const msg=buildWAMsg(appt); await supabase.from("appointments").update({whatsapp_sent_at:new Date().toISOString(),whatsapp_sent:true}).eq("id",appt.id); openWA(phone,msg); fetchAppts(); },[fetchAppts]);

  const nextCountdown=useCountdown(focusNext?.start_at??null);
  const headerDate=useMemo(()=>{const s=new Date().toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});return s.charAt(0).toUpperCase()+s.slice(1);},[]);

  const card:React.CSSProperties={background:THEME.panelBg,borderRadius:12,border:`1px solid ${THEME.border}`,boxShadow:"0 1px 4px rgba(15,23,42,0.05)",overflow:"hidden",marginBottom:14};
  const ch:React.CSSProperties={display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"13px 18px",borderBottom:`1px solid ${THEME.border}`};
  const st:React.CSSProperties={margin:0,fontWeight:700,fontSize:13,color:THEME.text,letterSpacing:-0.2};
  const inp:React.CSSProperties={padding:"6px 10px",borderRadius:6,border:`1.5px solid ${THEME.border}`,fontSize:12,fontWeight:600,outline:"none",background:"#fff",color:THEME.text};
  const btn=(bg:string,color:string,extra?:React.CSSProperties):React.CSSProperties=>({padding:"7px 14px",borderRadius:6,border:"none",background:bg,color,fontWeight:700,fontSize:12,cursor:"pointer",...extra});
  const btnO=(color:string,extra?:React.CSSProperties):React.CSSProperties=>({padding:"7px 12px",borderRadius:6,border:`1px solid ${THEME.border}`,background:"#fff",color,fontWeight:700,fontSize:12,cursor:"pointer",...extra});


  return (
    <div style={{minHeight:"100vh",background:THEME.appBg,fontFamily:"'Outfit','Segoe UI',system-ui,sans-serif"}}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        *{-webkit-font-smoothing:antialiased;box-sizing:border-box;}
        body{font-family:'Outfit','Segoe UI',system-ui,sans-serif;margin:0;background:#f1f5f9;}
        a{text-decoration:none;}
        select,input,textarea,button{font-family:inherit;}
        input:focus,select:focus,textarea:focus{border-color:#2563eb!important;box-shadow:0 0 0 3px rgba(37,99,235,0.10)!important;outline:none!important;}
        .rh:hover{background:rgba(37,99,235,0.03)!important;}
        .ar{transition:background 0.12s;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.55}}
        .pulse{animation:pulse 2s ease-in-out infinite;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn 0.2s ease forwards;}
        @media(max-width:1100px){.col-right{display:none!important}.main-cols{grid-template-columns:340px 1fr!important}}
        @media(max-width:780px){.main-cols{grid-template-columns:1fr!important}}
        @media(min-width:768px)and(max-width:1199px){.th{display:none!important}.main-cols{grid-template-columns:1fr 1fr!important}.kpi-grid{grid-template-columns:1fr 1fr!important}}
      `}</style>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{position:"sticky",top:0,zIndex:40,background:"linear-gradient(135deg,#0d9488,#2563eb)",padding:"0 24px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 2px 16px rgba(13,148,136,0.20)",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:24,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,borderRadius:7,background:"rgba(255,255,255,0.2)",border:"1.5px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13}}>F</div>
            <span style={{fontWeight:700,fontSize:14,color:"#fff",letterSpacing:0.8,textTransform:"uppercase"}}>Fisio<span style={{fontWeight:800}}>Hub</span></span>
          </div>
          <nav style={{display:"flex",gap:1}}>
            {([{href:"/",label:"Home",active:true},{href:"/calendar",label:"Calendario",active:false},{href:"/reports",label:"Report",active:false},{href:"/noleggio",label:"Noleggio",active:false},{href:"/patients",label:"Pazienti",active:false},] as const).map(item=>(
              <Link key={item.href} href={item.href} style={{padding:"5px 11px",borderRadius:7,fontSize:12,fontWeight:700,background:item.active?"rgba(255,255,255,0.22)":"transparent",color:item.active?"#fff":"rgba(255,255,255,0.78)",letterSpacing:0.2}}>{item.label}</Link>
            ))}
          </nav>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,0.14)",border:"1px solid rgba(255,255,255,0.22)",borderRadius:7,padding:"0 11px",height:30}} className="th">
            <span style={{color:"rgba(255,255,255,0.65)",fontSize:13}}>⌕</span>
            <input value={searchInput} onChange={e=>setSearchInput(e.target.value)} placeholder="Cerca paziente…" style={{border:"none",background:"transparent",outline:"none",color:"#fff",fontSize:12,fontWeight:500,width:150}}/>
          </div>
          <button onClick={fetchAppts} style={{width:30,height:30,borderRadius:7,border:"1px solid rgba(255,255,255,0.28)",background:"rgba(255,255,255,0.14)",color:"#fff",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>↺</button>
          {/* Push notification toggle */}
          <button
            onClick={()=>requestPushPermission()}
            disabled={pushLoading||pushEnabled}
            title={pushEnabled?"Notifiche attive":"Attiva notifiche push"}
            style={{width:30,height:30,borderRadius:7,border:"1px solid rgba(255,255,255,0.28)",background:pushEnabled?"rgba(134,239,172,0.25)":"rgba(255,255,255,0.14)",color:"#fff",cursor:pushEnabled?"default":"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",opacity:pushLoading?0.6:1}}
          >{pushLoading?"…":pushEnabled?"🔔":"🔕"}</button>
          <div ref={userMenuRef} style={{position:"relative"}}>
            <button onClick={()=>setUserMenuOpen(v=>!v)} style={{width:30,height:30,borderRadius:7,border:"1px solid rgba(255,255,255,0.32)",background:"rgba(255,255,255,0.18)",color:"#fff",fontWeight:800,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{userInitials}</button>
            {userMenuOpen&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:196,background:"#fff",border:`1px solid ${THEME.border}`,borderRadius:10,boxShadow:"0 8px 28px rgba(15,23,42,0.12)",overflow:"hidden",zIndex:60}}>
                <div style={{padding:"10px 15px",borderBottom:`1px solid ${THEME.border}`,fontSize:12,color:THEME.muted}}>{userEmail}</div>
                <Link href="/settings" onClick={()=>setUserMenuOpen(false)} style={{display:"block",padding:"10px 15px",color:THEME.text,fontSize:13,fontWeight:600,borderBottom:`1px solid ${THEME.border}`}}>Impostazioni</Link>
                <Link href="/piano" onClick={()=>setUserMenuOpen(false)} style={{display:"block",padding:"10px 15px",color:THEME.text,fontSize:13,fontWeight:600,borderBottom:`1px solid ${THEME.border}`,textDecoration:"none"}}>💎 Piano</Link>
                <button onClick={handleLogout} style={{width:"100%",padding:"10px 15px",background:"transparent",border:"none",cursor:"pointer",color:THEME.red,fontWeight:600,fontSize:13,textAlign:"left"}}>Logout</button>
                <BuildInfo />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ━━━ HERO ━━━ */}
      <div style={{background:"linear-gradient(135deg, #0c4a6e 0%, #0d9488 50%, #0f766e 100%)",padding:"28px 28px 0",position:"relative",overflow:"hidden"}}>
        {/* decorazione sfondo */}
        <div style={{position:"absolute",top:-60,right:-60,width:320,height:320,borderRadius:"50%",background:"rgba(255,255,255,0.04)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-40,left:"30%",width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.03)",pointerEvents:"none"}}/>

        {/* Greeting + data */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,marginBottom:24,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:13,fontWeight:500,color:"rgba(255,255,255,0.65)",marginBottom:4,letterSpacing:0.3}}>
              {new Date().toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}).replace(/^\w/,c=>c.toUpperCase())}
            </div>
            <h1 style={{margin:0,fontSize:28,fontWeight:800,color:"#fff",letterSpacing:-0.8,lineHeight:1.1}}>
              {loading ? "Caricamento…" : todayTotal===0 ? "Nessuna seduta oggi" : `${todayTotal} sedut${todayTotal===1?"a":"e"} oggi`}
            </h1>
          </div>
          <Link href="/calendar?new=1" style={{padding:"10px 20px",borderRadius:8,border:"1.5px solid rgba(255,255,255,0.35)",background:"rgba(255,255,255,0.12)",color:"#fff",fontWeight:700,fontSize:13,display:"inline-flex",alignItems:"center",gap:6,flexShrink:0,backdropFilter:"blur(4px)"}}>
            + Nuovo appuntamento
          </Link>
        </div>

        {/* KPI row */}
        {!loading && (
          <div className="kpi-grid" style={{display:"flex",gap:0,flexWrap:"wrap",marginBottom:0}}>
            {[
              {
                label:"Eseguite",
                value:`${todayDone}/${todayTotal}`,
                sub: todayTotal>0 ? `${todayPct}%` : "—",
                highlight: todayPct===100 && todayTotal>0,
              },
              {
                label:"Incassato",
                value: money(todayIncassato),
                sub: todayExpected>todayIncassato ? `manca ${money(todayExpected-todayIncassato)}` : "tutto incassato",
                highlight: false,
              },
              {
                label:"Prossimo",
                value: focusNext ? fmtTime(focusNext.start_at) : "—",
                sub: focusNext ? (nextCountdown || patientName(focusNext.patients)) : "nessun appuntamento",
                highlight: false,
              },
              {
                label:"WA domani",
                value: String(remindersToSend.length),
                sub: remindersToSend.length===0 ? "tutti inviati" : `su ${tomorrowAppts.length} totali`,
                highlight: remindersToSend.length>0,
              },
            ].map((k,i)=>(
              <div key={k.label} style={{
                flex:"1 1 160px",
                padding:"16px 20px 20px",
                borderRight: i<3 ? "1px solid rgba(255,255,255,0.10)" : "none",
                minWidth:0,
              }}>
                <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.55)",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>{k.label}</div>
                <div style={{fontSize:26,fontWeight:800,color:k.highlight?"#86efac":"#fff",lineHeight:1,marginBottom:4,letterSpacing:-0.5}}>{k.value}</div>
                <div style={{fontSize:12,color:k.highlight?"#86efac":"rgba(255,255,255,0.55)",fontWeight:500}}>{k.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar sul fondo dell'hero */}
        {!loading && todayTotal > 0 && (
          <div style={{height:4,background:"rgba(255,255,255,0.12)",borderRadius:0,overflow:"hidden",marginLeft:-28,marginRight:-28}}>
            <div style={{height:"100%",width:`${todayPct}%`,background:"rgba(134,239,172,0.8)",transition:"width 0.5s ease"}}/>
          </div>
        )}
      </div>

      {/* ━━━ ALERT ━━━ */}
      {alertAppts.length>0&&(
        <div style={{background:"rgba(249,115,22,0.95)",padding:"10px 28px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span className="pulse" style={{fontSize:14}}>⚠️</span>
          <span style={{fontWeight:700,fontSize:13,color:"#fff",flex:1}}>
            {alertAppts.length===1?`Seduta di ${patientName(alertAppts[0].patients)} alle ${fmtTime(alertAppts[0].start_at)} non ancora confermata`:`${alertAppts.length} sedute entro 60 minuti non confermate`}
          </span>
          {alertAppts.map(a=>(
            <button key={a.id} onClick={()=>setStatus(a.id,"confirmed")} style={{padding:"6px 14px",borderRadius:6,border:"1px solid rgba(255,255,255,0.4)",background:"rgba(255,255,255,0.2)",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
              Conferma{alertAppts.length>1?` ${patientName(a.patients)}`:""}
            </button>
          ))}
        </div>
      )}

      {err&&<div style={{margin:"12px 28px 0",padding:"10px 14px",borderRadius:8,background:"rgba(220,38,38,0.06)",border:"1px solid rgba(220,38,38,0.18)",color:THEME.red,fontWeight:600,fontSize:13}}>{err}</div>}

      {/* ━━━ ALERT PRENOTAZIONI WEB ━━━ */}
      {webBookings.filter(b=>b.status==="pending").length>0&&(
        <div style={{background:"linear-gradient(135deg,#7c3aed,#2563eb)",padding:"10px 28px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:16}}>🌐</span>
          <span style={{fontWeight:700,fontSize:13,color:"#fff",flex:1}}>
            {webBookings.filter(b=>b.status==="pending").length} nuova prenotazione dal sito in attesa di conferma
          </span>
          {webBookings.filter(b=>b.status==="pending").slice(0,2).map(b=>(
            <button key={b.id} onClick={()=>setWebPopup(b)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid rgba(255,255,255,0.4)",background:"rgba(255,255,255,0.2)",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
              {b.patient_name} — {b.requested_date.slice(5).replace("-","/")} {b.requested_time.slice(0,5)}
            </button>
          ))}
        </div>
      )}

      {/* ━━━ POPUP DETTAGLIO PRENOTAZIONE WEB ━━━ */}
      {webPopup&&(
        <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:420,boxShadow:"0 24px 64px rgba(0,0,0,0.25)",overflow:"hidden"}}>
            {/* Header popup */}
            <div style={{background:"linear-gradient(135deg,#7c3aed,#2563eb)",padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>🌐 Prenotazione dal sito</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginTop:2}}>Richiesta ricevuta il {new Date(webPopup.created_at).toLocaleDateString("it-IT",{day:"2-digit",month:"short",year:"numeric"})}</div>
              </div>
              <button onClick={()=>setWebPopup(null)} style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:8,width:30,height:30,color:"#fff",fontSize:16,cursor:"pointer"}}>✕</button>
            </div>
            {/* Body popup */}
            <div style={{padding:"18px 20px"}}>
              {/* Nome e telefono */}
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16,padding:"12px 14px",background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0"}}>
                <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#7c3aed,#2563eb)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff",fontWeight:800,flexShrink:0}}>
                  {webPopup.patient_name.charAt(0).toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:15,color:THEME.text}}>{webPopup.patient_name}</div>
                  <a href={`tel:${webPopup.patient_phone}`} style={{fontSize:13,color:THEME.teal,fontWeight:700,textDecoration:"none"}}>📞 {webPopup.patient_phone}</a>
                  {webPopup.patient_email&&<div style={{fontSize:11,color:THEME.muted,marginTop:1}}>{webPopup.patient_email}</div>}
                </div>
                <a href="#" onClick={(e)=>{e.preventDefault();openWA(webPopup.patient_phone,"");}} target="_blank" rel="noopener noreferrer"
                  style={{padding:"8px 14px",borderRadius:8,background:"#25d366",color:"#fff",fontWeight:700,fontSize:12,textDecoration:"none"}}>WA</a>
              </div>
              {/* Dettagli appuntamento */}
              {[
                {l:"Servizio", v:webPopup.service_name},
                {l:"Data",     v:new Date(webPopup.requested_date+"T12:00:00").toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})},
                {l:"Ora",      v:webPopup.requested_time.slice(0,5)},
                {l:"Durata",   v:`${webPopup.service_duration} minuti`},
              ].map(r=>(
                <div key={r.l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <span style={{fontSize:12,color:THEME.muted}}>{r.l}</span>
                  <span style={{fontSize:13,fontWeight:700,color:THEME.text}}>{r.v}</span>
                </div>
              ))}
              {webPopup.notes&&(
                <div style={{marginTop:10,padding:"8px 12px",background:"#fffbeb",borderRadius:7,border:"1px solid #fde68a",fontSize:12,color:"#92400e",fontStyle:"italic"}}>
                  📝 "{webPopup.notes}"
                </div>
              )}
              {/* Badge stato */}
              <div style={{marginTop:12,display:"flex",justifyContent:"center"}}>
                {webPopup.status==="pending"&&<span style={{fontSize:11,fontWeight:700,color:"#c2410c",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:99,padding:"3px 12px"}}>In attesa di conferma</span>}
                {webPopup.status==="confirmed"&&<span style={{fontSize:11,fontWeight:700,color:"#15803d",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:99,padding:"3px 12px"}}>Confermata</span>}
                {webPopup.status==="cancelled"&&<span style={{fontSize:11,fontWeight:700,color:"#dc2626",background:"#fff5f5",border:"1px solid #fecaca",borderRadius:99,padding:"3px 12px"}}>Annullata</span>}
              </div>
            </div>
            {/* Footer popup — azioni */}
            <div style={{padding:"12px 20px 18px",borderTop:"1px solid #f1f5f9",display:"flex",gap:10}}>
              {webPopup.status==="pending"&&(
                <>
                  <button onClick={()=>confirmWebBooking(webPopup)} disabled={!!webBookingActionId}
                    style={{flex:2,padding:"11px",border:"none",borderRadius:10,background:"linear-gradient(135deg,#0d9488,#2563eb)",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",opacity:webBookingActionId?0.6:1}}>
                    {webBookingActionId?"Confermo…":"✓ Conferma e crea appuntamento"}
                  </button>
                  <button onClick={()=>rejectWebBooking(webPopup.id)} disabled={!!webBookingActionId}
                    style={{flex:1,padding:"11px",border:"1.5px solid #fecaca",borderRadius:10,background:"#fff5f5",color:"#dc2626",fontWeight:700,fontSize:13,cursor:"pointer",opacity:webBookingActionId?0.6:1}}>
                    ✕ Rifiuta
                  </button>
                  <button onClick={()=>deleteWebBooking(webPopup.id)} disabled={!!webBookingActionId}
                    style={{padding:"11px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer",opacity:webBookingActionId?0.6:1}}
                    title="Elimina definitivamente">
                    🗑
                  </button>
                </>
              )}
              {webPopup.status==="confirmed"&&(
                <div style={{display:"flex",gap:8,flex:1}}>
                  <button onClick={()=>rejectWebBooking(webPopup.id)} disabled={!!webBookingActionId}
                    style={{flex:1,padding:"11px",border:"1.5px solid #fecaca",borderRadius:10,background:"#fff5f5",color:"#dc2626",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                    ✕ Annulla
                  </button>
                  <button onClick={()=>deleteWebBooking(webPopup.id)} disabled={!!webBookingActionId}
                    style={{flex:1,padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                    🗑 Elimina
                  </button>
                </div>
              )}
              {webPopup.status==="cancelled"&&(
                <div style={{display:"flex",gap:8,flex:1}}>
                  <button onClick={()=>confirmWebBooking(webPopup)} disabled={!!webBookingActionId}
                    style={{flex:1,padding:"11px",border:"none",borderRadius:10,background:THEME.teal,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                    ↩ Riconferma
                  </button>
                  <button onClick={()=>deleteWebBooking(webPopup.id)} disabled={!!webBookingActionId}
                    style={{flex:1,padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#f8fafc",color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                    🗑 Elimina
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ━━━ CONTENT ━━━ */}
      <div style={{padding:"20px 24px 32px"}}>

        {/* ── COLONNE PRINCIPALI ── */}
        <div className="main-cols" style={{display:"grid",gridTemplateColumns:"340px 1fr 280px",gap:16,alignItems:"start",marginBottom:16}}>

          {/* ── SINISTRA: Prossimo + operatività ── */}
          <div>

            {/* PROSSIMO APPUNTAMENTO */}
            <div style={{background:"#fff",borderRadius:14,border:`1px solid ${THEME.border}`,boxShadow:"0 2px 12px rgba(15,23,42,0.07)",overflow:"hidden",marginBottom:12}}>
              <div style={{background:"linear-gradient(135deg,#0c4a6e,#0d9488)",padding:"16px 18px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.65)",textTransform:"uppercase",letterSpacing:0.8}}>Prossimo</span>
                  {nextCountdown&&<span style={{fontSize:12,fontWeight:700,color:"#86efac",background:"rgba(134,239,172,0.15)",padding:"2px 8px",borderRadius:4}}>{nextCountdown}</span>}
                </div>
                {!focusNext ? (
                  <div style={{color:"rgba(255,255,255,0.6)",fontSize:13,padding:"8px 0"}}>Nessun appuntamento in arrivo</div>
                ) : (
                  <>
                    <div style={{fontSize:30,fontWeight:900,color:"#fff",letterSpacing:-1,lineHeight:1,marginBottom:6}}>{fmtTime(focusNext.start_at)}</div>
                    <Link href={`/patients/${focusNext.patient_id}`} style={{fontSize:16,fontWeight:700,color:"#fff",display:"block",marginBottom:4}}>{patientName(focusNext.patients)}</Link>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.6)"}}>
                      {focusNext.location==="studio"?focusNext.clinic_site||"Studio":`Domicilio — ${focusNext.domicile_address||"—"}`}
                      {focusNext.amount?` · ${focusNext.amount}€`:""}
                    </div>
                  </>
                )}
              </div>

              {focusNext&&(
                <div style={{padding:"12px 16px"}}>
                  {!editNextTime?(
                    <>
                      {/* Stato pagamento */}
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12,padding:"8px 12px",borderRadius:8,background:THEME.panelSoft,border:`1px solid ${THEME.border}`}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:focusNext.is_paid?THEME.green:focusNext.status==="done"?THEME.red:THEME.gray,flexShrink:0}}/>
                        <span style={{fontSize:12,color:THEME.muted,flex:1}}>{focusNext.is_paid?"Pagato":focusNext.status==="done"?"Non pagato":"In attesa"}</span>
                        <StatusPill status={focusNext.status}/>
                      </div>
                      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                        <button onClick={()=>setStatus(focusNext.id,focusNext.status==="done"?"confirmed":"done")} className="appt-action-btn" style={{flex:1,padding:"9px 10px",borderRadius:8,border:"none",background:focusNext.status==="done"?"rgba(22,163,74,0.10)":THEME.teal,color:focusNext.status==="done"?THEME.green:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                          {focusNext.status==="done"?"Annulla":"Segna eseguito"}
                        </button>
                        {focusNext.status==="done"&&!focusNext.is_paid&&(
                          <button onClick={()=>togglePaid(focusNext.id,true)} className="appt-action-btn" style={{padding:"9px 12px",borderRadius:8,border:`1.5px solid ${THEME.green}`,background:"rgba(22,163,74,0.06)",color:THEME.green,fontWeight:700,fontSize:12,cursor:"pointer"}}>Incassa</button>
                        )}
                        {pickPatient(focusNext.patients)?.phone&&<button onClick={()=>sendWA(focusNext)} className="appt-action-btn" style={{padding:"9px 12px",borderRadius:8,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.green,fontWeight:700,fontSize:12,cursor:"pointer"}}>WA</button>}
                        <button onClick={()=>{if(confirm("Annullare?"))setStatus(focusNext.id,"cancelled");}} className="appt-action-btn" style={{padding:"9px 10px",borderRadius:8,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.red,fontWeight:700,fontSize:12,cursor:"pointer"}}>✕</button>
                      </div>
                      <button onClick={()=>{setEditDate(new Date(focusNext.start_at).toISOString().slice(0,10));setEditStart(`${pad2(new Date(focusNext.start_at).getHours())}:${pad2(new Date(focusNext.start_at).getMinutes())}`);setEditNextTime(true);}} style={{width:"100%",marginTop:8,padding:"6px",borderRadius:6,border:`1px solid ${THEME.border}`,background:"transparent",color:THEME.muted,fontSize:11,fontWeight:600,cursor:"pointer",textAlign:"center"}}>
                        Modifica orario
                      </button>
                    </>
                  ):(
                    <div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:10}}>
                        {[{label:"DATA",node:<input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)} style={{...inp,width:"100%"}}/>},{label:"ORARIO",node:<input type="time" value={editStart} onChange={e=>setEditStart(e.target.value)} style={{...inp,width:"100%"}}/>},{label:"DURATA",node:<select value={editDuration} onChange={e=>setEditDuration(e.target.value as any)} style={{...inp,width:"100%",appearance:"none" as const}}><option value="1">1h</option><option value="1.5">1h30</option><option value="2">2h</option></select>}].map(f=>(
                          <div key={f.label}><div style={{fontSize:9,fontWeight:700,color:THEME.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>{f.label}</div>{f.node}</div>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:7}}>
                        <button onClick={saveNextTime} disabled={savingTime} style={{flex:1,padding:"8px",borderRadius:7,border:"none",background:THEME.teal,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>{savingTime?"Salvo…":"Salva"}</button>
                        <button onClick={()=>setEditNextTime(false)} style={{padding:"8px 12px",borderRadius:7,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.muted,fontWeight:700,fontSize:12,cursor:"pointer"}}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RESTO DI OGGI */}
            {remainingToday.length>0&&(
              <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden",marginBottom:12}}>
                <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontWeight:700,fontSize:12,color:THEME.text}}>Oggi — prossimi</span>
                  <span style={{fontSize:11,fontWeight:600,color:THEME.muted,background:THEME.panelSoft,padding:"2px 7px",borderRadius:4}}>{remainingToday.length}</span>
                </div>
                {remainingToday.map((a,i)=>(
                  <div key={a.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",borderBottom:i<remainingToday.length-1?`1px solid ${THEME.border}`:"none"}}>
                    <div>
                      <Link href={`/patients/${a.patient_id}`} style={{fontWeight:600,fontSize:13,color:THEME.text}}>{patientName(a.patients)}</Link>
                      <div style={{fontSize:11,color:THEME.muted,marginTop:1}}>{fmtTime(a.start_at)} · {a.location==="studio"?a.clinic_site||"Studio":"Dom."}</div>
                    </div>
                    <StatusPill status={a.status}/>
                  </div>
                ))}
              </div>
            )}

            {/* DOMICILIARI */}
            {domicilesToday.length>0&&(
              <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden",marginBottom:12}}>
                <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontWeight:700,fontSize:12,color:THEME.text}}>Domiciliari oggi</span>
                  <span style={{fontSize:11,fontWeight:600,color:THEME.amber,background:"rgba(249,115,22,0.08)",padding:"2px 7px",borderRadius:4}}>{domicilesToday.length}</span>
                </div>
                {domicilesToday.map((a,i)=>(
                  <div key={a.id} style={{padding:"9px 14px",borderBottom:i<domicilesToday.length-1?`1px solid ${THEME.border}`:"none"}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                      <div>
                        <Link href={`/patients/${a.patient_id}`} style={{fontWeight:700,fontSize:13,color:THEME.text}}>{patientName(a.patients)}</Link>
                        <div style={{fontSize:11,color:THEME.amber,marginTop:2,fontWeight:600}}>📍 {a.domicile_address||"—"}</div>
                        {pickPatient(a.patients)?.phone&&<a href={`tel:${pickPatient(a.patients)!.phone}`} style={{fontSize:11,color:THEME.blue,display:"block",marginTop:2}}>{pickPatient(a.patients)!.phone}</a>}
                      </div>
                      <div style={{flexShrink:0,marginTop:2}}><StatusPill status={a.status}/></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* WA DOMANI */}
            <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden",marginBottom:12}}>
              <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,fontSize:12,color:THEME.text}}>WhatsApp domani</span>
                <span style={{fontSize:11,color:THEME.muted}}>{tomorrowAppts.length-remindersToSend.length}/{tomorrowAppts.length} inviati</span>
              </div>
              {remindersToSend.length===0?(
                <div style={{padding:"14px 16px",fontSize:13,color:THEME.green,fontWeight:600}}>Tutti i promemoria inviati ✓</div>
              ):(
                remindersToSend.map((a,i)=>(
                  <div key={a.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",borderBottom:i<remindersToSend.length-1?`1px solid ${THEME.border}`:"none"}}>
                    <div>
                      <Link href={`/patients/${a.patient_id}`} style={{fontWeight:600,fontSize:13,color:THEME.text}}>{patientName(a.patients)}</Link>
                      <div style={{fontSize:11,color:THEME.amber,marginTop:1}}>{fmtTime(a.start_at)}</div>
                    </div>
                    <button onClick={()=>sendWA(a)} style={{padding:"5px 11px",borderRadius:6,border:"none",background:THEME.green,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>WA</button>
                  </div>
                ))
              )}
            </div>

            {/* POST-IT */}
            <div style={{background:"#fffbeb",borderRadius:12,border:"1px solid #fde68a",overflow:"hidden"}}>
              <div style={{padding:"11px 16px",borderBottom:"1px solid #fde68a",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,fontSize:12,color:"#92400e"}}>Note del giorno</span>
                <span style={{fontSize:10,color:"#a16207",fontWeight:500}}>auto-salva</span>
              </div>
              <textarea value={dayNote} onChange={e=>saveDayNote(e.target.value)} placeholder="Mario porta la RM · Chiamare Lucia · ..." rows={3} style={{width:"100%",padding:"10px 14px",border:"none",background:"transparent",fontSize:13,fontWeight:500,resize:"vertical",outline:"none",color:"#78350f",boxSizing:"border-box"}}/>
            </div>
          </div>

          {/* ── CENTRO: AGENDA ── */}
          <div>
            <div style={{background:"#fff",borderRadius:14,border:`1px solid ${THEME.border}`,boxShadow:"0 1px 6px rgba(15,23,42,0.04)",overflow:"hidden"}}>
              {/* Toolbar */}
              <div style={{padding:"14px 18px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontWeight:700,fontSize:14,color:THEME.text,flex:1}}>Agenda</span>
                <div style={{display:"flex",border:`1px solid ${THEME.border}`,borderRadius:8,overflow:"hidden"}}>
                  {([{key:"today",label:"Oggi"},{key:"next7",label:"7 giorni"},{key:"thisWeek",label:"Settimana"}] as const).map(t=>(
                    <button key={t.key} onClick={()=>setTab(t.key)} style={{padding:"6px 14px",border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===t.key?THEME.teal:"#fff",color:tab===t.key?"#fff":THEME.muted,transition:"background 0.15s"}}>{t.label}</button>
                  ))}
                </div>
              </div>

              {/* Rows */}
              <div style={{padding:"8px 0"}}>
                {loading?<div style={{padding:"32px 18px",color:THEME.muted,fontSize:13,textAlign:"center"}}>Caricamento…</div>
                :activeBuckets.length===0?<div style={{padding:"48px 18px",color:THEME.muted,fontSize:13,textAlign:"center",fontWeight:500}}>Nessun appuntamento per questo periodo.</div>
                :activeBuckets.map(bucket=>{
                  const rel=formatDateRelative(bucket.date);
                  return(
                    <div key={bucket.dayKey}>
                      {/* Day separator */}
                      <div style={{padding:"6px 18px 6px",display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                        <span style={{fontSize:11,fontWeight:700,color:THEME.blue,textTransform:"capitalize"}}>{rel}</span>
                        <span style={{fontSize:11,color:THEME.muted}}>{fmtWeekday(bucket.date)} · {bucket.date.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"})}</span>
                        <div style={{flex:1,height:1,background:THEME.border,marginLeft:4}}/>
                        <span style={{fontSize:11,fontWeight:600,color:THEME.muted,background:THEME.panelSoft,padding:"1px 7px",borderRadius:3}}>{bucket.items.length}</span>
                      </div>

                      {bucket.items.map(a=>{
                        const name=patientName(a.patients);
                        const phone=pickPatient(a.patients)?.phone||"";
                        const waSent=Boolean(a.whatsapp_sent_at);
                        const isExp=expandedId===a.id;
                        const busy=!!busyRow[a.id];
                        const isDone=a.status==="done";
                        const isPaid=!!a.is_paid;
                        return(
                          <div key={a.id}>
                            <div className="ar rh" style={{padding:"9px 18px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:isExp?"rgba(37,99,235,0.02)":"transparent"}} onClick={()=>setExpandedId(isExp?null:a.id)}>
                              {/* checkbox */}
                              <button onClick={e=>{e.stopPropagation();setStatus(a.id,isDone?"confirmed":"done");}} disabled={busy||a.status==="cancelled"} style={{width:18,height:18,borderRadius:4,border:`2px solid ${isDone?THEME.green:THEME.border}`,background:isDone?THEME.green:"transparent",cursor:busy||a.status==="cancelled"?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                                {isDone&&<span style={{color:"#fff",fontSize:9,fontWeight:800,lineHeight:1}}>✓</span>}
                              </button>

                              {/* ora */}
                              <span style={{fontSize:13,fontWeight:700,color:isDone?THEME.gray:THEME.blue,flexShrink:0,width:40,fontVariantNumeric:"tabular-nums"}}>{fmtTime(a.start_at)}</span>

                              {/* nome + status */}
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                                  <Link href={`/patients/${a.patient_id}`} onClick={e=>e.stopPropagation()} style={{fontWeight:600,fontSize:13,color:isDone?THEME.muted:THEME.text,textDecoration:isDone?"line-through":"none"}}>{name}</Link>
                                  <StatusPill status={a.status}/>
                                  {waSent&&<span style={{fontSize:10,color:THEME.green,fontWeight:700}}>WA ✓</span>}
                                </div>
                                <div style={{fontSize:11,color:THEME.muted,marginTop:1}}>{a.location==="studio"?a.clinic_site||"Studio":"Domicilio"}{a.amount?` · ${a.amount}€`:""}</div>
                              </div>

                              {/* pallino €  */}
                              {a.status!=="cancelled"&&(
                                <div onClick={e=>{e.stopPropagation();if(isDone)togglePaid(a.id,!isPaid);}} title={isPaid?"Pagato":"Non pagato"} style={{width:20,height:20,borderRadius:"50%",flexShrink:0,border:`2px solid ${isPaid?THEME.green:isDone?THEME.red:THEME.border}`,background:isPaid?THEME.green:isDone?"rgba(220,38,38,0.06)":"transparent",cursor:isDone?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  {isPaid&&<span style={{color:"#fff",fontSize:9,fontWeight:800}}>€</span>}
                                </div>
                              )}

                              {/* WA rapido — solo se c'è il telefono e non annullato */}
                              {phone&&a.status!=="cancelled"&&(
                                <button
                                  onClick={e=>{e.stopPropagation();sendWA(a);}}
                                  title={waSent?"Promemoria già inviato — rinvia":"Invia promemoria WhatsApp"}
                                  style={{width:28,height:28,borderRadius:6,border:"none",background:waSent?"rgba(22,163,74,0.12)":"#25d366",color:waSent?THEME.green:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}
                                >{waSent?"✓":"WA"}</button>
                              )}

                              <span style={{color:THEME.muted,fontSize:10,flexShrink:0,transform:isExp?"rotate(180deg)":"none",transition:"transform 0.15s"}}>▾</span>
                            </div>

                            {/* PANNELLO ESPANSO */}
                            {isExp&&(
                              <div className="fade-in" style={{margin:"0 14px 8px",borderRadius:10,background:THEME.panelSoft,border:`1px solid ${THEME.border}`,padding:"12px 14px"}}>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                                  {[{l:"Importo",v:a.amount?`${a.amount}€`:"—"},{l:"Tipo",v:a.treatment_type||"—"},{l:"Luogo",v:a.location==="studio"?a.clinic_site||"Studio":`Dom. ${a.domicile_address||""}`}].map(d=>(
                                    <div key={d.l} style={{background:"#fff",borderRadius:6,padding:"7px 10px",border:`1px solid ${THEME.border}`}}>
                                      <div style={{fontSize:9,color:THEME.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,marginBottom:2}}>{d.l}</div>
                                      <div style={{fontSize:13,fontWeight:600,color:THEME.text}}>{d.v}</div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{marginBottom:10}}>
                                  <div style={{fontSize:9,color:THEME.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,marginBottom:5}}>Nota seduta</div>
                                  <textarea value={rowNotes[a.id]||""} onChange={e=>setRowNotes(m=>({...m,[a.id]:e.target.value}))} rows={2} placeholder="Tecniche, esercizi, risposta del paziente…" style={{width:"100%",padding:"8px 10px",borderRadius:7,border:`1.5px solid ${THEME.border}`,fontSize:12,resize:"vertical",outline:"none",background:"#fff",color:THEME.text,boxSizing:"border-box"}} onClick={e=>e.stopPropagation()}/>
                                </div>
                                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                                  <button onClick={e=>{e.stopPropagation();saveNote(a.id);}} style={{padding:"6px 12px",borderRadius:6,border:"none",background:THEME.teal,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>{savingNote===a.id?"Salvo…":"Salva nota"}</button>
                                  {!isDone&&a.status!=="cancelled"&&<button onClick={e=>{e.stopPropagation();setStatus(a.id,"done");}} style={{padding:"6px 12px",borderRadius:6,border:"none",background:THEME.green,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>Eseguito</button>}
                                  {isDone&&!isPaid&&<button onClick={e=>{e.stopPropagation();togglePaid(a.id,true);}} style={{padding:"6px 12px",borderRadius:6,border:`1.5px solid ${THEME.green}`,background:"rgba(22,163,74,0.06)",color:THEME.green,fontWeight:700,fontSize:11,cursor:"pointer"}}>Incassa</button>}
                                  {isDone&&isPaid&&<button onClick={e=>{e.stopPropagation();togglePaid(a.id,false);}} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.muted,fontWeight:700,fontSize:11,cursor:"pointer"}}>Annulla pagamento</button>}
                                  {phone&&<button onClick={e=>{e.stopPropagation();sendWA(a);}} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.green,fontWeight:700,fontSize:11,cursor:"pointer"}}>WA</button>}
                                  {a.status!=="cancelled"&&<button onClick={e=>{e.stopPropagation();if(confirm("Annullare?"))setStatus(a.id,"cancelled");}} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.red,fontWeight:700,fontSize:11,cursor:"pointer"}}>Annulla</button>}
                                  <Link href={`/patients/${a.patient_id}`} onClick={e=>e.stopPropagation()} style={{padding:"6px 12px",borderRadius:6,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.blue,fontWeight:700,fontSize:11}}>Scheda →</Link>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── DESTRA: insight ── */}
          <div className="col-right">

            {/* ── PRENOTAZIONI WEB ── */}
            <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden",marginBottom:12}}>
              <div style={{background:"linear-gradient(135deg,#7c3aed,#2563eb)",padding:"11px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontWeight:700,fontSize:12,color:"#fff"}}>🌐 Prenotazioni dal sito</span>
                  {webBookings.filter(b=>b.status==="pending").length>0&&(
                    <span style={{fontSize:10,fontWeight:800,color:"#7c3aed",background:"#facc15",borderRadius:99,padding:"1px 7px"}}>{webBookings.filter(b=>b.status==="pending").length}</span>
                  )}
                </div>
                <button onClick={()=>void fetchWebBookings()} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:5,padding:"3px 8px",color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer"}}>↻</button>
              </div>
              {webBookings.length===0?(
                <div style={{padding:"20px 16px",textAlign:"center",fontSize:12,color:THEME.muted}}>Nessuna prenotazione ricevuta</div>
              ):(
                <div style={{maxHeight:320,overflowY:"auto"}}>
                  {webBookings.map(b=>{
                    const isPending   = b.status==="pending";
                    const isConfirmed = b.status==="confirmed";
                    const badgeStyle:React.CSSProperties = isPending
                      ? {background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa"}
                      : isConfirmed
                      ? {background:"#f0fdf4",color:"#15803d",border:"1px solid #bbf7d0"}
                      : {background:"#f8fafc",color:"#94a3b8",border:"1px solid #e2e8f0"};
                    const badgeLabel = isPending?"In attesa":isConfirmed?"Confermata":"Annullata";
                    const dateStr = new Date(b.requested_date+"T12:00:00").toLocaleDateString("it-IT",{day:"2-digit",month:"short"});
                    return(
                      <div key={b.id} onClick={()=>setWebPopup(b)} style={{padding:"10px 14px",borderBottom:`1px solid ${THEME.border}`,cursor:"pointer",opacity:b.status==="cancelled"?0.6:1}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                        onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                          <div style={{fontWeight:700,fontSize:12,color:THEME.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{b.patient_name}</div>
                          <div style={{fontSize:11,fontWeight:700,color:THEME.teal,flexShrink:0,marginLeft:8}}>{dateStr} {b.requested_time.slice(0,5)}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:10,color:THEME.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.service_name}</span>
                          <span style={{fontSize:9,fontWeight:700,borderRadius:99,padding:"1px 7px",...badgeStyle}}>{badgeLabel}</span>
                        </div>
                        {isPending&&(
                          <div style={{display:"flex",gap:6,marginTop:7}}>
                            <button onClick={e=>{e.stopPropagation();confirmWebBooking(b);}} disabled={!!webBookingActionId}
                              style={{flex:1,padding:"5px",border:"none",borderRadius:6,background:THEME.teal,color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer",opacity:webBookingActionId?0.6:1}}>
                              ✓ Conferma
                            </button>
                            <a href={`tel:${b.patient_phone}`} onClick={e=>e.stopPropagation()}
                              style={{flex:1,padding:"5px",border:`1px solid ${THEME.border}`,borderRadius:6,background:"#fff",color:THEME.text,fontWeight:700,fontSize:10,cursor:"pointer",textDecoration:"none",textAlign:"center"}}>
                              📞 {b.patient_phone}
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden",marginBottom:12}}>
              <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,fontSize:12,color:THEME.text}}>Settimana</span>
                <span style={{fontSize:11,color:THEME.muted}}>vs scorsa</span>
              </div>
              <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:6}}>
                {[
                  {label:"Eseguite",curr:weekStats.this.done,prev:weekStats.last.done,fmt:(n:number)=>String(n),warn:false},
                  {label:"Non pagate",curr:weekStats.this.notPaid,prev:weekStats.last.notPaid,fmt:(n:number)=>String(n),warn:true},
                  {label:"Totale atteso",curr:weekStats.this.expected,prev:weekStats.last.expected,fmt:money,warn:false},
                ].map(k=>{
                  const dir=k.curr===k.prev?"flat":k.curr>k.prev?"up":"down";
                  const d=k.prev===0?(k.curr===0?0:100):((k.curr-k.prev)/k.prev)*100;
                  const shown=Math.round(Math.abs(d));
                  const isGood=k.warn?dir==="down":dir==="up";
                  const dc=dir==="flat"?THEME.muted:isGood?THEME.green:THEME.red;
                  return(
                    <div key={k.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:7,background:THEME.panelSoft}}>
                      <div style={{fontSize:12,fontWeight:600,color:THEME.text}}>{k.label}</div>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <span style={{fontSize:14,fontWeight:800,color:THEME.text}}>{k.fmt(k.curr)}</span>
                        {dir!=="flat"&&<span style={{fontSize:10,fontWeight:700,color:dc,background:`${dc}18`,padding:"1px 5px",borderRadius:3}}>{dir==="up"?"↑":"↓"}{shown}%</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Da ricontattare */}
            <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden",marginBottom:12}}>
              <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                <div><span style={{fontWeight:700,fontSize:12,color:THEME.text}}>Da ricontattare</span><div style={{fontSize:10,color:THEME.muted,marginTop:1}}>assenti &gt;{inactiveThreshold}gg</div></div>
                <div style={{display:"flex",border:`1px solid ${THEME.border}`,borderRadius:5,overflow:"hidden"}}>
                  {([30,45,60] as const).map(d=>(
                    <button key={d} onClick={()=>setInactiveThreshold(d)} style={{padding:"3px 8px",border:"none",cursor:"pointer",fontSize:10,fontWeight:700,background:inactiveThreshold===d?THEME.amber:"#fff",color:inactiveThreshold===d?"#fff":THEME.muted}}>{d}g</button>
                  ))}
                </div>
              </div>
              <div style={{padding:"8px 12px",maxHeight:280,overflowY:"auto"}}>
                {inactiveLoading?<div style={{color:THEME.muted,fontSize:12,padding:"10px 0"}}>Caricamento…</div>
                :inactivePatients.filter(p=>!contactedPatients.has(p.patient_id)).length===0?<div style={{color:THEME.muted,fontSize:12,textAlign:"center",padding:"14px 0"}}>Nessun paziente da rincorrere.</div>
                :inactivePatients.filter(p=>!contactedPatients.has(p.patient_id)).map((p,i,arr)=>(
                  <div key={p.patient_id} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"8px 4px",borderBottom:i<arr.length-1?`1px solid ${THEME.border}`:"none"}}>
                    <div style={{minWidth:0,flex:1}}>
                      <Link href={`/patients/${p.patient_id}`} style={{fontWeight:600,fontSize:12,color:THEME.text,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(p.last_name+" "+p.first_name).trim()||"Paziente"}</Link>
                      <div style={{fontSize:10,color:THEME.amber,marginTop:1}}>{p.days_since_last}gg · {fmtDate(p.last_done_at)}</div>
                      {p.phone&&<a href={`tel:${p.phone}`} style={{fontSize:10,color:THEME.blue,display:"block",marginTop:1}}>{p.phone}</a>}
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0}}>
                      {p.phone&&<button onClick={()=>{const c=fmtPhone(p.phone!);if(!c)return;const msg=`Ciao ${p.first_name||""}, come stai? Ti scrivo per sapere se vuoi prenotare una seduta.`;openWA(p.phone!,msg);}} style={{padding:"3px 7px",borderRadius:4,border:"none",background:THEME.green,color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer"}}>WA</button>}
                      <button onClick={()=>setContactedPatients(prev=>new Set([...prev,p.patient_id]))} style={{padding:"3px 7px",borderRadius:4,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.muted,fontWeight:600,fontSize:10,cursor:"pointer"}}>✓</button>
                    </div>
                  </div>
                ))}
                {contactedPatients.size>0&&<button onClick={()=>setContactedPatients(new Set())} style={{width:"100%",marginTop:6,padding:"4px 0",border:"none",background:"transparent",color:THEME.muted,fontSize:10,cursor:"pointer"}}>Ripristina {contactedPatients.size} nascosti</button>}
              </div>
            </div>

            {/* Pazienti recenti */}
            <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden"}}>
              <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`}}><span style={{fontWeight:700,fontSize:12,color:THEME.text}}>Pazienti recenti</span></div>
              <div style={{padding:"4px 0"}}>
                {recentPatients.map((a,i)=>(
                  <div key={a.patient_id} className="rh ar" style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",borderBottom:i<recentPatients.length-1?`1px solid ${THEME.border}`:"none"}}>
                    <div style={{minWidth:0,flex:1}}>
                      <Link href={`/patients/${a.patient_id}`} style={{fontWeight:600,fontSize:12,color:THEME.text,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{patientName(a.patients)}</Link>
                      <div style={{fontSize:10,color:THEME.muted,marginTop:1}}>{fmtDate(a.start_at)}</div>
                    </div>
                    <Link href={`/patients/${a.patient_id}`} style={{fontSize:11,color:THEME.blue,fontWeight:600,flexShrink:0,marginLeft:8}}>→</Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>{/* fine main-cols */}

        {/* ━━━ PREVISIONE INCASSO + NOLEGGIO IN SCADENZA ━━━ */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>

          {/* PREVISIONE INCASSO */}
          <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontWeight:700,fontSize:12,color:THEME.text}}>Previsione incasso</span>
              <span style={{fontSize:10,fontWeight:600,color:THEME.muted}}>prossimi 7 giorni</span>
            </div>
            <div style={{padding:"16px"}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}>
                <span style={{fontSize:28,fontWeight:800,color:THEME.teal}}>€{forecastRevenue.total.toLocaleString("it-IT")}</span>
                <span style={{fontSize:13,color:THEME.muted}}>stimati</span>
              </div>
              <div style={{fontSize:12,color:THEME.muted,marginBottom:12}}>
                Da <strong style={{color:THEME.text}}>{forecastRevenue.sessCount} appuntamenti</strong> confermati/prenotati nei prossimi {forecastRevenue.days} giorni
              </div>
              {forecastRevenue.sessCount===0
                ? <div style={{fontSize:12,color:THEME.muted,fontStyle:"italic"}}>Nessun appuntamento confermato nei prossimi 7 giorni.</div>
                : (
                  <div style={{background:"rgba(13,148,136,0.06)",borderRadius:8,padding:"10px 12px",border:"1px solid rgba(13,148,136,0.15)"}}>
                    <div style={{fontSize:11,color:THEME.teal,fontWeight:700,marginBottom:4}}>Valore medio per seduta</div>
                    <div style={{fontSize:18,fontWeight:800,color:THEME.teal}}>
                      €{forecastRevenue.sessCount>0?Math.round(forecastRevenue.total/forecastRevenue.sessCount):0}
                    </div>
                  </div>
                )
              }
              <div style={{marginTop:10}}>
                <a href="/calendar" style={{fontSize:11,color:THEME.blue,fontWeight:700,textDecoration:"none"}}>
                  Vai al calendario →
                </a>
              </div>
            </div>
          </div>

          {/* NOLEGGIO IN SCADENZA */}
          <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontWeight:700,fontSize:12,color:THEME.text}}>Noleggi in scadenza</span>
              <a href="/noleggio" style={{fontSize:11,color:THEME.blue,fontWeight:700,textDecoration:"none"}}>Gestisci →</a>
            </div>
            <div style={{padding:"12px 16px"}}>
              {noleggioExpiring.length===0
                ? <div style={{fontSize:12,color:THEME.muted,padding:"8px 0",fontStyle:"italic"}}>Nessun noleggio in scadenza nei prossimi {noleggioWarningDays} giorni.</div>
                : noleggioExpiring.map((n,i)=>{
                  const expired=n.days_remaining<0;
                  const urgent=n.days_remaining===0;
                  const col=expired?THEME.red:urgent?THEME.red:THEME.amber;
                  const bg=expired?"rgba(220,38,38,0.05)":urgent?"rgba(220,38,38,0.05)":"rgba(249,115,22,0.05)";
                  function sendWA(){
                    const ph=n.patient_phone; if(!ph) return;
                    const scad=new Date(n.end_date+"T12:00:00").toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});
                    const firma = [currentStudio?.signature_name, currentStudio?.signature_title].filter(Boolean).join("\n");
                    const firmaLine = firma ? `\nGrazie,\n${firma}` : "\nGrazie";
                    const msg=expired?`Gentile ${n.patient_name},\nLe ricordiamo che il noleggio del dispositivo *${n.device_name}* è scaduto il ${scad}.\nLa preghiamo di contattarci per la restituzione.${firmaLine}`:`Gentile ${n.patient_name},\nLe ricordiamo che il noleggio del dispositivo *${n.device_name}* scadrà il *${scad}*${n.days_remaining>0?` (tra ${n.days_remaining} giorni)`:""  }.\nPer informazioni contatti lo studio.${firmaLine}`;
                    openWA(ph, msg);
                  }
                  return (
                    <div key={n.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:bg,border:`1px solid ${col}22`,marginBottom:i<noleggioExpiring.length-1?6:0}}>
                      <span style={{fontSize:16,flexShrink:0}}>{expired?"⛔":urgent?"🚨":"⏳"}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:13,color:THEME.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.patient_name}</div>
                        <div style={{fontSize:11,color:THEME.muted}}>{n.device_name}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:11,fontWeight:800,color:col}}>
                          {expired?`Scaduto ${Math.abs(n.days_remaining)}gg fa`:urgent?"Scade oggi":`${n.days_remaining} giorni`}
                        </div>
                        <div style={{fontSize:10,color:THEME.muted}}>
                          {new Date(n.end_date+"T12:00:00").toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"})}
                        </div>
                      </div>
                      {n.patient_phone && (
                        <button onClick={sendWA} title="Invia WA scadenza" style={{width:28,height:28,borderRadius:6,border:"1px solid rgba(37,211,102,0.4)",background:"rgba(37,211,102,0.08)",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>💬</button>
                      )}
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>

        {/* ━━━ RIGA INFERIORE: slot liberi · saldi aperti · compleanni ━━━ */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,alignItems:"start"}}>

          {/* SLOT LIBERI */}
          <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <span style={{fontWeight:700,fontSize:12,color:THEME.text}}>Slot liberi</span>
                <div style={{fontSize:10,color:THEME.muted,marginTop:1}}>oggi e domani · ore 8–20 · escluse domeniche</div>
              </div>
              {freeSlots.length>0&&<span style={{fontSize:11,fontWeight:700,color:THEME.blue,background:"rgba(37,99,235,0.08)",padding:"2px 8px",borderRadius:4}}>{freeSlots.length} ore libere</span>}
            </div>
            <div style={{padding:"12px 16px"}}>
              {freeSlots.length===0
                ?<div style={{color:THEME.muted,fontSize:12,fontWeight:500}}>Nessuno slot disponibile.</div>
                :(["oggi","domani"] as const).map(label=>{
                  const slots=freeSlots.filter(s=>s.day===label);
                  if(!slots.length) return null;
                  return(
                    <div key={label} style={{marginBottom:10}}>
                      <div style={{fontSize:10,fontWeight:700,color:THEME.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:7}}>{label}</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {slots.map(s=>(
                          <Link key={s.time} href={`/calendar?date=${s.dateYMD}&new=1&time=${s.time.replace(":","")}`}
                            style={{padding:"5px 11px",borderRadius:7,border:`1px solid ${THEME.border}`,background:THEME.panelSoft,fontSize:12,fontWeight:700,color:THEME.blue,cursor:"pointer",textDecoration:"none"}}>
                            {s.time}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>

          {/* SALDI APERTI */}
          <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <span style={{fontWeight:700,fontSize:12,color:THEME.text}}>💰 Saldi aperti</span>
                <div style={{fontSize:10,color:THEME.muted,marginTop:1}}>sedute eseguite non pagate · raggruppate per paziente</div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {openBalanceGroups.length>0&&(
                  <>
                    <span style={{fontSize:11,fontWeight:700,color:THEME.red,background:"rgba(220,38,38,0.08)",padding:"2px 8px",borderRadius:4}}>
                      {openBalanceGroups.reduce((s,g)=>s+g.total,0).toLocaleString("it-IT",{maximumFractionDigits:0})}€
                    </span>
                    <button
                      onClick={()=>{
                        const rows=openBalanceGroups.map(g=>`<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${g.patient_name}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${g.sessions}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#dc2626">${g.total.toLocaleString("it-IT")}€</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${new Date(g.last_at).toLocaleDateString("it-IT")}</td></tr>`).join("");
                        const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Saldi aperti</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}th{background:#f1f5f9;padding:8px 12px;text-align:left;font-weight:700;font-size:12px}tfoot td{font-weight:800;font-size:14px;padding:10px 12px;border-top:2px solid #0f172a}@media print{button{display:none}}${studioHeaderCss}</style></head><body>${studioPdfHeader(currentStudio,{docTitle:"Saldi Aperti",docSubtitle:`${openBalanceGroups.length} pazienti`})}<table><thead><tr><th>Paziente</th><th style="text-align:center">Sedute</th><th style="text-align:right">Totale</th><th>Ultima seduta</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>TOTALE</td><td style="text-align:center">${openBalanceGroups.reduce((s,g)=>s+g.sessions,0)}</td><td style="text-align:right;color:#dc2626">${openBalanceGroups.reduce((s,g)=>s+g.total,0).toLocaleString("it-IT")}€</td><td></td></tr></tfoot></table>${studioPdfFooter(currentStudio)}<button onclick="window.print()" style="margin-top:24px;padding:10px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🖨 Stampa</button></body></html>`;
                        const w=window.open("","_blank","width=800,height=600");
                        if(w){w.document.write(html);w.document.close();}
                      }}
                      style={{padding:"3px 10px",borderRadius:5,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.text,fontWeight:700,fontSize:10,cursor:"pointer"}}
                    >🖨 Stampa</button>
                  </>
                )}
              </div>
            </div>
            <div style={{padding:"6px 12px",maxHeight:280,overflowY:"auto"}}>
              {loadingBalances
                ?<div style={{color:THEME.muted,fontSize:12,padding:"10px 0"}}>Caricamento…</div>
                :openBalanceGroups.length===0
                ?<div style={{color:THEME.green,fontSize:12,padding:"12px 2px",fontWeight:600}}>Nessun saldo aperto ✓</div>
                :openBalanceGroups.map((g,i)=>{
                  const clean=g.phone?fmtPhone(g.phone):"";
                  const firma = [currentStudio?.signature_name, currentStudio?.signature_title].filter(Boolean).join("\n");
                  const firmaLine = firma ? `\n\nCordiali saluti,\n${firma}` : "\n\nCordiali saluti";
                  const waMsg=`Gentile ${g.patient_name.split(" ")[1]||g.patient_name},\n\nLe ricordiamo che risultano ${g.sessions} seduta${g.sessions>1?"e":""} non ancora saldate per un totale di ${g.total.toLocaleString("it-IT")}€.\n\nPer qualsiasi informazione siamo a disposizione.${firmaLine}`;
                  return(
                    <div key={g.patient_id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 4px",borderBottom:i<openBalanceGroups.length-1?`1px solid ${THEME.border}`:"none"}}>
                      {/* Avatar */}
                      <div style={{width:32,height:32,borderRadius:8,background:"rgba(220,38,38,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,color:THEME.red,flexShrink:0}}>
                        {(g.patient_name[0]||"?").toUpperCase()}
                      </div>
                      {/* Info */}
                      <div style={{flex:1,minWidth:0}}>
                        <Link href={`/patients/${g.patient_id}`} style={{fontWeight:700,fontSize:12,color:THEME.text,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.patient_name}</Link>
                        <div style={{fontSize:10,color:THEME.muted,marginTop:1,display:"flex",gap:6}}>
                          <span>{g.sessions} seduta{g.sessions>1?"e":""}</span>
                          <span>·</span>
                          <span>ultima {new Date(g.last_at).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"})}</span>
                        </div>
                      </div>
                      {/* Totale + azioni */}
                      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                        <span style={{fontSize:13,fontWeight:800,color:THEME.red}}>{g.total.toLocaleString("it-IT")}€</span>
                        {clean&&(
                          <button
                            onClick={()=>{openWA(g.phone||"",waMsg);}}
                            style={{padding:"3px 7px",borderRadius:4,border:"none",background:"#25d366",color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer"}}
                            title="Invia sollecito pagamento su WhatsApp"
                          >WA</button>
                        )}
                        <button
                          onClick={()=>togglePaid(openBalances.find(r=>r.patient_id===g.patient_id)?.id||"",true)}
                          style={{padding:"3px 7px",borderRadius:4,border:"none",background:THEME.green,color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer"}}
                        >Incassa</button>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>

          {/* COMPLEANNI */}
          <div style={{background:"#fff",borderRadius:12,border:`1px solid ${THEME.border}`,overflow:"hidden"}}>
            <div style={{padding:"11px 16px",borderBottom:`1px solid ${THEME.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontWeight:700,fontSize:12,color:THEME.text}}>🎂 Compleanni</span>
              <span style={{fontSize:10,color:THEME.muted}}>prossimi 7 giorni</span>
            </div>
            <div style={{padding:"6px 12px"}}>
              {loadingBirthdays
                ?<div style={{color:THEME.muted,fontSize:12,padding:"10px 0"}}>Caricamento…</div>
                :birthdays.length===0
                ?<div style={{color:THEME.muted,fontSize:12,padding:"12px 2px",fontWeight:500}}>Nessun compleanno questa settimana.</div>
                :birthdays.map((b,i)=>{
                  const waClean=b.phone?fmtPhone(b.phone):"";
                  const firma = [currentStudio?.signature_name, currentStudio?.signature_title].filter(Boolean).join("\n");
                  const firmaLine = firma ? `\n\nCordiali saluti,\n${firma}` : "\n\nCordiali saluti";
                  const waText=`Gentile ${b.first_name},\n\nLe auguriamo un felice compleanno!${firmaLine}`;
                  return(
                    <div key={b.patient_id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 4px",borderBottom:i<birthdays.length-1?`1px solid ${THEME.border}`:"none"}}>
                      <div style={{width:32,height:32,borderRadius:8,flexShrink:0,background:b.isToday?"rgba(249,115,22,0.12)":"rgba(37,99,235,0.07)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🎂</div>
                      <div style={{flex:1,minWidth:0}}>
                        <Link href={`/patients/${b.patient_id}`} style={{fontWeight:600,fontSize:12,color:THEME.text,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</Link>
                        <div style={{fontSize:10,marginTop:1,display:"flex",gap:5}}>
                          <span style={{color:b.isToday?THEME.amber:THEME.muted,fontWeight:b.isToday?700:500}}>{b.weekday}</span>
                          <span style={{color:THEME.muted}}>· {b.age} anni</span>
                        </div>
                      </div>
                      {waClean&&(
                        <button onClick={()=>openWA(b.phone||"",waText)} style={{padding:"4px 8px",borderRadius:5,border:"none",background:THEME.green,color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer",flexShrink:0}}>🎉 WA</button>
                      )}
                    </div>
                  );
                })
              }
            </div>
          </div>

        </div>{/* fine bottom row */}

      </div>
    </div>
  );
}
