// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/DayTimeline.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Colonna sinistra della Vista GIORNO: timeline verticale con:
//   • Header gradient teal-blue con etichetta del giorno + data
//   • Slot a 30 min (08:00–20:00) cliccabili e drag-drop target
//   • Eventi posizionati assoluti con colori per stato/trattamento
//   • Card evento con 3 micro-bottoni a sinistra (paga / WA / esegui) e
//     testo a destra (orario, nome, tipo+importo)
//   • Linea rossa "now" se isToday (dot rosso al centro)
//   • Mostra finestre libere quando showAvailableOnly è attivo
//
// Tutte le interazioni (slot click, drag, context menu) sono delegate al
// page.tsx tramite callback. Il componente è "stupido": riceve dati e
// chiama le funzioni passate.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  THEME, fmtTime, formatDMY, pad2, statusBg, statusLabel, getTreatmentLabel,
  assignLanes,
  type CalendarEvent,
} from "../../utils";

const DAY_PX_PER_MIN = 1;

export type DraggingOverState = { dayIndex: number; hour: number; minute: number };
export type FreeWindow = { start: Date; end: Date; minutes: number };

export type DayTimelineProps = {
  /** Data corrente */
  currentDate: Date;
  /** Eventi del giorno (filtrati dal parent) */
  dayEvents: CalendarEvent[];
  /** Tempo corrente (per la linea "now") */
  currentTime: Date;

  /** Slot orari (es. ["08:00", "09:00", ...]) */
  timeSlots: string[];
  /** Etichette giorni della settimana */
  dayLabels: { dow: number; label: string }[];
  /** Larghezza colonna ora */
  TIME_COL: number;

  /** Stato drag-over corrente */
  draggingOver: DraggingOverState | null;
  /** Toggle finestre libere */
  showAvailableOnly: boolean;
  /** Bulk mode attivo (per cliccare su evento → toggle selezione invece che modifica) */
  bulkMode: boolean;
  /** Set degli id evento selezionati in bulk mode */
  bulkSelected: Set<string>;
  /** Set id che matchano la search (highlight) */
  searchMatchIds: Set<string>;

  // ─── Callback delegate al page.tsx ───────────────────────────
  /** Click su slot vuoto */
  onSlotClick: (date: Date, hour: number, minute: number) => void;
  /** Tasto destro / pressione lunga */
  onContextMenu: (e: React.MouseEvent, event?: CalendarEvent) => void;
  /** Drag start su una card evento */
  onDragStart: (e: React.DragEvent, eventId: string, originalStart: Date, originalEnd: Date) => void;
  /** ID dell'evento attualmente in drag (se esiste). Usato per disattivare le lane affiancate durante il drag. */
  draggingEventId?: string | null;
  /** Drag end */
  onDragEnd: (e: React.DragEvent) => void;
  /** Drag over su uno slot */
  onDragOver: (e: React.DragEvent, dayIndex: number, hour: number, minute: number) => void;
  /** Drag leave */
  onDragLeave: (e: React.DragEvent) => void;
  /** Drop su uno slot */
  onDrop: (e: React.DragEvent, targetDate: Date, targetHour: number, targetMinute: number) => void;

  /** Posizione (top + height in px) di un evento nella timeline */
  getDayEventPosition: (start: Date, end: Date) => { top: number; height: number };
  /** Restituisce le finestre libere del giorno */
  getFreeWindows: (day: Date) => FreeWindow[];
  /** Restituisce il colore di un evento (status / treatment / personalizzato) */
  getEventColor: (event: CalendarEvent) => string;

  /** Click su evento → apre modale modifica (page fa setup) */
  onSelectEvent: (event: CalendarEvent) => void;
  /** Toggle selezione bulk */
  onToggleBulkSelect: (eventId: string) => void;
  /** Toggle eseguito */
  onToggleDone: (eventId: string, currentStatus: CalendarEvent["status"]) => void;
  /** Toggle pagato */
  onTogglePaid: (eventId: string, currentlyPaid: boolean) => void;
  /** Invia promemoria WA */
  onSendReminder: (eventId: string, phone?: string, firstName?: string) => void;
};

export default function DayTimeline({
  currentDate, dayEvents, currentTime,
  timeSlots, dayLabels, TIME_COL,
  draggingOver, showAvailableOnly, bulkMode, bulkSelected, searchMatchIds,
  onSlotClick, onContextMenu,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  draggingEventId,
  getDayEventPosition, getFreeWindows, getEventColor,
  onSelectEvent, onToggleBulkSelect,
  onToggleDone, onTogglePaid, onSendReminder,
}: DayTimelineProps) {

  const today = new Date();
  const isToday =
    today.getDate() === currentDate.getDate() &&
    today.getMonth() === currentDate.getMonth() &&
    today.getFullYear() === currentDate.getFullYear();

  // Etichetta giorno (lun-sab; domenica → indice 0)
  const dayLabelIdx = currentDate.getDay() === 0 ? 0 : currentDate.getDay() - 1;
  const dayHeader = `${dayLabels[dayLabelIdx].label} • ${formatDMY(currentDate)}`;

  return (
    <div style={{ flex: 1, minWidth: 0, position: "relative", borderRight: `2px solid ${THEME.border}` }}>

      {/* ─── Header gradient ─────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `${TIME_COL}px 1fr`,
        borderBottom: `2px solid ${THEME.border}`,
        background: "linear-gradient(135deg, #0d9488, #2563eb)",
        borderRadius: "10px 10px 0 0",
      }}>
        <div style={{
          padding: "16px 8px",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,0.5)",
          textAlign: "center",
          boxSizing: "border-box",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}>
          ORA
        </div>
        <div style={{
          padding: "16px 8px",
          textAlign: "center",
          fontSize: 13,
          fontWeight: 700,
          color: "#93c5fd",
          boxSizing: "border-box",
          letterSpacing: 0.5,
        }}>
          {dayHeader}
        </div>
      </div>

      {/* ─── Timeline con slot ─────────────────────────────────── */}
      <div style={{ position: "relative" }}>
        {timeSlots.map((time, timeIndex) => {
          const hour = parseInt(time.split(":")[0]);

          return (
            <div
              key={timeIndex}
              style={{
                height: "60px",
                borderBottom: `1.5px solid ${THEME.border}`,
                position: "relative",
                display: "flex",
              }}
            >
              {/* Colonna ora */}
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
              }}>
                {time}
              </div>

              {/* 2 sub-slot 30min */}
              <div style={{
                flex: 1,
                minWidth: 0,
                height: "100%",
                boxSizing: "border-box",
                position: "relative",
              }}>
                {/* Slot 00–30 minuti */}
                <div
                  style={{
                    height: "60px",
                    borderBottom: `1.5px solid ${THEME.border}`,
                    cursor: "pointer",
                    boxSizing: "border-box",
                    position: "relative",
                  }}
                  title={`Clicca per creare appuntamento alle ${pad2(hour)}:00`}
                  onClick={() => onSlotClick(currentDate, hour, 0)}
                  onContextMenu={onContextMenu}
                  onDragOver={e => onDragOver(e, 0, hour, 0)}
                  onDragLeave={onDragLeave}
                  onDrop={e => onDrop(e, currentDate, hour, 0)}
                >
                  {draggingOver && draggingOver.dayIndex === 0 &&
                   draggingOver.hour === hour && draggingOver.minute === 0 && (
                    <div style={{
                      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                      border: `2px dashed ${THEME.blue}`,
                      background: "rgba(91,130,168,0.1)",
                      zIndex: 1, pointerEvents: "none",
                    }} />
                  )}
                </div>

                {/* Slot 30–60 minuti */}
                <div
                  style={{
                    height: "60px",
                    cursor: "pointer",
                    boxSizing: "border-box",
                    position: "relative",
                  }}
                  title={`Clicca per creare appuntamento alle ${pad2(hour)}:30`}
                  onClick={() => onSlotClick(currentDate, hour, 30)}
                  onContextMenu={onContextMenu}
                  onDragOver={e => onDragOver(e, 0, hour, 30)}
                  onDragLeave={onDragLeave}
                  onDrop={e => onDrop(e, currentDate, hour, 30)}
                >
                  {draggingOver && draggingOver.dayIndex === 0 &&
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
            </div>
          );
        })}

        {/* ─── Finestre libere ─────────────────────────────── */}
        {showAvailableOnly && getFreeWindows(currentDate).map((win, wi) => {
          const { top, height } = getDayEventPosition(win.start, win.end);
          const hrs = Math.floor(win.minutes / 60);
          const mins = win.minutes % 60;
          const label = hrs > 0 ? `${hrs}h${mins > 0 ? `${mins}′` : ""}` : `${mins}′`;
          return (
            <div
              key={`dwin-${wi}`}
              style={{
                position: "absolute",
                left: `${TIME_COL + 2}px`,
                top: `${top}px`,
                width: `calc(100% - ${TIME_COL + 8}px)`,
                height: `${height}px`,
                background: "rgba(22,163,74,0.07)",
                borderLeft: "3px solid rgba(22,163,74,0.5)",
                borderRadius: "0 6px 6px 0",
                cursor: "pointer",
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 10px",
                transition: "all 0.15s",
              }}
              onClick={() => onSlotClick(currentDate, win.start.getHours(), win.start.getMinutes())}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(22,163,74,0.15)"; e.currentTarget.style.borderLeftColor = THEME.green; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(22,163,74,0.07)"; e.currentTarget.style.borderLeftColor = "rgba(22,163,74,0.5)"; }}
              title={`Libero ${pad2(win.start.getHours())}:${pad2(win.start.getMinutes())} – ${pad2(win.end.getHours())}:${pad2(win.end.getMinutes())}`}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: THEME.green }}>
                {pad2(win.start.getHours())}:{pad2(win.start.getMinutes())} – {pad2(win.end.getHours())}:{pad2(win.end.getMinutes())}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(22,163,74,0.7)" }}>
                {label} libero · clicca per prenotare
              </span>
            </div>
          );
        })}

        {/* ─── Card evento posizionate assolute ─────────────── */}
        {(() => {
          // Lane assignment per affiancare card sovrapposte (Google-style).
          // DURANTE DRAG: salto il calcolo → tutte le card tornano a piena larghezza
          // per facilitare lo spostamento (ricompaiono affiancate appena finisce).
          const lanePositions: ReturnType<typeof assignLanes> = draggingEventId
            ? new Map(dayEvents.map(e => [e.id, { lane: 0, totalLanes: 1 }]))
            : assignLanes(dayEvents, 3);
          return dayEvents.map(event => {
            const lanePos = lanePositions.get(event.id);
            if (event.status !== "cancelled" && !lanePos) return null;
            const lane = lanePos?.lane ?? 0;
            const totalLanes = lanePos?.totalLanes ?? 1;
            const hidden = lanePos?.hidden ?? 0;
            const hiddenIds = lanePos?.hiddenIds ?? [];

            const { top, height } = getDayEventPosition(event.start, event.end);
          const isDone     = event.status === "done";
          const isDomicile = event.location === "domicile";
          const isPaid     = !!event.is_paid;
          const waSent     = !!event.whatsapp_sent_at;
          const h          = Math.max(height - 2, 20);

          return (
            <div
              key={event.id}
              draggable
              onDragStart={e => onDragStart(e, event.id, event.start, event.end)}
              onDragEnd={onDragEnd}
              onContextMenu={e => onContextMenu(e, event)}
              onClick={() => onSelectEvent(event)}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 3px 12px rgba(15,23,42,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,0.06)"; }}
              style={{
                position: "absolute",
                // Larghezza divisa per totalLanes; offset orizzontale per lane
                left: `calc(82px + ${lane} * ((100% - 88px) / ${totalLanes}))`,
                top: `${top + 1}px`,
                width: `calc((100% - 88px) / ${totalLanes} - ${totalLanes > 1 ? 2 : 0}px)`,
                height: `${Math.max(height - 2, 28)}px`,
                background: statusBg(event.status),
                color: "#fff",
                borderRadius: 6,
                padding: "6px 10px",
                boxSizing: "border-box",
                border: "none",
                borderLeft: event.calendar_note?.startsWith("[WEB|") ? "4px solid #facc15" : "none",
                cursor: "move",
                zIndex: 2,
                overflow: "hidden",
                transition: "box-shadow 0.15s",
                display: "flex",
                flexDirection: "column",
                gap: 0,
                boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
              }}
            >
              {/* Sotto i 22px: layout inline */}
              {h < 22 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden", whiteSpace: "nowrap", width: "100%" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.9)", flexShrink: 0 }}>
                    {fmtTime(event.start.toISOString())}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {event.patient_name}
                  </span>
                  {isDomicile && <span style={{ fontSize: 9, flexShrink: 0 }}>🏠</span>}
                </div>
              ) : (
                /* Sopra 22px: layout 2 colonne (bottoni sinistra + testo destra) */
                <div style={{ display: "flex", gap: 4, width: "100%", height: "100%", minWidth: 0 }}>

                  {/* COLONNA SINISTRA: 3 micro-bottoni 12×12 */}
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-evenly",
                    width: 14, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.18)",
                  }}>
                    {/* Pagato */}
                    <button
                      title={isPaid ? "Pagato" : "Segna pagato"}
                      onClick={e => { e.preventDefault(); e.stopPropagation(); onTogglePaid(event.id, isPaid); }}
                      style={{
                        width: 12, height: 12, borderRadius: 3,
                        border: `1px solid ${isPaid ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)"}`,
                        background: isPaid ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 8, padding: 0, flexShrink: 0,
                      }}
                    >
                      🪙
                    </button>
                    {/* WA */}
                    <button
                      title={waSent ? "Reinvia WA" : "Invia WA"}
                      onClick={e => {
                        e.preventDefault(); e.stopPropagation();
                        onSendReminder(event.id, event.patient_phone ?? undefined, event.patient_first_name ?? undefined);
                      }}
                      style={{
                        width: 12, height: 12, background: "none", border: "none",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, opacity: event.patient_phone ? (waSent ? 1 : 0.55) : 0.2,
                        padding: 0, flexShrink: 0,
                      }}
                    >
                      {waSent ? "🔕" : "🔔"}
                    </button>
                    {/* Eseguito */}
                    <button
                      title={isDone ? "Annulla" : "Eseguita"}
                      onClick={e => {
                        e.preventDefault(); e.stopPropagation();
                        if (bulkMode) onToggleBulkSelect(event.id);
                        else onToggleDone(event.id, event.status);
                      }}
                      style={{
                        width: 12, height: 12, borderRadius: 99,
                        border: `1.5px solid ${isDone ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)"}`,
                        background: isDone ? "rgba(255,255,255,0.9)" : "transparent",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        color: statusBg(event.status), fontSize: 7, fontWeight: 900,
                        padding: 0, flexShrink: 0,
                      }}
                    >
                      {isDone || bulkSelected.has(event.id) ? "✓" : ""}
                    </button>
                  </div>

                  {/* COLONNA DESTRA: testo */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>
                    {/* Orario + badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 3, overflow: "hidden", flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {fmtTime(event.start.toISOString())}–{fmtTime(event.end.toISOString())}
                      </span>
                      {isDomicile && <span style={{ fontSize: 9, flexShrink: 0 }}>🏠</span>}
                      {event.calendar_note?.startsWith("[WEB|") && (
                        <span style={{ fontSize: 7, background: "rgba(255,255,255,0.25)", borderRadius: 2, padding: "1px 3px", fontWeight: 800, flexShrink: 0 }}>WEB</span>
                      )}
                      <span style={{ marginLeft: "auto", fontSize: 7, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.2)", padding: "1px 4px", borderRadius: 99, whiteSpace: "nowrap", flexShrink: 0 }}>
                        {statusLabel(event.status)}
                      </span>
                    </div>
                    {/* Nome — sempre visibile */}
                    <div
                      title={event.patient_name}
                      style={{
                        fontSize: h >= 55 ? 13 : h >= 36 ? 11 : 10,
                        fontWeight: 800, color: "#fff",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        flex: 1, lineHeight: 1.25, paddingTop: 1,
                      }}
                    >
                      {event.patient_name}
                    </div>
                    {/* Tipo + importo (solo se c'è spazio) */}
                    {h >= 50 && (
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.82)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {getTreatmentLabel(event.treatment_type)}
                        {event.amount ? ` · €${event.amount}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Badge "+N altri" — quando questa card "ingloba" altri eventi
                  nascosti per via del limite max 3 lane visibili */}
              {hidden > 0 && (
                <div
                  onClick={e => {
                    e.stopPropagation();
                    const allOverlapping = [event.id, ...hiddenIds];
                    const names = allOverlapping
                      .map(id => dayEvents.find(ev => ev.id === id))
                      .filter(Boolean)
                      .map(ev => `• ${fmtTime(ev!.start.toISOString())} — ${ev!.patient_name}`)
                      .join("\n");
                    alert(`${1 + hidden} appuntamenti sovrapposti:\n\n${names}`);
                  }}
                  style={{
                    position: "absolute",
                    top: 4, right: 4,
                    background: "rgba(255,255,255,0.95)",
                    color: statusBg(event.status),
                    padding: "2px 8px",
                    borderRadius: 99,
                    fontSize: 10,
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

        {/* ─── Linea "now" rossa ─────────────────────────────── */}
        <div
          style={{
            position: "absolute",
            left: 0, top: 0, right: 0, bottom: 0,
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          {isToday && (() => {
            const currentHour = currentTime.getHours();
            const currentMinute = currentTime.getMinutes();
            const topPosition = ((currentHour - 7) * 60 + currentMinute) * DAY_PX_PER_MIN;

            return (
              <div
                style={{
                  position: "absolute",
                  left: `${TIME_COL}px`,
                  top: `${topPosition}px`,
                  width: `calc(100% - ${TIME_COL + 4}px)`,
                  height: "2px",
                  background: THEME.red,
                  zIndex: 4,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "-4px",
                    transform: "translateX(-50%)",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: THEME.red,
                  }}
                />
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
