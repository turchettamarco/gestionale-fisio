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
}): string[] {
  const {
    movingId, targetOperatorId, targetRoomId, ns, ne,
    events, multiOperatorEnabled, multiRoomEnabled, unavailabilities,
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

  return problems;
}
