"use client";

// ═══════════════════════════════════════════════════════════════════════════
// NUOVO PAZIENTE — UNIFICATA (Tappa 3 unificazione mobile/desktop)
//
// Prima: due pagine separate
//   • desktop: form completo (anagrafica + clinica + economica) ma benvenuto
//     WhatsApp di fatto inutilizzabile (auto-redirect dopo 350ms) e template
//     benvenuto solo qui; NIENTE campo fatturazione.
//   • mobile: form rapido (5 campi) SENZA controllo limiti piano, senza
//     template benvenuto, con tab bar inline duplicata.
//
// Ora: UNA pagina, logica scritta una volta:
//   • controllo limiti piano (usePlanLimits) per TUTTI (prima il mobile lo
//     bypassava);
//   • insert completa (owner_id esplicito + preferred_plan + campi V2);
//   • template benvenuto WA da practice_settings per TUTTI;
//   • flusso post-salvataggio: banner successo con azioni (WA / lista /
//     inserisci un altro), niente auto-redirect.
//
// Render per viewport:
//   • < 768px  → header gradiente + campi base + sezioni ripiegate + tab bar
//   • ≥ 768px  → layout desktop identico a prima, sezioni aperte
// ═══════════════════════════════════════════════════════════════════════════

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { usePlanLimits } from "@/src/hooks/usePlanLimits";
import UpgradeBanner from "@/src/components/UpgradeBanner";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { openWhatsApp } from "@/src/lib/whatsapp";
import MobileTabBar, { MobileTabBarSpacer } from "@/src/components/MobileTabBar";
import { useIsMobile } from "@/src/hooks/useIsMobile";

// ─── Types ────────────────────────────────────────────────────────────────────
type Plan = "invoice" | "no_invoice";

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEME = {
  appBg:      "#f1f5f9",
  panelBg:    "#ffffff",
  panelSoft:  "#f7f9fd",
  text:       "#0f172a",
  textSoft:   "#1e293b",
  muted:      "#334155",
  border:     "#cbd5e1",
  borderSoft: "#e2e8f0",
  blue:       "#2563eb",
  blueDark:   "#1e40af",
  green:      "#16a34a",
  greenDark:  "#15803d",
  amber:      "#f97316",
  red:        "#dc2626",
  teal:       "#0d9488",
  gradient:   "linear-gradient(135deg, #0d9488, #2563eb)",
};

// ─── Stili vista desktop (identici a prima) ───────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${THEME.borderSoft}`,
  outline: "none",
  fontSize: 15,
  background: "#fff",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 900,
  color: THEME.muted,
  marginBottom: 6,
  letterSpacing: 0.2,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: THEME.text,
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 10,
  border: "none",
  background: THEME.blue,
  color: "#fff",
  fontWeight: 950,
  fontSize: 15,
  cursor: "pointer",
};

// ─── Primitive vista mobile (identiche a prima) ───────────────────────────────
function inputS(err?: boolean): React.CSSProperties {
  return {
    width: "100%", padding: "11px 13px", borderRadius: 10, outline: "none",
    border: `1.5px solid ${err ? THEME.red : THEME.border}`,
    background: THEME.panelBg, color: THEME.text,
    fontWeight: 500, fontSize: 15,
    fontFamily: "Inter,-apple-system,sans-serif",
    boxSizing: "border-box" as const,
  };
}

function FG({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: THEME.muted, marginBottom: 6,
        textTransform: "uppercase", letterSpacing: "0.08em",
        display: "flex", gap: 4, alignItems: "center",
      }}>
        {label}
        {required && <span style={{ color: THEME.red, fontWeight: 900 }}>*</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NewPatientPage() {
  const router = useRouter();
  const isMobile = useIsMobile();

  // Studio corrente (multi-tenancy)
  const { studio: currentStudio } = useCurrentStudio();
  const currentStudioId = currentStudio?.id ?? null;

  // ══════════════════════════════════════════════════════════════════════════
  // LOGICA CONDIVISA — scritta UNA volta, usata da entrambe le viste
  // ══════════════════════════════════════════════════════════════════════════

  // ── Limiti piano (prima solo desktop: il mobile li bypassava) ─────────────
  const planLimits = usePlanLimits();
  const patientCheck = planLimits.canCreatePatient();
  const isBlockedHard = !patientCheck.allowed;
  const showPlanBanner =
    planLimits.checks.patients.status === "over" ||
    planLimits.checks.patients.status === "near";

  // ── Template benvenuto WA (prima solo desktop) ─────────────────────────────
  const [welcomeTpl, setWelcomeTpl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData?.user?.id;
      if (!ownerId) return;
      const { data } = await supabase
        .from("practice_settings")
        .select("welcome_message")
        .eq("owner_id", ownerId)
        .maybeSingle();
      setWelcomeTpl((data as any)?.welcome_message ?? null);
    })();
  }, []);

  function buildWelcomeMessage(nome: string): string {
    const __b = getStudioBranding(currentStudio);
    const firma = [__b.signatureName, __b.signatureTitle].filter(Boolean).join("\n");
    if (welcomeTpl?.trim()) {
      return welcomeTpl.replace(/{nome}/g, nome).replace(/{firma}/g, firma);
    }
    const nomeOpEntry = __b.signatureName || "nostro studio";
    const firmaLine = firma ? `\n\n${firma}` : "";
    return `Buongiorno ${nome},\n\nbenvenuto/a nello studio di ${nomeOpEntry}!\n\nSiamo lieti di averla come nuovo paziente. A presto!${firmaLine}`;
  }

  // ── Stato esito ────────────────────────────────────────────────────────────
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);
  const [savedPhone, setSavedPhone] = useState("");
  const [savedName,  setSavedName]  = useState("");
  const [showWelcomeWA, setShowWelcomeWA] = useState(false);

  // ── Campi base ─────────────────────────────────────────────────────────────
  const [firstName,     setFirstName]     = useState("");
  const [lastName,      setLastName]      = useState("");
  const [phone,         setPhone]         = useState("");
  const [birthDate,     setBirthDate]     = useState("");
  const [taxCode,       setTaxCode]       = useState("");
  const [residenceCity, setResidenceCity] = useState("");
  const [preferredPlan, setPreferredPlan] = useState<Plan>("invoice");

  // ── Campi clinici ed economici ─────────────────────────────────────────────
  const [patientStatus,      setPatientStatus]      = useState("active");
  const [acquisitionChannel, setAcquisitionChannel] = useState("");
  const [firstVisitDate,     setFirstVisitDate]     = useState("");
  const [mainComplaint,      setMainComplaint]      = useState("");
  const [bodyRegion,         setBodyRegion]         = useState("");
  const [side,               setSide]               = useState("");
  const [pathologyType,      setPathologyType]      = useState("");
  const [medicalDiagnosis,   setMedicalDiagnosis]   = useState("");
  const [expectedFrequency,  setExpectedFrequency]  = useState("");
  const [packageSize,        setPackageSize]        = useState("");

  // Sezioni: aperte su desktop (com'era), chiuse su telefono (inserimento rapido)
  const [showClinical, setShowClinical] = useState(true);
  const [showBusiness, setShowBusiness] = useState(true);
  const [sectionsInit, setSectionsInit] = useState(false);
  useEffect(() => {
    if (isMobile !== null && !sectionsInit) {
      setShowClinical(!isMobile);
      setShowBusiness(!isMobile);
      setSectionsInit(true);
    }
  }, [isMobile, sectionsInit]);

  // ── Validazione campo per campo (evidenziazione su mobile) ─────────────────
  const [touched, setTouched] = useState({
    firstName: false, lastName: false, phone: false, birthDate: false,
  });
  const touch = (f: keyof typeof touched) => setTouched(t => ({ ...t, [f]: true }));

  // Data di nascita: obbligatoria su desktop (com'era), facoltativa su telefono
  // (inserimento rapido al banco: il completamento passa dal tab "Incompleti").
  const birthRequired = isMobile === false;

  const errs = useMemo(() => ({
    firstName: !firstName.trim(),
    lastName:  !lastName.trim(),
    phone:     !phone.trim(),
    birthDate: birthRequired && !birthDate.trim(),
  }), [firstName, lastName, phone, birthDate, birthRequired]);

  // ── Reset (per "Inserisci un altro") ───────────────────────────────────────
  function resetForm() {
    setFirstName(""); setLastName(""); setPhone(""); setBirthDate("");
    setTaxCode(""); setResidenceCity(""); setPreferredPlan("invoice");
    setPatientStatus("active"); setAcquisitionChannel(""); setFirstVisitDate("");
    setMainComplaint(""); setBodyRegion(""); setSide(""); setPathologyType("");
    setMedicalDiagnosis(""); setExpectedFrequency(""); setPackageSize("");
    setTouched({ firstName: false, lastName: false, phone: false, birthDate: false });
    setError(""); setSuccess(false); setShowWelcomeWA(false);
    setSavedName(""); setSavedPhone("");
  }

  // ── Submit condiviso ───────────────────────────────────────────────────────
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ firstName: true, lastName: true, phone: true, birthDate: true });
    setError("");

    // Blocco piano: hard limit raggiunto
    if (isBlockedHard) {
      setError(patientCheck.reason ?? "Hai raggiunto il limite di pazienti del tuo piano.");
      return;
    }

    if (errs.firstName || errs.lastName || errs.phone || errs.birthDate) {
      setError(
        birthRequired
          ? "Compila almeno Nome, Cognome, Telefono e Data di nascita."
          : "Compila i campi obbligatori."
      );
      return;
    }

    setSaving(true);

    // owner_id esplicito (NOT NULL nel DB)
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    if (!userId) {
      setSaving(false);
      setError("Sessione non valida. Effettua di nuovo il login.");
      return;
    }

    const { error: insErr } = await supabase.from("patients").insert({
      first_name:     firstName.trim(),
      last_name:      lastName.trim(),
      phone:          phone.trim(),
      birth_date:     birthDate.trim() || null,
      tax_code:       taxCode.trim() || null,
      residence_city: residenceCity.trim() || null,
      preferred_plan: preferredPlan,

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

      owner_id:  userId,           // NOT NULL nel DB
      studio_id: currentStudioId,  // multi-tenancy
    });
    setSaving(false);

    if (insErr) { setError(insErr.message); return; }

    setSavedPhone(phone.trim());
    setSavedName(firstName.trim() || lastName.trim());
    setShowWelcomeWA(!!phone.trim());
    setSuccess(true);
    if (!phone.trim()) setTimeout(() => router.push("/patients"), 800);
  }

  function sendWelcome() {
    const msg = buildWelcomeMessage(savedName || "Paziente");
    const ok = openWhatsApp(savedPhone, msg);
    if (ok) setShowWelcomeWA(false);
  }

  // ── Banner successo (condiviso: stesse azioni, stile per vista) ───────────
  function SuccessBanner({ mobile }: { mobile: boolean }) {
    const btnBase: React.CSSProperties = mobile
      ? { width: "100%", padding: "12px", borderRadius: 10, fontSize: 15 }
      : { padding: "10px 18px", borderRadius: 8, fontSize: 13 };
    return (
      <div style={{
        padding: mobile ? "14px 16px" : 16, borderRadius: 12, marginBottom: 14,
        background: "rgba(22,163,74,0.08)", border: "1.5px solid rgba(22,163,74,0.3)",
      }}>
        <div style={{
          color: mobile ? THEME.green : THEME.greenDark, fontWeight: 800, fontSize: 15,
          marginBottom: 12, textAlign: mobile ? "center" : "left",
        }}>
          ✅ Paziente creato!
        </div>
        <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: 8, flexWrap: "wrap" }}>
          {showWelcomeWA && (
            <button type="button" onClick={sendWelcome} style={{
              ...btnBase, border: "none", background: "#25D366", color: "#fff",
              fontWeight: 800, cursor: "pointer",
            }}>
              💬 Invia benvenuto WA
            </button>
          )}
          <button type="button" onClick={() => router.push("/patients")} style={{
            ...btnBase, border: "1.5px solid #e2e8f0", background: "#fff",
            color: "#64748b", fontWeight: 700, cursor: "pointer",
          }}>
            Vai alla lista →
          </button>
          <button type="button" onClick={resetForm} style={{
            ...btnBase, border: `1.5px solid rgba(37,99,235,0.25)`,
            background: "rgba(37,99,235,0.05)", color: THEME.blue,
            fontWeight: 700, cursor: "pointer",
          }}>
            ＋ Inserisci un altro
          </button>
        </div>
      </div>
    );
  }

  // ── Utente + menu avatar (chrome mobile) ───────────────────────────────────
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => setUserEmail(data?.user?.email ?? null))
      .catch(() => {});
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
    const parts = (userEmail.split("@")[0] ?? "U")
      .replace(/[^a-zA-Z0-9]/g, " ").split(" ").filter(Boolean);
    return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase().slice(0, 2);
  }, [userEmail]);

  async function handleLogout() {
    try { await supabase.auth.signOut(); } finally { window.location.href = "/login"; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Viewport non ancora noto → sfondo neutro (nessun flash)
  // ══════════════════════════════════════════════════════════════════════════
  if (isMobile === null) {
    return <div style={{ minHeight: "100vh", background: THEME.appBg }} />;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VISTA MOBILE (< 768px)
  // ══════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div style={{
        minHeight: "100vh", background: THEME.appBg,
        fontFamily: "Inter,-apple-system,sans-serif",
      }}>

        {/* ━━━ NAVBAR ━━━ */}
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          background: THEME.gradient, padding: "0 14px", height: 54,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 2px 12px rgba(13,148,136,0.18)", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <Link href="/patients" style={{
              width: 30, height: 30, borderRadius: 7, display: "flex",
              alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.3)",
              color: "#fff", textDecoration: "none", fontSize: 16, fontWeight: 700,
            }}>‹</Link>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>
              Nuovo paziente
            </div>
          </div>

          {/* Avatar menu */}
          <div ref={userMenuRef} style={{ position: "relative", flexShrink: 0 }}>
            <button onClick={() => setUserMenuOpen(v => !v)} style={{
              width: 30, height: 30, borderRadius: 7,
              border: "1.5px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.2)", color: "#fff",
              fontWeight: 800, fontSize: 11, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{userInitials}</button>
            {userMenuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)", width: 190,
                background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
                borderRadius: 12, boxShadow: "0 12px 32px rgba(30,64,175,0.15)",
                overflow: "hidden", zIndex: 60,
              }}>
                <button onClick={handleLogout} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 16px", background: "transparent", border: "none",
                  cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13,
                }}>⏻ Logout</button>
              </div>
            )}
          </div>
        </header>

        {/* ━━━ FORM ━━━ */}
        <div style={{ padding: "16px 14px 0" }}>

          {/* Banner limiti piano (prima assente su mobile) */}
          {showPlanBanner && (
            <div style={{ marginBottom: 14 }}>
              <UpgradeBanner />
            </div>
          )}

          {/* Errore */}
          {error && (
            <div style={{
              padding: "10px 13px", borderRadius: 10, marginBottom: 14,
              background: "rgba(220,38,38,0.06)", border: "1.5px solid rgba(220,38,38,0.25)",
              color: "#7f1d1d", fontWeight: 600, fontSize: 13,
            }}>⚠️ {error}</div>
          )}

          {/* Successo */}
          {success && <SuccessBanner mobile />}

          <form onSubmit={onSubmit}>
            <div style={{
              background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
              borderRadius: 14, padding: 16,
              boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
              display: "flex", flexDirection: "column", gap: 14,
            }}>

              {/* Nome + Cognome affiancati */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <FG label="Nome" required>
                  <input
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    onBlur={() => touch("firstName")}
                    placeholder="Mario"
                    autoComplete="given-name"
                    style={inputS(touched.firstName && errs.firstName)}
                  />
                </FG>
                <FG label="Cognome" required>
                  <input
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    onBlur={() => touch("lastName")}
                    placeholder="Rossi"
                    autoComplete="family-name"
                    style={inputS(touched.lastName && errs.lastName)}
                  />
                </FG>
              </div>

              <FG label="Telefono" required>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onBlur={() => touch("phone")}
                  placeholder="+39 320 …"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  style={inputS(touched.phone && errs.phone)}
                />
              </FG>

              <FG label="Data di nascita">
                <input
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  type="date"
                  style={inputS()}
                />
              </FG>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <FG label="Codice fiscale">
                  <input
                    value={taxCode}
                    onChange={e => setTaxCode(e.target.value)}
                    placeholder="Opzionale"
                    style={inputS()}
                  />
                </FG>
                <FG label="Città">
                  <input
                    value={residenceCity}
                    onChange={e => setResidenceCity(e.target.value)}
                    placeholder="Opzionale"
                    style={inputS()}
                  />
                </FG>
              </div>

              <FG label="Tipo fatturazione">
                <select
                  value={preferredPlan}
                  onChange={e => setPreferredPlan(e.target.value as Plan)}
                  style={inputS()}
                >
                  <option value="invoice">Fattura</option>
                  <option value="no_invoice">Non fattura</option>
                </select>
              </FG>

              {/* Sezione clinica (ripiegata di default) */}
              <div style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: 4 }}>
                <button type="button" onClick={() => setShowClinical(s => !s)} style={{
                  width: "100%", textAlign: "left", background: "transparent",
                  border: "none", padding: "8px 0", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>🧠 Dati clinici iniziali</span>
                  <span style={{ fontWeight: 900, color: THEME.blue }}>{showClinical ? "–" : "+"}</span>
                </button>
                {showClinical && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 6 }}>
                    <FG label="Motivo principale">
                      <textarea
                        style={{ ...inputS(), minHeight: 80, resize: "vertical" }}
                        placeholder="Es. dolore lombare da 3 settimane…"
                        value={mainComplaint}
                        onChange={e => setMainComplaint(e.target.value)}
                      />
                    </FG>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <FG label="Distretto">
                        <select style={inputS()} value={bodyRegion} onChange={e => setBodyRegion(e.target.value)}>
                          <option value="">Seleziona</option>
                          <option value="cervicale">Cervicale</option>
                          <option value="dorsale">Dorsale</option>
                          <option value="lombare">Lombare</option>
                          <option value="spalla">Spalla</option>
                          <option value="gomito">Gomito</option>
                          <option value="polso_mano">Polso/Mano</option>
                          <option value="anca">Anca</option>
                          <option value="ginocchio">Ginocchio</option>
                          <option value="caviglia_piede">Caviglia/Piede</option>
                          <option value="atm">ATM</option>
                          <option value="neurologico">Neurologico</option>
                          <option value="altro">Altro</option>
                        </select>
                      </FG>
                      <FG label="Lato">
                        <select style={inputS()} value={side} onChange={e => setSide(e.target.value)}>
                          <option value="">Seleziona</option>
                          <option value="dx">DX</option>
                          <option value="sx">SX</option>
                          <option value="bilaterale">Bilaterale</option>
                        </select>
                      </FG>
                    </div>
                    <FG label="Tipo problema">
                      <select style={inputS()} value={pathologyType} onChange={e => setPathologyType(e.target.value)}>
                        <option value="">Seleziona</option>
                        <option value="traumatico">Traumatico</option>
                        <option value="degenerativo">Degenerativo</option>
                        <option value="post_chirurgico">Post-chirurgico</option>
                        <option value="neurologico">Neurologico</option>
                        <option value="cronico">Cronico</option>
                        <option value="funzionale">Funzionale</option>
                      </select>
                    </FG>
                    <FG label="Diagnosi medica">
                      <input style={inputS()} placeholder="Es. discopatia L4-L5" value={medicalDiagnosis} onChange={e => setMedicalDiagnosis(e.target.value)} />
                    </FG>
                  </div>
                )}
              </div>

              {/* Sezione economica (ripiegata di default) */}
              <div style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: 4 }}>
                <button type="button" onClick={() => setShowBusiness(s => !s)} style={{
                  width: "100%", textAlign: "left", background: "transparent",
                  border: "none", padding: "8px 0", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>💼 Stato & dati economici</span>
                  <span style={{ fontWeight: 900, color: THEME.blue }}>{showBusiness ? "–" : "+"}</span>
                </button>
                {showBusiness && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 6 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <FG label="Stato paziente">
                        <select style={inputS()} value={patientStatus} onChange={e => setPatientStatus(e.target.value)}>
                          <option value="active">Attivo</option>
                          <option value="lead">Lead</option>
                          <option value="paused">In pausa</option>
                          <option value="follow_up">Follow-up</option>
                          <option value="discharged">Dimesso</option>
                        </select>
                      </FG>
                      <FG label="Canale acquisizione">
                        <select style={inputS()} value={acquisitionChannel} onChange={e => setAcquisitionChannel(e.target.value)}>
                          <option value="">Seleziona</option>
                          <option value="passaparola">Passaparola</option>
                          <option value="medico">Medico</option>
                          <option value="instagram">Instagram</option>
                          <option value="google">Google</option>
                          <option value="evento">Evento</option>
                          <option value="altro">Altro</option>
                        </select>
                      </FG>
                    </div>
                    <FG label="Data primo contatto">
                      <input style={inputS()} type="date" value={firstVisitDate} onChange={e => setFirstVisitDate(e.target.value)} />
                    </FG>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <FG label="Frequenza (sett.)">
                        <input style={inputS()} placeholder="Es. 2" inputMode="numeric" value={expectedFrequency} onChange={e => setExpectedFrequency(e.target.value)} />
                      </FG>
                      <FG label="Pacchetto sedute">
                        <input style={inputS()} placeholder="Es. 10" inputMode="numeric" value={packageSize} onChange={e => setPackageSize(e.target.value)} />
                      </FG>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Bottoni */}
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="submit"
                disabled={saving || success || isBlockedHard}
                title={isBlockedHard ? patientCheck.reason : undefined}
                style={{
                  width: "100%", padding: "14px 16px", borderRadius: 12, border: "none",
                  background: isBlockedHard ? "#94a3b8" : THEME.gradient, color: "#fff",
                  fontWeight: 800, fontSize: 15,
                  cursor: saving || isBlockedHard ? "not-allowed" : "pointer",
                  opacity: saving || success ? 0.6 : 1,
                  boxShadow: "0 2px 12px rgba(13,148,136,0.3)",
                  fontFamily: "Inter,-apple-system,sans-serif",
                }}
              >
                {saving ? "Salvataggio…" : isBlockedHard ? "🔒 Limite raggiunto" : "✓ Registra paziente"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/patients")}
                disabled={saving}
                style={{
                  width: "100%", padding: "13px 16px", borderRadius: 12,
                  border: `1.5px solid ${THEME.border}`,
                  background: THEME.panelSoft, color: THEME.muted,
                  fontWeight: 700, fontSize: 14, cursor: "pointer",
                  fontFamily: "Inter,-apple-system,sans-serif",
                }}
              >
                Annulla
              </button>
            </div>
          </form>

          {/* Nota campi obbligatori */}
          <div style={{ margin: "12px 0", fontSize: 11, color: THEME.muted, textAlign: "center" }}>
            I campi con <span style={{ color: THEME.red }}>*</span> sono obbligatori
          </div>

        </div>

        <MobileTabBarSpacer />
        <MobileTabBar />

      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VISTA DESKTOP (≥ 768px) — layout identico a prima
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ background: THEME.appBg, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/patients" style={{ textDecoration: "none", color: THEME.blue, fontWeight: 900 }}>
              ← Pazienti
            </Link>
            <div style={{ fontSize: 26, fontWeight: 950, color: THEME.text }}>Nuovo paziente</div>
          </div>
        </div>

        <div style={{ background: THEME.panelBg, border: `1px solid ${THEME.borderSoft}`, borderRadius: 16, padding: 18 }}>
          {error ? (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 12,
                background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.25)",
                color: THEME.red,
                fontWeight: 900,
              }}
            >
              {error}
            </div>
          ) : null}

          {success && <SuccessBanner mobile={false} />}

          {/* Banner di warning se stai per raggiungere o hai raggiunto il limite */}
          {showPlanBanner && (
            <div style={{ marginBottom: 16 }}>
              <UpgradeBanner />
            </div>
          )}

          <form onSubmit={onSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Nome *</label>
                <input style={inputStyle} placeholder="Nome" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Cognome *</label>
                <input style={inputStyle} placeholder="Cognome" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Telefono *</label>
                <input style={inputStyle} placeholder="Es. 320..." value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Data di nascita *</label>
                <input style={inputStyle} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Codice fiscale</label>
                <input style={inputStyle} placeholder="CF" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Città</label>
                <input style={inputStyle} placeholder="Città" value={residenceCity} onChange={(e) => setResidenceCity(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Tipo fatturazione</label>
                <select style={inputStyle} value={preferredPlan} onChange={(e) => setPreferredPlan(e.target.value as Plan)}>
                  <option value="invoice">Fattura</option>
                  <option value="no_invoice">Non fattura</option>
                </select>
              </div>
            </div>

            {/* CLINICA */}
            <div style={{ marginTop: 16, borderTop: `1px solid ${THEME.borderSoft}`, paddingTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowClinical((s) => !s)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: "10px 0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={sectionTitleStyle}>🧠 Dati clinici iniziali</div>
                <div style={{ fontWeight: 950, color: THEME.blue }}>{showClinical ? "–" : "+"}</div>
              </button>

              {showClinical ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Motivo principale</label>
                    <textarea
                      style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                      placeholder="Es. dolore lombare da 3 settimane..."
                      value={mainComplaint}
                      onChange={(e) => setMainComplaint(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Distretto</label>
                    <select style={inputStyle} value={bodyRegion} onChange={(e) => setBodyRegion(e.target.value)}>
                      <option value="">Seleziona</option>
                      <option value="cervicale">Cervicale</option>
                      <option value="dorsale">Dorsale</option>
                      <option value="lombare">Lombare</option>
                      <option value="spalla">Spalla</option>
                      <option value="gomito">Gomito</option>
                      <option value="polso_mano">Polso/Mano</option>
                      <option value="anca">Anca</option>
                      <option value="ginocchio">Ginocchio</option>
                      <option value="caviglia_piede">Caviglia/Piede</option>
                      <option value="atm">ATM</option>
                      <option value="neurologico">Neurologico</option>
                      <option value="altro">Altro</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Lato</label>
                    <select style={inputStyle} value={side} onChange={(e) => setSide(e.target.value)}>
                      <option value="">Seleziona</option>
                      <option value="dx">DX</option>
                      <option value="sx">SX</option>
                      <option value="bilaterale">Bilaterale</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Tipo problema</label>
                    <select style={inputStyle} value={pathologyType} onChange={(e) => setPathologyType(e.target.value)}>
                      <option value="">Seleziona</option>
                      <option value="traumatico">Traumatico</option>
                      <option value="degenerativo">Degenerativo</option>
                      <option value="post_chirurgico">Post-chirurgico</option>
                      <option value="neurologico">Neurologico</option>
                      <option value="cronico">Cronico</option>
                      <option value="funzionale">Funzionale</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Diagnosi medica</label>
                    <input style={inputStyle} placeholder="Es. discopatia L4-L5" value={medicalDiagnosis} onChange={(e) => setMedicalDiagnosis(e.target.value)} />
                  </div>
                </div>
              ) : null}
            </div>

            {/* BUSINESS */}
            <div style={{ marginTop: 12, borderTop: `1px solid ${THEME.borderSoft}`, paddingTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowBusiness((s) => !s)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: "10px 0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={sectionTitleStyle}>💼 Stato & dati economici</div>
                <div style={{ fontWeight: 950, color: THEME.blue }}>{showBusiness ? "–" : "+"}</div>
              </button>

              {showBusiness ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Stato paziente</label>
                    <select style={inputStyle} value={patientStatus} onChange={(e) => setPatientStatus(e.target.value)}>
                      <option value="active">Attivo</option>
                      <option value="lead">Lead</option>
                      <option value="paused">In pausa</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="discharged">Dimesso</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Canale acquisizione</label>
                    <select style={inputStyle} value={acquisitionChannel} onChange={(e) => setAcquisitionChannel(e.target.value)}>
                      <option value="">Seleziona</option>
                      <option value="passaparola">Passaparola</option>
                      <option value="medico">Medico</option>
                      <option value="instagram">Instagram</option>
                      <option value="google">Google</option>
                      <option value="evento">Evento</option>
                      <option value="altro">Altro</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Data primo contatto</label>
                    <input style={inputStyle} type="date" value={firstVisitDate} onChange={(e) => setFirstVisitDate(e.target.value)} />
                  </div>

                  <div>
                    <label style={labelStyle}>Frequenza prevista (sett.)</label>
                    <input style={inputStyle} placeholder="Es. 2" value={expectedFrequency} onChange={(e) => setExpectedFrequency(e.target.value)} />
                  </div>

                  <div>
                    <label style={labelStyle}>Pacchetto sedute</label>
                    <input style={inputStyle} placeholder="Es. 10" value={packageSize} onChange={(e) => setPackageSize(e.target.value)} />
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button
                type="submit"
                disabled={saving || isBlockedHard}
                style={{
                  ...buttonStyle,
                  opacity: saving || isBlockedHard ? 0.5 : 1,
                  cursor: saving || isBlockedHard ? "not-allowed" : "pointer",
                  background: isBlockedHard ? "#94a3b8" : buttonStyle.background,
                }}
                title={isBlockedHard ? patientCheck.reason : undefined}
              >
                {saving ? "Salvataggio..." : isBlockedHard ? "🔒 LIMITE RAGGIUNTO" : "REGISTRA"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/patients")}
                style={{
                  width: 160,
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: "#fff",
                  color: THEME.text,
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Annulla
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
