// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/useEventResize.ts
// ═══════════════════════════════════════════════════════════════════════
// Tappa B: resize della DURATA di un appuntamento trascinando il bordo
// inferiore della card (handle "ns-resize").
//
// Flusso:
//   1. La vista chiama startResize(event, clientY, pxPerMin) al pointerdown
//      sull'handle. pxPerMin = height della card / durata in minuti, così
//      l'hook è agnostico rispetto alla scala verticale della vista
//      (WeekView e DayTimelineMulti hanno scale diverse).
//   2. pointermove globale → delta px → minuti, con SNAP a slotMinutes e
//      durata minima 15'. Il delta è esposto come resizePreview alla vista,
//      che allunga/accorcia la card in tempo reale.
//   3. pointerup → validazione conflitti (moveValidation, come il drop),
//      rispetto di overlap_mode, poi UPDATE end_at e ricarica.
//
// Pointer events → funziona anche su touch (tablet).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
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

const MIN_DURATION_MIN = 15;

type ResizingState = {
  id: string;
  startClientY: number;
  startAt: Date;
  originalEnd: Date;
  pxPerMin: number;
};

export interface UseEventResizeOptions {
  currentDate: Date;
  loadAppointments: (startDate: Date, endDate: Date, retryCount?: number) => Promise<void>;
  setError: Dispatch<SetStateAction<string>>;
  events?: CalendarEvent[];
  slotMinutes?: number;
  overlapMode?: "warn" | "block" | "visual";
  multiOperatorEnabled?: boolean;
  multiRoomEnabled?: boolean;
  unavailabilities?: Array<{
    operator_id: string;
    start_at: Date;
    end_at: Date;
    reason: string | null;
    all_day: boolean;
  }>;
}

export interface UseEventResizeReturn {
  /** id dell'evento in resize (null = nessuno) */
  resizingId: string | null;
  /** Preview da passare alle viste: {id, deltaMin} o null */
  resizePreview: { id: string; deltaMin: number } | null;
  /** Da collegare al pointerdown dell'handle nella card */
  startResize: (event: CalendarEvent, clientY: number, pxPerMin: number) => void;
}

export function useEventResize(options: UseEventResizeOptions): UseEventResizeReturn {
  const {
    currentDate,
    loadAppointments,
    setError,
    events,
    slotMinutes = 30,
    overlapMode = "warn",
    multiOperatorEnabled = false,
    multiRoomEnabled = false,
    unavailabilities,
  } = options;

  const [resizing, setResizing] = useState<ResizingState | null>(null);
  const [deltaMin, setDeltaMin] = useState(0);
  const deltaRef = useRef(0);

  const startResize = useCallback(
    (event: CalendarEvent, clientY: number, pxPerMin: number) => {
      if (!pxPerMin || pxPerMin <= 0) return;
      setResizing({
        id: event.id,
        startClientY: clientY,
        startAt: event.start,
        originalEnd: event.end,
        pxPerMin,
      });
      deltaRef.current = 0;
      setDeltaMin(0);
    },
    []
  );

  useEffect(() => {
    if (!resizing) return;

    const origDurMin =
      (resizing.originalEnd.getTime() - resizing.startAt.getTime()) / 60000;
    const step = slotMinutes === 15 ? 15 : 30;

    const onMove = (e: PointerEvent) => {
      const rawMin = (e.clientY - resizing.startClientY) / resizing.pxPerMin;
      let d = Math.round(rawMin / step) * step;
      if (origDurMin + d < MIN_DURATION_MIN) d = MIN_DURATION_MIN - origDurMin;
      deltaRef.current = d;
      setDeltaMin(d);
    };

    const onUp = async () => {
      const d = deltaRef.current;
      const r = resizing;
      setResizing(null);
      setDeltaMin(0);
      deltaRef.current = 0;
      if (!d) return;

      const ns = r.startAt.getTime();
      const ne = r.originalEnd.getTime() + d * 60000;

      const moved = events?.find(ev => ev.id === r.id) ?? null;
      if (overlapMode !== "visual" && moved && events && events.length > 0) {
        const problems = validateEventMove({
          movingId: r.id,
          targetOperatorId: moved.operator_id ?? null,
          targetRoomId: moved.room_id ?? null,
          ns, ne, events,
          multiOperatorEnabled,
          multiRoomEnabled,
          unavailabilities,
        });
        if (problems.length > 0) {
          if (overlapMode === "block") {
            setError(`Durata non modificata: ${problems[0]}.`);
            return;
          }
          const ok = window.confirm(
            `⚠ Attenzione: ${problems[0]}.\n\nModificare comunque la durata?`
          );
          if (!ok) return;
        }
      }

      setError("");
      const { error } = await supabase
        .from("appointments")
        .update({ end_at: new Date(ne).toISOString() })
        .eq("id", r.id);

      if (error) {
        setError(`Errore modifica durata: ${translateError(error)}`);
      } else {
        const startOfWeek = startOfISOWeekMonday(currentDate);
        const endOfWeek = addDays(startOfWeek, 7);
        await loadAppointments(startOfWeek, endOfWeek);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizing, slotMinutes, events, overlapMode, multiOperatorEnabled, multiRoomEnabled, unavailabilities, currentDate, loadAppointments, setError]);

  return {
    resizingId: resizing?.id ?? null,
    resizePreview: resizing ? { id: resizing.id, deltaMin } : null,
    startResize,
  };
}
