// app/(protected)/calendar/components/QuickPatientForm.tsx
// ═══════════════════════════════════════════════════════════════════════
// Form inline per la creazione rapida di un paziente "minimo".
// Usato in 4 punti del flusso calendar:
//   1. CreateAppointmentModal (singolo) — creazione paziente per appuntamento normale
//   2. CreateAppointmentModal (gruppo)  — creazione paziente per partecipante iniziale
//   3. GroupEventModal                  — aggiunta paziente a gruppo esistente
//   4. Mobile (calendar)                — flussi 1+2+3 in versione mobile
//
// Il form raccoglie nome, cognome (obbligatori) e telefono (opzionale),
// poi chiama onSubmit con i dati. Il chiamante esegue l'INSERT con
// owner_id + studio_id corretti per la multi-tenancy.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState } from "react";
import { THEME } from "../utils";

export type QuickPatientFormProps = {
  /** Callback alla creazione: il chiamante esegue l'INSERT e gestisce stato/feedback */
  onSubmit: (data: { first_name: string; last_name: string; phone: string | null }) => Promise<void>;
  /** Callback chiusura senza creare */
  onCancel: () => void;
  /** Stato "in salvataggio" controllato dal chiamante (per disabilitare i bottoni) */
  busy: boolean;
  /** Layout compatto (es. dentro modale gruppo) — meno padding */
  compact?: boolean;
};

export default function QuickPatientForm({ onSubmit, onCancel, busy, compact = false }: QuickPatientFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [phone,     setPhone]     = useState("");

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onSubmit({
      first_name: firstName.trim(),
      last_name:  lastName.trim(),
      phone:      phone.trim() || null,
    });
    // Reset locale (il chiamante decide se chiudere il form)
    setFirstName("");
    setLastName("");
    setPhone("");
  };

  const inputStyle = {
    padding: compact ? "7px 9px" : "8px 10px",
    borderRadius: 7,
    border: `1px solid ${THEME.borderSoft}`,
    background: THEME.panelBg,
    color: THEME.text,
    outline: "none",
    fontWeight: 600,
    fontSize: 12,
    fontFamily: "inherit",
  } as const;

  return (
    <div style={{
      border: `1px solid ${THEME.blue}`,
      background: "rgba(91,130,168,0.03)",
      padding: compact ? 12 : 16,
      borderRadius: 8,
      marginBottom: compact ? 8 : 16,
    }}>
      <div style={{
        fontSize: compact ? 12 : 13,
        fontWeight: 700,
        color: THEME.blueDark,
        marginBottom: compact ? 8 : 12,
      }}>
        Nuovo paziente rapido
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 8,
        marginBottom: compact ? 8 : 12,
      }}>
        <input
          autoFocus
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
          placeholder="Nome *"
          style={inputStyle}
        />
        <input
          value={lastName}
          onChange={e => setLastName(e.target.value)}
          placeholder="Cognome *"
          style={inputStyle}
        />
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Telefono"
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
          Stato: <strong style={{ color: THEME.amber }}>DA COMPLETARE</strong>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "7px 14px",
              borderRadius: 7,
              border: `1px solid ${THEME.borderSoft}`,
              background: THEME.panelSoft,
              color: THEME.text,
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 11,
              opacity: busy ? 0.6 : 1,
            }}
          >
            Annulla
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            style={{
              padding: "7px 14px",
              borderRadius: 7,
              border: `1px solid ${THEME.greenDark}`,
              background: THEME.green,
              color: "#fff",
              cursor: canSubmit ? "pointer" : "not-allowed",
              fontWeight: 700,
              fontSize: 11,
              opacity: canSubmit ? 1 : 0.6,
            }}
          >
            {busy ? "Creazione…" : "Crea Paziente"}
          </button>
        </div>
      </div>
    </div>
  );
}
