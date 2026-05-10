// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/MonthView.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Vista MENSILE compatta del calendario.
//   • Header con etichette LUN-DOM (gradient teal-blue)
//   • Griglia 7×N celle (42 = 6 settimane × 7 giorni)
//   • Ogni cella mostra: numero giorno (cerchio blu se oggi), counter eventi,
//     fino a 10 righe compatte con orario + nome paziente
//   • Click su cella vuota → apre creazione nuovo appuntamento (con delay
//     280ms per distinguere dal doppio click)
//   • Doppio click su cella → vai a vista giorno
//   • Click su un singolo appuntamento (chip) → apre il MonthDayPopover
//   • Search active → evidenzia in giallo i match, attenua gli altri
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { type RefObject } from "react";
import {
  THEME, fmtTime, statusColor, statusLabel,
  getLocationCardStyle,
  type CalendarEvent,
} from "../../utils";
import type { MonthPopoverState } from "../popovers/MonthDayPopover";
import type { StudioMember } from "@/src/contexts/StudioContext";

const DAY_HEADERS = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];

export type MonthViewProps = {
  /** I 42 giorni della griglia (mese corrente + adiacenti) */
  monthDays: Date[];
  /** Map dayKey "YYYY-M-D" → eventi del giorno */
  monthEvents: Map<string, CalendarEvent[]>;
  /** Data corrente (per evidenziare il mese attivo) */
  currentDate: Date;
  /** Ref al timer per distinguere single vs double click */
  monthClickTimer: RefObject<ReturnType<typeof setTimeout> | null>;
  /** Apre creazione nuovo appuntamento per il giorno specificato */
  onOpenCreateModal: (date: Date) => void;
  /** Naviga a vista giorno per il giorno specificato */
  onGoToDayView: (date: Date) => void;
  /** Apre il popover del giorno (lista appuntamenti) */
  onOpenMonthPopover: (state: MonthPopoverState) => void;
  /** Search attiva (per dimming/highlight) */
  isSearchActive: boolean;
  /** Set degli id eventi che matchano la ricerca */
  searchMatchIds: Set<string>;
  /** Multi-sede (mig. 014, fase 3) */
  studioLocations?: Array<{ id: string; name: string; address: string | null; is_primary: boolean; border_color: string | null }>;
  /**
   * Multi-operatore (Fase 4c, mig. 022).
   * Quando true e members ha ≥2 elementi, ogni cella giorno mostra
   * micro-bar per operatore invece della lista appuntamenti standard.
   */
  multiOperatorMode?: boolean;
  /** Membri attivi del team (richiesto se multiOperatorMode = true) */
  members?: StudioMember[];
  /** Mappa operator_id → colore (chiave include "pending:..." per inviti) */
  operatorColorMap?: Map<string, string>;
  /**
   * Assenze/indisponibilità operatori (Fase 5, mig. 019).
   * Usate per mostrare un indicatore "ferie/malattia" nella cella del giorno.
   */
  unavailabilities?: Array<{
    id: string;
    operator_id: string;
    start_at: Date;
    end_at: Date;
    reason: string | null;
    all_day: boolean;
  }>;
  /** WhatsApp: invia promemoria al paziente (Fase C) */
  onSendReminder?: (eventId: string, phone?: string, firstName?: string) => void;
};

export default function MonthView({
  monthDays, monthEvents, currentDate,
  monthClickTimer,
  onOpenCreateModal, onGoToDayView, onOpenMonthPopover,
  isSearchActive, searchMatchIds,
  studioLocations,
  multiOperatorMode,
  members,
  operatorColorMap,
  unavailabilities,
  onSendReminder,
}: MonthViewProps) {
  // Decide se renderizzare in modalità multi-op (richiede ≥2 operatori).
  const isMultiOp = !!multiOperatorMode && !!members && members.length >= 2;

  // Helper memberKey (per operator_id matching coerente con altre viste)
  const memberKey = (m: StudioMember): string | null => {
    if (m.user_id) return m.user_id;
    if (m.invite_token) return `pending:${m.invite_token}`;
    return null;
  };

  // Helper: ritorna le assenze attive per un certo giorno (Fase 5)
  // L'assenza è "attiva" se il suo intervallo si sovrappone al giorno
  const absencesForDay = (day: Date): Array<{
    operator_id: string;
    reason: string | null;
    color: string;
    initial: string;
  }> => {
    if (!unavailabilities || unavailabilities.length === 0) return [];
    if (!members || members.length === 0) return [];
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const result: Array<{ operator_id: string; reason: string | null; color: string; initial: string }> = [];
    for (const u of unavailabilities) {
      // Sovrapposizione classica: !(end <= dayStart || start >= dayEnd)
      if (u.end_at <= dayStart || u.start_at >= dayEnd) continue;
      // Trova il membro per colore + iniziale
      const m = members.find(mm => mm.user_id === u.operator_id);
      if (!m) continue;
      const color = m.display_color || "#94a3b8";
      const initial = (m.signature_short || m.display_name || "?").charAt(0).toUpperCase();
      result.push({ operator_id: u.operator_id, reason: u.reason, color, initial });
    }
    return result;
  };

  return (
    <div style={{
      background: THEME.panelBg,
      border: `2px solid ${THEME.border}`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(30,64,175,0.06)",
    }}>
      {/* Header giorni della settimana */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        background: "linear-gradient(135deg, #0d9488, #2563eb)",
        borderRadius: "10px 10px 0 0",
      }}>
        {DAY_HEADERS.map(d => (
          <div key={d} style={{
            padding: "8px 4px",
            textAlign: "center",
            fontSize: 10,
            fontWeight: 700,
            color: "rgba(255,255,255,0.8)",
            letterSpacing: 1,
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Griglia mese */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {monthDays.map((day, idx) => {
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const today = new Date();
          const isToday =
            day.getDate() === today.getDate() &&
            day.getMonth() === today.getMonth() &&
            day.getFullYear() === today.getFullYear();
          const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dayEvents = monthEvents.get(dayKey) || [];
          const isSunday = day.getDay() === 0;

          return (
            <div
              key={idx}
              data-month-cell="true"
              onClick={() => {
                // Single click = crea appuntamento (delay per distinguere dal doppio click)
                if (monthClickTimer.current) clearTimeout(monthClickTimer.current);
                monthClickTimer.current = setTimeout(() => {
                  monthClickTimer.current = null;
                  onOpenCreateModal(day);
                }, 280);
              }}
              onDoubleClick={() => {
                // Doppio click = vai a vista giorno
                if (monthClickTimer.current) {
                  clearTimeout(monthClickTimer.current);
                  monthClickTimer.current = null;
                }
                onGoToDayView(day);
              }}
              style={{
                // In multi-op le celle crescono dinamicamente con il numero
                // di appuntamenti. minHeight più alto per leggibilità (variante A).
                minHeight: isMultiOp ? 160 : 130,
                padding: "3px 4px",
                borderRight: `1px solid ${THEME.borderSoft}`,
                borderBottom: `1px solid ${THEME.borderSoft}`,
                background: isToday
                  ? "rgba(37,99,235,0.06)"
                  : isSunday
                    ? "rgba(107,114,128,0.04)"
                    : "transparent",
                cursor: "pointer",
                opacity: isCurrentMonth ? 1 : 0.35,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = "rgba(37,99,235,0.04)"; }}
              onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = isSunday ? "rgba(107,114,128,0.04)" : "transparent"; }}
            >
              {/* Header riga numero giorno + counter */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 2,
                lineHeight: 1,
              }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: isToday ? 800 : 600,
                  color: isToday ? "#fff" : isSunday ? THEME.muted : THEME.text,
                  ...(isToday ? {
                    background: THEME.blue,
                    borderRadius: "50%",
                    width: 20,
                    height: 20,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  } : {}),
                }}>
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: THEME.muted }}>
                    {dayEvents.length}
                  </span>
                )}
              </div>

              {/* ── Indicatore assenze operatori (Fase 5) ─────────────────────
                  Visibile solo in multi-op: pallini colorati con iniziale per
                  ogni operatore in ferie/malattia/permesso quel giorno. */}
              {isMultiOp && (() => {
                const absences = absencesForDay(day);
                if (absences.length === 0) return null;
                return (
                  <div
                    style={{
                      display: "flex",
                      gap: 2,
                      flexWrap: "wrap",
                      marginBottom: 3,
                      padding: "2px 4px",
                      background: "rgba(245,158,11,0.08)",
                      border: "1px solid rgba(245,158,11,0.25)",
                      borderRadius: 4,
                    }}
                    title={absences.map(a => a.reason || "Indisponibile").join(", ")}
                  >
                    {absences.map((a, i) => (
                      <span
                        key={i}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 2,
                          fontSize: 8,
                          fontWeight: 700,
                          color: a.color,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: a.color,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ color: "#92400e" }}>{a.initial}</span>
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* Lista eventi compatta (con branching multi-op, Fase 4c) */}
              {isMultiOp ? (
                // ━━━ MULTI-OP: lista verticale Variante A (Fase 5b) ━━━
                // Tutti gli appuntamenti del giorno in righe colorate per
                // operatore. NON cliccabili (sola visualizzazione: per
                // dettaglio passare alle viste Day/Week). La cella cresce
                // dinamicamente in altezza con il numero di appuntamenti.
                (() => {
                  // Ordina cronologicamente
                  const sortedEvents = [...dayEvents].sort(
                    (a, b) => a.start.getTime() - b.start.getTime()
                  );

                  // Helper: cognome + nome (full)
                  const fullNameOf = (ev: typeof sortedEvents[number]): string => {
                    const last = (ev.patient_last_name || "").trim();
                    const first = (ev.patient_first_name || "").trim();
                    if (last && first) return `${last} ${first}`;
                    if (last) return last;
                    if (first) return first;
                    return ev.patient_name || "—";
                  };

                  // Helper: orario sempre HH:MM (zero-padded)
                  const fmtHHMM = (d: Date): string => {
                    const h = d.getHours().toString().padStart(2, "0");
                    const m = d.getMinutes().toString().padStart(2, "0");
                    return `${h}:${m}`;
                  };

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                      {sortedEvents.map((ev) => {
                        const opKey = ev.operator_id || "_unassigned_";
                        const color = operatorColorMap?.get(opKey) || "#94a3b8";
                        const waSent = !!ev.whatsapp_sent_at;
                        const canShowWA = onSendReminder && ev.status !== "cancelled" && ev.patient_phone;
                        return (
                          <div
                            key={ev.id}
                            className="month-evt-row"
                            title={`${ev.patient_name} · ${fmtHHMM(ev.start)}`}
                            style={{
                              fontSize: 9,
                              lineHeight: 1.25,
                              padding: "2px 5px",
                              borderLeft: `2px solid ${color}`,
                              background: `${color}1f`,
                              borderRadius: 3,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              color: THEME.text,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              position: "relative",
                            }}
                          >
                            <span style={{ fontWeight: 800, color: THEME.text, flexShrink: 0 }}>
                              {fmtHHMM(ev.start)}
                            </span>
                            <span style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}>
                              {fullNameOf(ev)}
                            </span>
                            {canShowWA && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSendReminder!(ev.id, ev.patient_phone ?? undefined, ev.patient_first_name ?? undefined);
                                }}
                                title={waSent ? "WhatsApp già inviato" : "Invia WhatsApp"}
                                className="month-evt-wa"
                                style={{
                                  fontSize: 9,
                                  flexShrink: 0,
                                  cursor: "pointer",
                                  opacity: waSent ? 0.4 : 0,
                                  transition: "opacity 0.12s",
                                  padding: "0 2px",
                                  // Visibile sempre se già inviato (✓), altrimenti solo on hover
                                }}
                              >
                                {waSent ? "✓" : "💬"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : (
                // ━━━ SINGLE-OP: lista classica chip ora+nome ━━━
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {dayEvents.slice(0, 10).map((ev, i) => {
                  const isMatch = searchMatchIds.has(ev.id);
                  const isDimmed = isSearchActive && !isMatch;
                  // Multi-sede (mig. 014, fase 3)
                  const locStyle = getLocationCardStyle(ev, studioLocations);
                  return (
                    <div
                      key={i}
                      className={isMatch ? "search-highlight" : isDimmed ? "search-dimmed" : ""}
                      title={(ev.is_group
                        ? `👥 ${ev.group_title || "Gruppo"} · ${(ev.participants?.length ?? 0)}/${ev.group_max_participants ?? 0} · ${fmtTime(ev.start.toISOString())}`
                        : `${ev.patient_name} · ${fmtTime(ev.start.toISOString())} – ${fmtTime(ev.end.toISOString())} · ${statusLabel(ev.status)}`)
                        + (locStyle.locationName && !locStyle.borderColor ? "" : (locStyle.locationName ? ` · ${locStyle.locationName}` : ""))}
                      onClick={e => {
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        onOpenMonthPopover({
                          day,
                          events: dayEvents,
                          x: rect.right + 8,
                          y: rect.top,
                        });
                      }}
                      style={{
                        fontSize: isMatch ? 9.5 : 8.5,
                        fontWeight: isMatch ? 800 : 700,
                        color: isMatch ? "#92400e" : "#fff",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        padding: "2px 4px",
                        borderRadius: 3,
                        background: isMatch ? "rgba(245,158,11,0.35)" : ev.is_group ? "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)" : statusColor(ev.status),
                        lineHeight: 1.3,
                        position: "relative",
                        zIndex: isMatch ? 5 : 0,
                        cursor: "pointer",
                        // Multi-sede: bordo colorato per sedi secondarie
                        border: locStyle.borderColor ? `1.5px solid ${locStyle.borderColor}` : "none",
                      }}
                    >
                      {ev.location === "domicile" && "🏠 "}
                      {locStyle.initials && (
                        <span style={{
                          background: locStyle.borderColor ?? undefined,
                          color: "#fff",
                          fontSize: 7, fontWeight: 800,
                          padding: "0 3px",
                          borderRadius: 2,
                          marginRight: 3,
                          letterSpacing: 0.3,
                          display: "inline-block",
                          verticalAlign: "middle",
                        }}>{locStyle.initials}</span>
                      )}
                      {ev.is_group ? (
                        <>
                          👥 {fmtTime(ev.start.toISOString())} {ev.group_title || "Gruppo"} ({(ev.participants?.length ?? 0)}/{ev.group_max_participants ?? 0})
                        </>
                      ) : (
                        <>
                          {fmtTime(ev.start.toISOString())}{" "}
                          {ev.package_id && <span title="Scala da pacchetto" style={{ marginRight: 2 }}>📦</span>}
                          {ev.patient_name}
                        </>
                      )}
                    </div>
                  );
                })}
                {dayEvents.length > 10 && (
                  <span style={{ fontSize: 8, fontWeight: 700, color: THEME.muted, paddingLeft: 3 }}>
                    +{dayEvents.length - 10}
                  </span>
                )}
              </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hint footer */}
      <div style={{
        padding: "8px 12px",
        fontSize: 11,
        fontWeight: 600,
        color: THEME.muted,
        borderTop: `1px solid ${THEME.borderSoft}`,
        display: "flex",
        justifyContent: "center",
        gap: 16,
      }}>
        <span>Click = nuovo appuntamento</span>
        <span>•</span>
        <span>Doppio click = vista giorno</span>
      </div>
    </div>
  );
}
