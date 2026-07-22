// ═══════════════════════════════════════════════════════════════════════
// src/hooks/calendar/moveValidation.ts
// ═══════════════════════════════════════════════════════════════════════
// Tappa B: validazione condivisa per spostamenti (drag&drop) e resize.
//
// Funzione PURA: dato l'evento in movimento, l'operatore/stanza di
// DESTINAZIONE (che nel drop cross-corsia possono differire da quelli
// attuali) e il nuovo intervallo, restituisce l'elenco dei problemi:
//   • stesso operatore già occupato        (multi-op)
//   • stessa stanza già occupata           (multi-stanza)
//   • sovrapposizione generica             (single-op)
//   • operatore assente (ferie/malattia)   (multi-op)
// Usata da useDragAndDrop (handleDrop + handleDropAssign) e useEventResize.
// ═══════════════════════════════════════════════════════════════════════

export type MoveValidationEvent = {
  id: string;
  start: Date;
  end: Date;
  status: string;
  operator_id?: string | null;
  room_id?: string | null;
  patient_name: string;
};

export type MoveValidationUnavailability = {
  operator_id: string;
  start_at: Date;
  end_at: Date;
  reason: string | null;
};

/**
 * Turno settimanale di un operatore (tabella operator_schedules, mig. 022).
 * member_id → studio_members.id, quindi va risolto in user_id prima dell'uso.
 */
export type OperatorScheduleSlot = {
  /** user_id dell'operatore (già risolto da member_id) */
  operator_id: string;
  /** 0 = domenica (convenzione JS Date.getDay()) */
  day_of_week: number;
  /** "HH:MM[:SS]" */
  start_time: string;
  end_time: string;
};

const DOW_IT = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

/**
 * Verifica se l'intervallo cade FUORI dal turno settimanale dell'operatore.
 * Un operatore senza turni configurati non è vincolato (nessun avviso):
 * i turni restano opzionali, chi lavora full time non deve configurare nulla.
 * Restituisce null se tutto ok, altrimenti il motivo da mostrare.
 */
export function checkOperatorSchedule(
  schedules: OperatorScheduleSlot[] | undefined,
  operatorId: string | null | undefined,
  start: Date,
  end: Date
): string | null {
  if (!operatorId || !schedules || schedules.length === 0) return null;
  const mine = schedules.filter(s => s.operator_id === operatorId);
  if (mine.length === 0) return null; // nessun turno configurato → libero

  const dow = start.getDay();
  const ofDay = mine.filter(s => s.day_of_week === dow);
  if (ofDay.length === 0) return `l'operatore non lavora di ${DOW_IT[dow]}`;

  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const s0 = start.getHours() * 60 + start.getMinutes();
  const e0 = end.getHours() * 60 + end.getMinutes();
  // Basta che UNA fascia contenga l'intero appuntamento.
  const fits = ofDay.some(sl => s0 >= toMin(sl.start_time) && e0 <= toMin(sl.end_time));
  if (fits) return null;

  const fasce = ofDay
    .map(sl => `${sl.start_time.slice(0, 5)}–${sl.end_time.slice(0, 5)}`)
    .join(", ");
  return `fuori dal turno dell'operatore (${DOW_IT[dow]}: ${fasce})`;
}

export function validateEventMove(args: {
  /** id dell'evento che si sta spostando/ridimensionando (escluso dal check) */
  movingId: string;
  /** Operatore di DESTINAZIONE (null = non assegnato) */
  targetOperatorId: string | null;
  /** Stanza di DESTINAZIONE (null = nessuna stanza) */
  targetRoomId: string | null;
  /** Nuovo intervallo in ms epoch */
  ns: number;
  ne: number;
  events: MoveValidationEvent[];
  multiOperatorEnabled: boolean;
  multiRoomEnabled: boolean;
  unavailabilities?: MoveValidationUnavailability[];
  /** Turni settimanali (opzionali): se configurati, spostare fuori turno avvisa. */
  schedules?: OperatorScheduleSlot[];
}): string[] {
  const {
    movingId, targetOperatorId, targetRoomId, ns, ne,
    events, multiOperatorEnabled, multiRoomEnabled, unavailabilities, schedules,
  } = args;

  const problems: string[] = [];

  for (const ev of events) {
    if (ev.id === movingId) continue;
    if (ev.status === "cancelled") continue;
    const evS = ev.start.getTime();
    const evE = ev.end.getTime();
    const overlaps = !(evE <= ns || evS >= ne);
    if (!overlaps) continue;

    const hhmm = `${ev.start.getHours().toString().padStart(2, "0")}:${ev.start.getMinutes().toString().padStart(2, "0")}`;
    if (multiOperatorEnabled) {
      if (targetOperatorId && ev.operator_id === targetOperatorId) {
        problems.push(`stesso operatore già occupato con ${ev.patient_name} alle ${hhmm}`);
      }
      if (multiRoomEnabled && targetRoomId && ev.room_id === targetRoomId) {
        problems.push(`stanza già occupata da ${ev.patient_name} alle ${hhmm}`);
      }
    } else {
      // Single-op: qualsiasi sovrapposizione è rilevante.
      problems.push(`sovrapposizione con ${ev.patient_name} alle ${hhmm}`);
    }
    if (problems.length > 0) break; // basta il primo conflitto
  }

  // Assenza operatore nel nuovo intervallo
  if (
    problems.length === 0 &&
    multiOperatorEnabled &&
    targetOperatorId &&
    unavailabilities &&
    unavailabilities.length > 0
  ) {
    const abs = unavailabilities.find(u =>
      u.operator_id === targetOperatorId &&
      !(u.end_at.getTime() <= ns || u.start_at.getTime() >= ne)
    );
    if (abs) {
      problems.push(
        `l'operatore risulta assente in quell'orario${abs.reason ? ` (${abs.reason})` : ""}`
      );
    }
  }

  // Turno settimanale (mig. 022): ultimo controllo, meno grave dei conflitti.
  if (problems.length === 0 && multiOperatorEnabled) {
    const sched = checkOperatorSchedule(schedules, targetOperatorId, new Date(ns), new Date(ne));
    if (sched) problems.push(sched);
  }

  return problems;
}
