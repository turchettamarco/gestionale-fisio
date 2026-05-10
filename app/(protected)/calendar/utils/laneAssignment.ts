// ═══════════════════════════════════════════════════════════════════════
// laneAssignment.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Algoritmo per affiancare visivamente gli appuntamenti che si sovrappongono
// nel tempo (stile Google Calendar / Outlook).
//
// IDEA:
//   Per ogni "cluster" di eventi che si sovrappongono tra loro, assegno a
//   ciascun evento una "lane" (= colonna verticale all'interno della
//   colonna giorno) e un "totalLanes" (= quante lane servono in quel cluster).
//   Il rendering poi calcola width/left in base a lane/totalLanes.
//
// LIMITE MAX_VISIBLE_LANES (default 3):
//   Oltre 3 sovrapposti, le card diventano illeggibili. Quindi mostro solo
//   le prime 3 e l'ultima diventa un "badge cluster" che riassume il resto.
//   Es. 5 appt sovrapposti → vedo le prime 2 + 1 badge "+3 altri".
//
// USO:
//   const positions = assignLanes(events, 3);
//   // positions: Map<eventId, { lane: number, totalLanes: number, hidden?: number }>
//   // hidden = numero di eventi nascosti che sono "raggruppati" in questo
//   //          slot. Solo l'ultima lane visibile può avere hidden > 0.
//
// ═══════════════════════════════════════════════════════════════════════

export type LanePosition = {
  /** Indice della lane (0-based, da sinistra). */
  lane: number;
  /** Numero totale di lane visibili nel cluster. */
  totalLanes: number;
  /** Se > 0, questa card "contiene" anche N altri eventi nascosti
   *  che non hanno spazio per essere mostrati. Solo l'ultima lane visibile
   *  può avere hidden > 0. */
  hidden?: number;
  /** ID degli eventi nascosti aggregati in questa lane (per il popup "+N altri"). */
  hiddenIds?: string[];
};

type EventLike = {
  id: string;
  start: Date;
  end: Date;
  status?: string;
  /** Multi-operatore (mig. 019). NULL = non assegnato. */
  operator_id?: string | null;
};

// ═══════════════════════════════════════════════════════════════════════
// MODALITÀ OPERATORE (Fase 4b — vista settimana sub-colonne MGA)
// ═══════════════════════════════════════════════════════════════════════
//
// Quando vogliamo che ogni operatore abbia la sua sub-colonna fissa nella
// vista settimana, NON calcoliamo le lane per overlap temporale ma per
// operator_id. La lane è l'indice dell'operatore nella lista passata.
//
// USO:
//   const positions = assignLanesByOperator(events, ['user_id_1', 'user_id_2'], true);
//   // Lane 0 = primo operatore, Lane 1 = secondo, Lane 2 = "non assegnati"
//   // (se hasUnassigned = true)
//
// VANTAGGIO: il rendering esistente nel WeekView funziona invariato perché
// usa già lane/totalLanes per posizionare le card. Non dobbiamo riscrivere
// il render.
//
// SCELTA DESIGN: niente "compressione max 3 lane" qui. Se ci sono 5
// operatori, vediamo 5 sub-colonne strette (~10px ciascuna). Le card sono
// distinguibili per colore, non per testo, quindi il restringimento è
// accettabile fino a 6-8 operatori.
// ═══════════════════════════════════════════════════════════════════════
export function assignLanesByOperator(
  events: EventLike[],
  operatorOrder: string[],
  hasUnassignedColumn: boolean = false,
): Map<string, LanePosition> {
  const result = new Map<string, LanePosition>();
  if (events.length === 0) return result;

  // Mappa operator_id → indice della lane
  const opIndex = new Map<string, number>();
  operatorOrder.forEach((opId, i) => opIndex.set(opId, i));

  // Lane "non assegnati": viene dopo gli operatori (se richiesta)
  const unassignedLane = hasUnassignedColumn ? operatorOrder.length : -1;
  const totalLanes = operatorOrder.length + (hasUnassignedColumn ? 1 : 0);

  // Filtro eventi cancellati
  const valid = events.filter(e => e.status !== "cancelled");

  for (const ev of valid) {
    let lane: number;
    if (ev.operator_id && opIndex.has(ev.operator_id)) {
      lane = opIndex.get(ev.operator_id)!;
    } else if (hasUnassignedColumn) {
      lane = unassignedLane;
    } else {
      // Operator_id non riconosciuto E nessuna colonna unassigned: skip
      continue;
    }
    result.set(ev.id, { lane, totalLanes });
  }

  return result;
}

/**
 * Assegna lane (colonne verticali) a eventi che si sovrappongono nel tempo.
 *
 * Algoritmo:
 *   1. Ordino eventi per start_at crescente
 *   2. Mantengo un array di "lane attive" (con il loro endTime corrente)
 *   3. Per ogni evento, riuso una lane libera (endTime ≤ start del nuovo)
 *      o creo una nuova lane se serve
 *   4. Calcolo i "cluster" (gruppi di eventi tutti sovrapposti tra loro
 *      transitivamente) e per ogni cluster assegno totalLanes = max lane usata + 1
 *   5. Se in un cluster totalLanes > maxVisibleLanes, gli eventi oltre il limite
 *      vengono "compressi" nell'ultima lane visibile come hidden.
 */
export function assignLanes(
  events: EventLike[],
  maxVisibleLanes: number = 3,
): Map<string, LanePosition> {
  const result = new Map<string, LanePosition>();
  if (events.length === 0) return result;

  // Filtro eventi cancellati (non li renderizziamo affiancati)
  const valid = events
    .filter(e => e.status !== "cancelled")
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // ─── STEP 1: assegno lane provvisoria a ogni evento ───
  // laneEnd[i] = endTime corrente della lane i (quando si libera)
  type Tmp = { event: EventLike; lane: number; clusterId: number };
  const tmp: Tmp[] = [];
  const laneEnd: number[] = [];
  let clusterId = 0;
  let clusterEndTime = 0;
  let clusterStart = -1;

  for (const ev of valid) {
    const startMs = ev.start.getTime();
    const endMs = ev.end.getTime();

    // Se questo evento inizia dopo che il cluster precedente è finito,
    // resetto: nuovo cluster, lane libere.
    if (startMs >= clusterEndTime && tmp.length > 0) {
      clusterId++;
      laneEnd.length = 0;
      clusterStart = tmp.length;
    }
    if (clusterStart < 0) clusterStart = 0;

    // Trovo la prima lane libera (endTime <= startMs)
    let lane = laneEnd.findIndex(end => end <= startMs);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(endMs);
    } else {
      laneEnd[lane] = endMs;
    }
    tmp.push({ event: ev, lane, clusterId });
    if (endMs > clusterEndTime) clusterEndTime = endMs;
  }

  // ─── STEP 2: per ogni cluster calcolo totalLanes ───
  // (= max lane usata + 1 in quel cluster)
  const clusterMaxLane = new Map<number, number>();
  for (const t of tmp) {
    const cur = clusterMaxLane.get(t.clusterId) ?? -1;
    if (t.lane > cur) clusterMaxLane.set(t.clusterId, t.lane);
  }

  // ─── STEP 3: applico maxVisibleLanes ───
  // Se totalLanes > maxVisibleLanes:
  //   - Le prime (maxVisibleLanes - 1) lane si vedono normali
  //   - L'ultima lane visibile (= maxVisibleLanes - 1) "ingloba" tutti gli
  //     eventi delle lane successive come hidden
  for (const t of tmp) {
    const maxLane = clusterMaxLane.get(t.clusterId) ?? 0;
    const totalLanes = maxLane + 1;

    if (totalLanes <= maxVisibleLanes) {
      // Tutti visibili
      result.set(t.event.id, { lane: t.lane, totalLanes });
    } else {
      // Compressione: solo le prime (maxVisibleLanes - 1) sono normali,
      // l'ultima visibile (lane = maxVisibleLanes - 1) raccoglie gli altri.
      const visibleLanes = maxVisibleLanes;
      if (t.lane < visibleLanes - 1) {
        // Prime lane visibili normali
        result.set(t.event.id, { lane: t.lane, totalLanes: visibleLanes });
      } else if (t.lane === visibleLanes - 1) {
        // Ultima lane visibile: conterrà anche gli "hidden" che vengono dopo.
        // Trovo tutti gli eventi del cluster con lane >= visibleLanes - 1.
        const overflowEvents = tmp.filter(
          x => x.clusterId === t.clusterId && x.lane >= visibleLanes - 1
        );
        // Il "rappresentante" della lane è il primo (lane = visibleLanes - 1).
        // Gli altri sono nascosti.
        const hiddenIds = overflowEvents
          .filter(x => x.event.id !== t.event.id)
          .map(x => x.event.id);
        result.set(t.event.id, {
          lane: t.lane,
          totalLanes: visibleLanes,
          hidden: hiddenIds.length,
          hiddenIds,
        });
      } else {
        // Eventi nelle lane oltre il limite: non li renderizziamo (sono nell'hidden).
        // Non aggiungo nulla a result → il chiamante deve filtrare events
        // tenendo solo quelli che hanno una entry in result.
      }
    }
  }

  return result;
}
