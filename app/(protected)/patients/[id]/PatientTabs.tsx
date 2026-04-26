// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/patients/[id]/PatientTabs.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Tab bar che raggruppa le 10 sezioni della scheda paziente (escluso
// l'header anagrafica che resta sempre fisso) in 4 categorie:
//   • Clinica       — Clinica + Mappa Dolore + Documenti Clinici + Diario
//   • Trattamenti   — Terapie fatte + Esercizi + Timeline sedute
//   • Valutazioni   — Scale di valutazione + Foto cliniche
//   • Documenti     — GDPR (privacy/consensi)
//
// La tab attiva è memorizzata in localStorage per persistenza tra
// navigazioni.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

const THEME = {
  panelBg: "#fff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  blue: "#2563eb",
};

export type PatientTab = "clinica" | "trattamenti" | "valutazioni" | "documenti";

export type PatientTabsProps = {
  activeTab: PatientTab;
  onTabChange: (tab: PatientTab) => void;
};

const TABS: Array<{ id: PatientTab; icon: string; label: string; description: string }> = [
  { id: "clinica",      icon: "🩺", label: "Clinica",     description: "Anamnesi · Mappa Dolore · Diario · Documenti" },
  { id: "trattamenti",  icon: "📅", label: "Trattamenti", description: "Terapie · Esercizi · Timeline" },
  { id: "valutazioni",  icon: "📊", label: "Valutazioni", description: "Scale di valutazione · Foto cliniche" },
  { id: "documenti",    icon: "🔏", label: "Documenti",   description: "GDPR · privacy · consensi" },
];

export default function PatientTabs({ activeTab, onTabChange }: PatientTabsProps) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      gap: 8,
      marginBottom: 20,
    }}>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: `2px solid ${isActive ? THEME.blue : THEME.border}`,
              background: isActive
                ? "linear-gradient(135deg, rgba(13,148,136,0.08), rgba(37,99,235,0.08))"
                : THEME.panelBg,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
              boxShadow: isActive
                ? "0 4px 16px rgba(37,99,235,0.12)"
                : "0 1px 3px rgba(15,23,42,0.04)",
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.borderColor = THEME.blue;
                e.currentTarget.style.background = "rgba(37,99,235,0.04)";
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.borderColor = THEME.border;
                e.currentTarget.style.background = THEME.panelBg;
              }
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              <span style={{
                fontSize: 13,
                fontWeight: 800,
                color: isActive ? THEME.blue : THEME.text,
                letterSpacing: 0.3,
              }}>
                {tab.label}
              </span>
            </div>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              color: THEME.muted,
              lineHeight: 1.3,
            }}>
              {tab.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
