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
import DayTimelineMulti, { type OperatorUnavailabilitySlot } from "./DayTimelineMulti";
import DaySidebar, { type DaySidebarProps } from "./DaySidebar";
import type { StudioMember } from "@/src/contexts/StudioContext";

export type DayViewProps = {
  // Sezione comune
  currentDate: Date;
  /** Eventi del giorno (filtrati e ordinati dal parent, esclusi i cancellati) */
  dayEvents: CalendarEvent[];
  /** Tempo corrente (per linea "now") */
  currentTime: Date;

  /** Multi-operatore (mig. 019, Fase 4a). Quando true, renderizza
   *  DayTimelineMulti con N colonne operatore invece del DayTimeline classico.
   *  Si attiva solo se il flag studio.multi_operator_enabled è ON E ci sono
   *  almeno 2 membri attivi nel team (decisione di design: con 1 solo membro
   *  la vista multi non aggiungerebbe informazione). */
  multiOperatorMode?: boolean;
  /** Membri del team (passati solo se multiOperatorMode = true) */
  members?: StudioMember[];
  /** Indisponibilità del giorno corrente (ferie, pause) per la vista multi.
   *  Lette dal page.tsx con una query semplice; in Fase 4a la creazione
   *  delle indisponibilità non è prevista (sarà Fase 5). */
  unavailabilities?: OperatorUnavailabilitySlot[];

  // Per timeline (single-op)
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
  /** Click su slot in vista multi-op (con operatorId). Se non passato,
   *  cade in onSlotClick con operatorId = null (= mantiene comportamento legacy). */
  onSlotClickMulti?: (date: Date, hour: number, minute: number, operatorId: string | null) => void;
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
  multiOperatorMode, members, unavailabilities,
  timeSlots, dayLabels, TIME_COL,
  gridStartHour,
  studioLocations,
  draggingOver, showAvailableOnly, bulkMode, bulkSelected, searchMatchIds,
  onSlotClick, onSlotClickMulti, onContextMenu,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  draggingEventId,
  getDayEventPosition, getFreeWindows, getEventColor,
  onSelectEvent, onToggleBulkSelect,
  onToggleDone, onTogglePaid, onUpdatePayment, onSendReminder,
  onCreateNew,
}: DayViewProps) {
  // Decide quale timeline renderizzare. La condizione è qui (non in page.tsx)
  // perché DayView è il componente "switch" per le due varianti.
  const useMulti = !!multiOperatorMode && members && members.length >= 2;

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
      {useMulti ? (
        <DayTimelineMulti
          currentDate={currentDate}
          dayEvents={dayEvents}
          currentTime={currentTime}
          members={members!}
          unavailabilities={unavailabilities ?? []}
          timeSlots={timeSlots}
          TIME_COL={TIME_COL}
          gridStartHour={gridStartHour}
          studioLocations={studioLocations}
          searchMatchIds={searchMatchIds}
          onSlotClick={onSlotClickMulti ?? ((d, h, m, _opId) => onSlotClick(d, h, m))}
          onContextMenu={onContextMenu}
          onSelectEvent={onSelectEvent}
          onToggleDone={onToggleDone}
          onTogglePaid={onTogglePaid}
          onUpdatePayment={onUpdatePayment}
          onSendReminder={onSendReminder}
        />
      ) : (
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
      )}
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
