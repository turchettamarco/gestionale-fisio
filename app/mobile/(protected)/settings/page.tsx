"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import {
  type TreatmentTypeRow,
  loadTreatmentTypes,
  keyFromLabel,
} from "@/src/lib/treatmentTypes";

const THEME = {
  appBg:"#f1f5f9", panelBg:"#ffffff", panelSoft:"#f7f9fd", text:"#0f172a", muted:"#334155",
  border:"#cbd5e1", blue:"#2563eb", teal:"#0d9488", green:"#16a34a",
  red:"#dc2626", amber:"#f97316", gray:"#94a3b8",
  gradient:"linear-gradient(135deg,#0d9488,#2563eb)",
};

// ─── Palette colori (stessa del desktop) ─────────────────────────────────
const COLOR_PALETTE: { value: string; name: string }[] = [
  { value: "#0d9488", name: "Teal" },
  { value: "#2563eb", name: "Blu" },
  { value: "#d97706", name: "Ambra" },
  { value: "#ea580c", name: "Arancio" },
  { value: "#7c3aed", name: "Viola" },
  { value: "#059669", name: "Verde" },
  { value: "#db2777", name: "Rosa" },
  { value: "#4f46e5", name: "Indaco" },
  { value: "#dc2626", name: "Rosso" },
  { value: "#475569", name: "Grigio" },
];

const DAY_LABELS = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
const DAY_ORDER = [1,2,3,4,5,6,0];

export default function MobileSettingsPage() {
  const router = useRouter();
  const { studio: currentStudio } = useCurrentStudio();
  const currentStudioId = currentStudio?.id ?? null;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeSection, setActiveSection] = useState<string|null>(null);

  // ── Practice ──
  const [practiceName, setPracticeName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [googleReviewLink, setGoogleReviewLink] = useState("");

  // ── Catalogo Trattamenti (sostituisce le vecchie tariffe + durate) ──
  const [treatments, setTreatments] = useState<TreatmentTypeRow[]>([]);
  const [loadingTreatments, setLoadingTreatments] = useState(false);
  const [savingTreatment, setSavingTreatment] = useState(false);
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<{
    id: string | null;
    label: string;
    color: string;
    priceInvoice: string;
    priceCash: string;
    durationMin: string;
    isActive: boolean;
    isBuiltin: boolean;
  } | null>(null);

  // ── Working hours ──
  const [hours, setHours] = useState<{day_of_week:number;open_time:string;close_time:string;is_open:boolean}[]>([]);

  // ── Goals ──
  const [monthlyGoal, setMonthlyGoal] = useState("2000");
  const [inactiveThresh, setInactiveThresh] = useState("45");
  const [overlapMode, setOverlapMode] = useState<"block"|"warn"|"visual">("warn");

  // ── Password ──
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // ── Load ──
  useEffect(()=>{
    (async()=>{
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("practice_settings").select("*").eq("owner_id",user.id).maybeSingle();
        if (data) {
          setPracticeName(data.practice_name||"");
          setOwnerName(data.owner_full_name||"");
          setPhone(data.phone||"");
          setAddress(data.address||"");
          setGoogleReviewLink(data.google_review_link||"");
          setMonthlyGoal(String((data as any).monthly_revenue_goal||2000));
          setInactiveThresh(String((data as any).inactive_threshold_days||45));
          setOverlapMode(((data as any).overlap_mode ?? "warn") as "block"|"warn"|"visual");
        }
        const { data: wh } = await supabase.from("working_hours").select("*").order("day_of_week");
        if (wh && wh.length) {
          setHours(wh.map((r:any)=>({day_of_week:r.day_of_week,open_time:(r.open_time||"09:00").slice(0,5),close_time:(r.close_time||"19:00").slice(0,5),is_open:r.is_open??true})));
        } else {
          setHours(Array.from({length:7},(_,d)=>({day_of_week:d,open_time:"09:00",close_time:"19:00",is_open:d!==0})));
        }
      } catch(e:any){ setError(e?.message||"Errore caricamento"); }
    })();
  },[]);

  // ── Carica catalogo trattamenti per lo studio corrente ──
  const reloadTreatments = useCallback(async () => {
    if (!currentStudioId) return;
    setLoadingTreatments(true);
    try {
      const rows = await loadTreatmentTypes(currentStudioId, false);
      setTreatments(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore caricamento trattamenti.";
      setError(msg);
    } finally {
      setLoadingTreatments(false);
    }
  }, [currentStudioId]);

  useEffect(() => { void reloadTreatments(); }, [reloadTreatments]);

  async function save() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      await supabase.from("practice_settings").upsert({
        owner_id:user.id, practice_name:practiceName, owner_full_name:ownerName,
        phone, address, google_review_link:googleReviewLink,
        monthly_revenue_goal:parseFloat(monthlyGoal)||2000,
        inactive_threshold_days:parseInt(inactiveThresh)||45,
        overlap_mode: overlapMode,
      },{ onConflict:"owner_id" });
      // Save working hours
      if (hours.length) {
        await supabase.from("working_hours").upsert(
          hours.map(h=>({day_of_week:h.day_of_week,open_time:h.open_time,close_time:h.close_time,is_open:h.is_open})),
          { onConflict:"day_of_week" }
        );
      }
      setSuccess("Impostazioni salvate.");
      setTimeout(()=>setSuccess(""),3000);
    } catch(e:any){ setError(e?.message||"Errore salvataggio"); }
    finally { setSaving(false); }
  }

  // ─── Catalogo Trattamenti: handlers ──────────────────────────────────
  function openNewTreatment() {
    setEditingTreatment({
      id: null,
      label: "",
      color: COLOR_PALETTE[0].value,
      priceInvoice: "",
      priceCash: "",
      durationMin: "30",
      isActive: true,
      isBuiltin: false,
    });
    setTreatmentModalOpen(true);
  }

  function openEditTreatment(row: TreatmentTypeRow) {
    setEditingTreatment({
      id: row.id,
      label: row.label,
      color: row.color,
      priceInvoice: String(row.price_invoice ?? ""),
      priceCash: String(row.price_cash ?? ""),
      durationMin: String(row.duration_min ?? 30),
      isActive: row.is_active,
      isBuiltin: row.is_builtin,
    });
    setTreatmentModalOpen(true);
  }

  function closeTreatmentModal() {
    setTreatmentModalOpen(false);
    setEditingTreatment(null);
  }

  async function saveTreatment() {
    if (!currentStudioId || !editingTreatment) return;
    const f = editingTreatment;
    const label = f.label.trim();
    if (label.length < 2) { setError("Nome trattamento troppo corto."); return; }
    const pi = Number(f.priceInvoice.replace(",", "."));
    const pc = Number(f.priceCash.replace(",", "."));
    const dm = Number(f.durationMin);
    if (!Number.isFinite(pi) || pi < 0) { setError("Prezzo con ricevuta non valido."); return; }
    if (!Number.isFinite(pc) || pc < 0) { setError("Prezzo in contanti non valido."); return; }
    if (!Number.isFinite(dm) || dm <= 0 || dm > 480) { setError("Durata non valida (1-480 min)."); return; }

    setSavingTreatment(true);
    setError("");
    try {
      if (f.id) {
        const { error: upErr } = await supabase
          .from("treatment_types")
          .update({ label, color: f.color, price_invoice: pi, price_cash: pc, duration_min: dm, is_active: f.isActive })
          .eq("id", f.id);
        if (upErr) throw new Error(upErr.message);
      } else {
        let key = keyFromLabel(label);
        const existingKeys = new Set(treatments.map(t => t.key));
        if (existingKeys.has(key)) {
          let n = 2;
          while (existingKeys.has(`${key}_${n}`)) n++;
          key = `${key}_${n}`;
        }
        const maxOrder = treatments.reduce((m, t) => Math.max(m, t.sort_order), 0);
        const { error: insErr } = await supabase
          .from("treatment_types")
          .insert({
            studio_id: currentStudioId,
            key, label, color: f.color,
            price_invoice: pi, price_cash: pc, duration_min: dm,
            is_active: f.isActive,
            sort_order: maxOrder + 10,
            is_builtin: false,
          });
        if (insErr) throw new Error(insErr.message);
      }
      closeTreatmentModal();
      await reloadTreatments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore salvataggio.");
    } finally {
      setSavingTreatment(false);
    }
  }

  async function toggleTreatmentActive(row: TreatmentTypeRow) {
    if (row.is_builtin && row.is_active) {
      const ok = confirm(`Disattivare "${row.label}"?\n\nNon comparirà più nei selettori del calendario, ma gli appuntamenti già esistenti restano invariati.`);
      if (!ok) return;
    }
    setSavingTreatment(true);
    try {
      const { error: upErr } = await supabase.from("treatment_types").update({ is_active: !row.is_active }).eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
      await reloadTreatments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore.");
    } finally {
      setSavingTreatment(false);
    }
  }

  async function deleteTreatment(row: TreatmentTypeRow) {
    const ok = confirm(`Cancellare "${row.label}"?\n\nGli appuntamenti già creati con questo tipo manterranno la dicitura, ma non potrai più crearne di nuovi.${row.is_builtin ? "\n\n⚠️ Stai cancellando una voce di sistema." : ""}`);
    if (!ok) return;
    setSavingTreatment(true);
    try {
      const { error: delErr } = await supabase.from("treatment_types").delete().eq("id", row.id);
      if (delErr) throw new Error(delErr.message);
      await reloadTreatments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore cancellazione.");
    } finally {
      setSavingTreatment(false);
    }
  }

  async function moveTreatment(row: TreatmentTypeRow, direction: -1 | 1) {
    const sorted = [...treatments].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex(t => t.id === row.id);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const other = sorted[newIdx];
    setSavingTreatment(true);
    try {
      await supabase.from("treatment_types").update({ sort_order: other.sort_order }).eq("id", row.id);
      await supabase.from("treatment_types").update({ sort_order: row.sort_order }).eq("id", other.id);
      await reloadTreatments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore riordino.");
    } finally {
      setSavingTreatment(false);
    }
  }

  async function changePassword() {
    setPwError(""); setPwSuccess("");
    if (pwNew.length < 8) { setPwError("Minimo 8 caratteri."); return; }
    if (pwNew !== pwConfirm) { setPwError("Le password non coincidono."); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      setPwSuccess("Password aggiornata."); setPwNew(""); setPwConfirm("");
    } catch(e:any){ setPwError(e?.message||"Errore"); }
    finally { setPwSaving(false); }
  }

  const inp: React.CSSProperties = { width:"100%", padding:"11px 14px", borderRadius:10, border:`1.5px solid ${THEME.border}`, fontSize:15, fontWeight:500, background:"#fff", color:THEME.text, outline:"none", boxSizing:"border-box" };
  const lbl: React.CSSProperties = { display:"block", fontSize:11, fontWeight:700, color:THEME.muted, marginBottom:5, textTransform:"uppercase", letterSpacing:0.4 };

  const Section = ({id,title,sub,children}:{id:string,title:string,sub:string,children:React.ReactNode}) => (
    <div style={{ background:THEME.panelBg, borderRadius:14, border:`1px solid ${THEME.border}`, overflow:"hidden", marginBottom:12 }}>
      <div onClick={()=>setActiveSection(activeSection===id?null:id)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 18px", cursor:"pointer" }}>
        <div><div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>{title}</div><div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>{sub}</div></div>
        <span style={{ color:THEME.muted, fontSize:14, transform:activeSection===id?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
      </div>
      {activeSection===id && <div style={{ padding:"0 18px 18px", borderTop:`1px solid ${THEME.border}` }}>{children}</div>}
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:THEME.appBg, fontFamily:"'Outfit','Segoe UI',system-ui,sans-serif", paddingBottom:80 }}>
      <style jsx global>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}body{margin:0;background:${THEME.appBg};}a{text-decoration:none;}input:focus{border-color:${THEME.teal}!important;outline:none!important;}`}</style>

      {/* Header */}
      <header style={{ background:THEME.gradient, padding:"14px 18px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:20 }}>
        <button onClick={()=>router.back()} style={{ background:"rgba(255,255,255,0.2)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:8, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", padding:"6px 12px" }}>←</button>
        <div style={{ fontWeight:800, fontSize:17, color:"#fff" }}>Impostazioni</div>
      </header>

      <div style={{ padding:"16px" }}>
        {error && <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:10, background:"rgba(220,38,38,0.06)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>{error}</div>}
        {success && <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:10, background:"rgba(22,163,74,0.06)", border:"1px solid rgba(22,163,74,0.2)", color:THEME.green, fontWeight:600, fontSize:13 }}>{success}</div>}

        <Section id="studio" title="Dati Studio" sub={practiceName||"Nome studio, contatti"}>
          <div style={{ display:"flex", flexDirection:"column", gap:12, paddingTop:14 }}>
            {[{l:"Nome studio",v:practiceName,s:setPracticeName},{l:"Titolare",v:ownerName,s:setOwnerName},{l:"Telefono",v:phone,s:setPhone},{l:"Indirizzo",v:address,s:setAddress}].map(f=>(
              <div key={f.l}><label style={lbl}>{f.l}</label><input value={f.v} onChange={e=>f.s(e.target.value)} style={inp}/></div>
            ))}
            <div><label style={lbl}>Link Google Review</label><input value={googleReviewLink} onChange={e=>setGoogleReviewLink(e.target.value)} placeholder="https://g.page/r/..." style={inp}/></div>
          </div>
        </Section>

        <Section
          id="catalogo"
          title="Catalogo Trattamenti"
          sub={loadingTreatments ? "Caricamento…" : `${treatments.filter(t=>t.is_active).length} attivi · ${treatments.length} totali`}
        >
          <div style={{ display:"flex", flexDirection:"column", gap:10, paddingTop:14 }}>
            <div style={{ fontSize:12, color:THEME.muted, lineHeight:1.5 }}>
              Aggiungi nuovi tipi di trattamento, modifica nome/prezzo/durata, riordina o disattiva quelli che non usi. Le modifiche valgono ovunque (calendario, ricevute, report).
            </div>

            <button
              onClick={openNewTreatment}
              disabled={!currentStudioId || savingTreatment}
              style={{
                width:"100%", padding:"12px", borderRadius:10, border:"none",
                background:THEME.gradient, color:"#fff", fontWeight:700, fontSize:14,
                cursor:"pointer", opacity:(!currentStudioId||savingTreatment)?0.6:1,
              }}
            >
              + Nuovo trattamento
            </button>

            {treatments.length === 0 && !loadingTreatments && (
              <div style={{ padding:20, textAlign:"center", color:THEME.muted, fontSize:13, border:`1px dashed ${THEME.border}`, borderRadius:10 }}>
                Nessun trattamento configurato. Tocca <b>+ Nuovo trattamento</b> per aggiungerne uno.
              </div>
            )}

            {[...treatments].sort((a,b)=>a.sort_order-b.sort_order).map((row, idx, sorted) => (
              <div
                key={row.id}
                style={{
                  display:"flex", alignItems:"center", gap:10,
                  padding:"12px", borderRadius:10,
                  border:`1px solid ${THEME.border}`,
                  background: row.is_active ? "#fff" : THEME.appBg,
                  opacity: row.is_active ? 1 : 0.65,
                }}
              >
                {/* Frecce ordinamento */}
                <div style={{ display:"flex", flexDirection:"column", gap:1, marginRight:2 }}>
                  <button
                    onClick={()=>void moveTreatment(row, -1)}
                    disabled={idx===0 || savingTreatment}
                    style={{ background:"none", border:"none", cursor: idx===0 ? "default" : "pointer", color: idx===0 ? THEME.gray : THEME.muted, fontSize:14, padding:"2px 6px", lineHeight:1 }}
                    aria-label="Sposta su"
                  >▲</button>
                  <button
                    onClick={()=>void moveTreatment(row, 1)}
                    disabled={idx===sorted.length-1 || savingTreatment}
                    style={{ background:"none", border:"none", cursor: idx===sorted.length-1 ? "default" : "pointer", color: idx===sorted.length-1 ? THEME.gray : THEME.muted, fontSize:14, padding:"2px 6px", lineHeight:1 }}
                    aria-label="Sposta giù"
                  >▼</button>
                </div>

                {/* Pallino colore */}
                <div style={{ width:14, height:14, borderRadius:"50%", background:row.color, flexShrink:0, border:"1px solid rgba(0,0,0,0.06)" }} />

                {/* Info trattamento (toccabile per modifica) */}
                <div
                  onClick={()=>openEditTreatment(row)}
                  style={{ flex:1, minWidth:0, cursor:"pointer" }}
                >
                  <div style={{ fontWeight:700, fontSize:14, color:THEME.text, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                    <span>{row.label}</span>
                    {row.is_builtin && (
                      <span style={{ fontSize:9, fontWeight:700, padding:"2px 5px", borderRadius:4, background:"#e2e8f0", color:THEME.muted, letterSpacing:0.3 }}>SIST</span>
                    )}
                    {!row.is_active && (
                      <span style={{ fontSize:9, fontWeight:700, padding:"2px 5px", borderRadius:4, background:"#fee2e2", color:THEME.red, letterSpacing:0.3 }}>OFF</span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:THEME.muted, marginTop:2 }}>
                    €{row.price_invoice} fatt · €{row.price_cash} contanti · {row.duration_min} min
                  </div>
                </div>

                {/* Switch attivo */}
                <button
                  onClick={()=>void toggleTreatmentActive(row)}
                  disabled={savingTreatment}
                  aria-label={row.is_active ? "Disattiva" : "Attiva"}
                  style={{
                    width:42, height:24, borderRadius:12, border:"none",
                    background: row.is_active ? THEME.teal : THEME.gray,
                    position:"relative", cursor:"pointer", flexShrink:0,
                    transition:"background 0.15s",
                  }}
                >
                  <span style={{
                    position:"absolute", top:2, left: row.is_active ? 20 : 2,
                    width:20, height:20, borderRadius:"50%", background:"#fff",
                    transition:"left 0.15s",
                  }} />
                </button>

                {/* Cestino */}
                <button
                  onClick={()=>void deleteTreatment(row)}
                  disabled={savingTreatment}
                  aria-label="Cancella"
                  style={{ padding:"8px 10px", borderRadius:8, border:`1px solid ${THEME.border}`, background:"#fff", color:THEME.red, fontSize:14, cursor:"pointer", flexShrink:0 }}
                >🗑</button>
              </div>
            ))}
          </div>
        </Section>

        <Section id="orari" title="Orari di Lavoro" sub={`${hours.filter(h=>h.is_open).length} giorni aperti`}>
          <div style={{ display:"flex", flexDirection:"column", gap:8, paddingTop:14 }}>
            {DAY_ORDER.map(d=>{
              const h = hours.find(x=>x.day_of_week===d);
              if(!h) return null;
              return (
                <div key={d} style={{ padding:"12px 14px", borderRadius:10, border:`1px solid ${THEME.border}`, background:h.is_open?"#fff":THEME.appBg, opacity:h.is_open?1:0.6 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:h.is_open?10:0 }}>
                    <span style={{ fontWeight:700, fontSize:14, color:THEME.text }}>{DAY_LABELS[d]}</span>
                    <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                      <input type="checkbox" checked={h.is_open} onChange={e=>setHours(prev=>prev.map(r=>r.day_of_week===d?{...r,is_open:e.target.checked}:r))} style={{ width:18, height:18, accentColor:THEME.teal, cursor:"pointer" }}/>
                      <span style={{ fontSize:13, fontWeight:700, color:h.is_open?THEME.teal:THEME.muted }}>{h.is_open?"Aperto":"Chiuso"}</span>
                    </label>
                  </div>
                  {h.is_open && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      <div><label style={lbl}>Apertura</label><input type="time" value={h.open_time} onChange={e=>setHours(prev=>prev.map(r=>r.day_of_week===d?{...r,open_time:e.target.value}:r))} style={{ ...inp, padding:"9px 12px" }}/></div>
                      <div><label style={lbl}>Chiusura</label><input type="time" value={h.close_time} onChange={e=>setHours(prev=>prev.map(r=>r.day_of_week===d?{...r,close_time:e.target.value}:r))} style={{ ...inp, padding:"9px 12px" }}/></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="gestione" title="Gestione" sub="Obiettivi e soglie">
          <div style={{ display:"flex", flexDirection:"column", gap:12, paddingTop:14 }}>
            <div><label style={lbl}>Obiettivo fatturato mensile (€)</label><input type="number" value={monthlyGoal} onChange={e=>setMonthlyGoal(e.target.value)} style={{ ...inp, textAlign:"right", fontWeight:700 }}/></div>
            <div><label style={lbl}>Soglia paziente inattivo (giorni)</label><input type="number" value={inactiveThresh} onChange={e=>setInactiveThresh(e.target.value)} style={{ ...inp, textAlign:"right", fontWeight:700 }}/></div>
            <div>
              <label style={lbl}>Gestione sovrapposizione appuntamenti</label>
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:8 }}>
                {([
                  { k:"block",  icon:"⛔", label:"Blocco duro",       desc:"Impedisce la creazione se c'è sovrapposizione" },
                  { k:"warn",   icon:"⚠️", label:"Avviso + conferma", desc:"Avvisa ma lascia procedere" },
                  { k:"visual", icon:"👁️", label:"Solo visuale",      desc:"Nessun blocco" },
                ] as const).map(opt => (
                  <button key={opt.k} onClick={() => setOverlapMode(opt.k)}
                    style={{
                      width:"100%", padding:"11px 14px", borderRadius:10, cursor:"pointer", fontFamily:"inherit",
                      border: overlapMode===opt.k ? `2px solid ${opt.k==="block"?"#dc2626":opt.k==="warn"?"#f59e0b":THEME.teal}` : `1.5px solid ${THEME.border}`,
                      background: overlapMode===opt.k ? (opt.k==="block"?"rgba(220,38,38,0.06)":opt.k==="warn"?"rgba(245,158,11,0.06)":"rgba(13,148,136,0.06)") : "#fff",
                      textAlign:"left", display:"flex", alignItems:"center", gap:10,
                    }}>
                    <span style={{ fontSize:18 }}>{opt.icon}</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13, color:THEME.text }}>{opt.label}</div>
                      <div style={{ fontSize:11, color:THEME.muted }}>{opt.desc}</div>
                    </div>
                    {overlapMode===opt.k && <span style={{ marginLeft:"auto", fontSize:14 }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section id="password" title="Cambio Password" sub="Aggiorna le credenziali di accesso">
          <div style={{ display:"flex", flexDirection:"column", gap:12, paddingTop:14 }}>
            {pwError && <div style={{ padding:"9px 14px", borderRadius:8, background:"rgba(220,38,38,0.05)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>{pwError}</div>}
            {pwSuccess && <div style={{ padding:"9px 14px", borderRadius:8, background:"rgba(22,163,74,0.06)", border:"1px solid rgba(22,163,74,0.2)", color:THEME.green, fontWeight:600, fontSize:13 }}>{pwSuccess}</div>}
            <div><label style={lbl}>Nuova password</label><input type="password" value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder="Minimo 8 caratteri" style={inp}/></div>
            <div><label style={lbl}>Conferma password</label><input type="password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} placeholder="Ripeti la nuova password" style={inp}/></div>
            <button onClick={changePassword} disabled={pwSaving||!pwNew||!pwConfirm} style={{ padding:"13px", borderRadius:10, border:"none", background:THEME.blue, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", opacity:pwSaving?0.6:1 }}>
              {pwSaving?"Aggiornamento…":"Aggiorna password"}
            </button>
          </div>
        </Section>

        {/* Salva tutto */}
        <button onClick={save} disabled={saving} style={{ width:"100%", padding:"16px", borderRadius:14, border:"none", background:THEME.gradient, color:"#fff", fontWeight:800, fontSize:15, cursor:saving?"wait":"pointer", opacity:saving?0.7:1, marginBottom:12 }}>
          {saving?"Salvataggio in corso…":"💾 Salva tutte le impostazioni"}
        </button>

        <div style={{ textAlign:"center", fontSize:11, color:THEME.gray, paddingBottom:8 }}>FisioHub · {new Date().getFullYear()}</div>
      </div>

      {/* Modal Catalogo Trattamenti (fullscreen) */}
      {treatmentModalOpen && editingTreatment && (
        <div
          style={{
            position:"fixed", inset:0, background:"#fff", zIndex:50,
            display:"flex", flexDirection:"column",
            animation:"slideUp 0.18s ease-out",
          }}
        >
          <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

          {/* Header modal */}
          <div style={{ background:THEME.gradient, padding:"14px 18px", display:"flex", alignItems:"center", gap:12 }}>
            <button
              onClick={closeTreatmentModal}
              style={{ background:"rgba(255,255,255,0.2)", border:"1.5px solid rgba(255,255,255,0.3)", borderRadius:8, color:"#fff", fontWeight:700, fontSize:18, cursor:"pointer", padding:"4px 12px", lineHeight:1 }}
            >×</button>
            <div style={{ fontWeight:800, fontSize:16, color:"#fff" }}>
              {editingTreatment.id ? "Modifica trattamento" : "Nuovo trattamento"}
            </div>
          </div>

          {/* Body modal scrollable */}
          <div style={{ flex:1, overflowY:"auto", padding:"18px", paddingBottom:100 }}>
            {error && (
              <div style={{ marginBottom:14, padding:"10px 14px", borderRadius:10, background:"rgba(220,38,38,0.06)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>{error}</div>
            )}

            {editingTreatment.isBuiltin && (
              <div style={{ marginBottom:14, padding:"10px 14px", borderRadius:10, background:"#f1f5f9", border:`1px solid ${THEME.border}`, color:THEME.muted, fontSize:12 }}>
                Voce di sistema — puoi modificare tutto.
              </div>
            )}

            {/* Nome */}
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Nome trattamento</label>
              <input
                value={editingTreatment.label}
                onChange={e=>setEditingTreatment(prev=>prev ? {...prev, label:e.target.value} : prev)}
                placeholder="Es. Linfodrenaggio Vodder"
                style={inp}
                disabled={savingTreatment}
              />
            </div>

            {/* Colore */}
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Colore</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:4 }}>
                {COLOR_PALETTE.map(c => {
                  const selected = editingTreatment.color === c.value;
                  return (
                    <button
                      key={c.value}
                      onClick={()=>setEditingTreatment(prev=>prev ? {...prev, color:c.value} : prev)}
                      title={c.name}
                      disabled={savingTreatment}
                      style={{
                        width:36, height:36, borderRadius:"50%",
                        background:c.value,
                        border: selected ? `3px solid ${THEME.text}` : "2px solid rgba(0,0,0,0.06)",
                        cursor:"pointer",
                        transform: selected ? "scale(1.1)" : "scale(1)",
                        transition:"transform 0.1s",
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Prezzi */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              <div>
                <label style={lbl}>Con ricevuta (€)</label>
                <input
                  value={editingTreatment.priceInvoice}
                  onChange={e=>setEditingTreatment(prev=>prev ? {...prev, priceInvoice:e.target.value} : prev)}
                  placeholder="0.00"
                  inputMode="decimal"
                  style={{ ...inp, textAlign:"right", fontWeight:700 }}
                  disabled={savingTreatment}
                />
              </div>
              <div>
                <label style={lbl}>In contanti (€)</label>
                <input
                  value={editingTreatment.priceCash}
                  onChange={e=>setEditingTreatment(prev=>prev ? {...prev, priceCash:e.target.value} : prev)}
                  placeholder="0.00"
                  inputMode="decimal"
                  style={{ ...inp, textAlign:"right", fontWeight:700 }}
                  disabled={savingTreatment}
                />
              </div>
            </div>

            {/* Durata */}
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Durata (minuti)</label>
              <input
                value={editingTreatment.durationMin}
                onChange={e=>setEditingTreatment(prev=>prev ? {...prev, durationMin:e.target.value} : prev)}
                placeholder="30"
                inputMode="numeric"
                style={{ ...inp, maxWidth:140, textAlign:"right", fontWeight:700 }}
                disabled={savingTreatment}
              />
            </div>

            {/* Switch attivo */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"14px 16px", borderRadius:10, border:`1px solid ${THEME.border}`, background:THEME.panelSoft, marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:THEME.text }}>Attivo</div>
                <div style={{ fontSize:11, color:THEME.muted, marginTop:2 }}>Se disattivato non compare nei selettori del calendario.</div>
              </div>
              <button
                onClick={()=>setEditingTreatment(prev=>prev ? {...prev, isActive:!prev.isActive} : prev)}
                disabled={savingTreatment}
                style={{
                  width:48, height:28, borderRadius:14, border:"none",
                  background: editingTreatment.isActive ? THEME.teal : THEME.gray,
                  position:"relative", cursor:"pointer", flexShrink:0,
                }}
              >
                <span style={{
                  position:"absolute", top:2, left: editingTreatment.isActive ? 22 : 2,
                  width:24, height:24, borderRadius:"50%", background:"#fff",
                  transition:"left 0.15s",
                }} />
              </button>
            </div>
          </div>

          {/* Footer modal sticky */}
          <div style={{ borderTop:`1px solid ${THEME.border}`, padding:"12px 16px", display:"flex", gap:10, background:"#fff", boxShadow:"0 -2px 10px rgba(0,0,0,0.04)" }}>
            <button
              onClick={closeTreatmentModal}
              disabled={savingTreatment}
              style={{ flex:1, padding:"13px", borderRadius:10, border:`1.5px solid ${THEME.border}`, background:"#fff", color:THEME.muted, fontWeight:700, fontSize:14, cursor:"pointer" }}
            >Annulla</button>
            <button
              onClick={()=>void saveTreatment()}
              disabled={savingTreatment}
              style={{ flex:2, padding:"13px", borderRadius:10, border:"none", background:THEME.gradient, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", opacity:savingTreatment?0.6:1 }}
            >
              {savingTreatment ? "Salvataggio…" : (editingTreatment.id ? "Salva modifiche" : "Crea trattamento")}
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav style={{ position:"fixed", bottom:0, left:0, right:0, height:58, background:"#fff", borderTop:`1px solid ${THEME.border}`, display:"flex", zIndex:30 }}>
        {[{href:"/mobile",label:"Home",icon:"⌂"},{href:"/mobile/calendar",label:"Calendario",icon:"▦"},{href:"/mobile/patients",label:"Pazienti",icon:"◉"},{href:"/mobile/reports",label:"Report",icon:"◈"},{href:"/mobile/settings",label:"Impost.",icon:"⚙",active:true}].map(item=>(
          <Link key={item.href} href={item.href} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, textDecoration:"none" }}>
            <span style={{ fontSize:18, lineHeight:1, ...(item as any).active?{background:THEME.gradient,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}:{color:THEME.gray} }}>{item.icon}</span>
            <span style={{ fontSize:10, fontWeight:(item as any).active?700:500, color:(item as any).active?THEME.blue:THEME.gray }}>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
