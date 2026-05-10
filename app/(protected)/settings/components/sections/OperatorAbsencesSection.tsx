// app/(protected)/settings/components/sections/OperatorAbsencesSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Assenze e indisponibilità operatori" (Fase 5).
//
// Visibile solo in modalità multi-operatore (multi_operator_enabled=true +
// ≥2 membri attivi). Permette di:
//   • Visualizzare per ogni operatore le assenze esistenti, future per default
//   • Aggiungere nuova assenza: data inizio/fine, all_day o fascia oraria,
//     motivo libero (preset rapidi: Ferie / Malattia / Formazione / Permesso)
//   • Eliminare un'assenza
//
// Le assenze sono mostrate poi nelle viste calendario:
//   - Vista Day multi-op: striature grigie sulla colonna operatore
//   - Vista Mese: indicatore visivo nelle celle giorno (Fase 5)
//
// Tabella DB: operator_unavailability (mig. 019). RLS studio-scoped.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import { supabase } from "@/src/lib/supabaseClient";

// Preset rapidi per il campo "motivo" — l'utente può comunque scrivere libero
const REASON_PRESETS: Array<{ value: string; emoji: string }> = [
  { value: "Ferie", emoji: "🌴" },
  { value: "Malattia", emoji: "🤒" },
  { value: "Formazione", emoji: "📚" },
  { value: "Permesso", emoji: "📋" },
];

export type OperatorMember = {
  user_id: string | null;
  display_name: string | null;
  display_color?: string | null;
  signature_short?: string | null;
};

export type OperatorAbsence = {
  id: string;
  studio_id: string;
  operator_id: string;
  start_at: string; // ISO
  end_at: string;
  all_day: boolean;
  reason: string | null;
  created_at: string;
};

export type OperatorAbsencesSectionProps = {
  show: boolean;
  onToggle: () => void;
  studioId: string;
  /** Solo operatori con user_id != null (gli inviti pendenti non possono avere assenze) */
  members: OperatorMember[];
};

// Helper: ISO → "YYYY-MM-DDTHH:MM" per input datetime-local
function isoToInputDT(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Helper: ISO → "YYYY-MM-DD" per input date
function isoToInputDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Helper: format leggibile per display
function fmtAbsence(a: OperatorAbsence): string {
  const start = new Date(a.start_at);
  const end = new Date(a.end_at);
  const sameDay = start.toDateString() === end.toDateString();
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
  if (a.all_day) {
    if (sameDay) return start.toLocaleDateString("it-IT", opts);
    return `${start.toLocaleDateString("it-IT", opts)} → ${end.toLocaleDateString("it-IT", opts)}`;
  }
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (sameDay) {
    return `${start.toLocaleDateString("it-IT", opts)} ${start.toLocaleTimeString("it-IT", timeOpts)}–${end.toLocaleTimeString("it-IT", timeOpts)}`;
  }
  return `${start.toLocaleDateString("it-IT", opts)} ${start.toLocaleTimeString("it-IT", timeOpts)} → ${end.toLocaleDateString("it-IT", opts)} ${end.toLocaleTimeString("it-IT", timeOpts)}`;
}

// ── Form nuova assenza ──────────────────────────────────────────────────
type AbsenceFormProps = {
  members: OperatorMember[];
  defaultOperatorId: string;
  onCancel: () => void;
  onSubmit: (payload: {
    operator_id: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
    reason: string | null;
  }) => Promise<void>;
  saving: boolean;
};

function AbsenceForm({ members, defaultOperatorId, onCancel, onSubmit, saving }: AbsenceFormProps) {
  const [opId, setOpId] = useState(defaultOperatorId);
  const [allDay, setAllDay] = useState(true);
  // Default: oggi (per all_day) / oggi 09:00→18:00 per fascia
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,"0")}-${today.getDate().toString().padStart(2,"0")}`;
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");

  const handleSubmit = async () => {
    if (!opId) {
      alert("Seleziona un operatore");
      return;
    }
    let startAt: string, endAt: string;
    if (allDay) {
      // Da inizio del giorno start a fine del giorno end (23:59:59)
      startAt = new Date(`${startDate}T00:00:00`).toISOString();
      const endD = new Date(`${endDate}T23:59:59`);
      endAt = endD.toISOString();
    } else {
      startAt = new Date(`${startDate}T${startTime}:00`).toISOString();
      endAt = new Date(`${endDate}T${endTime}:00`).toISOString();
    }
    if (new Date(endAt) <= new Date(startAt)) {
      alert("La data fine deve essere dopo la data inizio");
      return;
    }
    await onSubmit({
      operator_id: opId,
      start_at: startAt,
      end_at: endAt,
      all_day: allDay,
      reason: reason.trim() || null,
    });
  };

  return (
    <div style={{
      padding: 16,
      border: `1.5px solid ${THEME.teal}40`,
      borderRadius: 10,
      background: "rgba(13,148,136,0.03)",
      marginBottom: 14,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 12 }}>
        Nuova assenza
      </div>

      {/* Operatore */}
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Operatore</label>
        <select
          value={opId}
          onChange={e => setOpId(e.target.value)}
          style={{...inputStyle, width: "100%"}}
        >
          {members.map(m => (
            <option key={m.user_id ?? ""} value={m.user_id ?? ""}>
              {m.display_name || "—"}
            </option>
          ))}
        </select>
      </div>

      {/* Tipo: tutto il giorno o fascia */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setAllDay(true)}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: `1.5px solid ${allDay ? THEME.teal : THEME.border}`,
            background: allDay ? THEME.teal : "#fff",
            color: allDay ? "#fff" : THEME.text,
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Tutto il giorno
        </button>
        <button
          type="button"
          onClick={() => setAllDay(false)}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: `1.5px solid ${!allDay ? THEME.teal : THEME.border}`,
            background: !allDay ? THEME.teal : "#fff",
            color: !allDay ? "#fff" : THEME.text,
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Fascia oraria
        </button>
      </div>

      {/* Date + (eventuali) ore */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Da</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={{...inputStyle, width: "100%"}}
          />
          {!allDay && (
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              style={{...inputStyle, width: "100%", marginTop: 6}}
            />
          )}
        </div>
        <div>
          <label style={labelStyle}>A</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            style={{...inputStyle, width: "100%"}}
          />
          {!allDay && (
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              style={{...inputStyle, width: "100%", marginTop: 6}}
            />
          )}
        </div>
      </div>

      {/* Motivo: preset + input libero */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Motivo</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {REASON_PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setReason(p.value)}
              style={{
                padding: "5px 10px",
                border: `1px solid ${reason === p.value ? THEME.teal : THEME.border}`,
                background: reason === p.value ? "rgba(13,148,136,0.08)" : "#fff",
                color: reason === p.value ? THEME.teal : THEME.muted,
                borderRadius: 99,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {p.emoji} {p.value}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Es. Ferie, Corso EOM, Visita medica..."
          style={{...inputStyle, width: "100%"}}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <BtnOutline label="Annulla" onClick={onCancel} disabled={saving} />
        <BtnPrimary label={saving ? "Salvataggio…" : "Salva assenza"} onClick={handleSubmit} disabled={saving} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Componente principale
// ─────────────────────────────────────────────────────────────────────────

export default function OperatorAbsencesSection({
  show,
  onToggle,
  studioId,
  members,
}: OperatorAbsencesSectionProps) {
  const [absences, setAbsences] = useState<OperatorAbsence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Solo membri con user_id reale (gli inviti pendenti non possono avere assenze)
  const realMembers = useMemo(
    () => members.filter(m => m.user_id != null),
    [members]
  );

  const memberMap = useMemo(() => {
    const m = new Map<string, OperatorMember>();
    for (const member of realMembers) {
      if (member.user_id) m.set(member.user_id, member);
    }
    return m;
  }, [realMembers]);

  // Carica assenze: future + ultime 30gg passate (non vogliamo mostrare anni di storico)
  const loadAbsences = useCallback(async () => {
    if (!studioId) return;
    setLoading(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const { data, error } = await supabase
      .from("operator_unavailability")
      .select("id, studio_id, operator_id, start_at, end_at, all_day, reason, created_at")
      .eq("studio_id", studioId)
      .gte("end_at", cutoff.toISOString())
      .order("start_at", { ascending: true });
    if (!error && data) {
      setAbsences(data as OperatorAbsence[]);
    } else if (error) {
      console.error("loadAbsences error:", error);
    }
    setLoading(false);
  }, [studioId]);

  useEffect(() => {
    if (show) loadAbsences();
  }, [show, loadAbsences]);

  const handleCreate = useCallback(async (payload: {
    operator_id: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
    reason: string | null;
  }) => {
    setSaving(true);
    const { error } = await supabase
      .from("operator_unavailability")
      .insert({
        studio_id: studioId,
        operator_id: payload.operator_id,
        start_at: payload.start_at,
        end_at: payload.end_at,
        all_day: payload.all_day,
        reason: payload.reason,
      });
    setSaving(false);
    if (error) {
      alert("Errore creazione assenza: " + error.message);
      return;
    }
    setShowForm(false);
    await loadAbsences();
  }, [studioId, loadAbsences]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Eliminare questa assenza?")) return;
    const { error } = await supabase
      .from("operator_unavailability")
      .delete()
      .eq("id", id);
    if (error) {
      alert("Errore eliminazione: " + error.message);
      return;
    }
    await loadAbsences();
  }, [loadAbsences]);

  // Raggruppa per operatore
  const byOperator = useMemo(() => {
    const m = new Map<string, OperatorAbsence[]>();
    for (const a of absences) {
      const arr = m.get(a.operator_id) ?? [];
      arr.push(a);
      m.set(a.operator_id, arr);
    }
    return m;
  }, [absences]);

  return (
    <div style={{...cardStyle, marginBottom: 16}}>
      <div onClick={onToggle} style={{...sectionHead, cursor: "pointer"}}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: THEME.text }}>
            Assenze e indisponibilità
          </span>
          <span style={{ fontSize: 11, color: THEME.muted, fontWeight: 500 }}>
            ({absences.length})
          </span>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12 }}>{show ? "▲" : "▼"}</span>
      </div>

      {show && (
        <div style={{ padding: "0 18px 18px" }}>
          <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Marca ferie, malattie, formazioni o permessi degli operatori. Le assenze appariranno nel calendario come fasce striate sulla colonna dell'operatore (vista giorno) e come indicatori nelle celle giorno (vista mese).
          </div>

          {realMembers.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: THEME.muted, fontSize: 12, background: THEME.panelSoft, borderRadius: 8 }}>
              Nessun operatore registrato. Le assenze possono essere assegnate solo a membri che hanno accettato l'invito.
            </div>
          ) : (
            <>
              {!showForm && (
                <div style={{ marginBottom: 14 }}>
                  <BtnPrimary
                    label="+ Nuova assenza"
                    onClick={() => setShowForm(true)}
                  />
                </div>
              )}

              {showForm && realMembers[0]?.user_id && (
                <AbsenceForm
                  members={realMembers}
                  defaultOperatorId={realMembers[0].user_id}
                  onCancel={() => setShowForm(false)}
                  onSubmit={handleCreate}
                  saving={saving}
                />
              )}

              {/* Lista per operatore */}
              {loading ? (
                <div style={{ padding: 20, textAlign: "center", color: THEME.muted, fontSize: 12 }}>
                  Caricamento…
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {realMembers.map(m => {
                    if (!m.user_id) return null;
                    const list = byOperator.get(m.user_id) ?? [];
                    const color = m.display_color || "#94a3b8";
                    return (
                      <div key={m.user_id} style={{
                        border: `1px solid ${THEME.border}`,
                        borderRadius: 8,
                        overflow: "hidden",
                      }}>
                        <div style={{
                          padding: "8px 12px",
                          background: `${color}10`,
                          borderBottom: list.length > 0 ? `1px solid ${THEME.border}` : "none",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: "50%",
                            background: color, color: "#fff",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, fontWeight: 800,
                          }}>
                            {(m.signature_short || m.display_name || "?").substring(0, 2).toUpperCase()}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>
                            {m.display_name || "—"}
                          </span>
                          <span style={{ fontSize: 10, color: THEME.muted, marginLeft: "auto" }}>
                            {list.length} {list.length === 1 ? "assenza" : "assenze"}
                          </span>
                        </div>
                        {list.length === 0 ? (
                          <div style={{ padding: 14, textAlign: "center", color: THEME.muted, fontSize: 11, fontStyle: "italic" }}>
                            Nessuna assenza programmata
                          </div>
                        ) : (
                          list.map(a => (
                            <div
                              key={a.id}
                              style={{
                                padding: "10px 12px",
                                borderBottom: `1px solid ${THEME.border}20`,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: THEME.text }}>
                                  {a.reason || "Indisponibile"}
                                </div>
                                <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>
                                  {fmtAbsence(a)}
                                  {a.all_day && <span style={{
                                    marginLeft: 6,
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: "1px 5px",
                                    borderRadius: 99,
                                    background: "rgba(13,148,136,0.1)",
                                    color: THEME.teal,
                                    letterSpacing: 0.3,
                                    textTransform: "uppercase",
                                  }}>Giornata</span>}
                                </div>
                              </div>
                              <button
                                onClick={() => handleDelete(a.id)}
                                style={{
                                  padding: "4px 10px",
                                  border: `1px solid ${THEME.border}`,
                                  background: "#fff",
                                  color: THEME.red,
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                  fontSize: 10,
                                  fontWeight: 600,
                                }}
                                title="Elimina assenza"
                              >
                                Elimina
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
