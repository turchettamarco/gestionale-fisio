// app/(protected)/components/dashboard/shared/utils.ts
// ═══════════════════════════════════════════════════════════════════════
// Funzioni utility per date, formattazione, calcoli, slot, WhatsApp.
// ═══════════════════════════════════════════════════════════════════════

import { normalizePhoneForWA } from "@/src/lib/whatsapp";
import { WORK_START, WORK_END } from "./theme";
import type {
  AppointmentRow,
  FreeSlot,
  PatientRef,
} from "./types";

/* ─── Data helpers ────────────────────────────────────────────────── */

export const startOfDay = (d: Date) => {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
};
export const maxDate = (a: Date, b: Date) => (a >= b ? a : b);
export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const mondayStart = (d: Date) => {
  const x = startOfDay(d);
  return addDays(x, (x.getDay() === 0 ? -6 : 1) - x.getDay());
};

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

export const fmtWeekday = (d: Date) =>
  d.toLocaleDateString("it-IT", { weekday: "long" });

export const formatDateRelative = (date: Date): string => {
  const oggi = startOfDay(new Date());
  const d = startOfDay(date);
  if (isSameDay(d, oggi)) return "oggi";
  if (isSameDay(d, addDays(oggi, 1))) return "domani";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "2-digit" });
};

export const toYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/* ─── Soldi e numeri ──────────────────────────────────────────────── */

export const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString("it-IT", { maximumFractionDigits: 0 }) + "€";

export const sumAmount = (rows: AppointmentRow[]): number =>
  rows.reduce((s, r) => {
    const n = typeof r.amount === "string" ? Number(r.amount) : r.amount;
    return s + (Number.isFinite(n as number) ? (n as number) : 0);
  }, 0);

export const pctDelta = (c: number, p: number): number =>
  p === 0 ? (c === 0 ? 0 : 100) : ((c - p) / p) * 100;

/* ─── Telefono & WhatsApp ─────────────────────────────────────────── */

// Delegato alla utility centrale in src/lib/whatsapp.ts per consistenza.
export function cleanPhoneWA(phone: string): string {
  return normalizePhoneForWA(phone);
}

// Alias di compatibilità storica
export const fmtPhone = cleanPhoneWA;

export function openWA(phone: string, message: string): void {
  const clean = cleanPhoneWA(phone);
  if (!clean) { alert("Numero non valido."); return; }
  const isMobile = /iPhone|iPad|iPod|Android/i.test(
    typeof navigator !== "undefined" ? navigator.userAgent : ""
  );
  const url = isMobile
    ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
    : `https://web.whatsapp.com/send?phone=${clean}&text=${encodeURIComponent(message)}`;
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click();
  setTimeout(() => document.body.removeChild(a), 200);
}

/* ─── Patient helpers ─────────────────────────────────────────────── */

export const pickPatient = (p: PatientRef | PatientRef[] | undefined): PatientRef =>
  Array.isArray(p) ? (p[0] ?? null) : (p ?? null);

export const patientName = (p: PatientRef | PatientRef[] | undefined): string => {
  const pt = pickPatient(p);
  return `${pt?.last_name ?? ""} ${pt?.first_name ?? ""}`.trim() || "Paziente sconosciuto";
};

export const buildWAMsg = (a: AppointmentRow): string => {
  const fn = (pickPatient(a.patients)?.first_name || "").trim() || "Cliente";
  const luogo = a.location === "studio"
    ? a.clinic_site || "Studio"
    : `Domicilio (${a.domicile_address || "indirizzo da confermare"})`;
  return `Buongiorno ${fn},\n\nLe ricordiamo il suo appuntamento di ${formatDateRelative(new Date(a.start_at))} alle ore ${fmtTime(a.start_at)}.\n\n📍 ${luogo}\n\nA presto,\nFisioHub - Studi Galileo`;
};

/* ─── Note del giorno (localStorage) ──────────────────────────────── */

export const todayNoteKey = () =>
  `fisiohub_daynote_${new Date().toISOString().slice(0, 10)}`;

/* ─── Slot liberi ─────────────────────────────────────────────────── */

export function computeFreeSlots(
  dayAppts: AppointmentRow[],
  dateYMD: string,
  label: "oggi" | "domani"
): FreeSlot[] {
  // Domenica = 0 → nessuno slot
  if (new Date(`${dateYMD}T00:00:00`).getDay() === 0) return [];
  const slots: FreeSlot[] = [];
  for (let h = WORK_START; h < WORK_END; h++) {
    const slotStart = `${dateYMD}T${pad2(h)}:00:00`;
    const slotEnd   = `${dateYMD}T${pad2(h + 1)}:00:00`;
    // Overlap reale: considera la durata effettiva dell'appuntamento (end_at)
    const occupied = dayAppts.some(a =>
      a.status !== "cancelled" &&
      a.start_at < slotEnd &&
      (a.end_at ?? slotEnd) > slotStart
    );
    if (!occupied) slots.push({ day: label, time: `${pad2(h)}:00`, dateYMD });
  }
  return slots;
}

/* ─── Group appuntamenti per giorno ───────────────────────────────── */

export function groupByDay(
  appts: AppointmentRow[]
): { dayKey: string; date: Date; items: AppointmentRow[] }[] {
  const map = new Map<string, { dayKey: string; date: Date; items: AppointmentRow[] }>();
  for (const a of appts) {
    const d = startOfDay(new Date(a.start_at));
    const key = d.toISOString().slice(0, 10);
    const ex = map.get(key);
    if (ex) ex.items.push(a);
    else map.set(key, { dayKey: key, date: d, items: [a] });
  }
  return Array.from(map.values()).sort((x, y) => x.date.getTime() - y.date.getTime());
}
