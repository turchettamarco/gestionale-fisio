// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/useDragAndDrop.ts
// ═══════════════════════════════════════════════════════════════════════
// Cos'è:
//   Hook che gestisce il drag-and-drop degli appuntamenti tra slot
//   della griglia calendario. Estratto da calendar/page.tsx
//   (refactor B3.6).
//
// Dove si usa:
//   In app/(protected)/calendar/page.tsx, dopo useCalendarEvents (per
//   loadAppointments) e dopo i ref di tooltip (per nasconderlo durante
//   il drag).
//
// Cosa fa:
//   - Stato: draggingEvent (id + start/end originali), draggingOver
//     (slot di hover), dragGhostPos (posizione cursore per ghost)
//   - handleDragStart: salva l'evento trascinato, riduce opacità/scala
//     della card, nasconde immediatamente il tooltip hover
//   - handleDragOver: traccia slot e posizione cursore, evidenzia il
//     drop target
//   - handleDragLeave: pulisce evidenziazione drop target
//   - handleDrop: calcola nuovo start/end mantenendo durata, fa UPDATE
//     su Supabase, ricarica la settimana corrente
//   - handleDragEnd: ripristina stile della card, pulisce stati
//
// Dipendenze:
//   - currentDate (events): per ricaricare la settimana corretta dopo drop
//   - loadAppointments (events): refresh
//   - setError (events): propaga errori
//   - setHoverTooltip, hoverTimer (pagina): per nascondere il tooltip
//     all'inizio del drag
//
// Note:
//   - Zero modifiche di comportamento rispetto al codice originale.
//   - Il drag-and-drop NON valida l'overlap con altri appuntamenti
//     (comportamento storico): l'utente può sovrapporre via DnD.
//     Lo strumento di prevenzione overlap è solo la creazione/modifica
//     da modale.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { translateError } from "@/src/lib/translateError";
import {
  addDays,
  startOfISOWeekMonday,
  type CalendarEvent,
} from "@/app/(protected)/calendar/utils";

/* ─── tipi ─── */

export type DraggingEvent = {
  id: string;
  originalStart: Date;
  originalEnd: Date;
};

export type DraggingOver = {
  dayIndex: number;
  hour: number;
  minute: number;
};

export type HoverTooltipState = {
  event: CalendarEvent;
  x: number;
  y: number;
} | null;

export interface UseDragAndDropOptions {
  currentDate: Date;
  loadAppointments: (
    startDate: Date,
    endDate: Date,
    retryCount?: number
  ) => Promise<void>;
  setError: Dispatch<SetStateAction<string>>;
  setHoverTooltip: Dispatch<SetStateAction<HoverTooltipState>>;
  hoverTimer: MutableRefObject<any>;
}

export interface UseDragAndDropReturn {
  // Stato
  draggingEvent: DraggingEvent | null;
  setDraggingEvent: Dispatch<SetStateAction<DraggingEvent | null>>;
  draggingOver: DraggingOver | null;
  setDraggingOver: Dispatch<SetStateAction<DraggingOver | null>>;
  dragGhostPos: { x: number; y: number } | null;
  setDragGhostPos: Dispatch<SetStateAction<{ x: number; y: number } | null>>;

  // Handler
  handleDragStart: (
    event: React.DragEvent,
    apptId: string,
    originalStart: Date,
    originalEnd: Date
  ) => void;
  handleDragOver: (
    event: React.DragEvent,
    dayIndex?: number,
    hour?: number,
    minute?: number
  ) => void;
  handleDragLeave: (event: React.DragEvent) => void;
  handleDrop: (
    event: React.DragEvent,
    targetDate: Date,
    targetHour: number,
    targetMinute?: number
  ) => Promise<void>;
  handleDragEnd: (event: React.DragEvent) => void;
}

/* ─── hook ─── */

export function useDragAndDrop(
  options: UseDragAndDropOptions
): UseDragAndDropReturn {
  const {
    currentDate,
    loadAppointments,
    setError,
    setHoverTooltip,
    hoverTimer,
  } = options;

  /* ─── Stato ─── */
  const [draggingEvent, setDraggingEvent] = useState<DraggingEvent | null>(
    null
  );
  const [draggingOver, setDraggingOver] = useState<DraggingOver | null>(null);
  const [dragGhostPos, setDragGhostPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  /* ─── Handler ─── */
  const handleDragStart = useCallback(
    (
      event: React.DragEvent,
      apptId: string,
      originalStart: Date,
      originalEnd: Date
    ) => {
      setDraggingEvent({ id: apptId, originalStart, originalEnd });
      // Nascondi subito il tooltip — non deve interferire con il drag
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setHoverTooltip(null);
      event.dataTransfer.setData("text/plain", apptId);
      event.dataTransfer.effectAllowed = "move";

      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.style.opacity = "0.35";
        event.currentTarget.style.transform = "scale(0.96)";
      }
    },
    [hoverTimer, setHoverTooltip]
  );

  const handleDragOver = useCallback(
    (
      event: React.DragEvent,
      dayIndex?: number,
      hour?: number,
      minute: number = 0
    ) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      if (dayIndex !== undefined && hour !== undefined) {
        setDraggingOver({ dayIndex, hour, minute });
      }

      // Track ghost position for visual feedback
      setDragGhostPos({ x: event.clientX, y: event.clientY });

      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.style.backgroundColor = "rgba(37,99,235,0.08)";
        event.currentTarget.style.transition = "background-color 0.15s ease";
      }
    },
    []
  );

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    setDraggingOver(null);
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.backgroundColor = "transparent";
    }
  }, []);

  const handleDrop = useCallback(
    async (
      event: React.DragEvent,
      targetDate: Date,
      targetHour: number,
      targetMinute: number = 0
    ) => {
      event.preventDefault();
      setDraggingOver(null);

      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.style.backgroundColor = "transparent";
      }

      if (!draggingEvent) return;

      const apptId = event.dataTransfer.getData("text/plain");
      if (apptId !== draggingEvent.id) return;

      const newStart = new Date(targetDate);
      newStart.setHours(targetHour, targetMinute, 0, 0);

      const duration =
        draggingEvent.originalEnd.getTime() -
        draggingEvent.originalStart.getTime();
      const newEnd = new Date(newStart.getTime() + duration);

      setError("");

      const { error } = await supabase
        .from("appointments")
        .update({
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
        })
        .eq("id", apptId);

      if (error) {
        setError(`Errore spostamento: ${translateError(error)}`);
      } else {
        const startOfWeek = startOfISOWeekMonday(currentDate);
        const endOfWeek = addDays(startOfWeek, 7);
        await loadAppointments(startOfWeek, endOfWeek);
      }

      setDraggingEvent(null);
    },
    [draggingEvent, currentDate, loadAppointments, setError]
  );

  const handleDragEnd = useCallback((event: React.DragEvent) => {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = "1";
      event.currentTarget.style.transform = "scale(1)";
    }
    setDraggingEvent(null);
    setDragGhostPos(null);
    setDraggingOver(null);
  }, []);

  return {
    // Stato
    draggingEvent,
    setDraggingEvent,
    draggingOver,
    setDraggingOver,
    dragGhostPos,
    setDragGhostPos,

    // Handler
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}
