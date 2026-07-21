// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/modals/GroupEventModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modal di gestione APPUNTAMENTO DI GRUPPO (mig. 014).
// Sostituisce SelectedEventModal quando event.is_group === true.
//
// Funzionalità:
//   • Header gradient teal con titolo gruppo + badge "GRUPPO N/M"
//   • 3 KPI: partecipanti, prezzo/persona, totale incassato
//   • Lista partecipanti (con stato pagamento, presenza, prezzo individuale)
//   • Pulsante "+ Aggiungi paziente" → cerca paziente, lo aggiunge al gruppo
//   • Per ogni partecipante: toggle pagato, toggle presenza, modifica prezzo,
//     note, rimozione
//   • Footer: invio promemoria WA a tutti, segna tutti pagati (bulk),
//     elimina gruppo
//
// Tutti i CRUD sui partecipanti passano dal page.tsx via callback.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useMemo, useEffect } from "react";
import {
  THEME, fmtTime, formatDMY,
  type CalendarEvent,
  type AppointmentParticipant,
  type PatientLite,
} from "../../utils";
import QuickPatientForm from "../QuickPatientForm";

// Stesso schema di colori di GroupEventCard per coerenza visiva
const AVATAR_COLORS: Array<{ bg: string; fg: string }> = [
  { bg: "#fbbf24", fg: "#78350f" },
  { bg: "#f472b6", fg: "#831843" },
  { bg: "#60a5fa", fg: "#1e3a8a" },
  { bg: "#a78bfa", fg: "#4c1d95" },
  { bg: "#34d399", fg: "#064e3b" },
  { bg: "#fb923c", fg: "#7c2d12" },
  { bg: "#22d3ee", fg: "#164e63" },
  { bg: "#f87171", fg: "#7f1d1d" },
];

function colorForPatient(patientId: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < patientId.length; i++) {
    hash = (hash * 31 + patientId.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsOf(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName ?? "").trim()[0] ?? "";
  const l = (lastName ?? "").trim()[0] ?? "";
  return (l + f).toUpperCase() || "?";
}

export type GroupEventModalProps = {
  /** Evento gruppo (con array participants già caricato) */
  event: CalendarEvent;

  /**
   * Funzione di ricerca pazienti.
   * Restituisce i pazienti che fanno match con la query (escludendo già nel gruppo).
   */
  searchPatients: (query: string) => Promise<PatientLite[]>;

  /** Crea paziente rapido (mig. 015). Restituisce il paziente creato o null. */
  createQuickPatient?: (payload: { first_name: string; last_name: string; phone: string | null }) => Promise<PatientLite | null>;

  /** Callback quando l'utente vuole chiudere il modal */
  onClose: () => void;

  /** Aggiungi un paziente al gruppo (price = prezzo individuale) */
  onAddParticipant: (
    appointmentId: string,
    patientId: string,
    price: number,
  ) => Promise<void>;

  /** Aggiorna campi del partecipante (payment_status, attendance, price, notes) */
  onUpdateParticipant: (
    participantId: string,
    patch: Partial<Pick<AppointmentParticipant,
      "payment_status" | "payment_method" | "attendance_status" | "price" | "participant_notes"
    >>,
  ) => Promise<void>;

  /** Rimuovi un paziente dal gruppo */
  onRemoveParticipant: (participantId: string) => Promise<void>;

  /** Segna tutti pagati (bulk) */
  onMarkAllPaid: (appointmentId: string) => Promise<void>;

  /** Invia promemoria WhatsApp a TUTTI i partecipanti (1 messaggio per paziente) */
  onSendReminderToAll: (event: CalendarEvent) => Promise<void>;

  /** Elimina il gruppo (con conferma in chiamante) */
  onDeleteGroup: (appointmentId: string) => Promise<void>;

  /** Modifica titolo/max/prezzo del gruppo */
  onUpdateGroup: (
    appointmentId: string,
    patch: Partial<Pick<CalendarEvent,
      "group_title" | "group_max_participants" | "group_price_per_person"
    >>,
  ) => Promise<void>;

  /**
   * Duplica il gruppo (step 6.2).
   * Crea un nuovo appuntamento gruppo identico (titolo, max, prezzo) alla nuova data,
   * e se `withParticipants=true` replica anche i partecipanti (con pagamenti/presenze azzerati).
   */
  onDuplicateGroup: (
    sourceAppointmentId: string,
    newStart: Date,
    withParticipants: boolean,
  ) => Promise<void>;
};

export default function GroupEventModal({
  event,
  searchPatients,
  createQuickPatient,
  onClose,
  onAddParticipant,
  onUpdateParticipant,
  onRemoveParticipant,
  onMarkAllPaid,
  onSendReminderToAll,
  onDeleteGroup,
  onUpdateGroup,
  onDuplicateGroup,
}: GroupEventModalProps) {
  const participants = event.participants ?? [];
  const max = event.group_max_participants ?? 0;
  const pricePP = event.group_price_per_person ?? 0;
  const count = participants.length;
  const paidCount = participants.filter(p => p.payment_status === "paid").length;
  const total = participants.reduce((s, p) => s + (Number(p.price) || 0), 0);
  const totalPaid = participants
    .filter(p => p.payment_status === "paid")
    .reduce((s, p) => s + (Number(p.price) || 0), 0);
  const isFull = count >= max;

  // ─── State locale ───────────────────────────────────────────────────
  const [showAddSearch, setShowAddSearch] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [newPatientPrice, setNewPatientPrice] = useState<string>(pricePP.toFixed(2));
  const [editingNotesFor, setEditingNotesFor] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Modifica titolo/max/prezzo del gruppo
  const [editingGroup, setEditingGroup] = useState(false);
  const [editTitle, setEditTitle] = useState(event.group_title || "");
  const [editMax, setEditMax] = useState(String(max));
  const [editPrice, setEditPrice] = useState(pricePP.toFixed(2));

  // ─── Duplicazione gruppo (step 6.2) ────────────────────────────────
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  // Data di default: stessa ora, 7 giorni dopo (di solito un altro lunedì)
  const defaultDupDate = useMemo(() => {
    const d = new Date(event.start);
    d.setDate(d.getDate() + 7);
    return d;
  }, [event.start]);
  const toLocalDateStr = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  const toLocalTimeStr = (d: Date): string =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const [dupDate, setDupDate] = useState<string>(toLocalDateStr(defaultDupDate));
  const [dupTime, setDupTime] = useState<string>(toLocalTimeStr(defaultDupDate));
  const [dupWithParts, setDupWithParts] = useState<boolean>(true);

  // ─── Ricerca pazienti (debounced, esclude già aggiunti) ────────────
  const alreadyInGroup = useMemo(
    () => new Set(participants.map(p => p.patient_id)),
    [participants],
  );

  const [searchResults, setSearchResults] = useState<PatientLite[]>([]);

  // Debounce ricerca (200ms)
  useEffect(() => {
    const q = searchQ.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await searchPatients(q);
        if (!cancelled) {
          setSearchResults(res.filter(p => !alreadyInGroup.has(p.id)).slice(0, 8));
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, alreadyInGroup]);

  // ─── Handlers ───────────────────────────────────────────────────────
  const handleAddPatient = async (patient: PatientLite) => {
    const price = parseFloat(newPatientPrice.replace(",", ".")) || 0;
    setBusy(true);
    try {
      await onAddParticipant(event.id, patient.id, price);
      setSearchQ("");
      setShowAddSearch(false);
      // ripristina prezzo default per il prossimo
      setNewPatientPrice(pricePP.toFixed(2));
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePaid = async (p: AppointmentParticipant) => {
    setBusy(true);
    try {
      if (p.payment_status === "paid") {
        await onUpdateParticipant(p.id, { payment_status: "unpaid", payment_method: null });
      } else {
        await onUpdateParticipant(p.id, { payment_status: "paid", payment_method: "cash" });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAttendance = async (p: AppointmentParticipant) => {
    // Ciclo: pending → present → absent → pending
    const next: AppointmentParticipant["attendance_status"] =
      p.attendance_status === "pending" ? "present"
      : p.attendance_status === "present" ? "absent"
      : "pending";
    setBusy(true);
    try {
      await onUpdateParticipant(p.id, { attendance_status: next });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNotes = async (participantId: string) => {
    setBusy(true);
    try {
      await onUpdateParticipant(participantId, { participant_notes: notesDraft || null });
      setEditingNotesFor(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSavePrice = async (p: AppointmentParticipant, newPriceStr: string) => {
    const price = parseFloat(newPriceStr.replace(",", "."));
    if (isNaN(price) || price < 0) return;
    if (price === Number(p.price)) return;
    setBusy(true);
    try {
      await onUpdateParticipant(p.id, { price });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (p: AppointmentParticipant) => {
    const confirmed = window.confirm(
      `Rimuovere ${p.patient_last_name ?? ""} ${p.patient_first_name ?? ""} dal gruppo?`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await onRemoveParticipant(p.id);
    } finally {
      setBusy(false);
    }
  };

  const handleMarkAll = async () => {
    setBusy(true);
    try {
      await onMarkAllPaid(event.id);
    } finally {
      setBusy(false);
    }
  };

  const handleSendAll = async () => {
    setBusy(true);
    try {
      await onSendReminderToAll(event);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Eliminare definitivamente il gruppo "${event.group_title || "Gruppo"}"?\n\n` +
      `Tutti i ${count} partecipanti verranno rimossi dal gruppo (i pazienti restano nel database).`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await onDeleteGroup(event.id);
    } finally {
      setBusy(false);
    }
  };

  const handleDuplicate = async () => {
    if (!dupDate || !dupTime) {
      alert("Inserisci data e ora valide per il nuovo gruppo.");
      return;
    }
    const newStart = new Date(`${dupDate}T${dupTime}:00`);
    if (isNaN(newStart.getTime())) {
      alert("Data o ora non valide.");
      return;
    }
    setBusy(true);
    try {
      await onDuplicateGroup(event.id, newStart, dupWithParts);
      setDuplicateOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveGroupEdit = async () => {
    const newMax = parseInt(editMax, 10);
    const newPrice = parseFloat(editPrice.replace(",", "."));
    if (!editTitle.trim()) {
      alert("Il titolo non può essere vuoto.");
      return;
    }
    if (isNaN(newMax) || newMax < count) {
      alert(`Il numero massimo deve essere ≥ ${count} (partecipanti attuali).`);
      return;
    }
    if (isNaN(newPrice) || newPrice < 0) {
      alert("Prezzo non valido.");
      return;
    }
    setBusy(true);
    try {
      await onUpdateGroup(event.id, {
        group_title: editTitle.trim(),
        group_max_participants: newMax,
        group_price_per_person: newPrice,
      });
      setEditingGroup(false);
    } finally {
      setBusy(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div
      className="no-print"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(13,148,136,0.25)",
        zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 600,
          maxWidth: "100%",
          maxHeight: "90vh",
          background: THEME.panelBg,
          color: THEME.text,
          borderRadius: 16,
          border: `2px solid ${THEME.teal}`,
          boxShadow: "0 24px 64px rgba(13,148,136,0.3)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ═══════ HEADER GRADIENT ══════════════════════════════════ */}
        <div style={{
          background: "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)",
          padding: "18px 22px",
          color: "#fff",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: "inline-block",
                background: "rgba(255,255,255,0.25)",
                padding: "2px 9px", borderRadius: 99,
                fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                marginBottom: 6,
              }}>
                👥 GRUPPO · {count}/{max}
              </div>

              {!editingGroup ? (
                <>
                  <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.2 }}>
                    {event.group_title || "Gruppo"}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.92, marginTop: 3 }}>
                    {formatDMY(event.start)} · {fmtTime(event.start.toISOString())}–{fmtTime(event.end.toISOString())}
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    style={{
                      padding: "6px 10px", borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.4)",
                      background: "rgba(255,255,255,0.15)",
                      color: "#fff", fontSize: 14, fontWeight: 700,
                      outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      min={count}
                      value={editMax}
                      onChange={e => setEditMax(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="Max"
                      style={{
                        padding: "5px 8px", borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.4)",
                        background: "rgba(255,255,255,0.15)",
                        color: "#fff", fontSize: 12, fontWeight: 700,
                        outline: "none", width: 70,
                      }}
                    />
                    <input
                      type="text"
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
                      placeholder="€/persona"
                      style={{
                        padding: "5px 8px", borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.4)",
                        background: "rgba(255,255,255,0.15)",
                        color: "#fff", fontSize: 12, fontWeight: 700,
                        outline: "none", width: 90,
                      }}
                    />
                    <button
                      onClick={handleSaveGroupEdit}
                      disabled={busy}
                      style={{
                        padding: "5px 12px", borderRadius: 6, border: "none",
                        background: "#fff", color: THEME.teal,
                        fontSize: 11, fontWeight: 800, cursor: "pointer",
                      }}
                    >Salva</button>
                    <button
                      onClick={() => {
                        setEditingGroup(false);
                        setEditTitle(event.group_title || "");
                        setEditMax(String(max));
                        setEditPrice(pricePP.toFixed(2));
                      }}
                      style={{
                        padding: "5px 10px", borderRadius: 6, border: "none",
                        background: "rgba(255,255,255,0.2)", color: "#fff",
                        fontSize: 11, fontWeight: 700, cursor: "pointer",
                      }}
                    >×</button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {!editingGroup && (
                <button
                  onClick={() => setEditingGroup(true)}
                  title="Modifica gruppo"
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "rgba(255,255,255,0.2)",
                    border: "none", color: "#fff",
                    cursor: "pointer", fontSize: 14,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >✎</button>
              )}
              <button
                onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "rgba(255,255,255,0.2)",
                  border: "none", color: "#fff",
                  cursor: "pointer", fontSize: 18, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >×</button>
            </div>
          </div>
        </div>

        {/* ═══════ STATS KPI ════════════════════════════════════════ */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          borderBottom: `1px solid ${THEME.border}`,
          flexShrink: 0,
        }}>
          <div style={{ padding: "12px 8px", textAlign: "center", borderRight: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 10, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Partecipanti</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: THEME.teal }}>{count}/{max}</div>
          </div>
          <div style={{ padding: "12px 8px", textAlign: "center", borderRight: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 10, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>€/persona</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{pricePP.toFixed(2)}€</div>
          </div>
          <div style={{ padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Totale {paidCount === count && count > 0 ? "✓" : ""}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: THEME.teal }}>
              {totalPaid.toFixed(0)}€<span style={{ fontSize: 11, color: THEME.muted, fontWeight: 600 }}> / {total.toFixed(0)}€</span>
            </div>
          </div>
        </div>

        {/* ═══════ AGGIUNGI PAZIENTE ════════════════════════════════ */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${THEME.border}`, flexShrink: 0 }}>
          {!showAddSearch ? (
            <button
              onClick={() => setShowAddSearch(true)}
              disabled={isFull || busy}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                background: isFull ? THEME.panelSoft : THEME.teal,
                color: isFull ? THEME.muted : "#fff",
                border: "none", fontSize: 13, fontWeight: 700,
                cursor: isFull ? "not-allowed" : "pointer",
                letterSpacing: 0.3,
              }}
            >
              {isFull ? "🔒 Gruppo completo" : "+ Aggiungi paziente al gruppo"}
            </button>
          ) : (
            <div>
              {/* Quick patient toggle (mig. 015) */}
              {createQuickPatient && !quickOpen && (
                <button
                  type="button"
                  onClick={() => setQuickOpen(true)}
                  style={{
                    width: "100%", padding: "8px 12px", marginBottom: 8,
                    borderRadius: 7,
                    border: `1px dashed ${THEME.teal}`,
                    background: "rgba(13,148,136,0.04)",
                    color: THEME.teal,
                    fontWeight: 700, fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  + Nuovo paziente rapido
                </button>
              )}

              {createQuickPatient && quickOpen && (
                <QuickPatientForm
                  busy={quickBusy}
                  compact
                  onCancel={() => setQuickOpen(false)}
                  onSubmit={async (payload) => {
                    setQuickBusy(true);
                    try {
                      const created = await createQuickPatient(payload);
                      if (created) {
                        // Aggiunge subito al gruppo con il prezzo corrente
                        const price = parseFloat(newPatientPrice.replace(",", ".")) || 0;
                        await onAddParticipant(event.id, created.id, price);
                        setQuickOpen(false);
                        setShowAddSearch(false);
                        setSearchQ("");
                        setNewPatientPrice(pricePP.toFixed(2));
                      }
                    } finally {
                      setQuickBusy(false);
                    }
                  }}
                />
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  autoFocus
                  placeholder="🔍 Cerca paziente per cognome o telefono…"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 7,
                    border: `1.5px solid ${THEME.border}`, fontSize: 13,
                    fontWeight: 500, outline: "none",
                    background: "#fff",
                  }}
                />
                <div style={{ position: "relative", width: 90 }}>
                  <input
                    type="text"
                    value={newPatientPrice}
                    onChange={e => setNewPatientPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
                    style={{
                      width: "100%", padding: "8px 22px 8px 8px", borderRadius: 7,
                      border: `1.5px solid ${THEME.border}`, fontSize: 13,
                      fontWeight: 700, outline: "none", textAlign: "right",
                      background: "#fff", boxSizing: "border-box",
                    }}
                  />
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: THEME.muted }}>€</span>
                </div>
                <button
                  onClick={() => { setShowAddSearch(false); setSearchQ(""); }}
                  style={{
                    padding: "8px 10px", borderRadius: 7,
                    background: THEME.panelSoft, border: `1px solid ${THEME.border}`,
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >Annulla</button>
              </div>
              {searchResults.length > 0 && (
                <div style={{
                  maxHeight: 180, overflow: "auto",
                  border: `1px solid ${THEME.border}`, borderRadius: 7,
                  background: "#fff",
                }}>
                  {searchResults.map(p => {
                    const c = colorForPatient(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleAddPatient(p)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 10px", cursor: "pointer",
                          borderBottom: `1px solid ${THEME.border}`,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${THEME.teal}10`; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: c.bg, color: c.fg,
                          fontSize: 10, fontWeight: 800,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {initialsOf(p.first_name, p.last_name)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{p.last_name} {p.first_name}</div>
                          {p.phone && <div style={{ fontSize: 10, color: THEME.muted }}>{p.phone}</div>}
                        </div>
                        <span style={{ fontSize: 11, color: THEME.teal, fontWeight: 700 }}>+ Aggiungi</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {searchQ.trim() && searchResults.length === 0 && (
                <div style={{ padding: "12px", textAlign: "center", fontSize: 12, color: THEME.muted, fontStyle: "italic" }}>
                  Nessun paziente trovato
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══════ LISTA PARTECIPANTI ════════════════════════════════ */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 18px",
          background: "#fafafa",
        }}>
          {count === 0 ? (
            <div style={{
              textAlign: "center", padding: "32px 16px",
              fontSize: 13, color: THEME.muted, fontStyle: "italic",
            }}>
              Nessun partecipante. Aggiungine almeno uno per iniziare.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {participants.map(p => {
                const c = colorForPatient(p.patient_id);
                const isPaid = p.payment_status === "paid";
                const isPresent = p.attendance_status === "present";
                const isAbsent = p.attendance_status === "absent";
                const isEditingNotes = editingNotesFor === p.id;

                return (
                  <div
                    key={p.id}
                    style={{
                      background: "#fff",
                      borderRadius: 10,
                      border: `1.5px solid ${isPaid ? "#10b98133" : THEME.border}`,
                      borderLeft: `4px solid ${isPaid ? "#10b981" : "#f59e0b"}`,
                      padding: "10px 12px",
                      transition: "all 0.15s",
                    }}
                  >
                    {/* Riga principale */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {/* Avatar */}
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: c.bg, color: c.fg,
                        fontSize: 12, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: isPresent ? `2px solid #10b981` : isAbsent ? `2px solid #ef4444` : "none",
                        flexShrink: 0,
                      }}>
                        {initialsOf(p.patient_first_name, p.patient_last_name)}
                      </div>

                      {/* Nome + telefono */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.patient_last_name} {p.patient_first_name}
                        </div>
                        {p.patient_phone && (
                          <div style={{ fontSize: 10, color: THEME.muted }}>
                            {p.patient_phone}
                          </div>
                        )}
                      </div>

                      {/* Prezzo modificabile */}
                      <div style={{ position: "relative", width: 70, flexShrink: 0 }}>
                        <input
                          type="text"
                          defaultValue={Number(p.price).toFixed(2)}
                          onBlur={(e) => handleSavePrice(p, e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          style={{
                            width: "100%", padding: "5px 18px 5px 5px", borderRadius: 5,
                            border: `1px solid ${THEME.border}`, fontSize: 12,
                            fontWeight: 700, outline: "none", textAlign: "right",
                            boxSizing: "border-box", background: "#fff",
                          }}
                        />
                        <span style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: THEME.muted }}>€</span>
                      </div>

                      {/* Toggle pagato */}
                      <button
                        onClick={() => handleTogglePaid(p)}
                        disabled={busy}
                        title={isPaid ? "Pagato — clicca per annullare" : "Segna pagato"}
                        style={{
                          padding: "5px 9px", borderRadius: 99,
                          background: isPaid ? "#10b98115" : "#f59e0b15",
                          color: isPaid ? "#059669" : "#d97706",
                          border: `1px solid ${isPaid ? "#10b98140" : "#f59e0b40"}`,
                          fontSize: 10, fontWeight: 800, cursor: "pointer",
                          letterSpacing: 0.3, whiteSpace: "nowrap", flexShrink: 0,
                        }}
                      >
                        {isPaid ? "✓ PAGATO" : "DA PAGARE"}
                      </button>

                      {/* Toggle presenza */}
                      <button
                        onClick={() => handleToggleAttendance(p)}
                        disabled={busy}
                        title={
                          isPresent ? "Presente (clicca per assente)"
                          : isAbsent ? "Assente (clicca per resettare)"
                          : "Da segnare (clicca per presente)"
                        }
                        style={{
                          width: 28, height: 28, borderRadius: 99,
                          background: isPresent ? "#10b981" : isAbsent ? "#ef4444" : "#f3f4f6",
                          color: isPresent || isAbsent ? "#fff" : THEME.muted,
                          border: "none", cursor: "pointer",
                          fontSize: 13, fontWeight: 800, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {isPresent ? "✓" : isAbsent ? "✗" : "?"}
                      </button>

                      {/* Note */}
                      <button
                        onClick={() => {
                          if (isEditingNotes) {
                            setEditingNotesFor(null);
                          } else {
                            setNotesDraft(p.participant_notes || "");
                            setEditingNotesFor(p.id);
                          }
                        }}
                        title="Note partecipante"
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: p.participant_notes ? `${THEME.teal}15` : "transparent",
                          color: p.participant_notes ? THEME.teal : THEME.muted,
                          border: `1px solid ${p.participant_notes ? `${THEME.teal}40` : THEME.border}`,
                          cursor: "pointer", fontSize: 13, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        📝
                      </button>

                      {/* Rimuovi */}
                      <button
                        onClick={() => handleRemove(p)}
                        disabled={busy}
                        title="Rimuovi dal gruppo"
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: "transparent", color: "#ef4444",
                          border: `1px solid #fecaca`,
                          cursor: "pointer", fontSize: 14, fontWeight: 700, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >×</button>
                    </div>

                    {/* Editor note (espanso) */}
                    {isEditingNotes && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${THEME.border}` }}>
                        <textarea
                          value={notesDraft}
                          onChange={e => setNotesDraft(e.target.value)}
                          placeholder="Note specifiche per questo paziente in questo gruppo (es. 'fa solo esercizi seduti')…"
                          rows={2}
                          style={{
                            width: "100%", padding: "6px 8px", borderRadius: 6,
                            border: `1px solid ${THEME.border}`, fontSize: 12,
                            outline: "none", resize: "vertical", boxSizing: "border-box",
                            fontFamily: "inherit",
                          }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                          <button
                            onClick={() => setEditingNotesFor(null)}
                            style={{
                              padding: "4px 10px", borderRadius: 5,
                              background: THEME.panelSoft, border: `1px solid ${THEME.border}`,
                              fontSize: 11, fontWeight: 700, cursor: "pointer",
                            }}
                          >Annulla</button>
                          <button
                            onClick={() => handleSaveNotes(p.id)}
                            disabled={busy}
                            style={{
                              padding: "4px 10px", borderRadius: 5,
                              background: THEME.teal, color: "#fff", border: "none",
                              fontSize: 11, fontWeight: 700, cursor: "pointer",
                            }}
                          >Salva nota</button>
                        </div>
                      </div>
                    )}

                    {/* Note esistenti (read-only, se non in editing) */}
                    {!isEditingNotes && p.participant_notes && (
                      <div style={{
                        marginTop: 6, padding: "5px 8px",
                        background: `${THEME.teal}08`, borderRadius: 5,
                        fontSize: 11, color: THEME.text, lineHeight: 1.4,
                      }}>
                        📝 {p.participant_notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══════ FOOTER AZIONI ════════════════════════════════════ */}
        <div style={{
          borderTop: `1px solid ${THEME.border}`,
          padding: "12px 18px",
          display: "flex", gap: 8,
          background: "#fff",
          flexShrink: 0,
          flexWrap: "wrap",
        }}>
          <button
            onClick={handleDelete}
            disabled={busy}
            style={{
              padding: "9px 14px", borderRadius: 8,
              background: "transparent", color: "#dc2626",
              border: `1.5px solid #fecaca`,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            🗑 Elimina gruppo
          </button>

          <button
            onClick={() => setDuplicateOpen(true)}
            disabled={busy}
            style={{
              padding: "9px 14px", borderRadius: 8,
              background: "transparent", color: THEME.teal,
              border: `1.5px solid ${THEME.teal}55`,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            📋 Duplica
          </button>

          <div style={{ flex: 1 }} />

          <button
            onClick={handleSendAll}
            disabled={busy || count === 0}
            style={{
              padding: "9px 14px", borderRadius: 8,
              background: count === 0 ? THEME.panelSoft : "#25d366",
              color: count === 0 ? THEME.muted : "#fff",
              border: "none",
              fontSize: 12, fontWeight: 700,
              cursor: count === 0 ? "not-allowed" : "pointer",
            }}
          >
            📱 Promemoria a tutti ({count})
          </button>

          <button
            onClick={handleMarkAll}
            disabled={busy || count === 0 || paidCount === count}
            style={{
              padding: "9px 14px", borderRadius: 8,
              background: paidCount === count ? THEME.panelSoft : THEME.teal,
              color: paidCount === count ? THEME.muted : "#fff",
              border: "none",
              fontSize: 12, fontWeight: 700,
              cursor: paidCount === count ? "not-allowed" : "pointer",
            }}
          >
            ✓ Segna tutti pagati
          </button>
        </div>
      </div>

      {/* ─── Mini-modal di conferma duplicazione (step 6.2) ───────────── */}
      {duplicateOpen && (
        <div
          onClick={() => !busy && setDuplicateOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 10000,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 460, width: "100%",
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 24 }}>📋</span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: THEME.text }}>
                Duplica gruppo
              </h3>
            </div>
            <p style={{ fontSize: 13, color: THEME.muted, marginBottom: 18, lineHeight: 1.5 }}>
              Crea una copia di <b style={{ color: THEME.text }}>{event.group_title || "questo gruppo"}</b> alla data e ora che scegli.
              Pagamenti e presenze ricominceranno da zero.
            </p>

            {/* Data + Ora */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: THEME.muted, marginBottom: 4, letterSpacing: 0.3 }}>
                  NUOVA DATA
                </label>
                <input
                  type="date"
                  value={dupDate}
                  onChange={(e) => setDupDate(e.target.value)}
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8,
                    border: `1.5px solid ${THEME.border}`,
                    fontSize: 14, color: THEME.text,
                    fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: THEME.muted, marginBottom: 4, letterSpacing: 0.3 }}>
                  NUOVA ORA
                </label>
                <input
                  type="time" step={900}
                  value={dupTime}
                  onChange={(e) => setDupTime(e.target.value)}
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8,
                    border: `1.5px solid ${THEME.border}`,
                    fontSize: 14, color: THEME.text,
                    fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Toggle partecipanti */}
            <label style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px",
              background: dupWithParts ? `${THEME.teal}10` : THEME.panelSoft,
              border: `1.5px solid ${dupWithParts ? THEME.teal : THEME.border}`,
              borderRadius: 8,
              cursor: count > 0 ? "pointer" : "not-allowed",
              marginBottom: 18,
              opacity: count > 0 ? 1 : 0.6,
            }}>
              <input
                type="checkbox"
                checked={dupWithParts && count > 0}
                onChange={(e) => setDupWithParts(e.target.checked)}
                disabled={count === 0}
                style={{ width: 18, height: 18, accentColor: THEME.teal, cursor: count > 0 ? "pointer" : "not-allowed" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>
                  Duplica anche i partecipanti
                </div>
                <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>
                  {count > 0
                    ? `${count} ${count === 1 ? "paziente" : "pazienti"} verranno copiati nel nuovo gruppo`
                    : "Nessun partecipante da copiare"}
                </div>
              </div>
            </label>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDuplicateOpen(false)}
                disabled={busy}
                style={{
                  padding: "10px 18px", borderRadius: 8,
                  background: "transparent",
                  border: `1.5px solid ${THEME.border}`,
                  color: THEME.text,
                  fontSize: 13, fontWeight: 700,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                Annulla
              </button>
              <button
                onClick={handleDuplicate}
                disabled={busy || !dupDate || !dupTime}
                style={{
                  padding: "10px 18px", borderRadius: 8,
                  background: THEME.teal,
                  border: "none",
                  color: "#fff",
                  fontSize: 13, fontWeight: 700,
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? "Duplico…" : "📋 Duplica gruppo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
