"use client";

import { useEffect } from "react";
import UpgradeButtons from "./UpgradeButtons";

const T = {
  panelBg:     "#ffffff",
  panelSoft:   "#f5f5f7",
  text:        "#0a0a0a",
  textSoft:    "#1d1d1f",
  muted:       "#6e6e73",
  mutedLight:  "#86868b",
  border:      "#d2d2d7",
  borderSoft:  "#e8e8ed",
  accent:      "#0d9488",
  blue:        "#2563eb",
  green:       "#16a34a",
  amber:       "#f97316",
};

type PlanDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  max_patients: number | null;
  max_appointments_per_month: number | null;
  max_operators: number | null;
  max_rooms: number | null;
  patients_limit_mode: "soft" | "hard";
  appointments_limit_mode: "soft" | "hard";
  operators_limit_mode: "soft" | "hard";
  rooms_limit_mode: "soft" | "hard";
  features: { key: string; label: string; category: string | null; enabled: boolean }[];
};

const FEATURE_NAMES: Record<string, string> = {
  patient_records: "Schede paziente complete",
  clinical_documents: "Documenti clinici (referti, RMN, ecografie)",
  session_notes: "Note di seduta",
  calendar_advanced: "Calendario avanzato (drag&drop, ricorrenze)",
  multi_operator: "Multi-operatore",
  multi_room: "Multi-stanza",
  online_booking: "Prenotazioni online dal sito",
  google_calendar_sync: "Sync Google Calendar",
  whatsapp_reminders: "Promemoria WhatsApp",
  sms_reminders: "Promemoria SMS",
  email_reminders: "Promemoria email",
  basic_reports: "Report base",
  advanced_reports: "Report avanzati (trend, export Excel)",
  custom_pdf_export: "Export PDF personalizzato",
  cooperative_module: "Gestione cooperative e riepiloghi",
  exercise_sheets: "Schede esercizi per pazienti",
  rental_module: "Modulo noleggio attrezzature",
  soap_notes: "Cartella clinica SOAP",
  invoice_templates: "Template ricevute/fatture personalizzabili",
  patient_export_pdf: "Export scheda paziente in PDF",
};

const CATEGORY_LABELS: Record<string, string> = {
  clinical: "Funzioni cliniche",
  admin: "Gestionale",
  integrations: "Integrazioni",
  reports: "Report e fatturazione",
  general: "Generali",
};

export default function PlanDetailModal({
  plan,
  onClose,
}: {
  plan: PlanDetail;
  onClose: () => void;
}) {
  // Chiude con ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Blocca scroll body
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const price = plan.price_monthly_cents / 100;
  const enabled = plan.features.filter((f) => f.enabled);

  // Raggruppa feature per categoria
  const byCategory: Record<string, { key: string; label: string }[]> = {};
  for (const f of enabled) {
    const cat = f.category ?? "general";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ key: f.key, label: FEATURE_NAMES[f.key] ?? f.label });
  }
  const categoryKeys = Object.keys(byCategory).sort();

  const limits: [string, number | null, "soft" | "hard"][] = [
    ["Pazienti", plan.max_patients, plan.patients_limit_mode],
    ["Appuntamenti al mese", plan.max_appointments_per_month, plan.appointments_limit_mode],
    ["Operatori", plan.max_operators, plan.operators_limit_mode],
    ["Stanze", plan.max_rooms, plan.rooms_limit_mode],
  ];

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 100,
          animation: "fadeIn 0.2s ease",
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: T.panelBg,
          borderRadius: 16,
          width: "min(92vw, 640px)",
          maxHeight: "90vh",
          overflow: "auto",
          zIndex: 101,
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.25)",
          animation: "slideUp 0.25s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Chiudi"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "none",
            background: T.panelSoft,
            color: T.muted,
            fontSize: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
          }}
        >
          ×
        </button>

        {/* Header piano */}
        <div
          style={{
            padding: "36px 36px 24px",
            borderBottom: `1px solid ${T.borderSoft}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: T.mutedLight,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Piano
          </div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: T.text,
              letterSpacing: -0.5,
              lineHeight: 1.1,
            }}
          >
            {plan.name}
          </div>
          {plan.description && (
            <div
              style={{
                fontSize: 14,
                color: T.muted,
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              {plan.description}
            </div>
          )}

          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "baseline",
              gap: 6,
            }}
          >
            {price > 0 ? (
              <>
                <span style={{ fontSize: 36, fontWeight: 700, color: T.text, letterSpacing: -1 }}>
                  €{price.toFixed(0)}
                </span>
                <span style={{ fontSize: 15, color: T.muted }}>/ mese</span>
              </>
            ) : (
              <span style={{ fontSize: 36, fontWeight: 700, color: T.text, letterSpacing: -1 }}>
                Gratuito
              </span>
            )}
          </div>
        </div>

        {/* Limiti */}
        <div style={{ padding: "24px 36px", borderBottom: `1px solid ${T.borderSoft}` }}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: T.text,
              margin: "0 0 14px",
            }}
          >
            Limiti
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {limits.map(([label, value, mode]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 14,
                }}
              >
                <span style={{ color: T.textSoft }}>{label}</span>
                <span
                  style={{
                    color: T.text,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {value === null ? "Illimitati" : value}
                  {value !== null && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: mode === "hard" ? "#fef2f2" : "#f0fdf4",
                        color: mode === "hard" ? "#991b1b" : "#15803d",
                        fontWeight: 700,
                        letterSpacing: 0.5,
                      }}
                    >
                      {mode === "hard" ? "STRICT" : "FLESSIBILE"}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Funzionalità per categoria */}
        <div style={{ padding: "24px 36px", borderBottom: `1px solid ${T.borderSoft}` }}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: T.text,
              margin: "0 0 16px",
            }}
          >
            Funzionalità incluse ({enabled.length})
          </h3>

          {categoryKeys.length === 0 ? (
            <div style={{ fontSize: 13, color: T.mutedLight }}>
              Nessuna funzionalità specifica configurata.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {categoryKeys.map((catKey) => (
                <div key={catKey}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: T.mutedLight,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    {CATEGORY_LABELS[catKey] ?? catKey}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {byCategory[catKey].map((f) => (
                      <div
                        key={f.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          fontSize: 13,
                          color: T.textSoft,
                        }}
                      >
                        <span style={{ color: T.accent, fontSize: 13, flexShrink: 0, fontWeight: 700 }}>
                          ✓
                        </span>
                        <span>{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer con CTA */}
        <div
          style={{
            padding: "24px 36px 32px",
            background: T.panelSoft,
            borderRadius: "0 0 16px 16px",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: T.muted,
              marginBottom: 14,
              textAlign: "center",
            }}
          >
            Contatta Marco per attivare il piano <strong>{plan.name}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <UpgradeButtons size="md" targetPlan={plan.name} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translate(-50%, -45%); }
          to { opacity: 1; transform: translate(-50%, -50%); }
        }
      `}</style>
    </>
  );
}
