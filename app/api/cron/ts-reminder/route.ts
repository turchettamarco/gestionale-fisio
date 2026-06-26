// app/api/cron/ts-reminder/route.ts
// Cron mensile (1° del mese). Per ogni studio con Sistema TS attivo:
//  1) PROMEMORIA di invio, se la cadenza scatta questo mese
//     (monthly | quarterly gen/apr/lug/ott | semiannual gen/lug | annual gen).
//  2) RIEPILOGO degli invii del periodo concluso, se attivo
//     (monthly = mese precedente ogni mese; annual = anno precedente, a gennaio).
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
  ts_recap_cadence: string | null;
};

function parseList(raw: string | null): string[] {
  const s = (raw || "").trim();
  if (s === "" || s === "off") return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function isDueSingle(cadence: string, month1to12: number): boolean {
  if (cadence === "monthly") return true;
  if (cadence === "quarterly") return [1, 4, 7, 10].includes(month1to12);
  if (cadence === "semiannual") return [1, 7].includes(month1to12);
  if (cadence === "annual") return month1to12 === 1;
  return false;
}
function anyDue(cadences: string[], month1to12: number): boolean {
  return cadences.some((c) => isDueSingle(c, month1to12));
}

function reminderLabel(now: Date): string {
  const m = now.getUTCMonth();
  const y = now.getUTCFullYear();
  const pm = m === 0 ? 11 : m - 1;
  const py = m === 0 ? y - 1 : y;
  return `le spese sanitarie fino a ${MESI[pm]} ${py}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function patientName(p: any): string {
  const o = Array.isArray(p) ? p[0] : p;
  return [o?.first_name, o?.last_name].filter(Boolean).join(" ").trim() || "—";
}
function docNum(r: any): string {
  if (r.ts_doc_ref && String(r.ts_doc_ref).trim()) return String(r.ts_doc_ref).trim();
  if (r.ts_doc_number != null) return `${r.ts_doc_number}${r.ts_doc_year ? "/" + r.ts_doc_year : ""}`;
  return "—";
}

// Costruisce le righe del riepilogo per un intervallo [startIso, endIso)
async function buildRecap(db: any, ownerId: string, startIso: string, endIso: string) {
  const { data } = await db
    .from("appointments")
    .select("paid_at, amount, ts_doc_ref, ts_doc_number, ts_doc_year, ts_sent_at, ts_protocollo, patient:patients(first_name,last_name)")
    .eq("owner_id", ownerId)
    .not("ts_protocollo", "is", null)
    .gte("ts_sent_at", startIso)
    .lt("ts_sent_at", endIso);

  const rows = (data || []) as any[];
  const map = new Map<string, { data: string; paziente: string; numero: string; importo: number; protocollo: string }>();
  for (const r of rows) {
    const numero = docNum(r);
    const key = numero + "|" + (r.ts_protocollo || "");
    const prev = map.get(key);
    if (prev) {
      prev.importo += Number(r.amount) || 0;
    } else {
      map.set(key, {
        data: fmtDate(r.ts_sent_at),
        paziente: patientName(r.patient),
        numero,
        importo: Number(r.amount) || 0,
        protocollo: (r.ts_protocollo || "").trim(),
      });
    }
  }
  const righe = Array.from(map.values()).sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }));
  const totale = righe.reduce((s, x) => s + x.importo, 0);
  return { righe, totale, count: righe.length };
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  try {
    const db = getAdmin();
    const now = new Date();
    const month = now.getUTCMonth() + 1; // 1-12
    const Y = now.getUTCFullYear();

    const { data: rows } = await db
      .from("practice_settings")
      .select("owner_id, practice_name, ts_enabled, ts_reminder_cadence, ts_recap_cadence");
    if (!rows || rows.length === 0) return NextResponse.json({ ok: true, sent: 0, message: "Nessuno studio" });

    const appUrl = process.env.APP_URL || "https://gestionale-fisio.vercel.app";
    let remindersSent = 0;
    let recapsSent = 0;
    const results: Array<{ owner: string; status: string }> = [];

    // intervalli del periodo concluso
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevMonthYear = month === 1 ? Y - 1 : Y;
    const monthStart = new Date(Date.UTC(prevMonthYear, prevMonth - 1, 1)).toISOString();
    const monthEnd = new Date(Date.UTC(Y, month - 1, 1)).toISOString();
    const yearStart = new Date(Date.UTC(Y - 1, 0, 1)).toISOString();
    const yearEnd = new Date(Date.UTC(Y, 0, 1)).toISOString();

    for (const ps of rows as PsRow[]) {
      if (!ps.ts_enabled) continue;
      const reminderC = parseList(ps.ts_reminder_cadence);
      const recapC = parseList(ps.ts_recap_cadence);
      const wantReminder = reminderC.length > 0 && anyDue(reminderC, month);
      const wantMonthlyRecap = recapC.includes("monthly");
      const wantAnnualRecap = recapC.includes("annual") && month === 1;
      if (!wantReminder && !wantMonthlyRecap && !wantAnnualRecap) continue;

      const { data: ownerUser } = await db.auth.admin.getUserById(ps.owner_id);
      const email = ownerUser?.user?.email;
      if (!email) { results.push({ owner: ps.owner_id, status: "no email" }); continue; }
      const studioName = ps.practice_name || "FisioHub";

      // 1) promemoria
      if (wantReminder) {
        try {
          const res = await sendEmail({
            template: "ts_reminder",
            to: email,
            data: { studioName, periodoLabel: reminderLabel(now), daInviare: null, appUrl },
          });
          if (res.ok) { remindersSent++; results.push({ owner: ps.owner_id, status: "promemoria inviato" }); }
          else results.push({ owner: ps.owner_id, status: `promemoria failed: ${res.error}` });
        } catch (e) {
          results.push({ owner: ps.owner_id, status: `promemoria error: ${e instanceof Error ? e.message : "?"}` });
        }
      }

      // 2) riepilogo mensile (mese precedente)
      if (wantMonthlyRecap) {
        try {
          const r = await buildRecap(db, ps.owner_id, monthStart, monthEnd);
          if (r.count > 0) {
            const res = await sendEmail({
              template: "ts_recap",
              to: email,
              data: { studioName, periodoLabel: `${MESI[prevMonth - 1]} ${prevMonthYear}`, righe: r.righe, totale: r.totale, count: r.count, appUrl },
            });
            if (res.ok) { recapsSent++; results.push({ owner: ps.owner_id, status: `riepilogo mensile inviato (${r.count})` }); }
            else results.push({ owner: ps.owner_id, status: `riepilogo mensile failed: ${res.error}` });
          } else {
            results.push({ owner: ps.owner_id, status: "riepilogo mensile saltato (0 invii)" });
          }
        } catch (e) {
          results.push({ owner: ps.owner_id, status: `riepilogo mensile error: ${e instanceof Error ? e.message : "?"}` });
        }
      }

      // 3) riepilogo annuale (anno precedente, a gennaio)
      if (wantAnnualRecap) {
        try {
          const r = await buildRecap(db, ps.owner_id, yearStart, yearEnd);
          if (r.count > 0) {
            const res = await sendEmail({
              template: "ts_recap",
              to: email,
              data: { studioName, periodoLabel: `anno ${Y - 1}`, righe: r.righe, totale: r.totale, count: r.count, appUrl },
            });
            if (res.ok) { recapsSent++; results.push({ owner: ps.owner_id, status: `riepilogo annuale inviato (${r.count})` }); }
            else results.push({ owner: ps.owner_id, status: `riepilogo annuale failed: ${res.error}` });
          } else {
            results.push({ owner: ps.owner_id, status: "riepilogo annuale saltato (0 invii)" });
          }
        } catch (e) {
          results.push({ owner: ps.owner_id, status: `riepilogo annuale error: ${e instanceof Error ? e.message : "?"}` });
        }
      }
    }

    return NextResponse.json({ ok: true, month, remindersSent, recapsSent, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore cron ts-reminder";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
