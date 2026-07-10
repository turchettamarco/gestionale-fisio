"use client";

// ═══════════════════════════════════════════════════════════════════════════
// PAGINA PAZIENTI — UNIFICATA (Tappa 1 unificazione mobile/desktop)
//
// Prima: due pagine separate con logica duplicata
//   • app/(protected)/patients/page.tsx        (desktop, tabella)
//   • app/mobile/(protected)/patients/page.tsx (mobile, card per lettera)
//
// Ora: UNA pagina. La logica (fetch, ricerca, filtri, KPI, creazione
// paziente) vive una volta sola. Solo il render cambia in base al viewport:
//   • < 768px  → vista mobile (header gradiente, card, FAB, tab bar)
//   • ≥ 768px  → vista desktop (AppNavbar, tabella, drawer nuovo paziente)
//
// Il proxy.ts NON reindirizza più i telefoni su /patients:
// questa pagina serve entrambi. I link verso pagine NON ancora unificate
// (dettaglio paziente, nuovo paziente mobile) puntano ancora a /mobile/*.
// ═══════════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudioId } from "@/src/contexts/StudioContext";
import { StudioAdherenceModal } from "@/src/components/exercises/StudioAdherenceModal";
import {
  useDisplayPatientName,
  useDisplayPatientPhone,
  usePrivacyMode,
  usePrivacyDisplay,
} from "@/src/contexts/PrivacyModeContext";
import AppNavbar from "@/src/components/AppNavbar";
import MobileTabBar from "@/src/components/MobileTabBar";
import { useIsMobile } from "@/src/hooks/useIsMobile";
import { normalizePhoneForWA, openWhatsApp } from "@/src/lib/whatsapp";

// ─── Types ────────────────────────────────────────────────────────────────────
type Plan = "invoice" | "no_invoice";

type Patient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  birth_date: string | null;
  tax_code: string | null;
  residence_city: string | null;
  preferred_plan?: Plan | null;
};

type NextAppt = {
  patient_id: string;
  start_at: string;
  status: string;
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
  gradient:   "linear-gradient(135deg, #0d9488, #2563eb)",
};

const BOTTOM_TAB_H = 60;

// ─── Helpers (puri, condivisi dalle due viste) ────────────────────────────────
function nameOf(p: Patient) {
  return `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "Paziente";
}

function initials(p: Patient) {
  const f = (p.first_name ?? "").trim()[0] ?? "";
  const l = (p.last_name ?? "").trim()[0] ?? "";
  return (l + f).toUpperCase() || "?";
}

function isIncomplete(p: Patient) {
  return !p.phone || !p.birth_date || !p.tax_code;
}

function formatApptDate(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const domani = new Date(oggi); domani.setDate(oggi.getDate() + 1);
  const dt = new Date(d); dt.setHours(0, 0, 0, 0);
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (dt.getTime() === oggi.getTime()) return `Oggi ${ora}`;
  if (dt.getTime() === domani.getTime()) return `Domani ${ora}`;
  const gg = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"][d.getDay()];
  return `${gg} ${d.getDate()}/${d.getMonth() + 1} ${ora}`;
}

function groupByLetter(patients: Patient[]): { letter: string; items: Patient[] }[] {
  const map = new Map<string, Patient[]>();
  for (const p of patients) {
    const l = (p.last_name?.[0] ?? "#").toUpperCase();
    if (!map.has(l)) map.set(l, []);
    map.get(l)!.push(p);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, "it"))
    .map(([letter, items]) => ({ letter, items }));
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PatientsPage() {

  // Viewport: null finché non lo conosciamo (evita flash della vista sbagliata)
  const isMobile = useIsMobile();

  // Studio corrente (multi-tenancy)
  const currentStudioId = useCurrentStudioId();
  const [adhOpen, setAdhOpen] = useState(false);

  // Privacy Mode (entrambe le viste)
  const displayName  = useDisplayPatientName();
  const displayPhone = useDisplayPatientPhone();
  const { privacyMode } = usePrivacyMode();
  const { maskName, maskInitial } = usePrivacyDisplay();

  // ══════════════════════════════════════════════════════════════════════════
  // LOGICA CONDIVISA — scritta UNA volta, usata da entrambe le viste
  // ══════════════════════════════════════════════════════════════════════════

  // ── Data ──────────────────────────────────────────────────────────────────
  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [nextAppts, setNextAppts] = useState<NextAppt[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string>("");

  async function loadPatients() {
    setLoading(true);
    setError("");
    const [resP, resA] = await Promise.all([
      supabase
        .from("patients")
        .select("id,first_name,last_name,phone,birth_date,tax_code,residence_city,preferred_plan")
        .order("last_name", { ascending: true }),
      supabase
        .from("appointments")
        .select("patient_id,start_at,status")
        .gte("start_at", new Date().toISOString())
        .neq("status", "cancelled")
        .order("start_at", { ascending: true }),
    ]);
    if (resP.error) {
      setError(resP.error.message);
      setLoading(false);
      return;
    }
    setPatients((resP.data ?? []) as Patient[]);
    // tieni solo il primo appuntamento futuro per paziente
    const seen = new Set<string>();
    const firsts: NextAppt[] = [];
    for (const a of (resA.data ?? []) as NextAppt[]) {
      if (!seen.has(a.patient_id)) { seen.add(a.patient_id); firsts.push(a); }
    }
    setNextAppts(firsts);
    setLoading(false);
  }

  useEffect(() => { void loadPatients(); }, []);

  // ── Ricerca e filtri ───────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab]   = useState<"all" | "incomplete">("all");

  const patientsToComplete = useMemo(() => {
    const incomplete = patients.filter(isIncomplete);
    return [...incomplete].sort((a, b) => (!a.phone ? -1 : 0) - (!b.phone ? -1 : 0));
  }, [patients]);

  const visiblePatients = useMemo(() => {
    const base = activeTab === "incomplete" ? patientsToComplete : patients;
    if (!searchTerm.trim()) return base;
    const term = searchTerm.toLowerCase().trim();
    return base.filter(p =>
      nameOf(p).toLowerCase().includes(term) ||
      (p.phone ?? "").includes(term)
    );
  }, [patients, patientsToComplete, searchTerm, activeTab]);

  const grouped = useMemo(() => groupByLetter(visiblePatients), [visiblePatients]);

  const stats = useMemo(() => ({
    total:      patients.length,
    incomplete: patientsToComplete.length,
    noPhone:    patientsToComplete.filter(p => !p.phone).length,
  }), [patients, patientsToComplete]);

  const nextApptMap = useMemo(() => {
    const m = new Map<string, NextAppt>();
    for (const a of nextAppts) m.set(a.patient_id, a);
    return m;
  }, [nextAppts]);

  // ── Drawer nuovo paziente (vista desktop) ─────────────────────────────────
  const [drawerOpen, setDrawerOpen]                 = useState(false);
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

  // ── Utente + menu avatar (vista mobile) ────────────────────────────────────
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email ?? null)).catch(() => {});
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
    const parts = (userEmail.split("@")[0] ?? "U").replace(/[^a-zA-Z0-9]/g, " ").split(" ").filter(Boolean);
    return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase().slice(0, 2);
  }, [userEmail]);

  async function handleLogout() {
    try { await supabase.auth.signOut(); } finally { window.location.href = "/login"; }
  }

  // ── Pull-to-refresh (vista mobile) ─────────────────────────────────────────
  const [pullY,        setPullY]        = useState(0);
  const [isPulling,    setIsPulling]    = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const PULL_THRESHOLD = 64;

  const handlePullStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) pullStartY.current = e.touches[0].clientY;
  };
  const handlePullMove = (e: React.TouchEvent) => {
    if (pullStartY.current === null || isRefreshing) return;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0) { setIsPulling(true); setPullY(Math.min(dy, PULL_THRESHOLD * 1.5)); }
  };
  const handlePullEnd = async () => {
    if (!isPulling) { pullStartY.current = null; return; }
    if (pullY >= PULL_THRESHOLD) {
      setIsRefreshing(true); setPullY(PULL_THRESHOLD);
      await loadPatients(); setIsRefreshing(false);
    }
    setPullY(0); setIsPulling(false); pullStartY.current = null;
  };

  // ── Stili condivisi (vista desktop) ────────────────────────────────────────
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

  // ══════════════════════════════════════════════════════════════════════════
  // Viewport non ancora noto → sfondo neutro (nessun flash)
  // ══════════════════════════════════════════════════════════════════════════
  if (isMobile === null) {
    return <div style={{ minHeight: "100vh", background: THEME.appBg }} />;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VISTA MOBILE (< 768px) — stessa UX di prima: header gradiente, card
  // raggruppate per lettera, azioni rapide tel/WhatsApp, FAB, tab bar.
  // ══════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div
        style={{
          minHeight: "100vh", background: "#FAF7F2", paddingBottom: BOTTOM_TAB_H + 16,
          fontFamily: "Inter,-apple-system,sans-serif",
        }}
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
      >

        {/* ━━━ Pull indicator ━━━ */}
        {(isPulling || isRefreshing) && (
          <div style={{
            position: "fixed", top: 54, left: "50%", transform: "translateX(-50%)", zIndex: 50,
            background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
            borderRadius: 99, padding: "6px 16px", fontSize: 12, fontWeight: 700,
            color: THEME.blue, boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {isRefreshing ? "↻ Aggiornamento…" : `↓ Trascina ancora (${Math.round(Math.min(pullY / PULL_THRESHOLD * 100, 100))}%)`}
          </div>
        )}

        {/* ━━━ NAVBAR ━━━ */}
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          background: THEME.gradient, padding: "0 14px", height: 54,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 2px 12px rgba(13,148,136,0.18)", gap: 10,
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(255,255,255,0.2)",
              border: "1.5px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center",
              justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>F</div>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: 0.3, textTransform: "uppercase" }}>
              Fisio<span style={{ fontWeight: 700 }}>Hub</span>
            </span>
          </div>

          {/* KPI chips */}
          {!loading && (
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.2)",
                padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap" }}>
                👥 {stats.total}
              </span>
              {stats.incomplete > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "rgba(249,115,22,0.35)",
                  padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap" }}>
                  ⚠️ {stats.incomplete}
                </span>
              )}
            </div>
          )}

          {/* Refresh + Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button onClick={loadPatients} aria-label="Aggiorna" style={{
              width: 30, height: 30, borderRadius: 7, border: "1.5px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", fontSize: 15,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>↺</button>
            <div ref={userMenuRef} style={{ position: "relative" }}>
              <button onClick={() => setUserMenuOpen(v => !v)} style={{
                width: 30, height: 30, borderRadius: 7, border: "1.5px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 800, fontSize: 11,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}>{userInitials}</button>
              {userMenuOpen && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 190,
                  background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
                  borderRadius: 12, boxShadow: "0 12px 32px rgba(30,64,175,0.15)", overflow: "hidden", zIndex: 60 }}>
                  <Link href="/settings" onClick={() => setUserMenuOpen(false)} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                    color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                    borderBottom: `1.5px solid ${THEME.border}`,
                  }}>⚙️ Impostazioni</Link>
                  <button onClick={handleLogout} style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "12px 16px", background: "transparent", border: "none",
                    cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13,
                  }}>⏻ Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ━━━ CONTENUTO ━━━ */}
        <div style={{ padding: "12px 14px 0" }}>

          {/* Ricerca */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              fontSize: 15, pointerEvents: "none", color: THEME.muted }}>🔍</span>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cerca nome o telefono…"
              style={{
                width: "100%", padding: "11px 12px 11px 36px", borderRadius: 12,
                border: `1.5px solid ${THEME.border}`, outline: "none",
                background: THEME.panelBg, color: THEME.text,
                fontWeight: 500, fontSize: 14, fontFamily: "Inter,-apple-system,sans-serif",
                boxSizing: "border-box",
              }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: THEME.muted, fontSize: 18, lineHeight: 1,
              }}>×</button>
            )}
          </div>

          {/* Errore */}
          {error && (
            <div style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 10,
              background: "rgba(220,38,38,0.06)", border: "1.5px solid rgba(220,38,38,0.25)",
              color: "#7f1d1d", fontWeight: 600, fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ color: THEME.muted, fontWeight: 600, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
              Caricamento…
            </div>
          )}

          {/* Lista per lettera */}
          {!loading && visiblePatients.length === 0 && (
            <div style={{ background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
              borderRadius: 14, padding: 20, color: THEME.muted, fontWeight: 600,
              fontSize: 13, textAlign: "center" }}>
              Nessun paziente trovato
            </div>
          )}

          {!loading && grouped.map(({ letter, items }) => (
            <div key={letter} style={{ marginBottom: 16 }}>
              {/* Intestazione lettera */}
              <div style={{
                fontSize: 11, fontWeight: 800, color: THEME.muted,
                textTransform: "uppercase", letterSpacing: "0.1em",
                marginBottom: 6, paddingLeft: 4,
              }}>
                {letter}
              </div>

              <div style={{
                background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
                borderRadius: 14, overflow: "hidden",
                boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
              }}>
                {items.map((p, i) => {
                  const incomplete = isIncomplete(p);
                  const appt = nextApptMap.get(p.id);
                  const phoneVal = p.phone?.trim();
                  const waPhone = phoneVal ? normalizePhoneForWA(phoneVal) : null;

                  return (
                    <div key={p.id} style={{
                      borderBottom: i < items.length - 1 ? `1px solid ${THEME.border}` : "none",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>

                        {/* Avatar */}
                        <div style={{
                          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                          background: THEME.gradient,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontWeight: 800, fontSize: 14,
                        }}>
                          {privacyMode ? maskInitial(p) : initials(p)}
                        </div>

                        {/* Info paziente — dettaglio NON ancora unificato → /mobile */}
                        <Link href={`/patients/${p.id}`} style={{
                          flex: 1, minWidth: 0, textDecoration: "none", color: "inherit",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: THEME.text,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {privacyMode ? maskName(p) : nameOf(p)}
                            </span>
                            {incomplete && (
                              <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0,
                                padding: "1px 6px", borderRadius: 99,
                                background: "rgba(249,115,22,0.10)", color: THEME.amber,
                                border: "1px solid rgba(249,115,22,0.25)" }}>
                                ⚠️
                              </span>
                            )}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 12, color: THEME.muted, fontWeight: 500 }}>
                            {phoneVal ? displayPhone(phoneVal) : <span style={{ opacity: 0.5 }}>Nessun telefono</span>}
                          </div>
                          {appt && (
                            <div style={{ marginTop: 3, fontSize: 11, fontWeight: 600, color: THEME.blue }}>
                              📅 {formatApptDate(appt.start_at)}
                            </div>
                          )}
                        </Link>

                        {/* Azioni rapide */}
                        <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                          {/* Chiama */}
                          {phoneVal && (
                            <a href={`tel:${phoneVal}`} style={{
                              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              background: "rgba(37,99,235,0.08)",
                              border: `1.5px solid rgba(37,99,235,0.2)`,
                              textDecoration: "none", fontSize: 16,
                            }}>📞</a>
                          )}
                          {/* WhatsApp */}
                          {waPhone && (
                            <a href="#" onClick={e => { e.preventDefault(); openWhatsApp(phoneVal); }}
                              style={{
                                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: "rgba(22,163,74,0.08)",
                                border: `1.5px solid rgba(22,163,74,0.2)`,
                                textDecoration: "none", fontSize: 16,
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

        {/* ━━━ FAB nuovo paziente — unificata (Tappa 3) ━━━ */}
        <Link
          href="/patients/new"
          aria-label="Nuovo paziente"
          style={{
            position: "fixed", right: 18,
            bottom: `calc(env(safe-area-inset-bottom,0px) + ${BOTTOM_TAB_H + 16}px)`,
            width: 52, height: 52, borderRadius: "50%",
            background: THEME.gradient, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            textDecoration: "none", fontSize: 26, fontWeight: 300, zIndex: 40,
            boxShadow: "0 4px 20px rgba(13,148,136,0.40)",
          }}>
          +
        </Link>

        {/* ━━━ Tab bar — prima la forniva il layout /mobile, ora la pagina ━━━ */}
        <MobileTabBar />

      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VISTA DESKTOP (≥ 768px) — identica a prima: AppNavbar, KPI, tabella,
  // drawer "Nuovo paziente", modale aderenza esercizi.
  // ══════════════════════════════════════════════════════════════════════════
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
      <AppNavbar active="patients" onRefresh={loadPatients} />

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
                  { label: "Totali",      value: stats.total,      color: THEME.blue  },
                  { label: "Incompleti",  value: stats.incomplete, color: stats.incomplete > 0 ? THEME.amber : THEME.muted },
                  { label: "Senza tel.",  value: stats.noPhone,    color: stats.noPhone > 0 ? THEME.red : THEME.muted },
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
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={() => setAdhOpen(true)} style={{
              padding: "10px 16px", borderRadius: 8, border: `1.5px solid ${THEME.teal}`,
              background: "#fff", color: THEME.teal,
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              📊 Aderenza esercizi
            </button>
            <button onClick={openDrawer} style={{
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: THEME.teal, color: "#fff",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            }}>
              + Nuovo paziente
            </button>
          </div>
        </div>

        <StudioAdherenceModal
          open={adhOpen}
          onClose={() => setAdhOpen(false)}
          studioId={currentStudioId}
        />

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
                          {displayName(p, nameOf(p))}
                        </Link>
                      </td>
                      <td style={{ padding: "13px 16px", color: THEME.textSoft, fontSize: 13 }}>
                        {p.phone ? displayPhone(p.phone) : <span style={{ color: THEME.gray }}>—</span>}
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
