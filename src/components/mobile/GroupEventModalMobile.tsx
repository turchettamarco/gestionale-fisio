// ═══════════════════════════════════════════════════════════════════════
// app/mobile/(protected)/components/GroupEventModalMobile.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Bottom-sheet di gestione APPUNTAMENTO DI GRUPPO per mobile (mig. 014).
//
// Differenze rispetto al GroupEventModal desktop:
//   • Layout bottom-sheet a tutta altezza (90vh) invece di dialog centrato
//   • Pulsanti grandi touch-friendly (44px+ tap target)
//   • Stats compatti su 1 riga (3 colonne)
//   • Lista partecipanti con bordo sinistro colorato (verde/giallo)
//   • Pulsante "Paga" inline visibile solo per chi non ha pagato
//   • Action buttons in footer fissato in basso
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useMemo } from "react";
import { showToast } from "@/src/components/mobile/ToastProvider";
import { usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";

// Tipo locale del partecipante (riallineato a `appointment_participants` del DB)
export type Participant = {
  id: string;
  appointment_id: string;
  patient_id: string;
  price: number;
  payment_status: "paid" | "unpaid";
  payment_method: "cash" | "pos" | "bank_transfer" | null;
  paid_at: string | null;
  attendance_status: "pending" | "present" | "absent";
  checked_in_at: string | null;
  participant_notes: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_phone: string | null;
};

// Evento gruppo nella forma minima usata dal modal mobile.
// I file di consumo (home + calendar mobile) hanno tipi diversi: passano qui
// solo i campi che servono.
export type GroupEvent = {
  id: string;
  start: Date;
  end: Date;
  group_title: string | null;
  group_max_participants: number | null;
  group_price_per_person: number | null;
  participants: Participant[];

  // ─── Step 6.2: campi per la duplicazione ────────────────────────
  /** ISO string del start_at originale (per calcolare durata) */
  start_at: string;
  /** ISO string del end_at originale */
  end_at: string;
  /** Sede dell'appuntamento (per replicarla nel gruppo duplicato) */
  location?: string | null;
  clinic_site?: string | null;
  domicile_address?: string | null;
  /** Studio multi-tenancy */
  studio_id: string;
};

export type PatientSearchResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

export type GroupEventModalMobileProps = {
  event: GroupEvent;
  searchPatients: (query: string) => Promise<PatientSearchResult[]>;
  /** Quick patient (mig. 015) — restituisce il paziente creato o null */
  createQuickPatient?: (payload: { first_name: string; last_name: string; phone: string | null }) => Promise<PatientSearchResult | null>;
  onClose: () => void;
  onAddParticipant: (appointmentId: string, patientId: string, price: number) => Promise<void>;
  onUpdateParticipant: (
    participantId: string,
    patch: Partial<Pick<Participant,
      "payment_status" | "payment_method" | "attendance_status" | "price" | "participant_notes"
    >>,
  ) => Promise<void>;
  onRemoveParticipant: (participantId: string) => Promise<void>;
  onMarkAllPaid: (appointmentId: string) => Promise<void>;
  onSendReminderToAll: (event: GroupEvent) => Promise<void>;
  onDeleteGroup: (appointmentId: string) => Promise<void>;
  onUpdateGroup: (
    appointmentId: string,
    patch: { group_title?: string; group_max_participants?: number; group_price_per_person?: number },
  ) => Promise<void>;
  /**
   * Step 6.2: duplica il gruppo alla nuova data.
   * Se withParticipants=true, replica anche i partecipanti (azzerati per pagamenti/presenze).
   */
  onDuplicateGroup: (
    sourceAppointmentId: string,
    newStart: Date,
    withParticipants: boolean,
  ) => Promise<void>;
};

// ─── Avatar helpers (stessi del desktop, per coerenza) ────────────────
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

function initials(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName ?? "").trim()[0] ?? "";
  const l = (lastName ?? "").trim()[0] ?? "";
  return (l + f).toUpperCase() || "?";
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDate(d: Date): string {
  const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export default function GroupEventModalMobile({
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
}: GroupEventModalMobileProps) {
  const { active: privacyActive, maskName, maskInitial } = usePrivacyDisplay();
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
  const [searchQ, setSearchQ] = useState("");
  const [newPatientPrice, setNewPatientPrice] = useState<string>(pricePP.toFixed(2));
  // Quick patient (mig. 015)
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickFn, setQuickFn] = useState("");
  const [quickLn, setQuickLn] = useState("");
  const [quickPh, setQuickPh] = useState("");
  const [busy, setBusy] = useState(false);

  // Gestione modifica gruppo (titolo, max, prezzo)
  const [editingGroup, setEditingGroup] = useState(false);
  const [editTitle, setEditTitle] = useState(event.group_title || "");
  const [editMax, setEditMax] = useState(String(max));
  const [editPrice, setEditPrice] = useState(pricePP.toFixed(2));

  // ─── Step 6.2: duplicazione ─────────────────────────────────────────
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const defaultDupDate = useMemo(() => {
    const d = new Date(event.start);
    d.setDate(d.getDate() + 7);
    return d;
  }, [event.start]);
  const toLocalDateStrM = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  const toLocalTimeStrM = (d: Date): string =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const [dupDate, setDupDate] = useState<string>(toLocalDateStrM(defaultDupDate));
  const [dupTime, setDupTime] = useState<string>(toLocalTimeStrM(defaultDupDate));
  const [dupWithParts, setDupWithParts] = useState<boolean>(true);

  // Pannello dettaglio partecipante (espanso al tap sull'avatar)
  const [expandedParticipantId, setExpandedParticipantId] = useState<string | null>(null);

  // ─── Search debounced ───────────────────────────────────────────────
  const alreadyInGroup = useMemo(
    () => new Set(participants.map(p => p.patient_id)),
    [participants],
  );
  const [searchResults, setSearchResults] = useState<PatientSearchResult[]>([]);

  useEffect(() => {
    const q = searchQ.trim();
    if (!q) { setSearchResults([]); return; }
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
  }, [searchQ, alreadyInGroup, searchPatients]);

  // ─── Handlers ───────────────────────────────────────────────────────
  const handleAddPatient = async (patient: PatientSearchResult) => {
    const price = parseFloat(newPatientPrice.replace(",", ".")) || 0;
    setBusy(true);
    try {
      await onAddParticipant(event.id, patient.id, price);
      setSearchQ("");
      setShowAddSearch(false);
      setNewPatientPrice(pricePP.toFixed(2));
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePaid = async (p: Participant) => {
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

  const handleToggleAttendance = async (p: Participant) => {
    const next: Participant["attendance_status"] =
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

  const handleRemove = async (p: Participant) => {
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

  const handleSavePrice = async (p: Participant, newPriceStr: string) => {
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

  const handleSaveNotes = async (p: Participant, notes: string) => {
    setBusy(true);
    try {
      await onUpdateParticipant(p.id, { participant_notes: notes || null });
    } finally {
      setBusy(false);
    }
  };

  const handleMarkAll = async () => {
    setBusy(true);
    try { await onMarkAllPaid(event.id); }
    finally { setBusy(false); }
  };

  const handleSendAll = async () => {
    setBusy(true);
    try { await onSendReminderToAll(event); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    const ok = window.confirm(
      `Eliminare definitivamente "${event.group_title || "Gruppo"}"?\n` +
      `I ${count} partecipanti verranno rimossi dal gruppo (i pazienti restano nel database).`,
    );
    if (!ok) return;
    setBusy(true);
    try { await onDeleteGroup(event.id); }
    finally { setBusy(false); }
  };

  const handleDuplicate = async () => {
    if (!dupDate || !dupTime) {
      showToast.warning("Inserisci data e ora valide.");
      return;
    }
    const newStart = new Date(`${dupDate}T${dupTime}:00`);
    if (isNaN(newStart.getTime())) {
      showToast.warning("Data o ora non valide.");
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
    if (!editTitle.trim()) { showToast.warning("Il titolo non può essere vuoto."); return; }
    if (isNaN(newMax) || newMax < count) { showToast.warning(`Max deve essere ≥ ${count}.`); return; }
    if (isNaN(newPrice) || newPrice < 0) { showToast.warning("Prezzo non valido."); return; }
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
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 9999,
        display: "flex", alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e: React.MouseEvent<HTMLElement>) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "92vh",
          background: "#fff",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: "0 -8px 32px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "slideUp 0.2s ease",
        }}
      >
        {/* Drag indicator */}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
          <div style={{ width: 36, height: 4, background: "#cbd5e1", borderRadius: 2 }} />
        </div>

        {/* ═══════ HEADER GRADIENT ═══════════════════════════════════ */}
        <div style={{
          background: "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)",
          padding: "12px 16px 14px",
          color: "#fff",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: "inline-block",
                background: "rgba(255,255,255,0.25)",
                padding: "2px 8px", borderRadius: 99,
                fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                marginBottom: 4,
              }}>
                👥 GRUPPO · {count}/{max}
              </div>
              {!editingGroup ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>
                    {event.group_title || "Gruppo"}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
                    {formatDate(event.start)} · {fmtTime(event.start)}–{fmtTime(event.end)}
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
                    style={{
                      padding: "8px 10px", borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.4)",
                      background: "rgba(255,255,255,0.15)",
                      color: "#fff", fontSize: 14, fontWeight: 700,
                      outline: "none", boxSizing: "border-box", width: "100%",
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="number"
                      value={editMax}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditMax(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="Max"
                      style={{
                        padding: "6px 8px", borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.4)",
                        background: "rgba(255,255,255,0.15)",
                        color: "#fff", fontSize: 12, fontWeight: 700,
                        outline: "none", width: 60, boxSizing: "border-box",
                      }}
                    />
                    <input
                      type="text"
                      value={editPrice}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
                      placeholder="€"
                      style={{
                        padding: "6px 8px", borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.4)",
                        background: "rgba(255,255,255,0.15)",
                        color: "#fff", fontSize: 12, fontWeight: 700,
                        outline: "none", width: 70, boxSizing: "border-box",
                      }}
                    />
                    <button
                      onClick={handleSaveGroupEdit}
                      disabled={busy}
                      style={{
                        padding: "6px 12px", borderRadius: 6, border: "none",
                        background: "#fff", color: "#0d9488",
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
                        padding: "6px 10px", borderRadius: 6, border: "none",
                        background: "rgba(255,255,255,0.2)", color: "#fff",
                        fontSize: 11, fontWeight: 700, cursor: "pointer",
                      }}
                    >×</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {!editingGroup && (
                <button
                  onClick={() => setEditingGroup(true)}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "rgba(255,255,255,0.2)",
                    border: "none", color: "#fff",
                    cursor: "pointer", fontSize: 13,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  aria-label="Modifica gruppo"
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
                aria-label="Chiudi"
              >×</button>
            </div>
          </div>
        </div>

        {/* ═══════ STATS KPI ════════════════════════════════════════ */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          borderBottom: "1px solid #e2e8f0",
          flexShrink: 0,
        }}>
          <div style={{ padding: "10px 6px", textAlign: "center", borderRight: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>Pagati</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: paidCount === count && count > 0 ? "#16a34a" : "#0f172a" }}>
              {paidCount}/{count}
            </div>
          </div>
          <div style={{ padding: "10px 6px", textAlign: "center", borderRight: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>€/persona</div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{pricePP.toFixed(0)}€</div>
          </div>
          <div style={{ padding: "10px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>Totale</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0d9488" }}>
              {totalPaid.toFixed(0)}€<span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>/{total.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* ═══════ AGGIUNGI PAZIENTE ════════════════════════════════ */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0", flexShrink: 0 }}>
          {!showAddSearch ? (
            <button
              onClick={() => setShowAddSearch(true)}
              disabled={isFull || busy}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8,
                background: isFull ? "#f1f5f9" : "#0d9488",
                color: isFull ? "#94a3b8" : "#fff",
                border: "none", fontSize: 13, fontWeight: 700,
                cursor: isFull ? "not-allowed" : "pointer",
                minHeight: 44,
              }}
            >
              {isFull ? "🔒 Gruppo completo" : "+ Aggiungi paziente"}
            </button>
          ) : (
            <div>
              {/* Quick patient (mig. 015) */}
              {createQuickPatient && !quickOpen && (
                <button
                  type="button"
                  onClick={() => setQuickOpen(true)}
                  style={{
                    width: "100%", padding: "9px 12px", marginBottom: 8,
                    borderRadius: 8,
                    border: `1px dashed #0d9488`,
                    background: "rgba(13,148,136,0.05)",
                    color: "#0d9488",
                    fontWeight: 700, fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  + Nuovo paziente rapido
                </button>
              )}

              {createQuickPatient && quickOpen && (
                <div style={{
                  border: `1px solid #2563eb`,
                  background: "rgba(37,99,235,0.04)",
                  padding: 10, borderRadius: 8, marginBottom: 8,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", marginBottom: 8 }}>
                    Nuovo paziente rapido
                  </div>
                  <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                    <input
                      autoFocus
                      value={quickFn}
                      onChange={e => setQuickFn(e.target.value)}
                      placeholder="Nome *"
                      style={{
                        padding: "9px 10px", borderRadius: 7,
                        border: "1px solid #cbd5e1",
                        fontSize: 13, fontWeight: 600, outline: "none",
                        background: "#fff", fontFamily: "inherit",
                      }}
                    />
                    <input
                      value={quickLn}
                      onChange={e => setQuickLn(e.target.value)}
                      placeholder="Cognome *"
                      style={{
                        padding: "9px 10px", borderRadius: 7,
                        border: "1px solid #cbd5e1",
                        fontSize: 13, fontWeight: 600, outline: "none",
                        background: "#fff", fontFamily: "inherit",
                      }}
                    />
                    <input
                      value={quickPh}
                      onChange={e => setQuickPh(e.target.value)}
                      placeholder="Telefono (opzionale)"
                      style={{
                        padding: "9px 10px", borderRadius: 7,
                        border: "1px solid #cbd5e1",
                        fontSize: 13, fontWeight: 600, outline: "none",
                        background: "#fff", fontFamily: "inherit",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => {
                        setQuickOpen(false);
                        setQuickFn(""); setQuickLn(""); setQuickPh("");
                      }}
                      disabled={quickBusy}
                      style={{
                        flex: 1, padding: "9px", borderRadius: 7,
                        border: "1px solid #cbd5e1",
                        background: "#fff", color: "#64748b",
                        fontWeight: 700, fontSize: 12, cursor: "pointer",
                      }}
                    >Annulla</button>
                    <button
                      onClick={async () => {
                        const fn = quickFn.trim(), ln = quickLn.trim();
                        if (!fn || !ln) return;
                        setQuickBusy(true);
                        try {
                          const created = await createQuickPatient({
                            first_name: fn, last_name: ln,
                            phone: quickPh.trim() || null,
                          });
                          if (created) {
                            // Aggiunge subito al gruppo col prezzo corrente
                            const price = parseFloat(newPatientPrice.replace(",", ".")) || 0;
                            await onAddParticipant(event.id, created.id, price);
                            setQuickOpen(false);
                            setQuickFn(""); setQuickLn(""); setQuickPh("");
                            setShowAddSearch(false);
                            setSearchQ("");
                            setNewPatientPrice(pricePP.toFixed(2));
                          }
                        } finally {
                          setQuickBusy(false);
                        }
                      }}
                      disabled={quickBusy || !quickFn.trim() || !quickLn.trim()}
                      style={{
                        flex: 1, padding: "9px", borderRadius: 7,
                        border: "none",
                        background: "#16a34a", color: "#fff",
                        fontWeight: 700, fontSize: 12, cursor: "pointer",
                        opacity: quickBusy || !quickFn.trim() || !quickLn.trim() ? 0.6 : 1,
                      }}
                    >{quickBusy ? "Creo…" : "Crea e aggiungi"}</button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  type="text"
                  autoFocus
                  placeholder="🔍 Cerca paziente…"
                  value={searchQ}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQ(e.target.value)}
                  style={{
                    flex: 1, padding: "9px 12px", borderRadius: 7,
                    border: "1.5px solid #cbd5e1", fontSize: 13,
                    fontWeight: 500, outline: "none",
                    background: "#fff", boxSizing: "border-box",
                  }}
                />
                <div style={{ position: "relative", width: 80 }}>
                  <input
                    type="text"
                    value={newPatientPrice}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPatientPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
                    style={{
                      width: "100%", padding: "9px 22px 9px 8px", borderRadius: 7,
                      border: "1.5px solid #cbd5e1", fontSize: 13,
                      fontWeight: 700, outline: "none", textAlign: "right",
                      background: "#fff", boxSizing: "border-box",
                    }}
                  />
                  <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#94a3b8" }}>€</span>
                </div>
                <button
                  onClick={() => { setShowAddSearch(false); setSearchQ(""); }}
                  style={{
                    padding: "9px 12px", borderRadius: 7,
                    background: "#f1f5f9", border: "1px solid #cbd5e1",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >×</button>
              </div>
              {searchResults.length > 0 && (
                <div style={{
                  maxHeight: 200, overflow: "auto",
                  border: "1px solid #cbd5e1", borderRadius: 7,
                  background: "#fff",
                }}>
                  {searchResults.map((p: PatientSearchResult) => {
                    const c = colorForPatient(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleAddPatient(p)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px", cursor: "pointer",
                          borderBottom: "1px solid #e2e8f0",
                          minHeight: 48,
                        }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%",
                          background: c.bg, color: c.fg,
                          fontSize: 11, fontWeight: 800,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          {initials(p.first_name, p.last_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{p.last_name} {p.first_name}</div>
                          {p.phone && <div style={{ fontSize: 10, color: "#64748b" }}>{p.phone}</div>}
                        </div>
                        <span style={{ fontSize: 11, color: "#0d9488", fontWeight: 700, flexShrink: 0 }}>+ Aggiungi</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {searchQ.trim() && searchResults.length === 0 && (
                <div style={{ padding: "10px", textAlign: "center", fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
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
          padding: "8px 12px",
          background: "#f8fafc",
        }}>
          {count === 0 ? (
            <div style={{
              textAlign: "center", padding: "32px 16px",
              fontSize: 13, color: "#94a3b8", fontStyle: "italic",
            }}>
              Nessun partecipante. Tocca &quot;Aggiungi paziente&quot; per iniziare.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {participants.map(p => {
                const c = colorForPatient(p.patient_id);
                const isPaid = p.payment_status === "paid";
                const isPresent = p.attendance_status === "present";
                const isAbsent = p.attendance_status === "absent";
                const isExpanded = expandedParticipantId === p.id;

                return (
                  <div
                    key={p.id}
                    style={{
                      background: "#fff",
                      borderRadius: 8,
                      borderLeft: `4px solid ${isPaid ? "#16a34a" : "#f59e0b"}`,
                      border: "1px solid #e2e8f0",
                      borderLeftWidth: 4,
                    }}
                  >
                    {/* Riga principale */}
                    <div
                      onClick={() => setExpandedParticipantId(isExpanded ? null : p.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 9,
                        padding: "9px 10px",
                        cursor: "pointer",
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: c.bg, color: c.fg,
                        fontSize: 11, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: isPresent ? "2px solid #16a34a"
                              : isAbsent ? "2px solid #dc2626" : "none",
                        flexShrink: 0,
                      }}>
                        {privacyActive ? maskInitial({ first_name: p.patient_first_name, last_name: p.patient_last_name }) : initials(p.patient_first_name, p.patient_last_name)}
                      </div>

                      {/* Nome + prezzo */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 700, color: "#0f172a",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {privacyActive ? maskName({ first_name: p.patient_first_name, last_name: p.patient_last_name }) : `${p.patient_last_name} ${p.patient_first_name}`}
                        </div>
                        <div style={{
                          fontSize: 11, color: isPaid ? "#16a34a" : "#92400e",
                          fontWeight: 600,
                        }}>
                          {Number(p.price).toFixed(0)}€ · {isPaid ? "Pagato" : "Da pagare"}
                          {p.participant_notes && " · 📝"}
                        </div>
                      </div>

                      {/* Pulsante "Paga" inline (solo se non pagato) */}
                      {!isPaid && (
                        <button
                          onClick={(e: React.MouseEvent<HTMLElement>) => { e.stopPropagation(); handleTogglePaid(p); }}
                          disabled={busy}
                          style={{
                            background: "#0d9488", color: "#fff", border: "none",
                            padding: "5px 11px", borderRadius: 5, fontSize: 11, fontWeight: 800,
                            cursor: "pointer", flexShrink: 0, minHeight: 32,
                          }}
                        >
                          PAGA
                        </button>
                      )}

                      {/* Icona check se pagato */}
                      {isPaid && (
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: "#16a34a", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, fontWeight: 800, flexShrink: 0,
                        }}>✓</div>
                      )}

                      {/* Chevron */}
                      <span style={{
                        color: "#94a3b8", fontSize: 11, flexShrink: 0,
                        transform: isExpanded ? "rotate(180deg)" : "none",
                        transition: "transform 0.15s",
                      }}>▾</span>
                    </div>

                    {/* Pannello espanso */}
                    {isExpanded && (
                      <div style={{
                        padding: "8px 10px 10px",
                        borderTop: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}>
                        {/* Riga: presenza + prezzo modificabile + telefono */}
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                          {/* Presenza */}
                          <button
                            onClick={() => handleToggleAttendance(p)}
                            disabled={busy}
                            style={{
                              padding: "6px 12px", borderRadius: 6, border: "none",
                              background: isPresent ? "#16a34a" : isAbsent ? "#dc2626" : "#e2e8f0",
                              color: isPresent || isAbsent ? "#fff" : "#64748b",
                              fontSize: 11, fontWeight: 700, cursor: "pointer",
                              minHeight: 34,
                            }}
                          >
                            {isPresent ? "✓ Presente" : isAbsent ? "✗ Assente" : "? Da segnare"}
                          </button>

                          {/* Toggle pagato (anche da qui, per coerenza) */}
                          {isPaid && (
                            <button
                              onClick={() => handleTogglePaid(p)}
                              disabled={busy}
                              style={{
                                padding: "6px 12px", borderRadius: 6,
                                background: "#fef2f2", color: "#dc2626",
                                border: "1px solid #fecaca",
                                fontSize: 11, fontWeight: 700, cursor: "pointer",
                                minHeight: 34,
                              }}
                            >
                              ↺ Annulla pagamento
                            </button>
                          )}

                          {/* Telefono */}
                          {p.patient_phone && (
                            <a
                              href={`tel:${p.patient_phone}`}
                              onClick={(e: React.MouseEvent<HTMLElement>) => e.stopPropagation()}
                              style={{
                                padding: "6px 12px", borderRadius: 6,
                                background: "#dbeafe", color: "#1e3a8a",
                                fontSize: 11, fontWeight: 700,
                                textDecoration: "none", border: "1px solid #bfdbfe",
                                minHeight: 34, display: "inline-flex", alignItems: "center",
                              }}
                            >
                              📞 {p.patient_phone}
                            </a>
                          )}
                        </div>

                        {/* Prezzo modificabile */}
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Prezzo</div>
                          <div style={{ position: "relative", width: 110 }}>
                            <input
                              type="text"
                              defaultValue={Number(p.price).toFixed(2)}
                              onBlur={(e: React.FocusEvent<HTMLInputElement>) => handleSavePrice(p, e.target.value)}
                              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              style={{
                                width: "100%", padding: "7px 22px 7px 8px", borderRadius: 6,
                                border: "1px solid #cbd5e1", fontSize: 13,
                                fontWeight: 700, outline: "none", textAlign: "right",
                                boxSizing: "border-box", background: "#fff",
                              }}
                            />
                            <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#94a3b8" }}>€</span>
                          </div>
                        </div>

                        {/* Note */}
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Note</div>
                          <textarea
                            defaultValue={p.participant_notes || ""}
                            onBlur={(e: React.FocusEvent<HTMLTextAreaElement>) => {
                              if (e.target.value !== (p.participant_notes || "")) {
                                handleSaveNotes(p, e.target.value);
                              }
                            }}
                            placeholder="Es. fa solo esercizi seduti…"
                            rows={2}
                            style={{
                              width: "100%", padding: "6px 8px", borderRadius: 6,
                              border: "1px solid #cbd5e1", fontSize: 12,
                              outline: "none", resize: "vertical", boxSizing: "border-box",
                              fontFamily: "inherit",
                            }}
                          />
                        </div>

                        {/* Rimuovi */}
                        <button
                          onClick={() => handleRemove(p)}
                          disabled={busy}
                          style={{
                            width: "100%", padding: "8px", borderRadius: 6,
                            background: "transparent", color: "#dc2626",
                            border: "1px solid #fecaca",
                            fontSize: 12, fontWeight: 700, cursor: "pointer",
                            minHeight: 38,
                          }}
                        >
                          🗑 Rimuovi dal gruppo
                        </button>
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
          borderTop: "1px solid #e2e8f0",
          padding: "10px 12px",
          display: "flex", gap: 6,
          background: "#fff",
          flexShrink: 0,
          paddingBottom: "max(10px, env(safe-area-inset-bottom))",
        }}>
          <button
            onClick={handleDelete}
            disabled={busy}
            style={{
              padding: "10px 12px", borderRadius: 8,
              background: "transparent", color: "#dc2626",
              border: "1.5px solid #fecaca",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              minHeight: 44, flexShrink: 0,
            }}
          >🗑</button>

          <button
            onClick={() => setDuplicateOpen(true)}
            disabled={busy}
            style={{
              padding: "10px 12px", borderRadius: 8,
              background: "transparent", color: "#0d9488",
              border: "1.5px solid rgba(13,148,136,0.4)",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              minHeight: 44, flexShrink: 0,
            }}
            aria-label="Duplica gruppo"
          >📋</button>

          <button
            onClick={handleSendAll}
            disabled={busy || count === 0}
            style={{
              flex: 1, padding: "10px 8px", borderRadius: 8,
              background: count === 0 ? "#f1f5f9" : "#25d366",
              color: count === 0 ? "#94a3b8" : "#fff",
              border: "none",
              fontSize: 11, fontWeight: 700,
              cursor: count === 0 ? "not-allowed" : "pointer",
              minHeight: 44,
            }}
          >📱 WhatsApp ({count})</button>

          <button
            onClick={handleMarkAll}
            disabled={busy || count === 0 || paidCount === count}
            style={{
              flex: 1, padding: "10px 8px", borderRadius: 8,
              background: paidCount === count ? "#f1f5f9" : "#0d9488",
              color: paidCount === count ? "#94a3b8" : "#fff",
              border: "none",
              fontSize: 11, fontWeight: 700,
              cursor: paidCount === count ? "not-allowed" : "pointer",
              minHeight: 44,
            }}
          >✓ Tutti pagati</button>
        </div>
      </div>

      {/* ─── Mini-modal conferma duplicazione (step 6.2) ─────────── */}
      {duplicateOpen && (
        <div
          onClick={() => !busy && setDuplicateOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: "16px 16px 0 0",
              width: "100%",
              maxWidth: 500,
              padding: 20,
              paddingBottom: "max(20px, env(safe-area-inset-bottom))",
              boxShadow: "0 -10px 30px rgba(0,0,0,0.3)",
              animation: "slideUp 0.2s ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>📋</span>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
                Duplica gruppo
              </h3>
            </div>
            <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16, lineHeight: 1.4 }}>
              Crea una copia di <b style={{ color: "#0f172a" }}>{event.group_title || "questo gruppo"}</b>.
              Pagamenti e presenze ricominceranno da zero.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 4, letterSpacing: 0.3 }}>
                  NUOVA DATA
                </label>
                <input
                  type="date"
                  value={dupDate}
                  onChange={(e) => setDupDate(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1.5px solid #cbd5e1",
                    fontSize: 14, color: "#0f172a",
                    fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                    minHeight: 44,
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#64748b", marginBottom: 4, letterSpacing: 0.3 }}>
                  NUOVA ORA
                </label>
                <input
                  type="time"
                  value={dupTime}
                  onChange={(e) => setDupTime(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1.5px solid #cbd5e1",
                    fontSize: 14, color: "#0f172a",
                    fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                    minHeight: 44,
                  }}
                />
              </div>
            </div>

            <label style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px",
              background: dupWithParts && count > 0 ? "rgba(13,148,136,0.1)" : "#f1f5f9",
              border: `1.5px solid ${dupWithParts && count > 0 ? "#0d9488" : "#cbd5e1"}`,
              borderRadius: 8,
              cursor: count > 0 ? "pointer" : "not-allowed",
              marginBottom: 16,
              opacity: count > 0 ? 1 : 0.6,
              minHeight: 44,
            }}>
              <input
                type="checkbox"
                checked={dupWithParts && count > 0}
                onChange={(e) => setDupWithParts(e.target.checked)}
                disabled={count === 0}
                style={{ width: 20, height: 20, accentColor: "#0d9488", flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                  Duplica anche i partecipanti
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                  {count > 0 ? `${count} ${count === 1 ? "paziente" : "pazienti"} verranno copiati` : "Nessun partecipante"}
                </div>
              </div>
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDuplicateOpen(false)}
                disabled={busy}
                style={{
                  flex: 1, padding: "12px", borderRadius: 8,
                  background: "transparent",
                  border: "1.5px solid #cbd5e1",
                  color: "#0f172a",
                  fontSize: 14, fontWeight: 700,
                  cursor: busy ? "wait" : "pointer",
                  minHeight: 48,
                }}
              >
                Annulla
              </button>
              <button
                onClick={handleDuplicate}
                disabled={busy || !dupDate || !dupTime}
                style={{
                  flex: 1.4, padding: "12px", borderRadius: 8,
                  background: "#0d9488",
                  border: "none",
                  color: "#fff",
                  fontSize: 14, fontWeight: 700,
                  cursor: busy ? "wait" : "pointer",
                  opacity: busy ? 0.7 : 1,
                  minHeight: 48,
                }}
              >
                {busy ? "Duplico…" : "📋 Duplica"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS animation */}
      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
