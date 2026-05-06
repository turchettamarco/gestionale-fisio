// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/DayView.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Vista GIORNO — wrapper che combina DayTimeline (a sinistra) e
// DaySidebar (a destra) in un singolo contenitore flexbox.
//
// I dettagli di rendering, interazione e stato sono nei due sottocomponenti.
// Questo file serve solo a:
//   • disegnare il container con bordi/ombra
//   • ricevere props da page.tsx e inoltrarle ai due figli
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, type CalendarEvent } from "../../utils";
import DayTimeline, { type DayTimelineProps } from "./DayTimeline";
import DaySidebar, { type DaySidebarProps } from "./DaySidebar";

export type DayViewProps = {
  // Sezione comune
  currentDate: Date;
  /** Eventi del giorno (filtrati e ordinati dal parent, esclusi i cancellati) */
  dayEvents: CalendarEvent[];
  /** Tempo corrente (per linea "now") */
  currentTime: Date;

  // Per timeline
  timeSlots: DayTimelineProps["timeSlots"];
  dayLabels: DayTimelineProps["dayLabels"];
  TIME_COL: DayTimelineProps["TIME_COL"];
  gridStartHour?: DayTimelineProps["gridStartHour"];
  studioLocations?: DayTimelineProps["studioLocations"];
  draggingOver: DayTimelineProps["draggingOver"];
  showAvailableOnly: DayTimelineProps["showAvailableOnly"];
  bulkMode: DayTimelineProps["bulkMode"];
  bulkSelected: DayTimelineProps["bulkSelected"];
  searchMatchIds: DayTimelineProps["searchMatchIds"];
  onSlotClick: DayTimelineProps["onSlotClick"];
  onContextMenu: DayTimelineProps["onContextMenu"];
  onDragStart: DayTimelineProps["onDragStart"];
  onDragEnd: DayTimelineProps["onDragEnd"];
  onDragOver: DayTimelineProps["onDragOver"];
  onDragLeave: DayTimelineProps["onDragLeave"];
  onDrop: DayTimelineProps["onDrop"];
  draggingEventId?: DayTimelineProps["draggingEventId"];
  getDayEventPosition: DayTimelineProps["getDayEventPosition"];
  getFreeWindows: DayTimelineProps["getFreeWindows"];
  getEventColor: DayTimelineProps["getEventColor"];

  // Callback condivise (timeline + sidebar)
  onSelectEvent: (event: CalendarEvent) => void;
  onToggleBulkSelect: DayTimelineProps["onToggleBulkSelect"];
  onToggleDone: (eventId: string, currentStatus: CalendarEvent["status"]) => void;
  onTogglePaid: (eventId: string, currentlyPaid: boolean) => void;
  onUpdatePayment?: DayTimelineProps["onUpdatePayment"];
  onSendReminder: (eventId: string, phone?: string, firstName?: string) => void;

  // Solo sidebar
  onCreateNew: DaySidebarProps["onCreateNew"];
};

export default function DayView({
  currentDate, dayEvents, currentTime,
  timeSlots, dayLabels, TIME_COL,
  gridStartHour,
  studioLocations,
  draggingOver, showAvailableOnly, bulkMode, bulkSelected, searchMatchIds,
  onSlotClick, onContextMenu,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  draggingEventId,
  getDayEventPosition, getFreeWindows, getEventColor,
  onSelectEvent, onToggleBulkSelect,
  onToggleDone, onTogglePaid, onUpdatePayment, onSendReminder,
  onCreateNew,
}: DayViewProps) {
  return (
    <div style={{
      display: "flex",
      gap: 0,
      background: THEME.panelBg,
      border: `2px solid ${THEME.border}`,
      borderRadius: 12,
      minHeight: 600,
      overflow: "clip",
      boxShadow: "0 2px 12px rgba(30,64,175,0.06)",
    }}>
      <DayTimeline
        currentDate={currentDate}
        dayEvents={dayEvents}
        currentTime={currentTime}
        timeSlots={timeSlots}
        dayLabels={dayLabels}
        TIME_COL={TIME_COL}
        gridStartHour={gridStartHour}
        studioLocations={studioLocations}
        draggingOver={draggingOver}
        showAvailableOnly={showAvailableOnly}
        bulkMode={bulkMode}
        bulkSelected={bulkSelected}
        searchMatchIds={searchMatchIds}
        onSlotClick={onSlotClick}
        onContextMenu={onContextMenu}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        draggingEventId={draggingEventId}
        getDayEventPosition={getDayEventPosition}
        getFreeWindows={getFreeWindows}
        getEventColor={getEventColor}
        onSelectEvent={onSelectEvent}
        onToggleBulkSelect={onToggleBulkSelect}
        onToggleDone={onToggleDone}
        onTogglePaid={onTogglePaid}
        onUpdatePayment={onUpdatePayment}
        onSendReminder={onSendReminder}
      />
      <DaySidebar
        currentDate={currentDate}
        dayEvents={dayEvents}
        onSelectEvent={onSelectEvent}
        onCreateNew={onCreateNew}
        onToggleDone={onToggleDone}
        onTogglePaid={onTogglePaid}
        onUpdatePayment={onUpdatePayment}
        onSendReminder={onSendReminder}
      />
    </div>
  );
}
