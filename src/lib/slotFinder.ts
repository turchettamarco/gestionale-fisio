// ═══════════════════════════════════════════════════════════════════════
// src/lib/slotFinder.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Motore "Trova buco": dato un intervallo di giorni, una durata e delle
// preferenze (giorni della settimana, fascia oraria), restituisce gli slot
// liberi ORDINATI PER QUALITÀ, non solo in ordine cronologico.
//
// È autonomo: carica da Supabase gli orari di apertura e gli appuntamenti
// del range richiesto, così funziona identico su desktop e mobile e non
// dipende da quanto è caricato nella vista corrente.
//
// Punteggio (più basso = proposto prima):
//   🎯 "perfetto"  la finestra libera coincide con la durata richiesta
//                  (± metà slot): prenotando NON si frammenta l'agenda.
//   🧲 "compatta"  lo slot è attaccato a un appuntamento esistente o al
//                  bordo dell'orario di apertura: zero tempi morti.
//   —  "spezza"    lo slot cade in mezzo a una finestra lunga, lasciando
//                  ritagli prima e dopo: proposto per ultimo.
// A parità di qualità vince il giorno più vicino.
// ═══════════════════════════════════════════════════════════════════════

import { supabase } from "@/src/lib/supabaseClient";
import { italianHoliday } from "@/src/lib/holidays";

export type SlotQuality = "perfetto" | "compatta" | "spezza";

export type FoundSlot = {
  start: Date;
  /** Fine dello slot proposto (start + durata richiesta). */
  end: Date;
  /** Minuti liberi totali della finestra che contiene lo slot. */
  windowMinutes: number;
  quality: SlotQuality;
  /** Ordinamento: più basso = migliore. */
  score: number;
};

export type SlotSearchParams = {
  studioId: string;
  /** Primo giorno di ricerca (incluso). */
  from: Date;
  /** Quanti giorni scandire (es. 7, 14, 30). */
  days: number;
  /** Durata richiesta in minuti. */
  durationMin: number;
  /** Granularità dell'agenda (15 o 30): gli slot proposti sono allineati. */
  slotStep: number;
  /** Giorni ISO consentiti (1=lun…7=dom); vuoto = tutti. */
  preferredDays?: number[];
  /** Fascia oraria: inizio slot ≥ timeFrom e ≤ timeTo ("HH:MM"); null = libera. */
  timeFrom?: string | null;
  timeTo?: string | null;
  /** Massimo risultati restituiti. */
  limit?: number;
};

type WorkingHourRow = {
  day_of_week: number; // 0=dom … 6=sab (convenzione tabella working_hours)
  is_open: boolean;
  open_time: string;   // "HH:MM[:SS]"
  close_time: string;
};

const toMin = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};

const isoWeekday = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());

/**
 * Cerca gli slot liberi. Una chiamata = due query leggere (orari apertura,
 * appuntamenti del range) + scansione in memoria.
 */
export async function findFreeSlots(p: SlotSearchParams): Promise<FoundSlot[]> {
  const limit = p.limit ?? 30;

  // ── 1. Orari di apertura ──
  const { data: whData } = await supabase
    .from("working_hours")
    .select("day_of_week, is_open, open_time, close_time")
    .eq("studio_id", p.studioId);
  const workingHours = (whData as WorkingHourRow[]) || [];

  // ── 2. Appuntamenti del range (solo occupanti: non cancellati) ──
  const rangeStart = new Date(p.from);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(p.from);
  rangeEnd.setDate(rangeEnd.getDate() + p.days - 1);
  rangeEnd.setHours(23, 59, 59, 999);

  const { data: apptData } = await supabase
    .from("appointments")
    .select("start_at, end_at, status")
    .eq("studio_id", p.studioId)
    .gte("start_at", rangeStart.toISOString())
    .lte("start_at", rangeEnd.toISOString())
    .neq("status", "cancelled");

  const busy = ((apptData as { start_at: string; end_at: string }[]) || [])
    .map(a => ({ s: new Date(a.start_at), e: new Date(a.end_at) }))
    .sort((a, b) => a.s.getTime() - b.s.getTime());

  const prefFrom = toMin(p.timeFrom);
  const prefTo = toMin(p.timeTo);
  const now = new Date();
  const out: FoundSlot[] = [];

  // ── 3. Scansione giorno per giorno ──
  for (let i = 0; i < p.days; i++) {
    const day = new Date(rangeStart);
    day.setDate(day.getDate() + i);

    if (p.preferredDays?.length && !p.preferredDays.includes(isoWeekday(day))) continue;
    if (italianHoliday(day)) continue; // festivi nazionali: mai proposti

    const wh = workingHours.find(w => w.day_of_week === day.getDay());
    let openMin = 8 * 60, closeMin = 20 * 60; // fallback storico
    if (wh) {
      if (!wh.is_open) continue; // giorno chiuso
      openMin = toMin(wh.open_time) ?? openMin;
      closeMin = toMin(wh.close_time) ?? closeMin;
    }

    // Eventi del giorno → finestre libere tra apertura e chiusura
    const d0 = new Date(day); d0.setHours(0, 0, 0, 0);
    const d1 = new Date(day); d1.setHours(23, 59, 59, 999);
    const evts = busy.filter(b => b.s >= d0 && b.s <= d1);

    type Win = { fromMin: number; toMin: number; afterAppt: boolean; beforeAppt: boolean };
    const windows: Win[] = [];
    let cursor = openMin;
    let cameFromAppt = false;
    for (const ev of evts) {
      const evFrom = ev.s.getHours() * 60 + ev.s.getMinutes();
      const evTo = Math.min(closeMin, ev.e.getHours() * 60 + ev.e.getMinutes());
      if (evFrom > cursor) {
        windows.push({ fromMin: cursor, toMin: Math.min(evFrom, closeMin), afterAppt: cameFromAppt, beforeAppt: true });
      }
      cursor = Math.max(cursor, evTo);
      cameFromAppt = true;
      if (cursor >= closeMin) break;
    }
    if (cursor < closeMin) {
      windows.push({ fromMin: cursor, toMin: closeMin, afterAppt: cameFromAppt, beforeAppt: false });
    }

    // ── 4. Dentro ogni finestra: candidati allineati alla granularità ──
    for (const w of windows) {
      const winLen = w.toMin - w.fromMin;
      if (winLen < p.durationMin) continue;

      // Primo inizio allineato allo slotStep dentro la finestra
      const firstAligned = Math.ceil(w.fromMin / p.slotStep) * p.slotStep;
      const lastStart = w.toMin - p.durationMin;

      // Candidati: inizio finestra (compatta a sinistra), fine finestra
      // (compatta a destra) e — solo se la finestra è ampia — l'eventuale
      // inizio dentro la fascia preferita.
      const candidates = new Set<number>();
      if (firstAligned <= lastStart) candidates.add(firstAligned);
      const tailAligned = Math.floor(lastStart / p.slotStep) * p.slotStep;
      if (tailAligned >= w.fromMin && tailAligned >= firstAligned) candidates.add(tailAligned);
      if (prefFrom != null && prefFrom > firstAligned && prefFrom <= lastStart) {
        const aligned = Math.ceil(prefFrom / p.slotStep) * p.slotStep;
        if (aligned <= lastStart) candidates.add(aligned);
      }

      for (const startMin of candidates) {
        // Fascia preferita: sull'INIZIO dello slot
        if (prefFrom != null && startMin < prefFrom) continue;
        if (prefTo != null && startMin > prefTo) continue;

        const start = new Date(day);
        start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
        if (start <= now) continue; // niente passato

        const end = new Date(start.getTime() + p.durationMin * 60000);

        // Qualità
        const leftover = winLen - p.durationMin;
        const touchesLeft = startMin === w.fromMin || startMin - w.fromMin < p.slotStep;
        const touchesRight = w.toMin - (startMin + p.durationMin) < p.slotStep;
        let quality: SlotQuality;
        if (leftover <= p.slotStep / 2) quality = "perfetto";
        else if ((touchesLeft && w.afterAppt) || (touchesRight && w.beforeAppt) || touchesLeft || touchesRight) quality = "compatta";
        else quality = "spezza";

        const qScore = quality === "perfetto" ? 0 : quality === "compatta" ? 1 : 2;
        // giorni di distanza pesano più della qualità intra-giorno,
        // ma la qualità decide dentro lo stesso giorno
        const score = i * 10 + qScore + startMin / 10000;

        out.push({ start, end, windowMinutes: winLen, quality, score });
      }
    }
  }

  // ── 5. Dedup (stesso start) + ordinamento ──
  const seen = new Set<number>();
  return out
    .filter(s => {
      const k = s.start.getTime();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}
