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

import { useState, useMemo, useEffect } from "react";
import { THEME, type CalendarEvent } from "../../utils";
import DayTimeline, { type DayTimelineProps } from "./DayTimeline";
import DayTimelineMulti, { type OperatorUnavailabilitySlot } from "./DayTimelineMulti";
import DayTimelineSplit from "./DayTimelineSplit";
import DaySidebar, { type DaySidebarProps } from "./DaySidebar";
import type { StudioMember } from "@/src/contexts/StudioContext";

export type DayViewProps = {
  // Sezione comune
  currentDate: Date;
  /** Eventi del giorno (filtrati e ordinati dal parent, esclusi i cancellati).
   *  ATTENZIONE: dal parent arrivano SOLO gli appuntamenti del titolare —
   *  quelli dei professionisti ospiti sono già stati esclusi via filteredEvents.
   *  Gli appt ospite arrivano separati in dayGuestEvents (vedi sotto). */
  dayEvents: CalendarEvent[];
  /** Eventi del giorno dei professionisti ospiti (mig. 029). Già filtrati per
   *  data corrente, esclusi i cancellati. Usati SOLO per popolare la colonna
   *  destra dello split. Quando vuoti, il calendario è in vista normale. */
  dayGuestEvents?: CalendarEvent[];
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
  /** Mappa room_id → color. Se passata, le card usano colore stanza al posto
   *  del colore operatore (Fase Stanze). */
  roomColorMap?: Map<string, string>;
  /** Indisponibilità del giorno corrente (ferie, pause) per la vista multi.
   *  Lette dal page.tsx con una query semplice; in Fase 4a la creazione
   *  delle indisponibilità non è prevista (sarà Fase 5). */
  unavailabilities?: OperatorUnavailabilitySlot[];

  /** Professionisti ospiti attivi dello studio (mig. 029). Se nella giornata
   *  corrente c'è almeno un appuntamento di un ospite, la vista si splitta
   *  in due colonne: titolare a sinistra, ospite a destra. La modalità split
   *  ha PRIORITÀ su quella multi-operatore: se entrambe sarebbero attivabili,
   *  vince la split (multi-op presuppone un setup molto diverso). */
  guestPractitioners?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    specialty: string;
    display_color: string | null;
    default_room_id: string | null;
  }>;

  // Per timeline (single-op)
  timeSlots: DayTimelineProps["timeSlots"];
  dayLabels: DayTimelineProps["dayLabels"];
  TIME_COL: DayTimelineProps["TIME_COL"];
  gridStartHour?: DayTimelineProps["gridStartHour"];
  slotMinutes?: number;
  studioLocations?: DayTimelineProps["studioLocations"];
  draggingOver: DayTimelineProps["draggingOver"];
  showAvailableOnly: DayTimelineProps["showAvailableOnly"];
  bulkMode: DayTimelineProps["bulkMode"];
  bulkSelected: DayTimelineProps["bulkSelected"];
  searchMatchIds: DayTimelineProps["searchMatchIds"];
  onSlotClick: DayTimelineProps["onSlotClick"];
  /** Click su slot in vista multi-op (con operatorId). Se non passato,
   *  cade in onSlotClick con operatorId = null (= mantiene comportamento legacy).
   *  Tappa B: roomId per la modalità colonne=Stanze. */
  onSlotClickMulti?: (date: Date, hour: number, minute: number, operatorId: string | null, roomId?: string | null) => void;
  // ─── Tappa B: DayTimelineMulti — colonne Stanze, d&d, resize ────────────
  columnMode?: "operators" | "rooms";
  onColumnModeChange?: (mode: "operators" | "rooms") => void;
  rooms?: Array<{ id: string; name: string; color: string | null }>;
  onDropAssign?: (
    e: React.DragEvent, targetDate: Date, targetHour: number, targetMinute: number,
    assign: { operatorKey?: string | null; roomId?: string | null }
  ) => void;
  onResizeStart?: (event: CalendarEvent, clientY: number, pxPerMin: number) => void;
  resizePreview?: { id: string; deltaMin: number } | null;
  /** Click su slot della colonna ospite in vista split (mig. 029).
   *  Se non passato, cade in onSlotClick (= mantiene comportamento legacy).
   *  Quando passato, il parent può pre-selezionare createGuestPractitionerId
   *  prima di aprire il modale. */
  onSlotClickGuest?: (date: Date, hour: number, minute: number, guestId: string) => void;
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
  currentDate, dayEvents, dayGuestEvents, currentTime,
  multiOperatorMode, members, roomColorMap, unavailabilities,
  guestPractitioners,
  timeSlots, dayLabels, TIME_COL,
  gridStartHour,
  slotMinutes = 30,
  studioLocations,
  draggingOver, showAvailableOnly, bulkMode, bulkSelected, searchMatchIds,
  onSlotClick, onSlotClickMulti, onSlotClickGuest, onContextMenu,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  draggingEventId,
  columnMode, onColumnModeChange, rooms, onDropAssign, onResizeStart, resizePreview,
  getDayEventPosition, getFreeWindows, getEventColor,
  onSelectEvent, onToggleBulkSelect,
  onToggleDone, onTogglePaid, onUpdatePayment, onSendReminder,
  onCreateNew,
}: DayViewProps) {
  // Decide quale timeline renderizzare. La condizione è qui (non in page.tsx)
  // perché DayView è il componente "switch" per le varianti.
  const useMulti = !!multiOperatorMode && members && members.length >= 2;

  // ── Rilevamento ospiti presenti nel giorno (mig. 029 + switcher 5c) ────
  // dayGuestEvents arriva già filtrato per giorno corrente dal parent.
  // Raccogliamo TUTTI gli ospiti distinti che hanno appuntamenti nel giorno
  // (multi-ospite), ordinati per orario del primo appuntamento. Ogni voce
  // contiene anche il count di appuntamenti per il dropdown.
  const guestsInDay = useMemo(() => {
    if (!dayGuestEvents || dayGuestEvents.length === 0) return [];
    if (!guestPractitioners || guestPractitioners.length === 0) return [];
    // Conta + traccia primo orario per ospite
    const map = new Map<string, { firstStart: number; count: number }>();
    for (const ev of dayGuestEvents) {
      if (!ev.guest_practitioner_id) continue;
      const existing = map.get(ev.guest_practitioner_id);
      if (existing) {
        existing.count++;
        if (ev.start.getTime() < existing.firstStart) {
          existing.firstStart = ev.start.getTime();
        }
      } else {
        map.set(ev.guest_practitioner_id, { firstStart: ev.start.getTime(), count: 1 });
      }
    }
    // Risolvi i guest_practitioner_id contro la lista guestPractitioners,
    // ordinati per primo orario (ASC) → prima l'ospite del mattino, ecc.
    return Array.from(map.entries())
      .map(([id, info]) => {
        const g = guestPractitioners.find(gp => gp.id === id);
        if (!g) return null;
        return { ...g, appointmentCount: info.count, firstStart: info.firstStart };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => a.firstStart - b.firstStart);
  }, [dayGuestEvents, guestPractitioners]);

  // State: ospite selezionato per la visualizzazione. Default = primo ospite
  // della lista (quello col primo appuntamento del giorno). Quando cambia
  // il giorno o la lista, ri-inizializziamo.
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(
    guestsInDay[0]?.id ?? null
  );
  useEffect(() => {
    // Se l'ospite selezionato non è più nella lista del giorno corrente
    // (cambio giorno o ospite disattivato), seleziona il primo.
    if (guestsInDay.length === 0) {
      setSelectedGuestId(null);
      return;
    }
    if (!selectedGuestId || !guestsInDay.find(g => g.id === selectedGuestId)) {
      setSelectedGuestId(guestsInDay[0].id);
    }
  }, [guestsInDay, selectedGuestId]);

  // L'ospite attualmente visualizzato (oggetto completo)
  const guestInDay = selectedGuestId
    ? guestsInDay.find(g => g.id === selectedGuestId) ?? null
    : null;
  const useSplit = !!guestInDay && !useMulti;

  // Eventi divisi per le due colonne. In split mode:
  //   - colonna sinistra = dayEvents (già SOLO appt titolare, filtrati dal parent)
  //   - colonna destra = dayGuestEvents filtrati per il guest SELEZIONATO
  const guestEvents = useSplit && dayGuestEvents
    ? dayGuestEvents.filter(e => e.guest_practitioner_id === guestInDay!.id)
    : [];

  // Il "separateBoxes" è il pattern visuale "due rettangoli autonomi con gap"
  // (calendario a sinistra, sidebar a destra). Lo usiamo sia in split mode
  // (mig. 029) sia in single-operatore: in entrambi i casi calendario e
  // sidebar sono concettualmente cose distinte. Solo nella multi-operator
  // view manteniamo il container unico (perché la timeline multi è "estesa"
  // e non ha una sidebar fissa accanto).
  const separateBoxes = useSplit || (!useMulti);

  return (
    <div style={{
      display: "flex",
      gap: separateBoxes ? 16 : 0,
      background: separateBoxes ? "transparent" : THEME.panelBg,
      border: separateBoxes ? "none" : `2px solid ${THEME.border}`,
      borderRadius: separateBoxes ? 0 : 12,
      minHeight: 600,
      // maxWidth solo per single-operatore non-split (limita a ~1480px per
      // leggibilità). In split e multi useremo tutta la larghezza disponibile.
      maxWidth: useMulti || useSplit ? undefined : 1480,
      margin: useMulti || useSplit ? undefined : "0 auto",
      overflow: separateBoxes ? "visible" : "clip",
      boxShadow: separateBoxes ? "none" : "0 2px 12px rgba(30,64,175,0.06)",
    }}>
      {useMulti ? (
        <DayTimelineMulti
          slotMinutes={slotMinutes}
          currentDate={currentDate}
          dayEvents={dayEvents}
          currentTime={currentTime}
          members={members!}
          roomColorMap={roomColorMap}
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
          columnMode={columnMode}
          onColumnModeChange={onColumnModeChange}
          rooms={rooms}
          onEventDragStart={onDragStart}
          onEventDragEnd={onDragEnd}
          onDropAssign={onDropAssign}
          draggingEventId={draggingEventId}
          onResizeStart={onResizeStart}
          resizePreview={resizePreview}
        />
      ) : useSplit ? (
        // ─── Vista SPLIT (titolare + ospite) — mig. 029 ──────────────
        // Usa un componente dedicato (DayTimelineSplit) che condivide grid
        // a 3 colonne: orari | studio | ospite. Allineamenti perfetti,
        // header unico, righe orarie continue. NON è la DayTimeline normale
        // chiamata 2 volte — è un componente proprio.
        <DayTimelineSplit
          currentDate={currentDate}
          ownerEvents={dayEvents}
          guestEvents={guestEvents}
          guest={{
            id: guestInDay!.id,
            first_name: guestInDay!.first_name,
            last_name: guestInDay!.last_name,
            specialty: guestInDay!.specialty,
            display_color: guestInDay!.display_color,
          }}
          allGuestsInDay={guestsInDay.map(g => ({
            id: g.id,
            first_name: g.first_name,
            last_name: g.last_name,
            specialty: g.specialty,
            display_color: g.display_color,
            appointmentCount: g.appointmentCount,
          }))}
          onSwitchGuest={(guestId) => setSelectedGuestId(guestId)}
          currentTime={currentTime}
          timeSlots={timeSlots}
          dayLabels={dayLabels}
          TIME_COL={TIME_COL}
          gridStartHour={gridStartHour}
          onSlotClick={(date, hour, minute, side) => {
            // Quando si clicca sulla colonna destra dello split (ospite) e
            // il parent ha fornito onSlotClickGuest, lo invochiamo con
            // l'id dell'ospite del giorno → il modale di creazione si
            // aprirà con "Per chi?" preselezionato sull'ospite (mig. 029).
            // Altrimenti deleghiamo al normale onSlotClick.
            if (side === "guest" && onSlotClickGuest && guestInDay) {
              onSlotClickGuest(date, hour, minute, guestInDay.id);
            } else {
              onSlotClick(date, hour, minute);
            }
          }}
          onSelectEvent={onSelectEvent}
        />
      ) : (
        // ─── Vista SINGLE-OPERATOR ──────────────────────────────────────
        // DayTimeline classico avvolto in un box autonomo (bordo+radius+
        // ombra). Insieme alla sidebar wrappata sotto, dà l'aspetto "due
        // riquadri separati con gap" della modalità split.
        <div style={{
          flex: 1,
          minWidth: 0,
          background: THEME.panelBg,
          border: `2px solid ${THEME.border}`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 2px 12px rgba(30,64,175,0.06)",
          display: "flex",
        }}>
          <DayTimeline
            slotMinutes={slotMinutes}
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
        </div>
      )}
      {/* DaySidebar: in modalità "separateBoxes" (split mode mig. 029 e
          single-operator) la avvolgiamo in un wrapper che le aggiunge bordo,
          radius e ombra per renderla visivamente autonoma dal calendario
          (col gap 16 c'è aria in mezzo). In multi-operator nessun wrapper. */}
      {separateBoxes ? (
        <div style={{
          background: THEME.panelBg,
          border: `2px solid ${THEME.border}`,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 2px 12px rgba(30,64,175,0.06)",
          display: "flex",
          flexShrink: 0,
        }}>
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
      ) : (
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
      )}
    </div>
  );
}
