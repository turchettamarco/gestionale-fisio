// ═══════════════════════════════════════════════════════════════════════
// src/lib/holidays.ts — Festività nazionali italiane
// ═══════════════════════════════════════════════════════════════════════
// Le 10 feste fisse + Pasqua e Lunedì dell'Angelo (calcolo di Gauss,
// calendario gregoriano). Nessun dato remoto, nessuna configurazione.
// Il patrono comunale varia per città e resta volutamente fuori: per i
// giorni particolari dello studio ci sono già assenze e chiusure.

const FIXED: Record<string, string> = {
  "01-01": "Capodanno",
  "01-06": "Epifania",
  "04-25": "Festa della Liberazione",
  "05-01": "Festa dei Lavoratori",
  "06-02": "Festa della Repubblica",
  "08-15": "Ferragosto",
  "11-01": "Ognissanti",
  "12-08": "Immacolata Concezione",
  "12-25": "Natale",
  "12-26": "Santo Stefano",
};

/** Data di Pasqua per un anno (algoritmo Anonymous Gregorian). */
export function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=marzo, 4=aprile
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

const easterCache = new Map<number, { pasqua: string; pasquetta: string }>();
function easterKeys(year: number) {
  let hit = easterCache.get(year);
  if (!hit) {
    const p = easterDate(year);
    const p2 = new Date(p);
    p2.setDate(p2.getDate() + 1);
    const k = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    hit = { pasqua: k(p), pasquetta: k(p2) };
    easterCache.set(year, hit);
  }
  return hit;
}

/**
 * Nome della festività nazionale per la data, o null se è un giorno normale.
 * Accetta Date o stringa "YYYY-MM-DD".
 */
export function italianHoliday(date: Date | string): string | null {
  const d = typeof date === "string" ? new Date(date + "T12:00:00") : date;
  if (isNaN(d.getTime())) return null;
  const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (FIXED[mmdd]) return FIXED[mmdd];
  const { pasqua, pasquetta } = easterKeys(d.getFullYear());
  if (mmdd === pasqua) return "Pasqua";
  if (mmdd === pasquetta) return "Lunedì dell'Angelo";
  return null;
}
