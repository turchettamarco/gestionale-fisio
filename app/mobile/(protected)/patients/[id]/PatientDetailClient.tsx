"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

/* ─── Types ───────────────────────────────────────────────────────────── */
type Plan   = "invoice" | "no_invoice";
type Status = "booked" | "confirmed" | "done";
type DocType =
  | "rx" | "rmn" | "tac" | "ecografia" | "elettromiografia"
  | "prescrizione" | "gdpr_informativa_privacy" | "consenso_trattamento" | "altro";

type Patient = {
  id: string;
  first_name: string; last_name: string;
  phone: string | null; birth_date: string | null;
  preferred_plan: Plan | null;
  anamnesis: string | null; diagnosis: string | null; treatment: string | null;
  prescribed_sessions: number | null;
};

type AppointmentRow = {
  id: string; start_at: string; status: Status; is_paid: boolean; amount: number | null;
};

type PatientDoc = {
  id: string; patient_id: string;
  doc_type: DocType | string;
  file_name: string; storage_path: string; uploaded_at: string;
};

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

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function ddmmyyyy(iso: string | null) {
  if (!iso) return "—";
  const [y,m,d] = iso.split("-");
  return (!y||!m||!d) ? iso : `${d}/${m}/${y}`;
}
function calcAge(iso: string | null): number | null {
  if (!iso) return null;
  const birth = new Date(iso);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
function formatDateTimeIT(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT",{
    day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",
  });
}
function formatDateIT(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT",{
    day:"2-digit",month:"2-digit",year:"numeric",
  });
}
function statusLabel(s: Status) {
  const map: Record<Status,string> = {booked:"Prenotata",confirmed:"Confermata",done:"Eseguita"};
  return map[s] ?? s;
}
function statusColor(s: Status) {
  const map: Record<Status,string> = {done:THEME.green,confirmed:THEME.blue,booked:THEME.amber};
  return map[s] ?? THEME.gray;
}
function docTypeLabel(t: string) {
  return ({
    rx:"Rx", rmn:"RMN", tac:"TAC", ecografia:"Ecografia",
    elettromiografia:"Elettromiografia", prescrizione:"Prescrizione",
    gdpr_informativa_privacy:"GDPR Privacy", consenso_trattamento:"Consenso trattamento",
    altro:"Altro",
  } as Record<string,string>)[t] ?? t;
}
function docTypeHint(t: string) {
  return ({
    rx:"Radiografie / lastre", rmn:"Risonanza magnetica", tac:"Tomografia computerizzata",
    ecografia:"Referti ecografici", elettromiografia:"EMG / ENG",
    prescrizione:"Prescrizioni mediche / impegnative",
  } as Record<string,string>)[t] ?? "";
}
function safeFileName(name: string) { return name.replace(/[^\w.\-() ]+/g,"_"); }
function formatPhoneForWA(phone: string): string {
  let c = phone.replace(/[\s\(\)\-\.]/g,"");
  if (c.startsWith("+")) c=c.substring(1);
  if (c.startsWith("0")) c="39"+c.substring(1);
  if (!c.startsWith("39")&&c.length<=10) c="39"+c;
  return c;
}
function initials(p: Patient) {
  return ((p.last_name?.[0]??"")+(p.first_name?.[0]??"")).toUpperCase()||"?";
}
function isImageFile(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name);
}

/* ─── UI primitives ───────────────────────────────────────────────────── */
function inputS(disabled?: boolean): React.CSSProperties {
  return {
    width:"100%", padding:"10px 12px", borderRadius:10,
    border:`1.5px solid ${disabled ? THEME.border : THEME.border}`,
    outline:"none",
    background: disabled ? THEME.appBg : THEME.panelBg,
    color: disabled ? THEME.muted : THEME.text,
    fontWeight:500, fontSize:14, fontFamily:"Inter,-apple-system,sans-serif",
    boxSizing:"border-box" as const, opacity: disabled ? 0.75 : 1,
  };
}

type BtnV = "primary"|"ghost"|"danger"|"success";
function Btn({v="primary",onClick,disabled,children,full=true}:{
  v?:BtnV; onClick?:()=>void; disabled?:boolean; children:React.ReactNode; full?:boolean;
}) {
  const base: React.CSSProperties = {
    padding:"11px 16px", borderRadius:10, fontWeight:700, fontSize:13,
    cursor:disabled?"not-allowed":"pointer",
    fontFamily:"Inter,-apple-system,sans-serif",
    opacity:disabled?0.45:1, transition:"opacity 0.15s",
    display:"flex", alignItems:"center", justifyContent:"center", gap:6,
    width:full?"100%":undefined, border:"none",
  };
  const vars: Record<BtnV,React.CSSProperties> = {
    primary: {background:THEME.gradient,color:"#fff",boxShadow:"0 2px 8px rgba(13,148,136,0.25)"},
    ghost:   {background:THEME.panelSoft,color:THEME.muted,border:`1.5px solid ${THEME.border}`},
    danger:  {background:"rgba(220,38,38,0.08)",color:THEME.red,border:`1.5px solid rgba(220,38,38,0.2)`},
    success: {background:"rgba(22,163,74,0.10)",color:THEME.green,border:`1.5px solid rgba(22,163,74,0.3)`},
  };
  return <button onClick={onClick} disabled={disabled} style={{...base,...vars[v]}}>{children}</button>;
}

function FG({label,children}:{label:string;children:React.ReactNode}) {
  return (
    <div>
      <div style={{fontSize:10,color:THEME.muted,fontWeight:700,marginBottom:6,
        textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</div>
      {children}
    </div>
  );
}

function ErrBox({msg}:{msg:string}) {
  return (
    <div style={{padding:"10px 12px",borderRadius:10,marginBottom:10,
      background:"rgba(220,38,38,0.06)",border:"1.5px solid rgba(220,38,38,0.25)",
      color:"#7f1d1d",fontWeight:600,fontSize:13,whiteSpace:"pre-wrap"}}>
      ⚠️ {msg}
    </div>
  );
}

/* ─── DocThumbnail — anteprima immagine ──────────────────────────────── */
function DocThumbnail({doc}:{doc:PatientDoc}) {
  const [url, setUrl] = useState<string|null>(null);
  useEffect(()=>{
    if(!isImageFile(doc.file_name)) return;
    supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path,300)
      .then(r=>{ if(r.data?.signedUrl) setUrl(r.data.signedUrl); });
  },[doc.storage_path,doc.file_name]);
  if(!url) return null;
  return (
    <img src={url} alt={doc.file_name} style={{
      width:64,height:64,borderRadius:8,objectFit:"cover",
      border:`1.5px solid ${THEME.border}`,flexShrink:0,
    }}/>
  );
}

/* ─── Main ────────────────────────────────────────────────────────────── */
export default function PatientDetailClient({ patientId }: { patientId: string }) {
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [patient,   setPatient]   = useState<Patient|null>(null);
  const [activeTab, setActiveTab] = useState<"info"|"clinical"|"therapies"|"docs">("info");

  /* user */
  const [userEmail,    setUserEmail]    = useState<string|null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  /* info edit */
  const [editMode,      setEditMode]      = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [firstName,     setFirstName]     = useState("");
  const [lastName,      setLastName]      = useState("");
  const [phone,         setPhone]         = useState("");
  const [preferredPlan, setPreferredPlan] = useState<Plan>("invoice");
  const [prescribedSessions, setPrescribedSessions] = useState<string>("");

  /* clinical edit */
  const [clinicalEdit, setClinicalEdit] = useState(false);
  const [anamnesis,    setAnamnesis]    = useState("");
  const [diagnosis,    setDiagnosis]    = useState("");
  const [treatment,    setTreatment]    = useState("");
  const [savingClin,   setSavingClin]   = useState(false);

  /* docs */
  const [docs,           setDocs]           = useState<PatientDoc[]>([]);
  const [uploading,      setUploading]      = useState(false);
  const [docType,        setDocType]        = useState<DocType>("rx");
  const [files,          setFiles]          = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState({done:0,total:0,current:""});

  /* therapies */
  const [appointments,  setAppointments]  = useState<AppointmentRow[]>([]);
  const [apptFilter,    setApptFilter]    = useState<"future"|"past">("future");

  /* ── User ──────────────────────────────── */
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

  /* ── Load ──────────────────────────────── */
  async function loadPatient() {
    setLoading(true); setError("");
    const res = await supabase.from("patients")
      .select("id,first_name,last_name,phone,birth_date,preferred_plan,anamnesis,diagnosis,treatment,prescribed_sessions")
      .eq("id",patientId).single();
    if (res.error) { setError(res.error.message); setPatient(null); }
    else {
      const p=res.data as Patient;
      setPatient(p);
      setFirstName(p.first_name??""); setLastName(p.last_name??"");
      setPhone(p.phone??""); setPreferredPlan((p.preferred_plan??"invoice") as Plan);
      setPrescribedSessions(p.prescribed_sessions!=null?String(p.prescribed_sessions):"");
      setAnamnesis(p.anamnesis??""); setDiagnosis(p.diagnosis??""); setTreatment(p.treatment??"");
    }
    setLoading(false);
  }
  async function loadDocs() {
    const res=await supabase.from("patient_documents")
      .select("*").eq("patient_id",patientId).order("uploaded_at",{ascending:false});
    if(res.error) setError(res.error.message);
    else setDocs((res.data??[]) as PatientDoc[]);
  }
  async function loadAppointments() {
    const res=await supabase.from("appointments")
      .select("id,start_at,status,is_paid,amount")
      .eq("patient_id",patientId).order("start_at",{ascending:false});
    if(res.error) setError(res.error.message);
    else setAppointments((res.data??[]) as AppointmentRow[]);
  }

  useEffect(()=>{
    if(!patientId) return;
    loadPatient(); loadDocs(); loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[patientId]);

  /* ── Save info ─────────────────────────── */
  async function savePatient() {
    if(!patient) return;
    if(!firstName.trim()||!lastName.trim()){setError("Nome e cognome obbligatori");return;}
    setSaving(true); setError("");
    const ps = prescribedSessions.trim()===""?null:Number(prescribedSessions);
    const res=await supabase.from("patients").update({
      first_name:firstName.trim(), last_name:lastName.trim(),
      phone:phone.trim()||null, preferred_plan:preferredPlan,
      prescribed_sessions: ps&&isFinite(ps)?ps:null,
    }).eq("id",patientId);
    setSaving(false);
    if(res.error) setError(res.error.message);
    else { await loadPatient(); setEditMode(false); }
  }

  /* ── Save clinical ─────────────────────── */
  async function saveClinical() {
    if(!patient) return;
    setSavingClin(true); setError("");
    const res=await supabase.from("patients").update({
      anamnesis:anamnesis.trim()||null,
      diagnosis:diagnosis.trim()||null,
      treatment:treatment.trim()||null,
    }).eq("id",patientId);
    setSavingClin(false);
    if(res.error) setError(res.error.message);
    else { await loadPatient(); setClinicalEdit(false); }
  }

  /* ── Docs ──────────────────────────────── */
  function onPickFiles(e:React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files??[]));
  }
  async function uploadDocuments() {
    if(!files.length){setError("Seleziona almeno un file");return;}
    setUploading(true); setError(""); setUploadProgress({done:0,total:files.length,current:""});
    for(let i=0;i<files.length;i++){
      const f=files[i];
      setUploadProgress({done:i,total:files.length,current:f.name});
      const safeName=safeFileName(f.name);
      const path=`${patientId}/${docType}/${Date.now()}_${safeName}`;
      const upRes=await supabase.storage.from("patient_docs").upload(path,f,{upsert:false});
      if(upRes.error){setError(`Upload fallito (${f.name}): ${upRes.error.message}`);setUploading(false);return;}
      const insRes=await supabase.from("patient_documents").insert({
        patient_id:patientId,doc_type:docType,file_name:f.name,storage_path:path,
      });
      if(insRes.error){
        await supabase.storage.from("patient_docs").remove([path]);
        setError(`Errore DB (${f.name}): ${insRes.error.message}`);
        setUploading(false); return;
      }
    }
    setUploadProgress({done:files.length,total:files.length,current:""});
    setFiles([]); await loadDocs(); setUploading(false);
  }
  async function openDocument(doc:PatientDoc) {
    const res=await supabase.storage.from("patient_docs").createSignedUrl(doc.storage_path,300);
    if(res.data?.signedUrl) window.open(res.data.signedUrl,"_blank","noopener,noreferrer");
    else setError("Impossibile aprire il documento");
  }
  async function deleteDocument(doc:PatientDoc) {
    if(!window.confirm("Eliminare questo documento?")) return;
    const dbRes=await supabase.from("patient_documents").delete().eq("id",doc.id);
    if(dbRes.error){setError(`Errore DB: ${dbRes.error.message}`);return;}
    await supabase.storage.from("patient_docs").remove([doc.storage_path]);
    await loadDocs();
  }

  /* ── Therapies ─────────────────────────── */
  async function updateAppointmentStatus(id:string,status:Status) {
    const payload:Record<string,unknown>={status};
    if(status!=="done") payload.is_paid=false;
    await supabase.from("appointments").update(payload).eq("id",id);
    await loadAppointments();
  }
  async function togglePaid(id:string,isPaid:boolean) {
    await supabase.from("appointments").update({is_paid:isPaid}).eq("id",id);
    await loadAppointments();
  }
  async function deletePatient() {
    if(!patient||!window.confirm(`Eliminare ${patient.first_name} ${patient.last_name}?`)) return;
    await supabase.from("patients").delete().eq("id",patientId);
    window.location.href="/mobile/patients";
  }
  async function handleLogout() {
    try{await supabase.auth.signOut();}finally{window.location.href="/login";}
  }

  /* ── Derived ───────────────────────────── */
  const now = new Date();

  const apptStats = useMemo(()=>{
    const done  = appointments.filter(a=>a.status==="done");
    const paid  = done.filter(a=>a.is_paid);
    const unpaid= done.filter(a=>!a.is_paid);
    const totalRev  = done.reduce((s,a)=>s+(a.amount??0),0);
    const paidRev   = paid.reduce((s,a)=>s+(a.amount??0),0);
    const unpaidRev = unpaid.reduce((s,a)=>s+(a.amount??0),0);
    return {
      total: appointments.length,
      done:  done.length,
      unpaid: unpaid.length,
      totalRevenue: totalRev,
      paidRevenue:  paidRev,
      unpaidRevenue:unpaidRev,
    };
  },[appointments]);

  const filteredAppts = useMemo(()=>{
    if(apptFilter==="future")
      return appointments.filter(a=>new Date(a.start_at)>=now).reverse();
    return appointments.filter(a=>new Date(a.start_at)<now);
  },[appointments,apptFilter]);

  const docsByType = useMemo(()=>{
    const groups:Record<string,PatientDoc[]>={};
    for(const d of docs){
      const k=(d.doc_type as string)??"altro";
      if(!groups[k]) groups[k]=[];
      groups[k].push(d);
    }
    return groups;
  },[docs]);

  const orderedDocTypes:string[]=[
    "rx","rmn","tac","ecografia","elettromiografia","prescrizione",
    "gdpr_informativa_privacy","consenso_trattamento","altro",
  ];

  /* ── Loading / not found ───────────────── */
  if(loading) return(
    <div style={{minHeight:"100vh",background:THEME.appBg,display:"flex",
      alignItems:"center",justifyContent:"center",
      fontFamily:"Inter,-apple-system,sans-serif",color:THEME.muted,fontSize:14}}>
      Caricamento…
    </div>
  );
  if(!patient) return(
    <div style={{minHeight:"100vh",background:THEME.appBg,padding:20,
      fontFamily:"Inter,-apple-system,sans-serif"}}>
      <div style={{color:THEME.red,fontWeight:600,marginBottom:16}}>Paziente non trovato</div>
      <Link href="/mobile/patients" style={{color:THEME.blue,fontWeight:600}}>← Torna ai pazienti</Link>
    </div>
  );

  const waPhone = patient.phone ? formatPhoneForWA(patient.phone) : null;
  const age     = calcAge(patient.birth_date);
  const prescribed = patient.prescribed_sessions ?? 0;
  const progressPct= prescribed>0 ? Math.min(100, Math.round(apptStats.done/prescribed*100)) : 0;

  /* ─── RENDER ─────────────────────────────────────────────────────── */
  return (
    <div style={{minHeight:"100vh",background:THEME.appBg,
      paddingBottom:BOTTOM_TAB_H+16,fontFamily:"Inter,-apple-system,sans-serif"}}>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position:"sticky",top:0,zIndex:30,
        background:THEME.gradient,padding:"0 14px",height:54,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        boxShadow:"0 2px 12px rgba(13,148,136,0.18)",gap:10,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <Link href="/mobile/patients" style={{
            width:30,height:30,borderRadius:7,display:"flex",alignItems:"center",
            justifyContent:"center",background:"rgba(255,255,255,0.2)",
            border:"1.5px solid rgba(255,255,255,0.3)",color:"#fff",
            textDecoration:"none",fontSize:16,fontWeight:700,
          }}>‹</Link>
          <div>
            <div style={{fontWeight:800,fontSize:14,color:"#fff",lineHeight:1}}>
              {patient.last_name} {patient.first_name}
            </div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.75)",marginTop:2}}>
              {patient.phone||"Nessun telefono"}
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {patient.phone&&(
            <a href={`tel:${patient.phone}`} style={{
              width:30,height:30,borderRadius:7,background:"rgba(255,255,255,0.2)",
              border:"1.5px solid rgba(255,255,255,0.3)",display:"flex",
              alignItems:"center",justifyContent:"center",textDecoration:"none",fontSize:15,
            }}>📞</a>
          )}
          {waPhone&&(
            <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" style={{
              width:30,height:30,borderRadius:7,background:"rgba(255,255,255,0.2)",
              border:"1.5px solid rgba(255,255,255,0.3)",display:"flex",
              alignItems:"center",justifyContent:"center",textDecoration:"none",fontSize:15,
            }}>💬</a>
          )}
          <div ref={userMenuRef} style={{position:"relative"}}>
            <button onClick={()=>setUserMenuOpen(v=>!v)} style={{
              width:30,height:30,borderRadius:7,border:"1.5px solid rgba(255,255,255,0.35)",
              background:"rgba(255,255,255,0.2)",color:"#fff",fontWeight:800,fontSize:11,
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            }}>{userInitials}</button>
            {userMenuOpen&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:190,
                background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                borderRadius:12,boxShadow:"0 12px 32px rgba(30,64,175,0.15)",overflow:"hidden",zIndex:60}}>
                <Link href="/settings" onClick={()=>setUserMenuOpen(false)} style={{
                  display:"flex",alignItems:"center",gap:8,padding:"12px 16px",
                  color:THEME.text,textDecoration:"none",fontSize:13,fontWeight:600,
                  borderBottom:`1.5px solid ${THEME.border}`,
                }}>⚙️ Impostazioni</Link>
                <button onClick={handleLogout} style={{
                  width:"100%",display:"flex",alignItems:"center",gap:8,
                  padding:"12px 16px",background:"transparent",border:"none",
                  cursor:"pointer",color:THEME.red,fontWeight:600,fontSize:13,
                }}>⏻ Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ━━━ TAB BAR BOTTOM ━━━ */}
      <nav style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:30,
        background:THEME.panelBg,borderTop:`1.5px solid ${THEME.border}`,
        display:"flex",boxShadow:"0 -4px 16px rgba(15,23,42,0.08)",
        paddingBottom:"env(safe-area-inset-bottom,0px)",
      }}>
        {[
          {href:"/mobile",          label:"Home",      icon:"⌂"},
          {href:"/mobile/calendar", label:"Calendario",icon:"▦"},
          {href:"/mobile/patients", label:"Pazienti",  icon:"◉",active:true},
          {href:"/mobile/reports",  label:"Report",    icon:"◈"},
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

      {/* ━━━ HERO ━━━ */}
      <div style={{
        background:THEME.panelBg,borderBottom:`1.5px solid ${THEME.border}`,padding:"14px 16px",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
          {/* Avatar */}
          <div style={{
            width:56,height:56,borderRadius:16,flexShrink:0,
            background:THEME.gradient,display:"flex",alignItems:"center",
            justifyContent:"center",color:"#fff",fontWeight:800,fontSize:20,
          }}>{initials(patient)}</div>

          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:17,color:THEME.text}}>
              {patient.last_name} {patient.first_name}
            </div>
            {/* Età + piano */}
            <div style={{fontSize:12,color:THEME.muted,marginTop:3,display:"flex",gap:10,flexWrap:"wrap"}}>
              <span>🎂 {ddmmyyyy(patient.birth_date)}{age!==null?` · ${age} anni`:""}</span>
              <span>💳 {patient.preferred_plan==="invoice"?"Fattura":"No fattura"}</span>
            </div>
            {/* Chips sedute + incasso */}
            <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
              <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,
                background:"rgba(37,99,235,0.08)",color:THEME.blue,border:`1px solid rgba(37,99,235,0.2)`}}>
                {apptStats.done}{prescribed>0?`/${prescribed}`:""} sedute
              </span>
              {apptStats.unpaid>0&&(
                <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,
                  background:"rgba(249,115,22,0.08)",color:THEME.amber,border:`1px solid rgba(249,115,22,0.2)`}}>
                  💸 €{apptStats.unpaidRevenue.toFixed(0)} da incassare
                </span>
              )}
              {apptStats.paidRevenue>0&&(
                <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,
                  background:"rgba(22,163,74,0.08)",color:THEME.green,border:`1px solid rgba(22,163,74,0.2)`}}>
                  💰 €{apptStats.paidRevenue.toFixed(0)} incassati
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Barra progresso sedute */}
        {prescribed>0&&(
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",
              fontSize:11,fontWeight:600,color:THEME.muted,marginBottom:5}}>
              <span>Progresso ciclo</span>
              <span>{apptStats.done}/{prescribed} ({progressPct}%)</span>
            </div>
            <div style={{height:8,borderRadius:99,background:THEME.appBg,
              border:`1px solid ${THEME.border}`,overflow:"hidden"}}>
              <div style={{
                height:"100%",borderRadius:99,
                width:`${progressPct}%`,
                background: progressPct>=100?THEME.green:THEME.gradient,
                transition:"width 0.4s ease",
              }}/>
            </div>
          </div>
        )}

        {/* Bottone Prenota */}
        <Link href={`/mobile/calendar?action=new&patient_id=${patient.id}`} style={{
          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          padding:"10px 16px",borderRadius:12,
          background:THEME.gradient,color:"#fff",
          textDecoration:"none",fontWeight:700,fontSize:13,
          boxShadow:"0 2px 10px rgba(13,148,136,0.3)",
        }}>
          📅 Prenota nuova seduta
        </Link>
      </div>

      {/* ━━━ TABS ━━━ */}
      <div style={{
        display:"flex",overflowX:"auto",
        background:THEME.panelBg,borderBottom:`1.5px solid ${THEME.border}`,
        padding:"0 12px",position:"sticky",top:54,zIndex:20,
      }}>
        {([
          {id:"info",      label:"Info",    icon:"👤"},
          {id:"clinical",  label:"Clinica", icon:"🩺"},
          {id:"therapies", label:"Sedute",  icon:"📋"},
          {id:"docs",      label:"Referti", icon:"📁"},
        ] as {id:"info"|"clinical"|"therapies"|"docs"; label:string; icon:string}[]).map(tab=>(
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
            padding:"11px 14px",background:"none",border:"none",
            borderBottom:`2.5px solid ${activeTab===tab.id?THEME.blue:"transparent"}`,
            color:activeTab===tab.id?THEME.blue:THEME.muted,
            fontWeight:activeTab===tab.id?700:600,fontSize:13,
            whiteSpace:"nowrap",cursor:"pointer",
            fontFamily:"Inter,-apple-system,sans-serif",
            display:"flex",alignItems:"center",gap:5,
          }}>
            <span style={{fontSize:14}}>{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* ━━━ CONTENUTO ━━━ */}
      <div style={{padding:"14px 14px 0"}}>
        {error&&<ErrBox msg={error}/>}

        {/* ─── TAB INFO ─── */}
        {activeTab==="info"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{
              background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
              borderRadius:14,padding:16,boxShadow:"0 1px 4px rgba(15,23,42,0.06)",
            }}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:16}}>
                <span style={{fontSize:13,fontWeight:700,color:THEME.text}}>Anagrafica</span>
                <button onClick={editMode?savePatient:()=>setEditMode(true)}
                  disabled={saving} style={{
                    padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:700,
                    border:"none",cursor:saving?"not-allowed":"pointer",
                    background:editMode?THEME.green:THEME.blue,
                    color:"#fff",opacity:saving?0.6:1,
                  }}>
                  {saving?"Salvo…":editMode?"✓ Salva":"Modifica"}
                </button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <FG label="Nome">
                  <input value={firstName} onChange={e=>setFirstName(e.target.value)}
                    disabled={!editMode} style={inputS(!editMode)}/>
                </FG>
                <FG label="Cognome">
                  <input value={lastName} onChange={e=>setLastName(e.target.value)}
                    disabled={!editMode} style={inputS(!editMode)}/>
                </FG>
                <FG label="Telefono">
                  <input value={phone} onChange={e=>setPhone(e.target.value)}
                    disabled={!editMode} style={inputS(!editMode)} placeholder="+39 …"/>
                </FG>
                <FG label={`Data di nascita${age!==null?` · ${age} anni`:""}`}>
                  <div style={{...inputS(true),display:"flex",alignItems:"center"}}>
                    {ddmmyyyy(patient.birth_date)}
                  </div>
                </FG>
                <FG label="Sedute prescritte">
                  <input value={prescribedSessions}
                    onChange={e=>setPrescribedSessions(e.target.value)}
                    disabled={!editMode} style={inputS(!editMode)}
                    placeholder="Es. 12" inputMode="numeric"/>
                </FG>
                <FG label="Fatturazione">
                  <select value={preferredPlan}
                    onChange={e=>setPreferredPlan(e.target.value as Plan)}
                    disabled={!editMode} style={inputS(!editMode)}>
                    <option value="invoice">Fattura</option>
                    <option value="no_invoice">Non fattura</option>
                  </select>
                </FG>
              </div>
              {editMode&&(
                <div style={{marginTop:14}}>
                  <Btn v="ghost" onClick={()=>setEditMode(false)}>Annulla</Btn>
                </div>
              )}
            </div>
            <Btn v="danger" onClick={deletePatient}>🗑 Elimina paziente</Btn>
          </div>
        )}

        {/* ─── TAB CLINICA ─── */}
        {activeTab==="clinical"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{
              background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
              borderRadius:14,padding:16,boxShadow:"0 1px 4px rgba(15,23,42,0.06)",
            }}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:16}}>
                <span style={{fontSize:13,fontWeight:700,color:THEME.text}}>Dati clinici</span>
                <button onClick={clinicalEdit?saveClinical:()=>setClinicalEdit(true)}
                  disabled={savingClin} style={{
                    padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:700,
                    border:"none",cursor:savingClin?"not-allowed":"pointer",
                    background:clinicalEdit?THEME.green:THEME.blue,
                    color:"#fff",opacity:savingClin?0.6:1,
                  }}>
                  {savingClin?"Salvo…":clinicalEdit?"✓ Salva":"Modifica"}
                </button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <FG label="Anamnesi">
                  <textarea value={anamnesis} onChange={e=>setAnamnesis(e.target.value)}
                    disabled={!clinicalEdit} rows={4} placeholder="Inserisci anamnesi…"
                    style={{...inputS(!clinicalEdit),resize:"vertical",minHeight:90}}/>
                </FG>
                <FG label="Diagnosi">
                  <textarea value={diagnosis} onChange={e=>setDiagnosis(e.target.value)}
                    disabled={!clinicalEdit} rows={4} placeholder="Inserisci diagnosi…"
                    style={{...inputS(!clinicalEdit),resize:"vertical",minHeight:90}}/>
                </FG>
                <FG label="Trattamento">
                  <textarea value={treatment} onChange={e=>setTreatment(e.target.value)}
                    disabled={!clinicalEdit} rows={4} placeholder="Inserisci trattamento…"
                    style={{...inputS(!clinicalEdit),resize:"vertical",minHeight:90}}/>
                </FG>
              </div>
              {clinicalEdit&&(
                <div style={{marginTop:14}}>
                  <Btn v="ghost" onClick={()=>setClinicalEdit(false)}>Annulla</Btn>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB SEDUTE ─── */}
        {activeTab==="therapies"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* Riepilogo economico */}
            <div style={{
              background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
              borderRadius:14,padding:"14px 16px",
              display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,
              boxShadow:"0 1px 4px rgba(15,23,42,0.06)",
            }}>
              {[
                {label:"Totale sedute", value:String(apptStats.total),      color:THEME.blue},
                {label:"Incassato",     value:`€${apptStats.paidRevenue.toFixed(0)}`,   color:THEME.green},
                {label:"Da incassare",  value:`€${apptStats.unpaidRevenue.toFixed(0)}`, color:apptStats.unpaid>0?THEME.amber:THEME.muted},
              ].map(s=>(
                <div key={s.label} style={{textAlign:"center"}}>
                  <div style={{fontSize:16,fontWeight:800,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:10,fontWeight:600,color:THEME.muted,marginTop:2}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Barra progresso sedute */}
            {prescribed>0&&(
              <div style={{
                background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
                borderRadius:14,padding:"14px 16px",
                boxShadow:"0 1px 4px rgba(15,23,42,0.06)",
              }}>
                <div style={{display:"flex",justifyContent:"space-between",
                  fontSize:12,fontWeight:700,color:THEME.text,marginBottom:8}}>
                  <span>Ciclo di trattamento</span>
                  <span style={{color:progressPct>=100?THEME.green:THEME.blue}}>
                    {apptStats.done}/{prescribed} sedute
                  </span>
                </div>
                <div style={{height:10,borderRadius:99,background:THEME.appBg,
                  border:`1px solid ${THEME.border}`,overflow:"hidden"}}>
                  <div style={{
                    height:"100%",borderRadius:99,width:`${progressPct}%`,
                    background:progressPct>=100?THEME.green:THEME.gradient,
                    transition:"width 0.4s ease",
                  }}/>
                </div>
                {progressPct>=100&&(
                  <div style={{marginTop:8,fontSize:11,fontWeight:700,color:THEME.green,textAlign:"center"}}>
                    ✅ Ciclo completato!
                  </div>
                )}
              </div>
            )}

            {/* Lista sedute con filtro */}
            <div style={{
              background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
              borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(15,23,42,0.06)",
            }}>
              {/* Header con filtro */}
              <div style={{padding:"12px 16px",borderBottom:`1.5px solid ${THEME.border}`,
                display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                {/* Toggle prossime/passate */}
                <div style={{display:"flex",borderRadius:9,overflow:"hidden",
                  border:`1.5px solid ${THEME.border}`,flexShrink:0}}>
                  {(["future","past"] as const).map(f=>(
                    <button key={f} onClick={()=>setApptFilter(f)} style={{
                      padding:"5px 12px",fontSize:11,fontWeight:700,border:"none",
                      cursor:"pointer",fontFamily:"Inter,-apple-system,sans-serif",
                      background:apptFilter===f?THEME.blue:THEME.panelSoft,
                      color:apptFilter===f?"#fff":THEME.muted,
                    }}>
                      {f==="future"?"Prossime":"Storico"}
                    </button>
                  ))}
                </div>
                <span style={{fontSize:12,color:THEME.muted,fontWeight:600}}>
                  {filteredAppts.length} sedute
                </span>
              </div>

              {filteredAppts.length===0?(
                <div style={{padding:24,textAlign:"center",color:THEME.muted,fontSize:13}}>
                  {apptFilter==="future"?"Nessuna seduta futura":"Nessuna seduta nello storico"}
                </div>
              ):(
                <div>
                  {filteredAppts.map((appt,i)=>{
                    const col=statusColor(appt.status);
                    return(
                      <div key={appt.id} style={{
                        padding:"12px 16px",
                        borderBottom:i<filteredAppts.length-1?`1px solid ${THEME.border}`:"none",
                      }}>
                        <div style={{display:"flex",justifyContent:"space-between",
                          alignItems:"center",marginBottom:8}}>
                          <span style={{fontSize:13,fontWeight:700,color:THEME.text}}>
                            {formatDateIT(appt.start_at)}
                          </span>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            {appt.amount!=null&&appt.amount>0&&(
                              <span style={{fontSize:11,fontWeight:700,color:THEME.muted}}>
                                €{appt.amount}
                              </span>
                            )}
                            <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:99,
                              background:`${col}18`,color:col,border:`1px solid ${col}30`}}>
                              {statusLabel(appt.status)}
                            </span>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                          <select value={appt.status}
                            onChange={e=>updateAppointmentStatus(appt.id,e.target.value as Status)}
                            style={{...inputS(),padding:"7px 10px",fontSize:12,flex:1}}>
                            <option value="booked">Prenotata</option>
                            <option value="confirmed">Confermata</option>
                            <option value="done">Eseguita</option>
                          </select>
                          {appt.status==="done"&&(
                            <button onClick={()=>togglePaid(appt.id,!appt.is_paid)} style={{
                              padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:700,
                              cursor:"pointer",flexShrink:0,border:"none",
                              background:appt.is_paid?"rgba(22,163,74,0.10)":THEME.panelSoft,
                              color:appt.is_paid?THEME.green:THEME.muted,
                              outline:`1.5px solid ${appt.is_paid?"rgba(22,163,74,0.4)":THEME.border}`,
                            }}>
                              {appt.is_paid?"💰 Pagata":"○ Non pagata"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB REFERTI ─── */}
        {activeTab==="docs"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* Upload */}
            <div style={{
              background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
              borderRadius:14,padding:16,boxShadow:"0 1px 4px rgba(15,23,42,0.06)",
            }}>
              <div style={{fontWeight:700,fontSize:13,color:THEME.text,marginBottom:4}}>
                Carica referti
              </div>
              {docTypeHint(docType)&&(
                <div style={{fontSize:11,color:THEME.muted,marginBottom:12}}>{docTypeHint(docType)}</div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <FG label="Tipo documento">
                  <select value={docType} onChange={e=>setDocType(e.target.value as DocType)} style={inputS()}>
                    <option value="rx">Rx</option>
                    <option value="rmn">RMN</option>
                    <option value="tac">TAC</option>
                    <option value="ecografia">Ecografia</option>
                    <option value="elettromiografia">Elettromiografia</option>
                    <option value="prescrizione">Prescrizione</option>
                    <option value="altro">Altro</option>
                    <option value="gdpr_informativa_privacy">GDPR Privacy (legacy)</option>
                    <option value="consenso_trattamento">Consenso trattamento (legacy)</option>
                  </select>
                </FG>
                <input type="file" accept=".pdf,image/*" multiple onChange={onPickFiles} style={inputS()}/>
                {files.length>0&&(
                  <div style={{padding:"10px 12px",borderRadius:10,fontSize:12,
                    background:THEME.panelSoft,border:`1.5px solid ${THEME.border}`,color:THEME.muted}}>
                    <span style={{fontWeight:700,color:THEME.text}}>{files.length} file selezionati</span>
                    <div style={{marginTop:4,display:"flex",flexDirection:"column",gap:2}}>
                      {files.slice(0,5).map(f=><span key={f.name}>• {f.name}</span>)}
                      {files.length>5&&<span>…e altri {files.length-5}</span>}
                    </div>
                  </div>
                )}
                <Btn v="primary" onClick={uploadDocuments} disabled={uploading||files.length===0}>
                  {uploading
                    ?`Caricamento ${uploadProgress.done}/${uploadProgress.total}${uploadProgress.current?` • ${uploadProgress.current}`:""}`
                    :"⬆ Carica"}
                </Btn>
              </div>
            </div>

            {/* Lista documenti */}
            <div style={{
              background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
              borderRadius:14,overflow:"hidden",boxShadow:"0 1px 4px rgba(15,23,42,0.06)",
            }}>
              <div style={{padding:"14px 16px",borderBottom:`1.5px solid ${THEME.border}`,
                fontWeight:700,fontSize:13,color:THEME.text}}>
                Documenti ({docs.length})
              </div>
              {docs.length===0?(
                <div style={{padding:24,textAlign:"center",color:THEME.muted,fontSize:13}}>
                  Nessun documento caricato
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column"}}>
                  {orderedDocTypes
                    .filter(t=>(docsByType[t]?.length??0)>0)
                    .concat(Object.keys(docsByType).filter(t=>!orderedDocTypes.includes(t)))
                    .map(t=>(
                      <div key={t}>
                        <div style={{padding:"10px 16px",background:THEME.panelSoft,
                          borderBottom:`1px solid ${THEME.border}`,
                          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:12,fontWeight:800,color:THEME.muted,
                            textTransform:"uppercase",letterSpacing:"0.06em"}}>
                            {docTypeLabel(t)}
                          </span>
                          <span style={{fontSize:11,color:THEME.muted}}>{docsByType[t].length} file</span>
                        </div>
                        {docsByType[t].map((doc,i)=>(
                          <div key={doc.id} style={{
                            padding:"12px 16px",
                            borderBottom:i<docsByType[t].length-1?`1px solid ${THEME.border}`:"none",
                            display:"flex",alignItems:"flex-start",gap:12,
                          }}>
                            {/* Anteprima immagine (solo per immagini) */}
                            <DocThumbnail doc={doc}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:700,color:THEME.text,marginBottom:3,
                                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                {isImageFile(doc.file_name)?"🖼":"📄"} {doc.file_name}
                              </div>
                              <div style={{fontSize:11,color:THEME.muted,marginBottom:10}}>
                                {doc.uploaded_at?formatDateTimeIT(doc.uploaded_at):"—"}
                              </div>
                              <div style={{display:"flex",gap:8}}>
                                <Btn v="ghost" full={false} onClick={()=>openDocument(doc)}>
                                  🔗 Apri
                                </Btn>
                                <Btn v="danger" full={false} onClick={()=>deleteDocument(doc)}>
                                  🗑
                                </Btn>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
