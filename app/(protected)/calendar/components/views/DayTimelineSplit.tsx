// app/(protected)/calendar/components/views/DayTimelineSplit.tsx
// ════════════════════════════════════════════════════════════════════════
// Vista giornaliera SPLIT — titolare + professionista ospite (mig. 029)
// ════════════════════════════════════════════════════════════════════════
//
// Componente dedicato per la giornata in cui c'è un appuntamento di un
// professionista ospite (ortopedico, nutrizionista, ecc.). Mostra DUE
// colonne affiancate condividendo asse temporale, header, e righe orizzon-
// tali → layout armonioso, allineamenti perfetti.
//
// STRUTTURA:
//   ┌──────────────────────────────────────────────────────────────┐
//   │  Header gradient teal→blu con data (full width)              │
//   ├──────┬──────────────────────────────┬─────────────────────────┤
//   │  Ora │  • Studio                    │ • Andrea Gerardi       │
//   ├──────┼──────────────────────────────┼─────────────────────────┤
//   │ 09:00│                              │                         │
//   ├──────┼──────────────────────────────┼─────────────────────────┤
//   │ 10:00│                              │ ┃ 10:30 Papa Simone     │
//   ├──────┼──────────────────────────────┼─────────────────────────┤
//   │ 11:00│                              │                         │
//   ├──────┼──────────────────────────────┼─────────────────────────┤
//   │ 12:00│ [== Centofante Anna ==]      │                         │
//   ├──────┼──────────────────────────────┼─────────────────────────┤
//   │ ...  │                              │                         │
//
// GRID: una SOLA grid CSS con 3 colonne (TIME_COL | 1fr | 1fr). Le righe
// orarie sono righe della grid che attraversano tutte le 3 colonne, quindi
// gli orari sono perfettamente allineati su entrambe le colonne.
//
// CARD STUDIO (sinistra):  stile pieno colorato (statusBg(status)) — uguale
//                          identico al DayTimeline normale. È TUO codice.
// CARD OSPITE (destra):    stile bianco con bordo sinistro 5px del colore
//                          dell'ospite. Visivamente "diverse" → si capisce
//                          subito che non sono tue.
//
// LIMITAZIONI:
//   - Niente drag-and-drop tra le due colonne (un appt non cambia natura)
//   - Niente bulk-select sulle card ospite
//   - Niente lane assignment multi-evento sulla colonna ospite (overlapping
//     viene gestito con offset orizzontale interno alla colonna)
// ════════════════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { Stethoscope, ChevronDown } from "lucide-react";
import type { CalendarEvent } from "../../utils/types";
import { THEME, fmtTime, formatDMY, statusBg, statusLabel, getTreatmentLabel } from "../../utils";

const DAY_PX_PER_MIN = 1;

// ── Utility colori ─────────────────────────────────────────────────────
// Converte un hex (#RRGGBB) in rgba() con alpha specificato. Usato per
// generare la versione "soft" del colore ospite come fondo card.
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3
    ? h.split("").map(c => c + c).join("")
    : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Restituisce versione più scura del colore (mescolato con nero) per
// renderlo leggibile come testo su sfondo tenue. fraction = quanto nero
// mescolare (0 = colore originale, 1 = nero puro).
function darkenHex(hex: string, fraction: number): string {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3
    ? h.split("").map(c => c + c).join("")
    : h, 16);
  const r = Math.round(((bigint >> 16) & 255) * (1 - fraction));
  const g = Math.round(((bigint >> 8) & 255) * (1 - fraction));
  const b = Math.round((bigint & 255) * (1 - fraction));
  return `rgb(${r}, ${g}, ${b})`;
}

// ── Props ──────────────────────────────────────────────────────────────
export type DayTimelineSplitProps = {
  currentDate: Date;
  /** Appuntamenti del titolare (già filtrati per giorno, esclusi cancellati) */
  ownerEvents: CalendarEvent[];
  /** Appuntamenti dell'ospite del giorno */
  guestEvents: CalendarEvent[];
  /** Ospite attivo nel giorno (per header e colore) */
  guest: {
    id: string;
    first_name: string;
    last_name: string;
    specialty: string;
    display_color: string | null;
  };
  /** Tempo corrente (linea NOW) */
  currentTime: Date;
  /** Lista slot orari (es. ["07:00","07:30",...]) */
  timeSlots: string[];
  /** Etichette giorni della settimana per intestazione */
  dayLabels: Array<{ label: string }>;
  /** Larghezza colonna orari in px */
  TIME_COL: number;
  /** Prima ora visibile della griglia */
  gridStartHour?: number;
  /** Click su uno slot vuoto (sinistra=studio, destra=ospite) */
  onSlotClick: (date: Date, hour: number, minute: number, side: "owner" | "guest") => void;
  /** Click su una card. Riceve l'intero evento (stessa firma del DayTimeline
   *  normale, così il dispatching nel parent è identico). */
  onSelectEvent: (event: CalendarEvent) => void;
  /** Tutti gli ospiti che hanno appuntamenti nel giorno corrente (mig. 029 + 5c).
   *  Quando length > 1, l'header della colonna destra mostra un dropdown
   *  per cambiare ospite. Ordinati per orario del primo appuntamento. */
  allGuestsInDay?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    specialty: string;
    display_color: string | null;
    appointmentCount: number;
  }>;
  /** Callback chiamato quando l'utente seleziona un altro ospite dal
   *  dropdown. Riceve l'id del nuovo ospite. */
  onSwitchGuest?: (guestId: string) => void;
};

export default function DayTimelineSplit({
  currentDate,
  ownerEvents,
  guestEvents,
  guest,
  currentTime,
  timeSlots,
  dayLabels,
  TIME_COL,
  gridStartHour = 7,
  onSlotClick,
  onSelectEvent,
  allGuestsInDay,
  onSwitchGuest,
}: DayTimelineSplitProps) {

  // ── Header data ────────────────────────────────────────────────────────
  const dayLabelIdx = ((currentDate.getDay() + 6) % 7); // lun=0
  const dayHeader = `${dayLabels[dayLabelIdx].label} • ${formatDMY(currentDate)}`;

  // ── Colore ospite ──────────────────────────────────────────────────────
  // Il display_color viene dal record guest_practitioners (configurato in
  // Impostazioni → Team → Professionisti ospiti). Da questo derivo:
  //   - guestColor: il colore "vivo" (bordo card, icona, pallino header)
  //   - guestColorSoft: stesso colore ma traslucido al 12% (fondo card)
  // Questo permette di cambiare colore da Impostazioni e vedere tutto
  // aggiornarsi automaticamente.
  const guestColor = guest.display_color || "#DB2777"; // default magenta
  const guestColorSoft = hexToRgba(guestColor, 0.12);
  // Versione più scura per il testo, ricavata abbassando la luminosità.
  const guestColorDark = darkenHex(guestColor, 0.4);

  // ── Switcher ospiti (mig. 029 + 5c) ────────────────────────────────────
  // Quando ci sono 2+ ospiti nello stesso giorno, l'header della colonna
  // destra diventa cliccabile e apre un dropdown per cambiare ospite.
  const hasMultipleGuests = !!allGuestsInDay && allGuestsInDay.length > 1;
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Chiusura dropdown al click fuori
  useEffect(() => {
    if (!switcherOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [switcherOpen]);

  // ── Linea "now" ────────────────────────────────────────────────────────
  const today = new Date();
  const isToday =
    today.getDate() === currentDate.getDate() &&
    today.getMonth() === currentDate.getMonth() &&
    today.getFullYear() === currentDate.getFullYear();

  const nowTopPx = isToday
    ? ((currentTime.getHours() - gridStartHour) * 60 + currentTime.getMinutes()) * DAY_PX_PER_MIN
    : null;

  // ── Calcolo posizioni eventi ───────────────────────────────────────────
  // Restituisce {top, height} in px relative all'inizio della griglia oraria.
  function posFor(ev: CalendarEvent) {
    const startMin = (ev.start.getHours() - gridStartHour) * 60 + ev.start.getMinutes();
    const durationMin = Math.max(15, (ev.end.getTime() - ev.start.getTime()) / 60000);
    return {
      top: startMin * DAY_PX_PER_MIN,
      height: durationMin * DAY_PX_PER_MIN,
    };
  }

  // ── Altezza totale della griglia in base agli slot ─────────────────────
  // Ogni slot rappresenta 1 ora (60 min). N slot × 60 × PX_PER_MIN.
  const gridTotalHeight = timeSlots.length * 60 * DAY_PX_PER_MIN;

  // ── Stile cella oraria singola ─────────────────────────────────────────
  const hourCellStyle: CSSProperties = {
    height: 60 * DAY_PX_PER_MIN,
    borderBottom: `0.5px solid ${THEME.border}`,
    boxSizing: "border-box",
  };

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      background: THEME.panelBg,
      border: `2px solid ${THEME.border}`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(30,64,175,0.06)",
    }}>

      {/* ── HEADER 1: data (full width, gradient teal→blu) ─────────────── */}
      {/* padding: "14px 16px" → stessa altezza dell'header della DaySidebar
         a destra. Questo allinea visivamente le due bande gradient. */}
      <div style={{
        background: "linear-gradient(135deg, #0d9488, #2563eb)",
        color: "white",
        padding: "14px 18px",
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 0.5,
        borderBottom: `1px solid ${THEME.border}`,
      }}>
        {dayHeader}
      </div>

      {/* ── HEADER 2: nomi delle due colonne ───────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `${TIME_COL}px minmax(0, 1fr) minmax(0, 1fr)`,
        background: THEME.panelSoft,
        borderBottom: `1px solid ${THEME.border}`,
      }}>
        {/* Cella ORA */}
        <div style={{
          padding: "8px 6px",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          color: THEME.muted,
          textAlign: "center",
          textTransform: "uppercase",
          borderRight: `0.5px solid ${THEME.border}`,
          boxSizing: "border-box",
        }}>
          Ora
        </div>
        {/* Cella STUDIO */}
        <div style={{
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 800,
          color: "#04342C",
          borderRight: `0.5px solid ${THEME.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          boxSizing: "border-box",
          minWidth: 0,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#0d9488", flexShrink: 0,
          }} />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Studio
          </span>
        </div>
        {/* Cella OSPITE (con dropdown switcher se 2+ ospiti, mig. 5c) */}
        <div
          ref={switcherRef}
          style={{
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 800,
            color: "#412402",
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxSizing: "border-box",
            minWidth: 0,
            cursor: hasMultipleGuests ? "pointer" : "default",
            position: "relative",
            transition: "background 0.15s",
            background: switcherOpen ? guestColorSoft : "transparent",
            borderRadius: 6,
          }}
          onClick={() => {
            if (hasMultipleGuests) setSwitcherOpen(o => !o);
          }}
          onMouseEnter={e => {
            if (hasMultipleGuests) {
              (e.currentTarget as HTMLDivElement).style.background = guestColorSoft;
            }
          }}
          onMouseLeave={e => {
            if (hasMultipleGuests && !switcherOpen) {
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: guestColor, flexShrink: 0,
          }} />
          <span style={{
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            minWidth: 0, flex: 1,
          }}>
            {guest.first_name} {guest.last_name}
            <span style={{ fontWeight: 500, color: THEME.muted, marginLeft: 6, fontSize: 12 }}>
              · {guest.specialty}
            </span>
          </span>
          {hasMultipleGuests && (
            <>
              {/* Badge "2 di N" */}
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: guestColor, color: "#fff",
                padding: "2px 7px", borderRadius: 99,
                letterSpacing: 0.3,
                flexShrink: 0,
              }}>
                {(allGuestsInDay!.findIndex(g => g.id === guest.id) + 1)} di {allGuestsInDay!.length}
              </span>
              <ChevronDown
                size={14}
                style={{
                  flexShrink: 0,
                  transition: "transform 0.15s",
                  transform: switcherOpen ? "rotate(180deg)" : "rotate(0deg)",
                  color: THEME.muted,
                }}
              />
            </>
          )}

          {/* Dropdown con lista ospiti del giorno */}
          {hasMultipleGuests && switcherOpen && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              minWidth: 280,
              background: "#fff",
              border: `1px solid ${THEME.border}`,
              borderRadius: 10,
              boxShadow: "0 8px 32px rgba(15,23,42,0.18)",
              zIndex: 50,
              overflow: "hidden",
              padding: 4,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: THEME.muted,
                padding: "8px 12px 4px", letterSpacing: 0.5,
                textTransform: "uppercase",
              }}>
                Ospiti del giorno
              </div>
              {allGuestsInDay!.map(g => {
                const isActive = g.id === guest.id;
                const gColor = g.display_color || "#DB2777";
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSwitcherOpen(false);
                      if (onSwitchGuest && g.id !== guest.id) {
                        onSwitchGuest(g.id);
                      }
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: isActive ? hexToRgba(gColor, 0.12) : "transparent",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLButtonElement).style.background = THEME.panelSoft;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                      }
                    }}
                  >
                    <span style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: gColor, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: THEME.text,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {g.first_name} {g.last_name}
                      </div>
                      <div style={{
                        fontSize: 11, color: THEME.muted, marginTop: 1,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {g.specialty} · {g.appointmentCount} appuntament{g.appointmentCount === 1 ? "o" : "i"}
                      </div>
                    </div>
                    {isActive && (
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        background: gColor, color: "#fff",
                        padding: "2px 7px", borderRadius: 99,
                        letterSpacing: 0.3, flexShrink: 0,
                      }}>
                        Attivo
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── GRIGLIA ORARIA: 3 colonne, righe condivise ─────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `${TIME_COL}px minmax(0, 1fr) minmax(0, 1fr)`,
        position: "relative",
      }}>

        {/* Colonna ORARI */}
        <div style={{
          borderRight: `0.5px solid ${THEME.border}`,
          background: THEME.panelSoft,
        }}>
          {timeSlots.map((time) => (
            <div key={`t-${time}`} style={{
              ...hourCellStyle,
              fontSize: 11,
              fontWeight: 600,
              color: THEME.muted,
              padding: "6px 8px",
              textAlign: "right",
              boxSizing: "border-box",
            }}>
              {time}
            </div>
          ))}
        </div>

        {/* Colonna STUDIO (eventi titolare, card piene) */}
        <div style={{
          position: "relative",
          borderRight: `0.5px solid ${THEME.border}`,
          height: gridTotalHeight,
          background: "#fff",
        }}>
          {/* Righe orarie cliccabili */}
          {timeSlots.map((time, idx) => {
            const hour = parseInt(time.split(":")[0]);
            return (
              <div
                key={`os-${idx}`}
                onClick={() => onSlotClick(currentDate, hour, 0, "owner")}
                style={{
                  ...hourCellStyle,
                  cursor: "pointer",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(13,148,136,0.04)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              />
            );
          })}

          {/* Card eventi STUDIO — stile pieno colorato (status-based) */}
          {ownerEvents.map(ev => {
            const { top, height } = posFor(ev);
            const bg = ev.is_group
              ? "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)"
              : statusBg(ev.status);
            return (
              <div
                key={ev.id}
                onClick={(e) => { e.stopPropagation(); onSelectEvent(ev); }}
                style={{
                  position: "absolute",
                  left: 4,
                  right: 4,
                  top: top + 1,
                  height: Math.max(height - 2, 28),
                  background: bg,
                  color: "#fff",
                  borderRadius: 6,
                  padding: "6px 10px",
                  boxSizing: "border-box",
                  cursor: "pointer",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  boxShadow: "0 1px 3px rgba(15,23,42,0.10)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.95, letterSpacing: 0.2 }}>
                    {fmtTime(ev.start.toISOString())}–{fmtTime(ev.end.toISOString())}
                  </span>
                  {height >= 36 && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, color: "#fff",
                      background: "rgba(255,255,255,0.22)",
                      padding: "1px 6px", borderRadius: 99,
                      whiteSpace: "nowrap", flexShrink: 0,
                      letterSpacing: 0.3,
                    }}>
                      {statusLabel(ev.status)}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 800, color: "#fff",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  lineHeight: 1.2,
                }}>
                  {ev.patient_name}
                </div>
                {height >= 44 && ev.treatment_type && (
                  <div style={{
                    fontSize: 11, color: "rgba(255,255,255,0.88)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {getTreatmentLabel(ev.treatment_type)}
                    {typeof ev.amount === "number" && ev.amount > 0 ? ` · €${ev.amount}` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Colonna OSPITE (eventi guest, card bianche con bordo spesso) */}
        <div style={{
          position: "relative",
          height: gridTotalHeight,
          background: "#fff",
        }}>
          {/* Righe orarie cliccabili */}
          {timeSlots.map((time, idx) => {
            const hour = parseInt(time.split(":")[0]);
            return (
              <div
                key={`gs-${idx}`}
                onClick={() => onSlotClick(currentDate, hour, 0, "guest")}
                style={{
                  ...hourCellStyle,
                  cursor: "pointer",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = guestColorSoft; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              />
            );
          })}

          {/* Card eventi OSPITE — fondo tenue, bordo 2px, icona stetoscopio */}
          {guestEvents.map(ev => {
            const { top, height } = posFor(ev);
            return (
              <div
                key={ev.id}
                onClick={(e) => { e.stopPropagation(); onSelectEvent(ev); }}
                style={{
                  position: "absolute",
                  left: 4,
                  right: 4,
                  top: top + 1,
                  height: Math.max(height - 2, 28),
                  // Fondo tenue del colore ospite (~12% opacity sul colore base).
                  // Bordo 2px del colore pieno → la card "vibra" del suo colore
                  // senza essere invadente come un fondo pieno colorato.
                  background: guestColorSoft,
                  border: `2px solid ${guestColor}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  boxSizing: "border-box",
                  cursor: "pointer",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 2,
                  boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
                }}
              >
                {/* Riga superiore: icona stetoscopio + orario, entrambi
                    colorati nel tono dell'ospite. Subito riconoscibile. */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  color: guestColor,
                  letterSpacing: 0.2,
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  <Stethoscope size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fmtTime(ev.start.toISOString())}–{fmtTime(ev.end.toISOString())}
                  </span>
                </div>
                {/* Nome paziente in evidenza, colore scuro derivato per
                    massima leggibilità sul fondo tenue. */}
                <div style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: guestColorDark,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1.25,
                }}>
                  {ev.patient_name}
                </div>
                {/* Trattamento se card sufficientemente alta */}
                {height >= 56 && ev.treatment_type && (
                  <div style={{
                    fontSize: 11,
                    color: guestColor,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.2,
                    opacity: 0.85,
                  }}>
                    {getTreatmentLabel(ev.treatment_type)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Linea "ORA" rossa (full width, attraversa entrambe le colonne) */}
        {nowTopPx !== null && (
          <div style={{
            position: "absolute",
            left: TIME_COL,
            right: 0,
            top: nowTopPx,
            height: 2,
            background: THEME.red,
            zIndex: 4,
            pointerEvents: "none",
          }}>
            <div style={{
              position: "absolute",
              left: -4, top: -4,
              width: 10, height: 10,
              borderRadius: "50%",
              background: THEME.red,
            }} />
          </div>
        )}

      </div>
    </div>
  );
}
