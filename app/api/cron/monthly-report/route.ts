// app/api/cron/monthly-report/route.ts
//
// Cron job: 1° del mese 7:00 UTC. Per OGNI studio invia i report attivati
// nelle preferenze (mensile / trimestrale / annuale), ciascuno col PDF
// allegato all'email dell'owner.
//
//   - Mensile     → ogni 1° del mese (mese precedente)
//   - Trimestrale → 1° gen/apr/lug/ott (trimestre precedente)
//   - Annuale     → 1° gennaio (anno precedente)
//
// Le tre cadenze sono indipendenti: lo studio può attivarne 0, 1, 2 o 3.
// SCHEDULAZIONE (vercel.json): "0 7 1 * *" — gira ogni 1°, poi filtra.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/src/lib/email";
import {
  computePeriodStats, renderPeriodReportPdf, periodReportFilename,
  bytesToBase64, type PeriodKind, type PeriodStats,
} from "@/src/lib/reports/monthlyReport";

export const runtime = "nodejs";
export const maxDuration = 120;

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configurazione mancante");
  return createClient(url, key, { auth: { persistSession: false } });
}

function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

type StudioRow = {
  id: string; name: string;
  report_monthly_enabled: boolean | null;
  report_quarterly_enabled: boolean | null;
  report_yearly_enabled: boolean | null;
};

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdmin();
    const now = new Date();
    const month = now.getUTCMonth();   // 0-11
    const isQuarterStart = month % 3 === 0;   // gen(0)/apr(3)/lug(6)/ott(9)
    const isYearStart = month === 0;          // gennaio

    // Quali cadenze "scattano" oggi
    const dueKinds: PeriodKind[] = ["month"];   // mensile gira sempre il 1°
    if (isQuarterStart) dueKinds.push("quarter");
    if (isYearStart) dueKinds.push("year");

    const { data: studios } = await db
      .from("studios")
      .select("id, name, report_monthly_enabled, report_quarterly_enabled, report_yearly_enabled");
    if (!studios || studios.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: "Nessuno studio" });
    }

    const appUrl = process.env.APP_URL || "https://gestionale-fisio.vercel.app";
    let sentCount = 0;
    const results: Array<{ studio: string; kind: string; status: string }> = [];

    const enabledFor = (s: StudioRow, k: PeriodKind): boolean =>
      k === "month" ? (s.report_monthly_enabled ?? true)
      : k === "quarter" ? (s.report_quarterly_enabled ?? false)
      : (s.report_yearly_enabled ?? false);

    for (const studio of studios as StudioRow[]) {
      // Cadenze attive per questo studio fra quelle che scattano oggi
      const kinds = dueKinds.filter(k => enabledFor(studio, k));
      if (kinds.length === 0) continue;

      // Owner email (una volta sola per studio)
      const { data: owner } = await db
        .from("studio_members").select("user_id")
        .eq("studio_id", studio.id).eq("role", "owner").maybeSingle();
      if (!owner) { results.push({ studio: studio.name, kind: "-", status: "no owner" }); continue; }
      const { data: ownerUser } = await db.auth.admin.getUserById(owner.user_id);
      const ownerEmail = ownerUser?.user?.email;
      if (!ownerEmail) { results.push({ studio: studio.name, kind: "-", status: "no email" }); continue; }

      for (const kind of kinds) {
        try {
          const stats: PeriodStats = await computePeriodStats(db, studio.id, studio.name, kind, now);
          if (stats.appointments.total === 0 && stats.newPatients === 0) {
            results.push({ studio: studio.name, kind, status: "skipped (vuoto)" });
            continue;
          }
          const pdfBytes = await renderPeriodReportPdf(stats);
          const result = await sendEmail({
            template: "monthly_report",
            to: ownerEmail,
            studioId: studio.id,
            data: {
              studioName: stats.studioName,
              monthLabel: stats.periodLabel,
              done: stats.appointments.done,
              collected: stats.revenue.collected,
              newPatients: stats.newPatients,
              appUrl,
            },
            attachments: [{ filename: periodReportFilename(stats), content: bytesToBase64(pdfBytes) }],
          });
          if (result.ok) { sentCount++; results.push({ studio: studio.name, kind, status: "sent" }); }
          else results.push({ studio: studio.name, kind, status: `failed: ${result.error}` });
        } catch (e) {
          results.push({ studio: studio.name, kind, status: `error: ${e instanceof Error ? e.message : "?"}` });
        }
      }
    }

    return NextResponse.json({ ok: true, sent: sentCount, dueKinds, results });
  } catch (e) {
    console.error("[monthly-report] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "errore" }, { status: 500 });
  }
}
