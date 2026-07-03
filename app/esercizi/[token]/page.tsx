"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════════
// app/esercizi/[token]/page.tsx — Programma esercizi pubblico (paziente)
// ═══════════════════════════════════════════════════════════════════════
// v2: programma con settimana corrente. Se la scheda ha durata e data di
// inizio, la pagina calcola in che settimana si trova il paziente, la
// evidenzia e mostra per ogni esercizio i parametri di QUELLA settimana
// (serie/ripetizioni/carico dalla progressione). Selettore settimane per
// vedere il percorso completo. Le schede legacy (senza programma)
// vengono mostrate come liste semplici, identiche a prima.
// ═══════════════════════════════════════════════════════════════════════

type ProgressStep = { settimana: number; serie: string; ripetizioni: string; carico: string };

type Esercizio = {
  id: string; nome: string; descrizione: string; serie: string;
  ripetizioni: string; frequenza: string; note: string; avvertenze: string;
  youtube_id?: string; youtube_query?: string; categoria?: string; image_url?: string;
  progressione?: ProgressStep[];
};

const FASE_LABEL: Record<string, string> = {
  acuta: "Fase acuta", subacuta: "Fase subacuta", cronica: "Fase di consolidamento",
};

function EsercizioSVG({ categoria }: { categoria?: string }) {
  const cat = (categoria ?? "rinforzo").toLowerCase();
  const colors: Record<string,string> = { stretching:"#0d9488", mobilita:"#2563eb", respirazione:"#7c3aed", equilibrio:"#f97316", rinforzo:"#16a34a" };
  const col = colors[cat] ?? "#16a34a";
  if (cat === "stretching") return (
    <svg viewBox="0 0 60 60" style={{width:48,height:48}}><circle cx="30" cy="10" r="7" fill={col}/><line x1="30" y1="17" x2="30" y2="40" stroke={col} strokeWidth="3.5" strokeLinecap="round"/><line x1="30" y1="27" x2="12" y2="18" stroke={col} strokeWidth="3" strokeLinecap="round"/><line x1="30" y1="27" x2="48" y2="36" stroke={col} strokeWidth="3" strokeLinecap="round"/><line x1="30" y1="40" x2="20" y2="55" stroke={col} strokeWidth="3" strokeLinecap="round"/><line x1="30" y1="40" x2="40" y2="55" stroke={col} strokeWidth="3" strokeLinecap="round"/></svg>
  );
  if (cat === "mobilita") return (
    <svg viewBox="0 0 60 60" style={{width:48,height:48}}><circle cx="30" cy="10" r="7" fill={col}/><path d="M30 17 Q22 28 20 40" stroke={col} strokeWidth="3.5" fill="none" strokeLinecap="round"/><path d="M20 40 Q28 48 30 52" stroke={col} strokeWidth="3" fill="none" strokeLinecap="round"/><path d="M30 52 Q36 46 40 40" stroke={col} strokeWidth="3" fill="none" strokeLinecap="round"/><path d="M30 17 Q38 24 40 40" stroke={col} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.4"/></svg>
  );
  if (cat === "respirazione") return (
    <svg viewBox="0 0 60 60" style={{width:48,height:48}}><circle cx="30" cy="10" r="7" fill={col}/><ellipse cx="30" cy="38" rx="14" ry="16" fill="none" stroke={col} strokeWidth="3"/><ellipse cx="30" cy="38" rx="8" ry="10" fill={col} opacity="0.15"/><path d="M23 30 Q30 25 37 30" stroke={col} strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
  );
  if (cat === "equilibrio") return (
    <svg viewBox="0 0 60 60" style={{width:48,height:48}}><circle cx="30" cy="9" r="7" fill={col}/><line x1="30" y1="16" x2="30" y2="42" stroke={col} strokeWidth="3.5" strokeLinecap="round"/><line x1="30" y1="26" x2="14" y2="32" stroke={col} strokeWidth="3" strokeLinecap="round"/><line x1="30" y1="26" x2="46" y2="22" stroke={col} strokeWidth="3" strokeLinecap="round"/><line x1="30" y1="42" x2="30" y2="56" stroke={col} strokeWidth="3" strokeLinecap="round"/><line x1="14" y1="58" x2="46" y2="58" stroke={col} strokeWidth="2.5" strokeLinecap="round"/></svg>
  );
  return (
    <svg viewBox="0 0 60 60" style={{width:48,height:48}}><circle cx="30" cy="10" r="7" fill={col}/><line x1="30" y1="17" x2="30" y2="42" stroke={col} strokeWidth="3.5" strokeLinecap="round"/><line x1="30" y1="26" x2="14" y2="36" stroke={col} strokeWidth="3" strokeLinecap="round"/><line x1="30" y1="26" x2="46" y2="36" stroke={col} strokeWidth="3" strokeLinecap="round"/><line x1="30" y1="42" x2="20" y2="56" stroke={col} strokeWidth="3" strokeLinecap="round"/><line x1="30" y1="42" x2="40" y2="56" stroke={col} strokeWidth="3" strokeLinecap="round"/><rect x="7" y="32" width="7" height="5" rx="2.5" fill={col} opacity="0.6"/><rect x="46" y="32" width="7" height="5" rx="2.5" fill={col} opacity="0.6"/></svg>
  );
}

const catStyles: Record<string,{bg:string;color:string;label:string}> = {
  stretching:   {bg:"rgba(13,148,136,0.1)",  color:"#0d9488", label:"Stretching"},
  rinforzo:     {bg:"rgba(22,163,74,0.1)",   color:"#16a34a", label:"Rinforzo"},
  mobilita:     {bg:"rgba(37,99,235,0.1)",   color:"#2563eb", label:"Mobilità"},
  respirazione: {bg:"rgba(124,58,237,0.1)",  color:"#7c3aed", label:"Respirazione"},
  equilibrio:   {bg:"rgba(249,115,22,0.1)",  color:"#f97316", label:"Equilibrio"},
};
const getCat = (c?: string) => catStyles[(c ?? "rinforzo").toLowerCase()] ?? catStyles.rinforzo;

export default function SchedaEserciziPubblica() {
  const params = useParams();
  const token = params?.token as string;
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [patientName, setPatientName] = useState("");
  const [esercizi,    setEsercizi]    = useState<Esercizio[]>([]);
  const [nota,        setNota]        = useState("");
  const [createdAt,   setCreatedAt]   = useState("");
  const [studio,      setStudio]      = useState<any>(null);
  const [expanded,    setExpanded]    = useState<string|null>(null);
  const [videoOpen,   setVideoOpen]   = useState<string|null>(null);
  const [showProg,    setShowProg]    = useState<string|null>(null);

  // Programma
  const [fase,    setFase]    = useState<string|null>(null);
  const [durata,  setDurata]  = useState<number|null>(null);
  const [startD,  setStartD]  = useState<string|null>(null);
  const [week,    setWeek]    = useState(1);        // settimana visualizzata
  const [curWeek, setCurWeek] = useState<number|null>(null); // settimana reale del paziente

  // Aderenza: insieme di chiavi "exercise_id|YYYY-MM-DD" spuntate
  const [adherence, setAdherence] = useState<Set<string>>(new Set());
  const [savingAdh, setSavingAdh] = useState<string|null>(null); // exercise_id in corso

  useEffect(()=>{
    if(!token) return;
    fetch(`/api/esercizi-pubblici?token=${token}`)
      .then(r=>r.json()).then(d=>{
        if(d.error){setError(d.error);return;}
        setPatientName(d.patient_name); setEsercizi(d.esercizi??[]); setNota(d.note??"");
        setCreatedAt(d.created_at?new Date(d.created_at).toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"}):"");
        setStudio(d.studio || null);
        setFase(d.fase ?? null);
        const adh: { exercise_id: string; done_date: string }[] = d.adherence ?? [];
        setAdherence(new Set(adh.map((a) => `${a.exercise_id}|${a.done_date}`)));
        const dur = d.durata_settimane ?? null;
        setDurata(dur);
        setStartD(d.start_date ?? null);
        if (dur && d.start_date) {
          const days = Math.floor((Date.now() - new Date(d.start_date + "T00:00:00").getTime()) / 86400000);
          const w = Math.min(dur, Math.max(1, Math.floor(days / 7) + 1));
          const realW = days < 0 ? 0 : w;          // 0 = non ancora iniziato
          setCurWeek(realW);
          setWeek(realW === 0 ? 1 : w);
        }
      }).catch(()=>setError("Errore caricamento")).finally(()=>setLoading(false));
  },[token]);

  const isProgram = durata !== null && durata > 1;

  // ── Aderenza ────────────────────────────────────────────────────────
  // Data locale YYYY-MM-DD (fuso del dispositivo del paziente)
  function localDate(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const todayKey = localDate();

  // Ultimi 7 giorni (oggi → 6 giorni fa), dal più vecchio al più recente
  const last7: { date: string; dow: string; dom: number }[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      date: localDate(d),
      dow: d.toLocaleDateString("it-IT", { weekday: "narrow" }),
      dom: d.getDate(),
    };
  });

  const isDone = (exId: string, date: string) => adherence.has(`${exId}|${date}`);
  const doneToday = (exId: string) => isDone(exId, todayKey);

  // Quanti esercizi completati oggi (per il contatore in header)
  const doneTodayCount = esercizi.filter((e) => doneToday(e.id)).length;

  async function toggleDone(exId: string) {
    if (savingAdh) return;
    const key = `${exId}|${todayKey}`;
    const currentlyDone = adherence.has(key);
    const next = !currentlyDone;

    // Ottimistico
    setAdherence((s) => {
      const n = new Set(s);
      if (next) n.add(key); else n.delete(key);
      return n;
    });
    setSavingAdh(exId);

    try {
      const res = await fetch("/api/esercizi-pubblici", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_adherence", token, exercise_id: exId, done: next, date: todayKey }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Rollback in caso di errore
      setAdherence((s) => {
        const n = new Set(s);
        if (next) n.delete(key); else n.add(key);
        return n;
      });
    } finally {
      setSavingAdh(null);
    }
  }

  // Parametri dell'esercizio per la settimana selezionata
  function paramsFor(e: Esercizio): { serie: string; ripetizioni: string; carico: string | null } {
    if (isProgram && Array.isArray(e.progressione)) {
      const s = e.progressione.find(p => p.settimana === week);
      if (s) return { serie: s.serie, ripetizioni: s.ripetizioni, carico: s.carico || null };
    }
    return { serie: e.serie, ripetizioni: e.ripetizioni, carico: null };
  }

  if(loading) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f1f5f9",fontFamily:"system-ui,sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:12}}>⏳</div><div style={{fontSize:16,color:"#334155",fontWeight:600}}>Caricamento scheda…</div></div></div>;
  if(error)   return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f1f5f9",fontFamily:"system-ui,sans-serif"}}><div style={{textAlign:"center",padding:32}}><div style={{fontSize:40,marginBottom:12}}>😕</div><div style={{fontSize:18,color:"#dc2626",fontWeight:700,marginBottom:8}}>{error}</div><div style={{fontSize:14,color:"#64748b"}}>Contatta il tuo fisioterapista per un nuovo link.</div></div></div>;

  return (
    <div style={{minHeight:"100vh",background:"#f1f5f9",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <style>{`*{box-sizing:border-box;}body{margin:0;}@media print{.no-print{display:none!important;}}`}</style>

      {/* Video modal */}
      {videoOpen&&(
        <div onClick={()=>setVideoOpen(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:720,position:"relative"}}>
            <button onClick={()=>setVideoOpen(null)} style={{position:"absolute",top:-44,right:0,background:"none",border:"none",color:"#fff",fontSize:30,cursor:"pointer",fontWeight:700,lineHeight:1}}>✕</button>
            <div style={{position:"relative",paddingBottom:"56.25%",height:0,borderRadius:12,overflow:"hidden"}}>
              <iframe src={`https://www.youtube.com/embed/${videoOpen}?autoplay=1&rel=0`}
                style={{position:"absolute",top:0,left:0,width:"100%",height:"100%"}}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen title="Video esercizio"/>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0d9488,#2563eb)",padding:"24px 20px 28px",textAlign:"center"}}>
        {studio?.logo_base64 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={studio.logo_base64}
            alt="Logo studio"
            style={{display:"block",margin:"0 auto 10px",maxHeight:72,maxWidth:220,objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.15))"}}
          />
        )}
        <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{studio ? [studio.name, studio.signature_name].filter(Boolean).join(" — ") : "Scheda Esercizi"}</div>
        <div style={{fontSize:22,fontWeight:800,color:"#fff",marginBottom:4}}>Programma Esercizi Domiciliari</div>
        <div style={{fontSize:15,color:"rgba(255,255,255,0.9)",fontWeight:600}}>{patientName}</div>
        {fase && FASE_LABEL[fase] && (
          <div style={{display:"inline-block",marginTop:8,fontSize:11.5,fontWeight:800,color:"#fff",background:"rgba(255,255,255,0.18)",border:"1.5px solid rgba(255,255,255,0.35)",padding:"3px 12px",borderRadius:99}}>
            {FASE_LABEL[fase]}
          </div>
        )}
        {createdAt&&<div style={{fontSize:12,color:"rgba(255,255,255,0.65)",marginTop:6}}>Emesso il {createdAt}</div>}
        {esercizi.length > 0 && (
          <div className="no-print" style={{display:"inline-flex",alignItems:"center",gap:8,marginTop:14,background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.3)",borderRadius:99,padding:"6px 16px"}}>
            <span style={{fontSize:16}}>{doneTodayCount===esercizi.length?"🎉":doneTodayCount>0?"💪":"📋"}</span>
            <span style={{fontSize:13,fontWeight:800,color:"#fff"}}>
              {doneTodayCount===esercizi.length ? "Tutto fatto oggi! Bravo!" : `Oggi: ${doneTodayCount}/${esercizi.length} esercizi`}
            </span>
          </div>
        )}
      </div>

      <div style={{maxWidth:680,margin:"0 auto",padding:"0 16px"}}>

        {/* Barra programma: settimana corrente + selettore */}
        {isProgram && (
          <div style={{background:"#fff",borderRadius:"0 0 14px 14px",padding:"16px 18px",marginBottom:14,boxShadow:"0 4px 16px rgba(13,148,136,0.1)"}}>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6}}>
              <div style={{fontSize:15,fontWeight:800,color:"#0f172a"}}>
                {curWeek === 0
                  ? `Il programma inizia il ${startD ? new Date(startD+"T00:00:00").toLocaleDateString("it-IT",{day:"2-digit",month:"long"}) : "—"}`
                  : curWeek !== null && curWeek === week
                    ? `📍 Sei alla settimana ${curWeek} di ${durata}`
                    : `Settimana ${week} di ${durata}`}
              </div>
              {curWeek !== null && curWeek > 0 && week !== curWeek && (
                <button className="no-print" onClick={()=>setWeek(curWeek)} style={{fontSize:11.5,fontWeight:800,color:"#0d9488",background:"rgba(13,148,136,0.08)",border:"1.5px solid rgba(13,148,136,0.3)",borderRadius:99,padding:"3px 11px",cursor:"pointer",fontFamily:"inherit"}}>
                  ↩ Torna a oggi
                </button>
              )}
            </div>

            {/* Barra avanzamento */}
            <div style={{display:"flex",gap:4,marginBottom:12}}>
              {Array.from({length: durata!}, (_,i)=>i+1).map(w=>(
                <div key={w} style={{flex:1,height:6,borderRadius:99,
                  background: curWeek !== null && w < (curWeek||0) ? "#0d9488"
                    : curWeek === w ? "linear-gradient(135deg,#0d9488,#2563eb)"
                    : "#e2e8f0"}}/>
              ))}
            </div>

            {/* Selettore settimane */}
            <div className="no-print" style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Array.from({length: durata!}, (_,i)=>i+1).map(w=>(
                <button key={w} onClick={()=>setWeek(w)}
                  style={{width:34,height:34,borderRadius:9,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",
                    border: week===w ? "none" : `1.5px solid ${curWeek===w ? "#0d9488" : "#e2e8f0"}`,
                    background: week===w ? "linear-gradient(135deg,#0d9488,#2563eb)" : "#fff",
                    color: week===w ? "#fff" : curWeek===w ? "#0d9488" : "#64748b",
                    position:"relative"}}>
                  {w}
                  {curWeek===w && week!==w && <span style={{position:"absolute",top:-3,right:-3,width:8,height:8,borderRadius:"50%",background:"#0d9488"}}/>}
                </button>
              ))}
            </div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:8}}>
              I valori di serie, ripetizioni e carico qui sotto sono quelli della settimana selezionata.
            </div>
          </div>
        )}

        {/* Intro */}
        <div style={{background:"#fff",borderRadius:isProgram?14:"0 0 14px 14px",padding:"14px 18px",marginBottom:20,boxShadow:"0 4px 16px rgba(13,148,136,0.1)"}}>
          <div style={{fontSize:13,color:"#0d9488",fontWeight:600,lineHeight:1.6}}>
            ℹ️ Esegui gli esercizi con attenzione. In caso di dolore acuto, <strong>fermati e contatta lo studio</strong>.<br/>Tocca ogni esercizio per dettagli e video dimostrativo.
          </div>
          {nota&&<div style={{marginTop:10,padding:"10px 14px",background:"rgba(13,148,136,0.06)",borderRadius:8,fontSize:13,color:"#334155",borderLeft:"3px solid #0d9488"}}>📋 {nota}</div>}
        </div>

        {/* Lista esercizi */}
        {esercizi.map((e)=>{
          const cat = getCat(e.categoria);
          const ytId = e.youtube_id || null;
          const isOpen = expanded === e.id;
          const p = paramsFor(e);
          const hasProg = isProgram && Array.isArray(e.progressione) && e.progressione.length > 0;
          return (
            <div key={e.id} style={{background:"#fff",borderRadius:14,marginBottom:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(15,23,42,0.06)",border:"1.5px solid #e2e8f0"}}>
              {/* Header */}
              <div onClick={()=>setExpanded(isOpen?null:e.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer",userSelect:"none"}}>
                <div style={{width:56,height:56,borderRadius:12,background:cat.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <EsercizioSVG categoria={e.categoria}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,fontWeight:700,color:cat.color,background:cat.bg,padding:"2px 8px",borderRadius:99}}>{cat.label}</span>
                    {ytId&&<span style={{fontSize:10,color:"#dc2626",fontWeight:700}}>▶ Video</span>}
                    {e.image_url&&<span style={{fontSize:10,color:"#0d9488",fontWeight:700}}>🖼️ Foto</span>}
                  </div>
                  <div style={{fontWeight:800,fontSize:15,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.nome}</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
                    {p.serie} serie × {p.ripetizioni} · {e.frequenza}
                    {hasProg && <span style={{color:"#0d9488",fontWeight:700}}> · sett. {week}</span>}
                  </div>
                </div>
                <div style={{fontSize:18,color:"#94a3b8",transition:"transform 0.2s",transform:isOpen?"rotate(180deg)":"none",flexShrink:0}}>▾</div>
              </div>

              {/* Dettagli */}
              {isOpen&&(
                <div style={{borderTop:"1.5px solid #f1f5f9"}}>
                  {/* Foto dimostrativa */}
                  {e.image_url&&(
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.image_url} alt={`Foto: ${e.nome}`} loading="lazy"
                      style={{width:"100%",maxHeight:240,objectFit:"cover",display:"block"}}
                      onError={ev=>{(ev.target as HTMLImageElement).style.display="none";}}/>
                  )}
                  {/* Thumbnail YouTube cliccabile */}
                  {ytId&&(
                    <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setVideoOpen(ytId)}>
                      <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="Anteprima video"
                        style={{width:"100%",height:180,objectFit:"cover",display:"block"}}
                        onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
                      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.3)"}}>
                        <div style={{width:60,height:60,borderRadius:"50%",background:"#dc2626",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(0,0,0,0.3)"}}>
                          <span style={{color:"#fff",fontSize:24,marginLeft:5}}>▶</span>
                        </div>
                      </div>
                      <div style={{position:"absolute",bottom:8,right:10,fontSize:11,fontWeight:700,color:"#fff",background:"rgba(0,0,0,0.5)",padding:"3px 8px",borderRadius:6}}>Tocca per il video</div>
                    </div>
                  )}
                  <div style={{padding:"14px 16px"}}>
                    {/* Aderenza: fatto oggi + ultimi 7 giorni */}
                    <div className="no-print" style={{marginBottom:14,padding:"12px",background:doneToday(e.id)?"rgba(22,163,74,0.06)":"#f8fafc",border:`1.5px solid ${doneToday(e.id)?"rgba(22,163,74,0.35)":"#e2e8f0"}`,borderRadius:12,transition:"background 0.15s, border-color 0.15s"}}>
                      <button
                        onClick={(ev)=>{ev.stopPropagation();toggleDone(e.id);}}
                        disabled={savingAdh===e.id}
                        style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"13px 16px",
                          background:doneToday(e.id)?"#16a34a":"#fff",
                          border:doneToday(e.id)?"none":"2px solid #16a34a",
                          borderRadius:10,color:doneToday(e.id)?"#fff":"#16a34a",
                          cursor:savingAdh===e.id?"wait":"pointer",fontWeight:800,fontSize:15,fontFamily:"inherit",opacity:savingAdh===e.id?0.7:1}}>
                        <span style={{fontSize:20,lineHeight:1}}>{doneToday(e.id)?"✅":"⭕"}</span>
                        {doneToday(e.id)?"Fatto oggi!":"Segna come fatto oggi"}
                      </button>
                      <div style={{display:"flex",justifyContent:"space-between",gap:4,marginTop:12}}>
                        {last7.map((d)=>{
                          const done = isDone(e.id, d.date);
                          const isToday = d.date === todayKey;
                          return (
                            <div key={d.date} style={{flex:1,textAlign:"center"}}>
                              <div style={{fontSize:9,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",marginBottom:4}}>{d.dow}</div>
                              <div style={{width:"100%",aspectRatio:"1",maxWidth:34,margin:"0 auto",borderRadius:8,
                                display:"flex",alignItems:"center",justifyContent:"center",
                                background:done?"#16a34a":"#fff",
                                border:isToday?"2px solid #0d9488":`1.5px solid ${done?"#16a34a":"#e2e8f0"}`,
                                fontSize:done?14:11,fontWeight:700,color:done?"#fff":"#cbd5e1"}}>
                                {done?"✓":d.dom}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                      {[{l:"Serie",v:p.serie},{l:"Ripetizioni",v:p.ripetizioni},{l:"Frequenza",v:e.frequenza}].map(k=>(
                        <span key={k.l} style={{fontSize:12,fontWeight:700,color:"#2563eb",background:"rgba(37,99,235,0.08)",padding:"4px 12px",borderRadius:99}}>{k.l}: {k.v}</span>
                      ))}
                    </div>
                    {hasProg && p.carico && (
                      <div style={{fontSize:13,fontWeight:700,color:"#0d9488",background:"rgba(13,148,136,0.07)",padding:"8px 12px",borderRadius:8,marginBottom:10,borderLeft:"3px solid #0d9488"}}>
                        🎯 Questa settimana: {p.carico}
                      </div>
                    )}
                    {e.descrizione&&<div style={{fontSize:14,color:"#334155",lineHeight:1.7,marginBottom:10}}>{e.descrizione}</div>}
                    {e.note&&<div style={{fontSize:13,color:"#0d9488",background:"rgba(13,148,136,0.07)",padding:"8px 12px",borderRadius:8,marginBottom:8}}>📌 {e.note}</div>}
                    {e.avvertenze&&<div style={{fontSize:13,color:"#dc2626",background:"rgba(220,38,38,0.06)",padding:"8px 12px",borderRadius:8,marginBottom:10}}>⚠️ {e.avvertenze}</div>}

                    {/* Percorso completo (progressione) */}
                    {hasProg && (
                      <div style={{marginBottom:10}}>
                        <button className="no-print" onClick={()=>setShowProg(showProg===e.id?null:e.id)}
                          style={{background:"transparent",border:"none",color:"#2563eb",fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0,textDecoration:"underline"}}>
                          {showProg===e.id ? "Nascondi percorso completo ▲" : "Vedi percorso completo ▼"}
                        </button>
                        {showProg===e.id && (
                          <div style={{marginTop:8,border:"1.5px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
                            <div style={{display:"grid",gridTemplateColumns:"50px 60px 60px 1fr",gap:0,fontSize:11,fontWeight:800,color:"#64748b",background:"#f8fafc",padding:"7px 10px"}}>
                              <div>SETT.</div><div>SERIE</div><div>RIP.</div><div>CARICO</div>
                            </div>
                            {(e.progressione??[]).map(s=>(
                              <div key={s.settimana} style={{display:"grid",gridTemplateColumns:"50px 60px 60px 1fr",gap:0,fontSize:12,padding:"7px 10px",
                                background: s.settimana===week ? "rgba(13,148,136,0.07)" : "#fff",
                                borderTop:"1px solid #f1f5f9",
                                fontWeight: s.settimana===week ? 800 : 500,
                                color: s.settimana===week ? "#0d9488" : "#334155"}}>
                                <div>{s.settimana===curWeek ? `📍${s.settimana}` : s.settimana}</div>
                                <div>{s.serie}</div><div>{s.ripetizioni}</div><div>{s.carico}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {ytId&&(
                      <button onClick={()=>setVideoOpen(ytId)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"13px 16px",background:"#dc2626",borderRadius:10,border:"none",color:"#fff",cursor:"pointer",fontWeight:800,fontSize:15,fontFamily:"inherit"}}>
                        <span style={{fontSize:22}}>▶</span> Guarda il video dimostrativo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Footer */}
        <div style={{textAlign:"center",padding:"24px 0 40px",fontSize:12,color:"#94a3b8"}}>
          {studio && <div style={{fontWeight:700,color:"#334155",marginBottom:4}}>{[studio.signature_name, studio.signature_title].filter(Boolean).join(" — ")}</div>}
          {studio?.address && <div>{studio.address}</div>}
          <div className="no-print" style={{marginTop:16}}>
            <button onClick={()=>window.print()} style={{padding:"10px 24px",background:"#0d9488",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>🖨️ Stampa / Salva PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}
