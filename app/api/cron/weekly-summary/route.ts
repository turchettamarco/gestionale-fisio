// app/api/cron/weekly-summary/route.ts
//
// Cron job lunedì 8:00 — invia riepilogo settimana precedente a ogni owner.
// SCHEDULAZIONE: "0 7 * * 1" (lunedì 7:00 UTC = 8:00 ora italiana legale, 9:00 invernale)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/src/lib/email";

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

function fmtItDate(d: Date): string {
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdmin();

    // Calcola settimana precedente: da lunedì 00:00 a domenica 23:59
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    // Vai a lunedì della settimana precedente
    const day = weekStart.getDay(); // 0=dom, 1=lun, ...
    const diff = (day === 0 ? -6 : 1 - day);
    weekStart.setDate(weekStart.getDate() + diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const nextWeekStart = new Date(weekEnd);
    nextWeekStart.setSeconds(nextWeekStart.getSeconds() + 1);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

    // Tutti gli studi con un owner
    const { data: studios } = await db
      .from("studios")
      .select("id, name");

    if (!studios || studios.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: "Nessuno studio" });
    }

    const appUrl = process.env.APP_URL || "https://gestionale-fisio.vercel.app";
    let sentCount = 0;
    const results: Array<{ studio: string; status: string }> = [];

    for (const studio of studios) {
      // Owner email
      const { data: owner } = await db
        .from("studio_members")
        .select("user_id")
        .eq("studio_id", studio.id)
        .eq("role", "owner")
        .maybeSingle();
      if (!owner) { results.push({ studio: studio.name, status: "no owner" }); continue; }

      const { data: ownerUser } = await db.auth.admin.getUserById(owner.user_id);
      const ownerEmail = ownerUser?.user?.email;
      if (!ownerEmail) { results.push({ studio: studio.name, status: "no email" }); continue; }

      // Stats settimana scorsa
      const { data: appts } = await db
        .from("appointments")
        .select("id, amount, status")
        .eq("studio_id", studio.id)
        .gte("start_at", weekStart.toISOString())
        .lte("start_at", weekEnd.toISOString())
        .neq("status", "cancelled");

      const apptCount = (appts || []).length;
      const revenue = (appts || [])
        .filter(a => a.status === "done" || a.status === "confirmed")
        .reduce((sum, a) => sum + Number(a.amount || 0), 0);

      // Nuovi pazienti
      const { count: newPatientsCount } = await db
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studio.id)
        .gte("created_at", weekStart.toISOString())
        .lte("created_at", weekEnd.toISOString());

      // Appuntamenti settimana prossima
      const { count: upcomingCount } = await db
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studio.id)
        .gte("start_at", nextWeekStart.toISOString())
        .lte("start_at", nextWeekEnd.toISOString())
        .neq("status", "cancelled");

      // Skip se settimana totalmente vuota (no appuntamenti, no pazienti, no upcoming)
      if (apptCount === 0 && (newPatientsCount ?? 0) === 0 && (upcomingCount ?? 0) === 0) {
        results.push({ studio: studio.name, status: "skipped (vuoto)" });
        continue;
      }

      const result = await sendEmail({
        template: "weekly_summary",
        to: ownerEmail,
        studioId: studio.id,
        data: {
          studioName: studio.name,
          weekStart: fmtItDate(weekStart),
          weekEnd: fmtItDate(weekEnd),
          appointmentsCount: apptCount,
          revenue,
          newPatientsCount: newPatientsCount ?? 0,
          upcomingCount: upcomingCount ?? 0,
          appUrl,
        },
      });

      if (result.ok) {
        sentCount++;
        results.push({ studio: studio.name, status: "sent" });
      } else {
        results.push({ studio: studio.name, status: `failed: ${result.error}` });
      }
    }

    return NextResponse.json({ ok: true, sent: sentCount, total: studios.length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    console.error("[cron/weekly-summary] errore:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
