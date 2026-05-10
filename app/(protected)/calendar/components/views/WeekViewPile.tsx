// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/WeekViewPile.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// VISTA SETTIMANA — LAYOUT "PILE CRONOLOGICHE" (Approccio C, mig. 022)
//
// 6 colonne giorno (LUN-SAB), nessuna griglia oraria.
// Ogni colonna è una pila verticale con TUTTI gli appuntamenti del giorno
// ordinati cronologicamente. Ogni card mostra: orario, Cognome Nome,
// durata, e un tasto rapido che cicla lo stato/pagamento.
//
// Bordo sinistro 3px = colore operatore (display_color del membro).
//
// CICLO TASTO RAPIDO (gestito dal parent via onCycleStatus):
//   booked → confirmed
//   confirmed → done + paid (paga col metodo coerente con price_type)
//   done+paid → done+non pagato
//   done+non_paid → confirmed
//   not_paid → confirmed
//   cancelled → confirmed (riapre)
//
// Altezza dinamica: nessun cap fisso sul body, cresce con i contenuti.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, formatDMY, type CalendarEvent } from "../../utils";
import type { StudioMember } from "@/src/contexts/StudioContext";

export type WeekViewPileProps = {
  weekDays: Date[];
  filteredEvents: CalendarEvent[];
  currentTime: Date;

  members: StudioMember[];
  /** Mappa operator_id → colore (chiave include "pending:..." per inviti) */
  operatorColorMap: Map<string, string>;

  /** Click su giorno (header) o area vuota: crea quick-add per quel giorno */
  onCreateForDay: (date: Date) => void;
  /** Click su card evento: apre modale dettaglio */
  onSelectEvent: (event: CalendarEvent) => void;
  /** Tasto rapido: avanza il ciclo stato/pagamento dell'evento */
  onCycleStatus: (event: CalendarEvent) => void;
};

function memberKey(m: StudioMember): string | null {
  if (m.user_id) return m.user_id;
  if (m.invite_token) return `pending:${m.invite_token}`;
  return null;
}

// Cognome Nome (cognome prima)
function fullNameOf(ev: CalendarEvent): string {
  const last = (ev.patient_last_name || "").trim();
  const first = (ev.patient_first_name || "").trim();
  if (last && first) return `${last} ${first}`;
  if (last) return last;
  if (first) return first;
  return ev.patient_name || "—";
}

function fmtHHMM(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function durationMinutes(ev: CalendarEvent): number {
  return Math.round((ev.end.getTime() - ev.start.getTime()) / 60000);
}

// Stato visivo del tasto rapido (label, colori, tooltip).
// Il click sempre invoca onCycleStatus(event); il parent applica la transizione.
function quickActionStyle(ev: CalendarEvent): {
  label: string;
  bg: string;
  color: string;
  title: string;
} {
  const isPaid = ev.is_paid === true;
  switch (ev.status) {
    case "booked":
      return {
        label: "Conferma",
        bg: "#2563eb",
        color: "#fff",
        title: "Click per confermare",
      };
    case "confirmed":
      return {
        label: "Pagato ✓",
        bg: "#16a34a",
        color: "#fff",
        title: "Click per segnare come eseguito e pagato",
      };
    case "done":
      if (isPaid) {
        return {
          label: "✓ Pagato",
          bg: "#dcfce7",
          color: "#166534",
          title: "Click per annullare il pagamento",
        };
      }
      return {
        label: "Non pagato",
        bg: "#fee2e2",
        color: "#991b1b",
        title: "Click per riportare a confermato",
      };
    case "not_paid":
      return {
        label: "Non pagato",
        bg: "#fee2e2",
        color: "#991b1b",
        title: "Click per riportare a confermato",
      };
    case "cancelled":
      return {
        label: "Riapri",
        bg: "#f1f5f9",
        color: "#475569",
        title: "Click per riaprire",
      };
    default:
      return {
        label: "—",
        bg: "#f1f5f9",
        color: "#475569",
        title: "",
      };
  }
}

const DOW_LABELS = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];

export default function WeekViewPile(p: WeekViewPileProps) {
  // Pre-raggruppa eventi per giorno
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const ev of p.filteredEvents) {
    const k = dayKey(ev.start);
    const arr = eventsByDay.get(k);
    if (arr) arr.push(ev);
    else eventsByDay.set(k, [ev]);
  }
  for (const arr of eventsByDay.values()) {
    arr.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  const todayKey = dayKey(p.currentTime);

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${THEME.border}`,
        borderRadius: 12,
        marginTop: 12,
        // Niente overflow:hidden → l'altezza è dinamica e cresce con i contenuti
      }}
    >
      {/* ═══════ Header giorni ═══════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${p.weekDays.length}, 1fr)`,
          background: "linear-gradient(135deg, #0d9488 0%, #2563eb 100%)",
          color: "#fff",
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          overflow: "hidden",
        }}
      >
        {p.weekDays.map((d, i) => {
          const k = dayKey(d);
          const isToday = k === todayKey;
          const count = eventsByDay.get(k)?.length || 0;
          return (
            <button
              key={i}
              onClick={() => p.onCreateForDay(d)}
              style={{
                padding: "10px 6px",
                textAlign: "center",
                background: isToday ? "rgba(255,255,255,0.16)" : "transparent",
                borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.18)",
                color: "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                border: "none",
              }}
              title={`Click per creare un appuntamento il ${formatDMY(d)}`}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>
                {DOW_LABELS[d.getDay()]}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.9 }}>{formatDMY(d)}</div>
              <div
                style={{
                  marginTop: 4,
                  display: "inline-block",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 99,
                  background: count > 0 ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                  letterSpacing: 0.3,
                }}
              >
                {count === 0 ? "—" : `${count} sed.`}
              </div>
            </button>
          );
        })}
      </div>

      {/* ═══════ Body: pile per ogni giorno (altezza dinamica) ═══════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${p.weekDays.length}, 1fr)`,
          alignItems: "stretch",
        }}
      >
        {p.weekDays.map((d, di) => {
          const k = dayKey(d);
          const dayEvents = eventsByDay.get(k) || [];
          const isToday = k === todayKey;
          return (
            <div
              key={di}
              style={{
                borderLeft: di === 0 ? "none" : `1px solid ${THEME.border}`,
                background: isToday ? "rgba(37,99,235,0.04)" : "#fff",
                padding: 6,
                display: "flex",
                flexDirection: "column",
                gap: 5,
                minHeight: 200,
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) p.onCreateForDay(d);
              }}
            >
              {dayEvents.length === 0 ? (
                <button
                  onClick={() => p.onCreateForDay(d)}
                  style={{
                    flex: 1,
                    minHeight: 180,
                    border: `1px dashed ${THEME.border}`,
                    borderRadius: 8,
                    background: "transparent",
                    cursor: "pointer",
                    color: "#cbd5e1",
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontStyle: "italic",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  + nuovo
                </button>
              ) : (
                dayEvents.map(ev => {
                  const opKey = ev.operator_id || "_unassigned_";
                  const color = p.operatorColorMap.get(opKey) || "#94a3b8";
                  const dur = durationMinutes(ev);
                  const action = quickActionStyle(ev);
                  return (
                    <div
                      key={ev.id}
                      onClick={() => p.onSelectEvent(ev)}
                      style={{
                        background: `${color}1a`,
                        borderLeft: `3px solid ${color}`,
                        borderRadius: "0 6px 6px 0",
                        padding: "6px 8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        cursor: "pointer",
                      }}
                      title={`${fullNameOf(ev)} · ${fmtHHMM(ev.start)} · ${dur}min`}
                    >
                      {/* Riga 1: orario + durata */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 4,
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: color, letterSpacing: 0.2 }}>
                          {fmtHHMM(ev.start)}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            color: THEME.muted,
                            background: "#fff",
                            padding: "1px 5px",
                            borderRadius: 99,
                            border: `1px solid ${THEME.border}`,
                            letterSpacing: 0.2,
                          }}
                        >
                          {dur}'
                        </span>
                      </div>

                      {/* Riga 2: Cognome Nome (full, va a capo se lungo) */}
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: THEME.text,
                          lineHeight: 1.25,
                          wordBreak: "break-word",
                        }}
                      >
                        {fullNameOf(ev)}
                      </div>

                      {/* Riga 3: badge "Annullato" solo se cancelled */}
                      {ev.status === "cancelled" && (
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: "#94a3b8",
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                          }}
                        >
                          Annullato
                        </div>
                      )}

                      {/* Riga 4: tasto rapido stato/pagamento */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          p.onCycleStatus(ev);
                        }}
                        style={{
                          marginTop: 2,
                          background: action.bg,
                          color: action.color,
                          border: "none",
                          borderRadius: 6,
                          padding: "4px 8px",
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: "inherit",
                          cursor: "pointer",
                          letterSpacing: 0.2,
                          textAlign: "center",
                          width: "100%",
                        }}
                        title={action.title}
                      >
                        {action.label}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      {/* ═══════ Footer: legenda operatori ═══════ */}
      <div
        style={{
          padding: "8px 14px",
          background: THEME.panelSoft,
          borderTop: `1px solid ${THEME.border}`,
          fontSize: 10,
          color: THEME.muted,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
        }}
      >
        <div>
          Layout <strong>Pile cronologiche</strong>. Click giorno = nuovo; click card = dettaglio; click tasto colorato = avanza stato. Cambia layout in Impostazioni → Team.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {p.members
            .map(m => ({ key: memberKey(m), member: m }))
            .filter((r): r is { key: string; member: StudioMember } => r.key !== null)
            .map(({ key, member }) => {
              const color = p.operatorColorMap.get(key) || "#94a3b8";
              return (
                <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  {member.display_name || "—"}
                </span>
              );
            })}
        </div>
      </div>
    </div>
  );
}
