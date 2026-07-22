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
//   - Tappa A multi-op: il drop ora VALIDA i conflitti (stesso operatore,
//     stessa stanza, assenze operatore, overlap generico in single-op)
//     rispettando practice_settings.overlap_mode:
//       "visual" → nessun controllo (comportamento storico)
//       "warn"   → window.confirm prima di spostare
//       "block"  → spostamento negato con messaggio di errore
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

  // ─── Conflict check al drop (Tappa A multi-op/stanza) ──────────────────
  /** Eventi correnti della finestra: servono per verificare i conflitti
   *  di operatore/stanza nel nuovo orario di destinazione. */
  events?: CalendarEvent[];
  /** Comportamento overlap (da practice_settings.overlap_mode):
   *  "block" = impedisce il drop in conflitto; "warn" = chiede conferma;
   *  "visual" = nessun controllo (comportamento storico). Default "warn". */
  overlapMode?: "warn" | "block" | "visual";
  multiOperatorEnabled?: boolean;
  multiRoomEnabled?: boolean;
  /** Assenze operatore (ferie/malattia) della finestra corrente. */
  unavailabilities?: Array<{
    operator_id: string;
    start_at: Date;
    end_at: Date;
    reason: string | null;
    all_day: boolean;
  }>;
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
    events,
    overlapMode = "warn",
    multiOperatorEnabled = false,
    multiRoomEnabled = false,
    unavailabilities,
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

      // ─── Conflict check (Tappa A) ────────────────────────────────────
      // Il drag&drop storicamente non validava nulla: ora, coerentemente
      // con il modale crea/modifica, verifichiamo prima dell'UPDATE:
      //   • sovrapposizione stesso OPERATORE (se multi-op)
      //   • sovrapposizione stessa STANZA (se multi-stanza)
      //   • sovrapposizione generica (se single-op, come l'overlapWarning
      //     del modale)
      //   • ASSENZA dell'operatore (ferie/malattia) nel nuovo orario
      // Comportamento secondo overlap_mode: "visual" = nessun controllo
      // (comportamento storico), "warn" = confirm, "block" = drop negato.
      if (overlapMode !== "visual") {
        const moved = events?.find(e => e.id === apptId) ?? null;
        const ns = newStart.getTime();
        const ne = newEnd.getTime();
        const problems: string[] = [];

        if (moved && events && events.length > 0) {
          for (const ev of events) {
            if (ev.id === apptId) continue;
            if (ev.status === "cancelled") continue;
            const evS = ev.start.getTime();
            const evE = ev.end.getTime();
            const overlaps = !(evE <= ns || evS >= ne);
            if (!overlaps) continue;

            const hhmm = `${ev.start.getHours().toString().padStart(2, "0")}:${ev.start.getMinutes().toString().padStart(2, "0")}`;
            if (multiOperatorEnabled) {
              if (moved.operator_id && ev.operator_id === moved.operator_id) {
                problems.push(`stesso operatore già occupato con ${ev.patient_name} alle ${hhmm}`);
              }
              if (multiRoomEnabled && moved.room_id && ev.room_id === moved.room_id) {
                problems.push(`stanza già occupata da ${ev.patient_name} alle ${hhmm}`);
              }
            } else {
              // Single-op: qualsiasi sovrapposizione è rilevante.
              problems.push(`sovrapposizione con ${ev.patient_name} alle ${hhmm}`);
            }
            if (problems.length > 0) break; // basta il primo conflitto
          }
        }

        // Assenza operatore nel nuovo orario
        if (
          problems.length === 0 &&
          multiOperatorEnabled &&
          moved?.operator_id &&
          unavailabilities &&
          unavailabilities.length > 0
        ) {
          const abs = unavailabilities.find(u =>
            u.operator_id === moved.operator_id &&
            !(u.end_at.getTime() <= ns || u.start_at.getTime() >= ne)
          );
          if (abs) {
            problems.push(
              `l'operatore risulta assente in quell'orario${abs.reason ? ` (${abs.reason})` : ""}`
            );
          }
        }

        if (problems.length > 0) {
          if (overlapMode === "block") {
            setError(`Spostamento annullato: ${problems[0]}.`);
            setDraggingEvent(null);
            return;
          }
          // warn → chiedi conferma
          const ok = window.confirm(
            `⚠ Attenzione: ${problems[0]}.\n\nSpostare comunque l'appuntamento?`
          );
          if (!ok) {
            setDraggingEvent(null);
            return;
          }
        }
      }

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
    [draggingEvent, currentDate, loadAppointments, setError, events, overlapMode, multiOperatorEnabled, multiRoomEnabled, unavailabilities]
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
