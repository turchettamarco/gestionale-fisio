// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/PatientSidebar.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Sidebar di navigazione della pagina paziente (Tappa 1 del refactor UX).
// Mostra le 12 sezioni della scheda paziente raggruppate in 4 categorie
// logiche:
//   • PAZIENTE      — Anagrafica · Clinica · Mappa dolore · Doc. clinici
//   • TRATTAMENTI   — Pacchetti · Terapie fatte · Diario · Esercizi
//   • MISURE        — Scale · Foto · Timeline
//   • DOCUMENTI     — GDPR
//
// La sezione attiva viene memorizzata nella query string come ?section=xxx
// in modo che il pulsante "indietro" del browser funzioni e che i link
// siano condivisibili.
//
// Su iPad portrait (<1024px) e sotto, la sidebar si nasconde dietro un
// bottone hamburger che la fa scorrere da sinistra (gestito a livello
// di pagina, qui esponiamo solo l'attributo `mobileOpen`).
//
// Usato da: app/(protected)/patients/[id]/page.tsx
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React from "react";

// ─── Tipi pubblici ──────────────────────────────────────────────────────

export type PatientSectionId =
  | "panoramica"
  | "anagrafica"
  | "clinica"
  | "mappa-dolore"
  | "documenti-clinici"
  | "pacchetti"
  | "terapie"
  | "diario"
  | "esercizi"
  | "scale"
  | "foto"
  | "timeline"
  | "gdpr";

export const PATIENT_SECTION_IDS: PatientSectionId[] = [
  "panoramica", "anagrafica", "clinica", "mappa-dolore", "documenti-clinici",
  "pacchetti",  "terapie", "diario", "esercizi",
  "scale", "foto", "timeline",
  "gdpr",
];

export const DEFAULT_PATIENT_SECTION: PatientSectionId = "panoramica";

export type PatientSidebarBadges = Partial<Record<PatientSectionId, number | string | null>>;

export type PatientSidebarProps = {
  activeSection: PatientSectionId;
  onChange: (s: PatientSectionId) => void;
  badges?: PatientSidebarBadges;
  /** Se true, la sidebar è in modalità drawer (overlay) per schermi stretti. */
  mobileOpen?: boolean;
  /** Chiusura drawer su mobile (click su overlay o su voce). */
  onCloseMobile?: () => void;
};

// ─── Theme locale (coerente con la pagina paziente) ─────────────────────

const T = {
  panelBg:    "#ffffff",
  text:       "#0f172a",
  textSoft:   "#334155",
  muted:      "#64748b",
  border:     "#e2e8f0",
  blue:       "#2563eb",
  blueSoft:   "rgba(37,99,235,0.08)",
  teal:       "#0d9488",
  red:        "#dc2626",
};

// ─── Struttura gruppi ───────────────────────────────────────────────────

type Item = { id: PatientSectionId; label: string; icon: string };
type Group = { label: string; items: Item[] };

const GROUPS: Group[] = [
  {
    label: "",
    items: [
      { id: "panoramica", label: "Panoramica", icon: "🏠" },
    ],
  },
  {
    label: "Paziente",
    items: [
      { id: "anagrafica",        label: "Anagrafica",         icon: "👤" },
      { id: "clinica",           label: "Quadro clinico",     icon: "🩺" },
      { id: "mappa-dolore",      label: "Mappa del dolore",   icon: "🗺" },
      { id: "documenti-clinici", label: "Documenti clinici",  icon: "📋" },
    ],
  },
  {
    label: "Trattamenti",
    items: [
      { id: "pacchetti", label: "Pacchetti sedute", icon: "📦" },
      { id: "terapie",   label: "Terapie fatte",    icon: "📅" },
      { id: "diario",    label: "Diario clinico",   icon: "📝" },
      { id: "esercizi",  label: "Esercizi",         icon: "🏋️" },
    ],
  },
  {
    label: "Misure",
    items: [
      { id: "scale",    label: "Scale di valutazione", icon: "📊" },
      { id: "foto",     label: "Foto cliniche",        icon: "📷" },
      { id: "timeline", label: "Timeline sedute",      icon: "📈" },
    ],
  },
  {
    label: "Documenti",
    items: [
      { id: "gdpr", label: "Documenti GDPR", icon: "🔏" },
    ],
  },
];

// ─── Componente ─────────────────────────────────────────────────────────

export default function PatientSidebar({
  activeSection,
  onChange,
  badges,
  mobileOpen = false,
  onCloseMobile,
}: PatientSidebarProps) {

  const handleClick = (id: PatientSectionId) => {
    onChange(id);
    if (mobileOpen && onCloseMobile) onCloseMobile();
  };

  // Contenuto sidebar (riutilizzato sia in modalità desktop che drawer)
  const content = (
    <nav style={{
      background: T.panelBg,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      padding: 10,
      width: "100%",
      boxSizing: "border-box",
      fontSize: 13,
    }}>
      {GROUPS.map((g, gi) => (
        <div key={g.label || `g${gi}`} style={{ marginBottom: gi === GROUPS.length - 1 ? 0 : 6 }}>
          {g.label && (
          <div style={{
            fontSize: 10,
            fontWeight: 800,
            color: T.muted,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            padding: "10px 10px 6px",
          }}>
            {g.label}
          </div>
          )}
          {g.items.map(item => {
            const active = item.id === activeSection;
            const badge  = badges?.[item.id];
            return (
              <button
                key={item.id}
                onClick={() => handleClick(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  border: "none",
                  background: active ? T.blueSoft : "transparent",
                  color: active ? T.blue : T.textSoft,
                  fontWeight: active ? 700 : 600,
                  fontSize: 13,
                  borderRadius: 8,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s",
                  marginBottom: 2,
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f1f5f9"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 15, lineHeight: 1, width: 18, textAlign: "center" }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.label}
                </span>
                {badge != null && badge !== 0 && badge !== "" && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    background: active ? T.blue : T.red,
                    color: "#fff",
                    padding: "2px 7px",
                    borderRadius: 10,
                    minWidth: 18,
                    textAlign: "center",
                    lineHeight: 1.4,
                  }}>
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

  // ── DESKTOP: sidebar fissa in colonna a sinistra ─────────────────────
  // ── MOBILE/IPAD: drawer overlay con backdrop ─────────────────────────
  // Il discriminante è gestito da CSS class esterna (vedi page.tsx).
  // Quando mobileOpen === true mostriamo l'overlay; altrimenti il
  // contenitore è completamente trasparente alla pagina (sidebar nascosta).

  return (
    <>
      {/* Versione "in colonna" — visibile su desktop, nascosta sotto 1024px via CSS */}
      <aside className="patient-sidebar-desktop" style={{
        position: "sticky",
        top: 16,
        alignSelf: "flex-start",
        width: 220,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
      }}>
        {content}
      </aside>

      {/* Versione "drawer" — visibile solo quando mobileOpen===true */}
      {mobileOpen && (
        <div
          className="patient-sidebar-drawer"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            zIndex: 100,
            display: "flex",
          }}
          onClick={onCloseMobile}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 260,
              maxWidth: "82vw",
              height: "100%",
              background: T.panelBg,
              padding: 12,
              overflowY: "auto",
              boxShadow: "0 0 32px rgba(0,0,0,0.25)",
              animation: "patientDrawerIn 0.18s ease-out",
            }}
          >
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "4px 6px 12px", marginBottom: 4,
              borderBottom: `1px solid ${T.border}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Sezioni paziente</span>
              <button
                onClick={onCloseMobile}
                aria-label="Chiudi"
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  fontSize: 20, color: T.muted, lineHeight: 1, padding: 4,
                }}
              >×</button>
            </div>
            {content}
          </div>
        </div>
      )}

      {/* Stili responsive + animazione drawer */}
      <style jsx>{`
        @keyframes patientDrawerIn {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
        @media (max-width: 1023px) {
          .patient-sidebar-desktop { display: none !important; }
        }
        @media (min-width: 1024px) {
          .patient-sidebar-drawer { display: none !important; }
        }
      `}</style>
    </>
  );
}
