// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/modals/SelectedEventModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale di MODIFICA appuntamento — si apre cliccando su un appuntamento
// esistente sul calendario. Sezioni:
//
//   1. Header: titolo (nome paziente), stato corrente colorato, badge
//      DOMICILIO se applicabile, ✕ chiudi
//   2. Bottone "◫ Duplica" → chiude SelectedEvent e apre CreateModal
//      in modalità duplica
//   3. "Modifica Data e Orario": data, orario inizio, durata
//   4. "Trattamento e Prezzo": pillole trattamento, fatturato/contanti,
//      input importo (con bottone "Usa standard"), color picker
//   5. Stato (select) + bottone "Invia promemoria WhatsApp"
//   6. Bottone "Chiedi recensione Google" (solo se status=done)
//   7. Textarea Nota
//   8. SOAPNotesEditor (solo se patient_id)
//   9. Footer: Elimina | Scheda paziente | Salva modifiche
//
// Tutti gli stati sono nel page.tsx, questo componente delega tutto
// tramite callback.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import Link from "next/link";
import { SOAPNotesEditor } from "../SOAPNotes";
import {
  THEME, ALL_TREATMENTS,
  type Status, type TreatmentType, type LocationType,
  type CalendarEvent,
} from "../../utils";
import StatusBadge from "@/src/components/StatusBadge";
import EventPackageBox from "@/src/components/packages/EventPackageBox";

export type SelectedEventState = {
  id: string;
  title: string;
  patient_id?: string;
  location?: LocationType | null;
  clinic_site?: string | null;
  domicile_address?: string | null;
  treatment?: string | null;
  diagnosis?: string | null;
  amount?: number | null;
  treatment_type?: string | null;
  price_type?: string | null;
  start?: Date;
  end?: Date;
  /** Pacchetto sedute collegato (mig. 014_packages) — se valorizzato la
   *  seduta scala dal pacchetto e l'incasso vive sui package_payments */
  package_id?: string | null;
};

export type SelectedEventModalProps = {
  selectedEvent: SelectedEventState;
  /** Lista eventi (per cercare il dettaglio aggiornato) */
  events: CalendarEvent[];
  /** Mostra scrollbar nella sidebar — passa la classe condizionale */
  showAllUpcoming: boolean;

  // Stati di edit
  editStatus: Status;
  setEditStatus: (s: Status) => void;
  editNote: string;
  setEditNote: (s: string) => void;
  editAmount: string;
  setEditAmount: (s: string) => void;
  editTreatmentType: TreatmentType;
  setEditTreatmentType: (t: TreatmentType) => void;
  editPriceType: "invoiced" | "cash";
  setEditPriceType: (p: "invoiced" | "cash") => void;
  /** Metodo pagamento (solo se editPriceType === "invoiced"). Obbligatorio per fatturati. */
  editPaymentMethod: "cash" | "pos" | "bank_transfer" | null;
  setEditPaymentMethod: (m: "cash" | "pos" | "bank_transfer" | null) => void;
  editDate: string;
  setEditDate: (s: string) => void;
  editStartTime: string;
  setEditStartTime: (s: string) => void;
  editDuration: "0.5" | "0.75" | "1" | "1.5" | "2";
  setEditDuration: (d: "0.5" | "0.75" | "1" | "1.5" | "2") => void;

  // Slot orari disponibili
  timeSelectSlots: string[];

  // Mappa colori personalizzati per paziente
  eventColors: Record<string, string>;
  setEventColors: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  /** Restituisce il colore di un evento (status / treatment / personalizzato) */
  getEventColor: (event: CalendarEvent | { status: Status; patient_id?: string; treatment_type?: string | null }) => string;
  /** Default amount per (treatment, price) */
  getDefaultAmount: (t: "seduta" | "macchinario", p: "invoiced" | "cash") => number;

  // Callback
  onClose: () => void;
  /** Apre CreateModal in modalità duplica */
  onDuplicate: (event: CalendarEvent) => void;
  /** Salva le modifiche all'appuntamento */
  onSave: () => void;
  /** Elimina l'appuntamento dal DB */
  onDelete: () => void;
  /** Genera attestato di presenza per questo singolo appuntamento (PDF) */
  onGenerateCertificate: () => void;
  /** Invia promemoria WhatsApp */
  onSendReminder: (eventId: string, phone?: string, firstName?: string) => void;
  /** Apre WhatsApp con messaggio recensione Google */
  onSendGoogleReview: (phone?: string, firstName?: string) => void;
  /** Apre il dialog "Promemoria settimana" per il paziente di questo appuntamento */
  onSendWeeklyReminder: (patientId: string, firstName: string, phone: string | null) => void;

  // ─── Multi-operatore (mig. 019/022, Fase 4d.1) ──────────────
  /** Toggle multi_operator_enabled — se false, il selettore non si vede */
  multiOperatorEnabled?: boolean;
  /** Membri attivi del team (richiesto se multiOperatorEnabled = true) */
  members?: Array<{
    user_id: string | null;
    invite_token?: string | null;
    display_name: string | null;
    display_color?: string | null;
    signature_short?: string | null;
  }>;
  /** ID operatore correntemente selezionato per la modifica */
  editOperatorId?: string | null;
  setEditOperatorId?: (id: string | null) => void;

  // ─── Multi-stanza (mig. 019, Fase Stanze) ──────────────
  multiRoomEnabled?: boolean;
  rooms?: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
  editRoomId?: string | null;
  setEditRoomId?: (id: string | null) => void;
};

export default function SelectedEventModal({
  selectedEvent, events, showAllUpcoming,
  editStatus, setEditStatus,
  editNote, setEditNote,
  editAmount, setEditAmount,
  editTreatmentType, setEditTreatmentType,
  editPriceType, setEditPriceType,
  editPaymentMethod, setEditPaymentMethod,
  editDate, setEditDate,
  editStartTime, setEditStartTime,
  editDuration, setEditDuration,
  timeSelectSlots,
  eventColors, setEventColors,
  getEventColor, getDefaultAmount,
  onClose, onDuplicate, onSave, onDelete, onGenerateCertificate,
  onSendReminder, onSendGoogleReview, onSendWeeklyReminder,
  multiOperatorEnabled,
  members,
  editOperatorId,
  setEditOperatorId,
  multiRoomEnabled,
  rooms,
  editRoomId,
  setEditRoomId,
}: SelectedEventModalProps) {

  // Lookup evento corrente nei dati aggiornati
  const liveEvent = events.find(e => e.id === selectedEvent.id) || null;
  const hasPhone = !!liveEvent?.patient_phone;

  // ─── Multi-op: conflict detection per operatore selezionato (Fase 4d.1) ──
  // Se l'operatore + orario di modifica collidono con un altro appuntamento
  // (escluso questo stesso evento), mostriamo warning ambra sopra al footer.
  const operatorConflict = (() => {
    if (!multiOperatorEnabled) return null;
    if (!editOperatorId) return null;
    if (!editDate || !editStartTime) return null;
    const startStr = `${editDate}T${editStartTime}:00`;
    const start = new Date(startStr).getTime();
    if (Number.isNaN(start)) return null;
    const durHours = parseFloat(editDuration);
    const end = start + durHours * 60 * 60000;

    for (const ev of events) {
      if (ev.id === selectedEvent.id) continue;
      if (ev.operator_id !== editOperatorId) continue;
      if (ev.status === "cancelled") continue;
      const evStart = ev.start.getTime();
      const evEnd = ev.end.getTime();
      if (!(evEnd <= start || evStart >= end)) {
        return {
          patient: ev.patient_name,
          time: `${ev.start.getHours().toString().padStart(2, "0")}:${ev.start.getMinutes().toString().padStart(2, "0")}`,
        };
      }
    }
    return null;
  })();

  // ─── Multi-stanza: conflict detection per stanza (Fase Stanze) ──
  const roomConflict = (() => {
    if (!multiRoomEnabled) return null;
    if (!editRoomId) return null;
    if (!editDate || !editStartTime) return null;
    const startStr = `${editDate}T${editStartTime}:00`;
    const start = new Date(startStr).getTime();
    if (Number.isNaN(start)) return null;
    const durHours = parseFloat(editDuration);
    const end = start + durHours * 60 * 60000;

    for (const ev of events) {
      if (ev.id === selectedEvent.id) continue;
      if (ev.room_id !== editRoomId) continue;
      if (ev.status === "cancelled") continue;
      const evStart = ev.start.getTime();
      const evEnd = ev.end.getTime();
      if (!(evEnd <= start || evStart >= end)) {
        return {
          patient: ev.patient_name,
          time: `${ev.start.getHours().toString().padStart(2, "0")}:${ev.start.getMinutes().toString().padStart(2, "0")}`,
        };
      }
    }
    return null;
  })();

  // Color picker iniziale: custom (per paziente) → fallback colore stato/trattamento
  const colorPickerValue =
    eventColors[selectedEvent.patient_id || ""]
    || getEventColor(liveEvent || { status: "booked" });

  return (
    <div
      className={`no-print sidebar-scroll ${showAllUpcoming ? "show-scrollbar" : ""}`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(30,64,175,0.35)",
        zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 680,
          maxWidth: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          background: THEME.panelBg,
          color: THEME.text,
          borderRadius: 16,
          border: `2px solid ${THEME.border}`,
          boxShadow: "0 24px 64px rgba(30,64,175,0.2)",
          padding: "32px 28px",
        }}
      >
        {/* ─── Header ──────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: THEME.blue, letterSpacing: -0.3 }}>
              {selectedEvent.title}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: THEME.muted, fontWeight: 600, letterSpacing: 0.3, display: "flex", alignItems: "center", gap: 8 }}>
              <span>Stato:</span>
              <StatusBadge status={editStatus} />
              {selectedEvent.location === "domicile" && (
                <span style={{ marginLeft: 4, color: THEME.amber, fontWeight: 700 }}>⌂ DOMICILIO</span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 42, height: 42, borderRadius: 10,
              border: `2px solid ${THEME.border}`,
              background: THEME.panelSoft, color: THEME.blue,
              cursor: "pointer", fontWeight: 800, fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        {/* ─── Box pacchetto sedute (mig. 014_packages) ─── */}
        {selectedEvent.package_id && (
          <EventPackageBox packageId={selectedEvent.package_id} />
        )}

        {/* ─── Bottone duplica ─────────────────────────────── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => {
              if (liveEvent) {
                onDuplicate(liveEvent);
                onClose();
              }
            }}
            style={{
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: "linear-gradient(135deg, #0d9488, #2563eb)",
              color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13,
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 2px 8px rgba(91,130,168,0.25)",
              letterSpacing: 0.3,
            }}
          >
            <span>◫</span>
            Duplica
          </button>
        </div>

        {/* ─── Modifica Data e Orario ──────────────────────── */}
        <div style={{ marginBottom: 20, border: `1.5px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 12 }}>
            Modifica Data e Orario
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                Data
              </label>
              <input
                type="date"
                value={editDate}
                onChange={e => setEditDate(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                Orario Inizio
              </label>
              <select
                value={editStartTime}
                onChange={e => setEditStartTime(e.target.value)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              >
                {timeSelectSlots.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                Durata
              </label>
              <select
                value={editDuration}
                onChange={e => setEditDuration(e.target.value as "0.5" | "0.75" | "1" | "1.5" | "2")}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              >
                <option value="0.5">30 min</option>
                <option value="0.75">45 min</option>
                <option value="1">1 ora</option>
                <option value="1.5">1.5 ore</option>
                <option value="2">2 ore</option>
              </select>
            </div>
          </div>

          <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600, marginTop: 8 }}>
            Nuovo orario: {editDate && editStartTime
              ? `${editDate.split("-").reverse().join("/")} alle ${editStartTime}`
              : "Seleziona data e orario"}
          </div>
        </div>

        {/* ─── Operatore (Multi-op, Fase 4d.1) ────────────────────────────
            Visibile solo se multi_operator_enabled = true. Permette di cambiare
            l'operatore assegnato. Conflict detection sotto. */}
        {multiOperatorEnabled && members && members.length > 0 && setEditOperatorId && (
          <div style={{ marginBottom: 20, border: `1.5px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 12 }}>
              Operatore
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {members
                .filter(m => m.user_id != null)
                .map(m => {
                  const id = m.user_id as string;
                  const isSelected = editOperatorId === id;
                  const color = m.display_color || "#94a3b8";
                  const initials = (m.signature_short || m.display_name || "?").substring(0, 2).toUpperCase();
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setEditOperatorId(isSelected ? null : id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px 6px 6px",
                        borderRadius: 99,
                        background: isSelected ? color : "#fff",
                        border: isSelected ? `2px solid ${color}` : `1.5px solid ${THEME.border}`,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s",
                      }}
                    >
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          background: isSelected ? "#fff" : color,
                          color: isSelected ? color : "#fff",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10,
                          fontWeight: 800,
                        }}
                      >
                        {initials}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: isSelected ? "#fff" : THEME.text,
                        }}
                      >
                        {m.display_name || "—"}
                      </span>
                    </button>
                  );
                })}
              <button
                type="button"
                onClick={() => setEditOperatorId(null)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px 6px 6px",
                  borderRadius: 99,
                  background: editOperatorId === null ? "#94a3b8" : "#fff",
                  border: editOperatorId === null ? "2px solid #94a3b8" : `1.5px solid ${THEME.border}`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: editOperatorId === null ? "#fff" : "#94a3b8",
                    color: editOperatorId === null ? "#475569" : "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  ?
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: editOperatorId === null ? "#fff" : THEME.muted,
                  }}
                >
                  Non assegnato
                </span>
              </button>
            </div>

            {operatorConflict && (
              <div style={{
                marginTop: 12,
                padding: "10px 12px",
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "#92400e",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span>
                  Conflitto: questo operatore ha già <strong>{operatorConflict.patient}</strong> alle <strong>{operatorConflict.time}</strong>.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ─── Stanza (Multi-stanza, Fase Stanze, mig. 019) ─── */}
        {multiRoomEnabled && rooms && rooms.length > 0 && setEditRoomId && (
          <div style={{ marginBottom: 20, border: `1.5px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 12 }}>
              Stanza
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {rooms.map(r => {
                const isSelected = editRoomId === r.id;
                const color = r.color || "#94a3b8";
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setEditRoomId(isSelected ? null : r.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 14px",
                      borderRadius: 99,
                      background: isSelected ? color : "#fff",
                      border: isSelected ? `2px solid ${color}` : `1.5px solid ${THEME.border}`,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: isSelected ? "#fff" : color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: isSelected ? "#fff" : THEME.text,
                      }}
                    >
                      {r.name}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setEditRoomId(null)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 99,
                  background: editRoomId === null ? "#94a3b8" : "#fff",
                  border: editRoomId === null ? "2px solid #94a3b8" : `1.5px solid ${THEME.border}`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: editRoomId === null ? "#fff" : THEME.text,
                  }}
                >
                  Nessuna
                </span>
              </button>
            </div>

            {roomConflict && (
              <div style={{
                marginTop: 12,
                padding: "10px 12px",
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "#92400e",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <span>
                  Conflitto: questa stanza è già occupata da <strong>{roomConflict.patient}</strong> alle <strong>{roomConflict.time}</strong>.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ─── Trattamento e Prezzo ────────────────────────── */}
        <div style={{ marginBottom: 20, border: `1.5px solid ${THEME.border}`, padding: 16, borderRadius: 8, background: THEME.panelSoft }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 12 }}>
            Trattamento e Prezzo
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* Trattamento */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                Trattamento
              </div>
              <div style={{ position: "relative" }}>
                {/* Pallino colore a sinistra */}
                <div style={{
                  position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                  width: 12, height: 12, borderRadius: "50%",
                  background: ALL_TREATMENTS.find(t => t.value === editTreatmentType)?.color ?? "#94a3b8",
                  pointerEvents: "none", zIndex: 1,
                  border: "1px solid rgba(0,0,0,0.06)",
                }} />
                <select
                  value={editTreatmentType}
                  onChange={e => setEditTreatmentType(e.target.value as TreatmentType)}
                  style={{
                    width: "100%", padding: "9px 32px 9px 32px", borderRadius: 7,
                    border: `1.5px solid ${THEME.borderSoft}`, fontSize: 13, fontWeight: 700,
                    background: "#fff", color: THEME.text, cursor: "pointer",
                    appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
                  }}
                >
                  {ALL_TREATMENTS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {/* Freccia destra */}
                <div style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  pointerEvents: "none", color: THEME.muted, fontSize: 10,
                }}>▼</div>
              </div>
            </div>

            {/* Fatturazione */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
                Fatturazione
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setEditPriceType("invoiced")}
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 8,
                    border: `1px solid ${editPriceType === "invoiced" ? THEME.greenDark : THEME.borderSoft}`,
                    background: editPriceType === "invoiced" ? THEME.green : "#fff",
                    color: editPriceType === "invoiced" ? "#fff" : THEME.text,
                    cursor: "pointer", fontWeight: 600, fontSize: 12,
                  }}
                >
                  Fatturato
                </button>
                <button
                  onClick={() => setEditPriceType("cash")}
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 8,
                    border: `1px solid ${editPriceType === "cash" ? THEME.amber : THEME.borderSoft}`,
                    background: editPriceType === "cash" ? "rgba(245,158,11,0.1)" : "#fff",
                    color: editPriceType === "cash" ? THEME.amber : THEME.text,
                    cursor: "pointer", fontWeight: 600, fontSize: 12,
                  }}
                >
                  Contanti
                </button>
              </div>

              {/* ── Metodo Pagamento — visibile solo se "Fatturato" ── */}
              {editPriceType === "invoiced" && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: THEME.muted, marginBottom: 6 }}>
                    Metodo pagamento <span style={{ color: "#dc2626" }}>*</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([
                      { v: "cash",          label: "Contanti" },
                      { v: "pos",           label: "POS" },
                      { v: "bank_transfer", label: "Bonifico" },
                    ] as const).map(opt => {
                      const active = editPaymentMethod === opt.v;
                      return (
                        <button
                          key={opt.v}
                          onClick={() => setEditPaymentMethod(opt.v)}
                          style={{
                            flex: 1, padding: "7px 6px", borderRadius: 7,
                            border: `1px solid ${active ? THEME.blue : THEME.borderSoft}`,
                            background: active ? "rgba(37,99,235,0.08)" : "#fff",
                            color: active ? THEME.blue : THEME.text,
                            cursor: "pointer", fontWeight: 600, fontSize: 11,
                          }}
                        >{opt.label}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Importo */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginBottom: 8 }}>
              Importo (€)
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={editAmount}
                onChange={e => {
                  const value = e.target.value.replace(/[^0-9.,]/g, "");
                  setEditAmount(value);
                }}
                placeholder="Importo personalizzato (lasciare vuoto per prezzo standard)"
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 8,
                  border: `1px solid ${THEME.blue}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              />
              <button
                onClick={() => {
                  const tType = editTreatmentType as "seduta" | "macchinario";
                  const pType = editPriceType as "invoiced" | "cash";
                  setEditAmount(getDefaultAmount(tType, pType).toString());
                }}
                style={{
                  padding: "10px 16px", borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelSoft, color: THEME.text,
                  cursor: "pointer", fontWeight: 600, fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                Usa standard
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: THEME.muted, fontWeight: 600 }}>
              {editAmount
                ? `Totale: € ${parseFloat(editAmount.replace(",", ".")).toFixed(2)}`
                : `Prezzo standard: € ${getDefaultAmount(
                    editTreatmentType as "seduta" | "macchinario",
                    editPriceType as "invoiced" | "cash"
                  ).toFixed(2)}`}
            </div>
          </div>

          {/* Color picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted }}>
              Colore personalizzato:
            </div>
            <input
              type="color"
              value={colorPickerValue}
              onChange={e => {
                if (selectedEvent.patient_id) {
                  setEventColors(prev => ({
                    ...prev,
                    [selectedEvent.patient_id!]: e.target.value,
                  }));
                }
              }}
              style={{
                width: 30, height: 30, borderRadius: 6,
                border: `1.5px solid ${THEME.border}`,
                cursor: "pointer",
              }}
            />
            <button
              onClick={() => {
                if (selectedEvent.patient_id) {
                  setEventColors(prev => {
                    const newColors = { ...prev };
                    delete newColors[selectedEvent.patient_id!];
                    return newColors;
                  });
                }
              }}
              style={{
                padding: "4px 8px", borderRadius: 6,
                border: `1px solid ${THEME.borderSoft}`,
                background: THEME.panelSoft, color: THEME.text,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* ─── Stato + Promemoria ──────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 8 }}>
              Stato
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value as Status)}
                style={{
                  width: "100%", marginTop: 8, padding: 10, borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  outline: "none", fontWeight: 600, fontSize: 13,
                }}
              >
                <option value="booked">Prenotato</option>
                <option value="confirmed">Confermato</option>
                <option value="done">Eseguito</option>
                <option value="not_paid">Non pagata</option>
                <option value="cancelled">Annullato</option>
              </select>
            </label>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 8 }}>
              Promemoria
            </div>
            <button
              onClick={() => {
                if (liveEvent) {
                  onSendReminder(
                    liveEvent.id,
                    liveEvent.patient_phone ?? undefined,
                    liveEvent.patient_first_name ?? undefined,
                  );
                }
              }}
              disabled={!hasPhone}
              style={{
                width: "100%", padding: "12px", borderRadius: 8,
                border: `1px solid ${THEME.greenDark}`,
                background: "#25d366", color: "#fff",
                cursor: hasPhone ? "pointer" : "not-allowed",
                fontWeight: 600, fontSize: 13,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: hasPhone ? 1 : 0.6,
              }}
            >
              <span>📱</span>
              Invia promemoria WhatsApp
            </button>

            {/* Promemoria settimana — visibile solo se l'appuntamento ha un patient_id */}
            {liveEvent?.patient_id && (
              <button
                onClick={() => {
                  if (liveEvent?.patient_id) {
                    onSendWeeklyReminder(
                      liveEvent.patient_id,
                      liveEvent.patient_first_name ?? "",
                      liveEvent.patient_phone ?? null,
                    );
                  }
                }}
                disabled={!hasPhone}
                style={{
                  width: "100%", marginTop: 8, padding: "10px", borderRadius: 8,
                  border: `1px solid ${THEME.borderSoft}`,
                  background: THEME.panelBg, color: THEME.text,
                  cursor: hasPhone ? "pointer" : "not-allowed",
                  fontWeight: 600, fontSize: 12,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  opacity: hasPhone ? 1 : 0.6,
                }}
              >
                <span>📲</span>
                Promemoria settimana
              </button>
            )}
          </div>
        </div>

        {/* ─── Recensione Google (solo se status=done) ─────── */}
        {editStatus === "done" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 8 }}>
              Recensione Google
            </div>
            <button
              onClick={() => {
                if (liveEvent) {
                  onSendGoogleReview(
                    liveEvent.patient_phone ?? undefined,
                    liveEvent.patient_first_name ?? undefined,
                  );
                }
              }}
              disabled={!hasPhone}
              style={{
                width: "100%", padding: "12px", borderRadius: 8,
                border: `1px solid ${THEME.patientsAccent}`,
                background: THEME.patientsAccent, color: "#fff",
                cursor: hasPhone ? "pointer" : "not-allowed",
                fontWeight: 600, fontSize: 13,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: hasPhone ? 1 : 0.6,
              }}
            >
              <span>⭐</span>
              Chiedi recensione Google
            </button>
            {!hasPhone && (
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4, fontWeight: 600 }}>
                Nessun numero di telefono disponibile
              </div>
            )}
          </div>
        )}

        {/* ─── Nota ─────────────────────────────────────────── */}
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: THEME.textSoft, marginBottom: 20 }}>
          Nota
          <textarea
            value={editNote}
            onChange={e => setEditNote(e.target.value)}
            rows={4}
            style={{
              width: "100%", marginTop: 8, padding: 10, borderRadius: 8,
              border: `1px solid ${THEME.borderSoft}`,
              background: THEME.panelBg, color: THEME.text,
              outline: "none", resize: "vertical",
              fontWeight: 600, fontSize: 13,
            }}
          />
        </label>

        {/* ─── SOAP Notes (solo se patient_id) ───────────── */}
        {selectedEvent.patient_id && (
          <div style={{ marginTop: -8, marginBottom: 20 }}>
            <SOAPNotesEditor appointmentId={selectedEvent.id} patientId={selectedEvent.patient_id} />
          </div>
        )}

        {/* ─── Footer: Elimina | Scheda paziente | Salva ──── */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <button
            onClick={onDelete}
            style={{
              padding: "12px 20px", borderRadius: 8,
              border: "1px solid rgba(220,38,38,0.25)",
              background: "rgba(220,38,38,0.06)",
              color: THEME.red, cursor: "pointer",
              fontWeight: 600, minWidth: 120, fontSize: 13,
            }}
          >
            Elimina
          </button>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              href={selectedEvent.patient_id ? `/patients/${selectedEvent.patient_id}` : "#"}
              style={{
                padding: "12px 20px", borderRadius: 8,
                border: `1px solid ${THEME.borderSoft}`,
                background: THEME.panelSoft, color: THEME.text,
                fontWeight: 600, textDecoration: "none",
                display: "inline-flex", alignItems: "center",
                minWidth: 170, justifyContent: "center",
                opacity: selectedEvent.patient_id ? 1 : 0.5,
                pointerEvents: selectedEvent.patient_id ? "auto" : "none",
                fontSize: 13,
              }}
            >
              Scheda paziente
            </Link>

            {/* Bottone "Attestato presenza" — abilitato solo se c'è un paziente */}
            <button
              onClick={onGenerateCertificate}
              disabled={!selectedEvent.patient_id}
              title={selectedEvent.patient_id
                ? "Scarica attestato PDF di presenza per questa data"
                : "Disponibile solo per appuntamenti con paziente collegato"}
              style={{
                padding: "12px 20px", borderRadius: 8,
                border: `1px solid ${THEME.borderSoft}`,
                background: THEME.panelSoft, color: THEME.text,
                cursor: selectedEvent.patient_id ? "pointer" : "not-allowed",
                fontWeight: 600,
                display: "inline-flex", alignItems: "center", gap: 6,
                minWidth: 170, justifyContent: "center",
                opacity: selectedEvent.patient_id ? 1 : 0.5,
                fontSize: 13,
              }}
            >
              📄 Attestato presenza
            </button>

            <button
              onClick={onSave}
              style={{
                padding: "12px 20px", borderRadius: 8,
                border: `1px solid ${THEME.greenDark}`,
                background: THEME.green, color: "#fff",
                cursor: "pointer", fontWeight: 600,
                minWidth: 140, fontSize: 13,
              }}
            >
              Salva modifiche
            </button>
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
          Nota: &quot;Annullato&quot; mantiene lo storico · &quot;Elimina&quot; rimuove dal DB.
        </div>
      </div>
    </div>
  );
}
