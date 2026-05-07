"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/packages/PackageBadge.tsx
// ═══════════════════════════════════════════════════════════════════════
// Pillola compatta che mostra "📦 N/totale" o "📦 #N" sulle card appuntamento.
//
// Modalità d'uso:
//
//  1) Inline auto-fetch (singolo appuntamento isolato):
//     <PackageBadge packageId={pkgId} />
//     Carica i dati del pacchetto e mostra "📦 X/Y" usando sessions_used del
//     pacchetto. Per liste lunghe è inefficiente (N richieste); usare modo 2.
//
//  2) Pre-calcolato (liste di appuntamenti):
//     <PackageBadge sessionsUsed={3} totalSessions={10} />
//     Riceve i numeri già pronti dal componente padre. Da usare quando
//     visualizzi tanti appuntamenti insieme (calendario, lista paziente).
//
// La logica del numero: rappresenta SEMPRE le sedute usate del pacchetto
// (escluse cancellate), non la posizione cronologica del singolo evento.
// Coerente con la scelta di Marco: "2 sedute usate finora, indipendentemente
// da quale stai guardando".
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";

// ─── Cache module-level ────────────────────────────────────────────────
// Evita N fetch quando la stessa pillola compare più volte in liste
// (calendario, vista paziente). TTL breve: 60 secondi.
type CacheEntry = { used: number; total: number | null; ts: number };
const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry | null>>();

async function fetchPackageStats(packageId: string): Promise<CacheEntry | null> {
  const now = Date.now();
  const cached = cache.get(packageId);
  if (cached && now - cached.ts < TTL_MS) return cached;
  if (inflight.has(packageId)) return inflight.get(packageId)!;

  const promise = fetch(`/api/packages/${packageId}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d?.package) return null;
      const entry: CacheEntry = {
        used: d.package.sessions_used ?? 0,
        total: d.package.total_sessions,
        ts: Date.now(),
      };
      cache.set(packageId, entry);
      return entry;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(packageId);
    });

  inflight.set(packageId, promise);
  return promise;
}

/** Invalida manualmente la cache. Usa quando crei/cambi un pacchetto. */
export function invalidatePackageBadgeCache(packageId?: string) {
  if (packageId) {
    cache.delete(packageId);
  } else {
    cache.clear();
  }
}

type Variant = "compact" | "default" | "compact-dark" | "default-dark";

export type PackageBadgeProps = {
  /** Id del pacchetto. Se passato senza sessionsUsed, fa fetch autonomo. */
  packageId?: string | null;
  /** Sedute usate (pre-calcolate) — preferito per liste */
  sessionsUsed?: number;
  /** Sedute totali (null/undefined = acconto libero, mostra "#N") */
  totalSessions?: number | null;
  /** "compact" = piccolissima, per card calendario · "default" = leggibile */
  variant?: Variant;
  /** Click handler opzionale */
  onClick?: (e: React.MouseEvent) => void;
  /** Stile inline aggiuntivo */
  style?: React.CSSProperties;
};

export default function PackageBadge({
  packageId,
  sessionsUsed,
  totalSessions,
  variant = "default",
  onClick,
  style,
}: PackageBadgeProps) {
  const [autoUsed, setAutoUsed] = useState<number | null>(null);
  const [autoTotal, setAutoTotal] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const needFetch =
    !!packageId &&
    typeof sessionsUsed !== "number"; // solo se non passato

  useEffect(() => {
    if (!needFetch || !packageId) return;
    let cancelled = false;
    fetchPackageStats(packageId).then((entry) => {
      if (cancelled || !entry) {
        if (!cancelled) setLoaded(true);
        return;
      }
      setAutoUsed(entry.used);
      setAutoTotal(entry.total);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [needFetch, packageId]);

  // Risolve i valori finali
  const used = typeof sessionsUsed === "number" ? sessionsUsed : autoUsed;
  const total =
    typeof sessionsUsed === "number"
      ? totalSessions ?? null
      : autoTotal;

  if (used === null) {
    // In fetch ma ancora non arrivato: non renderizzare (no flicker)
    if (needFetch && !loaded) return null;
    // Fetch fallito o packageId mancante: niente
    return null;
  }

  const text = total !== null && total !== undefined ? `📦 ${used}/${total}` : `📦 #${used}`;

  const isCompact = variant === "compact" || variant === "compact-dark";
  const isDark = variant === "compact-dark" || variant === "default-dark";

  const baseStyle: React.CSSProperties = isCompact
    ? {
        display: "inline-flex",
        alignItems: "center",
        fontSize: 9,
        fontWeight: 700,
        background: isDark ? "rgba(255,255,255,0.22)" : "rgba(13,148,136,0.15)",
        color: isDark ? "#fff" : "#0d9488",
        padding: "1px 5px",
        borderRadius: 4,
        letterSpacing: 0.2,
        lineHeight: 1.3,
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : "default",
        flexShrink: 0,
      }
    : {
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 700,
        background: isDark ? "rgba(255,255,255,0.22)" : "rgba(13,148,136,0.12)",
        color: isDark ? "#fff" : "#0d9488",
        padding: "2px 8px",
        borderRadius: 99,
        border: isDark ? "1px solid rgba(255,255,255,0.30)" : "1px solid rgba(13,148,136,0.25)",
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : "default",
      };

  return (
    <span
      onClick={onClick}
      title={
        total !== null && total !== undefined
          ? `Pacchetto: ${used} sedute usate su ${total}`
          : `Pacchetto (acconto libero): ${used} sedute usate`
      }
      style={{ ...baseStyle, ...style }}
    >
      {text}
    </span>
  );
}
