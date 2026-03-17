"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

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
    const occupied  = dayAppts.some(a => a.status !== "cancelled" && a.start_at < slotEnd && a.start_at >= slotStart);
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
const fmtPhone = (phone: string): string => {
  if (!phone) return "";
  // 1. Rimuovi tutto tranne cifre e +
  let c = phone.trim().replace(/[\s\-\.\(\)\/]/g, "");
  // 2. Normalizza 00 → +
  if (c.startsWith("00")) c = "+" + c.slice(2);
  // 3. Rimuovi il + per lavorare solo con cifre
  if (c.startsWith("+")) c = c.slice(1);
  // 4. Rimuovi caratteri non numerici residui
  c = c.replace(/\D/g, "");
  if (!c) return "";
  // 5. Se inizia già con 39 e ha lunghezza corretta (12 cifre mobile o 11 fisso)
  if (c.startsWith("39") && (c.length === 12 || c.length === 11)) return c;
  // 6. Mobile italiano: 3xx → 12 cifre con 39
  if (c.startsWith("3") && c.length === 10) return "39" + c;
  // 7. Fisso italiano con 0: 0xx → 11 cifre con 39 (rimuove lo 0)
  if (c.startsWith("0") && c.length >= 9 && c.length <= 11) return "39" + c;
  // 8. Fallback: aggiungi 39 se < 11 cifre (numero parziale salvato male)
  if (c.length <= 10) return "39" + c;
  return c;
};
const pickPatient = (p: AppointmentRow["patients"]) => Array.isArray(p)?(p[0]??null):((p as any)??null);
const patientName = (p: AppointmentRow["patients"]) => { const pp=pickPatient(p); return `${pp?.last_name||""} ${pp?.first_name||""}`.trim()||"Paziente"; };
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
  const fetchOpenBalances=useCallback(async()=>{
    setLoadingBalances(true);
    try{
      const{data,error}=await supabase.from("appointments")
        .select("id,patient_id,amount,start_at,patients:patient_id(first_name,last_name)")
        .eq("status","done").eq("is_paid",false).not("amount","is",null).gt("amount",0)
        .order("start_at",{ascending:false}).limit(20);
      if(error) throw error;
      const nowMs=Date.now();
      setOpenBalances((data||[]).map((r:any)=>{
        const p=Array.isArray(r.patients)?r.patients[0]:r.patients;
        return{id:r.id,patient_id:r.patient_id,patient_name:`${p?.last_name||""} ${p?.first_name||""}`.trim()||"Paziente",amount:Number(r.amount)||0,start_at:r.start_at,days_ago:Math.floor((nowMs-new Date(r.start_at).getTime())/86400000)};
      }));
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

  const fetchInactive=useCallback(async()=>{ try{ setInactiveLoading(true); const{data,error}=await supabase.from("appointments").select("patient_id,start_at,status,patients:patient_id!inner(first_name,last_name,phone,status)").eq("status","done").order("start_at",{ascending:false}).limit(2000); if(error) throw new Error(error.message); const rows=(data||[]) as any[]; const byP=new Map<string,any>(); for(const r of rows){if(r.patient_id&&!byP.has(r.patient_id)) byP.set(r.patient_id,r);} const nowMs=startOfDay(new Date()).getTime(); const list:InactivePatientRow[]=[]; for(const[pid,r] of byP.entries()){const p=pickPatient(r.patients); const days=Math.floor((nowMs-new Date(r.start_at).getTime())/86400000); if((p?.status||"").toString().toLowerCase()==="inactive") continue; if(days>inactiveThreshold) list.push({patient_id:pid,first_name:p?.first_name||"",last_name:p?.last_name||"",phone:p?.phone??null,last_done_at:r.start_at,days_since_last:days});} list.sort((a,b)=>b.days_since_last-a.days_since_last); setInactivePatients(list.slice(0,12)); }catch(e:any){console.error(e?.message);} finally{setInactiveLoading(false);} },[inactiveThreshold]);
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
  const sendWA=useCallback(async(appt:AppointmentRow)=>{ const phone=pickPatient(appt.patients)?.phone||""; const clean=fmtPhone(phone); if(!clean){alert("Numero non valido.");return;} const msg=buildWAMsg(appt); await supabase.from("appointments").update({whatsapp_sent_at:new Date().toISOString(),whatsapp_sent:true}).eq("id",appt.id); const a=document.createElement("a");a.href=`https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(msg)}`;a.target="_blank";a.rel="noopener noreferrer";document.body.appendChild(a);a.click();document.body.removeChild(a); fetchAppts(); },[fetchAppts]);

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
        @media(min-width:768px)and(max-width:1024px){.th{display:none!important}}
      `}</style>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{position:"sticky",top:0,zIndex:40,background:"linear-gradient(135deg,#0d9488,#2563eb)",padding:"0 24px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 2px 16px rgba(13,148,136,0.20)",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:24,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,borderRadius:7,background:"rgba(255,255,255,0.2)",border:"1.5px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13}}>F</div>
            <span style={{fontWeight:700,fontSize:14,color:"#fff",letterSpacing:0.8,textTransform:"uppercase"}}>Fisio<span style={{fontWeight:800}}>Hub</span></span>
          </div>
          <nav style={{display:"flex",gap:1}}>
            {([{href:"/",label:"Home",active:true},{href:"/calendar",label:"Calendario",active:false},{href:"/reports",label:"Report",active:false},{href:"/patients",label:"Pazienti",active:false}] as const).map(item=>(
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
          <div ref={userMenuRef} style={{position:"relative"}}>
            <button onClick={()=>setUserMenuOpen(v=>!v)} style={{width:30,height:30,borderRadius:7,border:"1px solid rgba(255,255,255,0.32)",background:"rgba(255,255,255,0.18)",color:"#fff",fontWeight:800,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{userInitials}</button>
            {userMenuOpen&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:196,background:"#fff",border:`1px solid ${THEME.border}`,borderRadius:10,boxShadow:"0 8px 28px rgba(15,23,42,0.12)",overflow:"hidden",zIndex:60}}>
                <div style={{padding:"10px 15px",borderBottom:`1px solid ${THEME.border}`,fontSize:12,color:THEME.muted}}>{userEmail}</div>
                <Link href="/settings" onClick={()=>setUserMenuOpen(false)} style={{display:"block",padding:"10px 15px",color:THEME.text,fontSize:13,fontWeight:600,borderBottom:`1px solid ${THEME.border}`}}>Impostazioni</Link>
                <button onClick={handleLogout} style={{width:"100%",padding:"10px 15px",background:"transparent",border:"none",cursor:"pointer",color:THEME.red,fontWeight:600,fontSize:13,textAlign:"left"}}>Logout</button>
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
          <div style={{display:"flex",gap:0,flexWrap:"wrap",marginBottom:0}}>
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
                        <button onClick={()=>setStatus(focusNext.id,focusNext.status==="done"?"confirmed":"done")} style={{flex:1,padding:"9px 10px",borderRadius:8,border:"none",background:focusNext.status==="done"?"rgba(22,163,74,0.10)":THEME.teal,color:focusNext.status==="done"?THEME.green:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                          {focusNext.status==="done"?"Annulla":"Segna eseguito"}
                        </button>
                        {focusNext.status==="done"&&!focusNext.is_paid&&(
                          <button onClick={()=>togglePaid(focusNext.id,true)} style={{padding:"9px 12px",borderRadius:8,border:`1.5px solid ${THEME.green}`,background:"rgba(22,163,74,0.06)",color:THEME.green,fontWeight:700,fontSize:12,cursor:"pointer"}}>Incassa</button>
                        )}
                        {pickPatient(focusNext.patients)?.phone&&<button onClick={()=>sendWA(focusNext)} style={{padding:"9px 12px",borderRadius:8,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.green,fontWeight:700,fontSize:12,cursor:"pointer"}}>WA</button>}
                        <button onClick={()=>{if(confirm("Annullare?"))setStatus(focusNext.id,"cancelled");}} style={{padding:"9px 10px",borderRadius:8,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.red,fontWeight:700,fontSize:12,cursor:"pointer"}}>✕</button>
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

            {/* Statistiche settimana */}
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
                      {p.phone&&<button onClick={()=>{const c=fmtPhone(p.phone!);if(!c)return;const msg=`Ciao ${p.first_name||""}, come stai? Ti scrivo per sapere se vuoi prenotare una seduta.`;window.open(`https://web.whatsapp.com/send?phone=${c}&text=${encodeURIComponent(msg)}`,"_blank","noopener,noreferrer");}} style={{padding:"3px 7px",borderRadius:4,border:"none",background:THEME.green,color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer"}}>WA</button>}
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
                <span style={{fontWeight:700,fontSize:12,color:THEME.text}}>Saldi aperti</span>
                <div style={{fontSize:10,color:THEME.muted,marginTop:1}}>eseguito ma non pagato</div>
              </div>
              {openBalances.length>0&&(
                <span style={{fontSize:11,fontWeight:700,color:THEME.red,background:"rgba(220,38,38,0.08)",padding:"2px 8px",borderRadius:4}}>
                  {openBalances.reduce((s,r)=>s+r.amount,0).toLocaleString("it-IT",{maximumFractionDigits:0})}€
                </span>
              )}
            </div>
            <div style={{padding:"6px 12px",maxHeight:240,overflowY:"auto"}}>
              {loadingBalances
                ?<div style={{color:THEME.muted,fontSize:12,padding:"10px 0"}}>Caricamento…</div>
                :openBalances.length===0
                ?<div style={{color:THEME.green,fontSize:12,padding:"12px 2px",fontWeight:600}}>Nessun saldo aperto ✓</div>
                :openBalances.map((r,i)=>(
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 4px",borderBottom:i<openBalances.length-1?`1px solid ${THEME.border}`:"none"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <Link href={`/patients/${r.patient_id}`} style={{fontWeight:600,fontSize:12,color:THEME.text,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.patient_name}</Link>
                      <div style={{fontSize:10,color:THEME.muted,marginTop:1}}>{r.days_ago===0?"oggi":r.days_ago===1?"ieri":`${r.days_ago}gg fa`} · {fmtDate(r.start_at)}</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
                      <span style={{fontSize:13,fontWeight:800,color:THEME.red}}>{r.amount.toLocaleString("it-IT",{maximumFractionDigits:0})}€</span>
                      <button onClick={()=>togglePaid(r.id,true)} style={{padding:"3px 8px",borderRadius:4,border:"none",background:THEME.green,color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer"}}>Incassa</button>
                    </div>
                  </div>
                ))
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
                  const waText=`Gentile ${b.first_name},\n\nLe auguriamo un felice compleanno!\n\nCordiali saluti,\nDr. Marco Turchetta`;
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
                        <button onClick={()=>window.open(`https://web.whatsapp.com/send?phone=${waClean}&text=${encodeURIComponent(waText)}`,"_blank","noopener,noreferrer")} style={{padding:"4px 8px",borderRadius:5,border:"none",background:THEME.green,color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer",flexShrink:0}}>🎉 WA</button>
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
