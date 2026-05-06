// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/WeekView.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Vista SETTIMANALE: griglia 6 giorni × 12 ore con slot di 30 minuti.
//
// Composizione:
//   • Header sticky gradient teal-blue: colonna ORA + 6 colonne giorni
//     (LUN-SAB) con etichetta giorno, data, badge occupancy (BASSA/
//     MEDIA/ALTA) e indicatore "⌂ domicilio" se presente.
//   • Body con slot orari (height 60px ciascuno, 2 sub-slot 30 min).
//     Click su slot vuoto = crea, drag-over = bordo dashed blu, drop =
//     sposta evento, right-click = quick actions menu.
//   • Eventi posizionati assoluti: layout a 3 righe (orario + 3 micro-
//     bottoni paga/WA/done | nome paziente | tipo+importo + status badge).
//     Sotto i 38px → layout inline (solo nome).
//   • Drag ghost preview: rettangolo dashed blu durante il trascinamento
//     che mostra l'orario di destinazione.
//   • Finestre libere (showAvailableOnly): rettangoli verde tenue con
//     etichetta orario + durata.
//   • Linea "now" rossa sul giorno corrente (se la settimana lo include).
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  THEME, fmtTime, formatDMY, pad2, statusBg, statusLabel,
  autoNameFontSize,
  assignLanes,
  getLocationCardStyle,
  type CalendarEvent,
} from "../../utils";
import type { DraggingOverState, FreeWindow } from "./DayTimeline";
import PaidIconButton from "@/src/components/PaidIconButton";
import type { PaymentMethod } from "@/src/components/PaidPopover";
import GroupEventCard from "./GroupEventCard";

const WEEK_PX_PER_MIN = 1;

/**
 * Versione abbreviata di statusLabel — usata nelle card 45min (vista MEDIUM)
 * dove lo spazio orizzontale è ristretto. La versione lunga resta in statusLabel
 * e si usa nelle card ≥60min.
 */
function statusShortLabel(s: CalendarEvent["status"]): string {
  switch (s) {
    case "booked":    return "Pren.";
    case "confirmed": return "Conf.";
    case "done":      return "Eseg.";
    case "cancelled": return "Ann.";
    case "not_paid":  return "N.pag.";
    default:          return statusLabel(s);
  }
}

export type DraggingEventState = {
  id: string;
  originalStart: Date;
  originalEnd: Date;
};

export type AvailabilityForecast = {
  totalEvents: number;
  occupancyRate: number;
};

export type WeekViewProps = {
  // ─── Dati base ─────────────────────────────────────────────
  weekDays: Date[];
  filteredEvents: CalendarEvent[];
  currentTime: Date;

  timeSlots: string[];
  dayLabels: { dow: number; label: string }[];
  TIME_COL: number;
  /**
   * Ora di inizio della griglia (default 7).
   * Usata per calcolare la posizione Y della linea "ora corrente"
   * coerentemente con il gridHourRange dinamico.
   */
  gridStartHour?: number;

  // ─── Multi-sede (mig. 014, fase 3) ─────────────────────────
  studioLocations?: Array<{ id: string; name: string; address: string | null; is_primary: boolean; border_color: string | null }>;

  // ─── Drag-drop state ──────────────────────────────────────
  draggingEvent: DraggingEventState | null;
  draggingOver: DraggingOverState | null;

  // ─── UI flag ──────────────────────────────────────────────
  showAvailableOnly: boolean;
  bulkMode: boolean;
  bulkSelected: Set<string>;
  isSearchActive: boolean;
  searchMatchIds: Set<string>;

  // ─── Helper passati dal parent ────────────────────────────
  /** Posizione assoluta (top + height in px) di un evento */
  getEventPosition: (start: Date, end: Date) => { top: number; height: number };
  /** Restituisce le finestre libere del giorno */
  getFreeWindows: (day: Date) => FreeWindow[];
  /** Restituisce il colore di un evento */
  getEventColor: (event: CalendarEvent) => string;
  /** Stats di occupazione del giorno (per badge ALTA/MEDIA/BASSA) */
  getAvailabilityForecast: (day: Date) => AvailabilityForecast;

  // ─── Callback delegati al page.tsx ─────────────────────────
  onSlotClick: (date: Date, hour: number, minute: number) => void;
  onContextMenu: (e: React.MouseEvent, event?: CalendarEvent) => void;
  onDragStart: (e: React.DragEvent, eventId: string, originalStart: Date, originalEnd: Date) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent, dayIndex: number, hour: number, minute: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetDate: Date, targetHour: number, targetMinute: number) => void;

  /** Hover prolungato → tooltip mini-scheda */
  onEventHover: (e: React.MouseEvent, event: CalendarEvent) => void;
  onEventHoverEnd: () => void;

  /** Click su evento → apre modale (page fa setup completo) */
  onSelectEvent: (event: CalendarEvent) => void;
  onToggleBulkSelect: (eventId: string) => void;
  onToggleDone: (eventId: string, currentStatus: CalendarEvent["status"]) => void;
  onTogglePaid: (eventId: string, currentlyPaid: boolean) => void;
  /**
   * Nuovo handler completo per modificare il pagamento (metodo + data).
   * Se presente, sostituisce onTogglePaid sui bottoni pagamento.
   */
  onUpdatePayment?: (
    eventId: string,
    next: {
      is_paid: boolean;
      paid_at: string | null;
      payment_method: PaymentMethod | null;
    }
  ) => Promise<void> | void;
  onSendReminder: (eventId: string, phone?: string, firstName?: string) => void;
};

export default function WeekView({
  weekDays, filteredEvents, currentTime,
  timeSlots, dayLabels, TIME_COL,
  gridStartHour = 7,
  studioLocations,
  draggingEvent, draggingOver,
  showAvailableOnly, bulkMode, bulkSelected, isSearchActive, searchMatchIds,
  getEventPosition, getFreeWindows, getEventColor, getAvailabilityForecast,
  onSlotClick, onContextMenu,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  onEventHover, onEventHoverEnd,
  onSelectEvent, onToggleBulkSelect,
  onToggleDone, onTogglePaid, onUpdatePayment, onSendReminder,
}: WeekViewProps) {
  // ─── Note: la variabile non è usata direttamente ma mantenuta nelle props
  //     per future estensioni (es. bordo evento basato su getEventColor)
  void getEventColor;

  return (
    <div style={{
      background: THEME.panelBg,
      border: `2px solid ${THEME.border}`,
      borderRadius: 12,
      minHeight: 600,
      overflow: "clip",
      boxShadow: "0 2px 12px rgba(30,64,175,0.06)",
      position: "relative",
    }}>
      {/* ─── HEADER: ora + 6 giorni con forecast ─────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `${TIME_COL}px repeat(6, minmax(0, 1fr))`,
        borderBottom: `2px solid ${THEME.border}`,
        background: "linear-gradient(135deg, #0d9488, #2563eb)",
        position: "sticky",
        top: 0,
        zIndex: 8,
        borderRadius: "10px 10px 0 0",
      }}>
        <div style={{
          padding: "12px 8px",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,0.7)",
          textAlign: "center",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}>
          ORA
        </div>

        {weekDays.map((day, index) => {
          const forecast = getAvailabilityForecast(day);
          const occupLabel = forecast.occupancyRate > 40 ? "ALTA" : forecast.occupancyRate > 20 ? "MEDIA" : "BASSA";
          const occupColor = forecast.occupancyRate > 40 ? "#fecaca" : forecast.occupancyRate > 20 ? "#fef3c7" : "#bbf7d0";
          const hasDomicile = filteredEvents.some(ev => {
            const evDate = new Date(ev.start); evDate.setHours(0, 0, 0, 0);
            const colDate = new Date(day); colDate.setHours(0, 0, 0, 0);
            return evDate.getTime() === colDate.getTime() && ev.location === "domicile";
          });

          return (
            <div
              key={index}
              style={{
                padding: "8px 4px",
                borderRight: index < 5 ? "1px solid rgba(255,255,255,0.12)" : "none",
                textAlign: "center",
                fontSize: 13,
                fontWeight: 800,
                color: "#ffffff",
                boxSizing: "border-box",
                width: "100%",
                overflow: "visible",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minHeight: "60px",
              }}
            >
              <div style={{ marginBottom: 2, letterSpacing: 1 }}>
                {dayLabels[index].label}
              </div>
              <div style={{ fontSize: 11, marginBottom: 4, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
                {formatDMY(day)}
              </div>
              <div style={{
                fontSize: 10,
                fontWeight: 700,
                color: occupColor,
                lineHeight: 1.2,
                padding: "3px 8px",
                background: "rgba(255,255,255,0.12)",
                borderRadius: 4,
                margin: "0 4px",
                letterSpacing: 0.3,
              }}>
                {forecast.totalEvents} appt • {occupLabel}
              </div>
              {hasDomicile && (
                <div style={{ fontSize: 9, fontWeight: 700, color: "#fed7aa", marginTop: 2, letterSpacing: 0.3 }}>
                  ⌂ domicilio
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── BODY: timeline orari × giorni ─────────────────────── */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "relative", minHeight: "calc(15 * 60px)" }}>

          {/* Slot rows */}
          {timeSlots.map((time, timeIndex) => (
            <div
              key={timeIndex}
              style={{
                height: "60px",
                borderBottom: `1.5px solid ${THEME.border}`,
                position: "relative",
                display: "flex",
              }}
            >
              {/* Colonna ora sticky */}
              <div style={{
                width: `${TIME_COL}px`,
                height: "100%",
                display: "flex",
                alignItems: "center",
                paddingLeft: 8,
                borderRight: `1px solid ${THEME.border}`,
                fontSize: 12,
                fontWeight: 600,
                color: THEME.muted,
                background: THEME.panelSoft,
                zIndex: 1,
                flexShrink: 0,
                boxSizing: "border-box",
                position: "sticky",
                left: 0,
              }}>
                {time}
              </div>

              {/* 6 colonne giorno con sub-slot */}
              {weekDays.map((day, dayIndex) => {
                const hour = parseInt(time.split(":")[0]);

                return (
                  <div
                    key={`${timeIndex}-${dayIndex}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: "100%",
                      borderRight: dayIndex < 5 ? `1px solid ${THEME.border}` : "none",
                      boxSizing: "border-box",
                      position: "relative",
                    }}
                  >
                    {/* Slot 00–30 min */}
                    <div
                      style={{
                        height: "30px",
                        borderBottom: `1.5px solid ${THEME.border}`,
                        cursor: "pointer",
                        boxSizing: "border-box",
                        position: "relative",
                      }}
                      title={`Clicca per creare appuntamento alle ${pad2(hour)}:00`}
                      onClick={() => onSlotClick(day, hour, 0)}
                      onContextMenu={onContextMenu}
                      onDragOver={e => onDragOver(e, dayIndex, hour, 0)}
                      onDragLeave={onDragLeave}
                      onDrop={e => onDrop(e, day, hour, 0)}
                    >
                      {draggingOver && draggingOver.dayIndex === dayIndex &&
                       draggingOver.hour === hour && draggingOver.minute === 0 && (
                        <div style={{
                          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                          border: `2px dashed ${THEME.blue}`,
                          background: "rgba(91,130,168,0.1)",
                          zIndex: 1, pointerEvents: "none",
                        }} />
                      )}
                    </div>

                    {/* Slot 30–60 min */}
                    <div
                      style={{
                        height: "30px",
                        cursor: "pointer",
                        boxSizing: "border-box",
                        position: "relative",
                      }}
                      title={`Clicca per creare appuntamento alle ${pad2(hour)}:30`}
                      onClick={() => onSlotClick(day, hour, 30)}
                      onContextMenu={onContextMenu}
                      onDragOver={e => onDragOver(e, dayIndex, hour, 30)}
                      onDragLeave={onDragLeave}
                      onDrop={e => onDrop(e, day, hour, 30)}
                    >
                      {draggingOver && draggingOver.dayIndex === dayIndex &&
                       draggingOver.hour === hour && draggingOver.minute === 30 && (
                        <div style={{
                          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                          border: `2px dashed ${THEME.blue}`,
                          background: "rgba(91,130,168,0.1)",
                          zIndex: 1, pointerEvents: "none",
                        }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* ─── Drag ghost preview ─────────────────────────── */}
          {draggingEvent && draggingOver && (() => {
            // Calcolo top usando getEventPosition (rispetta gridHourRange dinamico)
            const fakeDay = weekDays[draggingOver.dayIndex] ?? weekDays[0];
            const ghostStart = new Date(fakeDay);
            ghostStart.setHours(draggingOver.hour, draggingOver.minute, 0, 0);
            const ghostDuration = draggingEvent.originalEnd.getTime() - draggingEvent.originalStart.getTime();
            const ghostEnd = new Date(ghostStart.getTime() + ghostDuration);
            const { top: ghostTop, height: ghostHeight } = getEventPosition(ghostStart, ghostEnd);
            return (
              <div style={{
                position: "absolute",
                left: `calc(${TIME_COL}px + ${draggingOver.dayIndex} * calc((100% - ${TIME_COL}px) / 6) + 2px)`,
                top: `${ghostTop}px`,
                width: `calc((100% - ${TIME_COL}px) / 6 - 8px)`,
                height: `${Math.max(ghostHeight, 28)}px`,
                background: "rgba(37,99,235,0.12)",
                border: `2px dashed ${THEME.blue}`,
                borderRadius: 8,
                zIndex: 5,
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: THEME.blue,
                transition: "top 0.1s ease, left 0.1s ease",
              }}>
                {`${pad2(draggingOver.hour)}:${pad2(draggingOver.minute)}`}
              </div>
            );
          })()}

          {/* ─── Eventi posizionati ─────────────────────────── */}
          {(() => {
            // Calcolo lane positions per OGNI giorno separatamente
            // (l'overlap si verifica solo all'interno dello stesso giorno).
            // Massimo 3 lane visibili: oltre, ultima ingloba badge "+N altri".
            //
            // DURANTE DRAG: salto il calcolo lane → tutte le card tornano a piena
            // larghezza per facilitare lo spostamento (ricompaiono affiancate
            // appena finisce il drag).
            const lanePositions = new Map<string, ReturnType<typeof assignLanes> extends Map<string, infer V> ? V : never>();
            if (!draggingEvent) {
              for (let i = 0; i < weekDays.length; i++) {
                const day = weekDays[i];
                const dayEvents = filteredEvents.filter(e =>
                  e.start.getDate() === day.getDate() &&
                  e.start.getMonth() === day.getMonth() &&
                  e.start.getFullYear() === day.getFullYear()
                );
                const dayLanes = assignLanes(dayEvents, 3);
                dayLanes.forEach((v, k) => lanePositions.set(k, v));
              }
            } else {
              // Drag in corso: lane = 0, totalLanes = 1 (full width) per tutti
              for (const ev of filteredEvents) {
                lanePositions.set(ev.id, { lane: 0, totalLanes: 1 });
              }
            }

            return filteredEvents.map(event => {
              const dayIndex = weekDays.findIndex(day =>
                event.start.getDate() === day.getDate() &&
                event.start.getMonth() === day.getMonth() &&
                event.start.getFullYear() === day.getFullYear()
              );
              if (dayIndex === -1) return null;

              // Se l'evento è nascosto (overflow oltre 3 lane), non lo renderizzo
              const lanePos = lanePositions.get(event.id);
              if (event.status !== "cancelled" && !lanePos) return null;
              const lane = lanePos?.lane ?? 0;
              const totalLanes = lanePos?.totalLanes ?? 1;
              const hidden = lanePos?.hidden ?? 0;
              const hiddenIds = lanePos?.hiddenIds ?? [];

            const { top, height } = getEventPosition(event.start, event.end);
            const isDone     = event.status === "done";
            const isDomicile = event.location === "domicile";
            const isPaid     = !!event.is_paid;
            const waSent     = !!event.whatsapp_sent_at;

            const isMatch  = searchMatchIds.has(event.id);
            const isDimmed = isSearchActive && !isMatch;

            // Multi-sede (mig. 014, fase 3)
            const locStyle = getLocationCardStyle(event, studioLocations);

            const cardH = Math.max(height - 2, 28);
            // 3 livelli di rendering in base all'altezza:
            //   • isShort  (≤30min, < 38px) → 1 riga: orario + nome
            //   • isMedium (45min,  38–55px) → 2 righe: orario+icone / nome+tipo+prezzo+stato
            //   • full     (≥60min, ≥ 56px)  → 3 righe come prima
            const isShort  = cardH < 38;
            const isMedium = !isShort && cardH < 56;

            return (
              <div
                key={event.id}
                draggable
                className={`cal-event-card ${isMatch ? "search-highlight" : isDimmed ? "search-dimmed" : ""}`}
                onDragStart={e => onDragStart(e, event.id, event.start, event.end)}
                onDragEnd={onDragEnd}
                onContextMenu={e => onContextMenu(e, event)}
                onClick={() => onSelectEvent(event)}
                onMouseEnter={e => {
                  if (!isDimmed) {
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,0.15)";
                    e.currentTarget.style.transform = isMatch ? "scale(1.06)" : "scale(1.01)";
                  }
                  onEventHover(e, event);
                }}
                onMouseLeave={e => {
                  if (!isDimmed) {
                    e.currentTarget.style.boxShadow = isMatch ? "0 0 20px rgba(245,158,11,0.6)" : "0 2px 6px rgba(30,64,175,0.08)";
                    e.currentTarget.style.transform = isMatch ? "scale(1.04)" : "scale(1)";
                  }
                  onEventHoverEnd();
                }}
                style={{
                  position: "absolute",
                  // Larghezza colonna giorno
                  left: `calc(${TIME_COL}px + ${dayIndex} * calc((100% - ${TIME_COL}px) / 6) + 2px + ${lane} * ((calc((100% - ${TIME_COL}px) / 6) - 8px) / ${totalLanes}))`,
                  top: `${top + 1}px`,
                  width: `calc(((100% - ${TIME_COL}px) / 6 - 8px) / ${totalLanes} - ${totalLanes > 1 ? 2 : 0}px)`,
                  height: `${cardH}px`,
                  background: isMatch ? "#f59e0b" : event.is_group ? "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)" : statusBg(event.status),
                  color: "#fff",
                  borderRadius: 6,
                  padding: "4px 6px",
                  boxSizing: "border-box",
                  // Multi-sede (mig. 014, fase 3): bordo colorato per sedi secondarie.
                  // Se assente, ricade sul comportamento storico (no border, eventuale
                  // borderLeft giallo per gli appuntamenti WEB).
                  border: locStyle.borderColor ? `2px solid ${locStyle.borderColor}` : "none",
                  borderLeft: event.calendar_note?.startsWith("[WEB|")
                    ? "4px solid #facc15"
                    : (locStyle.borderColor ? `2px solid ${locStyle.borderColor}` : "none"),
                  cursor: "move",
                  zIndex: isMatch ? 10 : 2,
                  // Durante un drag in corso, le card non draggate "lasciano passare"
                  // gli eventi mouse alle celle sotto, così è possibile droppare
                  // anche su uno slot occupato da un altro appuntamento.
                  pointerEvents: draggingEvent && draggingEvent.id !== event.id ? "none" : "auto",
                  overflow: "hidden",
                  transition: "box-shadow 0.15s, opacity 0.3s",
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  boxShadow: isMatch ? "0 0 10px rgba(245,158,11,0.3)" : "0 1px 3px rgba(15,23,42,0.06)",
                  fontSize: 11,
                  transform: isMatch ? "scale(1.02)" : "scale(1)",
                }}
              >
                {event.is_group ? (
                  <GroupEventCard event={event} cardH={cardH} />
                ) : isShort ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden", height: "100%" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.85)", flexShrink: 0, lineHeight: 1 }}>
                      {fmtTime(event.start.toISOString())}{isDomicile && " 🏠"}
                    </span>
                    {locStyle.initials && (
                      <span title={locStyle.locationName ?? undefined} style={{
                        fontSize: 8, fontWeight: 800, color: "#fff",
                        background: locStyle.borderColor ?? undefined,
                        padding: "1px 4px", borderRadius: 3,
                        letterSpacing: 0.3, lineHeight: 1.1,
                        flexShrink: 0,
                      }}>{locStyle.initials}</span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                      {event.patient_name}
                    </span>
                    {isPaid && <span style={{ fontSize: 9, flexShrink: 0, opacity: 0.9 }}>🪙</span>}
                    {event.amount && (
                      <span style={{ fontSize: 9, flexShrink: 0, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>
                        €{event.amount}
                      </span>
                    )}
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: "#fff",
                      background: "rgba(255,255,255,0.25)", padding: "1px 4px",
                      borderRadius: 99, whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {statusShortLabel(event.status)}
                    </span>
                  </div>
                ) : isMedium ? (
                  <>
                    {/* MEDIUM (45min) — 2 righe compatte: orario+icone / nome+tipo+prezzo+stato */}
                    {/* Riga 1: orario a sx, indicatori pagato/eseguito a dx */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexShrink: 0, marginBottom: 1 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", lineHeight: 1 }}>
                          {fmtTime(event.start.toISOString())}
                          {isDomicile && " 🏠"}
                        </span>
                        {locStyle.initials && (
                          <span title={locStyle.locationName ?? undefined} style={{
                            fontSize: 8, fontWeight: 800, color: "#fff",
                            background: locStyle.borderColor ?? undefined,
                            padding: "1px 4px", borderRadius: 3,
                            letterSpacing: 0.3, lineHeight: 1.1,
                            flexShrink: 0,
                          }}>{locStyle.initials}</span>
                        )}
                      </span>
                      <div style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }}>
                        {/* Pagato — micro icon button con popover */}
                        {onUpdatePayment ? (
                          <PaidIconButton
                            data={{
                              is_paid: isPaid,
                              paid_at: event.paid_at,
                              payment_method: event.payment_method,
                              price_type: event.price_type,
                            }}
                            onUpdate={async (next) => onUpdatePayment(event.id, next)}
                            tone="light"
                            size={14}
                          />
                        ) : (
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); onTogglePaid(event.id, isPaid); }}
                            title={isPaid ? "Pagato — clicca per annullare" : "Segna pagato"}
                            style={{
                              background: "none", border: "none", cursor: "pointer", padding: 0,
                              fontSize: 11, lineHeight: 1, opacity: isPaid ? 1 : 0.5,
                            }}
                          >🪙</button>
                        )}
                        {/* Eseguito */}
                        <button
                          onClick={e => {
                            e.preventDefault(); e.stopPropagation();
                            if (bulkMode) onToggleBulkSelect(event.id);
                            else onToggleDone(event.id, event.status);
                          }}
                          title={isDone ? "Annulla eseguita" : "Segna eseguita"}
                          style={{
                            width: 14, height: 14, borderRadius: 99, flexShrink: 0,
                            border: `1.5px solid ${isDone ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)"}`,
                            background: isDone ? "rgba(255,255,255,0.9)" : "transparent",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            color: statusBg(event.status), fontSize: 8, fontWeight: 800,
                          }}
                        >
                          {isDone || bulkSelected.has(event.id) ? "✓" : ""}
                        </button>
                      </div>
                    </div>

                    {/* Riga 2: nome (priorità alta) + tipo+prezzo+stato (si nascondono se stretto) */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 5, minWidth: 0 }}>
                      <span style={{
                        fontWeight: 700, fontSize: 12, color: "#fff", lineHeight: 1.15,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        flex: 1, minWidth: 0,
                      }}>
                        {event.calendar_note?.startsWith("[WEB|") && (
                          <span style={{
                            fontSize: 8, background: "rgba(255,255,255,0.25)",
                            borderRadius: 3, padding: "1px 3px", marginRight: 3,
                            fontWeight: 700, verticalAlign: "middle",
                          }}>WEB</span>
                        )}
                        {event.patient_name}
                      </span>
                      <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0, fontSize: 9, color: "rgba(255,255,255,0.9)" }}>
                        {/* Tipo + prezzo abbreviato (si nasconde su colonne strettissime) */}
                        {event.amount && (
                          <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                            <span className="evt-type-label">
                              {event.treatment_type === "macchinario" ? "Mac." : "Sed."}
                            </span>
                            €{event.amount}
                          </span>
                        )}
                        {/* Badge stato (sempre visibile) */}
                        <span style={{
                          fontWeight: 700, color: "#fff",
                          background: "rgba(255,255,255,0.25)", padding: "1px 5px",
                          borderRadius: 99, whiteSpace: "nowrap",
                        }}>
                          {statusShortLabel(event.status)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Riga 1: orario + bottoni */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexShrink: 0, marginBottom: 2 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", lineHeight: 1 }}>
                          {fmtTime(event.start.toISOString())}
                          {isDomicile && " 🏠"}
                        </span>
                        {locStyle.initials && (
                          <span title={locStyle.locationName ?? undefined} style={{
                            fontSize: 8, fontWeight: 800, color: "#fff",
                            background: locStyle.borderColor ?? undefined,
                            padding: "1px 4px", borderRadius: 3,
                            letterSpacing: 0.3, lineHeight: 1.1,
                            flexShrink: 0,
                          }}>{locStyle.initials}</span>
                        )}
                      </span>
                      <div className="cal-evt-actions" style={{ display: "flex", gap: 3, alignItems: "center", flexShrink: 0 }}>
                        {/* Pagato — micro icon button con popover */}
                        {onUpdatePayment ? (
                          <PaidIconButton
                            data={{
                              is_paid: isPaid,
                              paid_at: event.paid_at,
                              payment_method: event.payment_method,
                              price_type: event.price_type,
                            }}
                            onUpdate={async (next) => onUpdatePayment(event.id, next)}
                            tone="light"
                            size={18}
                          />
                        ) : (
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); onTogglePaid(event.id, isPaid); }}
                            title={isPaid ? "Pagato — clicca per annullare" : "Segna pagato"}
                            style={{
                              background: isPaid ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)",
                              border: `1px solid ${isPaid ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)"}`,
                              borderRadius: 4, cursor: "pointer", padding: "0 5px",
                              fontSize: 13, lineHeight: "18px",
                              display: "flex", alignItems: "center", gap: 2, height: 18,
                            }}
                          >
                            🪙{isPaid && <span style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>✓</span>}
                          </button>
                        )}
                        {/* WA promemoria */}
                        {event.status !== "cancelled" && event.patient_phone && (
                          <button
                            onClick={e => {
                              e.preventDefault(); e.stopPropagation();
                              onSendReminder(event.id, event.patient_phone ?? undefined, event.patient_first_name ?? undefined);
                            }}
                            title={waSent ? "Reinvia promemoria" : "Invia promemoria"}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1, opacity: waSent ? 1 : 0.5 }}
                          >
                            {waSent ? "🔕" : "🔔"}
                          </button>
                        )}
                        {/* Eseguito */}
                        <button
                          onClick={e => {
                            e.preventDefault(); e.stopPropagation();
                            if (bulkMode) onToggleBulkSelect(event.id);
                            else onToggleDone(event.id, event.status);
                          }}
                          title={isDone ? "Annulla eseguita" : "Segna eseguita"}
                          style={{
                            width: 16, height: 16, borderRadius: 99, flexShrink: 0,
                            border: `1.5px solid ${isDone ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)"}`,
                            background: isDone ? "rgba(255,255,255,0.9)" : "transparent",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            color: statusBg(event.status), fontSize: 9, fontWeight: 800,
                          }}
                        >
                          {isDone || bulkSelected.has(event.id) ? "✓" : ""}
                        </button>
                      </div>
                    </div>

                    {/* Riga 2: nome paziente */}
                    <div style={{
                      fontWeight: 700, fontSize: autoNameFontSize(event.patient_name),
                      color: "#fff", lineHeight: 1.2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {event.calendar_note?.startsWith("[WEB|") && (
                        <span style={{
                          fontSize: 8, background: "rgba(255,255,255,0.25)",
                          borderRadius: 3, padding: "1px 3px", marginRight: 3,
                          fontWeight: 700, verticalAlign: "middle",
                        }}>WEB</span>
                      )}
                      {event.patient_name}
                    </div>

                    {/* Riga 3: tipo+importo + status badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 3, marginTop: "auto" }}>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {event.treatment_type === "macchinario" ? "Macch." : "Seduta"}
                        {event.amount ? ` · €${event.amount}` : ""}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: "#fff",
                        background: "rgba(255,255,255,0.25)", padding: "1px 5px",
                        borderRadius: 99, whiteSpace: "nowrap", flexShrink: 0,
                      }}>
                        {statusLabel(event.status)}
                      </span>
                    </div>
                  </>
                )}
                {/* Badge "+N altri" — quando questa card "ingloba" altri eventi
                    nascosti per via del limite max 3 lane visibili */}
                {hidden > 0 && (
                  <div
                    onClick={e => {
                      e.stopPropagation();
                      // Mostra dialog/popup con la lista degli appt nascosti.
                      // Per ora alert semplice — il popup verr&agrave; rifinito in seguito.
                      const allOverlapping = [event.id, ...hiddenIds];
                      const names = allOverlapping
                        .map(id => filteredEvents.find(ev => ev.id === id))
                        .filter(Boolean)
                        .map(ev => `• ${fmtTime(ev!.start.toISOString())} — ${ev!.patient_name}`)
                        .join("\n");
                      alert(`${1 + hidden} appuntamenti sovrapposti:\n\n${names}\n\nClicca su una card per modificarla.`);
                    }}
                    style={{
                      position: "absolute",
                      top: 2, right: 2,
                      background: "rgba(255,255,255,0.95)",
                      color: statusBg(event.status),
                      padding: "2px 6px",
                      borderRadius: 99,
                      fontSize: 9,
                      fontWeight: 800,
                      cursor: "pointer",
                      zIndex: 5,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    }}
                    title={`+${hidden} altri appuntamenti sovrapposti`}
                  >
                    +{hidden}
                  </div>
                )}
              </div>
            );
          });
          })()}

          {/* ─── Finestre libere ─────────────────────────── */}
          {showAvailableOnly && weekDays.map((day, dayIndex) => {
            const windows = getFreeWindows(day);
            return windows.map((win, wi) => {
              const { top, height } = getEventPosition(win.start, win.end);
              const hrs = Math.floor(win.minutes / 60);
              const mins = win.minutes % 60;
              const label = hrs > 0 ? `${hrs}h${mins > 0 ? `${mins}′` : ""}` : `${mins}′`;
              return (
                <div
                  key={`win-${dayIndex}-${wi}`}
                  style={{
                    position: "absolute",
                    left: `calc(${TIME_COL}px + ${dayIndex} * calc((100% - ${TIME_COL}px) / 6) + 2px)`,
                    top: `${top}px`,
                    width: `calc((100% - ${TIME_COL}px) / 6 - 6px)`,
                    height: `${height}px`,
                    background: "rgba(22,163,74,0.07)",
                    borderLeft: "3px solid rgba(22,163,74,0.5)",
                    borderRadius: "0 6px 6px 0",
                    cursor: "pointer",
                    zIndex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "flex-start",
                    padding: "4px 6px",
                    transition: "all 0.15s",
                    overflow: "hidden",
                  }}
                  onClick={() => onSlotClick(day, win.start.getHours(), win.start.getMinutes())}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(22,163,74,0.15)"; e.currentTarget.style.borderLeftColor = THEME.green; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(22,163,74,0.07)"; e.currentTarget.style.borderLeftColor = "rgba(22,163,74,0.5)"; }}
                  title={`Libero ${pad2(win.start.getHours())}:${pad2(win.start.getMinutes())} – ${pad2(win.end.getHours())}:${pad2(win.end.getMinutes())} (${label})`}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, color: THEME.green, lineHeight: 1.3 }}>
                    {pad2(win.start.getHours())}:{pad2(win.start.getMinutes())}
                  </div>
                  {height >= 40 && (
                    <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(22,163,74,0.7)", lineHeight: 1.3 }}>
                      {label} libero
                    </div>
                  )}
                </div>
              );
            });
          })}

          {/* ─── Linea "now" rossa ───────────────────────── */}
          <div style={{
            position: "absolute",
            left: 0, top: 0, right: 0, bottom: 0,
            pointerEvents: "none",
            zIndex: 3,
          }}>
            {(() => {
              const now = currentTime;
              const currentDayIndex = weekDays.findIndex(day =>
                now.getDate() === day.getDate() &&
                now.getMonth() === day.getMonth() &&
                now.getFullYear() === day.getFullYear()
              );
              if (currentDayIndex === -1) return null;

              const currentHour = now.getHours();
              const currentMinute = now.getMinutes();
              // FIX bug: prima era hardcoded "currentHour - 7" assumendo griglia
              // sempre da ora 7. Ora usa gridStartHour dinamico (mig. orari di lavoro).
              const topPosition = ((currentHour - gridStartHour) * 60 + currentMinute) * WEEK_PX_PER_MIN;

              const dayWidth = `calc((100% - ${TIME_COL}px) / 6)`;
              const leftPosition = `calc(${TIME_COL}px + ${currentDayIndex} * (${dayWidth}))`;

              return (
                <div style={{
                  position: "absolute",
                  left: leftPosition,
                  top: `${topPosition}px`,
                  width: `calc(${dayWidth} - 2px)`,
                  height: "2px",
                  background: THEME.red,
                  zIndex: 4,
                }}>
                  <div style={{
                    position: "absolute",
                    left: "50%",
                    top: "-4px",
                    transform: "translateX(-50%)",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: THEME.red,
                  }} />
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
