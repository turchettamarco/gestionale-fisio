// ═══════════════════════════════════════════════════════════════════════
// src/lib/waitlist.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Tipi e logica condivisa della Lista d'attesa (mig. 054).
//
//   - WaitlistEntry: riga di waitlist_entries + join paziente
//   - entryMatchesSlot(): una voce è compatibile con uno slot liberato?
//   - buildSlotWhatsAppMessage(): messaggio pronto per proporre lo slot
//
// Convenzioni:
//   - preferred_days: ISO 1=lunedì … 7=domenica; array vuoto = qualsiasi
//   - time_from/time_to: "HH:MM[:SS]"; null = qualsiasi orario
// ═══════════════════════════════════════════════════════════════════════

export type WaitlistStatus = "active" | "notified" | "booked" | "cancelled";

export type WaitlistPriority = "urgente" | "normale" | "bassa";

export type WaitlistEntry = {
  id: string;
  studio_id: string;
  patient_id: string;
  preferred_days: number[];
  time_from: string | null;
  time_to: string | null;
  note: string | null;
  status: WaitlistStatus;
  notified_at: string | null;
  created_at: string;
  // ── mig. 062 ──
  duration_min?: number;          // durata seduta attesa (default 60)
  priority?: WaitlistPriority;    // urgente | normale | bassa
  expires_on?: string | null;     // "serve entro il" (YYYY-MM-DD)
  treatment_type?: string | null; // trattamento atteso
  offered_count?: number;         // proposte già inviate
  last_offered_slot?: string | null;
  // join
  patients?: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
};

export const WEEKDAY_LABELS: { iso: number; short: string; long: string }[] = [
  { iso: 1, short: "Lun", long: "lunedì" },
  { iso: 2, short: "Mar", long: "martedì" },
  { iso: 3, short: "Mer", long: "mercoledì" },
  { iso: 4, short: "Gio", long: "giovedì" },
  { iso: 5, short: "Ven", long: "venerdì" },
  { iso: 6, short: "Sab", long: "sabato" },
  { iso: 7, short: "Dom", long: "domenica" },
];

/** Nome completo del paziente di una voce (fallback "Paziente"). */
export function entryPatientName(e: WaitlistEntry): string {
  const p = e.patients;
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  return name || "Paziente";
}

/** "HH:MM[:SS]" → minuti dalla mezzanotte (null se assente/invalida). */
function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Giorno ISO (1=lun…7=dom) di una Date. */
export function isoWeekday(d: Date): number {
  const js = d.getDay(); // 0=dom
  return js === 0 ? 7 : js;
}

/** Etichetta compatta delle preferenze di una voce ("Lun, Mer · 15:00–19:00"). */
export function entryPreferencesLabel(e: WaitlistEntry): string {
  const days =
    e.preferred_days.length === 0
      ? "Qualsiasi giorno"
      : [...e.preferred_days]
          .sort((a, b) => a - b)
          .map((iso) => WEEKDAY_LABELS.find((w) => w.iso === iso)?.short ?? iso)
          .join(", ");
  const from = e.time_from?.slice(0, 5);
  const to = e.time_to?.slice(0, 5);
  const time =
    from && to ? `${from}–${to}` : from ? `dalle ${from}` : to ? `entro le ${to}` : "qualsiasi orario";
  return `${days} · ${time}`;
}

/**
 * True se la voce di lista d'attesa è compatibile con lo slot dato.
 * Regole: giorno della settimana incluso nelle preferenze (o nessuna
 * preferenza) E orario di inizio dentro la fascia (estremi inclusi).
 */
export function entryMatchesSlot(
  e: WaitlistEntry,
  slotStart: Date,
  slotDurationMin?: number | null,
): boolean {
  if (e.status !== "active" && e.status !== "notified") return false;

  if (e.preferred_days.length > 0 && !e.preferred_days.includes(isoWeekday(slotStart))) {
    return false;
  }

  const slotMin = slotStart.getHours() * 60 + slotStart.getMinutes();
  const fromMin = timeToMinutes(e.time_from);
  const toMin = timeToMinutes(e.time_to);
  if (fromMin != null && slotMin < fromMin) return false;
  if (toMin != null && slotMin > toMin) return false;

  // La seduta attesa deve STARCI nel buco liberato (se la durata è nota).
  if (slotDurationMin != null && (e.duration_min ?? 60) > slotDurationMin) return false;

  return true;
}

/** Giorni interi di attesa in lista. */
export function entryWaitingDays(e: WaitlistEntry): number {
  return Math.max(0, Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86_400_000));
}

/** True se la voce ha superato la data "serve entro il". */
export function entryIsExpired(e: WaitlistEntry, todayISO?: string): boolean {
  if (!e.expires_on) return false;
  const today = todayISO || new Date().toISOString().slice(0, 10);
  return e.expires_on < today;
}

/**
 * Ordina i candidati per uno slot: urgenza, poi scadenza imminente, poi
 * attesa più lunga; a parità, chi ha ricevuto MENO proposte (equità).
 */
export function rankWaitlistCandidates(entries: WaitlistEntry[]): WaitlistEntry[] {
  const prioRank: Record<string, number> = { urgente: 0, normale: 1, bassa: 2 };
  return [...entries].sort((a, b) => {
    const pa = prioRank[a.priority ?? "normale"] ?? 1;
    const pb = prioRank[b.priority ?? "normale"] ?? 1;
    if (pa !== pb) return pa - pb;
    const ea = a.expires_on || "9999-12-31";
    const eb = b.expires_on || "9999-12-31";
    if (ea !== eb) return ea < eb ? -1 : 1;
    const wa = entryWaitingDays(a), wb = entryWaitingDays(b);
    if (wa !== wb) return wb - wa;
    return (a.offered_count ?? 0) - (b.offered_count ?? 0);
  });
}

/** Formatta lo slot in italiano leggibile: "giovedì 9 luglio alle 15:00". */
export function formatSlotIT(slotStart: Date): string {
  const dayName = slotStart.toLocaleDateString("it-IT", { weekday: "long" });
  const dayNum = slotStart.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  const time = slotStart.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${dayName} ${dayNum} alle ${time}`;
}

/** Messaggio WhatsApp per proporre lo slot liberato a un paziente in lista. */
export function buildSlotWhatsAppMessage(opts: {
  patientFirstName?: string | null;
  slotStart: Date;
  studioName?: string | null;
}): string {
  const hi = opts.patientFirstName ? `Ciao ${opts.patientFirstName}!` : "Ciao!";
  const studio = opts.studioName ? ` presso ${opts.studioName}` : "";
  return (
    `${hi} 👋\n` +
    `Si è appena liberato un posto${studio} ${formatSlotIT(opts.slotStart)}.\n` +
    `Eri in lista d'attesa: ti va di prenderlo? Rispondimi qui e te lo blocco subito. 🙂`
  );
}
