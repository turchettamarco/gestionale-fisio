// ═══════════════════════════════════════════════════════════════════════
// src/components/WeeklyReminderDialog.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Dialog "Promemoria prossimi appuntamenti": mostra l'anteprima dei
// prossimi 15 giorni di appuntamenti del paziente (esclusi annullati
// e già eseguiti). Click su "Invia" → apre WhatsApp con il messaggio
// precompilato.
//
//   ┌─────────────────────────────────┐
//   │  📲 Promemoria appuntamenti     │
//   │  Per Mario · prossimi 15 giorni │
//   │                                 │
//   │  ┌───────────────────────────┐  │
//   │  │ • Mar 28/04 alle 09:00    │  │
//   │  │ • Gio 30/04 alle 10:30    │  │
//   │  │ • Mar 04/05 alle 09:00    │  │
//   │  └───────────────────────────┘  │
//   │  3 appuntamenti                 │
//   │                                 │
//   │  [ Annulla ]   [ 📲 Invia WA ]  │
//   └─────────────────────────────────┘
//
// Se "Nessun appuntamento" nei prossimi 15gg → bottone Invia disabilitato.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildWeeklyReminderMessage,
  openWhatsApp,
  type WeeklyAppointmentItem,
} from "@/src/lib/whatsapp";

const THEME = {
  panelBg: "#ffffff",
  panelSoft: "#f7f9fd",
  text: "#0f172a",
  muted: "#334155",
  border: "#cbd5e1",
  borderSoft: "#94a3b8",
  blue: "#2563eb",
  blueDark: "#1e40af",
  teal: "#0d9488",
  green: "#16a34a",
  greenDark: "#15803d",
  red: "#dc2626",
  gray: "#94a3b8",
};

const HORIZON_DAYS = 15;

export type WeeklyReminderDialogProps = {
  /** Mostra/nasconde il dialog */
  open: boolean;
  /** Chiamato all'invio o annullamento */
  onClose: () => void;

  /** Paziente target */
  patientId: string;
  patientFirstName: string;
  patientPhone: string | null | undefined;

  /**
   * Tutti gli appuntamenti del paziente disponibili in memoria.
   * Il dialog filtra: stesso paziente, esclusi cancelled e done,
   * solo da oggi 00:00 fino a +15 giorni.
   */
  appointments: Array<{
    patient_id: string;
    start: Date;
    end?: Date;
    status?: string | null;
    treatment?: string | null;
    location?: string | null;
  }>;

  /** Template del messaggio dalle Impostazioni */
  template: string;

  /** Firma dello studio */
  signatureName?: string | null;
  signatureTitle?: string | null;
};

export default function WeeklyReminderDialog({
  open, onClose,
  patientId, patientFirstName, patientPhone,
  appointments, template,
  signatureName, signatureTitle,
}: WeeklyReminderDialogProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  // Aggiorna "now" all'apertura del dialog
  useEffect(() => {
    if (open) setNow(new Date());
  }, [open]);

  // ─── Filtraggio appuntamenti ─────────────────────────────────────────
  const items = useMemo<WeeklyAppointmentItem[]>(() => {
    // "Inizio di oggi" 00:00 — soglia inferiore (include appuntamenti di
    // oggi anche se l'orario è già passato)
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // Limite superiore: oggi + 15 giorni, fine giornata
    const horizonEnd = new Date(startOfToday);
    horizonEnd.setDate(horizonEnd.getDate() + HORIZON_DAYS);
    horizonEnd.setHours(23, 59, 59, 999);

    return appointments
      .filter(a => a.patient_id === patientId)
      // Esclude annullati e già eseguiti (vogliamo solo i prossimi DA FARE)
      .filter(a => a.status !== "cancelled" && a.status !== "done")
      // Range temporale: da oggi 00:00 a +15 giorni
      .filter(a => a.start.getTime() >= startOfToday.getTime() && a.start.getTime() <= horizonEnd.getTime())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map(a => ({
        start: a.start,
        end: a.end,
        treatment: a.treatment ?? null,
        location: a.location ?? null,
      }));
  }, [appointments, patientId, now]);

  if (!open) return null;

  const count = items.length;
  const canSend = count > 0 && !!patientPhone;

  const handleSend = () => {
    if (!canSend) return;
    const message = buildWeeklyReminderMessage({
      template,
      patientFirstName,
      weekLabel: "i prossimi giorni", // retrocompat per template che ancora usano {settimana}
      appointments: items,
      signatureName,
      signatureTitle,
    });
    openWhatsApp(patientPhone!, message);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(30,64,175,0.35)",
          zIndex: 10000,
        }}
      />
      {/* Dialog */}
      <div
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 460,
          maxWidth: "90%",
          background: THEME.panelBg,
          color: THEME.text,
          borderRadius: 16,
          border: `2px solid ${THEME.border}`,
          boxShadow: "0 24px 64px rgba(30,64,175,0.2)",
          padding: "28px 24px",
          zIndex: 10001,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: "linear-gradient(135deg, #0d9488, #2563eb)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: "#fff",
          }}>
            📲
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: THEME.blue, letterSpacing: -0.2 }}>
              Promemoria appuntamenti
            </div>
            <div style={{ marginTop: 2, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
              Per <strong style={{ color: THEME.text }}>{patientFirstName}</strong> · prossimi {HORIZON_DAYS} giorni
            </div>
          </div>
        </div>

        {/* Lista appuntamenti */}
        {count === 0 ? (
          <div style={{
            background: THEME.panelSoft,
            border: `1px solid ${THEME.border}`,
            padding: "16px",
            borderRadius: 8,
            fontSize: 13,
            color: THEME.muted,
            fontWeight: 600,
            textAlign: "center",
            marginBottom: 16,
          }}>
            Nessun appuntamento da fare nei prossimi {HORIZON_DAYS} giorni.
          </div>
        ) : (
          <>
            <div style={{
              background: THEME.panelSoft,
              border: `1px solid ${THEME.border}`,
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 8,
              maxHeight: 280,
              overflowY: "auto",
            }}>
              {items.map((it, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: THEME.text,
                    padding: "6px 0",
                    borderBottom: i < items.length - 1 ? `1px solid ${THEME.border}` : "none",
                  }}
                >
                  {formatBullet(it.start)}
                </div>
              ))}
            </div>
            <div style={{
              fontSize: 12,
              color: THEME.green,
              fontWeight: 700,
              marginBottom: 16,
              textAlign: "right",
            }}>
              {count} {count === 1 ? "appuntamento" : "appuntamenti"} da inviare
            </div>
          </>
        )}

        {/* Avviso paziente senza telefono */}
        {!patientPhone && (
          <div style={{
            background: "rgba(245, 158, 11, 0.08)",
            border: `1px solid rgba(245, 158, 11, 0.3)`,
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 11,
            lineHeight: 1.5,
            color: "#92400e",
            fontWeight: 600,
            marginBottom: 16,
          }}>
            ⚠️ Il paziente non ha un numero di telefono registrato.
            Aggiungilo nella scheda paziente per poter inviare il messaggio.
          </div>
        )}

        {/* Footer: Annulla + Invia */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: `1px solid ${THEME.borderSoft}`,
              background: THEME.panelSoft,
              color: THEME.text,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            Annulla
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: `1px solid ${canSend ? THEME.greenDark : THEME.borderSoft}`,
              background: canSend ? "#25d366" : THEME.panelSoft,
              color: canSend ? "#fff" : THEME.muted,
              cursor: canSend ? "pointer" : "not-allowed",
              fontWeight: 700,
              fontSize: 13,
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: canSend ? 1 : 0.6,
            }}
          >
            <span>📲</span>
            Invia WhatsApp
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Helpers locali ───────────────────────────────────────────────────────
function formatBullet(start: Date): string {
  const dayNames = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const dayName = dayNames[start.getDay()];
  const dd = String(start.getDate()).padStart(2, "0");
  const mm = String(start.getMonth() + 1).padStart(2, "0");
  const hh = String(start.getHours()).padStart(2, "0");
  const min = String(start.getMinutes()).padStart(2, "0");
  return `• ${dayName} ${dd}/${mm} alle ${hh}:${min}`;
}
