// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/ClinicalDiarySection.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Diario clinico unificato del paziente (Tappa 8 refactor UX).
//
// SOSTITUISCE:
//   - "🗂️ Trattamento & Diario sedute" (era duplicato dentro Quadro Clinico)
//   - Il blocco diario in app/(protected)/patients/[id]/page.tsx inline
//
// UNICA FONTE DI VERITÀ per la cronologia delle sedute del paziente.
//
// MOSTRA:
//   1. Mini-grafico VAS in cima (Recharts) — trend del dolore nel tempo
//   2. Filtri: Tutte / Con SOAP / Con nota / Vuote
//   3. Cronologia inversa delle sedute (più recente in alto)
//   4. Per ogni seduta:
//        - Data e ora
//        - Status (badge colorato)
//        - VAS prima/dopo (se presenti)
//        - Nota rapida (quick_note) — testo libero
//        - SOAP (S/O/A/P se compilati)
//        - Editor inline per modificare nota rapida + template
//
// COMPATIBILITÀ:
//   - Sostituisce la sezione "diario" precedente nel page.tsx
//   - Usa le tabelle esistenti session_notes + appointments
//   - Nessuna migration DB
//
// RESPONSIVE:
//   - Header e card si adattano <768px
//   - SOAP grid passa da 2 colonne a 1 sotto i 700px
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/src/lib/supabaseClient";

// ─── Theme ──────────────────────────────────────────────────────

const T = {
  panelBg:     "#ffffff",
  panelSoft:   "#f8fafc",
  text:        "#0f172a",
  textSoft:    "#1e293b",
  muted:       "#475569",
  mutedSoft:   "#94a3b8",
  mutedLight:  "#cbd5e1",
  border:      "#e2e8f0",
  borderSoft:  "#f1f5f9",
  blue:        "#2563eb",
  teal:        "#0d9488",
  green:       "#16a34a",
  amber:       "#f59e0b",
  red:         "#dc2626",
  purple:      "#7c3aed",
};

// ─── Tipi ───────────────────────────────────────────────────────

type SessionNote = {
  id: string;
  appointment_id: string;
  patient_id: string;
  vas_before: number | null;
  vas_after: number | null;
  quick_note: string | null;
  soap_s: string | null;
  soap_o: string | null;
  soap_a: string | null;
  soap_p: string | null;
  created_at: string;
  appointments?: {
    start_at: string;
    status: string;
  } | null;
};

type Appointment = {
  id: string;
  start_at: string;
  status: string;
  calendar_note?: string | null;
};

type FilterType = "all" | "with_soap" | "with_note" | "empty";

const STATUS_LABELS: Record<string, string> = {
  scheduled:   "Pianificata",
  done:        "Completata",
  cancelled:   "Annullata",
  no_show:     "Non presentato",
};

function statusColor(status: string): string {
  if (status === "done") return T.green;
  if (status === "cancelled") return T.red;
  if (status === "no_show") return T.mutedSoft;
  return T.blue;
}

function vasColor(v: number | null | undefined): string {
  if (v == null) return T.muted;
  if (v <= 3) return T.green;
  if (v <= 6) return T.amber;
  return T.red;
}

// ─── Props ──────────────────────────────────────────────────────

export type ClinicalDiarySectionProps = {
  patientId: string;
};

// ─── Componente principale ──────────────────────────────────────

export default function ClinicalDiarySection({ patientId }: ClinicalDiarySectionProps) {

  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [expandedAppt, setExpandedAppt] = useState<string | null>(null);

  // Caricamento iniziale
  const load = useCallback(async () => {
    setLoading(true);

    // SOAP notes con appuntamento
    const { data: notesData } = await supabase
      .from("session_notes")
      .select("*, appointments(start_at,status,calendar_note)")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    // Tutti gli appuntamenti del paziente (per mostrare anche quelli senza SOAP)
    const { data: apptsData } = await supabase
      .from("appointments")
      .select("id, start_at, status, calendar_note")
      .eq("patient_id", patientId)
      .order("start_at", { ascending: false });

    setNotes((notesData as SessionNote[]) || []);
    setAppointments((apptsData as Appointment[]) || []);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    if (patientId) load();
  }, [patientId, load]);

  // ── Costruisce la lista unificata: per ogni appuntamento, eventuale nota associata ──
  // Ordinata cronologicamente inversa
  const unified = useMemo(() => {
    const notesByApptId = new Map(notes.map(n => [n.appointment_id, n]));
    return appointments.map(a => ({
      appointment: a,
      note: notesByApptId.get(a.id) || null,
    }));
  }, [notes, appointments]);

  // ── Filtri ──
  const filtered = useMemo(() => {
    return unified.filter(({ note, appointment }) => {
      const hasSOAP = note && (note.soap_s || note.soap_o || note.soap_a || note.soap_p);
      const hasQuickNote = !!(note?.quick_note?.trim()) || !!(appointment.calendar_note?.trim());

      if (filter === "all") return true;
      if (filter === "with_soap") return hasSOAP;
      if (filter === "with_note") return hasQuickNote && !hasSOAP;
      if (filter === "empty") return !hasSOAP && !hasQuickNote;
      return true;
    });
  }, [unified, filter]);

  // ── Dati per il grafico VAS ──
  const vasChartData = useMemo(() => {
    return notes
      .filter(n => n.vas_before != null || n.vas_after != null)
      .slice()
      .reverse() // dal più vecchio al più recente
      .map((n, i) => {
        const date = n.appointments?.start_at ? new Date(n.appointments.start_at) : new Date(n.created_at);
        return {
          index: i + 1,
          dateLabel: date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }),
          vasBefore: n.vas_before,
          vasAfter: n.vas_after,
          vas: n.vas_after ?? n.vas_before,
        };
      });
  }, [notes]);

  // ── Counts per badge filtri ──
  const counts = useMemo(() => {
    let withSoap = 0, withNote = 0, empty = 0;
    unified.forEach(({ note, appointment }) => {
      const hasSOAP = note && (note.soap_s || note.soap_o || note.soap_a || note.soap_p);
      const hasQuickNote = !!(note?.quick_note?.trim()) || !!(appointment.calendar_note?.trim());
      if (hasSOAP) withSoap++;
      else if (hasQuickNote) withNote++;
      else empty++;
    });
    return { total: unified.length, withSoap, withNote, empty };
  }, [unified]);

  // ── Aggiorna nota rapida di un appuntamento ──
  async function saveQuickNote(apptId: string, text: string) {
    const { error } = await supabase
      .from("appointments")
      .update({ calendar_note: text || null })
      .eq("id", apptId);
    if (error) { alert("Errore salvataggio nota: " + error.message); return; }
    // Aggiorna locale
    setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, calendar_note: text || null } : a));
  }

  if (loading) {
    return (
      <div style={{ padding: 30, textAlign: "center", color: T.muted, fontSize: 13 }}>
        Caricamento diario clinico…
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div style={{
        padding: 30, textAlign: "center",
        color: T.muted, fontSize: 13, fontStyle: "italic",
      }}>
        Nessuna seduta ancora. Crea il primo appuntamento dal calendario.
      </div>
    );
  }

  return (
    <div className="diary-section" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Grafico VAS (se ci sono almeno 2 misurazioni) ─────── */}
      {vasChartData.length >= 2 && <VasChart data={vasChartData} />}

      {/* ── Filtri ──────────────────────────────────────────── */}
      <div className="diary-filters" style={{
        display: "flex", gap: 5, flexWrap: "wrap",
      }}>
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")} count={counts.total}>
          Tutte
        </FilterButton>
        <FilterButton active={filter === "with_soap"} onClick={() => setFilter("with_soap")} count={counts.withSoap}>
          Con SOAP
        </FilterButton>
        <FilterButton active={filter === "with_note"} onClick={() => setFilter("with_note")} count={counts.withNote}>
          Solo nota rapida
        </FilterButton>
        <FilterButton active={filter === "empty"} onClick={() => setFilter("empty")} count={counts.empty}>
          Vuote
        </FilterButton>
      </div>

      {/* ── Lista sedute ────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{
          padding: 24, textAlign: "center",
          color: T.mutedSoft, fontSize: 13, fontStyle: "italic",
          background: T.panelSoft, borderRadius: 8,
        }}>
          Nessuna seduta corrisponde al filtro selezionato.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(({ appointment, note }) => (
            <DiarySessionCard
              key={appointment.id}
              appointment={appointment}
              note={note}
              expanded={expandedAppt === appointment.id}
              onToggle={() => setExpandedAppt(expandedAppt === appointment.id ? null : appointment.id)}
              onSaveQuickNote={(text) => saveQuickNote(appointment.id, text)}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        @media (max-width: 700px) {
          .diary-section {
            gap: 10px;
          }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FILTER BUTTON
// ═══════════════════════════════════════════════════════════════════

function FilterButton({
  active, onClick, children, count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 11px", borderRadius: 7,
        border: `1px solid ${active ? T.text : T.border}`,
        background: active ? T.text : T.panelBg,
        color: active ? "#fff" : T.muted,
        fontWeight: 700, fontSize: 11,
        cursor: "pointer", fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      {children}
      <span style={{
        background: active ? "rgba(255,255,255,0.2)" : T.borderSoft,
        color: active ? "#fff" : T.muted,
        padding: "1px 6px", borderRadius: 99,
        fontSize: 9, fontWeight: 800,
      }}>{count}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VAS CHART (Recharts)
// ═══════════════════════════════════════════════════════════════════

function VasChart({ data }: { data: any[] }) {
  // Calcola trend: prima vs ultima VAS
  const first = data[0]?.vas;
  const last = data[data.length - 1]?.vas;
  const delta = first != null && last != null ? last - first : null;
  const trend =
    delta == null ? null :
    delta <= -1 ? { label: "in miglioramento", color: T.green, arrow: "↘" } :
    delta >= 1  ? { label: "in peggioramento", color: T.red,   arrow: "↗" } :
                  { label: "stabile",          color: T.amber, arrow: "→" };

  // SVG params
  const W = 600;   // viewBox width (scala con container)
  const H = 180;
  const padL = 30, padR = 12, padT = 10, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const yMax = 10;

  // Hover state
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Scale
  const xStep = data.length > 1 ? innerW / (data.length - 1) : innerW / 2;
  const xPos = (i: number) => padL + (data.length > 1 ? i * xStep : innerW / 2);
  const yPos = (v: number) => padT + innerH - (v / yMax) * innerH;

  // Path builder
  function pathOf(key: "vasBefore" | "vasAfter"): string {
    let d = "";
    let started = false;
    for (let i = 0; i < data.length; i++) {
      const v = data[i][key];
      if (v == null) continue;
      const x = xPos(i);
      const y = yPos(v);
      d += (started ? " L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      started = true;
    }
    return d;
  }

  const beforePath = pathOf("vasBefore");
  const afterPath = pathOf("vasAfter");

  // YAxis ticks
  const yTicks = [0, 2, 4, 6, 8, 10];

  return (
    <div style={{
      background: T.panelBg, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 10, gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>📉 Andamento VAS</div>
        {trend && (
          <div style={{ fontSize: 11, color: trend.color, fontWeight: 700 }}>
            {first} {trend.arrow} {last} · <span style={{ fontWeight: 600 }}>{trend.label}</span>
          </div>
        )}
      </div>

      <div style={{ width: "100%", position: "relative" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: 180, display: "block" }}
        >
          {/* Y grid lines + labels */}
          {yTicks.map(t => {
            const y = yPos(t);
            return (
              <g key={t}>
                <line x1={padL} y1={y} x2={W - padR} y2={y}
                      stroke={T.borderSoft} strokeWidth="1" strokeDasharray="3 3" />
                <text x={padL - 6} y={y + 3}
                      fontSize="10" fill={T.muted} textAnchor="end">{t}</text>
              </g>
            );
          })}

          {/* Reference lines per zone dolore (VAS 3 e 6) */}
          <line x1={padL} y1={yPos(3)} x2={W - padR} y2={yPos(3)}
                stroke={T.green} strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
          <line x1={padL} y1={yPos(6)} x2={W - padR} y2={yPos(6)}
                stroke={T.amber} strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />

          {/* X axis */}
          <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH}
                stroke={T.border} strokeWidth="1" />

          {/* Linea "prima" */}
          {beforePath && (
            <path d={beforePath}
                  stroke={T.muted} strokeWidth="1.5" strokeDasharray="4 3"
                  fill="none" opacity="0.6" />
          )}
          {/* Linea "dopo" */}
          {afterPath && (
            <path d={afterPath} stroke={T.teal} strokeWidth="2" fill="none" />
          )}

          {/* Punti + tooltip area */}
          {data.map((d, i) => {
            const x = xPos(i);
            const isHovered = hoverIdx === i;
            return (
              <g key={i}>
                {/* Punti */}
                {d.vasBefore != null && (
                  <circle cx={x} cy={yPos(d.vasBefore)} r="3"
                          fill={T.muted} opacity="0.7" />
                )}
                {d.vasAfter != null && (
                  <circle cx={x} cy={yPos(d.vasAfter)}
                          r={isHovered ? 5 : 4}
                          fill={T.teal} />
                )}
                {/* Label data sulla X (solo ogni N per non sovrapporre) */}
                {(data.length <= 8 || i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && (
                  <text x={x} y={H - 8}
                        fontSize="9" fill={T.muted}
                        textAnchor="middle" fontWeight="600">{d.dateLabel}</text>
                )}
                {/* Area trasparente per hover */}
                <rect x={x - xStep/2} y={padT}
                      width={xStep} height={innerH}
                      fill="transparent"
                      onMouseEnter={() => setHoverIdx(i)}
                      onMouseLeave={() => setHoverIdx(null)}
                      style={{ cursor: "pointer" }} />
                {/* Linea verticale al hover */}
                {isHovered && (
                  <line x1={x} y1={padT} x2={x} y2={padT + innerH}
                        stroke={T.text} strokeWidth="1" opacity="0.2" />
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip al hover */}
        {hoverIdx !== null && data[hoverIdx] && (() => {
          const d = data[hoverIdx];
          const x = xPos(hoverIdx);
          // Calcola percentuale per posizionare il tooltip nello stesso punto del cerchio
          const percent = (x / W) * 100;
          const placeLeft = percent > 70;
          return (
            <div style={{
              position: "absolute", top: -2,
              left: placeLeft ? `auto` : `${percent}%`,
              right: placeLeft ? `${100 - percent}%` : "auto",
              transform: placeLeft ? "translateX(-8px)" : "translateX(8px)",
              background: T.text, color: "#fff",
              padding: "6px 10px", borderRadius: 6,
              fontSize: 10, fontWeight: 700,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}>
              <div style={{ fontWeight: 800, marginBottom: 2 }}>{d.dateLabel}</div>
              {d.vasBefore != null && (
                <div>Prima: <span style={{ color: vasColor(d.vasBefore) }}>{d.vasBefore}</span></div>
              )}
              {d.vasAfter != null && (
                <div>Dopo: <span style={{ color: vasColor(d.vasAfter) }}>{d.vasAfter}</span></div>
              )}
            </div>
          );
        })()}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 10, color: T.muted, fontWeight: 600 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: 2, background: T.muted, display: "inline-block", borderRadius: 1, opacity: 0.7 }} />
          Prima della seduta
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: 2, background: T.teal, display: "inline-block", borderRadius: 1 }} />
          Dopo la seduta
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CARD SINGOLA SEDUTA
// ═══════════════════════════════════════════════════════════════════

function DiarySessionCard({
  appointment, note, expanded, onToggle, onSaveQuickNote,
}: {
  appointment: Appointment;
  note: SessionNote | null;
  expanded: boolean;
  onToggle: () => void;
  onSaveQuickNote: (text: string) => void;
}) {
  const apptDate = new Date(appointment.start_at);
  const hasSOAP = note && (note.soap_s || note.soap_o || note.soap_a || note.soap_p);
  const quickNote = note?.quick_note?.trim() || appointment.calendar_note?.trim();

  const [editingNote, setEditingNote] = useState(false);
  const [draftNote, setDraftNote] = useState("");

  function startEditNote() {
    setDraftNote(appointment.calendar_note || "");
    setEditingNote(true);
  }
  function saveNote() {
    onSaveQuickNote(draftNote);
    setEditingNote(false);
  }
  function cancelEdit() {
    setDraftNote("");
    setEditingNote(false);
  }

  return (
    <div style={{
      background: T.panelBg, border: `1px solid ${T.border}`,
      borderRadius: 10, overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          padding: "12px 14px", cursor: "pointer",
          display: "grid", gridTemplateColumns: "1fr auto", gap: 10,
          alignItems: "center",
          transition: "background 0.12s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = T.panelSoft}
        onMouseLeave={e => e.currentTarget.style.background = T.panelBg}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
              {apptDate.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
            </span>
            <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
              {apptDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span style={{
              padding: "2px 8px", borderRadius: 99,
              background: statusColor(appointment.status), color: "#fff",
              fontSize: 9, fontWeight: 800, textTransform: "uppercase",
            }}>{STATUS_LABELS[appointment.status] || appointment.status}</span>
            {hasSOAP && (
              <span style={{
                padding: "2px 8px", borderRadius: 99,
                background: T.purple, color: "#fff",
                fontSize: 9, fontWeight: 800,
              }}>SOAP</span>
            )}
          </div>
          {!expanded && quickNote && (
            <div style={{
              fontSize: 12, color: T.muted, marginTop: 4, fontWeight: 500,
              overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
            }}>
              {quickNote}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {(note?.vas_before != null || note?.vas_after != null) && (
            <div style={{ display: "flex", gap: 4, fontSize: 10 }}>
              {note?.vas_before != null && (
                <span style={{ padding: "2px 6px", borderRadius: 4, background: T.borderSoft, fontWeight: 700, color: T.muted }}>
                  <span style={{ opacity: 0.6 }}>pre </span>
                  <span style={{ color: vasColor(note.vas_before) }}>{note.vas_before}</span>
                </span>
              )}
              {note?.vas_after != null && (
                <span style={{ padding: "2px 6px", borderRadius: 4, background: T.borderSoft, fontWeight: 700, color: T.muted }}>
                  <span style={{ opacity: 0.6 }}>post </span>
                  <span style={{ color: vasColor(note.vas_after) }}>{note.vas_after}</span>
                </span>
              )}
            </div>
          )}
          <span style={{
            color: T.mutedLight, fontSize: 13,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}>›</span>
        </div>
      </div>

      {/* Espansione */}
      {expanded && (
        <div style={{
          padding: "12px 14px 14px",
          borderTop: `1px solid ${T.borderSoft}`,
          background: T.panelSoft,
        }}>
          {/* Nota rapida (calendar_note) */}
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, color: T.muted,
              textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>📝 Nota rapida</span>
              {!editingNote && (
                <button
                  onClick={startEditNote}
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    color: T.blue, fontSize: 10, fontWeight: 700, fontFamily: "inherit",
                  }}
                >{appointment.calendar_note ? "Modifica" : "+ Aggiungi"}</button>
              )}
            </div>
            {editingNote ? (
              <div>
                <textarea
                  value={draftNote}
                  onChange={e => setDraftNote(e.target.value)}
                  rows={3}
                  placeholder="Cosa hai fatto in questa seduta? Tecniche, esercizi, risposta del paziente…"
                  autoFocus
                  style={{
                    width: "100%", padding: "8px 10px",
                    border: `1px solid ${T.border}`, borderRadius: 6,
                    fontSize: 12, fontFamily: "inherit", color: T.text,
                    background: T.panelBg, resize: "vertical", outline: "none",
                  }}
                />
                <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", marginTop: 6 }}>
                  <button
                    onClick={cancelEdit}
                    style={{
                      padding: "5px 12px", borderRadius: 6,
                      border: `1px solid ${T.border}`, background: T.panelBg,
                      color: T.muted, fontWeight: 600, fontSize: 11,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >Annulla</button>
                  <button
                    onClick={saveNote}
                    style={{
                      padding: "5px 14px", borderRadius: 6, border: "none",
                      background: T.teal, color: "#fff",
                      fontWeight: 700, fontSize: 11,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >Salva</button>
                </div>
              </div>
            ) : appointment.calendar_note ? (
              <div style={{
                fontSize: 12, color: T.text, lineHeight: 1.5,
                padding: "8px 10px", background: T.panelBg,
                borderRadius: 6, whiteSpace: "pre-wrap",
              }}>{appointment.calendar_note}</div>
            ) : (
              <div style={{ fontSize: 11, color: T.mutedSoft, fontStyle: "italic" }}>
                Nessuna nota rapida per questa seduta.
              </div>
            )}
          </div>

          {/* SOAP */}
          {hasSOAP && note && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 800, color: T.muted,
                textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5,
              }}>
                📋 SOAP
              </div>
              <div className="soap-grid" style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
              }}>
                {([
                  { k: "soap_s" as const, l: "S - Soggettivo", color: T.blue },
                  { k: "soap_o" as const, l: "O - Oggettivo",  color: T.teal },
                  { k: "soap_a" as const, l: "A - Assessment", color: T.purple },
                  { k: "soap_p" as const, l: "P - Plan",       color: T.green },
                ]).map(f => note[f.k] && (
                  <div key={f.k} style={{
                    background: T.panelBg, borderRadius: 6,
                    padding: "8px 10px",
                    borderLeft: `3px solid ${f.color}`,
                  }}>
                    <div style={{
                      fontSize: 9, fontWeight: 800, color: f.color,
                      textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3,
                    }}>{f.l}</div>
                    <div style={{ fontSize: 11, color: T.text, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                      {note[f.k]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hint apri appuntamento */}
          {!hasSOAP && (
            <div style={{
              marginTop: 10, padding: "8px 10px",
              background: "rgba(13,148,136,0.06)", borderRadius: 6,
              fontSize: 11, color: T.muted,
              borderLeft: `3px solid ${T.teal}`,
            }}>
              💡 Per aggiungere SOAP completo e VAS, apri questo appuntamento dal calendario.
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @media (max-width: 700px) {
          .soap-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
