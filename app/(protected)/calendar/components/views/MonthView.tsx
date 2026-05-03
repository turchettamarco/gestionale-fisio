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
  type CalendarEvent,
} from "../../utils";
import type { MonthPopoverState } from "../popovers/MonthDayPopover";

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
};

export default function MonthView({
  monthDays, monthEvents, currentDate,
  monthClickTimer,
  onOpenCreateModal, onGoToDayView, onOpenMonthPopover,
  isSearchActive, searchMatchIds,
}: MonthViewProps) {

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
                minHeight: 130,
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

              {/* Lista eventi compatta */}
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {dayEvents.slice(0, 10).map((ev, i) => {
                  const isMatch = searchMatchIds.has(ev.id);
                  const isDimmed = isSearchActive && !isMatch;
                  return (
                    <div
                      key={i}
                      className={isMatch ? "search-highlight" : isDimmed ? "search-dimmed" : ""}
                      title={ev.is_group
                        ? `👥 ${ev.group_title || "Gruppo"} · ${(ev.participants?.length ?? 0)}/${ev.group_max_participants ?? 0} · ${fmtTime(ev.start.toISOString())}`
                        : `${ev.patient_name} · ${fmtTime(ev.start.toISOString())} – ${fmtTime(ev.end.toISOString())} · ${statusLabel(ev.status)}`}
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
                      }}
                    >
                      {ev.location === "domicile" && "🏠 "}
                      {ev.is_group ? (
                        <>
                          👥 {fmtTime(ev.start.toISOString())} {ev.group_title || "Gruppo"} ({(ev.participants?.length ?? 0)}/{ev.group_max_participants ?? 0})
                        </>
                      ) : (
                        <>
                          {fmtTime(ev.start.toISOString())} {ev.patient_name}
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
