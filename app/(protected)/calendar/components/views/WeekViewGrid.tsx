// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/WeekViewGrid.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// VISTA SETTIMANA — LAYOUT "GRIGLIA + CHIP" (Approccio D, mig. 022)
//
// Mantiene la griglia classica ora × giorno della WeekView, ma dentro ogni
// cella oraria mette i chip orizzontali colorati con iniziale operatore +
// cognome paziente. I chip vanno a capo automaticamente (flex-wrap).
//
// Trade-off vs altre viste multi-op:
//   + mantiene il modello mentale del calendario classico (ora × giorno)
//   + niente sub-colonne strette, chip leggibili
//   + scala bene fino a 4-5 appuntamenti per cella
//   - chip wrap-flow non hanno posizione semantica fissa per operatore
//   - cella oraria ha altezza fissa: con molti chip si va in scroll interno
//
// CICLO TASTO RAPIDO: come Pile, click su area chip apre il modale.
// Il chip è mostra-info, non ha tasto stato (per non sovraccaricare).
// Per cambiare stato si usa il modale dettaglio.
//
// Quando attivare: Settings → Team → Layout vista settimana → "Grid"
// e studio in modalità multi-operatore (multi_operator_enabled=true
// + activeMembers≥2).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, formatDMY, type CalendarEvent } from "../../utils";
import type { StudioMember } from "@/src/contexts/StudioContext";

// Numero di slot orari (da 7 a 19, slot di 1 ora). Coerente con timeSlots
// passati dal page ma li ricalcoliamo localmente per indipendenza.
const SLOT_HEIGHT = 56; // altezza riga oraria
const TIME_COL = 50; // larghezza colonna ora a sinistra

export type WeekViewGridProps = {
  weekDays: Date[];
  filteredEvents: CalendarEvent[];
  currentTime: Date;

  // Range orario configurato dall'utente (da gridStartHour a gridEndHour).
  // Default 7-19 se non passati.
  gridStartHour?: number;
  gridEndHour?: number;

  members: StudioMember[];
  /** Mappa operator_id (o "pending:<token>") → colore */
  operatorColorMap: Map<string, string>;

  /** Click su slot vuoto: crea quick-add a quell'ora di quel giorno */
  onSlotClick: (date: Date, hour: number, minute: number) => void;
  /** Click su chip evento: apre modale dettaglio */
  onSelectEvent: (event: CalendarEvent) => void;
};

function memberKey(m: StudioMember): string | null {
  if (m.user_id) return m.user_id;
  if (m.invite_token) return `pending:${m.invite_token}`;
  return null;
}

// Cognome Nome → cognome troncato per chip stretto (max 9 char + …)
function shortName(ev: CalendarEvent): string {
  const last = (ev.patient_last_name || "").trim();
  if (last) return last.length > 9 ? last.substring(0, 8) + "…" : last;
  const parts = (ev.patient_name || "").trim().split(/\s+/);
  const lastFromName = parts[parts.length - 1] || "";
  return lastFromName.length > 9 ? lastFromName.substring(0, 8) + "…" : lastFromName || "—";
}

// Iniziale operatore (signature_short del membro). Per "Non assegnati": "?"
function initialOf(opKey: string, members: StudioMember[]): string {
  if (opKey === "_unassigned_") return "?";
  const m = members.find(m => memberKey(m) === opKey);
  if (!m) return "?";
  const sig = m.signature_short || m.display_name || "?";
  return sig.charAt(0).toUpperCase();
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const DOW_LABELS = ["DOM", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"];

export default function WeekViewGrid(p: WeekViewGridProps) {
  const startHour = p.gridStartHour ?? 7;
  const endHour = p.gridEndHour ?? 19;

  // Pre-raggruppa eventi per (dayKey × startHour). Ogni evento finisce
  // nello slot dell'ORA di inizio. Eventi che durano 90min restano nella
  // cella della loro ora di inizio (non spalmati su più slot).
  const eventsByCell = new Map<string, CalendarEvent[]>();
  for (const ev of p.filteredEvents) {
    if (ev.status === "cancelled") continue;
    const dKey = dayKey(ev.start);
    const hour = ev.start.getHours();
    if (hour < startHour || hour > endHour) continue;
    const k = `${dKey}::${hour}`;
    const arr = eventsByCell.get(k);
    if (arr) arr.push(ev);
    else eventsByCell.set(k, [ev]);
  }
  // Ordina ogni gruppo per orario
  for (const arr of eventsByCell.values()) {
    arr.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  const todayKey = dayKey(p.currentTime);
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${THEME.border}`,
        borderRadius: 12,
        marginTop: 12,
        overflow: "hidden",
      }}
    >
      {/* ═══════ Header giorni ═══════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${TIME_COL}px repeat(${p.weekDays.length}, 1fr)`,
          background: "linear-gradient(135deg, #0d9488 0%, #2563eb 100%)",
          color: "#fff",
        }}
      >
        <div style={{ padding: "10px 6px", fontSize: 10, fontWeight: 600, opacity: 0.85, textAlign: "center" }}>ORA</div>
        {p.weekDays.map((d, i) => {
          const k = dayKey(d);
          const isToday = k === todayKey;
          return (
            <div
              key={i}
              style={{
                padding: "10px 6px",
                textAlign: "center",
                background: isToday ? "rgba(255,255,255,0.16)" : "transparent",
                borderLeft: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>{DOW_LABELS[d.getDay()]}</div>
              <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.9 }}>{formatDMY(d)}</div>
            </div>
          );
        })}
      </div>

      {/* ═══════ Body: griglia ora × giorno ═══════ */}
      <div>
        {hours.map(h => (
          <div
            key={h}
            style={{
              display: "grid",
              gridTemplateColumns: `${TIME_COL}px repeat(${p.weekDays.length}, 1fr)`,
              borderTop: `1px solid ${THEME.border}`,
              minHeight: SLOT_HEIGHT,
            }}
          >
            {/* Colonna ora */}
            <div
              style={{
                padding: "4px 4px 0",
                textAlign: "right",
                fontSize: 10,
                fontWeight: 600,
                color: THEME.muted,
                background: THEME.panelSoft,
                borderRight: `1px solid ${THEME.border}`,
              }}
            >
              {h.toString().padStart(2, "0")}:00
            </div>
            {/* Celle giorno */}
            {p.weekDays.map((d, di) => {
              const k = `${dayKey(d)}::${h}`;
              const cellEvents = eventsByCell.get(k) || [];
              const isToday = dayKey(d) === todayKey;
              return (
                <div
                  key={di}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      p.onSlotClick(d, h, 0);
                    }
                  }}
                  style={{
                    borderLeft: di === 0 ? "none" : `1px solid ${THEME.border}`,
                    background: isToday ? "rgba(37,99,235,0.04)" : "#fff",
                    padding: 3,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 2,
                    alignContent: "flex-start",
                    cursor: cellEvents.length === 0 ? "pointer" : "default",
                  }}
                >
                  {cellEvents.map(ev => {
                    const opKey = ev.operator_id || "_unassigned_";
                    const color = p.operatorColorMap.get(opKey) || "#94a3b8";
                    const init = initialOf(opKey, p.members);
                    return (
                      <button
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          p.onSelectEvent(ev);
                        }}
                        style={{
                          background: `${color}26`, // ~15% opacity
                          color: THEME.text,
                          border: "none",
                          borderRadius: 99,
                          padding: "2px 8px 2px 3px",
                          fontSize: 10,
                          fontFamily: "inherit",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          lineHeight: 1.2,
                          whiteSpace: "nowrap",
                        }}
                        title={`${ev.patient_name} · ${ev.start.getHours()}:${String(ev.start.getMinutes()).padStart(2, "0")}`}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: color,
                            color: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 9,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {init}
                        </span>
                        <span>{shortName(ev)}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ═══════ Footer ═══════ */}
      <div
        style={{
          padding: "8px 14px",
          background: THEME.panelSoft,
          borderTop: `1px solid ${THEME.border}`,
          fontSize: 10,
          color: THEME.muted,
        }}
      >
        Layout <strong>Griglia + chip</strong>. Click cella vuota = nuovo appuntamento; click chip = dettaglio (con tasto stato nel modale). Cambia layout in Impostazioni → Team.
      </div>
    </div>
  );
}
