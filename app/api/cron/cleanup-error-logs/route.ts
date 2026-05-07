// app/api/cron/cleanup-error-logs/route.ts
//
// Cron job giornaliero — cancella righe error_logs più vecchie di 30 giorni.
// SCHEDULAZIONE: "0 3 * * *" (ogni giorno alle 3:00 UTC = 4-5 di notte ora italiana)
//
// Retention scelta: 30 giorni (aggressiva, per liberare spazio).
// Se vuoi cambiare retention: modifica RETENTION_DAYS qui sotto.
//
// Sicurezza:
//  - In produzione richiede header `Authorization: Bearer ${CRON_SECRET}`
//  - Vercel Cron passa l'header automaticamente
//
// Tracciamento:
//  - Inserisce una riga `info` in error_logs con quante righe ha cancellato.
//    Così tu vedi nello storico admin che il cron ha girato.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RETENTION_DAYS = 30;

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configurazione Supabase mancante");
  return createClient(url, key, { auth: { persistSession: false } });
}

function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdmin();
    const startedAt = Date.now();

    // Calcola la data di taglio (UTC)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    // Conta prima quante righe verranno cancellate (per tracciabilità)
    const { count: toDeleteCount, error: countErr } = await db
      .from("error_logs")
      .select("*", { count: "exact", head: true })
      .lt("created_at", cutoffISO);

    if (countErr) {
      console.error("[cron cleanup-error-logs] count error:", countErr);
      return NextResponse.json(
        { error: "count_failed", message: countErr.message },
        { status: 500 }
      );
    }

    // Esegui la DELETE
    const { error: deleteErr } = await db
      .from("error_logs")
      .delete()
      .lt("created_at", cutoffISO);

    if (deleteErr) {
      console.error("[cron cleanup-error-logs] delete error:", deleteErr);
      return NextResponse.json(
        { error: "delete_failed", message: deleteErr.message },
        { status: 500 }
      );
    }

    const duration_ms = Date.now() - startedAt;
    const deletedCount = toDeleteCount ?? 0;

    // Lascia una traccia nel log stesso (riga 'info' che racconta la pulizia).
    // Useremo questa riga per verificare che il cron è girato davvero.
    await db.from("error_logs").insert({
      level: "info",
      message: `Cron cleanup eseguito: cancellate ${deletedCount} righe più vecchie di ${RETENTION_DAYS} giorni`,
      error_name: "CronCleanup",
      source: "cron",
      url: "/api/cron/cleanup-error-logs",
      context: {
        deleted_count: deletedCount,
        retention_days: RETENTION_DAYS,
        cutoff_iso: cutoffISO,
        duration_ms,
      },
      fingerprint: "cron_cleanup_error_logs",
      occurred_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      deleted: deletedCount,
      retention_days: RETENTION_DAYS,
      cutoff: cutoffISO,
      duration_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[cron cleanup-error-logs] fatal:", message);
    return NextResponse.json(
      { error: "internal_error", message },
      { status: 500 }
    );
  }
}
