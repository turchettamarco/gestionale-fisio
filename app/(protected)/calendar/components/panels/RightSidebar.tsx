// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/panels/RightSidebar.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Sidebar destra (overlay su mobile, in-page su desktop) con due sezioni:
//   1. Mini-calendario navigazione (mese corrente con punti per i giorni
//      che hanno appuntamenti, evidenziazione settimana selezionata in
//      vista week).
//   2. Lista "Prossimi" — appuntamenti di oggi che non sono ancora
//      terminati, con badge "IN CORSO" / "PROSSIMO" e checkbox per
//      segnare eseguito.
//
// Il page.tsx mantiene gli stati e passa callback. Il "selezione evento"
// chiama onSelectEvent — il page.tsx fa il setup completo dello stato di
// modifica (selectedEvent, editStatus, editNote, editAmount, ...).
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { type RefObject } from "react";
import {
  THEME, fmtTime, statusBg, statusColor,
  startOfISOWeekMonday, toDateInputValue,
  type CalendarEvent,
} from "../../utils";
import StatusBadge from "@/src/components/StatusBadge";

export type RightSidebarProps = {
  /** Larghezza in px del pannello (es. 300) */
  width: number;
  /** Aperto / chiuso (driving della transizione) */
  open: boolean;
  /** Indica se il viewport è desktop (no overlay) */
  isDesktop: boolean;
  /** Ref per click-outside detection nel parent */
  sidebarRef: RefObject<HTMLDivElement | null>;
  /** Click overlay → chiude */
  onClose: () => void;

  /** Data corrente del calendario (per mini-cal e selezione) */
  currentDate: Date;
  setCurrentDate: (d: Date | ((prev: Date) => Date)) => void;

  /** Vista corrente — usata per evidenziare la settimana nel mini-cal */
  viewType: "week" | "day" | "month";

  /** Tutti gli eventi caricati (per i puntini sul mini-cal) */
  events: CalendarEvent[];

  /** Appuntamenti del giorno (per la sezione "Prossimi") */
  todaysAppointments: CalendarEvent[];

  /** Tempo corrente (rinfrescato dal parent) */
  currentTime: Date;

  /** "Mostra tutti" / "Mostra meno" */
  showAllUpcoming: boolean;
  setShowAllUpcoming: (v: boolean) => void;

  /** Stima incasso settimanale (mostrata nel footer) */
  weeklyExpectedRevenue: number;

  /** Click su un appuntamento → apre il modale di modifica */
  onSelectEvent: (event: CalendarEvent) => void;

  /** Toggle eseguito rapido */
  onToggleDone: (eventId: string, currentStatus: CalendarEvent["status"]) => void;
};

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const GG   = ["L", "M", "M", "G", "V", "S", "D"];

export default function RightSidebar({
  width, open, isDesktop, sidebarRef, onClose,
  currentDate, setCurrentDate, viewType,
  events, todaysAppointments, currentTime,
  showAllUpcoming, setShowAllUpcoming,
  weeklyExpectedRevenue,
  onSelectEvent, onToggleDone,
}: RightSidebarProps) {

  // ─── Mini-calendario ──────────────────────────────────────────────
  const mc = currentDate;
  const year = mc.getFullYear();
  const month = mc.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Lun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // ─── Upcoming ─────────────────────────────────────────────────────
  const now = currentTime || new Date();
  const upcomingAll = todaysAppointments
    .filter(a => a.end > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const nextFuture = upcomingAll.find(a => a.start > now) || null;
  const list = showAllUpcoming ? upcomingAll : upcomingAll.slice(0, 5);
  const remaining = Math.max(0, upcomingAll.length - 5);

  const timeStyle = (status: "past" | "current" | "next") => ({
    fontSize: 12,
    fontWeight: 600 as const,
    padding: "3px 6px",
    borderRadius: 6,
    minWidth: 52,
    textAlign: "center" as const,
    border:
      status === "current"
        ? `2px solid ${THEME.green}`
        : status === "next"
          ? `2px solid ${THEME.blue}`
          : `1px solid ${THEME.border}`,
    color:
      status === "current"
        ? THEME.green
        : status === "next"
          ? THEME.blue
          : THEME.muted,
    background:
      status === "current"
        ? "rgba(22,163,74,0.06)"
        : status === "next"
          ? "rgba(37,99,235,0.06)"
          : THEME.panelSoft,
  });

  return (
    <>
      {/* Overlay (solo non-desktop quando aperto) */}
      {open && !isDesktop && (
        <div
          className="no-print"
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(30,64,175,0.4)", zIndex: 40, backdropFilter: "blur(2px)" }}
        />
      )}

      <aside
        ref={sidebarRef}
        className={`no-print sidebar-scroll cal-sidebar ${showAllUpcoming ? "show-scrollbar" : ""}`}
        style={{
          width, maxWidth: "85vw",
          background: THEME.panelBg, borderLeft: `2px solid ${THEME.border}`,
          padding: "24px 18px",
          position: "fixed", right: 0, top: 58, height: "calc(100vh - 58px)",
          overflowY: "auto", zIndex: 50,
          transform: open ? "translateX(0)" : "translateX(110%)",
          transition: "transform 280ms cubic-bezier(.4,0,.2,1)",
          pointerEvents: open ? "auto" : "none",
          boxShadow: open ? "-8px 0 32px rgba(30,64,175,0.1)" : "none",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: THEME.blue, letterSpacing: 0.5, textTransform: "uppercase" }}>Oggi</div>
          <button type="button" onClick={onClose}
            style={{ border: "none", background: THEME.panelSoft, cursor: "pointer", color: THEME.text, fontSize: 16, padding: "4px 8px", borderRadius: 6, fontWeight: 700 }}>×</button>
        </div>

        {/* ── Mini-calendario ─────────────────────────────────────── */}
        <div style={{ marginBottom: 20, background: THEME.panelSoft, borderRadius: 10, border: `1.5px solid ${THEME.border}`, padding: "12px 10px" }}>
          {/* Header mese */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button onClick={() => setCurrentDate(d => { const x = new Date(d); x.setMonth(x.getMonth() - 1); return x; })}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: THEME.muted, padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>◀</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: THEME.text }}>{MESI[month]} {year}</span>
            <button onClick={() => setCurrentDate(d => { const x = new Date(d); x.setMonth(x.getMonth() + 1); return x; })}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: THEME.muted, padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>▶</button>
          </div>

          {/* Intestazioni giorni */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
            {GG.map((g, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: i >= 5 ? THEME.amber : THEME.muted, padding: "2px 0" }}>{g}</div>
            ))}
          </div>

          {/* Celle */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1 }}>
            {cells.map((day, idx) => {
              if (day === null) return <div key={`mc-e-${idx}`} />;
              const cellDate = new Date(year, month, day); cellDate.setHours(0, 0, 0, 0);
              const isToday = cellDate.getTime() === todayD.getTime();
              // Evidenzia i giorni della settimana corrente in vista week
              const weekStart = startOfISOWeekMonday(currentDate); weekStart.setHours(0, 0, 0, 0);
              const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 5); weekEnd.setHours(23, 59, 59, 999);
              const inWeek = viewType === "week" && cellDate >= weekStart && cellDate <= weekEnd;
              const isSelected = toDateInputValue(currentDate) === toDateInputValue(cellDate);

              const hasDomicile = events.some(ev => {
                const ed = new Date(ev.start); ed.setHours(0, 0, 0, 0);
                return ed.getTime() === cellDate.getTime() && ev.location === "domicile" && ev.status !== "cancelled";
              });
              const hasEvents = events.some(ev => {
                const ed = new Date(ev.start); ed.setHours(0, 0, 0, 0);
                return ed.getTime() === cellDate.getTime() && ev.status !== "cancelled";
              });

              return (
                <div
                  key={`mc-${idx}`}
                  onClick={() => setCurrentDate(cellDate)}
                  style={{
                    textAlign: "center", fontSize: 10, fontWeight: isToday || isSelected ? 800 : 500,
                    padding: "3px 1px", borderRadius: 5, cursor: "pointer", position: "relative",
                    background: isToday ? THEME.blue : isSelected && !isToday ? "rgba(37,99,235,0.12)" : inWeek ? "rgba(37,99,235,0.06)" : "transparent",
                    color: isToday ? "#fff" : (idx % 7 === 6) ? THEME.amber : THEME.text,
                    border: isSelected && !isToday ? `1.5px solid ${THEME.blue}` : "1.5px solid transparent",
                  }}
                >
                  {day}
                  {hasEvents && !isToday && (
                    <div style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 1 }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: hasDomicile ? THEME.amber : THEME.patientsAccent }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={() => setCurrentDate(new Date())}
            style={{ marginTop: 8, width: "100%", padding: "5px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "transparent", color: THEME.blue, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            Torna a oggi
          </button>
        </div>

        {/* ── Sezione Appuntamenti Imminenti ─────────────────────── */}
        <div style={{ marginTop: 0, borderTop: `2px solid ${THEME.blue}`, paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Prossimi
            </div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "#fff",
              background: "linear-gradient(135deg, #0d9488, #2563eb)",
              padding: "4px 10px", borderRadius: 6,
            }}>
              {upcomingAll.length}
            </div>
          </div>

          {upcomingAll.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "20px 12px",
              background: THEME.panelSoft, borderRadius: 8,
              border: `1.5px solid ${THEME.border}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: THEME.muted, marginBottom: 4 }}>
                Nessun appuntamento imminente
              </div>
              <div style={{ fontSize: 11, color: THEME.muted }}>
                Oggi non ci sono altri appuntamenti in arrivo
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: showAllUpcoming ? "520px" : "none", overflowY: showAllUpcoming ? "auto" : "hidden" }}>
                {list.map(appointment => {
                  const isNow  = appointment.start <= now && appointment.end >= now;
                  const isNext = !isNow && nextFuture && nextFuture.id === appointment.id;

                  return (
                    <div
                      key={appointment.id}
                      style={{
                        background: isNow ? "rgba(43, 108, 176, 0.08)" : statusBg(appointment.status),
                        border: `2px solid ${isNow ? THEME.blue : statusColor(appointment.status)}50`,
                        borderRadius: 8, padding: 10,
                        cursor: "pointer", transition: "all 0.2s",
                        position: "relative", overflow: "visible",
                      }}
                      onClick={() => onSelectEvent(appointment)}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 4px 12px rgba(37,99,235,0.12)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      <div style={{
                        position: "absolute", top: 0, left: 0,
                        width: 6, height: "100%",
                        borderRadius: "8px 0 0 8px",
                        background: statusColor(appointment.status),
                      }} />

                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginLeft: 4 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <div style={timeStyle(isNow ? "current" : isNext ? "next" : "past")}>
                              {fmtTime(appointment.start.toISOString())}
                            </div>
                            {isNow && (
                              <div style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: THEME.green, padding: "2px 6px", borderRadius: 4 }}>
                                IN CORSO
                              </div>
                            )}
                            {isNext && (
                              <div style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: THEME.blue, padding: "2px 6px", borderRadius: 4 }}>
                                PROSSIMO
                              </div>
                            )}
                          </div>

                          <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text, lineHeight: 1.35, marginBottom: 4 }}>
                            {appointment.patient_name}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <StatusBadge status={appointment.status} size="sm" />
                            {appointment.location === "domicile" && (
                              <div style={{ fontSize: 10, fontWeight: 600, color: THEME.amber, display: "flex", alignItems: "center", gap: 2 }}>
                                ⌂ Domicilio
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onToggleDone(appointment.id, appointment.status);
                          }}
                          title={appointment.status === "done" ? "Segna come non eseguito" : "Segna come eseguito"}
                          style={{
                            width: 20, height: 20, borderRadius: 4,
                            border: `2px solid ${appointment.status === "done" ? THEME.greenDark : THEME.border}`,
                            background: appointment.status === "done" ? THEME.greenDark : "transparent",
                            cursor: "pointer", flex: "0 0 auto",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: "#fff",
                          }}
                        >
                          {appointment.status === "done" && "✓"}
                        </button>
                      </div>

                      {appointment.calendar_note && (
                        <div style={{ marginTop: 8, fontSize: 11, color: THEME.muted, fontStyle: "italic", paddingLeft: 4, borderLeft: `2px solid ${THEME.borderSoft}` }}>
                          {appointment.calendar_note}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {remaining > 0 && !showAllUpcoming && (
                <button
                  type="button"
                  onClick={() => setShowAllUpcoming(true)}
                  title="Mostra tutti gli appuntamenti imminenti di oggi"
                  style={{
                    marginTop: 12, width: "100%",
                    border: `1.5px solid ${THEME.border}`,
                    background: THEME.panelBg, borderRadius: 8,
                    padding: "8px 10px", cursor: "pointer",
                    fontSize: 12, fontWeight: 600, color: THEME.blue, textAlign: "center",
                  }}
                >
                  +{remaining} altri oggi
                </button>
              )}

              {showAllUpcoming && upcomingAll.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllUpcoming(false)}
                  title="Mostra solo i primi 5"
                  style={{
                    marginTop: 12, width: "100%",
                    border: `1.5px solid ${THEME.border}`,
                    background: THEME.panelSoft, borderRadius: 8,
                    padding: "8px 10px", cursor: "pointer",
                    fontSize: 12, fontWeight: 600, color: THEME.muted, textAlign: "center",
                  }}
                >
                  Mostra meno
                </button>
              )}

              <div style={{ marginTop: 16, fontSize: 11, color: THEME.muted, textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Completati: {todaysAppointments.filter(a => a.status === "done").length}</span>
                  <span>Prenotati: € {Math.round(weeklyExpectedRevenue).toLocaleString("it-IT")}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
