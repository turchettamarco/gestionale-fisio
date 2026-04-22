// Utility pure per formattazione date e orari

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function startOfISOWeekMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function addWeeks(d: Date, w: number): Date {
  return addDays(d, w * 7);
}

export function formatDMY(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  const out = new Date();
  out.setFullYear(y, m - 1, d);
  out.setHours(0, 0, 0, 0);
  return out;
}

// Auto-fit font size per il nome del paziente nel blocco appuntamento
export function autoNameFontSize(fullName?: string | null): number {
  const n = ((fullName ?? "") as string).trim().length;
  if (n <= 14) return 13;
  if (n <= 20) return 12;
  if (n <= 28) return 11;
  if (n <= 36) return 10;
  return 9;
}

// Genera le date di inizio per una serie di appuntamenti ricorrenti
export function generateRecurringStarts(params: {
  firstStart: Date;
  untilDate: Date;
  weekDays: number[];
  frequency?: number; // ogni N settimane (default 1)
}): Date[] {
  const { firstStart, untilDate, weekDays, frequency = 1 } = params;
  const hh = firstStart.getHours();
  const mm = firstStart.getMinutes();
  const ss = firstStart.getSeconds();
  const ms = firstStart.getMilliseconds();

  const startDay = new Date(firstStart);
  const endDay = new Date(untilDate);
  endDay.setHours(23, 59, 59, 999);

  const results: Date[] = [];
  const weekStart = startOfISOWeekMonday(startDay);

  for (let d = new Date(startDay); d <= endDay; d = addDays(d, 1)) {
    const dow = d.getDay();
    if (dow === 0) continue;
    if (!weekDays.includes(dow)) continue;

    // Verifica se la settimana è valida in base alla frequenza
    if (frequency > 1) {
      const thisWeekStart = startOfISOWeekMonday(d);
      const weeksDiff = Math.round(
        (thisWeekStart.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
      );
      if (weeksDiff % frequency !== 0) continue;
    }

    const occ = new Date(d);
    occ.setHours(hh, mm, ss, ms);
    if (occ < firstStart) continue;

    results.push(occ);
  }

  return results;
}

// Formatta una data in modo relativo (Oggi, Domani, o "Lunedì 15 Gennaio")
export function formatDateRelative(date: Date): string {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  const domani = new Date(oggi);
  domani.setDate(oggi.getDate() + 1);

  const dataAppuntamento = new Date(date);
  dataAppuntamento.setHours(0, 0, 0, 0);

  if (dataAppuntamento.getTime() === oggi.getTime()) return "Oggi";
  if (dataAppuntamento.getTime() === domani.getTime()) return "Domani";

  const giorni = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const mesi = [
    "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
    "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
  ];

  const giornoSettimana = giorni[dataAppuntamento.getDay()];
  const giorno = dataAppuntamento.getDate();
  const mese = mesi[dataAppuntamento.getMonth()];

  return `${giornoSettimana} ${giorno} ${mese}`;
}

// Calcola i 42 giorni (6 settimane) da mostrare nella vista mensile,
// partendo dal lunedì della settimana che contiene il 1° del mese
export function getMonthGridDays(currentDate: Date): Date[] {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);

  // Start from Monday before or on the 1st
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const calStart = addDays(firstDay, -startOffset);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(calStart, i));
  }
  return days;
}

// Calcola gli slot liberi in un giorno lavorativo (8-20) dato un array di
// eventi della giornata. Utile per suggerire orari liberi in fase di creazione.
export function getAvailableSlotsInDay(
  day: Date,
  dayEvents: { start: Date; end: Date; status?: string }[],
): { start: Date; end: Date }[] {
  const WORK_START = 8, WORK_END = 20;
  const filtered = dayEvents
    .filter(ev => ev.status !== "cancelled")
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: { start: Date; end: Date }[] = [];
  let cursor = new Date(day); cursor.setHours(WORK_START, 0, 0, 0);
  const workEnd = new Date(day); workEnd.setHours(WORK_END, 0, 0, 0);

  for (const ev of filtered) {
    if (ev.start > cursor) slots.push({ start: new Date(cursor), end: new Date(ev.start) });
    if (ev.end > cursor) cursor = new Date(ev.end);
  }
  if (cursor < workEnd) slots.push({ start: new Date(cursor), end: new Date(workEnd) });
  return slots;
}

// Posizione verticale in pixel di un evento all'interno della griglia oraria
// che parte dalle 7:00. Usata dalla vista settimana e giorno.
export function getEventYPosition(
  start: Date,
  end: Date,
  pxPerMinute: number = 1,
): { top: number; height: number } {
  const startHour = start.getHours();
  const startMinute = start.getMinutes();
  const endHour = end.getHours();
  const endMinute = end.getMinutes();
  const top = ((startHour - 7) * 60 + startMinute) * pxPerMinute;
  const height = ((endHour - startHour) * 60 + (endMinute - startMinute)) * pxPerMinute;
  return { top, height };
}
