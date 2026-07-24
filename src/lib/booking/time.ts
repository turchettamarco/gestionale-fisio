// ═══════════════════════════════════════════════════════════════════════
// src/lib/booking/time.ts — orari del booking pubblico nel fuso italiano
// ═══════════════════════════════════════════════════════════════════════
//
// PERCHÉ ESISTE:
// Le API del booking girano su Vercel, dove il processo Node ha fuso UTC.
// Il codice precedente faceva `new Date(a.start_at).getHours()`, che in
// UTC restituisce l'ora sbagliata di 1h (inverno) o 2h (estate) rispetto
// a quella italiana, mentre working_hours.open_time ("09:00") è scritto
// in ora italiana. Risultato: gli slot occupati venivano calcolati
// spostati, quindi la disponibilità mostrata era falsa.
//
// Qui l'ora italiana viene ricavata esplicitamente con Intl, senza
// dipendere dal fuso del server né da librerie esterne.
// ═══════════════════════════════════════════════════════════════════════

const TZ = "Europe/Rome";

/** Parti data/ora di un istante, lette nel fuso indicato. */
function partsInTz(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    // Intl può restituire "24" per mezzanotte in alcune runtime.
    hour: Number(p.hour) === 24 ? 0 : Number(p.hour),
    minute: Number(p.minute), second: Number(p.second),
  };
}

/** Scarto (ms) tra il fuso indicato e UTC per un dato istante. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = partsInTz(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/**
 * Converte data e ora ITALIANE ("2026-03-23", "14:30") nell'istante UTC
 * corrispondente, in formato ISO — pronto per confronti su timestamptz.
 *
 * Il doppio passaggio serve per i giorni di cambio ora legale: la prima
 * stima usa lo scarto dell'istante sbagliato, la seconda lo corregge.
 */
export function romeLocalToUtcISO(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);

  let ts = naive - tzOffsetMs(new Date(naive), TZ);
  ts = naive - tzOffsetMs(new Date(ts), TZ);

  return new Date(ts).toISOString();
}

/**
 * Minuti dall'inizio della giornata ITALIANA di un istante.
 * Es. un appuntamento salvato come 08:00Z d'estate → 600 (= 10:00 in Italia).
 */
export function romeMinutesOfDay(iso: string | Date): number {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const p = partsInTz(date, TZ);
  return p.hour * 60 + p.minute;
}

/** Giorno della settimana italiano (0 = domenica) per una data "YYYY-MM-DD". */
export function romeDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Mezzogiorno: lontano da qualunque salto di ora legale.
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/** "HH:MM" da minuti dall'inizio giornata. */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Minuti dall'inizio giornata da "HH:MM" o "HH:MM:SS". */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
