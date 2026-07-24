// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/useRealtimeCalendar.ts
// ═══════════════════════════════════════════════════════════════════════
// Tappa C: aggiornamenti in tempo reale dell'agenda.
//
// PROBLEMA RISOLTO:
// Con più persone sulla stessa agenda (titolare + segreteria + collaboratori)
// ognuno vedeva i dati fermi al proprio ultimo caricamento: due prenotazioni
// sullo stesso slot, o un appuntamento spostato da un collega e invisibile
// finché non si ricaricava la pagina.
//
// COME FUNZIONA:
//   1. Si sottoscrive ai postgres_changes di Supabase su appointments
//      (filtrati per studio_id) e su operator_unavailability.
//   2. Ogni evento ricevuto NON ricarica subito: viene accodato e un
//      debounce (default 700ms) raggruppa le raffiche (es. chi salva
//      più appuntamenti di fila, o un update multiplo).
//   3. Allo scadere del debounce ricarica la finestra visibile in modalità
//      SILENZIOSA (senza spinner): la vista si aggiorna senza sfarfallii.
//   4. Espone lastSyncAt per mostrare un indicatore discreto in toolbar.
//
// SELF-ECHO:
// Anche le modifiche fatte da QUESTO client generano un evento. Non le
// filtriamo per id (fragile e con race condition su update multipli): il
// costo è al più una query in più, già assorbita dal debounce, e il
// beneficio è che lo stato converge sempre a quello reale del database.
//
// SICUREZZA: Realtime rispetta le RLS, si ricevono solo righe leggibili.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

export type RealtimeStatus = "off" | "connecting" | "live" | "error";

export interface UseRealtimeCalendarOptions {
  /** Studio corrente: senza, nessuna sottoscrizione. */
  studioId: string | null;
  /** Ricarica la finestra visibile. Deve essere STABILE (useCallback). */
  reload: () => void | Promise<void>;
  /** Disattiva la sottoscrizione (es. feature flag). Default true. */
  enabled?: boolean;
  /** Finestra di raggruppamento eventi in ms. Default 700. */
  debounceMs?: number;
}

export interface UseRealtimeCalendarReturn {
  /** Stato della connessione, per l'indicatore in toolbar. */
  status: RealtimeStatus;
  /** Timestamp dell'ultima sincronizzazione andata a buon fine. */
  lastSyncAt: Date | null;
  /** true tra la ricezione di un evento e la ricarica (per un pulse UI). */
  syncing: boolean;
}

export function useRealtimeCalendar(
  options: UseRealtimeCalendarOptions
): UseRealtimeCalendarReturn {
  const { studioId, reload, enabled = true, debounceMs = 700 } = options;

  const [status, setStatus] = useState<RealtimeStatus>("off");
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);

  // reload cambia identità a ogni render della finestra visibile: lo teniamo
  // in un ref così il canale NON viene ricreato a ogni cambio data/vista
  // (ricreare la subscription a ogni render = flood di connessioni).
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !studioId) {
      setStatus("off");
      return;
    }

    setStatus("connecting");
    let cancelled = false;

    const scheduleReload = () => {
      pendingRef.current = true;
      setSyncing(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (cancelled) return;
        try {
          await reloadRef.current();
          if (!cancelled) setLastSyncAt(new Date());
        } catch {
          // Errore di ricarica: lo gestisce già loadAppointments (setError).
        } finally {
          if (!cancelled) {
            pendingRef.current = false;
            setSyncing(false);
          }
        }
      }, debounceMs);
    };

    const channel = supabase
      .channel(`agenda:${studioId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `studio_id=eq.${studioId}`,
        },
        scheduleReload
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operator_unavailability",
          filter: `studio_id=eq.${studioId}`,
        },
        scheduleReload
      )
      .subscribe((s: string) => {
        if (cancelled) return;
        if (s === "SUBSCRIBED") setStatus("live");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error");
        else if (s === "CLOSED") setStatus("off");
      });

    // Ritorno da sospensione/tab in background: il socket può aver perso
    // eventi, quindi risincronizziamo appena la tab torna visibile.
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleReload();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
      setStatus("off");
      setSyncing(false);
    };
  }, [studioId, enabled, debounceMs]);

  return { status, lastSyncAt, syncing };
}
