// app/api/cron/ts-reminder/route.ts
// Cron: 1° del mese. Per ogni studio con Sistema TS attivo e una cadenza di
// promemoria che "scatta" questo mese, invia un'email che ricorda di trasmettere
// le spese sanitarie. Cadenze: monthly | quarterly (gen/apr/lug/ott) | semiannual (gen/lug).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/src/lib/email";

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

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

type PsRow = {
  owner_id: string;
  practice_name: string | null;
  ts_enabled: boolean | null;
  ts_reminder_cadence: string | null;
};

function isDueSingle(cadence: string, month1to12: number): boolean {
  if (cadence === "monthly") return true;
  if (cadence === "quarterly") return [1, 4, 7, 10].includes(month1to12);
  if (cadence === "semiannual") return [1, 7].includes(month1to12);
  if (cadence === "annual") return month1to12 === 1;
  return false;
}

// true se ALMENO una delle cadenze selezionate scatta nel mese
function anyDue(cadences: string[], month1to12: number): boolean {
  return cadences.some((c) => isDueSingle(c, month1to12));
}

function periodoLabel(now: Date): string {
  const m = now.getUTCMonth();
  const y = now.getUTCFullYear();
  const pm = m === 0 ? 11 : m - 1;
  const py = m === 0 ? y - 1 : y;
  return `le spese sanitarie fino a ${MESI[pm]} ${py}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  try {
    const db = getAdmin();
    const now = new Date();
    const month = now.getUTCMonth() + 1; // 1-12

    const { data: rows } = await db
      .from("practice_settings")
      .select("owner_id, practice_name, ts_enabled, ts_reminder_cadence");
    if (!rows || rows.length === 0) return NextResponse.json({ ok: true, sent: 0, message: "Nessuno studio" });

    const appUrl = process.env.APP_URL || "https://gestionale-fisio.vercel.app";
    let sent = 0;
    const results: Array<{ owner: string; status: string }> = [];

    for (const ps of rows as PsRow[]) {
      const raw = (ps.ts_reminder_cadence || "monthly").trim();
      const cadences = raw === "off" || raw === "" ? [] : raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (!ps.ts_enabled || cadences.length === 0) continue;
      if (!anyDue(cadences, month)) continue;

      const { data: ownerUser } = await db.auth.admin.getUserById(ps.owner_id);
      const email = ownerUser?.user?.email;
      if (!email) { results.push({ owner: ps.owner_id, status: "no email" }); continue; }

      try {
        const res = await sendEmail({
          template: "ts_reminder",
          to: email,
          data: {
            studioName: ps.practice_name || "FisioHub",
            periodoLabel: periodoLabel(now),
            daInviare: null,
            appUrl,
          },
        });
        if (res.ok) { sent++; results.push({ owner: ps.owner_id, status: "sent" }); }
        else results.push({ owner: ps.owner_id, status: `failed: ${res.error}` });
      } catch (e) {
        results.push({ owner: ps.owner_id, status: `error: ${e instanceof Error ? e.message : "?"}` });
      }
    }

    return NextResponse.json({ ok: true, month, sent, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore cron ts-reminder";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
