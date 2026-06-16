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
  const M = 48;
  let y = height;

  const text = (t: string, x: number, yy: number, size: number, f: PDFFont, color = INK) =>
    page.drawText(t, { x, y: yy, size, font: f, color });

  // Header a banda gradiente (simulato con rettangolo teal)
  page.drawRectangle({ x: 0, y: height - 120, width, height: 120, color: TEAL });
  page.drawRectangle({ x: width * 0.5, y: height - 120, width: width * 0.5, height: 120, color: BLUE, opacity: 0.5 });
  text("REPORT MENSILE", M, height - 50, 11, bold, rgb(1, 1, 1));
  text(s.studioName, M, height - 78, 22, bold, rgb(1, 1, 1));
  text(s.monthLabel.toUpperCase(), M, height - 100, 13, font, rgb(0.9, 0.95, 0.97));
  y = height - 120 - 40;

  // ── KPI principali (3 box) ──
  const kpiW = (width - 2 * M - 24) / 3;
  const kpis = [
    { label: "Incassato", value: eur(s.revenue.collected), color: GREEN },
    { label: "Sedute svolte", value: String(s.appointments.done), color: TEAL },
    { label: "Nuovi pazienti", value: String(s.newPatients), color: BLUE },
  ];
  kpis.forEach((k, i) => {
    const x = M + i * (kpiW + 12);
    page.drawRectangle({ x, y: y - 70, width: kpiW, height: 70, color: rgb(0.97, 0.98, 0.99), borderColor: LINE, borderWidth: 1 });
    text(k.label.toUpperCase(), x + 14, y - 22, 8, bold, FAINT);
    text(k.value, x + 14, y - 50, 20, bold, k.color);
  });
  y -= 70 + 36;

  // ── Sezione: Sedute ──
  const sectionTitle = (t: string) => {
    text(t.toUpperCase(), M, y, 10, bold, TEAL);
    page.drawRectangle({ x: M, y: y - 8, width: width - 2 * M, height: 1, color: LINE });
    y -= 26;
  };
  const row = (label: string, value: string, color = INK) => {
    text(label, M, y, 11, font, BODY);
    const vw = bold.widthOfTextAtSize(value, 11);
    text(value, width - M - vw, y, 11, bold, color);
    y -= 22;
  };
  const rowIndent = (label: string, value: string, color = FAINT) => {
    text(label, M + 18, y, 10, font, FAINT);
    const vw = bold.widthOfTextAtSize(value, 10);
    text(value, width - M - vw, y, 10, bold, color);
    y -= 19;
  };

  sectionTitle("Sedute del mese");
  row("Totale appuntamenti", String(s.appointments.total));
  row("Svolte", String(s.appointments.done), GREEN);
  rowIndent("di cui pagate", String(s.appointments.donePaid), GREEN);
  rowIndent("di cui da incassare", String(s.appointments.doneUnpaid), s.appointments.doneUnpaid > 0 ? RED : FAINT);
  rowIndent("di cui gratuite / a 0€", String(s.appointments.doneFree), s.appointments.doneFree > 0 ? AMBER : FAINT);
  row("Confermate (da svolgere)", String(s.appointments.confirmed));
  row("Annullate", String(s.appointments.cancelled));
  row("Mancate presentazioni (no-show)", String(s.appointments.noShow), s.appointments.noShow > 0 ? RED : INK);
  row("Tasso di presentazione", `${s.presenceRate}%`, s.presenceRate >= 85 ? GREEN : s.presenceRate >= 70 ? AMBER : RED);
  y -= 14;

  sectionTitle("Incassi");
  row("Incassato nel mese", eur(s.revenue.collected), GREEN);
  row("Ticket medio a seduta", eur(s.revenue.avgPerSession));
  row("Valore atteso (sedute non annullate)", eur(s.revenue.expected));
  row("Tasso di incasso", `${s.collectionRate}%`, s.collectionRate >= 90 ? GREEN : AMBER);
  row("Da incassare (insoluti)", eur(s.revenue.unpaid), s.revenue.unpaid > 0 ? RED : INK);
  y -= 14;

  // ── Incasso per metodo di pagamento ──
  if (s.byPaymentMethod.length > 0) {
    sectionTitle("Incasso per metodo di pagamento");
    for (const pm of s.byPaymentMethod) {
      row(pm.method, `${pm.count} pag. · ${eur(pm.amount)}`);
      if (y < 90) break;
    }
    y -= 14;
  }

  // ── Confronto mese precedente ──
  if (s.prev) {
    sectionTitle("Confronto con il mese precedente");
    const dRev = s.revenue.collected - s.prev.collected;
    const dDone = s.appointments.done - s.prev.done;
    const arrow = (n: number) => (n > 0 ? "+ " : n < 0 ? "- " : "");
    row("Variazione incassato", `${arrow(dRev)}${eur(Math.abs(dRev))}`, dRev >= 0 ? GREEN : RED);
    row("Variazione sedute svolte", `${dDone > 0 ? "+" : ""}${dDone}`, dDone >= 0 ? GREEN : RED);
    y -= 14;
  }

  // ── Grafico settimanale (incassato per settimana) ──
  if (s.weekly.length > 0 && y > 200) {
    sectionTitle("Andamento settimanale (incassato)");
    const maxW = Math.max(...s.weekly.map(w => w.collected), 1);
    const chartW = width - 2 * M;
    const barMaxH = 70;
    const slot = chartW / s.weekly.length;
    const baseY = y - barMaxH;
    s.weekly.forEach((w, i) => {
      const h = Math.max(2, (w.collected / maxW) * barMaxH);
      const bx = M + i * slot + slot * 0.2;
      const bw = slot * 0.6;
      page.drawRectangle({ x: bx, y: baseY, width: bw, height: h, color: TEAL });
      // valore sopra
      const vlabel = "EUR " + w.collected.toFixed(0);
      const vw = font.widthOfTextAtSize(vlabel, 8);
      text(vlabel, bx + bw / 2 - vw / 2, baseY + h + 4, 8, font, BODY);
      // etichetta settimana sotto
      const lw = font.widthOfTextAtSize(w.label, 8);
      text(w.label, bx + bw / 2 - lw / 2, baseY - 12, 8, font, FAINT);
      // sedute
      const sLabel = `${w.sessions} sed.`;
      const sw = font.widthOfTextAtSize(sLabel, 7);
      text(sLabel, bx + bw / 2 - sw / 2, baseY - 22, 7, font, FAINT);
    });
    y = baseY - 38;
  }

  // ── Per operatore (solo se multi-operatore reale) ──
  const realOps = s.byOperator.filter(o => o.name !== "Non assegnato");
  if (realOps.length > 1 && y > 120) {
    sectionTitle("Ripartizione per operatore");
    for (const op of s.byOperator) {
      row(op.name, `${op.count} sedute · ${eur(op.revenue)}`);
      if (y < 90) break;
    }
    y -= 14;
  }

  // ── Insoluti da sollecitare (con nomi) ──
  if (s.unpaidList.length > 0 && y > 120) {
    sectionTitle("Insoluti da sollecitare");
    for (const u of s.unpaidList) {
      row(u.name, `${u.count} sed. · ${eur(u.amount)}`, RED);
      if (y < 80) break;
    }
  }

  // ── Footer ──
  text(`FisioHub · report generato il ${new Date().toLocaleDateString("it-IT")}`, M, 36, 8, font, FAINT);

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
