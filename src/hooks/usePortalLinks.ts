// src/hooks/usePortalLinks.ts
// ═══════════════════════════════════════════════════════════════════════
// Precarica i link all'area riservata dei pazienti visibili.
//
// PERCHÉ ESISTE:
// sendReminder nei client mobile è volutamente SINCRONO: apre WhatsApp
// direttamente dal gesto dell'utente, senza await in mezzo, altrimenti
// Safari iOS blocca l'apertura. Quindi al momento del click il link
// all'area riservata deve essere già disponibile, non recuperabile.
//
// Questo hook lo risolve caricando i token in un colpo solo (una sola
// chiamata per l'intero elenco) appena la lista appuntamenti è pronta.
// Se il caricamento fallisce restituisce una mappa vuota: i promemoria
// partono comunque, semplicemente senza il link all'area.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";

export function usePortalLinks(patientIds: Array<string | null | undefined>): Record<string, string> {
  const [links, setLinks] = useState<Record<string, string>>({});
  // Id già richiesti: evita di richiamare l'endpoint a ogni render
  const requested = useRef<Set<string>>(new Set());

  // Chiave stabile: l'array cambia identità a ogni render, il contenuto no
  const key = useMemo(() => {
    const unique = Array.from(new Set(patientIds.filter(Boolean) as string[]));
    unique.sort();
    return unique.join(",");
  }, [patientIds]);

  useEffect(() => {
    if (typeof window === "undefined" || !key) return;

    const ids = key.split(",").filter(id => !requested.current.has(id));
    if (ids.length === 0) return;
    ids.forEach(id => requested.current.add(id));

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patient_ids: ids }),
        });
        const json = await res.json();
        if (cancelled || !res.ok || !json?.links) return;

        const origin = window.location.origin;
        const mapped: Record<string, string> = {};
        for (const [patientId, token] of Object.entries(json.links as Record<string, string>)) {
          mapped[patientId] = `${origin}/portale/${token}`;
        }
        setLinks(prev => ({ ...prev, ...mapped }));
      } catch {
        // Silenzio: il promemoria deve poter partire lo stesso.
      }
    })();

    return () => { cancelled = true; };
  }, [key]);

  return links;
}
