"use client";
// ═══════════════════════════════════════════════════════════════════════
// ActivityTracker
// ═══════════════════════════════════════════════════════════════════════
//
// Componente invisibile che invia un heartbeat al server ogni 5 minuti
// per tracciare l'attività reale dell'utente nel gestionale.
// Lo studio dell'utente avrà studios.last_active_at aggiornato e
// visibile nel pannello admin.
//
// COMPORTAMENTO:
// - Primo heartbeat: 30 secondi dopo il mount (per evitare di sovraccaricare
//   il DB se l'utente apre/chiude pagine in fretta).
// - Successivi: ogni 5 minuti.
// - Pause quando la tab è in background (visibilitychange): risparmia richieste.
// - Resume immediato quando la tab torna in primo piano.
// - Errori silenziosi: se l'API fallisce, l'utente non se ne accorge.
//
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from "react";

const FIRST_DELAY_MS = 30_000;       // 30 secondi al mount
const INTERVAL_MS = 5 * 60_000;      // 5 minuti

export default function ActivityTracker() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function sendHeartbeat() {
      if (cancelled) return;
      try {
        await fetch("/api/heartbeat", {
          method: "POST",
          credentials: "include",
        });
        lastSentRef.current = Date.now();
      } catch {
        // silenzioso: se fallisce, riproveremo al prossimo intervallo
      }
    }

    function scheduleNext(delayMs: number) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await sendHeartbeat();
        if (!cancelled) scheduleNext(INTERVAL_MS);
      }, delayMs);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // tab tornata in primo piano: invia heartbeat se sono passati > 5 min
        const elapsed = Date.now() - lastSentRef.current;
        if (elapsed > INTERVAL_MS) {
          sendHeartbeat();
        }
        // riprende il polling normale
        scheduleNext(INTERVAL_MS);
      } else {
        // tab nascosta: ferma il polling
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    }

    // Primo heartbeat dopo 30 secondi
    scheduleNext(FIRST_DELAY_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Componente invisibile, nessun rendering
  return null;
}
