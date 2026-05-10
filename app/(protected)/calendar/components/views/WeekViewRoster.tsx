// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/WeekViewRoster.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// VISTA SETTIMANA — LAYOUT "ROSTER" (Approccio E, mig. 024)
//
// Griglia ora × giorno (lun–sab × 6 giorni). Dentro OGNI cella ora c'è una
// lista verticale di TUTTI gli operatori attivi, una riga ciascuno, ordinati
// per `sort_order`. Ogni giorno occupa due sub-colonne:
//   1. nome operatore (es. "Marco T.")
//   2. paziente assegnato in quell'ora (cognome+nome) OPPURE pulsante
//      "ASSEGNA" rosso se libero.
//
// CLICK:
//   - Cella "ASSEGNA" → apre create modal con operatore + ora preselezionati
//   - Card paziente → apre modal modifica appuntamento
//
// COMPORTAMENTO DURATA:
//   - Slot orari da 60 minuti
//   - 30/45/60 min: l'appuntamento occupa 1 slot (lo slot di inizio)
//   - 90 min: l'appuntamento occupa 2 slot consecutivi (l'ora di inizio +
//     l'ora successiva). La cella si "estende" implicitamente perché il
//     paziente compare anche nello slot successivo.
//
// SFONDO CARD PAZIENTE:
//   - Default: colore operatore (display_color), opacity ~25%
//   - Quando le stanze saranno configurate → colore stanza (room.color)
//
// HEADER STICKY:
//   - Header giorni (top) sticky
//   - Colonna ora (sx) sticky
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useMemo } from "react";
import { THEME, type CalendarEvent } from "../../utils";
import type { StudioMember } from "@/src/contexts/StudioContext";

const DAY_LABELS = ["LUN", "MAR", "MER", "GIO", "VEN", "SAB"];

export type WeekViewRosterProps = {
  weekDays: Date[]; // 6 giorni lun-sab
  filteredEvents: CalendarEvent[];
  currentTime: Date;

  /** Membri ATTIVI ordinati per sort_order */
  members: StudioMember[];

  /** Mappa operator_id → colore (chiave include "pending:..." per inviti) */
  operatorColorMap: Map<string, string>;

  /** Range orari della griglia (es. 8..20). Inclusivi. */
  gridStartHour: number;
  gridEndHour: number;

  /** Slot click su "ASSEGNA": crea appuntamento per (date, ora, operatore) */
  onCreateForOperatorAndSlot: (date: Date, hour: number, operatorId: string | null) => void;

  /** Click card paziente: apre modal dettaglio */
  onSelectEvent: (event: CalendarEvent) => void;

  /** Cicla lo stato (booked → confirmed → done+paid → done+unpaid → confirmed) */
  onCycleStatus: (event: CalendarEvent) => void;

  /** Invia promemoria WhatsApp; opzionale */
  onSendReminder?: (eventId: string, phone?: string, firstName?: string) => void;

  /** Mappa room_id → color. Se l'evento ha room_id e la stanza ha colore,
   *  usato come sfondo della card paziente (invece del colore operatore).
   *  Vuoto/undefined → fallback su colore operatore. */
  roomColorMap?: Map<string, string>;
};

// Helper: chiave membro stabile (pendenti hanno user_id null)
function memberKey(m: StudioMember): string | null {
  if (m.user_id) return m.user_id;
  if (m.invite_token) return `pending:${m.invite_token}`;
  return null;
}

// Helper: nome breve da mostrare nella sub-colonna operatore
function shortOpName(m: StudioMember): string {
  if (m.display_name && m.display_name.trim()) return m.display_name.trim();
  return "—";
}

// Helper: Cognome Nome completo del paziente per la card
function fullPatientName(ev: CalendarEvent): string {
  const last = (ev.patient_last_name || "").trim();
  const first = (ev.patient_first_name || "").trim();
  if (last && first) return `${last} ${first}`;
  if (last) return last;
  if (first) return first;
  return ev.patient_name || "—";
}

// Helper: stesso giorno?
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Stato mini per Roster: icona unica (no label), tooltip esplicativo.
// Riusa il ciclo definito in onCycleStatus (booked → confirmed → done+paid →
// done+unpaid → confirmed).
function miniStatusStyle(ev: CalendarEvent): {
  icon: string;
  bg: string;
  color: string;
  title: string;
} {
  const isPaid = ev.is_paid === true;
  switch (ev.status) {
    case "booked":
      return { icon: "?", bg: "#dbeafe", color: "#1e40af", title: "Da confermare — click per confermare" };
    case "confirmed":
      return { icon: "○", bg: "#fef3c7", color: "#92400e", title: "Confermato — click per segnare eseguito+pagato" };
    case "done":
      if (isPaid) return { icon: "✓", bg: "#bbf7d0", color: "#166534", title: "Eseguito e pagato — click per togliere pagamento" };
      return { icon: "!", bg: "#fee2e2", color: "#991b1b", title: "Non pagato — click per riportare a confermato" };
    case "not_paid":
      return { icon: "!", bg: "#fee2e2", color: "#991b1b", title: "Non pagato — click per riportare a confermato" };
    case "cancelled":
      return { icon: "↺", bg: "#f1f5f9", color: "#475569", title: "Annullato — click per riaprire" };
    default:
      return { icon: "—", bg: "#f1f5f9", color: "#475569", title: "" };
  }
}

export default function WeekViewRoster(p: WeekViewRosterProps) {
  // Genera array delle ore visibili (es. [8, 9, 10, ..., 20])
  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = p.gridStartHour; h <= p.gridEndHour; h++) arr.push(h);
    return arr;
  }, [p.gridStartHour, p.gridEndHour]);

  // Indice eventi per (giornoISO, ora, operator_id) → CalendarEvent
  // L'evento finisce in OGNI ora che attraversa.
  // Es. evento 8:30→10:00 con dur 90min entra in ora 8 e ora 9.
  const eventIndex = useMemo(() => {
    const map = new Map<string, CalendarEvent>();
    for (const ev of p.filteredEvents) {
      const opKey = ev.operator_id || "_unassigned_";
      const dKey = `${ev.start.getFullYear()}-${ev.start.getMonth()}-${ev.start.getDate()}`;
      const startH = ev.start.getHours();
      const endH = ev.end.getHours();
      const endM = ev.end.getMinutes();
      // Ora di fine "effettiva": se l'evento termina alle 10:00 in punto,
      // non considero l'ora 10. Se termina alle 10:30, sì.
      const effectiveEndH = endM === 0 ? endH - 1 : endH;
      for (let h = startH; h <= effectiveEndH; h++) {
        const k = `${dKey}|${h}|${opKey}`;
        // Se più eventi sullo stesso slot, tieni il primo (resto è anomalia)
        if (!map.has(k)) map.set(k, ev);
      }
    }
    return map;
  }, [p.filteredEvents]);

  // Memo: lista operator key da iterare in ogni cella (ordine sort_order)
  const opKeys = useMemo(() => {
    return p.members
      .map(m => ({ key: memberKey(m), member: m }))
      .filter((x): x is { key: string; member: StudioMember } => x.key !== null);
  }, [p.members]);

  return (
    <div
      style={{
        background: THEME.panelBg,
        border: `2px solid ${THEME.border}`,
        borderRadius: 12,
        boxShadow: "0 2px 12px rgba(30,64,175,0.06)",
        position: "relative",
        // Niente overflow/maxHeight: il container cresce naturalmente,
        // lo scroll lo gestisce la pagina. Lo scroll orizzontale per
        // viewport piccoli viene gestito a livello di tabella interna se
        // necessario tramite minWidth.
      }}
    >
      {/* ═══ Header giorni (sticky top) ═══ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `48px repeat(6, minmax(160px, 1fr))`,
          background: "linear-gradient(135deg, #0d9488, #2563eb)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ padding: "10px 8px", color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: 700, textAlign: "center" }}>
          ORA
        </div>
        {p.weekDays.map((day, i) => {
          const isToday = sameDay(day, p.currentTime);
          return (
            <div
              key={i}
              style={{
                padding: "10px 8px",
                textAlign: "center",
                color: "#fff",
                borderLeft: i === 0 ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.18)",
                background: isToday ? "rgba(255,255,255,0.10)" : "transparent",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, letterSpacing: 0.5 }}>
                {DAY_LABELS[i]}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>
                {day.getDate().toString().padStart(2, "0")}/{(day.getMonth() + 1).toString().padStart(2, "0")}
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ Body: griglia ora × giorno ═══ */}
      {hours.map((h) => (
        <div
          key={h}
          style={{
            display: "grid",
            gridTemplateColumns: `48px repeat(6, minmax(160px, 1fr))`,
            borderTop: `1.5px solid ${THEME.border}`,
          }}
        >
          {/* Colonna ora (sticky left). Se è l'ora corrente, mostriamo HH:MM
              corrente in rosso al posto del HH:00 fisso. */}
          {(() => {
            const isCurrentHour = p.currentTime.getHours() === h;
            const isAnyDayToday = p.weekDays.some(d => sameDay(d, p.currentTime));
            const showRed = isCurrentHour && isAnyDayToday;
            const labelText = showRed
              ? `${h.toString().padStart(2, "0")}:${p.currentTime.getMinutes().toString().padStart(2, "0")}`
              : `${h.toString().padStart(2, "0")}:00`;
            return (
              <div
                style={{
                  padding: "8px 4px",
                  fontSize: 12,
                  fontWeight: 800,
                  color: showRed ? "#dc2626" : THEME.muted,
                  textAlign: "center",
                  background: THEME.panelSoft,
                  position: "sticky",
                  left: 0,
                  zIndex: 5,
                  borderRight: `1px solid ${THEME.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {labelText}
              </div>
            );
          })()}

          {/* Per ogni giorno della settimana */}
          {p.weekDays.map((day, dIdx) => {
            const dKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
            const isToday = sameDay(day, p.currentTime);

            // Linea ora corrente: visibile solo se è oggi E l'ora corrente
            // cade dentro questo slot ora. Posizione verticale = % minuti.
            const showNowLine = isToday && p.currentTime.getHours() === h;
            const nowLineTopPct = showNowLine
              ? (p.currentTime.getMinutes() / 60) * 100
              : 0;

            return (
              <div
                key={dIdx}
                style={{
                  borderLeft: `1px solid ${THEME.border}`,
                  // Sfondo: oggi blu chiaro, slot ora corrente leggero rosso
                  background: showNowLine
                    ? "rgba(220,38,38,0.06)"
                    : isToday
                    ? "rgba(37,99,235,0.04)"
                    : "transparent",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  padding: 2,
                  minHeight: 32,
                  position: "relative",
                }}
              >
                {/* Linea ora corrente (rossa marcata) sopra alle sub-righe.
                    Posizione verticale: % minuti correnti dentro lo slot ora.
                    Più spessa e con outline bianco per leggibilità. */}
                {showNowLine && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: `calc(${nowLineTopPct}% + 2px)`,
                      height: 3,
                      background: "#dc2626",
                      zIndex: 20,
                      pointerEvents: "none",
                      boxShadow: "0 0 0 1px rgba(255,255,255,0.6), 0 0 6px rgba(220,38,38,0.4)",
                    }}
                  >
                    {/* Pallino sinistro */}
                    <div
                      style={{
                        position: "absolute",
                        left: -4,
                        top: -3,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#dc2626",
                        border: "1.5px solid #fff",
                      }}
                    />
                    {/* Etichetta orario sulla destra */}
                    <div
                      style={{
                        position: "absolute",
                        right: 4,
                        top: -10,
                        fontSize: 9,
                        fontWeight: 800,
                        color: "#dc2626",
                        background: "#fff",
                        padding: "1px 5px",
                        borderRadius: 3,
                        border: "1px solid #dc2626",
                        lineHeight: 1.2,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.currentTime.getHours().toString().padStart(2,"0")}:{p.currentTime.getMinutes().toString().padStart(2,"0")}
                    </div>
                  </div>
                )}
                {/* Per ogni operatore: 1 riga con 2 sub-colonne (op | paziente) */}
                {opKeys.map(({ key, member }) => {
                  const ev = eventIndex.get(`${dKey}|${h}|${key}`);
                  const opColor = p.operatorColorMap.get(key) || "#94a3b8";

                  // Determina se questo è uno slot "continuazione" (slot dove
                  // il paziente è iniziato in un'ora precedente, es. 90min)
                  let isContinuation = false;
                  if (ev) {
                    const evStartH = ev.start.getHours();
                    if (evStartH < h) isContinuation = true;
                  }

                  return (
                    <div
                      key={key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "0.85fr 1.6fr",
                        gap: 2,
                        alignItems: "stretch",
                        minHeight: 22,
                      }}
                    >
                      {/* Sub-col 1: nome operatore (etichetta neutra: sfondo
                          grigio chiaro, testo nero, bordo sx colore operatore.
                          Visivamente diverso dal paziente). */}
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#64748b",
                          padding: "2px 5px",
                          background: "#f8fafc",
                          borderLeft: `2px solid ${opColor}`,
                          borderRadius: 3,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          display: "flex",
                          alignItems: "center",
                          textTransform: "uppercase",
                          letterSpacing: 0.2,
                        }}
                        title={shortOpName(member)}
                      >
                        {shortOpName(member)}
                      </div>

                      {/* Sub-col 2: paziente o "ASSEGNA" — visivamente "evento":
                          sfondo colorato saturo + bordo, font normale.
                          Colore: stanza se l'evento ha room_id e mappa fornita,
                          altrimenti colore operatore (fallback). */}
                      {ev ? (() => {
                        const roomColor = ev.room_id && p.roomColorMap?.get(ev.room_id);
                        const cardColor = roomColor || opColor;
                        return (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            p.onSelectEvent(ev);
                          }}
                          title={`${ev.patient_name} · ${ev.start.toTimeString().slice(0,5)}–${ev.end.toTimeString().slice(0,5)}`}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#0f172a",
                            padding: "3px 8px",
                            // 40 = ~25% opacity hex
                            background: `${cardColor}40`,
                            border: `1px solid ${cardColor}66`,
                            borderRadius: 3,
                            cursor: "pointer",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            position: "relative",
                            opacity: ev.status === "cancelled" ? 0.5 : 1,
                            textDecoration: ev.status === "cancelled" ? "line-through" : "none",
                          }}
                        >
                          {isContinuation && (
                            <span style={{ fontSize: 9, opacity: 0.7, flexShrink: 0, color: opColor }}>↑</span>
                          )}
                          <span
                            style={{
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {fullPatientName(ev)}
                          </span>

                          {/* Microbottoni: WhatsApp + cycle stato.
                              Mostrati solo se l'evento NON è una continuazione
                              (per evitare duplicati nello slot 2 dei 90min) e
                              non è cancellato. Iconici, no label, 14×14px. */}
                          {!isContinuation && ev.status !== "cancelled" && (() => {
                            const ms = miniStatusStyle(ev);
                            const showWA = !!p.onSendReminder && !!ev.patient_phone;
                            return (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 2,
                                  flexShrink: 0,
                                  alignItems: "center",
                                }}
                              >
                                {showWA && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      p.onSendReminder!(
                                        ev.id,
                                        ev.patient_phone ?? undefined,
                                        ev.patient_first_name ?? undefined,
                                      );
                                    }}
                                    title={ev.whatsapp_sent_at ? "WhatsApp già inviato" : "Invia WhatsApp"}
                                    style={{
                                      width: 16,
                                      height: 16,
                                      padding: 0,
                                      border: "none",
                                      borderRadius: 3,
                                      cursor: "pointer",
                                      fontSize: 9,
                                      fontWeight: 700,
                                      fontFamily: "inherit",
                                      lineHeight: 1,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      background: ev.whatsapp_sent_at ? "#e2e8f0" : "#dcfce7",
                                      color: ev.whatsapp_sent_at ? "#475569" : "#16a34a",
                                    }}
                                  >
                                    {ev.whatsapp_sent_at ? "✓" : "💬"}
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    p.onCycleStatus(ev);
                                  }}
                                  title={ms.title}
                                  style={{
                                    width: 16,
                                    height: 16,
                                    padding: 0,
                                    border: "none",
                                    borderRadius: 3,
                                    cursor: "pointer",
                                    fontSize: 10,
                                    fontWeight: 800,
                                    fontFamily: "inherit",
                                    lineHeight: 1,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: ms.bg,
                                    color: ms.color,
                                  }}
                                >
                                  {ms.icon}
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                        );
                      })() : (
                        <button
                          onClick={() => {
                            p.onCreateForOperatorAndSlot(day, h, member.user_id ?? null);
                          }}
                          title={`Assegna paziente a ${shortOpName(member)} alle ${h.toString().padStart(2, "0")}:00`}
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            color: "#fff",
                            background: "#dc2626",
                            border: "none",
                            borderRadius: 3,
                            cursor: "pointer",
                            padding: "3px 6px",
                            letterSpacing: 0.5,
                            fontFamily: "inherit",
                            transition: "all 0.12s",
                            opacity: 0.85,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                        >
                          ASSEGNA
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
