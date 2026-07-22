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
import { validateEventMove } from "./moveValidation";
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
  /**
   * Tappa B: drop con RIASSEGNAZIONE. Come handleDrop, ma la colonna di
   * destinazione determina anche il nuovo operatore (DayTimelineMulti in
   * modalità operatori) o la nuova stanza (modalità stanze).
   *   assign.operatorKey: user_id | null ("Non assegnati") | undefined (non toccare)
   *   assign.roomId:      room_id | null ("Senza stanza")  | undefined (non toccare)
   */
  handleDropAssign: (
    event: React.DragEvent,
    targetDate: Date,
    targetHour: number,
    targetMinute: number,
    assign: { operatorKey?: string | null; roomId?: string | null }
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
        const problems: string[] = moved && events && events.length > 0
          ? validateEventMove({
              movingId: apptId,
              targetOperatorId: moved.operator_id ?? null,
              targetRoomId: moved.room_id ?? null,
              ns, ne, events,
              multiOperatorEnabled, multiRoomEnabled, unavailabilities,
            })
          : [];

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

  // ─── Tappa B: drop con riassegnazione (DayTimelineMulti) ───────────────
  // Drop su una colonna operatore = cambia orario E operator_id.
  // Drop su una colonna stanza    = cambia orario E room_id.
  // Guardrail:
  //   • colonne pending → drop rifiutato (non si assegna a non registrati)
  //   • eventi ospite   → mai operator_id (constraint operator_xor_guest);
  //     consentito solo il drop su "Non assegnati" (solo cambio orario)
  const handleDropAssign = useCallback(
    async (
      event: React.DragEvent,
      targetDate: Date,
      targetHour: number,
      targetMinute: number,
      assign: { operatorKey?: string | null; roomId?: string | null }
    ) => {
      event.preventDefault();
      setDraggingOver(null);
      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.style.backgroundColor = "transparent";
      }
      if (!draggingEvent) return;
      const apptId = event.dataTransfer.getData("text/plain");
      if (apptId !== draggingEvent.id) return;

      const moved = events?.find(e => e.id === apptId) ?? null;
      const movedGuestId = (moved as { guest_practitioner_id?: string | null } | null)?.guest_practitioner_id ?? null;

      if (assign.operatorKey && assign.operatorKey.startsWith("pending:")) {
        setError("Non puoi assegnare appuntamenti a un collega non ancora registrato.");
        setDraggingEvent(null);
        return;
      }
      if (movedGuestId && assign.operatorKey !== undefined && assign.operatorKey !== null) {
        setError("Gli appuntamenti degli ospiti non possono essere assegnati a un operatore del team.");
        setDraggingEvent(null);
        return;
      }

      const newStart = new Date(targetDate);
      newStart.setHours(targetHour, targetMinute, 0, 0);
      const duration =
        draggingEvent.originalEnd.getTime() -
        draggingEvent.originalStart.getTime();
      const newEnd = new Date(newStart.getTime() + duration);

      // Operatore/stanza EFFETTIVI di destinazione per la validazione
      const effOperatorId = movedGuestId
        ? null
        : assign.operatorKey !== undefined
          ? assign.operatorKey
          : (moved?.operator_id ?? null);
      const effRoomId = assign.roomId !== undefined
        ? assign.roomId
        : (moved?.room_id ?? null);

      if (overlapMode !== "visual" && moved && events && events.length > 0) {
        const problems = validateEventMove({
          movingId: apptId,
          targetOperatorId: effOperatorId,
          targetRoomId: effRoomId,
          ns: newStart.getTime(),
          ne: newEnd.getTime(),
          events,
          multiOperatorEnabled,
          multiRoomEnabled,
          unavailabilities,
        });
        if (problems.length > 0) {
          if (overlapMode === "block") {
            setError(`Spostamento annullato: ${problems[0]}.`);
            setDraggingEvent(null);
            return;
          }
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
      const payload: Record<string, unknown> = {
        start_at: newStart.toISOString(),
        end_at: newEnd.toISOString(),
      };
      if (assign.operatorKey !== undefined && !movedGuestId) {
        payload.operator_id = assign.operatorKey; // null = "Non assegnati"
      }
      if (assign.roomId !== undefined) {
        payload.room_id = assign.roomId; // null = "Senza stanza"
      }

      const { error } = await supabase
        .from("appointments")
        .update(payload)
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
    handleDropAssign,
    handleDragEnd,
  };
}
