// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/DayTimelineMulti.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Vista GIORNO multi-operatore (Fase 4a).
//
// Differenze rispetto a DayTimeline.tsx (single-op):
//   • Una colonna per ogni operatore attivo, con header colorato
//   • Eventi posizionati nella colonna dell'operatore corrispondente
//   • Eventi senza operator_id finiscono in una colonna "Non assegnati"
//     (mostrata solo se ci sono effettivamente eventi orfani)
//   • Bordo sx evento = colore operatore (NON più colore stato/trattamento)
//   • Pattern striped sulla colonna se l'operatore ha indisponibilità
//     (ferie, malattia, pausa pranzo) in quella fascia oraria
//
// SEMPLIFICAZIONI in questa fase rispetto al fallback originale:
//   • Niente drag-and-drop (verrà aggiunto in 4d quando avremo il
//     selettore operatore nel modal di edit, per evitare drop ambigui)
//   • Niente bulk mode multi-op
//   • Niente "show available only" (concetto da ripensare quando ci sono
//     più operatori)
//
// Tutto il resto del comportamento (click slot → crea, click evento →
// dettaglio, micro-bottoni paid/WA/exec) è preservato e identico al
// DayTimeline single-op.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useMemo } from "react";
import {
  THEME, fmtTime, formatDMY, pad2, statusBg, statusLabel, getTreatmentLabel,
  cycleDotTitle, cycleDotGlyph,
  getLocationCardStyle,
  type CalendarEvent,
} from "../../utils";
import PaidIconButton from "@/src/components/PaidIconButton";
import type { PaymentMethod } from "@/src/components/PaidPopover";
import GroupEventCard from "./GroupEventCard";
import PackageBadge from "@/src/components/packages/PackageBadge";
import type { StudioMember } from "@/src/contexts/StudioContext";

const DAY_PX_PER_MIN = 1;

// ── Tipo locale per le indisponibilità (ferie, malattia, pause) ─────────
// Caricate dal page.tsx con una query semplice; passate qui solo per
// rendering. In Fase 4a la creazione/edit di queste fasce non è prevista.
export type OperatorUnavailabilitySlot = {
  id: string;
  operator_id: string;
  start_at: Date;
  end_at: Date;
  reason: string | null;
  all_day: boolean;
};

export type DayTimelineMultiProps = {
  currentDate: Date;
  /** Eventi del giorno (filtrati e ordinati dal parent, esclusi i cancellati) */
  dayEvents: CalendarEvent[];
  /** Tempo corrente (per linea "now") */
  currentTime: Date;

  /** Operatori attivi (ordinati). Min 2 per arrivare qui (vedi DayView). */
  members: StudioMember[];

  /** Mappa room_id → color. Se passata e l'evento ha room_id valido, la card
   *  prende il colore della stanza al posto del colore operatore. Mantiene
   *  un piccolo pallino MGA per riconoscere comunque l'operatore (Fase Stanze). */
  roomColorMap?: Map<string, string>;

  /** Indisponibilità del giorno corrente per tutti gli operatori dello studio. */
  unavailabilities?: OperatorUnavailabilitySlot[];

  /** Slot orari (es. ["08:00", "09:00", ...]) */
  timeSlots: string[];
  /** Larghezza colonna ora */
  TIME_COL: number;
  /** Ora di inizio della griglia (default 7) */
  gridStartHour?: number;

  /** Multi-sede (mig. 014) — riusato per i badge sede sulle card evento */
  studioLocations?: Array<{ id: string; name: string; address: string | null; is_primary: boolean; border_color: string | null }>;

  /** Set id che matchano la search (highlight) */
  searchMatchIds: Set<string>;

  /** Click su slot vuoto. operatorId è il nuovo argomento per multi-op. */
  onSlotClick: (date: Date, hour: number, minute: number, operatorId: string | null) => void;
  slotMinutes?: number;
  /** Tasto destro / pressione lunga */
  onContextMenu: (e: React.MouseEvent, event?: CalendarEvent) => void;

  // Selezione
  onSelectEvent: (event: CalendarEvent) => void;
  // Toggle
  onToggleDone: (eventId: string, currentStatus: CalendarEvent["status"]) => void;
  onTogglePaid: (eventId: string, currentlyPaid: boolean) => void;
  /** Stesso tipo di DayTimeline.onUpdatePayment: riceve eventId + oggetto next. */
  onUpdatePayment?: (
    eventId: string,
    next: {
      is_paid: boolean;
      paid_at: string | null;
      payment_method: import("@/src/components/PaidPopover").PaymentMethod | null;
    }
  ) => void | Promise<void>;
  onSendReminder: (eventId: string, phone?: string, firstName?: string) => void;
};

// ── Costanti visuali ─────────────────────────────────────────────────────
const HEADER_HEIGHT = 56;
const SLOT_HEIGHT = 60;

// Default color per operatore senza display_color valorizzato
const FALLBACK_OP_COLOR = "#94a3b8";

// Colore per la "colonna Non assegnati"
const UNASSIGNED_COLOR = "#94a3b8";
const UNASSIGNED_BG = "#f8fafc";

// ─── Componente ──────────────────────────────────────────────────────────
export default function DayTimelineMulti({
  currentDate,
  dayEvents,
  currentTime,
  members,
  roomColorMap,
  unavailabilities = [],
  timeSlots,
  TIME_COL,
  gridStartHour = 7,
  studioLocations,
  searchMatchIds,
  onSlotClick,
  onContextMenu,
  onSelectEvent,
  onToggleDone,
  onTogglePaid,
  onUpdatePayment,
  onSendReminder,
  slotMinutes = 30,
}: DayTimelineMultiProps) {
  const slotOffsets = slotMinutes === 15 ? [0, 15, 30, 45] : [0, 30];
  // ── Calcolo colonne ────────────────────────────────────────────────────
  // 1 colonna per ogni member attivo + (se ci sono eventi orfani) 1 colonna
  // "Non assegnati" alla fine. Questo evita di mostrare una colonna vuota
  // quando tutti gli eventi hanno operator_id valorizzato.
  const hasUnassignedEvents = useMemo(
    () => dayEvents.some(ev => !ev.operator_id),
    [dayEvents]
  );

  const columns = useMemo(() => {
    const cols: Array<{
      key: string;          // user_id (registrato) o invite_token (pending) o "__unassigned__"
      label: string;        // nome operatore
      initials: string;
      color: string;
      isUnassigned: boolean;
      isPending: boolean;   // true = invito non ancora accettato
    }> = members.map(m => ({
      // user_id se registrato, altrimenti invite_token (sempre univoco). Senza
      // questo fallback, 2 inviti pendenti collidono entrambi su user_id=null
      // e React si lamenta delle key duplicate.
      key: m.user_id ?? `pending:${m.invite_token ?? "?"}`,
      label: m.display_name ?? "Senza nome",
      initials: m.signature_short || "?",
      color: m.display_color || FALLBACK_OP_COLOR,
      isUnassigned: false,
      isPending: m.user_id == null,
    }));
    if (hasUnassignedEvents) {
      cols.push({
        key: "__unassigned__",
        label: "Non assegnati",
        initials: "?",
        color: UNASSIGNED_COLOR,
        isUnassigned: true,
        isPending: false,
      });
    }
    return cols;
  }, [members, hasUnassignedEvents]);

  // Mappa user_id → indice colonna per posizionare eventi velocemente
  const colIndexById = useMemo(() => {
    const m = new Map<string, number>();
    columns.forEach((c, i) => m.set(c.key, i));
    return m;
  }, [columns]);

  // ── Indisponibilità raggruppate per operatore ──────────────────────────
  const unavByOperator = useMemo(() => {
    const m = new Map<string, OperatorUnavailabilitySlot[]>();
    for (const u of unavailabilities) {
      const arr = m.get(u.operator_id) ?? [];
      arr.push(u);
      m.set(u.operator_id, arr);
    }
    return m;
  }, [unavailabilities]);

  // ── Posizione/altezza eventi (in pixel sulla griglia) ──────────────────
  // 1 pixel per minuto. NB: il top è relativo alla riga 2 del grid
  // (la cella della colonna operatore), che parte SOTTO l'header. Quindi
  // NON aggiungiamo HEADER_HEIGHT — il browser lo calcola già dal grid.
  // SLOT_HEIGHT (60px) e DAY_PX_PER_MIN (1px/min) devono restare coerenti:
  // 60 minuti per slot × 1 px/min = 60px → SLOT_HEIGHT.
  const getEventPosition = (event: CalendarEvent): { top: number; height: number } => {
    const startMin = event.start.getHours() * 60 + event.start.getMinutes();
    const endMin = event.end.getHours() * 60 + event.end.getMinutes();
    const offsetMin = startMin - gridStartHour * 60;
    return {
      top: offsetMin * DAY_PX_PER_MIN,
      height: Math.max((endMin - startMin) * DAY_PX_PER_MIN, 28),
    };
  };

  // Verifica se oggi è "il giorno corrente" per la riga "now"
  const isToday = useMemo(() => {
    const now = currentTime;
    return (
      now.getFullYear() === currentDate.getFullYear() &&
      now.getMonth() === currentDate.getMonth() &&
      now.getDate() === currentDate.getDate()
    );
  }, [currentTime, currentDate]);

  const nowTopPx = useMemo(() => {
    if (!isToday) return null;
    const nowMin = currentTime.getHours() * 60 + currentTime.getMinutes();
    // Top relativo alla cella della colonna (gridRow 2), niente HEADER_HEIGHT
    return (nowMin - gridStartHour * 60) * DAY_PX_PER_MIN;
  }, [isToday, currentTime, gridStartHour]);

  const totalGridMin = timeSlots.length * 60;
  const gridContentHeight = totalGridMin * DAY_PX_PER_MIN;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
      {/* ── Wrapper griglia, con scroll se serve ────────────────────────── */}
      <div style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `${TIME_COL}px repeat(${columns.length}, 1fr)`,
        background: "#fff",
      }}>
        {/* ── Header riga 0: angolo vuoto + headers operatori ───────────── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          height: HEADER_HEIGHT,
          background: THEME.panelSoft,
          borderRight: `1px solid ${THEME.border}`,
          borderBottom: `2px solid ${THEME.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: THEME.muted, fontWeight: 700,
        }}>
          {formatDMY(currentDate)}
        </div>

        {columns.map((col, ci) => (
          <div key={col.key} style={{
            position: "sticky", top: 0, zIndex: 5,
            height: HEADER_HEIGHT,
            background: col.isUnassigned ? UNASSIGNED_BG : `linear-gradient(135deg, ${col.color}15, ${col.color}30)`,
            borderRight: ci < columns.length - 1 ? `1px solid ${THEME.border}` : "none",
            borderBottom: `2px solid ${col.isUnassigned ? THEME.border : col.color}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, padding: "0 12px",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: col.color,
              color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
              flexShrink: 0,
              boxShadow: "0 1px 3px rgba(15,23,42,0.15)",
            }}>
              {col.initials}
            </div>
            <div style={{ minWidth: 0, overflow: "hidden", flex: 1 }}>
              <div style={{
                fontSize: 13, fontWeight: 800, color: THEME.text,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {col.label}
              </div>
              {col.isPending ? (
                <div style={{
                  fontSize: 9, fontWeight: 800, color: "#92400e",
                  background: "#fef3c7", padding: "1px 5px",
                  borderRadius: 3, display: "inline-block",
                  letterSpacing: 0.4, marginTop: 2,
                }}>
                  INVITO PENDENTE
                </div>
              ) : !col.isUnassigned ? (
                <div style={{
                  fontSize: 10, fontWeight: 700, color: col.color,
                  whiteSpace: "nowrap",
                }}>
                  {dayEvents.filter(ev => ev.operator_id === col.key).length} sedute
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {/* ── Colonna ore (sticky a sinistra) ──────────────────────────── */}
        <div style={{
          gridColumn: 1,
          gridRow: 2,
          position: "relative",
          background: THEME.panelSoft,
          borderRight: `1px solid ${THEME.border}`,
        }}>
          {timeSlots.map((time, ti) => (
            <div key={ti} style={{
              height: SLOT_HEIGHT,
              borderBottom: `1.5px solid ${THEME.border}`,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-end",
              padding: "4px 8px 0 0",
              fontSize: 11, fontWeight: 700,
              color: THEME.muted,
              boxSizing: "border-box",
            }}>
              {time}
            </div>
          ))}
        </div>

        {/* ── Per ogni colonna operatore, render della colonna ───────────── */}
        {columns.map((col, ci) => {
          const colEvents = dayEvents.filter(ev =>
            col.isUnassigned ? !ev.operator_id : ev.operator_id === col.key
          );
          const colUnav = col.isUnassigned ? [] : (unavByOperator.get(col.key) ?? []);

          return (
            <div
              key={col.key}
              style={{
                gridColumn: ci + 2,
                gridRow: 2,
                position: "relative",
                borderRight: ci < columns.length - 1 ? `1px solid ${THEME.border}` : "none",
                background: "#fff",
              }}
            >
              {/* Slot orari cliccabili */}
              {timeSlots.map((time, ti) => {
                const hour = parseInt(time.split(":")[0]);
                return (
                  <div key={ti} style={{
                    height: SLOT_HEIGHT,
                    borderBottom: `1.5px solid ${THEME.border}`,
                    display: "flex", flexDirection: "column",
                    boxSizing: "border-box",
                  }}>
                    {slotOffsets.map((off, oi) => (
                      <div
                        key={off}
                        onClick={() => onSlotClick(currentDate, hour, off, col.isUnassigned ? null : col.key)}
                        onContextMenu={onContextMenu}
                        title={`${pad2(hour)}:${pad2(off)} — ${col.label}`}
                        style={{
                          flex: 1, cursor: "pointer",
                          // linea tratteggiata solo a metà ora, come prima
                          borderBottom: off + 60 / slotOffsets.length === 30
                            ? `1px dashed ${THEME.border}` : "none",
                        }}
                      />
                    ))}
                  </div>
                );
              })}

              {/* ── Indisponibilità (ferie/pause) sotto agli eventi ──── */}
              {colUnav.map(u => {
                const startMin = u.start_at.getHours() * 60 + u.start_at.getMinutes();
                const endMin = u.end_at.getHours() * 60 + u.end_at.getMinutes();
                const top = (startMin - gridStartHour * 60) * DAY_PX_PER_MIN;
                const height = Math.max((endMin - startMin) * DAY_PX_PER_MIN, 24);
                if (top + height < 0 || top > gridContentHeight) return null;

                return (
                  <div
                    key={u.id}
                    title={u.reason || "Indisponibile"}
                    style={{
                      position: "absolute",
                      left: 0, right: 0,
                      top: `${top}px`,
                      height: `${height}px`,
                      background: u.all_day
                        ? "repeating-linear-gradient(45deg, #fef3c7, #fef3c7 5px, #fde68a 5px, #fde68a 10px)"
                        : "repeating-linear-gradient(45deg, #f1f5f9, #f1f5f9 4px, #e2e8f0 4px, #e2e8f0 8px)",
                      border: u.all_day ? "1px dashed #d97706" : "1px dashed #94a3b8",
                      pointerEvents: "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      zIndex: 1,
                    }}
                  >
                    <div style={{
                      fontSize: 11, fontWeight: 800,
                      color: u.all_day ? "#92400e" : "#475569",
                      textAlign: "center", padding: 4,
                    }}>
                      {u.all_day ? (u.reason || "FERIE").toUpperCase() : (u.reason || "Pausa")}
                    </div>
                  </div>
                );
              })}

              {/* ── Eventi della colonna ──────────────────────────────── */}
              {/* Calcolo layout overlap: se 2+ eventi si sovrappongono nello
                  stesso operatore, li affianchiamo equamente (50/50, 33/33/33).
                  L'algoritmo: ordina per start_at, raggruppa cluster di eventi
                  che si sovrappongono in catena, assegna a ognuno (col, totalCols).
                  Cluster = insieme di eventi connessi da overlap (transitivo). */}
              {(() => {
                // Ordina per start_at (asc), tie-break per durata (più lungo prima)
                const sorted = [...colEvents].sort((a, b) => {
                  const t = a.start.getTime() - b.start.getTime();
                  if (t !== 0) return t;
                  return b.end.getTime() - a.end.getTime();
                });
                // layout[id] = { col, totalCols }
                const layout = new Map<string, { col: number; totalCols: number }>();
                let i = 0;
                while (i < sorted.length) {
                  // Trova cluster: parto da i, espando finché trovo overlap
                  let clusterEnd = sorted[i].end.getTime();
                  let j = i + 1;
                  while (j < sorted.length && sorted[j].start.getTime() < clusterEnd) {
                    clusterEnd = Math.max(clusterEnd, sorted[j].end.getTime());
                    j++;
                  }
                  // Nel cluster sorted[i..j), assegna colonne con greedy
                  // (ognuno prende la prima colonna libera in quel momento)
                  const cluster = sorted.slice(i, j);
                  const colEnds: number[] = []; // colEnds[c] = end time della colonna c
                  for (const ev of cluster) {
                    let placed = -1;
                    for (let c = 0; c < colEnds.length; c++) {
                      if (colEnds[c] <= ev.start.getTime()) {
                        placed = c;
                        colEnds[c] = ev.end.getTime();
                        break;
                      }
                    }
                    if (placed === -1) {
                      placed = colEnds.length;
                      colEnds.push(ev.end.getTime());
                    }
                    layout.set(ev.id, { col: placed, totalCols: 0 }); // totalCols sotto
                  }
                  // Calcola totalCols del cluster (numero massimo di colonne usate)
                  const totalCols = colEnds.length;
                  for (const ev of cluster) {
                    const l = layout.get(ev.id);
                    if (l) l.totalCols = totalCols;
                  }
                  i = j;
                }

                return colEvents.map(event => {
                const { top, height } = getEventPosition(event);
                if (top + height < 0 || top > gridContentHeight) return null;

                const isHighlighted = searchMatchIds.has(event.id);
                const isCompleted = event.status === "done";
                const isPaid = event.is_paid;
                const isDomicile = event.location === "domicile";
                const waSent = !!event.whatsapp_sent_at;

                // Bordo sx = colore operatore (caratteristica multi-op)
                const opColor = col.isUnassigned ? UNASSIGNED_COLOR : col.color;
                // Fase Stanze: se l'evento ha room_id e abbiamo la mappa,
                // usiamo il colore stanza per il BACKGROUND della card.
                // L'operatore resta visibile dal bordo sx 4px.
                const roomColor = (event.room_id && roomColorMap?.get(event.room_id)) || null;
                // Sede border (riusiamo logica esistente per i bordi sede)
                const locStyle = getLocationCardStyle(event, studioLocations);

                // Layout overlap: se l'evento è in cluster con altri,
                // lo dividiamo in colonne affiancate dentro la colonna operatore.
                const lay = layout.get(event.id);
                const colCount = lay?.totalCols ?? 1;
                const colIdx = lay?.col ?? 0;
                // Calcoliamo larghezza percentuale e left percentuale
                const widthPct = 100 / colCount;
                const leftPct = colIdx * widthPct;

                return (
                  <div
                    key={event.id}
                    onClick={() => onSelectEvent(event)}
                    onContextMenu={e => onContextMenu(e, event)}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 3px 12px rgba(15,23,42,0.18)"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,0.08)"; }}
                    style={{
                      position: "absolute",
                      // Spazio: 4px ai bordi della colonna operatore, dentro
                      // gli eventi sovrapposti si affiancano (gap 1px tra loro).
                      left: `calc(4px + ${leftPct}% * (100% - 8px) / 100%)`,
                      width: `calc(${widthPct}% * (100% - 8px) / 100% - ${colCount > 1 ? 1 : 0}px)`,
                      top: `${top + 1}px`,
                      height: `${height - 2}px`,
                      // Container query: permette al font dentro di scalare con
                      // la larghezza effettiva di QUESTA card (non della colonna).
                      containerType: "inline-size",
                      // Background: se l'evento ha una stanza, prevale il colore
                      // stanza con bilanciamento per leggibilità del testo.
                      // Altrimenti usa statusBg (logica storica per stato).
                      background: event.is_group
                        ? "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)"
                        : (roomColor && event.status !== "cancelled"
                            ? roomColor
                            : statusBg(event.status)),
                      color: "#fff",
                      borderRadius: 6,
                      borderLeft: `4px solid ${opColor}`,
                      borderTop: locStyle.borderColor ? `2px solid ${locStyle.borderColor}` : "none",
                      borderRight: locStyle.borderColor ? `2px solid ${locStyle.borderColor}` : "none",
                      borderBottom: locStyle.borderColor ? `2px solid ${locStyle.borderColor}` : "none",
                      boxSizing: "border-box",
                      padding: "4px 6px",
                      cursor: "pointer",
                      overflow: "hidden",
                      display: "flex", flexDirection: "column", gap: 2,
                      boxShadow: isHighlighted
                        ? "0 0 0 3px rgba(245,158,11,0.4), 0 1px 3px rgba(15,23,42,0.08)"
                        : "0 1px 3px rgba(15,23,42,0.08)",
                      transition: "box-shadow 0.15s",
                      zIndex: 2,
                    }}
                  >
                    {event.is_group ? (
                      <GroupEventCard event={event} cardH={Math.max(height - 2, 28)} />
                    ) : (
                      // ─── CARD MULTI-OP ─────────────────────────────────
                      // Layout compatto, scalabile, 2 bottoni (✓ stato + 💬 WA).
                      // Font usa cqi (container query inline-size) → scala con
                      // la larghezza effettiva della card. Su card alte ≥45px
                      // mostriamo orario sopra in piccolo, su card più basse
                      // tutto in 1 riga inline.
                      // Range font: 9.5px..12px in base alla larghezza card.
                      <>
                        {height >= 45 ? (
                          <>
                            {/* Riga 1: orario range + meta sede/pacchetto/dom */}
                            <div style={{
                              display: "flex", alignItems: "center", gap: 4,
                              flexWrap: "nowrap", overflow: "hidden",
                              fontSize: "clamp(9px, 3.2cqi, 11px)",
                              fontWeight: 800, opacity: 0.92, lineHeight: 1.1,
                              flexShrink: 0,
                            }}>
                              <span style={{ flexShrink: 0 }}>
                                {fmtTime(event.start.toISOString())}–{fmtTime(event.end.toISOString())}
                              </span>
                              {isDomicile && <span style={{ flexShrink: 0 }}>🏠</span>}
                              {locStyle.initials && (
                                <span style={{
                                  fontSize: "clamp(8px, 2.6cqi, 9px)",
                                  fontWeight: 800,
                                  background: locStyle.borderColor ?? undefined,
                                  padding: "1px 4px", borderRadius: 3,
                                  letterSpacing: 0.3, lineHeight: 1.1,
                                  flexShrink: 0,
                                }}>{locStyle.initials}</span>
                              )}
                              {event.package_id && (
                                <PackageBadge packageId={event.package_id} variant="compact-dark" />
                              )}
                            </div>

                            {/* Riga 2: nome + bottoni */}
                            <div style={{
                              display: "flex", alignItems: "center", gap: 4,
                              flex: 1, minHeight: 0,
                            }}>
                              <div style={{
                                flex: 1, minWidth: 0,
                                fontSize: "clamp(10px, 3.6cqi, 13px)",
                                fontWeight: 800, lineHeight: 1.15,
                                overflow: "hidden", textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}>
                                {event.patient_name}
                              </div>
                              <div style={{
                                display: "flex", gap: 3, flexShrink: 0,
                                alignSelf: "center",
                              }}>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    onSendReminder(event.id, event.patient_phone ?? undefined, event.patient_first_name ?? undefined);
                                  }}
                                  title={waSent ? "WhatsApp già inviato" : "Invia WhatsApp"}
                                  style={{
                                    width: 16, height: 16, borderRadius: 4,
                                    border: "none",
                                    background: waSent ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.85)",
                                    color: waSent ? "rgba(255,255,255,0.9)" : "#16a34a",
                                    cursor: "pointer", fontSize: 9, fontWeight: 800,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    padding: 0, flexShrink: 0,
                                  }}
                                >
                                  {waSent ? "✓" : "💬"}
                                </button>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    onToggleDone(event.id, event.status);
                                  }}
                                  title={cycleDotTitle(event.status)}
                                  style={{
                                    width: 16, height: 16, borderRadius: 4,
                                    border: "none",
                                    background: isCompleted ? "#16a34a" : event.status === "not_paid" ? "#f97316" : "rgba(255,255,255,0.85)",
                                    color: isCompleted || event.status === "not_paid" ? "#fff" : "#0f172a",
                                    cursor: "pointer", fontSize: 9, fontWeight: 800,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    padding: 0, flexShrink: 0,
                                  }}
                                >
                                  {isCompleted ? "✓" : event.status === "not_paid" ? "!" : "○"}
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          /* Card bassa (<45px): tutto in 1 riga compatta */
                          <div style={{
                            display: "flex", alignItems: "center", gap: 4,
                            height: "100%", overflow: "hidden",
                          }}>
                            <span style={{
                              fontSize: "clamp(9px, 3cqi, 10px)",
                              fontWeight: 800, opacity: 0.92, flexShrink: 0,
                            }}>
                              {fmtTime(event.start.toISOString())}
                            </span>
                            <span style={{
                              flex: 1, minWidth: 0,
                              fontSize: "clamp(10px, 3.4cqi, 12px)",
                              fontWeight: 800, lineHeight: 1.15,
                              overflow: "hidden", textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}>
                              {event.patient_name}
                            </span>
                            {isDomicile && <span style={{ fontSize: 9, flexShrink: 0 }}>🏠</span>}
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onSendReminder(event.id, event.patient_phone ?? undefined, event.patient_first_name ?? undefined);
                              }}
                              title={waSent ? "WhatsApp già inviato" : "Invia WhatsApp"}
                              style={{
                                width: 14, height: 14, borderRadius: 3,
                                border: "none",
                                background: waSent ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.85)",
                                color: waSent ? "rgba(255,255,255,0.9)" : "#16a34a",
                                cursor: "pointer", fontSize: 8, fontWeight: 800,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                padding: 0, flexShrink: 0,
                              }}
                            >
                              {waSent ? "✓" : "💬"}
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onToggleDone(event.id, event.status);
                              }}
                              title={cycleDotTitle(event.status)}
                              style={{
                                width: 14, height: 14, borderRadius: 3,
                                border: "none",
                                background: isCompleted ? "#16a34a" : event.status === "not_paid" ? "#f97316" : "rgba(255,255,255,0.85)",
                                color: isCompleted || event.status === "not_paid" ? "#fff" : "#0f172a",
                                cursor: "pointer", fontSize: 8, fontWeight: 800,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                padding: 0, flexShrink: 0,
                              }}
                            >
                              {isCompleted ? "✓" : event.status === "not_paid" ? "!" : "○"}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              });
              })()}

              {/* ── Linea "ora corrente" sopra a tutto, una per colonna ── */}
              {nowTopPx !== null && (
                <div style={{
                  position: "absolute",
                  left: 0, right: 0,
                  top: `${nowTopPx}px`,  // già relativo a gridRow 2
                  height: 2,
                  background: "#dc2626",
                  zIndex: 4,
                  pointerEvents: "none",
                }}>
                  {ci === 0 && (
                    <div style={{
                      position: "absolute",
                      left: -6, top: -4,
                      width: 10, height: 10, borderRadius: "50%",
                      background: "#dc2626",
                      boxShadow: "0 0 0 3px rgba(220,38,38,0.25)",
                    }} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
