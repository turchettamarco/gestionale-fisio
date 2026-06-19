// app/api/cron/ts-email-queue/route.ts
// Elabora la coda ts_email_queue: per ogni richiesta "matura" (send_after passato)
// recupera le credenziali salvate, scarica la ricevuta PDF e invia l'email di
// riepilogo. Robusto a scheda chiusa. Da schedulare ogni pochi minuti.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendInvioReportEmail, type Riga } from "@/src/lib/contabilita/tsReportEmail";

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

const MAX_ATTEMPTS = 6;

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  try {
    const db = getAdmin();
    const nowIso = new Date().toISOString();

    const { data: queue } = await db
      .from("ts_email_queue")
      .select("id, owner_id, protocollo, periodo, esito, ambiente, righe, attempts")
      .is("sent_at", null)
      .lte("send_after", nowIso)
      .lt("attempts", MAX_ATTEMPTS)
      .order("send_after", { ascending: true })
      .limit(25);

    if (!queue || queue.length === 0) return NextResponse.json({ ok: true, processed: 0 });

    let sent = 0;
    const results: Array<{ id: string; status: string }> = [];

    for (const q of queue as any[]) {
      // credenziali + impostazioni del proprietario
      const { data: ps } = await db
        .from("practice_settings")
        .select("practice_name, ts_invio_email_enabled, ts_ws_user, ts_ws_password, ts_ws_pincode, ts_ws_ambiente")
        .eq("owner_id", q.owner_id)
        .maybeSingle();

      // toggle disattivato → non inviare, chiudi la riga
      if (!ps || (ps as any).ts_invio_email_enabled === false) {
        await db.from("ts_email_queue").update({ sent_at: nowIso, last_error: "email disattivata" }).eq("id", q.id);
        results.push({ id: q.id, status: "skipped (disabilitata)" });
        continue;
      }

      const { data: ownerUser } = await db.auth.admin.getUserById(q.owner_id);
      const email = ownerUser?.user?.email;
      if (!email) {
        await db.from("ts_email_queue").update({ attempts: (q.attempts ?? 0) + 1, last_error: "email destinatario mancante" }).eq("id", q.id);
        results.push({ id: q.id, status: "no email" });
        continue;
      }

      try {
        const r = await sendInvioReportEmail({
          email,
          studioName: (ps as any).practice_name || "FisioHub",
          periodo: q.periodo || "",
          protocollo: q.protocollo,
          esitoText: q.esito || "File accolto dal Sistema TS.",
          ambiente: ((ps as any).ts_ws_ambiente === "prod" || q.ambiente === "prod") ? "prod" : "test",
          righe: (q.righe as Riga[]) || [],
          wsUser: (ps as any).ts_ws_user || undefined,
          wsPassword: (ps as any).ts_ws_password || undefined,
          wsPincode: (ps as any).ts_ws_pincode || undefined,
        });
        if (r.ok) {
          await db.from("ts_email_queue").update({ sent_at: new Date().toISOString(), last_error: r.ricevutaInclusa ? null : "inviata senza ricevuta PDF" }).eq("id", q.id);
          sent++;
          results.push({ id: q.id, status: r.ricevutaInclusa ? "inviata con ricevuta" : "inviata senza ricevuta" });
        } else {
          const attempts = (q.attempts ?? 0) + 1;
          await db.from("ts_email_queue").update({ attempts, last_error: r.error || "invio non riuscito", ...(attempts >= MAX_ATTEMPTS ? { sent_at: new Date().toISOString() } : {}) }).eq("id", q.id);
          results.push({ id: q.id, status: `errore (tentativo ${attempts})` });
        }
      } catch (e) {
        const attempts = (q.attempts ?? 0) + 1;
        await db.from("ts_email_queue").update({ attempts, last_error: e instanceof Error ? e.message : "errore", ...(attempts >= MAX_ATTEMPTS ? { sent_at: new Date().toISOString() } : {}) }).eq("id", q.id);
        results.push({ id: q.id, status: `eccezione (tentativo ${attempts})` });
      }
    }

    return NextResponse.json({ ok: true, processed: queue.length, sent, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore cron ts-email-queue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
