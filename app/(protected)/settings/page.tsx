"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEME = {
  appBg:     "#f1f5f9",
  panelBg:   "#ffffff",
  panelSoft: "#f7f9fd",
  text:      "#0f172a",
  textSoft:  "#1e293b",
  muted:     "#334155",
  border:    "#cbd5e1",
  blue:      "#2563eb",
  blueDark:  "#1e40af",
  green:     "#16a34a",
  teal:      "#0d9488",
  red:       "#dc2626",
  amber:     "#f97316",
  gray:      "#94a3b8",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type MessageTemplate = {
  id: string;
  name: string;
  template: string;
  is_default: boolean;
  created_at: string;
};

type PracticeSettingsRow = {
  owner_id: string;
  practice_name: string | null;
  owner_full_name: string | null;
  vat_number: string | null;
  address: string | null;
  pec_email: string | null;
  phone: string | null;
  standard_invoice: number | null;
  standard_cash: number | null;
  machine_invoice: number | null;
  machine_cash: number | null;
  auto_apply_prices: boolean | null;
  created_at?: string;
  updated_at?: string;
};

// ─── Utils ────────────────────────────────────────────────────────────────────
function toMoneyString(n: number | null | undefined, fallback: string) {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return n.toFixed(2);
}
function toNumberSafe(s: string, fallback: number) {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}
function validatePrice(value: string): string {
  const clean = value.replace(/[^\d.,]/g, "");
  const normalized = clean.replace(",", ".");
  const parts = normalized.split(".");
  if (parts.length > 1) return `${parts[0]}.${parts[1].slice(0, 2)}`;
  return normalized || "0.00";
}
function formatPreview(template: string): string {
  return template
    .replace(/{nome}/g, "Marco")
    .replace(/{data_relativa}/g, "Oggi")
    .replace(/{ora}/g, "10:30")
    .replace(/{luogo}/g, "Studio Pontecorvo, Via Galileo Galilei 5");
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SettingsPage() {

  // ── Auth / user menu ──────────────────────────────────────────────────────
  const [userEmail, setUserEmail]       = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => { const { data } = await supabase.auth.getUser(); setUserEmail(data?.user?.email ?? null); })();
  }, []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!userMenuOpen) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);
  const handleLogout = useCallback(async () => {
    try { await supabase.auth.signOut(); } finally { setUserMenuOpen(false); window.location.href = "/login"; }
  }, []);
  const userInitials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "?";

  // ── State ─────────────────────────────────────────────────────────────────
  const [templates, setTemplates]               = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingPractice, setLoadingPractice]   = useState(true);
  const [savingPractice, setSavingPractice]     = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  // Template edit
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [newName, setNewName]           = useState("");
  const [newTemplate, setNewTemplate]   = useState("");
  const [addingNew, setAddingNew]       = useState(false);

  // Section open/close
  const [showPractice,  setShowPractice]  = useState(true);
  const [showPrices,    setShowPrices]    = useState(true);
  const [showTemplates, setShowTemplates] = useState(true);

  // Practice fields
  const [practiceName,   setPracticeName]   = useState("");
  const [ownerFullName,  setOwnerFullName]  = useState("");
  const [vatNumber,      setVatNumber]      = useState("");
  const [address,        setAddress]        = useState("");
  const [pecEmail,       setPecEmail]       = useState("");
  const [phone,          setPhone]          = useState("");

  // Price fields
  const [standardInvoice, setStandardInvoice] = useState("40.00");
  const [standardCash,    setStandardCash]    = useState("35.00");
  const [machineInvoice,  setMachineInvoice]  = useState("25.00");
  const [machineCash,     setMachineCash]     = useState("20.00");
  const [autoApplyPrices, setAutoApplyPrices] = useState(true);

  useEffect(() => {
    void (async () => {
      setError("");
      await Promise.all([loadPracticeSettings(), loadTemplates()]);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flashSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  }

  async function requireUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    const uid = data?.user?.id;
    if (!uid) throw new Error("Utente non autenticato.");
    return uid;
  }

  async function loadPracticeSettings() {
    setLoadingPractice(true);
    setError("");
    try {
      const uid = await requireUserId();
      const { data, error } = await supabase
        .from("practice_settings")
        .select("owner_id, practice_name, owner_full_name, vat_number, address, pec_email, phone, standard_invoice, standard_cash, machine_invoice, machine_cash, auto_apply_prices")
        .eq("owner_id", uid)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        const { data: uData, error: uErr } = await supabase.auth.getUser();
        if (uErr) throw new Error(uErr.message);
        const u = uData?.user;
        const fullName = ((u?.user_metadata?.full_name || u?.user_metadata?.name || [u?.user_metadata?.first_name, u?.user_metadata?.last_name].filter(Boolean).join(" ") || u?.email || "Titolare") + "").trim() || "Titolare";
        const seed: PracticeSettingsRow = { owner_id: uid, practice_name: "FisioHub", owner_full_name: fullName, vat_number: "", address: "", pec_email: "", phone: "", standard_invoice: 40, standard_cash: 35, machine_invoice: 25, machine_cash: 20, auto_apply_prices: true };
        const { error: upsertErr } = await supabase.from("practice_settings").upsert(seed, { onConflict: "owner_id" });
        if (upsertErr) throw new Error(upsertErr.message);
        return await loadPracticeSettings();
      }
      setPracticeName(data.practice_name ?? "");
      setOwnerFullName(data.owner_full_name ?? "");
      setVatNumber(data.vat_number ?? "");
      setAddress(data.address ?? "");
      setPecEmail(data.pec_email ?? "");
      setPhone(data.phone ?? "");
      setStandardInvoice(toMoneyString(data.standard_invoice, "40.00"));
      setStandardCash(toMoneyString(data.standard_cash, "35.00"));
      setMachineInvoice(toMoneyString(data.machine_invoice, "25.00"));
      setMachineCash(toMoneyString(data.machine_cash, "20.00"));
      setAutoApplyPrices(data.auto_apply_prices ?? true);
    } catch (e: any) {
      setError(e?.message ?? "Errore nel caricamento impostazioni.");
    } finally {
      setLoadingPractice(false);
    }
  }

  async function savePracticeSettings() {
    setSavingPractice(true);
    setError("");
    try {
      const uid = await requireUserId();
      const payload: PracticeSettingsRow = {
        owner_id:        uid,
        practice_name:   practiceName.trim() || "FisioHub",
        owner_full_name: ownerFullName.trim() || "Titolare",
        vat_number:      vatNumber.trim() || "",
        address:         address.trim() || "",
        pec_email:       pecEmail.trim() || "",
        phone:           phone.trim() || "",
        standard_invoice: toNumberSafe(standardInvoice, 40),
        standard_cash:    toNumberSafe(standardCash, 35),
        machine_invoice:  toNumberSafe(machineInvoice, 25),
        machine_cash:     toNumberSafe(machineCash, 20),
        auto_apply_prices: autoApplyPrices,
      };
      const { error } = await supabase.from("practice_settings").upsert(payload, { onConflict: "owner_id" });
      if (error) throw new Error(error.message);
      flashSuccess("Impostazioni salvate.");
    } catch (e: any) {
      setError(e?.message ?? "Errore nel salvataggio.");
    } finally {
      setSavingPractice(false);
    }
  }

  async function loadTemplates() {
    setLoadingTemplates(true);
    setError("");
    try {
      const { data, error } = await supabase.from("message_templates").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      setTemplates((data as MessageTemplate[]) || []);
    } catch (e: any) {
      setError(e?.message ?? "Errore nel caricamento dei template");
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function saveTemplate(id: string) {
    if (!editName.trim() || !editTemplate.trim()) { setError("Nome e template sono obbligatori"); return; }
    setError("");
    try {
      const { error } = await supabase.from("message_templates").update({ name: editName.trim(), template: editTemplate.trim(), updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
      flashSuccess("Template salvato.");
      setEditingId(null);
      await loadTemplates();
    } catch (e: any) { setError(e?.message ?? "Errore nel salvataggio del template"); }
  }

  async function deleteTemplate(id: string) {
    if (templates.length <= 1) { setError("Non puoi eliminare l'unico template disponibile"); return; }
    const t = templates.find(t => t.id === id);
    if (!t) return;
    if (!confirm("Eliminare questo template? L'operazione non può essere annullata.")) return;
    setError("");
    try {
      if (t.is_default) {
        const other = templates.find(x => x.id !== id);
        if (other) { const { error: e1 } = await supabase.from("message_templates").update({ is_default: true }).eq("id", other.id); if (e1) throw new Error(e1.message); }
      }
      const { error } = await supabase.from("message_templates").delete().eq("id", id);
      if (error) throw new Error(error.message);
      flashSuccess("Template eliminato.");
      await loadTemplates();
    } catch (e: any) { setError(e?.message ?? "Errore nell'eliminazione"); }
  }

  async function setAsDefault(id: string) {
    setError("");
    try {
      const { error: e1 } = await supabase.from("message_templates").update({ is_default: false }).neq("id", id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase.from("message_templates").update({ is_default: true }).eq("id", id);
      if (e2) throw new Error(e2.message);
      flashSuccess("Template impostato come predefinito.");
      await loadTemplates();
    } catch (e: any) { setError(e?.message ?? "Errore"); }
  }

  async function createNewTemplate() {
    if (!newName.trim() || !newTemplate.trim()) { setError("Nome e template sono obbligatori"); return; }
    setError("");
    try {
      const { error } = await supabase.from("message_templates").insert({ name: newName.trim(), template: newTemplate.trim(), is_default: templates.length === 0 });
      if (error) throw new Error(error.message);
      flashSuccess("Nuovo template creato.");
      setNewName(""); setNewTemplate(""); setAddingNew(false);
      await loadTemplates();
    } catch (e: any) { setError(e?.message ?? "Errore nella creazione"); }
  }

  // ─── Shared styles ────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 7,
    border: `1.5px solid ${THEME.border}`, fontSize: 13, fontWeight: 500,
    outline: "none", background: "#fff", color: THEME.text, boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 700,
    color: THEME.muted, marginBottom: 4,
    textTransform: "uppercase", letterSpacing: 0.4,
  };
  const cardStyle: React.CSSProperties = {
    background: THEME.panelBg, borderRadius: 12,
    border: `1px solid ${THEME.border}`,
    boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
    overflow: "hidden", marginBottom: 16,
  };
  const sectionHead: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px", cursor: "pointer",
    borderBottom: `1px solid ${THEME.border}`,
  };

  const btnPrimary = (label: string, onClick: () => void, disabled = false): React.ReactNode => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "9px 20px", borderRadius: 7, border: "none",
      background: disabled ? THEME.gray : "linear-gradient(135deg, #0d9488, #2563eb)",
      color: "#fff", fontWeight: 700, fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer",
      boxShadow: disabled ? "none" : "0 2px 8px rgba(13,148,136,0.2)",
    }}>{label}</button>
  );
  const btnOutline = (label: string, onClick: () => void, color = THEME.muted, disabled = false): React.ReactNode => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "9px 16px", borderRadius: 7, border: `1px solid ${THEME.border}`,
      background: "#fff", color, fontWeight: 700, fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif" }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        *{-webkit-font-smoothing:antialiased;box-sizing:border-box;}
        body{font-family:'Outfit','Segoe UI',system-ui,sans-serif;margin:0;background:${THEME.appBg};}
        a{text-decoration:none;}
        select,input,textarea,button{font-family:inherit;}
        input:focus,select:focus,textarea:focus{border-color:${THEME.blue}!important;box-shadow:0 0 0 3px rgba(37,99,235,0.10)!important;outline:none!important;}
        @media(min-width:768px)and(max-width:1024px){.th{display:none!important}}
      `}</style>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{ position:"sticky", top:0, zIndex:30, background:"linear-gradient(135deg,#0d9488,#2563eb)", padding:"0 20px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:"0 2px 12px rgba(13,148,136,0.18)", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:20, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:"rgba(255,255,255,0.2)", border:"1.5px solid rgba(255,255,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:14 }}>F</div>
            <span style={{ fontWeight:700, fontSize:15, color:"#fff", letterSpacing:0.5, textTransform:"uppercase" }}>Fisio<span style={{ fontWeight:800 }}>Hub</span></span>
          </div>
          <nav style={{ display:"flex", gap:2 }}>
            {([
              { href:"/",         label:"Home",          active:false },
              { href:"/calendar", label:"Calendario",    active:false },
              { href:"/reports",  label:"Report",        active:false },
              { href:"/patients", label:"Pazienti",      active:false },
              { href:"/settings", label:"Impostazioni",  active:true  },
            ] as const).map(item => (
              <Link key={item.href} href={item.href} style={{ padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:700, background:item.active?"rgba(255,255,255,0.2)":"transparent", color:item.active?"#fff":"rgba(255,255,255,0.8)", letterSpacing:0.3 }}>
                <span className="th">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          <div ref={userMenuRef} style={{ position:"relative" }}>
            <button onClick={() => setUserMenuOpen(v => !v)} style={{ width:32, height:32, borderRadius:8, border:"1.5px solid rgba(255,255,255,0.35)", background:"rgba(255,255,255,0.2)", color:"#fff", fontWeight:800, fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>{userInitials}</button>
            {userMenuOpen && (
              <div style={{ position:"absolute", right:0, top:"calc(100% + 8px)", width:200, background:"#fff", border:`1px solid ${THEME.border}`, borderRadius:10, boxShadow:"0 8px 24px rgba(15,23,42,0.10)", overflow:"hidden", zIndex:60 }}>
                <div style={{ padding:"11px 16px", borderBottom:`1px solid ${THEME.border}`, fontSize:12, color:THEME.muted }}>{userEmail}</div>
                <button onClick={handleLogout} style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"11px 16px", background:"transparent", border:"none", cursor:"pointer", color:THEME.red, fontWeight:600, fontSize:13 }}>Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ━━━ MAIN ━━━ */}
      <main style={{ padding:"28px 32px", maxWidth:900, margin:"0 auto" }}>

        {/* Page title */}
        <div style={{ marginBottom:24 }}>
          <h1 style={{ margin:0, fontWeight:800, fontSize:24, color:THEME.text, letterSpacing:-0.4 }}>Impostazioni</h1>
          <p style={{ margin:"4px 0 0", fontSize:13, color:THEME.muted }}>Dati studio · Tariffe trattamenti · Template WhatsApp</p>
        </div>

        {/* Feedback banners */}
        {error && (
          <div style={{ marginBottom:16, padding:"11px 16px", borderRadius:8, background:"rgba(220,38,38,0.05)", border:"1px solid rgba(220,38,38,0.2)", color:THEME.red, fontWeight:600, fontSize:13 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ marginBottom:16, padding:"11px 16px", borderRadius:8, background:"rgba(22,163,74,0.06)", border:"1px solid rgba(22,163,74,0.2)", color:THEME.green, fontWeight:600, fontSize:13 }}>
            {success}
          </div>
        )}

        {/* ── SEZIONE STUDIO ─────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowPractice(!showPractice)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Dati Studio</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>
                {loadingPractice ? "Caricamento…" : "Anagrafica e contatti dello studio"}
              </div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showPractice?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>

          {showPractice && (
            <div style={{ padding:"20px", opacity:loadingPractice ? 0.7 : 1 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:20 }}>
                {[
                  { label:"Nome studio",            value:practiceName,  set:setPracticeName  },
                  { label:"Titolare (nome cognome)", value:ownerFullName, set:setOwnerFullName },
                  { label:"Partita IVA",             value:vatNumber,     set:setVatNumber     },
                  { label:"Telefono studio",         value:phone,         set:setPhone         },
                  { label:"PEC",                     value:pecEmail,      set:setPecEmail      },
                ].map(f => (
                  <div key={f.label}>
                    <label style={labelStyle}>{f.label}</label>
                    <input value={f.value} onChange={e => f.set(e.target.value)} style={inputStyle} />
                  </div>
                ))}
                <div style={{ gridColumn:"1 / -1" }}>
                  <label style={labelStyle}>Indirizzo</label>
                  <input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                {btnOutline("Ricarica", () => void loadPracticeSettings(), THEME.muted, loadingPractice || savingPractice)}
                {btnPrimary(savingPractice ? "Salvataggio…" : "Salva dati studio", () => void savePracticeSettings(), loadingPractice || savingPractice)}
              </div>
            </div>
          )}
        </div>

        {/* ── SEZIONE TARIFFE ─────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowPrices(!showPrices)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Tariffe Trattamenti</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>
                {autoApplyPrices ? "Auto-applica attivo" : "Auto-applica disattivo"}
              </div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showPrices?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>

          {showPrices && (
            <div style={{ padding:"20px", opacity:loadingPractice ? 0.7 : 1 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
                {[
                  { title:"Seduta Standard",   subtitle:"Trattamento completo",  iv:standardInvoice, setIv:setStandardInvoice, cv:standardCash, setCv:setStandardCash, accentColor:THEME.blue },
                  { title:"Solo Macchinario",  subtitle:"Terapia strumentale",   iv:machineInvoice,  setIv:setMachineInvoice,  cv:machineCash,  setCv:setMachineCash,  accentColor:THEME.teal },
                ].map(pc => (
                  <div key={pc.title} style={{ padding:18, borderRadius:10, border:`1px solid ${THEME.border}`, background:THEME.panelSoft }}>
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:THEME.text }}>{pc.title}</div>
                      <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>{pc.subtitle}</div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      <div>
                        <label style={labelStyle}>Con ricevuta</label>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:THEME.muted }}>€</span>
                          <input value={pc.iv} onChange={e => pc.setIv(validatePrice(e.target.value))} style={{ ...inputStyle, textAlign:"right", fontWeight:700, fontSize:15 }} />
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>In contanti</label>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:THEME.muted }}>€</span>
                          <input value={pc.cv} onChange={e => pc.setCv(validatePrice(e.target.value))} style={{ ...inputStyle, textAlign:"right", fontWeight:700, fontSize:15 }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"14px 16px", borderRadius:8, border:`1px solid ${THEME.border}`, background:"#fff", marginBottom:20 }}>
                <input type="checkbox" id="auto-apply" checked={autoApplyPrices} onChange={e => setAutoApplyPrices(e.target.checked)} style={{ width:16, height:16, marginTop:2, cursor:"pointer", accentColor:THEME.teal }} />
                <label htmlFor="auto-apply" style={{ cursor:"pointer" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:THEME.text }}>Applica automaticamente nei nuovi appuntamenti</div>
                  <div style={{ fontSize:12, color:THEME.muted, marginTop:3 }}>Se disattivato, selezioni il prezzo manualmente per ogni appuntamento.</div>
                </label>
              </div>

              <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                {btnOutline("Ricarica", () => void loadPracticeSettings(), THEME.muted, loadingPractice || savingPractice)}
                {btnPrimary(savingPractice ? "Salvataggio…" : "Salva tariffe", () => void savePracticeSettings(), loadingPractice || savingPractice)}
              </div>
            </div>
          )}
        </div>

        {/* ── SEZIONE TEMPLATE ─────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionHead} onClick={() => setShowTemplates(!showTemplates)}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:THEME.text }}>Template WhatsApp</div>
              <div style={{ fontSize:12, color:THEME.muted, marginTop:2 }}>{templates.length} template configurati</div>
            </div>
            <span style={{ color:THEME.muted, fontSize:12, transform:showTemplates?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
          </div>

          {showTemplates && (
            <div style={{ padding:"20px" }}>

              {/* Placeholder info */}
              <div style={{ padding:"12px 16px", borderRadius:8, background:THEME.panelSoft, border:`1px solid ${THEME.border}`, marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:THEME.muted, marginBottom:8, textTransform:"uppercase", letterSpacing:0.4 }}>Placeholder disponibili</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {["{nome}", "{data_relativa}", "{ora}", "{luogo}"].map(p => (
                    <code key={p} style={{ background:THEME.text, color:"#fff", padding:"3px 8px", borderRadius:5, fontSize:12, fontWeight:600 }}>{p}</code>
                  ))}
                </div>
                <div style={{ marginTop:8, fontSize:11, color:THEME.muted }}>Vengono sostituiti automaticamente con i dati del paziente e dell&apos;appuntamento.</div>
              </div>

              {/* Aggiungi nuovo */}
              <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:addingNew ? 12 : 16 }}>
                <button onClick={() => setAddingNew(!addingNew)} style={{ padding:"9px 16px", borderRadius:7, border:`1.5px solid ${THEME.teal}`, background:addingNew ? "#fff" : THEME.teal, color:addingNew ? THEME.teal : "#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  {addingNew ? "✕ Annulla" : "+ Nuovo template"}
                </button>
              </div>

              {addingNew && (
                <div style={{ padding:18, borderRadius:10, border:`1.5px solid ${THEME.teal}`, background:"rgba(13,148,136,0.03)", marginBottom:16 }}>
                  <div style={{ marginBottom:12 }}>
                    <label style={labelStyle}>Nome template *</label>
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Es. Promemoria standard" style={inputStyle} autoFocus />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={labelStyle}>Messaggio *</label>
                    <textarea value={newTemplate} onChange={e => setNewTemplate(e.target.value)} rows={6} style={{ ...inputStyle, resize:"vertical", fontFamily:"monospace", lineHeight:1.5 }} />
                  </div>
                  {newTemplate && (
                    <div style={{ marginBottom:12, padding:12, borderRadius:8, background:"#fff", border:`1px solid ${THEME.border}` }}>
                      <div style={{ fontSize:11, fontWeight:700, color:THEME.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:0.4 }}>Anteprima</div>
                      <div style={{ fontSize:13, whiteSpace:"pre-wrap", color:THEME.textSoft, lineHeight:1.5 }}>{formatPreview(newTemplate)}</div>
                    </div>
                  )}
                  <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                    {btnOutline("Annulla", () => { setNewName(""); setNewTemplate(""); setAddingNew(false); })}
                    {btnPrimary("Crea template", () => void createNewTemplate())}
                  </div>
                </div>
              )}

              {/* Lista template */}
              {loadingTemplates ? (
                <div style={{ padding:"24px 0", textAlign:"center", color:THEME.muted, fontSize:13 }}>Caricamento template…</div>
              ) : templates.length === 0 ? (
                <div style={{ padding:"24px 0", textAlign:"center", color:THEME.muted, fontSize:13 }}>Nessun template configurato.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {templates.map(template => (
                    <div key={template.id} style={{ padding:16, borderRadius:10, border:`1.5px solid ${template.is_default ? THEME.teal : THEME.border}`, background:template.is_default ? "rgba(13,148,136,0.03)" : "#fff", position:"relative" }}>

                      {template.is_default && (
                        <div style={{ position:"absolute", top:-1, right:12, background:THEME.teal, color:"#fff", fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:"0 0 6px 6px", letterSpacing:0.5 }}>
                          PREDEFINITO
                        </div>
                      )}

                      {editingId === template.id ? (
                        <div>
                          <div style={{ marginBottom:10 }}>
                            <label style={labelStyle}>Nome</label>
                            <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                          </div>
                          <div style={{ marginBottom:10 }}>
                            <label style={labelStyle}>Messaggio</label>
                            <textarea value={editTemplate} onChange={e => setEditTemplate(e.target.value)} rows={6} style={{ ...inputStyle, resize:"vertical", fontFamily:"monospace", lineHeight:1.5 }} />
                          </div>
                          {editTemplate && (
                            <div style={{ marginBottom:10, padding:12, borderRadius:8, background:THEME.panelSoft, border:`1px solid ${THEME.border}` }}>
                              <div style={{ fontSize:11, fontWeight:700, color:THEME.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:0.4 }}>Anteprima</div>
                              <div style={{ fontSize:13, whiteSpace:"pre-wrap", color:THEME.textSoft, lineHeight:1.5 }}>{formatPreview(editTemplate)}</div>
                            </div>
                          )}
                          <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                            {btnOutline("Annulla", () => setEditingId(null))}
                            {btnPrimary("Salva modifiche", () => void saveTemplate(template.id))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:10 }}>
                            <div>
                              <div style={{ fontWeight:700, fontSize:14, color:THEME.text }}>{template.name}</div>
                              <div style={{ fontSize:11, color:THEME.muted, marginTop:2 }}>Creato: {new Date(template.created_at).toLocaleDateString("it-IT")}</div>
                            </div>
                            <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                              <button onClick={() => { setEditingId(template.id); setEditName(template.name); setEditTemplate(template.template); }} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${THEME.blue}`, background:THEME.blue, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>Modifica</button>
                              <button onClick={() => void setAsDefault(template.id)} disabled={template.is_default} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${THEME.border}`, background:"#fff", color:template.is_default?THEME.gray:THEME.teal, fontWeight:700, fontSize:12, cursor:template.is_default?"not-allowed":"pointer", opacity:template.is_default?0.5:1 }}>Predefinito</button>
                              <button onClick={() => void deleteTemplate(template.id)} disabled={templates.length <= 1} style={{ padding:"5px 12px", borderRadius:6, border:`1px solid ${THEME.border}`, background:"#fff", color:templates.length<=1?THEME.gray:THEME.red, fontWeight:700, fontSize:12, cursor:templates.length<=1?"not-allowed":"pointer", opacity:templates.length<=1?0.5:1 }}>Elimina</button>
                            </div>
                          </div>
                          <div style={{ fontSize:13, whiteSpace:"pre-wrap", color:THEME.muted, background:THEME.panelSoft, padding:"10px 14px", borderRadius:8, border:`1px solid ${THEME.border}`, lineHeight:1.5 }}>
                            {template.template}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ textAlign:"center", fontSize:12, color:THEME.muted, padding:"8px 0 16px" }}>
          FisioHub · {new Date().getFullYear()}
        </div>
      </main>
    </div>
  );
}
