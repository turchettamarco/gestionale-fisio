// ═══════════════════════════════════════════════════════════════════════
// src/lib/reports/monthlyReport.ts
// ═══════════════════════════════════════════════════════════════════════
// Report mensile dello studio: calcolo statistiche + generazione PDF.
// Usato sia dal cron (app/api/cron/monthly-report, invio automatico via
// email con PDF allegato) sia on-demand dalla pagina Report (download).
//
// PDF generato con pdf-lib (server-side, già in dipendenze) — niente
// browser/WeasyPrint, gira in ambiente serverless.
//
// Multi-tenant: ogni funzione riceve studioId e filtra sempre per quello.
// ═══════════════════════════════════════════════════════════════════════

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export type MonthlyStats = {
  studioName: string;
  year: number;
  month: number;            // 0-11
  monthLabel: string;       // "giugno 2026"
  appointments: { total: number; done: number; confirmed: number; cancelled: number; noShow: number;
    donePaid: number; doneUnpaid: number; doneFree: number };
  revenue: { collected: number; expected: number; unpaid: number; avgPerSession: number };
  collectionRate: number;   // % incassato su fatturato (0-100)
  presenceRate: number;     // % presentati su (presentati+annullati+noshow)
  newPatients: number;
  activePatients: number;   // pazienti distinti con almeno 1 seduta nel mese
  byOperator: { name: string; count: number; revenue: number }[];
  byPaymentMethod: { method: string; count: number; amount: number }[];
  unpaidList: { name: string; count: number; amount: number }[];  // insoluti del mese, per paziente
  weekly: { label: string; collected: number; sessions: number }[]; // settimane del mese
  newVsReturning: { newP: number; returning: number };  // pazienti nuovi vs di ritorno nel periodo
  topPatients: { name: string; sessions: number; amount: number }[]; // top pazienti per fatturato
  byLocation: { name: string; sessions: number; amount: number }[];  // sedute per sede
  rentals: { count: number; collected: number; pending: number };    // noleggi del periodo
  prevYear: { collected: number; done: number } | null;  // stesso mese anno precedente
  history6: { label: string; collected: number }[];      // ultimi 6 mesi incassato
  prev: { collected: number; done: number } | null;
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Contanti", contanti: "Contanti", pos: "POS", card: "POS",
  carta: "POS", bonifico: "Bonifico", transfer: "Bonifico", bank: "Bonifico",
};

function monthRange(year: number, month: number): { start: string; end: string } {
  // Confini del mese in fuso Europe/Rome (UTC+1 inverno, UTC+2 estate),
  // convertiti in UTC per il confronto con start_at (salvato in UTC).
  return { start: romeStartOfMonth(year, month), end: romeStartOfMonth(year, month + 1) };
}

// Mezzanotte del 1° del mese in ora italiana, espressa in ISO UTC.
function romeStartOfMonth(year: number, month: number): string {
  // normalizza overflow mese (month=12 → gennaio anno dopo)
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  // L'Italia è UTC+1 (inverno) o UTC+2 (ora legale). Determino l'offset
  // controllando come Europe/Rome rappresenta quella mezzanotte.
  const guess = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  const offsetMin = romeOffsetMinutes(guess);
  // mezzanotte locale = UTC - offset
  return new Date(Date.UTC(y, m, 1, 0, 0, 0) - offsetMin * 60000).toISOString();
}

// Offset (in minuti) di Europe/Rome per una certa data.
function romeOffsetMinutes(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? "0");
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUTC - d.getTime()) / 60000);
}

// ── Calcolo statistiche per uno studio in un mese ─────────────────────────
export async function computeMonthlyStats(
  db: SupabaseClient,
  studioId: string,
  studioName: string,
  year: number,
  month: number,
): Promise<MonthlyStats> {
  const { start, end } = monthRange(year, month);
  const prevDate = new Date(Date.UTC(year, month - 1, 1));
  const prevRange = monthRange(prevDate.getUTCFullYear(), prevDate.getUTCMonth());

  const [apptRes, prevApptRes, newPatRes, opRes] = await Promise.all([
    db.from("appointments")
      .select("id, amount, status, is_paid, operator_id, payment_method, patient_id, start_at")
      .eq("studio_id", studioId)
      .is("guest_practitioner_id", null)
      .gte("start_at", start).lt("start_at", end),
    db.from("appointments")
      .select("amount, status, is_paid")
      .eq("studio_id", studioId)
      .is("guest_practitioner_id", null)
      .gte("start_at", prevRange.start).lt("start_at", prevRange.end),
    db.from("patients")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .gte("created_at", start).lt("created_at", end),
    db.from("studio_members")
      .select("user_id, display_name")
      .eq("studio_id", studioId),
  ]);

  const appts = apptRes.data ?? [];
  const done = appts.filter(a => a.status === "done");
  const donePaid = done.filter(a => Number(a.amount || 0) > 0 && a.is_paid).length;
  const doneUnpaid = done.filter(a => Number(a.amount || 0) > 0 && !a.is_paid).length;
  const doneFree = done.filter(a => a.amount == null || Number(a.amount) === 0).length;
  const confirmed = appts.filter(a => a.status === "confirmed");
  const cancelled = appts.filter(a => a.status === "cancelled");
  const noShow = appts.filter(a => a.status === "no_show");

  // Incassato = sedute pagate (is_paid) con importo. Coerente con pagina Reports e CSV.
  const collected = appts.filter(a => a.is_paid).reduce((s, a) => s + Number(a.amount || 0), 0);
  const expected = appts.filter(a => a.status !== "cancelled").reduce((s, a) => s + Number(a.amount || 0), 0);
  const unpaidAppts = appts.filter(a => !a.is_paid && a.status !== "cancelled" && Number(a.amount || 0) > 0);
  const unpaid = unpaidAppts.reduce((s, a) => s + Number(a.amount || 0), 0);
  const paidSessions = appts.filter(a => a.is_paid && Number(a.amount || 0) > 0).length;
  const avgPerSession = paidSessions > 0 ? collected / paidSessions : 0;
  const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

  const presenceDen = done.length + cancelled.length + noShow.length;
  const presenceRate = presenceDen > 0 ? Math.round((done.length / presenceDen) * 100) : 100;

  const activePatients = new Set(appts.filter(a => a.status !== "cancelled" && a.patient_id).map(a => a.patient_id)).size;

  const opNames = new Map<string, string>();
  for (const m of (opRes.data ?? [])) {
    if (m.user_id) opNames.set(m.user_id, m.display_name || "Operatore");
  }
  const byOpMap = new Map<string, { name: string; count: number; revenue: number }>();
  for (const a of appts) {
    if (a.status === "cancelled") continue;
    const uid = a.operator_id || "—";
    const name = opNames.get(uid) || "Non assegnato";
    const cur = byOpMap.get(uid) || { name, count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(a.amount || 0);
    byOpMap.set(uid, cur);
  }
  const byOperator = [...byOpMap.values()].sort((a, b) => b.count - a.count);

  const methodMap = new Map<string, { count: number; amount: number }>();
  for (const a of appts) {
    if (!a.is_paid || Number(a.amount || 0) <= 0) continue;
    const raw = (a.payment_method || "").toLowerCase().trim();
    const label = METHOD_LABELS[raw] || (raw ? raw[0].toUpperCase() + raw.slice(1) : "Non indicato");
    const cur = methodMap.get(label) || { count: 0, amount: 0 };
    cur.count += 1; cur.amount += Number(a.amount || 0);
    methodMap.set(label, cur);
  }
  const byPaymentMethod = [...methodMap.entries()]
    .map(([method, v]) => ({ method, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  const unpaidByPat = new Map<string, { count: number; amount: number }>();
  for (const a of unpaidAppts) {
    const pid = a.patient_id || "—";
    const cur = unpaidByPat.get(pid) || { count: 0, amount: 0 };
    cur.count += 1; cur.amount += Number(a.amount || 0);
    unpaidByPat.set(pid, cur);
  }
  let unpaidList: { name: string; count: number; amount: number }[] = [];
  const unpaidPatIds = [...unpaidByPat.keys()].filter(id => id !== "—");
  if (unpaidPatIds.length > 0) {
    const { data: pats } = await db.from("patients")
      .select("id, first_name, last_name").in("id", unpaidPatIds);
    const nameOf = new Map((pats ?? []).map(p => [p.id, `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "Paziente"]));
    unpaidList = [...unpaidByPat.entries()].map(([pid, v]) => ({
      name: pid === "—" ? "Senza paziente" : (nameOf.get(pid) || "Paziente"),
      count: v.count, amount: v.amount,
    })).sort((a, b) => b.amount - a.amount);
  }

  const weekMap = new Map<number, { collected: number; sessions: number }>();
  for (const a of appts) {
    if (a.status === "cancelled" || !a.start_at) continue;
    const d = new Date(a.start_at);
    const wk = Math.floor((d.getUTCDate() - 1) / 7);
    const cur = weekMap.get(wk) || { collected: 0, sessions: 0 };
    if (a.is_paid) cur.collected += Number(a.amount || 0);
    if (a.status === "done") cur.sessions += 1;
    weekMap.set(wk, cur);
  }
  const weekly = [0, 1, 2, 3, 4]
    .filter(w => weekMap.has(w))
    .map(w => ({ label: `Sett. ${w + 1}`, collected: weekMap.get(w)!.collected, sessions: weekMap.get(w)!.sessions }));

  // ── Pazienti nuovi vs di ritorno ──
  // Nuovi = pazienti la cui prima seduta in assoluto cade nel periodo.
  const periodPatIds = [...new Set(appts.filter(a => a.status !== "cancelled" && a.patient_id).map(a => a.patient_id))] as string[];
  let newP = 0, returning = 0;
  if (periodPatIds.length > 0) {
    const { data: firstAppts } = await db.from("appointments")
      .select("patient_id, start_at")
      .eq("studio_id", studioId)
      .in("patient_id", periodPatIds)
      .neq("status", "cancelled")
      .order("start_at", { ascending: true });
    const firstSeen = new Map<string, string>();
    for (const a of (firstAppts ?? [])) {
      if (a.patient_id && !firstSeen.has(a.patient_id)) firstSeen.set(a.patient_id, a.start_at);
    }
    for (const pid of periodPatIds) {
      const fs = firstSeen.get(pid);
      if (fs && fs >= start && fs < end) newP++; else returning++;
    }
  }

  // ── Top pazienti per fatturato nel periodo ──
  const patAgg = new Map<string, { sessions: number; amount: number }>();
  for (const a of appts) {
    if (a.status === "cancelled" || !a.patient_id) continue;
    const cur = patAgg.get(a.patient_id) || { sessions: 0, amount: 0 };
    if (a.status === "done") cur.sessions += 1;
    if (a.is_paid) cur.amount += Number(a.amount || 0);
    patAgg.set(a.patient_id, cur);
  }
  let topPatients: { name: string; sessions: number; amount: number }[] = [];
  const topIds = [...patAgg.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5).map(e => e[0]);
  if (topIds.length > 0) {
    const { data: tp } = await db.from("patients").select("id, first_name, last_name").in("id", topIds);
    const nm = new Map((tp ?? []).map(p => [p.id, `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "Paziente"]));
    topPatients = topIds.map(id => ({ name: nm.get(id) || "Paziente", sessions: patAgg.get(id)!.sessions, amount: patAgg.get(id)!.amount }));
  }

  // ── Sedute per sede ──
  const locMap = new Map<string, { sessions: number; amount: number }>();
  for (const a of appts) {
    if (a.status === "cancelled") continue;
    const key = (a as Record<string, unknown>).clinic_site as string || "Studio";
    const cur = locMap.get(key) || { sessions: 0, amount: 0 };
    if (a.status === "done") cur.sessions += 1;
    if (a.is_paid) cur.amount += Number(a.amount || 0);
    locMap.set(key, cur);
  }
  const byLocation = [...locMap.entries()].map(([name, v]) => ({ name, sessions: v.sessions, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  // ── Noleggi del periodo (per end_date) ──
  const { data: rentRows } = await db.from("noleggios")
    .select("total_amount, is_paid, end_date")
    .gte("end_date", start.slice(0, 10)).lte("end_date", end.slice(0, 10));
  const rentals = {
    count: (rentRows ?? []).length,
    collected: (rentRows ?? []).filter(r => r.is_paid).reduce((s, r) => s + Number(r.total_amount || 0), 0),
    pending: (rentRows ?? []).filter(r => !r.is_paid).reduce((s, r) => s + Number(r.total_amount || 0), 0),
  };

  // ── Stesso mese anno precedente ──
  const pyStart = romeStartOfMonth(year - 1, month);
  const pyEnd = romeStartOfMonth(year - 1, month + 1);
  const { data: pyRows } = await db.from("appointments")
    .select("amount, status, is_paid").eq("studio_id", studioId)
    .is("guest_practitioner_id", null).gte("start_at", pyStart).lt("start_at", pyEnd);
  const prevYear = (pyRows && pyRows.length > 0) ? {
    collected: pyRows.filter(a => a.is_paid).reduce((s, a) => s + Number(a.amount || 0), 0),
    done: pyRows.filter(a => a.status === "done").length,
  } : null;

  // ── Storico ultimi 6 mesi (incassato) ──
  const h6Start = romeStartOfMonth(year, month - 5);
  const { data: h6Rows } = await db.from("appointments")
    .select("amount, is_paid, start_at").eq("studio_id", studioId)
    .is("guest_practitioner_id", null).gte("start_at", h6Start).lt("start_at", end);
  const h6Map = new Map<string, number>();
  for (let k = 5; k >= 0; k--) {
    const d = new Date(Date.UTC(year, month - k, 1));
    h6Map.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, 0);
  }
  for (const a of (h6Rows ?? [])) {
    if (!a.is_paid || !a.start_at) continue;
    const d = new Date(a.start_at);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (h6Map.has(key)) h6Map.set(key, h6Map.get(key)! + Number(a.amount || 0));
  }
  const history6 = [...h6Map.entries()].map(([key, collected]) => {
    const m = Number(key.split("-")[1]);
    return { label: MESI_BREVI[m], collected };
  });

  const prevAppts = prevApptRes.data ?? [];
  const prev = prevApptRes.error ? null : {
    collected: prevAppts.filter(a => a.is_paid).reduce((s, a) => s + Number(a.amount || 0), 0),
    done: prevAppts.filter(a => a.status === "done").length,
  };

  return {
    studioName, year, month,
    monthLabel: `${MESI[month]} ${year}`,
    appointments: { total: appts.length, done: done.length, confirmed: confirmed.length, cancelled: cancelled.length, noShow: noShow.length, donePaid, doneUnpaid, doneFree },
    revenue: { collected, expected, unpaid, avgPerSession },
    collectionRate, presenceRate,
    newPatients: newPatRes.count ?? 0,
    activePatients,
    byOperator, byPaymentMethod, unpaidList, weekly,
    newVsReturning: { newP, returning }, topPatients, byLocation, rentals, prevYear, history6,
    prev,
  };
}

// ── Helpers PDF ───────────────────────────────────────────────────────────
const TEAL = rgb(0.051, 0.580, 0.533);
const BLUE = rgb(0.118, 0.388, 0.886);
const INK = rgb(0.06, 0.09, 0.16);
const BODY = rgb(0.28, 0.33, 0.41);
const FAINT = rgb(0.58, 0.64, 0.72);
const LINE = rgb(0.91, 0.93, 0.96);
const GREEN = rgb(0.08, 0.50, 0.29);
const RED = rgb(0.86, 0.15, 0.15);
const AMBER = rgb(0.70, 0.33, 0.04);

function eur(n: number): string {
  return "EUR " + n.toFixed(2).replace(".", ",");
}

// ── Generazione PDF ───────────────────────────────────────────────────────
export async function renderMonthlyReportPdf(s: MonthlyStats): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const M = 38;

  const text = (t: string, x: number, yy: number, size: number, f: PDFFont, color = INK) =>
    page.drawText(t, { x, y: yy, size, font: f, color });

  // ── Header compatto ──
  page.drawRectangle({ x: 0, y: height - 74, width, height: 74, color: TEAL });
  page.drawRectangle({ x: width * 0.5, y: height - 74, width: width * 0.5, height: 74, color: BLUE, opacity: 0.5 });
  text("REPORT MENSILE", M, height - 30, 8, bold, rgb(1, 1, 1));
  text(s.studioName, M, height - 50, 16, bold, rgb(1, 1, 1));
  const mlbl = s.monthLabel.toUpperCase();
  const mlw = font.widthOfTextAtSize(mlbl, 10);
  text(mlbl, width - M - mlw, height - 46, 10, font, rgb(0.92, 0.96, 0.98));
  let y = height - 74 - 18;

  // ── KPI principali (3 box) ──
  const kpiW = (width - 2 * M - 16) / 3;
  const kpis = [
    { label: "Incassato", value: eur(s.revenue.collected), color: GREEN },
    { label: "Sedute svolte", value: String(s.appointments.done), color: TEAL },
    { label: "Nuovi pazienti", value: String(s.newPatients), color: BLUE },
  ];
  kpis.forEach((k, i) => {
    const x = M + i * (kpiW + 8);
    page.drawRectangle({ x, y: y - 44, width: kpiW, height: 44, color: rgb(0.98, 0.985, 0.99), borderColor: LINE, borderWidth: 1 });
    text(k.label.toUpperCase(), x + 9, y - 16, 6.5, bold, FAINT);
    text(k.value, x + 9, y - 37, 15, bold, k.color);
  });
  y -= 44 + 16;

  // ── Sistema a due colonne ──
  const colGap = 22;
  const colW = (width - 2 * M - colGap) / 2;
  const xL = M;
  const xR = M + colW + colGap;
  const topY = y;
  let yL = y, yR = y;

  // Helper generici parametrizzati su colonna
  const sectionTitle = (t: string, x: number, yy: number): number => {
    text(t.toUpperCase(), x, yy, 7.5, bold, TEAL);
    page.drawRectangle({ x, y: yy - 4, width: colW, height: 0.8, color: LINE });
    return yy - 14;
  };
  const row = (label: string, value: string, x: number, yy: number, color = INK, size = 9): number => {
    text(label, x, yy, size, font, BODY);
    const vw = bold.widthOfTextAtSize(value, size);
    text(value, x + colW - vw, yy, size, bold, color);
    return yy - (size + 4.5);
  };
  const rowIndent = (label: string, value: string, x: number, yy: number, color = INK): number => {
    text(label, x + 11, yy, 8.3, font, FAINT);
    const vw = bold.widthOfTextAtSize(value, 8.3);
    text(value, x + colW - vw, yy, 8.3, bold, color);
    return yy - 12.5;
  };
  const caption = (t: string, x: number, yy: number): number => {
    text(t, x, yy, 7.5, bold, FAINT);
    return yy - 13;
  };
  // mini bar chart in una colonna
  const barChart = (
    x: number, yy: number,
    data: { label: string; value: number; sub?: string }[],
    opts: { highlightLast?: boolean } = {}
  ): number => {
    const chartH = 48;
    const maxV = Math.max(...data.map(d => d.value), 1);
    const slot = colW / data.length;
    const baseY = yy - chartH;
    data.forEach((d, i) => {
      const h = Math.max(1.5, (d.value / maxV) * chartH);
      const bw = slot * 0.6;
      const bx = x + i * slot + (slot - bw) / 2;
      const isLast = opts.highlightLast && i === data.length - 1;
      page.drawRectangle({ x: bx, y: baseY, width: bw, height: h, color: isLast ? GREEN : (opts.highlightLast ? BLUE : TEAL), opacity: opts.highlightLast && !isLast ? 0.55 : 1 });
      const vlab = d.value.toFixed(0);
      const vw = font.widthOfTextAtSize(vlab, 6);
      text(vlab, bx + bw / 2 - vw / 2, baseY + h + 2.5, 6, font, BODY);
      const lw = font.widthOfTextAtSize(d.label, 6);
      text(d.label, bx + slot / 2 - lw / 2 - (slot - bw) / 2 + (slot - bw) / 2, baseY - 9, 6, font, FAINT);
      if (d.sub) {
        const sw = font.widthOfTextAtSize(d.sub, 5.3);
        text(d.sub, bx + bw / 2 - sw / 2, baseY - 16, 5.3, font, FAINT);
      }
    });
    return baseY - 22;
  };

  // ════════ COLONNA SINISTRA ════════
  yL = sectionTitle("Sedute del mese", xL, yL);
  yL = row("Totale appuntamenti", String(s.appointments.total), xL, yL);
  yL = row("Svolte", String(s.appointments.done), xL, yL, GREEN);
  yL = rowIndent("di cui pagate", String(s.appointments.donePaid), xL, yL, GREEN);
  yL = rowIndent("di cui da incassare", String(s.appointments.doneUnpaid), xL, yL, s.appointments.doneUnpaid > 0 ? RED : FAINT);
  yL = rowIndent("di cui gratuite / a 0", String(s.appointments.doneFree), xL, yL, s.appointments.doneFree > 0 ? AMBER : FAINT);
  yL = row("Confermate (da svolgere)", String(s.appointments.confirmed), xL, yL);
  yL = row("Annullate", String(s.appointments.cancelled), xL, yL);
  yL = row("No-show", String(s.appointments.noShow), xL, yL, s.appointments.noShow > 0 ? RED : INK);
  yL = row("Tasso presentazione", `${s.presenceRate}%`, xL, yL, s.presenceRate >= 85 ? GREEN : AMBER);
  yL -= 4;

  yL = sectionTitle("Incassi", xL, yL);
  yL = row("Incassato nel mese", eur(s.revenue.collected), xL, yL, GREEN);
  yL = row("Ticket medio a seduta", eur(s.revenue.avgPerSession), xL, yL);
  yL = row("Valore atteso", eur(s.revenue.expected), xL, yL);
  yL = row("Tasso di incasso", `${s.collectionRate}%`, xL, yL, s.collectionRate >= 90 ? GREEN : AMBER);
  yL = row("Da incassare (insoluti)", eur(s.revenue.unpaid), xL, yL, s.revenue.unpaid > 0 ? RED : INK);
  yL -= 4;

  if (s.byPaymentMethod.length > 0) {
    yL = sectionTitle("Metodo di pagamento", xL, yL);
    for (const pm of s.byPaymentMethod) yL = row(pm.method, `${pm.count} · ${eur(pm.amount)}`, xL, yL);
    yL -= 4;
  }

  if (s.prev) {
    yL = sectionTitle("Confronto mese precedente", xL, yL);
    const dRev = s.revenue.collected - s.prev.collected;
    const dDone = s.appointments.done - s.prev.done;
    yL = row("Var. incassato", `${dRev >= 0 ? "+ " : "- "}${eur(Math.abs(dRev))}`, xL, yL, dRev >= 0 ? GREEN : RED);
    yL = row("Var. sedute svolte", `${dDone > 0 ? "+" : ""}${dDone}`, xL, yL, dDone >= 0 ? GREEN : RED);
    yL -= 4;
  }

  if (s.prevYear) {
    yL = sectionTitle("Confronto anno scorso", xL, yL);
    const dRev = s.revenue.collected - s.prevYear.collected;
    const dDone = s.appointments.done - s.prevYear.done;
    yL = row("Incassato anno scorso", eur(s.prevYear.collected), xL, yL);
    yL = row("Var. incassato", `${dRev >= 0 ? "+ " : "- "}${eur(Math.abs(dRev))}`, xL, yL, dRev >= 0 ? GREEN : RED);
    yL = row("Var. sedute", `${dDone > 0 ? "+" : ""}${dDone}`, xL, yL, dDone >= 0 ? GREEN : RED);
    yL -= 4;
  }

  // ════════ COLONNA DESTRA ════════
  if (s.weekly.length > 0) {
    yR = sectionTitle("Andamento settimanale (incassato)", xR, yR);
    yR = barChart(xR, yR, s.weekly.map(w => ({ label: w.label.replace("Sett. ", "S"), value: w.collected, sub: `${w.sessions}` })));
    yR -= 2;
  }

  if (s.history6.length > 0 && s.history6.some(h => h.collected > 0)) {
    yR = sectionTitle("Ultimi 6 mesi (incassato)", xR, yR);
    yR = barChart(xR, yR, s.history6.map(h => ({ label: h.label, value: h.collected })), { highlightLast: true });
    yR -= 2;
  }

  yR = sectionTitle("Pazienti", xR, yR);
  yR = row("Attivi nel periodo", String(s.activePatients), xR, yR);
  yR = row("Nuovi", String(s.newVsReturning.newP), xR, yR, GREEN);
  yR = row("Di ritorno", String(s.newVsReturning.returning), xR, yR, BLUE);
  if (s.topPatients.length > 0) {
    yR = caption("Top pazienti per fatturato:", xR, yR);
    for (const p of s.topPatients.slice(0, 3)) yR = rowIndent(p.name, `${p.sessions} · ${eur(p.amount)}`, xR, yR);
  }
  yR -= 4;

  if (s.byLocation.length > 1) {
    yR = sectionTitle("Sedute per sede", xR, yR);
    for (const loc of s.byLocation.slice(0, 4)) yR = row(loc.name, `${loc.sessions} · ${eur(loc.amount)}`, xR, yR);
    yR -= 4;
  }

  if (s.rentals.count > 0) {
    yR = sectionTitle("Noleggi", xR, yR);
    yR = row("Conclusi nel periodo", String(s.rentals.count), xR, yR);
    yR = row("Incassato", eur(s.rentals.collected), xR, yR, GREEN);
    if (s.rentals.pending > 0) yR = row("Da incassare", eur(s.rentals.pending), xR, yR, RED);
    yR -= 4;
  }

  if (s.byOperator.filter(o => o.name !== "Non assegnato").length > 1) {
    yR = sectionTitle("Per operatore", xR, yR);
    for (const op of s.byOperator.slice(0, 4)) yR = row(op.name, `${op.count} · ${eur(op.revenue)}`, xR, yR);
    yR -= 4;
  }

  if (s.unpaidList.length > 0) {
    yR = sectionTitle("Insoluti da sollecitare", xR, yR);
    for (const u of s.unpaidList.slice(0, 5)) yR = row(u.name, `${u.count} · ${eur(u.amount)}`, xR, yR, RED);
  }

  // separatore verticale tra colonne
  const sepBottom = Math.min(yL, yR) + 6;
  page.drawRectangle({ x: xR - colGap / 2, y: sepBottom, width: 0.6, height: topY - sepBottom, color: LINE });

  // ── Footer ──
  text(`FisioHub · report generato il ${new Date().toLocaleDateString("it-IT")}`, M, 28, 7, font, FAINT);

  return doc.save();
}

export function reportFilename(s: MonthlyStats): string {
  const safe = s.studioName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return `report-${safe}-${s.year}-${String(s.month + 1).padStart(2, "0")}.pdf`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ═══════════════════════════════════════════════════════════════════════
// Periodi generici: mese / trimestre / anno
// ═══════════════════════════════════════════════════════════════════════

export type PeriodKind = "month" | "quarter" | "year";

export type PeriodStats = MonthlyStats & { periodKind: PeriodKind; periodLabel: string };

const TRIMESTRI = ["1° trimestre", "2° trimestre", "3° trimestre", "4° trimestre"];

// Calcola l'intervallo [start,end) e l'etichetta del periodo PRECEDENTE rispetto a `now`
export function previousPeriod(kind: PeriodKind, now: Date): {
  startY: number; startM: number; months: number; label: string;
} {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (kind === "year") {
    return { startY: y - 1, startM: 0, months: 12, label: `anno ${y - 1}` };
  }
  if (kind === "quarter") {
    // trimestre precedente
    const curQ = Math.floor(m / 3);            // 0..3
    let q = curQ - 1, qy = y;
    if (q < 0) { q = 3; qy = y - 1; }
    return { startY: qy, startM: q * 3, months: 3, label: `${TRIMESTRI[q]} ${qy}` };
  }
  // month
  const target = new Date(Date.UTC(y, m - 1, 1));
  return { startY: target.getUTCFullYear(), startM: target.getUTCMonth(), months: 1, label: "" };
}

// Statistiche aggregate su un intervallo di più mesi (somma i mesi)
export async function computePeriodStats(
  db: SupabaseClient, studioId: string, studioName: string,
  kind: PeriodKind, now: Date,
): Promise<PeriodStats> {
  const p = previousPeriod(kind, now);

  if (kind === "month") {
    const base = await computeMonthlyStats(db, studioId, studioName, p.startY, p.startM);
    return { ...base, periodKind: "month", periodLabel: base.monthLabel };
  }

  // trimestre / anno: aggrego i mesi del periodo
  const start = romeStartOfMonth(p.startY, p.startM);
  const end = romeStartOfMonth(p.startY, p.startM + p.months);

  const [apptRes, newPatRes, opRes] = await Promise.all([
    db.from("appointments").select("id, amount, status, is_paid, operator_id, payment_method, patient_id, start_at")
      .eq("studio_id", studioId).is("guest_practitioner_id", null)
      .gte("start_at", start).lt("start_at", end),
    db.from("patients").select("id", { count: "exact", head: true })
      .eq("studio_id", studioId).gte("created_at", start).lt("created_at", end),
    db.from("studio_members").select("user_id, display_name").eq("studio_id", studioId),
  ]);

  const appts = apptRes.data ?? [];
  const done = appts.filter(a => a.status === "done");
  const donePaid = done.filter(a => Number(a.amount || 0) > 0 && a.is_paid).length;
  const doneUnpaid = done.filter(a => Number(a.amount || 0) > 0 && !a.is_paid).length;
  const doneFree = done.filter(a => a.amount == null || Number(a.amount) === 0).length;
  const confirmed = appts.filter(a => a.status === "confirmed");
  const cancelled = appts.filter(a => a.status === "cancelled");
  const noShow = appts.filter(a => a.status === "no_show");
  const collected = appts.filter(a => a.is_paid).reduce((s, a) => s + Number(a.amount || 0), 0);
  const expected = appts.filter(a => a.status !== "cancelled").reduce((s, a) => s + Number(a.amount || 0), 0);
  const unpaidAppts = appts.filter(a => !a.is_paid && a.status !== "cancelled" && Number(a.amount || 0) > 0);
  const unpaid = unpaidAppts.reduce((s, a) => s + Number(a.amount || 0), 0);
  const paidSessions = appts.filter(a => a.is_paid && Number(a.amount || 0) > 0).length;
  const avgPerSession = paidSessions > 0 ? collected / paidSessions : 0;
  const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
  const presenceDen = done.length + cancelled.length + noShow.length;
  const presenceRate = presenceDen > 0 ? Math.round((done.length / presenceDen) * 100) : 100;
  const activePatients = new Set(appts.filter(a => a.status !== "cancelled" && a.patient_id).map(a => a.patient_id)).size;

  const opNames = new Map<string, string>();
  for (const mm of (opRes.data ?? [])) if (mm.user_id) opNames.set(mm.user_id, mm.display_name || "Operatore");
  const byOpMap = new Map<string, { name: string; count: number; revenue: number }>();
  for (const a of appts) {
    if (a.status === "cancelled") continue;
    const uid = a.operator_id || "—";
    const name = opNames.get(uid) || "Non assegnato";
    const cur = byOpMap.get(uid) || { name, count: 0, revenue: 0 };
    cur.count += 1; cur.revenue += Number(a.amount || 0);
    byOpMap.set(uid, cur);
  }
  const byOperator = [...byOpMap.values()].sort((a, b) => b.count - a.count);

  const methodMap = new Map<string, { count: number; amount: number }>();
  for (const a of appts) {
    if (!a.is_paid || Number(a.amount || 0) <= 0) continue;
    const raw = (a.payment_method || "").toLowerCase().trim();
    const label = METHOD_LABELS[raw] || (raw ? raw[0].toUpperCase() + raw.slice(1) : "Non indicato");
    const cur = methodMap.get(label) || { count: 0, amount: 0 };
    cur.count += 1; cur.amount += Number(a.amount || 0);
    methodMap.set(label, cur);
  }
  const byPaymentMethod = [...methodMap.entries()]
    .map(([method, v]) => ({ method, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  const unpaidByPat = new Map<string, { count: number; amount: number }>();
  for (const a of unpaidAppts) {
    const pid = a.patient_id || "—";
    const cur = unpaidByPat.get(pid) || { count: 0, amount: 0 };
    cur.count += 1; cur.amount += Number(a.amount || 0);
    unpaidByPat.set(pid, cur);
  }
  let unpaidList: { name: string; count: number; amount: number }[] = [];
  const unpaidPatIds = [...unpaidByPat.keys()].filter(id => id !== "—");
  if (unpaidPatIds.length > 0) {
    const { data: pats } = await db.from("patients").select("id, first_name, last_name").in("id", unpaidPatIds);
    const nameOf = new Map((pats ?? []).map(p => [p.id, `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "Paziente"]));
    unpaidList = [...unpaidByPat.entries()].map(([pid, v]) => ({
      name: pid === "—" ? "Senza paziente" : (nameOf.get(pid) || "Paziente"),
      count: v.count, amount: v.amount,
    })).sort((a, b) => b.amount - a.amount);
  }

  return {
    studioName, year: p.startY, month: p.startM,
    monthLabel: p.label, periodKind: kind, periodLabel: p.label,
    appointments: { total: appts.length, done: done.length, confirmed: confirmed.length, cancelled: cancelled.length, noShow: noShow.length, donePaid, doneUnpaid, doneFree },
    revenue: { collected, expected, unpaid, avgPerSession },
    collectionRate, presenceRate,
    newPatients: newPatRes.count ?? 0,
    activePatients,
    byOperator, byPaymentMethod, unpaidList,
    weekly: [],  // grafico settimanale solo per il report mensile
    newVsReturning: { newP: 0, returning: 0 },
    topPatients: [], byLocation: [], rentals: { count: 0, collected: 0, pending: 0 },
    prevYear: null, history6: [],
    prev: null,
  };
}

// PDF per periodo generico: riusa il renderer ma con etichetta periodo
export async function renderPeriodReportPdf(s: PeriodStats): Promise<Uint8Array> {
  // Sostituisce monthLabel con periodLabel per l'intestazione
  return renderMonthlyReportPdf({ ...s, monthLabel: s.periodLabel });
}

export function periodReportFilename(s: PeriodStats): string {
  const safe = s.studioName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  const tag = s.periodKind === "year" ? `${s.year}` :
    s.periodKind === "quarter" ? `${s.year}-T${Math.floor(s.month / 3) + 1}` :
    `${s.year}-${String(s.month + 1).padStart(2, "0")}`;
  return `report-${safe}-${tag}.pdf`;
}
