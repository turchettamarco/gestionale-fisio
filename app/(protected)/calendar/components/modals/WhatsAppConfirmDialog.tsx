// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/modals/WhatsAppConfirmDialog.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale di conferma che si apre subito DOPO la creazione di un nuovo
// appuntamento, prima di salvare effettivamente. Ha 2 modalità:
//
//   • Paziente CON telefono → mostra anteprima del messaggio WhatsApp
//     che verrà inviato e propone 2 azioni:
//       - "Salta" (crea senza WhatsApp)
//       - "Crea e invia WhatsApp" (crea + apre wa.me con messaggio)
//
//   • Paziente SENZA telefono → avviso giallo + bottone unico
//     "Crea senza WhatsApp"
//
// Il messaggio è generato inline (non da template) usando la firma dello
// studio configurata (currentStudio.signature_name/_title).
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  THEME, fmtTime, formatDateRelative,
  type PatientLite,
} from "../../utils";
import { getStudioBranding } from "@/src/lib/studioBranding";

export type WhatsAppConfirmDialogProps = {
  /** Paziente selezionato (decide se mostrare il flusso telefono o meno) */
  selectedPatient: PatientLite | null;
  /** ISO start dell'appuntamento (per il messaggio) */
  createStartISO: string;
  /** Studio corrente (per la firma). In multi-op la firma diventa nome studio. */
  currentStudio: {
    name?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
    multi_operator_enabled?: boolean | null;
  } | null;
  /** Mostra scrollbar nella sidebar (passa la classe condizionale all'overlay) */
  showAllUpcoming: boolean;
  /** Click overlay → annulla (NON crea l'appuntamento) */
  onClose: () => void;
  /** Crea l'appuntamento. Se withWhatsApp=true, apre WA dopo la creazione */
  onCreateAppointment: (withWhatsApp: boolean) => void | Promise<void>;
};

export default function WhatsAppConfirmDialog({
  selectedPatient, createStartISO, currentStudio,
  showAllUpcoming, onClose, onCreateAppointment,
}: WhatsAppConfirmDialogProps) {

  const hasPhone = !!selectedPatient?.phone;

  // Costruzione firma in calce al messaggio (Fase branding multi-op)
  const __branding = getStudioBranding(currentStudio);
  const signatureLines = [
    __branding.signatureName,
    __branding.signatureTitle,
  ].filter(Boolean).join("\n");
  const signatureBlock = signatureLines ? `,\n${signatureLines}` : "";

  // Messaggio precompilato (solo se c'è il telefono)
  const messagePreview = hasPhone
    ? `Grazie per averci scelto.
Ricordiamo il prossimo appuntamento fissato per ${formatDateRelative(new Date(createStartISO))} alle ${fmtTime(createStartISO)}.

A presto${signatureBlock}`
    : "";

  return (
    <>
      {/* Overlay */}
      <div
        className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(30,64,175,0.35)",
          zIndex: 10000,
        }}
      />

      {/* Dialog */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 480,
          maxWidth: "90%",
          background: THEME.panelBg,
          color: THEME.text,
          borderRadius: 16,
          border: `2px solid ${THEME.border}`,
          boxShadow: "0 24px 64px rgba(30,64,175,0.2)",
          padding: "32px 28px",
          zIndex: 10001,
        }}
      >
        {/* Header con icona */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: "linear-gradient(135deg, #0d9488, #2563eb)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: "#fff",
          }}>
            ◈
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: THEME.blue }}>
              {hasPhone ? "Invia conferma WhatsApp?" : "Nessun numero di telefono"}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: THEME.muted, fontWeight: 600 }}>
              {hasPhone
                ? "Vuoi inviare il messaggio di conferma al paziente?"
                : "Il paziente non ha un numero di telefono registrato. Vuoi comunque creare l'appuntamento?"}
            </div>
          </div>
        </div>

        {/* Anteprima messaggio (solo con telefono) */}
        {hasPhone && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text, marginBottom: 8 }}>
              Messaggio che verrà inviato:
            </div>
            <div style={{
              background: THEME.panelSoft,
              padding: 16,
              borderRadius: 8,
              border: `1.5px solid ${THEME.border}`,
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              maxHeight: 150,
              overflowY: "auto",
            }}>
              {messagePreview}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
              Destinatario: {selectedPatient?.phone}
            </div>
          </div>
        )}

        {/* Avviso paziente senza telefono */}
        {!hasPhone && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              background: "rgba(245, 158, 11, 0.1)",
              border: `1px solid ${THEME.amber}`,
              padding: 16,
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              color: THEME.amber,
              fontWeight: 600,
            }}>
              ⚠️ Attenzione: Il paziente {selectedPatient?.last_name} {selectedPatient?.first_name} non ha un numero di telefono registrato.
              <br /><br />
              Puoi comunque creare l&apos;appuntamento e successivamente aggiungere il numero di telefono nella scheda paziente.
            </div>
          </div>
        )}

        {/* Bottoni azione */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button
            onClick={() => onCreateAppointment(false)}
            style={{
              padding: "12px 20px",
              borderRadius: 8,
              border: `1px solid ${THEME.borderSoft}`,
              background: THEME.panelSoft,
              color: THEME.text,
              cursor: "pointer",
              fontWeight: 600,
              minWidth: 120,
              fontSize: 13,
            }}
          >
            {hasPhone ? "Salta" : "Crea senza WhatsApp"}
          </button>

          {hasPhone && (
            <button
              onClick={() => onCreateAppointment(true)}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: `1px solid ${THEME.greenDark}`,
                background: "#25d366",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
                minWidth: 200,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>📱</span>
              Crea e invia WhatsApp
            </button>
          )}
        </div>
      </div>
    </>
  );
}
