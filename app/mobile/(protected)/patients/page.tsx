"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

/* ─── Types ───────────────────────────────────────────────────────────── */
type Patient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  birth_date: string | null;
  tax_code: string | null;
};

type NextAppt = {
  patient_id: string;
  start_at: string;
  status: string;
};

/* ─── Theme (identico calendario) ────────────────────────────────────── */
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
function nameOf(p: Patient) {
  return `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "Paziente";
}

function initials(p: Patient) {
  const f = (p.first_name ?? "").trim()[0] ?? "";
  const l = (p.last_name ?? "").trim()[0] ?? "";
  return (l + f).toUpperCase() || "?";
}

function formatPhoneForWA(phone: string): string {
  let c = phone.replace(/[\s\(\)\-\.]/g, "");
  if (c.startsWith("+")) c = c.substring(1);
  if (c.startsWith("0")) c = "39" + c.substring(1);
  if (!c.startsWith("39") && c.length <= 10) c = "39" + c;
  return c;
}

function formatApptDate(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date(); oggi.setHours(0,0,0,0);
  const domani = new Date(oggi); domani.setDate(oggi.getDate()+1);
  const dt = new Date(d); dt.setHours(0,0,0,0);
  const ora = d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"});
  if (dt.getTime()===oggi.getTime()) return `Oggi ${ora}`;
  if (dt.getTime()===domani.getTime()) return `Domani ${ora}`;
  const gg=["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][d.getDay()];
  return `${gg} ${d.getDate()}/${d.getMonth()+1} ${ora}`;
}

function isIncomplete(p: Patient) {
  return !p.phone || !p.birth_date || !p.tax_code;
}

function groupByLetter(patients: Patient[]): {letter: string; items: Patient[]}[] {
  const map = new Map<string, Patient[]>();
  for (const p of patients) {
    const l = (p.last_name?.[0] ?? "#").toUpperCase();
    if (!map.has(l)) map.set(l, []);
    map.get(l)!.push(p);
  }
  return Array.from(map.entries())
    .sort(([a],[b]) => a.localeCompare(b,"it"))
    .map(([letter,items]) => ({letter, items}));
}

/* ─── Page ────────────────────────────────────────────────────────────── */
export default function MobilePatientsPage() {
  const [loading,   setLoading]   = useState(true);
  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [nextAppts, setNextAppts] = useState<NextAppt[]>([]);
  const [q,         setQ]         = useState("");
  const [error,     setError]     = useState("");
  const [userEmail, setUserEmail] = useState<string|null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  /* pull-to-refresh */
  const [pullY,        setPullY]        = useState(0);
  const [isPulling,    setIsPulling]    = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef<number|null>(null);
  const PULL_THRESHOLD = 64;

  /* ── Load ────────────────────────────────── */
  async function load() {
    setLoading(true); setError("");
    const [resP, resA] = await Promise.all([
      supabase.from("patients")
        .select("id,first_name,last_name,phone,birth_date,tax_code")
        .order("last_name",{ascending:true}),
      supabase.from("appointments")
        .select("patient_id,start_at,status")
        .gte("start_at", new Date().toISOString())
        .neq("status","cancelled")
        .order("start_at",{ascending:true}),
    ]);
    if (resP.error) { setError(resP.error.message); setLoading(false); return; }
    setPatients((resP.data ?? []) as Patient[]);
    // tieni solo il primo appuntamento per paziente
    const seen = new Set<string>();
    const firsts: NextAppt[] = [];
    for (const a of (resA.data ?? []) as NextAppt[]) {
      if (!seen.has(a.patient_id)) { seen.add(a.patient_id); firsts.push(a); }
    }
    setNextAppts(firsts);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  /* ── User ────────────────────────────────── */
  useEffect(() => {
    supabase.auth.getUser().then(({data}) => setUserEmail(data?.user?.email??null)).catch(()=>{});
  }, []);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [userMenuOpen]);

  const userInitials = useMemo(() => {
    if (!userEmail) return "U";
    const parts=(userEmail.split("@")[0]??"U").replace(/[^a-zA-Z0-9]/g," ").split(" ").filter(Boolean);
    return ((parts[0]?.[0]??"U")+(parts[1]?.[0]??"")).toUpperCase().slice(0,2);
  }, [userEmail]);

  /* ── Pull-to-refresh ─────────────────────── */
  const handlePullStart = (e: React.TouchEvent) => {
    if (window.scrollY===0) pullStartY.current=e.touches[0].clientY;
  };
  const handlePullMove = (e: React.TouchEvent) => {
    if (pullStartY.current===null||isRefreshing) return;
    const dy=e.touches[0].clientY-pullStartY.current;
    if (dy>0) { setIsPulling(true); setPullY(Math.min(dy,PULL_THRESHOLD*1.5)); }
  };
  const handlePullEnd = async () => {
    if (!isPulling) { pullStartY.current=null; return; }
    if (pullY>=PULL_THRESHOLD) {
      setIsRefreshing(true); setPullY(PULL_THRESHOLD);
      await load(); setIsRefreshing(false);
    }
    setPullY(0); setIsPulling(false); pullStartY.current=null;
  };

  /* ── Derived ─────────────────────────────── */
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return patients;
    return patients.filter(p => nameOf(p).toLowerCase().includes(t));
  }, [patients, q]);

  const grouped = useMemo(() => groupByLetter(filtered), [filtered]);

  const stats = useMemo(() => ({
    total:      patients.length,
    incomplete: patients.filter(isIncomplete).length,
    withAppt:   nextAppts.length,
  }), [patients, nextAppts]);

  const nextApptMap = useMemo(() => {
    const m = new Map<string,NextAppt>();
    for (const a of nextAppts) m.set(a.patient_id, a);
    return m;
  }, [nextAppts]);

  async function handleLogout() {
    try { await supabase.auth.signOut(); } finally { window.location.href="/login"; }
  }

  /* ─── RENDER ─────────────────────────────── */
  return (
    <div
      style={{minHeight:"100vh",background:THEME.appBg,paddingBottom:BOTTOM_TAB_H+16,
              fontFamily:"Inter,-apple-system,sans-serif"}}
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
    >

      {/* ━━━ Pull indicator ━━━ */}
      {(isPulling||isRefreshing)&&(
        <div style={{
          position:"fixed",top:54,left:"50%",transform:"translateX(-50%)",zIndex:50,
          background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
          borderRadius:99,padding:"6px 16px",fontSize:12,fontWeight:700,
          color:THEME.blue,boxShadow:"0 4px 12px rgba(15,23,42,0.12)",
          display:"flex",alignItems:"center",gap:6,
        }}>
          {isRefreshing?"↻ Aggiornamento…":`↓ Trascina ancora (${Math.round(Math.min(pullY/PULL_THRESHOLD*100,100))}%)`}
        </div>
      )}

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position:"sticky",top:0,zIndex:30,
        background:THEME.gradient,padding:"0 14px",height:54,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        boxShadow:"0 2px 12px rgba(13,148,136,0.18)",gap:10,
      }}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <div style={{width:28,height:28,borderRadius:7,background:"rgba(255,255,255,0.2)",
            border:"1.5px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",
            justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13}}>F</div>
          <span style={{fontWeight:800,fontSize:15,color:"#fff",letterSpacing:0.3,textTransform:"uppercase"}}>
            Fisio<span style={{fontWeight:700}}>Hub</span>
          </span>
        </div>

        {/* KPI chips */}
        {!loading&&(
          <div style={{display:"flex",gap:5,alignItems:"center"}}>
            <span style={{fontSize:11,fontWeight:700,color:"#fff",background:"rgba(255,255,255,0.2)",
              padding:"4px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.15)",whiteSpace:"nowrap"}}>
              👥 {stats.total}
            </span>
            {stats.incomplete>0&&(
              <span style={{fontSize:11,fontWeight:700,color:"#fff",background:"rgba(249,115,22,0.35)",
                padding:"4px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.15)",whiteSpace:"nowrap"}}>
                ⚠️ {stats.incomplete}
              </span>
            )}
          </div>
        )}

        {/* Refresh + Avatar */}
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <button onClick={load} aria-label="Aggiorna" style={{
            width:30,height:30,borderRadius:7,border:"1.5px solid rgba(255,255,255,0.3)",
            background:"rgba(255,255,255,0.15)",color:"#fff",cursor:"pointer",fontSize:15,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>↺</button>
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

      {/* ━━━ TAB BAR ━━━ */}
      <nav style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:30,
        background:THEME.panelBg,borderTop:`1.5px solid ${THEME.border}`,
        display:"flex",boxShadow:"0 -4px 16px rgba(15,23,42,0.08)",
        paddingBottom:"env(safe-area-inset-bottom,0px)",
      }}>
        {[
          {href:"/mobile",          label:"Home",      icon:"⌂"},
          {href:"/mobile/calendar", label:"Calendario",icon:"▦"},
          {href:"/mobile/patients", label:"Pazienti",  icon:"◉", active:true},
          {href:"/mobile/reports",  label:"Report",    icon:"◈"},
        ].map(item=>(
          <Link key={item.href} href={item.href} style={{
            flex:1,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",
            padding:"10px 4px 9px",textDecoration:"none",gap:3,position:"relative",
          }}>
            <span style={{fontSize:18,lineHeight:1,
              ...(item.active
                ?{background:THEME.gradient,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}
                :{color:THEME.muted})}}>
              {item.icon}
            </span>
            <span style={{fontSize:10,fontWeight:item.active?700:600,
                          color:item.active?THEME.blue:THEME.muted}}>
              {item.label}
            </span>
            {item.active&&(
              <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",
                width:28,height:2.5,borderRadius:999,background:THEME.gradient}} />
            )}
          </Link>
        ))}
      </nav>

      {/* ━━━ CONTENUTO ━━━ */}
      <div style={{padding:"12px 14px 0"}}>

        {/* Ricerca */}
        <div style={{position:"relative",marginBottom:10}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
            fontSize:15,pointerEvents:"none",color:THEME.muted}}>🔍</span>
          <input
            value={q}
            onChange={e=>setQ(e.target.value)}
            placeholder="Cerca nome o cognome…"
            style={{
              width:"100%",padding:"11px 12px 11px 36px",borderRadius:12,
              border:`1.5px solid ${THEME.border}`,outline:"none",
              background:THEME.panelBg,color:THEME.text,
              fontWeight:500,fontSize:14,fontFamily:"Inter,-apple-system,sans-serif",
              boxSizing:"border-box",
            }}
          />
          {q&&(
            <button onClick={()=>setQ("")} style={{
              position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
              background:"none",border:"none",cursor:"pointer",color:THEME.muted,fontSize:18,lineHeight:1,
            }}>×</button>
          )}
        </div>

        {/* Errore */}
        {error&&(
          <div style={{padding:"10px 12px",borderRadius:10,marginBottom:10,
            background:"rgba(220,38,38,0.06)",border:"1.5px solid rgba(220,38,38,0.25)",
            color:"#7f1d1d",fontWeight:600,fontSize:13}}>
            ⚠️ {error}
          </div>
        )}

        {/* Loading */}
        {loading&&(
          <div style={{color:THEME.muted,fontWeight:600,fontSize:13,padding:"20px 0",textAlign:"center"}}>
            Caricamento…
          </div>
        )}

        {/* Lista per lettera */}
        {!loading&&filtered.length===0&&(
          <div style={{background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
            borderRadius:14,padding:20,color:THEME.muted,fontWeight:600,
            fontSize:13,textAlign:"center"}}>
            Nessun paziente trovato
          </div>
        )}

        {!loading&&grouped.map(({letter,items})=>(
          <div key={letter} style={{marginBottom:16}}>
            {/* Intestazione lettera */}
            <div style={{
              fontSize:11,fontWeight:800,color:THEME.muted,
              textTransform:"uppercase",letterSpacing:"0.1em",
              marginBottom:6,paddingLeft:4,
            }}>
              {letter}
            </div>

            <div style={{
              background:THEME.panelBg,border:`1.5px solid ${THEME.border}`,
              borderRadius:14,overflow:"hidden",
              boxShadow:"0 1px 4px rgba(15,23,42,0.06)",
            }}>
              {items.map((p,i)=>{
                const incomplete = isIncomplete(p);
                const appt = nextApptMap.get(p.id);
                const phone = p.phone?.trim();
                const waPhone = phone ? formatPhoneForWA(phone) : null;

                return (
                  <div key={p.id} style={{
                    borderBottom: i<items.length-1?`1px solid ${THEME.border}`:"none",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px"}}>

                      {/* Avatar */}
                      <div style={{
                        width:40,height:40,borderRadius:12,flexShrink:0,
                        background:THEME.gradient,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        color:"#fff",fontWeight:800,fontSize:14,
                      }}>
                        {initials(p)}
                      </div>

                      {/* Info paziente */}
                      <Link href={`/mobile/patients/${p.id}`} style={{
                        flex:1,minWidth:0,textDecoration:"none",color:"inherit",
                      }}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontWeight:700,fontSize:14,color:THEME.text,
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {nameOf(p)}
                          </span>
                          {incomplete&&(
                            <span style={{fontSize:10,fontWeight:700,flexShrink:0,
                              padding:"1px 6px",borderRadius:99,
                              background:"rgba(249,115,22,0.10)",color:THEME.amber,
                              border:"1px solid rgba(249,115,22,0.25)"}}>
                              ⚠️
                            </span>
                          )}
                        </div>
                        <div style={{marginTop:3,fontSize:12,color:THEME.muted,fontWeight:500}}>
                          {phone ? phone : <span style={{opacity:0.5}}>Nessun telefono</span>}
                        </div>
                        {appt&&(
                          <div style={{marginTop:3,fontSize:11,fontWeight:600,color:THEME.blue}}>
                            📅 {formatApptDate(appt.start_at)}
                          </div>
                        )}
                      </Link>

                      {/* Azioni rapide */}
                      <div style={{display:"flex",gap:7,flexShrink:0}}>
                        {/* Chiama */}
                        {phone&&(
                          <a href={`tel:${phone}`} style={{
                            width:34,height:34,borderRadius:10,flexShrink:0,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            background:"rgba(37,99,235,0.08)",
                            border:`1.5px solid rgba(37,99,235,0.2)`,
                            textDecoration:"none",fontSize:16,
                          }}>📞</a>
                        )}
                        {/* WhatsApp */}
                        {waPhone&&(
                          <a href={`https://api.whatsapp.com/send?phone=${waPhone}`} target="_blank" rel="noreferrer"
                            style={{
                              width:34,height:34,borderRadius:10,flexShrink:0,
                              display:"flex",alignItems:"center",justifyContent:"center",
                              background:"rgba(22,163,74,0.08)",
                              border:`1.5px solid rgba(22,163,74,0.2)`,
                              textDecoration:"none",fontSize:16,
                            }}>💬</a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ━━━ FAB nuovo paziente ━━━ */}
      <Link
        href="/mobile/patients/new"
        aria-label="Nuovo paziente"
        style={{
          position:"fixed",right:18,
          bottom:`calc(env(safe-area-inset-bottom,0px) + ${BOTTOM_TAB_H+16}px)`,
          width:52,height:52,borderRadius:"50%",
          background:THEME.gradient,color:"#fff",
          display:"flex",alignItems:"center",justifyContent:"center",
          textDecoration:"none",fontSize:26,fontWeight:300,zIndex:40,
          boxShadow:"0 4px 20px rgba(13,148,136,0.40)",
        }}>
        +
      </Link>

    </div>
  );
}
