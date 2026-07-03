"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudioId } from "@/src/contexts/StudioContext";
import { usePrivacyMode, useDisplayPatientPhone, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import { showToast } from "@/src/components/mobile/ToastProvider";

const THEME = {
  appBg:"#f1f5f9", panelBg:"#ffffff", text:"#0f172a", muted:"#334155",
  border:"#cbd5e1", teal:"#0d9488", blue:"#2563eb", green:"#16a34a",
  red:"#dc2626", amber:"#f97316", gray:"#94a3b8", purple:"#7c3aed",
  gradient:"linear-gradient(135deg,#0d9488,#2563eb)",
};

type NoleggioRow = {
  id:string; patient_id:string|null; patient_name:string; patient_phone:string|null;
  device_name:string; start_date:string; end_date:string; price_per_day:number;
  total_amount:number; is_paid:boolean; is_returned:boolean; notes:string|null; created_at:string;
};
type PatientSuggestion = { id:string; first_name:string|null; last_name:string|null; phone:string|null };

const pad2=(n:number)=>String(n).padStart(2,"0");
const toYMD=(d:Date)=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const fromYMD=(s:string)=>{ const[y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); };
const diffDays=(a:string,b:string)=>Math.ceil((fromYMD(b).getTime()-fromYMD(a).getTime())/86400000)+1;
const fmtDate=(s:string)=>fromYMD(s).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"});
function getDaysRemaining(end:string){ const t=new Date(); t.setHours(0,0,0,0); return Math.ceil((fromYMD(end).getTime()-t.getTime())/86400000); }
function alertLevel(dr:number,wd:number):"expired"|"urgent"|"warning"|"ok"{ if(dr<0)return"expired"; if(dr===0)return"urgent"; if(dr<=wd)return"warning"; return"ok"; }

export default function MobileNoleggioPage() {
  const router = useRouter();

  // Studio corrente (multi-tenancy)
  const currentStudioId = useCurrentStudioId();
  const { privacyMode } = usePrivacyMode();
  const displayPhone = useDisplayPatientPhone();
  const { maskName } = usePrivacyDisplay();

  const [noleggios, setNoleggios] = useState<NoleggioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [warningDays, setWarningDays] = useState(3);
  const [defaultPrice, setDefaultPrice] = useState(5);
  const [filter, setFilter] = useState<"active"|"expiring"|"expired"|"all">("active");
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editName,setEditName]=useState("");
  const [editPhone,setEditPhone]=useState("");
  const [editStart,setEditStart]=useState("");
  const [editEnd,setEditEnd]=useState("");
  const [editPricePerDay,setEditPricePerDay]=useState("");
  const [editSaving,setEditSaving]=useState(false);
  const [creatingPatient,setCreatingPatient]=useState<string|null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formQuery, setFormQuery] = useState("");
  const [formPatientId, setFormPatientId] = useState<string|null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formDevice, setFormDevice] = useState("Magnetoterapia");
  const [formStart, setFormStart] = useState(toYMD(new Date()));
  const [formEnd, setFormEnd] = useState(toYMD(new Date(Date.now()+14*86400000)));
  const [formPrice, setFormPrice] = useState("5");
  const [formNotes, setFormNotes] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<PatientSuggestion[]>([]);
  const [showSugg, setShowSugg] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data:cfg } = await supabase.from("noleggio_settings").select("*").maybeSingle();
      if (cfg) { setWarningDays(cfg.warning_days??3); setDefaultPrice(cfg.price_per_day??5); setFormPrice(String(cfg.price_per_day??5)); }
      const { data } = await supabase.from("noleggios").select("*").order("end_date",{ascending:true});
      setNoleggios((data||[]) as NoleggioRow[]);
    } catch(e:any){ setError(e?.message||"Errore"); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);

  // Patient search
  useEffect(()=>{
    const q=formQuery.trim();
    if(q.length<2){ setSuggestions([]); return; }
    const t=setTimeout(async()=>{
      const{data}=await supabase.from("patients").select("id,first_name,last_name,phone").or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%`).limit(5);
      setSuggestions((data||[]) as PatientSuggestion[]);
      setShowSugg(true);
    },220);
    return()=>clearTimeout(t);
  },[formQuery]);

  function selectPatient(p:PatientSuggestion){
    setFormPatientId(p.id);
    const n=`${p.last_name||""} ${p.first_name||""}`.trim();
    setFormName(n); setFormQuery(n); setFormPhone(p.phone||"");
    setSuggestions([]); setShowSugg(false);
  }

  const formDays=useMemo(()=>{ try{ return Math.max(diffDays(formStart,formEnd),0); }catch{ return 0; } },[formStart,formEnd]);
  const formTotal=useMemo(()=>Math.round(formDays*(parseFloat(formPrice)||0)*100)/100,[formDays,formPrice]);

  async function save(){
    const name=(formName||formQuery).trim();
    if(!name){ setError("Inserisci nome paziente."); return; }
    if(fromYMD(formEnd)<fromYMD(formStart)){ setError("Data fine deve essere dopo data inizio."); return; }
    setFormSaving(true); setError("");
    try{
      await supabase.from("noleggios").insert({ patient_id:formPatientId||null, patient_name:name, patient_phone:formPhone.trim()||null, device_name:formDevice.trim()||"Magnetoterapia", start_date:formStart, end_date:formEnd, price_per_day:parseFloat(formPrice)||defaultPrice, total_amount:formTotal, is_paid:false, is_returned:false, notes:formNotes.trim()||null, studio_id:currentStudioId });
      setSuccess("Noleggio salvato."); setTimeout(()=>setSuccess(""),2500);
      setShowForm(false); setFormQuery(""); setFormPatientId(null); setFormName(""); setFormPhone(""); setFormDevice("Magnetoterapia"); setFormStart(toYMD(new Date())); setFormEnd(toYMD(new Date(Date.now()+14*86400000))); setFormPrice(String(defaultPrice)); setFormNotes("");
      await load();
    }catch(e:any){ setError(e?.message||"Errore"); }
    finally{ setFormSaving(false); }
  }

  async function togglePaid(id:string,cur:boolean){ await supabase.from("noleggios").update({is_paid:!cur}).eq("id",id); setNoleggios(p=>p.map(n=>n.id===id?{...n,is_paid:!cur}:n)); }
  async function toggleReturned(id:string,cur:boolean){ await supabase.from("noleggios").update({is_returned:!cur}).eq("id",id); setNoleggios(p=>p.map(n=>n.id===id?{...n,is_returned:!cur}:n)); }
  async function del(id:string){ if(!confirm("Eliminare?"))return; await supabase.from("noleggios").delete().eq("id",id); setNoleggios(p=>p.filter(n=>n.id!==id)); }
  async function saveEditNoleggio(id:string) {
    if(!editName.trim()){showToast.warning("Il nome non può essere vuoto.");return;}
    if(!editStart||!editEnd){showToast.warning("Date obbligatorie.");return;}
    if(new Date(editEnd)<new Date(editStart)){showToast.warning("La data di fine non può essere prima della data di inizio.");return;}
    const pday = parseFloat(editPricePerDay)||0;
    if(pday<=0){showToast.warning("Prezzo al giorno non valido.");return;}
    const days = Math.max(1, Math.round((new Date(editEnd+"T12:00:00").getTime()-new Date(editStart+"T12:00:00").getTime())/86400000)+1);
    const total = Math.round(days*pday*100)/100;

    setEditSaving(true);
    const {error}=await supabase.from("noleggios").update({
      patient_name:editName.trim(),
      patient_phone:editPhone.trim()||null,
      start_date:editStart,
      end_date:editEnd,
      price_per_day:pday,
      total_amount:total,
    }).eq("id",id);
    setEditSaving(false);
    if(error){showToast.error("Errore: "+error.message);return;}
    setEditingId(null);
    setNoleggios(p=>p.map(n=>n.id===id?{...n,patient_name:editName.trim(),patient_phone:editPhone.trim()||null,start_date:editStart,end_date:editEnd,price_per_day:pday,total_amount:total}:n));
  }
  async function createPatientFromNoleggio(n:NoleggioRow) {
    if(!confirm(`Creare paziente "${n.patient_name}" in anagrafica?`)) return;
    setCreatingPatient(n.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      if (!userId) { showToast.error("Sessione non valida."); return; }
      const parts=n.patient_name.trim().split(/\s+/);
      const {data,error}=await supabase.from("patients").insert({first_name:parts.slice(1).join(" ")||"",last_name:parts[0]||n.patient_name,phone:n.patient_phone||"",owner_id:userId,studio_id:currentStudioId}).select("id").single();
      if(error){showToast.error("Errore: "+error.message);return;}
      await supabase.from("noleggios").update({patient_id:data.id}).eq("id",n.id);
      setNoleggios(p=>p.map(x=>x.id===n.id?{...x,patient_id:data.id}:x));
      showToast.success("Paziente creato e collegato!");
    } finally {setCreatingPatient(null);}
  }

  const filtered=useMemo(()=> noleggios.filter(n=>{
    if(filter==="all")return true;
    const dr=getDaysRemaining(n.end_date);
    if(filter==="active")return!n.is_returned&&dr>=0;
    if(filter==="expiring")return!n.is_returned&&dr>=0&&dr<=warningDays;
    if(filter==="expired")return!n.is_returned&&dr<0;
    return true;
  }),[noleggios,filter,warningDays]);

  const stats=useMemo(()=>({
    active:noleggios.filter(n=>!n.is_returned&&getDaysRemaining(n.end_date)>=0).length,
    expiring:noleggios.filter(n=>!n.is_returned&&getDaysRemaining(n.end_date)>=0&&getDaysRemaining(n.end_date)<=warningDays).length,
    expired:noleggios.filter(n=>!n.is_returned&&getDaysRemaining(n.end_date)<0).length,
  }),[noleggios,warningDays]);

  const inp:React.CSSProperties={width:"100%",padding:"12px 14px",borderRadius:10,border:`1.5px solid ${THEME.border}`,fontSize:15,background:"#fff",color:THEME.text,outline:"none",boxSizing:"border-box"};

  return (
    <div style={{minHeight:"100vh",background:THEME.appBg,fontFamily:"'Outfit','Segoe UI',system-ui,sans-serif",paddingBottom:80}}>
      <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}body{margin:0;}a{text-decoration:none;}input:focus,select:focus,textarea:focus{border-color:${THEME.teal}!important;outline:none!important;}`}</style>

      {/* Header */}
      <header style={{background:THEME.gradient,padding:"0 18px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20,boxShadow:"0 2px 12px rgba(13,148,136,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>router.back()} style={{background:"rgba(255,255,255,0.2)",border:"1.5px solid rgba(255,255,255,0.3)",borderRadius:8,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",padding:"5px 11px"}}>←</button>
          <span style={{fontWeight:800,fontSize:16,color:"#fff"}}>🔌 Noleggio</span>
        </div>
        <button onClick={()=>setShowForm(v=>!v)} style={{background:"rgba(255,255,255,0.2)",border:"1.5px solid rgba(255,255,255,0.35)",borderRadius:8,color:"#fff",fontWeight:800,fontSize:20,cursor:"pointer",width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center"}}>
          {showForm?"✕":"+"}
        </button>
      </header>

      <div style={{padding:"14px 16px"}}>
        {error&&<div style={{marginBottom:10,padding:"10px 14px",borderRadius:10,background:"rgba(220,38,38,0.06)",border:"1px solid rgba(220,38,38,0.2)",color:THEME.red,fontWeight:600,fontSize:13}}>{error}</div>}
        {success&&<div style={{marginBottom:10,padding:"10px 14px",borderRadius:10,background:"rgba(22,163,74,0.06)",border:"1px solid rgba(22,163,74,0.2)",color:THEME.green,fontWeight:600,fontSize:13}}>{success}</div>}

        {/* KPI */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          {[{l:"Attivi",v:stats.active,c:THEME.teal},{l:`Scadono ≤${warningDays}gg`,v:stats.expiring,c:THEME.amber},{l:"Scaduti",v:stats.expired,c:THEME.red}].map(k=>(
            <div key={k.l} style={{background:"#fff",borderRadius:10,padding:"10px 12px",border:`1px solid ${k.c}22`,textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:800,color:k.c}}>{k.v}</div>
              <div style={{fontSize:10,color:THEME.muted,fontWeight:600,marginTop:2}}>{k.l}</div>
            </div>
          ))}
        </div>

        {/* Form nuovo noleggio */}
        {showForm&&(
          <div style={{background:"#fff",borderRadius:14,border:`2px solid ${THEME.teal}`,padding:"16px",marginBottom:14}}>
            <div style={{fontWeight:800,fontSize:15,color:THEME.text,marginBottom:14}}>Nuovo noleggio</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Paziente */}
              <div style={{position:"relative"}}>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:THEME.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:0.4}}>Paziente *</label>
                <input value={formQuery} onChange={e=>{setFormQuery(e.target.value);setFormPatientId(null);setFormName(e.target.value);}} placeholder="Cerca paziente o scrivi nome..." style={inp} onFocus={()=>formQuery.length>=2&&setShowSugg(true)} onBlur={()=>setTimeout(()=>setShowSugg(false),200)}/>
                {showSugg&&suggestions.length>0&&(
                  <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:`1px solid ${THEME.border}`,borderRadius:10,boxShadow:"0 8px 24px rgba(15,23,42,0.12)",zIndex:50,overflow:"hidden"}}>
                    {suggestions.map(p=>(
                      <div key={p.id} onMouseDown={()=>selectPatient(p)} style={{padding:"12px 14px",cursor:"pointer",borderBottom:`1px solid ${THEME.border}`,fontSize:14}}>
                        <strong>{p.last_name} {p.first_name}</strong>{p.phone&&<span style={{color:THEME.muted}}> · {p.phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {formPatientId&&<div style={{fontSize:11,color:THEME.green,marginTop:3,fontWeight:600}}>✓ Collegato alla scheda paziente</div>}
              </div>
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:THEME.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:0.4}}>Telefono</label>
                <input value={formPhone} onChange={e=>setFormPhone(e.target.value)} placeholder="Opzionale" style={inp} type="tel"/>
              </div>
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:THEME.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:0.4}}>Dispositivo</label>
                <input value={formDevice} onChange={e=>setFormDevice(e.target.value)} placeholder="Magnetoterapia" style={inp}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:THEME.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:0.4}}>Data inizio</label>
                  <input type="date" value={formStart} onChange={e=>setFormStart(e.target.value)} style={inp}/>
                </div>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:THEME.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:0.4}}>Data fine</label>
                  <input type="date" value={formEnd} onChange={e=>setFormEnd(e.target.value)} style={inp}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:THEME.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:0.4}}>€/giorno</label>
                  <input type="number" value={formPrice} onChange={e=>setFormPrice(e.target.value)} min={0} step={0.5} style={inp}/>
                </div>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:THEME.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:0.4}}>Totale</label>
                  <div style={{padding:"12px 14px",borderRadius:10,border:`2px solid ${THEME.teal}`,background:"rgba(13,148,136,0.04)",fontSize:16,fontWeight:800,color:THEME.teal}}>
                    €{formTotal.toFixed(2)} <span style={{fontSize:10,color:THEME.muted,fontWeight:500}}>({formDays}gg)</span>
                  </div>
                </div>
              </div>
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:THEME.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:0.4}}>Note</label>
                <textarea value={formNotes} onChange={e=>setFormNotes(e.target.value)} rows={2} placeholder="Opzionali..." style={{...inp,resize:"vertical"}}/>
              </div>
              <button onClick={save} disabled={formSaving} style={{padding:"14px",borderRadius:12,border:"none",background:THEME.gradient,color:"#fff",fontWeight:800,fontSize:15,cursor:formSaving?"wait":"pointer",opacity:formSaving?0.7:1}}>
                {formSaving?"Salvataggio…":"Salva noleggio"}
              </button>
            </div>
          </div>
        )}

        {/* Filtri */}
        <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
          {([{v:"active",l:"Attivi"},{v:"expiring",l:`Scadenza (${stats.expiring})`},{v:"expired",l:`Scaduti (${stats.expired})`},{v:"all",l:"Tutti"}] as const).map(f=>(
            <button key={f.v} onClick={()=>setFilter(f.v)} style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${filter===f.v?THEME.teal:THEME.border}`,background:filter===f.v?THEME.teal:"#fff",color:filter===f.v?"#fff":THEME.muted,cursor:"pointer",fontWeight:700,fontSize:12,whiteSpace:"nowrap",flexShrink:0}}>
              {f.l}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{textAlign:"center",padding:"40px 0",color:THEME.muted}}>Caricamento…</div>
        ) : filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"40px 0",color:THEME.muted,fontStyle:"italic"}}>Nessun noleggio in questa categoria</div>
        ) : filtered.map(n=>{
          const dr=getDaysRemaining(n.end_date);
          const al=alertLevel(dr,warningDays);
          const ac={expired:{bg:"rgba(220,38,38,0.05)",border:"rgba(220,38,38,0.25)",col:THEME.red,icon:"⛔",text:`Scaduto ${Math.abs(dr)}gg fa`},urgent:{bg:"rgba(220,38,38,0.05)",border:"rgba(220,38,38,0.35)",col:THEME.red,icon:"🚨",text:"Scade oggi!"},warning:{bg:"rgba(249,115,22,0.04)",border:"rgba(249,115,22,0.3)",col:THEME.amber,icon:"⏳",text:`${dr} giorni`},ok:{bg:"#fff",border:THEME.border,col:THEME.green,icon:"✓",text:`${dr} giorni`}}[al];
          return (
            <div key={n.id} style={{background:n.is_returned?"#f8fafc":ac.bg,borderRadius:14,border:`1.5px solid ${n.is_returned?THEME.border:ac.border}`,padding:"14px 16px",marginBottom:10,opacity:n.is_returned?0.65:1}}>
              {/* Header */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <span style={{fontSize:18,flexShrink:0}}>{n.is_returned?"📦":ac.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  {editingId===n.id ? (
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <input value={editName} onChange={e=>setEditName(e.target.value)}
                        placeholder="Cognome Nome" autoFocus
                        style={{padding:"7px 10px",borderRadius:7,border:`1.5px solid ${THEME.teal}`,fontSize:14,fontWeight:700,outline:"none",width:"100%",boxSizing:"border-box" as const,color:"#0f172a",background:"#fff"}}/>
                      <input value={editPhone} onChange={e=>setEditPhone(e.target.value)}
                        placeholder="Telefono" type="tel"
                        style={{padding:"7px 10px",borderRadius:7,border:`1.5px solid ${THEME.border}`,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const,color:"#0f172a",background:"#fff"}}/>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                        <div>
                          <label style={{fontSize:10,fontWeight:700,color:THEME.muted,textTransform:"uppercase"}}>Inizio</label>
                          <input type="date" value={editStart} onChange={e=>setEditStart(e.target.value)}
                            style={{padding:"7px 10px",borderRadius:7,border:`1.5px solid ${THEME.border}`,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const,color:"#0f172a",background:"#fff"}}/>
                        </div>
                        <div>
                          <label style={{fontSize:10,fontWeight:700,color:THEME.muted,textTransform:"uppercase"}}>Fine</label>
                          <input type="date" value={editEnd} onChange={e=>setEditEnd(e.target.value)}
                            style={{padding:"7px 10px",borderRadius:7,border:`1.5px solid ${THEME.border}`,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const,color:"#0f172a",background:"#fff"}}/>
                        </div>
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:THEME.muted,textTransform:"uppercase"}}>Prezzo/giorno €</label>
                        <input type="number" step="0.01" value={editPricePerDay} onChange={e=>setEditPricePerDay(e.target.value)}
                          style={{padding:"7px 10px",borderRadius:7,border:`1.5px solid ${THEME.border}`,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box" as const,color:"#0f172a",background:"#fff"}}/>
                      </div>
                      {editStart && editEnd && editPricePerDay && (() => {
                        const d1 = new Date(editStart + "T12:00:00");
                        const d2 = new Date(editEnd + "T12:00:00");
                        if (d2 < d1) return <div style={{fontSize:11,color:THEME.red,fontWeight:600}}>⚠ Fine prima dell&apos;inizio</div>;
                        const days = Math.max(1, Math.round((d2.getTime()-d1.getTime())/86400000)+1);
                        const pday = parseFloat(editPricePerDay)||0;
                        const total = Math.round(days*pday*100)/100;
                        return <div style={{fontSize:11,color:THEME.teal,fontWeight:600}}>→ {days} giorni · Totale €{total.toFixed(2)}</div>;
                      })()}
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>saveEditNoleggio(n.id)} disabled={editSaving}
                          style={{flex:1,padding:"8px",borderRadius:7,border:"none",background:THEME.teal,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",opacity:editSaving?0.6:1}}>
                          {editSaving?"Salvo…":"✓ Salva"}
                        </button>
                        <button onClick={()=>setEditingId(null)}
                          style={{padding:"8px 12px",borderRadius:7,border:`1px solid ${THEME.border}`,background:"#fff",color:THEME.muted,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{fontWeight:800,fontSize:15,color:THEME.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{privacyMode ? maskName(n.patient_name) : n.patient_name}</div>
                        <button onClick={()=>{
                          setEditingId(n.id);
                          setEditName(n.patient_name);
                          setEditPhone(n.patient_phone||"");
                          setEditStart(n.start_date);
                          setEditEnd(n.end_date);
                          setEditPricePerDay(String(n.price_per_day));
                        }}
                          style={{background:"none",border:"none",cursor:"pointer",color:THEME.muted,fontSize:13,padding:2,flexShrink:0}}>✏️</button>
                      </div>
                      {n.patient_phone
                        ? <div style={{fontSize:12,color:THEME.muted}}>{displayPhone(n.patient_phone)}</div>
                        : <div style={{fontSize:11,color:THEME.amber,fontWeight:600}}>⚠️ Nessun telefono</div>
                      }
                      {!n.patient_id && (
                        <button onClick={()=>createPatientFromNoleggio(n)} disabled={creatingPatient===n.id}
                          style={{marginTop:4,padding:"3px 8px",borderRadius:5,border:`1.5px solid ${THEME.blue}`,background:"rgba(37,99,235,0.06)",color:THEME.blue,fontWeight:700,fontSize:11,cursor:"pointer",opacity:creatingPatient===n.id?0.6:1}}>
                          {creatingPatient===n.id?"Creando…":"👤 Crea in anagrafica"}
                        </button>
                      )}
                      <div style={{fontSize:12,color:THEME.muted}}>{n.device_name}</div>
                    </>
                  )}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:18,fontWeight:800,color:THEME.text}}>€{n.total_amount.toFixed(2)}</div>
                  <div style={{fontSize:10,color:THEME.muted}}>€{n.price_per_day}/gg</div>
                </div>
              </div>
              {/* Date */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,padding:"8px 10px",background:"rgba(0,0,0,0.03)",borderRadius:8}}>
                <div style={{fontSize:12,color:THEME.muted}}>
                  <span style={{fontWeight:700,color:THEME.text}}>{fmtDate(n.start_date)}</span> → <span style={{fontWeight:700,color:THEME.text}}>{fmtDate(n.end_date)}</span>
                  <span style={{marginLeft:8}}>· {diffDays(n.start_date,n.end_date)} giorni</span>
                </div>
                {!n.is_returned&&(
                  <span style={{fontSize:11,fontWeight:800,color:ac.col,background:`${ac.col}18`,padding:"2px 8px",borderRadius:99}}>{al==="ok"?`⏳ ${ac.text}`:ac.text}</span>
                )}
              </div>
              {n.notes&&<div style={{fontSize:12,color:THEME.muted,marginBottom:10,fontStyle:"italic"}}>{n.notes}</div>}
              {/* Azioni */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={()=>togglePaid(n.id,n.is_paid)} style={{padding:"10px",borderRadius:10,border:`1.5px solid ${n.is_paid?THEME.green:THEME.border}`,background:n.is_paid?"rgba(22,163,74,0.08)":"#fff",color:n.is_paid?THEME.green:THEME.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
                  {n.is_paid?"€ Pagato ✓":"Segna pagato"}
                </button>
                <button onClick={()=>toggleReturned(n.id,n.is_returned)} style={{padding:"10px",borderRadius:10,border:`1.5px solid ${n.is_returned?THEME.teal:THEME.border}`,background:n.is_returned?"rgba(13,148,136,0.08)":"#fff",color:n.is_returned?THEME.teal:THEME.muted,cursor:"pointer",fontWeight:700,fontSize:13}}>
                  {n.is_returned?"✓ Reso":"Segna reso"}
                </button>
              </div>
              <button onClick={()=>del(n.id)} style={{marginTop:8,width:"100%",padding:"8px",borderRadius:10,border:"1px solid rgba(220,38,38,0.2)",background:"rgba(220,38,38,0.04)",color:THEME.red,cursor:"pointer",fontWeight:600,fontSize:12}}>
                Elimina
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom nav: ora gestita da MobileTabBar nel layout condiviso */}
    </div>
  );
}
