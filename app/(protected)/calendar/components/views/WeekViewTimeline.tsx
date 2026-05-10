// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/WeekViewTimeline.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// VISTA SETTIMANA — LAYOUT "TIMELINE OPERATORE" (Approccio A, mig. 022)
//
// Layout: una RIGA per operatore × una COLONNA per giorno.
// In ogni cella si vedono i primi N appuntamenti del giorno per
// quell'operatore (cognome + ora di inizio), poi un "+ X altri" che
// apre un popover con tutti.
//
// Quando l'utente sceglie il layout 'timeline' in Settings → Team e
// lo studio è in modalità multi-operatore (multi_operator_enabled=true
// + activeMembers≥2), il calendar/page.tsx usa questo componente al
// posto di WeekView.
//
// Differenze chiave vs WeekView classica:
// - non c'è griglia oraria 7-19 verticale: ogni cella è UN GIORNO ×
//   UN OPERATORE. Si perde la dimensione "ora del giorno" come asse
//   visivo ma si guadagna leggibilità nomi e distribuzione carico.
// - colonna sx fissa 90px = avatar + display_name + count sedute.
// - eventi mostrati come "<cognome> <ora>" su sfondo tinto operatore.
// - click cella vuota = quick-add per quel giorno + operatore.
// - click evento = apre il modale dettaglio standard.
// - niente drag&drop, niente right-click context menu in v1
//   (saranno aggiunti in 4b.3 se il layout viene confermato).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState } from "react";
import { THEME, formatDMY, type CalendarEvent } from "../../utils";
import type { StudioMember } from "@/src/contexts/StudioContext";

// Quanti eventi mostrare in cella prima di collassare in "+ N altri".
const VISIBLE_EVENTS_PER_CELL = 3;

export type WeekViewTimelineProps = {
  // Dati base
  weekDays: Date[];
  filteredEvents: CalendarEvent[];
  currentTime: Date;

  // Membri del team (già filtrati per is_active dal parent)
  members: StudioMember[];
  /** Mappa operator_id → colore (chiave include "pending:..." per inviti) */
  operatorColorMap: Map<string, string>;

  // Callback al parent
  /** Click su slot vuoto: crea quick-add per quel giorno + operatore */
  onCreateForOperatorAndDay: (date: Date, operatorKey: string) => void;
  /** Click su evento: apre modale dettaglio (parent fa setup completo) */
  onSelectEvent: (event: CalendarEvent) => void;
};

// Helper: ottiene la "chiave operatore" da un membro.
// Per i membri registrati = user_id. Per gli inviti pendenti = `pending:<token>`.
function memberKey(m: StudioMember): string | null {
  if (m.user_id) return m.user_id;
  if (m.invite_token) return `pending:${m.invite_token}`;
  return null;
}

// Helper: estrae il cognome (ultima parola) da patient_name.
// Se patient_last_name è valorizzato lo preferiamo (più affidabile).
function lastNameOf(ev: CalendarEvent): string {
  if (ev.patient_last_name && ev.patient_last_name.trim()) {
    return ev.patient_last_name.trim();
  }
  const parts = (ev.patient_name || "").trim().split(/\s+/);
  return parts[parts.length - 1] || ev.patient_name || "—";
}

function fmtHHMM(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Helper: data → chiave YYYY-MM-DD per raggruppare eventi per giorno
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function WeekViewTimeline(p: WeekViewTimelineProps) {
  // Popover "+ N altri": memorizziamo qual è la cella espansa.
  // Una sola alla volta. Click fuori = chiude.
  const [expandedCell, setExpandedCell] = useState<{
    operatorKey: string;
    dayKey: string;
  } | null>(null);

  // Pre-raggruppiamo gli eventi per (operatorKey × dayKey) una sola volta.
  // Se operator_id è null, l'evento finisce in una "lane unassigned" che
  // mostriamo come ultima riga.
  const eventsByOpDay = new Map<string, CalendarEvent[]>();
  for (const ev of p.filteredEvents) {
    const opKey = ev.operator_id || "_unassigned_";
    const dKey = dayKey(ev.start);
    const composite = `${opKey}::${dKey}`;
    const arr = eventsByOpDay.get(composite);
    if (arr) arr.push(ev);
    else eventsByOpDay.set(composite, [ev]);
  }
  // Ordina ogni gruppo per orario di inizio
  for (const arr of eventsByOpDay.values()) {
    arr.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  // Conteggio totale sedute della settimana per ogni operatore (badge nella colonna sx)
  const weekTotalByOp = new Map<string, number>();
  for (const ev of p.filteredEvents) {
    const opKey = ev.operator_id || "_unassigned_";
    weekTotalByOp.set(opKey, (weekTotalByOp.get(opKey) || 0) + 1);
  }

  // Costruzione lista righe: prima i membri attivi, poi (se ci sono eventi
  // unassigned) una riga "Non assegnati" alla fine.
  const memberRows = p.members
    .map(m => ({
      key: memberKey(m),
      member: m,
    }))
    .filter((r): r is { key: string; member: StudioMember } => r.key !== null);

  const hasUnassigned = (weekTotalByOp.get("_unassigned_") || 0) > 0;

  // Today marker
  const todayKey = dayKey(p.currentTime);

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${THEME.border}`,
        borderRadius: 12,
        overflow: "hidden",
        marginTop: 12,
      }}
      onClick={() => setExpandedCell(null)}
    >
      {/* ═══════ Header giorni ═══════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `90px repeat(${p.weekDays.length}, 1fr)`,
          background: "linear-gradient(135deg, #0d9488 0%, #2563eb 100%)",
          color: "#fff",
        }}
      >
        <div style={{ padding: "10px 8px", fontSize: 11, fontWeight: 600, opacity: 0.85 }}>OPERATORE</div>
        {p.weekDays.map((d, i) => {
          const isToday = dayKey(d) === todayKey;
          const dowLabels = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];
          return (
            <div
              key={i}
              style={{
                padding: "8px 6px",
                textAlign: "center",
                borderLeft: "1px solid rgba(255,255,255,0.18)",
                background: isToday ? "rgba(255,255,255,0.16)" : "transparent",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>{dowLabels[d.getDay()]}</div>
              <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.9 }}>{formatDMY(d)}</div>
            </div>
          );
        })}
      </div>

      {/* ═══════ Righe operatori ═══════ */}
      {memberRows.map(({ key: opKey, member }) => {
        const color = p.operatorColorMap.get(opKey) || "#94a3b8";
        const isPending = !member.user_id;
        const initials = (member.signature_short || member.display_name || "?")
          .substring(0, 2)
          .toUpperCase();
        const total = weekTotalByOp.get(opKey) || 0;

        return (
          <div
            key={opKey}
            style={{
              display: "grid",
              gridTemplateColumns: `90px repeat(${p.weekDays.length}, 1fr)`,
              borderTop: `1px solid ${THEME.border}`,
              minHeight: 96,
            }}
          >
            {/* ── Colonna sx: avatar + nome + total ── */}
            <div
              style={{
                padding: "10px 6px",
                background: `${color}14`, // 14 hex = ~8% opacity
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                borderRight: `2px solid ${color}`,
                position: "relative",
              }}
            >
              {isPending && (
                <div
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 4,
                    fontSize: 8,
                    fontWeight: 700,
                    color: "#92400e",
                    background: "#fef3c7",
                    padding: "1px 4px",
                    borderRadius: 3,
                    letterSpacing: 0.3,
                  }}
                  title="Invito non ancora accettato"
                >
                  PEND
                </div>
              )}
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: color,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                }}
              >
                {initials}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: THEME.text,
                  textAlign: "center",
                  lineHeight: 1.2,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={member.display_name || ""}
              >
                {member.display_name || "—"}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: color,
                  background: "#fff",
                  padding: "1px 6px",
                  borderRadius: 99,
                  border: `1px solid ${color}40`,
                }}
              >
                {total} sed.
              </div>
            </div>

            {/* ── Celle giorno per questo operatore ── */}
            {p.weekDays.map((d, di) => {
              const dKey = dayKey(d);
              const composite = `${opKey}::${dKey}`;
              const cellEvents = eventsByOpDay.get(composite) || [];
              const isToday = dKey === todayKey;
              const isExpanded =
                expandedCell &&
                expandedCell.operatorKey === opKey &&
                expandedCell.dayKey === dKey;
              const visible = isExpanded ? cellEvents : cellEvents.slice(0, VISIBLE_EVENTS_PER_CELL);
              const hidden = cellEvents.length - visible.length;

              return (
                <div
                  key={di}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Click su area vuota della cella (non su evento) = crea
                    if (cellEvents.length === 0) {
                      // Default: crea alle 9:00 di quel giorno
                      const newDate = new Date(d);
                      newDate.setHours(9, 0, 0, 0);
                      p.onCreateForOperatorAndDay(newDate, opKey);
                    }
                  }}
                  style={{
                    padding: 4,
                    borderLeft: `1px solid ${THEME.border}`,
                    background: isToday ? "rgba(37,99,235,0.04)" : "#fff",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    cursor: cellEvents.length === 0 ? "pointer" : "default",
                    minHeight: 0,
                  }}
                >
                  {visible.map(ev => (
                    <button
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onSelectEvent(ev);
                      }}
                      style={{
                        background: `${color}1f`, // ~12% opacity
                        color: THEME.text,
                        border: "none",
                        borderLeft: `3px solid ${color}`,
                        borderRadius: "0 4px 4px 0",
                        padding: "3px 6px",
                        fontSize: 11,
                        fontFamily: "inherit",
                        textAlign: "left",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        overflow: "hidden",
                      }}
                      title={`${ev.patient_name} · ${fmtHHMM(ev.start)}`}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          flexShrink: 0,
                          color: color,
                          fontSize: 10,
                        }}
                      >
                        {fmtHHMM(ev.start)}
                      </span>
                      <span
                        style={{
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {lastNameOf(ev)}
                      </span>
                    </button>
                  ))}
                  {hidden > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedCell({ operatorKey: opKey, dayKey: dKey });
                      }}
                      style={{
                        background: THEME.panelSoft,
                        color: THEME.muted,
                        border: `1px dashed ${THEME.border}`,
                        borderRadius: 4,
                        padding: "2px 6px",
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                    >
                      + {hidden} altr{hidden === 1 ? "o" : "i"}
                    </button>
                  )}
                  {cellEvents.length === 0 && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "#cbd5e1",
                        textAlign: "center",
                        padding: "12px 0",
                        fontStyle: "italic",
                        userSelect: "none",
                      }}
                    >
                      —
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ═══════ Riga "Non assegnati" (solo se ci sono eventi senza operator_id) ═══════ */}
      {hasUnassigned && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `90px repeat(${p.weekDays.length}, 1fr)`,
            borderTop: `1px solid ${THEME.border}`,
            minHeight: 70,
            background: "#fafbfc",
          }}
        >
          <div
            style={{
              padding: "10px 6px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              borderRight: `2px solid #cbd5e1`,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "#cbd5e1",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              ?
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: THEME.muted, textAlign: "center" }}>
              Non assegnati
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: THEME.muted,
                background: "#fff",
                padding: "1px 6px",
                borderRadius: 99,
                border: `1px solid ${THEME.border}`,
              }}
            >
              {weekTotalByOp.get("_unassigned_") || 0} sed.
            </div>
          </div>
          {p.weekDays.map((d, di) => {
            const dKey = dayKey(d);
            const composite = `_unassigned_::${dKey}`;
            const cellEvents = eventsByOpDay.get(composite) || [];
            const isExpanded =
              expandedCell &&
              expandedCell.operatorKey === "_unassigned_" &&
              expandedCell.dayKey === dKey;
            const visible = isExpanded ? cellEvents : cellEvents.slice(0, VISIBLE_EVENTS_PER_CELL);
            const hidden = cellEvents.length - visible.length;
            return (
              <div
                key={di}
                style={{
                  padding: 4,
                  borderLeft: `1px solid ${THEME.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {visible.map(ev => (
                  <button
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onSelectEvent(ev);
                    }}
                    style={{
                      background: "#f1f5f9",
                      color: THEME.text,
                      border: "none",
                      borderLeft: `3px solid #cbd5e1`,
                      borderRadius: "0 4px 4px 0",
                      padding: "3px 6px",
                      fontSize: 11,
                      fontFamily: "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                    title={`${ev.patient_name} · ${fmtHHMM(ev.start)}`}
                  >
                    <span style={{ fontWeight: 700, color: THEME.muted, fontSize: 10 }}>
                      {fmtHHMM(ev.start)}
                    </span>
                    <span
                      style={{
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {lastNameOf(ev)}
                    </span>
                  </button>
                ))}
                {hidden > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedCell({ operatorKey: "_unassigned_", dayKey: dKey });
                    }}
                    style={{
                      background: "#fff",
                      color: THEME.muted,
                      border: `1px dashed ${THEME.border}`,
                      borderRadius: 4,
                      padding: "2px 6px",
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    + {hidden} altr{hidden === 1 ? "o" : "i"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════ Footer info layout ═══════ */}
      <div
        style={{
          padding: "8px 14px",
          background: THEME.panelSoft,
          borderTop: `1px solid ${THEME.border}`,
          fontSize: 10,
          color: THEME.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          Layout <strong>Timeline operatore</strong>. Click su cella vuota = nuovo appuntamento; click su evento = dettaglio. Cambia layout in Impostazioni → Team.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {memberRows.map(({ key, member }) => {
            const color = p.operatorColorMap.get(key) || "#94a3b8";
            return (
              <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                {member.display_name || "—"}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
