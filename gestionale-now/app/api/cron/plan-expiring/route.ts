// app/api/cron/plan-expiring/route.ts
//
// Cron job che gira ogni giorno e invia email a studi con piano in scadenza
// tra 7 giorni esatti. Per evitare doppi invii, controlla email_log.
//
// SCHEDULAZIONE: configurato in vercel.json ("0 9 * * *" = ogni giorno alle 9:00 UTC)
//
// SICUREZZA: Vercel cron job aggiunge automaticamente un header
// Authorization: Bearer <CRON_SECRET>. Verifichiamo che corrisponda.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/src/lib/email";

const REMINDER_DAYS_BEFORE = 7;

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configurazione mancante");
  return createClient(url, key, { auth: { persistSession: false } });
}

function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // In dev, se non c'è CRON_SECRET, permettiamo l'esecuzione manuale
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdmin();

    // Calcola finestra: studi che scadono ESATTAMENTE in REMINDER_DAYS_BEFORE giorni
    // (prendiamo un range di 24h per non perdere nessuno)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + REMINDER_DAYS_BEFORE);
    const fromIso = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString();
    const toIso = new Date(targetDate.setHours(23, 59, 59, 999)).toISOString();

    // Cerca studi in scadenza in quella finestra
    const { data: studios, error: studErr } = await db
      .from("studios")
      .select("id, name, plan_id, plan_expires_at, plans(name)")
      .gte("plan_expires_at", fromIso)
      .lte("plan_expires_at", toIso);

    if (studErr) {
      console.error("[cron/plan-expiring] errore query studios:", studErr.message);
      return NextResponse.json({ error: studErr.message }, { status: 500 });
    }

    if (!studios || studios.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: "Nessuno studio in scadenza oggi" });
    }

    const appUrl = process.env.APP_URL || "https://gestionale-fisio.vercel.app";
    let sentCount = 0;
    let skippedCount = 0;
    const results: Array<{ studio: string; status: string }> = [];

    for (const studio of studios) {
      // Verifica se abbiamo già spedito email per QUESTA scadenza
      const { data: alreadySent } = await db
        .from("email_log")
        .select("id")
        .eq("studio_id", studio.id)
        .eq("template", "plan_expiring")
        .gte("sent_at", new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()) // ultimi 8gg
        .limit(1);

      if (alreadySent && alreadySent.length > 0) {
        skippedCount++;
        results.push({ studio: studio.name, status: "skipped (già inviata)" });
        continue;
      }

      // Trova owner dello studio
      const { data: owner } = await db
        .from("studio_members")
        .select("user_id")
        .eq("studio_id", studio.id)
        .eq("role", "owner")
        .maybeSingle();

      if (!owner) {
        results.push({ studio: studio.name, status: "skipped (nessun owner)" });
        continue;
      }

      // Recupera email owner
      const { data: ownerUser } = await db.auth.admin.getUserById(owner.user_id);
      const ownerEmail = ownerUser?.user?.email;
      if (!ownerEmail) {
        results.push({ studio: studio.name, status: "skipped (email non trovata)" });
        continue;
      }

      // Calcola giorni rimanenti
      const expiresAt = new Date(studio.plan_expires_at as string);
      const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

      // Determina nome piano
      const planRel = studio.plans as { name?: string } | { name?: string }[] | null;
      const planName = Array.isArray(planRel)
        ? (planRel[0]?.name ?? "")
        : (planRel?.name ?? "");

      const result = await sendEmail({
        template: "plan_expiring",
        to: ownerEmail,
        studioId: studio.id,
        data: {
          studioName: studio.name,
          planName: planName || "corrente",
          daysLeft,
          renewUrl: `${appUrl}/piano`,
        },
        metadata: { plan_id: studio.plan_id, expires_at: studio.plan_expires_at },
      });

      if (result.ok) {
        sentCount++;
        results.push({ studio: studio.name, status: "sent" });
      } else {
        results.push({ studio: studio.name, status: `failed: ${result.error}` });
      }
    }

    return NextResponse.json({
      ok: true,
      sent: sentCount,
      skipped: skippedCount,
      total: studios.length,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    console.error("[cron/plan-expiring] errore:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
