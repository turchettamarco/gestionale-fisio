"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudioId } from "@/src/contexts/StudioContext";

// ─── Types ────────────────────────────────────────────────────────────────────
type Plan = "invoice" | "no_invoice";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  birth_date: string | null;
  tax_code: string | null;
  residence_city: string | null;
  preferred_plan: Plan | null;
  created_at?: string;
};

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEME = {
  appBg:      "#f1f5f9",
  panelBg:    "#ffffff",
  panelSoft:  "#f7f9fd",
  text:       "#0f172a",
  textSoft:   "#1e293b",
  muted:      "#334155",
  border:     "#cbd5e1",
  blue:       "#2563eb",
  blueDark:   "#1e40af",
  green:      "#16a34a",
  greenDark:  "#15803d",
  teal:       "#0d9488",
  red:        "#dc2626",
  amber:      "#f97316",
  gray:       "#94a3b8",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function PatientsPage() {

  // Studio corrente (multi-tenancy)
  const currentStudioId = useCurrentStudioId();

  // ── Auth / user menu ──────────────────────────────────────────────────────
  const [userEmail, setUserEmail]       = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data?.user?.email ?? null);
    })();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!userMenuOpen) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  const handleLogout = useCallback(async () => {
    try { await supabase.auth.signOut(); } finally {
      setUserMenuOpen(false);
      window.location.href = "/login";
    }
  }, []);

  const userInitials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "?";

  // ── Data ──────────────────────────────────────────────────────────────────
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string>("");

  async function loadPatients() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .order("last_name", { ascending: true });
    if (error) setError(error.message);
    else setPatients((data ?? []) as Patient[]);
    setLoading(false);
  }

  useEffect(() => { loadPatients(); }, []);

  // ── Ricerca e filtri ───────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab]   = useState<"all" | "incomplete">("all");

  const patientsToComplete = useMemo(() => {
    const incomplete = patients.filter(p => !p.tax_code || !p.phone || !p.birth_date);
    return [...incomplete].sort((a, b) => (!a.phone ? -1 : 0) - (!b.phone ? -1 : 0));
  }, [patients]);

  const visiblePatients = useMemo(() => {
    const base = activeTab === "incomplete" ? patientsToComplete : patients;
    if (!searchTerm.trim()) return base;
    const term = searchTerm.toLowerCase().trim();
    return base.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(term) ||
      (p.phone ?? "").includes(term)
    );
  }, [patients, patientsToComplete, searchTerm, activeTab]);

  // ── Drawer nuovo paziente ─────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen]               = useState(false);
  const [showClinicalFields, setShowClinicalFields] = useState(false);
  const [showBusinessFields, setShowBusinessFields] = useState(false);

  const [firstName,          setFirstName]          = useState("");
  const [lastName,           setLastName]            = useState("");
  const [phone,              setPhone]               = useState("");
  const [birthDate,          setBirthDate]           = useState("");
  const [taxCode,            setTaxCode]             = useState("");
  const [residenceCity,      setResidenceCity]       = useState("");
  const [patientStatus,      setPatientStatus]       = useState<"lead"|"active"|"paused"|"follow_up"|"discharged">("active");
  const [acquisitionChannel, setAcquisitionChannel]  = useState<""|"passaparola"|"medico"|"instagram"|"google"|"evento"|"altro">("");
  const [firstVisitDate,     setFirstVisitDate]      = useState("");
  const [mainComplaint,      setMainComplaint]       = useState("");
  const [bodyRegion,         setBodyRegion]          = useState<""|"cervicale"|"dorsale"|"lombare"|"spalla"|"gomito"|"polso_mano"|"anca"|"ginocchio"|"caviglia_piede"|"atm"|"neurologico"|"altro">("");
  const [side,               setSide]                = useState<""|"dx"|"sx"|"bilaterale">("");
  const [pathologyType,      setPathologyType]       = useState<""|"traumatico"|"degenerativo"|"post_chirurgico"|"neurologico"|"cronico"|"funzionale">("");
  const [medicalDiagnosis,   setMedicalDiagnosis]    = useState("");
  const [expectedFrequency,  setExpectedFrequency]   = useState("");
  const [packageSize,        setPackageSize]         = useState("");
  const [saving,             setSaving]              = useState(false);
  const [drawerError,        setDrawerError]         = useState("");

  function resetForm() {
    setFirstName(""); setLastName(""); setPhone(""); setBirthDate("");
    setTaxCode(""); setResidenceCity(""); setPatientStatus("active");
    setAcquisitionChannel(""); setFirstVisitDate(""); setMainComplaint("");
    setBodyRegion(""); setSide(""); setPathologyType(""); setMedicalDiagnosis("");
    setExpectedFrequency(""); setPackageSize("");
    setShowClinicalFields(false); setShowBusinessFields(false);
    setDrawerError("");
  }

  function openDrawer()  { resetForm(); setDrawerOpen(true);  }
  function closeDrawer() { setDrawerOpen(false); }

  async function createPatient(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !birthDate.trim()) {
      setDrawerError("Compila Nome, Cognome, Telefono e Data di nascita.");
      return;
    }
    setSaving(true);
    setDrawerError("");
    const { error } = await supabase.from("patients").insert({
      first_name:          firstName.trim(),
      last_name:           lastName.trim(),
      phone:               phone.trim(),
      birth_date:          birthDate.trim() || null,
      tax_code:            taxCode.trim() || null,
      residence_city:      residenceCity.trim() || null,
      patient_status:      patientStatus,
      acquisition_channel: acquisitionChannel || null,
      first_visit_date:    firstVisitDate.trim() || null,
      main_complaint:      mainComplaint.trim() || null,
      body_region:         bodyRegion || null,
      side:                side || null,
      pathology_type:      pathologyType || null,
      medical_diagnosis:   medicalDiagnosis.trim() || null,
      expected_frequency:  expectedFrequency.trim() ? Number(expectedFrequency) : null,
      package_size:        packageSize.trim() ? Number(packageSize) : null,
      studio_id:           currentStudioId,  // multi-tenancy
    });
    setSaving(false);
    if (!error) { closeDrawer(); await loadPatients(); }
    else setDrawerError(error.message);
  }

  // ── Stili condivisi ───────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    padding: "9px 12px", borderRadius: 7,
    border: `1.5px solid ${THEME.border}`,
    fontWeight: 500, fontSize: 13, outline: "none",
    background: "#fff", color: THEME.text,
    width: "100%", boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600,
    color: THEME.muted, marginBottom: 4,
    textTransform: "uppercase", letterSpacing: 0.4,
  };

  const tableHeaderStyle: React.CSSProperties = {
    textAlign: "left", padding: "10px 16px",
    fontSize: 11, color: THEME.muted, fontWeight: 600,
    borderBottom: `1px solid ${THEME.border}`,
    background: THEME.panelSoft,
    textTransform: "uppercase", letterSpacing: 0.5,
  };

  function missingBadges(p: Patient) {
    const items = [];
    if (!p.phone)      items.push({ label: "telefono", color: THEME.red,   bg: "rgba(220,38,38,0.08)"  });
    if (!p.tax_code)   items.push({ label: "CF",       color: THEME.muted, bg: "rgba(51,65,85,0.08)"   });
    if (!p.birth_date) items.push({ label: "nascita",  color: THEME.blue,  bg: "rgba(37,99,235,0.08)"  });
    return items;
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, fontFamily: "'Outfit', 'Segoe UI', system-ui, sans-serif" }}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        * { -webkit-font-smoothing: antialiased; box-sizing: border-box; }
        body { font-family: 'Outfit','Segoe UI',system-ui,sans-serif; margin:0; background:${THEME.appBg}; }
        select, input, textarea, button { font-family: inherit; }
        input:focus, select:focus, textarea:focus {
          border-color: ${THEME.blue} !important;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.10) !important;
          outline: none !important;
        }
        .row-hover:hover { background: rgba(37,99,235,0.03) !important; }
        .drawer-overlay {
          position: fixed; inset: 0;
          background: rgba(15,23,42,0.35);
          z-index: 40; backdrop-filter: blur(2px);
        }
        .drawer {
          position: fixed; top: 0; right: 0; height: 100vh;
          width: 520px; max-width: 95vw;
          background: #fff; z-index: 50;
          box-shadow: -8px 0 40px rgba(15,23,42,0.12);
          display: flex; flex-direction: column;
          transform: translateX(100%);
          transition: transform 260ms cubic-bezier(.4,0,.2,1);
        }
        .drawer.open { transform: translateX(0); }
        @media (min-width: 768px) and (max-width: 1199px) {
          .tab-hide    { display: none !important; }
          .tab-compact { font-size: 11px !important; padding: 3px 8px !important; }
          .tab-p       { padding: 20px 18px !important; }
        }
      `}</style>

      {/* ━━━ DRAWER ━━━ */}
      {drawerOpen && <div className="drawer-overlay" onClick={closeDrawer} />}
      <div className={`drawer ${drawerOpen ? "open" : ""}`}>
        <div style={{
          padding: "18px 24px",
          borderBottom: `1px solid ${THEME.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: THEME.text }}>Nuovo paziente</div>
            <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>I campi con * sono obbligatori</div>
          </div>
          <button onClick={closeDrawer} style={{
            width: 30, height: 30, borderRadius: 6,
            border: `1px solid ${THEME.border}`, background: "transparent",
            color: THEME.muted, cursor: "pointer", fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <form onSubmit={createPatient} id="new-patient-form">

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Nome *</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} required autoFocus />
              </div>
              <div>
                <label style={labelStyle}>Cognome *</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>Telefono *</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>Data di nascita *</label>
                <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>Codice Fiscale</label>
                <input value={taxCode} onChange={e => setTaxCode(e.target.value)} style={inputStyle} placeholder="Opzionale" />
              </div>
              <div>
                <label style={labelStyle}>Città</label>
                <input value={residenceCity} onChange={e => setResidenceCity(e.target.value)} style={inputStyle} placeholder="Opzionale" />
              </div>
            </div>

            {/* Sezione clinica */}
            <button type="button" onClick={() => setShowClinicalFields(v => !v)} style={{
              width: "100%", textAlign: "left",
              background: showClinicalFields ? "rgba(37,99,235,0.03)" : "transparent",
              border: `1px solid ${THEME.border}`,
              padding: "9px 14px", borderRadius: 7, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontWeight: 600, fontSize: 13, color: THEME.textSoft,
              marginBottom: showClinicalFields ? 12 : 10,
            }}>
              <span>Dati clinici iniziali</span>
              <span style={{ color: THEME.gray, fontSize: 11, fontWeight: 500 }}>
                {showClinicalFields ? "nascondi" : "mostra"}
              </span>
            </button>

            {showClinicalFields && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Motivo principale</label>
                  <textarea value={mainComplaint} onChange={e => setMainComplaint(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Es. dolore lombare da 3 settimane…" />
                </div>
                <div className="tab-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={labelStyle}>Distretto</label>
                    <select value={bodyRegion} onChange={e => setBodyRegion(e.target.value as any)} style={selectStyle}>
                      <option value="">—</option>
                      <option value="cervicale">Cervicale</option><option value="dorsale">Dorsale</option>
                      <option value="lombare">Lombare</option><option value="spalla">Spalla</option>
                      <option value="gomito">Gomito</option><option value="polso_mano">Polso / Mano</option>
                      <option value="anca">Anca</option><option value="ginocchio">Ginocchio</option>
                      <option value="caviglia_piede">Caviglia / Piede</option><option value="atm">ATM</option>
                      <option value="neurologico">Neurologico</option><option value="altro">Altro</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Lato</label>
                    <select value={side} onChange={e => setSide(e.target.value as any)} style={selectStyle}>
                      <option value="">—</option>
                      <option value="dx">DX</option><option value="sx">SX</option>
                      <option value="bilaterale">Bilaterale</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Patologia</label>
                    <select value={pathologyType} onChange={e => setPathologyType(e.target.value as any)} style={selectStyle}>
                      <option value="">—</option>
                      <option value="traumatico">Traumatico</option>
                      <option value="degenerativo">Degenerativo</option>
                      <option value="post_chirurgico">Post-chir.</option>
                      <option value="neurologico">Neurologico</option>
                      <option value="cronico">Cronico</option>
                      <option value="funzionale">Funzionale</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Diagnosi medica</label>
                  <textarea value={medicalDiagnosis} onChange={e => setMedicalDiagnosis(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Es. discopatia L4-L5" />
                </div>
              </div>
            )}

            {/* Sezione economica */}
            <button type="button" onClick={() => setShowBusinessFields(v => !v)} style={{
              width: "100%", textAlign: "left",
              background: showBusinessFields ? "rgba(22,163,74,0.03)" : "transparent",
              border: `1px solid ${THEME.border}`,
              padding: "9px 14px", borderRadius: 7, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontWeight: 600, fontSize: 13, color: THEME.textSoft,
              marginBottom: showBusinessFields ? 12 : 0,
            }}>
              <span>Stato & dati economici</span>
              <span style={{ color: THEME.gray, fontSize: 11, fontWeight: 500 }}>
                {showBusinessFields ? "nascondi" : "mostra"}
              </span>
            </button>

            {showBusinessFields && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Stato</label>
                  <select value={patientStatus} onChange={e => setPatientStatus(e.target.value as any)} style={selectStyle}>
                    <option value="active">Attivo</option><option value="lead">Lead</option>
                    <option value="follow_up">Follow-up</option><option value="paused">In pausa</option>
                    <option value="discharged">Dimesso</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Canale acquisizione</label>
                  <select value={acquisitionChannel} onChange={e => setAcquisitionChannel(e.target.value as any)} style={selectStyle}>
                    <option value="">—</option><option value="passaparola">Passaparola</option>
                    <option value="medico">Medico</option><option value="instagram">Instagram</option>
                    <option value="google">Google</option><option value="evento">Evento</option>
                    <option value="altro">Altro</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Primo contatto</label>
                  <input type="date" value={firstVisitDate} onChange={e => setFirstVisitDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Frequenza / sett.</label>
                  <input placeholder="es. 2" inputMode="numeric" value={expectedFrequency} onChange={e => setExpectedFrequency(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ gridColumn: "1 / span 2" }}>
                  <label style={labelStyle}>Pacchetto sedute</label>
                  <input placeholder="es. 10" inputMode="numeric" value={packageSize} onChange={e => setPackageSize(e.target.value)} style={inputStyle} />
                </div>
              </div>
            )}
          </form>
        </div>

        <div style={{
          padding: "14px 24px",
          borderTop: `1px solid ${THEME.border}`,
          display: "flex", alignItems: "center", gap: 10,
          background: THEME.panelSoft, flexShrink: 0,
        }}>
          {drawerError && (
            <span style={{ flex: 1, fontSize: 12, color: THEME.red, fontWeight: 600 }}>{drawerError}</span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={closeDrawer} style={{
              padding: "9px 16px", borderRadius: 7,
              border: `1px solid ${THEME.border}`, background: "#fff",
              color: THEME.textSoft, fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>Annulla</button>
            <button type="submit" form="new-patient-form" disabled={saving} style={{
              padding: "9px 20px", borderRadius: 7, border: "none",
              background: saving ? THEME.gray : THEME.teal,
              color: "#fff", fontWeight: 700, fontSize: 13,
              cursor: saving ? "not-allowed" : "pointer",
            }}>
              {saving ? "Salvataggio…" : "Registra paziente"}
            </button>
          </div>
        </div>
      </div>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        background: "linear-gradient(135deg, #0d9488, #2563eb)",
        padding: "0 20px", height: 58,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(13,148,136,0.18)", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 14,
              border: "1.5px solid rgba(255,255,255,0.3)",
            }}>F</div>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Fisio<span style={{ fontWeight: 800 }}>Hub</span>
            </span>
          </div>
          <nav style={{ display: "flex", gap: 2 }}>
            {([
              {href:"/",label:"Home"},{href:"/calendar",label:"Calendario"},{href:"/reports",label:"Report"},{href:"/noleggio",label:"Noleggio"},{href:"/patients",label:"Pazienti",active:true},{href:"/piano",label:"💎 Piano"},
            ] as {href:string;label:string;active?:boolean}[]).map(item => (
              <Link key={item.href} href={item.href} style={{
                padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                textDecoration: "none",
                background: item.active ? "rgba(255,255,255,0.2)" : "transparent",
                color: item.active ? "#fff" : "rgba(255,255,255,0.8)",
                letterSpacing: 0.3,
              }}>
                <span className="tab-compact">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!loading && (
            <span className="tab-hide" style={{
              fontSize: 11, fontWeight: 700, color: "#fff",
              background: "rgba(255,255,255,0.2)", padding: "4px 10px",
              borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap",
            }}>{patients.length} pazienti</span>
          )}
          {!loading && patientsToComplete.length > 0 && (
            <span className="tab-hide" style={{
              fontSize: 11, fontWeight: 700, color: "#fff",
              background: "rgba(249,115,22,0.4)", padding: "4px 10px",
              borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap",
            }}>{patientsToComplete.length} incompleti</span>
          )}
          <button onClick={loadPatients} title="Aggiorna" style={{
            width: 32, height: 32, borderRadius: 8,
            border: "1.5px solid rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.15)",
            color: "#fff", cursor: "pointer", fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>↺</button>
          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button onClick={() => setUserMenuOpen(v => !v)} style={{
              width: 32, height: 32, borderRadius: 8,
              border: "1.5px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.2)",
              color: "#fff", fontWeight: 800, fontSize: 12,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>{userInitials}</button>
            {userMenuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)", width: 200,
                background: "#fff", border: `1px solid ${THEME.border}`,
                borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,0.10)",
                overflow: "hidden", zIndex: 60,
              }}>
                <div style={{ padding: "11px 16px", borderBottom: `1px solid ${THEME.border}`, fontSize: 12, color: THEME.muted }}>
                  {userEmail}
                </div>
                <Link href="/settings" onClick={() => setUserMenuOpen(false)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "11px 16px",
                  color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                  borderBottom: `1px solid ${THEME.border}`,
                }}>Impostazioni</Link>
                <button onClick={handleLogout} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "11px 16px", background: "transparent", border: "none",
                  cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13,
                }}>Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ━━━ MAIN ━━━ */}
      <main style={{ padding: "28px 32px", maxWidth: 1280, margin: "0 auto" }} className="tab-p">

        {/* Page header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontWeight: 800, fontSize: 24, color: THEME.text, letterSpacing: -0.4 }}>
              Pazienti
            </h1>
            {!loading && (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                {[
                  { label: "Totali",      value: patients.length,                                    color: THEME.blue  },
                  { label: "Incompleti",  value: patientsToComplete.length,                          color: patientsToComplete.length > 0 ? THEME.amber : THEME.muted },
                  { label: "Senza tel.", value: patientsToComplete.filter(p => !p.phone).length,    color: patientsToComplete.filter(p => !p.phone).length > 0 ? THEME.red : THEME.muted },
                ].map(k => (
                  <div key={k.label} style={{
                    display: "flex", alignItems: "baseline", gap: 5,
                    padding: "5px 12px", borderRadius: 6,
                    background: "#fff", border: `1px solid ${THEME.border}`,
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: k.color }}>{k.value}</span>
                    <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 500 }}>{k.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={openDrawer} style={{
            padding: "10px 18px", borderRadius: 8, border: "none",
            background: THEME.teal, color: "#fff",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          }}>
            + Nuovo paziente
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 16, padding: "11px 16px", borderRadius: 7,
            background: "rgba(220,38,38,0.05)", border: `1px solid rgba(220,38,38,0.18)`,
            color: THEME.red, fontWeight: 600, fontSize: 13,
          }}>{error}</div>
        )}

        {/* ── Pannello lista ─────────────────────────────────────────────── */}
        <div style={{
          background: "#fff", borderRadius: 12,
          border: `1px solid ${THEME.border}`,
          boxShadow: "0 1px 4px rgba(15,23,42,0.04)",
        }}>

          {/* Toolbar */}
          <div style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${THEME.border}`,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <span style={{
                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                color: THEME.gray, fontSize: 15, pointerEvents: "none", lineHeight: 1,
              }}>⌕</span>
              <input
                placeholder="Cerca per nome o telefono…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 32, background: THEME.appBg }}
              />
            </div>

            <div style={{
              display: "flex",
              border: `1px solid ${THEME.border}`,
              borderRadius: 7, overflow: "hidden", flexShrink: 0,
            }}>
              {([
                { key: "all",        label: `Tutti (${patients.length})` },
                { key: "incomplete", label: `Incompleti (${patientsToComplete.length})` },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  padding: "7px 14px", border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                  background: activeTab === t.key ? THEME.teal : "#fff",
                  color:      activeTab === t.key ? "#fff"     : THEME.muted,
                  transition: "background 0.15s, color 0.15s",
                }}>{t.label}</button>
              ))}
            </div>
          </div>

          {/* Tabella */}
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: THEME.muted, fontSize: 13 }}>
              Caricamento…
            </div>
          ) : visiblePatients.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: THEME.muted, fontSize: 13 }}>
              {searchTerm ? `Nessun risultato per "${searchTerm}"` : "Nessun paziente registrato."}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={tableHeaderStyle}>Paziente</th>
                  <th style={tableHeaderStyle}>Telefono</th>
                  <th style={tableHeaderStyle} className="tab-hide">Città</th>
                  {activeTab === "incomplete" && (
                    <th style={tableHeaderStyle}>Mancante</th>
                  )}
                  <th style={{ ...tableHeaderStyle, textAlign: "right" }}> </th>
                </tr>
              </thead>
              <tbody>
                {visiblePatients.map((p, idx) => {
                  const missing = missingBadges(p);
                  return (
                    <tr
                      key={p.id}
                      className="row-hover"
                      style={{
                        background: idx % 2 === 0 ? "#fff" : THEME.panelSoft,
                        borderBottom: `1px solid ${THEME.border}`,
                        borderLeft: !p.phone ? `3px solid ${THEME.red}` : "3px solid transparent",
                      }}
                    >
                      <td style={{ padding: "13px 16px" }}>
                        <Link href={`/patients/${p.id}`} style={{
                          textDecoration: "none", color: THEME.text,
                          fontWeight: 600, fontSize: 14,
                        }}>
                          {p.last_name} {p.first_name}
                        </Link>
                      </td>
                      <td style={{ padding: "13px 16px", color: THEME.textSoft, fontSize: 13 }}>
                        {p.phone ?? <span style={{ color: THEME.gray }}>—</span>}
                      </td>
                      <td style={{ padding: "13px 16px", color: THEME.muted, fontSize: 13 }} className="tab-hide">
                        {p.residence_city ?? <span style={{ color: THEME.gray }}>—</span>}
                      </td>
                      {activeTab === "incomplete" && (
                        <td style={{ padding: "13px 16px" }}>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {missing.map(m => (
                              <span key={m.label} style={{
                                fontSize: 11, background: m.bg, color: m.color,
                                padding: "3px 8px", borderRadius: 4, fontWeight: 600,
                              }}>{m.label}</span>
                            ))}
                          </div>
                        </td>
                      )}
                      <td style={{ padding: "13px 16px", textAlign: "right" }}>
                        <Link href={`/patients/${p.id}`} style={{
                          color: THEME.blue, fontWeight: 600, textDecoration: "none",
                          fontSize: 12, padding: "5px 12px",
                          border: `1px solid ${THEME.border}`, borderRadius: 6,
                          display: "inline-flex", alignItems: "center", gap: 4,
                        }}>Apri →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && visiblePatients.length > 0 && (
            <div style={{
              padding: "9px 20px",
              borderTop: `1px solid ${THEME.border}`,
              fontSize: 12, color: THEME.muted,
            }}>
              {visiblePatients.length} {visiblePatients.length === 1 ? "paziente" : "pazienti"}
              {searchTerm && ` per "${searchTerm}"`}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
