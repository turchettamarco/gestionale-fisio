"use client";
import React from "react";

// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/PatientSidebar.tsx — icone+scritte (mockup v2)
// ═══════════════════════════════════════════════════════════════════════
// Sidebar verticale con icone SVG a tratto + etichette, raggruppate
// (Clinica / Percorso / Amministrazione). Voce attiva con sfondo teal
// soft e barretta accent. Badge rossi per i contatori. Su mobile/iPad
// diventa drawer overlay.
// ═══════════════════════════════════════════════════════════════════════

export type PatientSectionId =
  | "panoramica" | "anagrafica" | "clinica" | "mappa-dolore" | "documenti-clinici"
  | "pacchetti" | "terapie" | "diario" | "esercizi" | "scale" | "foto" | "timeline" | "gdpr";

export const PATIENT_SECTION_IDS: PatientSectionId[] = [
  "panoramica", "anagrafica", "clinica", "mappa-dolore", "documenti-clinici",
  "pacchetti", "terapie", "diario", "esercizi", "scale", "foto", "timeline", "gdpr",
];

export const DEFAULT_PATIENT_SECTION: PatientSectionId = "panoramica";

export type PatientSidebarBadges = Partial<Record<PatientSectionId, number | string | null>>;

export type PatientSidebarProps = {
  activeSection: PatientSectionId;
  onChange: (s: PatientSectionId) => void;
  badges?: PatientSidebarBadges;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

const T = {
  panelBg: "#ffffff", text: "#0f172a", body: "#475569", muted: "#94a3b8",
  border: "#e9eef5", accent: "#0d9488", accentDark: "#0f766e",
  accentSoft: "#e6f5f3", red: "#dc2626", hover: "#f5f7fa",
};

const stroke = (a?: boolean) => (a ? T.accentDark : T.body);
function Ico(d: string[], a?: boolean) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={stroke(a)} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const ICONS: Record<PatientSectionId, (a?: boolean) => React.ReactNode> = {
  "panoramica":        a => Ico(["M3 12l9-8 9 8", "M5 10v10h14V10"], a),
  "clinica":           a => Ico(["M9 3v4M15 3v4M5 7h14v4a7 7 0 0 1-14 0V7z", "M12 18v3a3 3 0 0 0 6 0"], a),
  "scale":             a => Ico(["M4 20V4", "M4 20h16", "M8 16l3-4 3 2 4-6"], a),
  "mappa-dolore":      a => Ico(["M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z", "M12 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"], a),
  "diario":            a => Ico(["M4 4h13l3 3v13H4z", "M8 9h8M8 13h6"], a),
  "foto":              a => Ico(["M3 8h4l2-3h6l2 3h4v12H3z", "M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"], a),
  "documenti-clinici": a => Ico(["M14 3H6v18h12V7z", "M14 3v4h4", "M9 12h6M9 16h6"], a),
  "terapie":           a => Ico(["M7 3v4M17 3v4M4 9h16M5 5h14v15H5z"], a),
  "esercizi":          a => Ico(["M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"], a),
  "pacchetti":         a => Ico(["M3 8l9-5 9 5-9 5-9-5z", "M3 8v8l9 5 9-5V8"], a),
  "timeline":          a => Ico(["M5 4v16", "M5 7h8M5 12h12M5 17h6"], a),
  "anagrafica":        a => Ico(["M20 21a8 8 0 0 0-16 0", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"], a),
  "gdpr":              a => Ico(["M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z", "M9.5 12l2 2 3.5-4"], a),
};

type Item = { id: PatientSectionId; label: string };
const GROUPS: { label: string; items: Item[] }[] = [
  { label: "", items: [{ id: "panoramica", label: "Panoramica" }] },
  { label: "Clinica", items: [
    { id: "clinica", label: "Quadro clinico" },
    { id: "scale", label: "Scale di valutazione" },
    { id: "mappa-dolore", label: "Mappa del dolore" },
    { id: "diario", label: "Diario clinico" },
    { id: "foto", label: "Foto cliniche" },
    { id: "documenti-clinici", label: "Documenti clinici" },
  ] },
  { label: "Percorso", items: [
    { id: "terapie", label: "Sedute" },
    { id: "esercizi", label: "Esercizi" },
    { id: "pacchetti", label: "Pacchetti" },
    { id: "timeline", label: "Timeline" },
  ] },
  { label: "Amministrazione", items: [
    { id: "anagrafica", label: "Anagrafica" },
    { id: "gdpr", label: "Consensi e GDPR" },
  ] },
];

const ALL_ITEMS = GROUPS.flatMap(g => g.items);
export const PATIENT_SECTION_LABELS: Record<PatientSectionId, string> =
  Object.fromEntries(ALL_ITEMS.map(i => [i.id, i.label])) as Record<PatientSectionId, string>;

export default function PatientSidebar({
  activeSection, onChange, badges, mobileOpen = false, onCloseMobile,
}: PatientSidebarProps) {
  const click = (id: PatientSectionId) => {
    onChange(id);
    if (mobileOpen && onCloseMobile) onCloseMobile();
  };

  const list = (
    <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {GROUPS.map((g, gi) => (
        <div key={g.label || `g${gi}`} style={{ marginBottom: 4 }}>
          {g.label && (
            <div style={{ fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: 0.8,
              textTransform: "uppercase", padding: gi === 0 ? "6px 12px 6px" : "16px 12px 6px" }}>
              {g.label}
            </div>
          )}
          {g.items.map(item => {
            const active = item.id === activeSection;
            const badge = badges?.[item.id];
            const showBadge = badge != null && badge !== 0 && badge !== "";
            return (
              <button key={item.id} onClick={() => click(item.id)}
                className="psb-item"
                style={{ position: "relative", display: "flex", alignItems: "center", gap: 13,
                  width: "100%", padding: "11px 12px", borderRadius: 11, border: "none",
                  background: active ? T.accentSoft : "transparent",
                  color: active ? T.accentDark : T.text, fontWeight: active ? 700 : 600,
                  fontSize: 15, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  marginBottom: 2 }}>
                {active && <span style={{ position: "absolute", left: -10, top: 9, bottom: 9,
                  width: 3, borderRadius: 99, background: T.accent }} />}
                {ICONS[item.id](active)}
                <span style={{ flex: 1 }}>{item.label}</span>
                {showBadge && (
                  <span style={{ minWidth: 22, height: 22, padding: "0 6px", borderRadius: 99,
                    background: T.red, color: "#fff", fontSize: 11.5, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside className="patient-sidebar-desktop" style={{ position: "sticky", top: 16,
        alignSelf: "flex-start", padding: "8px 4px" }}>
        {list}
      </aside>

      {mobileOpen && (
        <div className="patient-sidebar-drawer" onClick={onCloseMobile}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 100, display: "flex" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 280, maxWidth: "84vw", height: "100%", background: T.panelBg,
              padding: 14, overflowY: "auto", boxShadow: "0 0 32px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "2px 8px 12px", marginBottom: 4, borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.text,
                textTransform: "uppercase", letterSpacing: 0.6 }}>Scheda paziente</span>
              <button onClick={onCloseMobile} aria-label="Chiudi"
                style={{ background: "transparent", border: "none", cursor: "pointer",
                  fontSize: 22, color: T.muted, lineHeight: 1, padding: 4 }}>×</button>
            </div>
            {list}
          </div>
        </div>
      )}

      <style jsx>{`
        .psb-item:hover { background: ${T.hover}; }
        @media (max-width: 1023px) { .patient-sidebar-desktop { display: none !important; } }
        @media (min-width: 1024px) { .patient-sidebar-drawer { display: none !important; } }
      `}</style>
    </>
  );
}
