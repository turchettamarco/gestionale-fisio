"use client";

// ════════════════════════════════════════════════════════════════════════
// app/(protected)/ospiti/[id]/components/GuestAppointmentModal.tsx
// ════════════════════════════════════════════════════════════════════════
//
// Modale dedicata per CREARE o MODIFICARE un appuntamento di un
// professionista ospite (Fase B della rivoluzione UX ospiti).
//
// Differenze dalla modale grande del calendario titolare:
//   • NO selettore operatore (operator_id sempre NULL per appt ospite)
//   • NO selettore "Per chi è" (siamo nel contesto di UN ospite specifico)
//   • NO prezzo / metodo pagamento / pacchetti (l'ospite incassa direttamente)
//   • NO gruppi
//   • Campi: paziente, data, ora inizio, durata, stanza opzionale, note
//
// Pattern: la modale è controllata. Riceve mode (create/edit) + opzionali
// initial values + handler onSaved che il parent usa per refresh.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { X, Search, Trash2, Calendar, Clock, MapPin, FileText, User } from "lucide-react";

// ── Palette (allineata pagina ospite) ────────────────────────────────────
const T = {
  panelBg:    "#ffffff",
  panelSoft:  "#f8fafc",
  text:       "#0f172a",
  muted:      "#475569",
  mutedSoft:  "#64748b",
  mutedXSoft: "#94a3b8",
  border:     "#cbd5e1",
  borderSoft: "#e2e8f0",
  blue:       "#2563eb",
  teal:       "#0d9488",
  red:        "#dc2626",
  white:      "#ffffff",
};

const GRADIENT = "linear-gradient(135deg, #0d9488, #2563eb)";

// ── Tipi ──────────────────────────────────────────────────────────────────
export type GuestApptInitial = {
  /** ID dell'appuntamento (solo in mode='edit') */
  id?: string;
  patient_id: string;
  patient_name?: string;
  start_at: string;  // ISO
  end_at: string;    // ISO
  room_id: string | null;
  calendar_note: string | null;
};

type PatientResult = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  diagnosis: string | null;
};

type StudioRoom = {
  id: string;
  name: string;
  color: string | null;
};

type Props = {
  mode: "create" | "edit";
  studioId: string;
  guestId: string;
  guestColor: string;
  guestDefaultRoomId: string | null;
  /** Dati iniziali (solo in edit, oppure per pre-popolare la data in create) */
  initial?: GuestApptInitial;
  /** Data preselezionata in create (oggi se omesso) */
  defaultDate?: Date;
  onClose: () => void;
  onSaved: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function combineDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

// ════════════════════════════════════════════════════════════════════════

export default function GuestAppointmentModal({
  mode,
  studioId,
  guestId,
  guestColor,
  guestDefaultRoomId,
  initial,
  defaultDate,
  onClose,
  onSaved,
}: Props) {
  // ── Stato form ──────────────────────────────────────────────────────────
  const initStart = initial ? new Date(initial.start_at) : (defaultDate ?? new Date());
  const initEnd = initial ? new Date(initial.end_at) : new Date(initStart.getTime() + 30 * 60000);

  const [patientId, setPatientId] = useState<string | null>(initial?.patient_id ?? null);
  const [patientName, setPatientName] = useState<string>(initial?.patient_name ?? "");
  const [date, setDate] = useState<string>(fmtDateInput(initStart));
  const [startTime, setStartTime] = useState<string>(fmtTimeInput(initStart));
  const [duration, setDuration] = useState<number>(
    initial
      ? Math.round((new Date(initial.end_at).getTime() - new Date(initial.start_at).getTime()) / 60000)
      : 30
  );
  const [roomId, setRoomId] = useState<string | null>(
    initial?.room_id ?? guestDefaultRoomId ?? null
  );
  const [note, setNote] = useState<string>(initial?.calendar_note ?? "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Stanze (carico una sola volta) ──────────────────────────────────────
  const [rooms, setRooms] = useState<StudioRoom[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("studio_rooms")
        .select("id, name, color")
        .eq("studio_id", studioId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      setRooms((data || []) as StudioRoom[]);
    })();
    return () => { cancelled = true; };
  }, [studioId]);

  // ── Ricerca paziente ────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      const q = searchQuery.trim();
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, diagnosis")
        .eq("studio_id", studioId)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .limit(20);
      if (cancelled) return;
      setSearchResults((data || []) as PatientResult[]);
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [searchQuery, searchOpen, studioId]);

  // ── In modalità edit: precarico nome paziente se non passato ────────────
  useEffect(() => {
    if (mode !== "edit" || !initial?.patient_id || initial.patient_name) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("patients")
        .select("first_name, last_name")
        .eq("id", initial.patient_id)
        .maybeSingle();
      if (cancelled || !data) return;
      setPatientName(`${data.last_name} ${data.first_name}`);
    })();
    return () => { cancelled = true; };
  }, [mode, initial?.patient_id, initial?.patient_name]);

  // ── Salva (create o update) ─────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setError(null);
    if (!patientId) { setError("Seleziona un paziente."); return; }
    if (!date || !startTime) { setError("Data e ora sono obbligatori."); return; }
    if (duration < 5 || duration > 480) { setError("Durata fuori range (5-480 min)."); return; }

    setSaving(true);
    try {
      const startDt = combineDateTime(date, startTime);
      const endDt = new Date(startDt.getTime() + duration * 60000);

      const payload = {
        studio_id: studioId,
        patient_id: patientId,
        guest_practitioner_id: guestId,
        operator_id: null,            // mai operator per ospiti (constraint XOR)
        start_at: startDt.toISOString(),
        end_at: endDt.toISOString(),
        room_id: roomId,
        calendar_note: note.trim() || null,
        status: "booked" as const,
        // Campi di pagamento espliciti a null: l'ospite incassa direttamente
        price_type: null,
        payment_method: null,
        amount: null,
        is_paid: false,
        treatment_type: null,
        package_id: null,
      };

      if (mode === "create") {
        const { error: err } = await supabase
          .from("appointments")
          .insert(payload);
        if (err) throw new Error(err.message);
      } else {
        if (!initial?.id) throw new Error("ID appuntamento mancante in edit");
        // Update: aggiorna solo i campi modificabili (non studio_id, guest_id)
        const { error: err } = await supabase
          .from("appointments")
          .update({
            patient_id: payload.patient_id,
            start_at: payload.start_at,
            end_at: payload.end_at,
            room_id: payload.room_id,
            calendar_note: payload.calendar_note,
          })
          .eq("id", initial.id);
        if (err) throw new Error(err.message);
      }

      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore sconosciuto";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [patientId, date, startTime, duration, roomId, note, mode, studioId, guestId, initial?.id, onSaved, onClose]);

  // ── Elimina (solo in edit) ──────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (mode !== "edit" || !initial?.id) return;
    if (!confirm(`Cancellare l'appuntamento del ${new Date(initial.start_at).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}? L'azione non è reversibile.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from("appointments")
        .delete()
        .eq("id", initial.id);
      if (err) throw new Error(err.message);
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore eliminazione";
      setError(msg);
    } finally {
      setDeleting(false);
    }
  }, [mode, initial?.id, initial?.start_at, onSaved, onClose]);

  // ── Durate predefinite ──────────────────────────────────────────────────
  const durationPresets = useMemo(() => [15, 30, 45, 60, 90, 120], []);

  return (
    <>
      <style>{`
        .gam-overlay {
          position: fixed; inset: 0; background: rgba(15,23,42,0.5);
          z-index: 1000; display: flex; align-items: center; justify-content: center;
          padding: 16px; overflow-y: auto;
        }
        .gam-modal {
          background: ${T.white}; border-radius: 14px; overflow: hidden;
          max-width: 540px; width: 100%; max-height: 90vh; overflow-y: auto;
          box-shadow: 0 20px 60px rgba(15,23,42,0.3);
          display: flex; flex-direction: column;
        }
        .gam-head {
          background: ${GRADIENT}; padding: 16px 20px; color: ${T.white};
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
        }
        .gam-body {
          padding: 20px;
          display: flex; flex-direction: column; gap: 16px;
        }
        .gam-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 800; color: ${T.mutedSoft};
          text-transform: uppercase; letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        .gam-input {
          width: 100%; padding: 10px 12px; border-radius: 10px;
          border: 1px solid ${T.border}; background: ${T.white};
          fontSize: 14px; color: ${T.text}; outline: none;
          font-weight: 600;
        }
        .gam-input:focus { border-color: ${T.blue}; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .gam-row { display: flex; gap: 10px; }
        .gam-row > * { flex: 1; }
        .gam-chip {
          padding: 6px 12px; border-radius: 99px;
          border: 1px solid ${T.border}; background: ${T.white};
          font-size: 12px; font-weight: 700; color: ${T.muted};
          cursor: pointer;
        }
        .gam-chip.active {
          background: ${T.blue}; color: ${T.white}; border-color: ${T.blue};
        }
        .gam-foot {
          padding: 16px 20px; background: ${T.panelSoft};
          border-top: 1px solid ${T.borderSoft};
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px; flex-shrink: 0;
        }
        .gam-btn {
          padding: 10px 18px; border-radius: 10px; border: 1px solid ${T.border};
          background: ${T.white}; cursor: pointer; color: ${T.muted};
          font-size: 13px; font-weight: 800;
        }
        .gam-btn-cta {
          padding: 10px 22px; border-radius: 10px; border: none;
          background: ${GRADIENT}; cursor: pointer; color: ${T.white};
          font-size: 13px; font-weight: 800;
          box-shadow: 0 2px 8px rgba(37,99,235,0.25);
        }
        .gam-btn-cta:disabled, .gam-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .gam-btn-delete {
          padding: 10px 14px; border-radius: 10px;
          border: 1px solid ${T.red}; background: ${T.white};
          color: ${T.red}; font-size: 13px; font-weight: 800; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .gam-error {
          padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 8px; color: #991b1b; font-size: 12px; font-weight: 700;
        }
        .gam-search {
          position: relative;
        }
        .gam-search-dropdown {
          position: absolute; top: 100%; left: 0; right: 0;
          background: ${T.white}; border: 1px solid ${T.border};
          border-radius: 10px; margin-top: 4px; max-height: 240px;
          overflow-y: auto; z-index: 10;
          box-shadow: 0 6px 18px rgba(15,23,42,0.10);
        }
        .gam-search-item {
          padding: 10px 14px; cursor: pointer; border-bottom: 1px solid ${T.borderSoft};
        }
        .gam-search-item:last-child { border-bottom: none; }
        .gam-search-item:hover { background: ${T.panelSoft}; }
        .gam-selected-patient {
          padding: 10px 14px; background: ${T.panelSoft};
          border: 1px solid ${T.border}; border-radius: 10px;
          display: flex; align-items: center; justify-content: space-between;
        }
      `}</style>

      <div className="gam-overlay" onClick={onClose}>
        <div className="gam-modal" onClick={e => e.stopPropagation()}>
          {/* Header gradient */}
          <div className="gam-head">
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.85, letterSpacing: 1, textTransform: "uppercase" }}>
                {mode === "create" ? "Nuovo appuntamento" : "Modifica appuntamento"}
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>
                Agenda Ospite
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.2)", border: "none",
                borderRadius: 8, width: 32, height: 32, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.white,
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="gam-body">
            {/* PAZIENTE */}
            <div>
              <div className="gam-label">
                <User size={11} /> Paziente *
              </div>
              {patientId ? (
                <div className="gam-selected-patient">
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
                    {patientName || "Paziente selezionato"}
                  </div>
                  <button
                    onClick={() => { setPatientId(null); setPatientName(""); setSearchQuery(""); setSearchOpen(true); }}
                    style={{
                      background: "transparent", border: "none",
                      cursor: "pointer", color: T.muted,
                      fontSize: 12, fontWeight: 700,
                    }}
                  >
                    Cambia
                  </button>
                </div>
              ) : (
                <div className="gam-search">
                  <div style={{ position: "relative" }}>
                    <Search size={14} style={{
                      position: "absolute", left: 12, top: "50%",
                      transform: "translateY(-50%)", color: T.mutedXSoft,
                    }} />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Cerca paziente per cognome o nome..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                      onFocus={() => setSearchOpen(true)}
                      className="gam-input"
                      style={{ paddingLeft: 36 }}
                    />
                  </div>
                  {searchOpen && searchQuery.length >= 2 && (
                    <div className="gam-search-dropdown">
                      {searching ? (
                        <div style={{ padding: 14, fontSize: 12, color: T.muted, textAlign: "center" }}>
                          Ricerca...
                        </div>
                      ) : searchResults.length === 0 ? (
                        <div style={{ padding: 14, fontSize: 12, color: T.muted, textAlign: "center" }}>
                          Nessun paziente trovato. Crea il paziente dalla sezione Pazienti.
                        </div>
                      ) : (
                        searchResults.map(p => (
                          <div
                            key={p.id}
                            className="gam-search-item"
                            onClick={() => {
                              setPatientId(p.id);
                              setPatientName(`${p.last_name} ${p.first_name}`);
                              setSearchOpen(false);
                            }}
                          >
                            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
                              {p.last_name} {p.first_name}
                            </div>
                            {p.phone && (
                              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                                {p.phone}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* DATA + ORA */}
            <div className="gam-row">
              <div>
                <div className="gam-label">
                  <Calendar size={11} /> Data *
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="gam-input"
                />
              </div>
              <div>
                <div className="gam-label">
                  <Clock size={11} /> Ora *
                </div>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="gam-input"
                />
              </div>
            </div>

            {/* DURATA con chips */}
            <div>
              <div className="gam-label">
                Durata: <span style={{ color: T.text, fontWeight: 800 }}>{duration} min</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {durationPresets.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`gam-chip ${duration === d ? "active" : ""}`}
                  >
                    {d} min
                  </button>
                ))}
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={duration}
                  onChange={e => setDuration(parseInt(e.target.value) || 30)}
                  style={{
                    width: 70, padding: "6px 10px", borderRadius: 99,
                    border: `1px solid ${T.border}`, fontSize: 12, fontWeight: 700,
                    color: T.text, outline: "none",
                  }}
                />
              </div>
            </div>

            {/* STANZA (se ci sono almeno 2 stanze) */}
            {rooms.length >= 2 && (
              <div>
                <div className="gam-label">
                  <MapPin size={11} /> Stanza
                </div>
                <select
                  value={roomId ?? ""}
                  onChange={e => setRoomId(e.target.value || null)}
                  className="gam-input"
                >
                  <option value="">— Nessuna stanza —</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* NOTE */}
            <div>
              <div className="gam-label">
                <FileText size={11} /> Note (visibili anche all&apos;ospite nel suo portale)
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Es. prima visita, controllo, materiale necessario..."
                className="gam-input"
                rows={3}
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            {error && <div className="gam-error">{error}</div>}
          </div>

          {/* Footer */}
          <div className="gam-foot">
            {mode === "edit" ? (
              <button
                onClick={handleDelete}
                disabled={deleting || saving}
                className="gam-btn-delete"
              >
                <Trash2 size={13} /> {deleting ? "Elimino..." : "Elimina"}
              </button>
            ) : <div />}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} disabled={saving || deleting} className="gam-btn">
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={saving || deleting || !patientId}
                className="gam-btn-cta"
              >
                {saving ? "Salvataggio..." : (mode === "create" ? "Crea appuntamento" : "Salva modifiche")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
