// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/OperatorLegend.tsx
// ═══════════════════════════════════════════════════════════════════════
// Legenda colori-operatori sticky, mostrata sopra il calendario quando lo
// studio è in modalità multi-operatore (multi_operator_enabled=true +
// activeMembers≥2). Aiuta l'utente a ricordare il mapping colore→nome
// e da Fase 4b.2c agisce anche da FILTRO interattivo.
//
// Comportamento click:
//   - Click su un chip → filtra solo per quell'operatore
//   - Click di nuovo sullo stesso chip → torna a "tutti"
//   - Banner "Mostra tutti" visibile quando filtro attivo
//
// Mostrata in TUTTE le viste multi-op: Day, Week (Classica/Timeline/
// Pile/Grid), Month (futura). La logica del filtro è nel padre
// (calendar/page.tsx) — questo componente gestisce solo l'UI.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME } from "../utils";
import type { StudioMember } from "@/src/contexts/StudioContext";

export type OperatorLegendProps = {
  members: StudioMember[];
  /** Mappa operator_id (o "pending:<token>") → colore */
  operatorColorMap: Map<string, string>;
  /** Se true, mostra anche il chip "Non assegnati" grigio in fondo */
  showUnassigned?: boolean;
  /**
   * Filtro attivo: chiave operatore selezionata. null = mostra tutti.
   * Possibili valori: user_id, "pending:<token>", "_unassigned_".
   */
  /** Chiavi selezionate (array vuoto = tutti visibili). Selezione MULTIPLA. */
  selectedKeys: string[];
  /**
   * Callback al click su un chip. Il padre decide se attivare/disattivare
   * il filtro (toggle) confrontando con `selectedKey` corrente.
   */
  /** Aggiunge/toglie una chiave dalla selezione. null = azzera (mostra tutti). */
  onToggleKey: (key: string | null) => void;
  /** Tappa E: user_id dell'utente loggato. Se presente e corrisponde a un
   *  membro attivo, mostra il chip "Io" come scorciatoia di filtro. */
  currentUserId?: string | null;
};

function memberKey(m: StudioMember): string | null {
  if (m.user_id) return m.user_id;
  if (m.invite_token) return `pending:${m.invite_token}`;
  return null;
}

export default function OperatorLegend({
  members,
  operatorColorMap,
  showUnassigned = false,
  selectedKeys,
  onToggleKey,
  currentUserId,
}: OperatorLegendProps) {
  const rows = members
    .map(m => ({ key: memberKey(m), member: m }))
    .filter((r): r is { key: string; member: StudioMember } => r.key !== null);

  if (rows.length === 0) return null;

  const filterActive = selectedKeys.length > 0;

  // Selezione multipla: ogni click aggiunge o toglie un operatore, così si
  // possono guardare due o tre agende insieme. Nessuna selezione = tutti.
  const handleClick = (key: string) => onToggleKey(key);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        padding: "8px 14px",
        background: "#fff",
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        marginTop: 8,
        marginBottom: 8,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: THEME.muted,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        Operatori
      </span>

      {/* ─── Tappa E: scorciatoia "Io" ────────────────────────────────
          Un click filtra sulle proprie sedute: è l'azione più frequente per
          un collaboratore che apre l'agenda condivisa. */}
      {currentUserId && rows.some(r => r.key === currentUserId) && (
        <button
          onClick={() => onToggleKey(currentUserId)}
          title={selectedKeys.includes(currentUserId) ? "Togli il filtro sulle tue sedute" : "Aggiungi le tue sedute al filtro"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 11px", borderRadius: 99,
            border: `1.5px solid ${selectedKeys.includes(currentUserId) ? "#334155" : "#cbd5e1"}`,
            background: selectedKeys.includes(currentUserId) ? "#334155" : "#fff",
            color: selectedKeys.includes(currentUserId) ? "#fff" : "#475569",
            fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Io
        </button>
      )}
      {rows.map(({ key, member }) => {
        const color = operatorColorMap.get(key) || "#94a3b8";
        const isPending = !member.user_id;
        const isSelected = selectedKeys.includes(key);
        const isDimmed = filterActive && !isSelected;
        const initials = (member.signature_short || member.display_name || "?")
          .substring(0, 2)
          .toUpperCase();
        return (
          <button
            key={key}
            // Tappa A: i membri PENDING (invitati non ancora registrati) non
            // possono avere appuntamenti assegnati (il modale richiede
            // user_id), quindi il loro chip come filtro mostrerebbe sempre
            // un calendario vuoto. Li lasciamo visibili (per la legenda
            // colori) ma non cliccabili.
            onClick={() => { if (isPending) return; handleClick(key); }}
            title={
              isPending
                ? "In attesa di registrazione: il filtro si attiva quando il collega completa l'iscrizione"
                : isSelected ? "Click per mostrare tutti" : `Click per filtrare solo ${member.display_name || "—"}`
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px 3px 3px",
              borderRadius: 99,
              background: isSelected ? color : `${color}14`,
              border: isSelected ? `2px solid ${color}` : `1px solid ${color}40`,
              cursor: isPending ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: isDimmed ? 0.4 : isPending ? 0.65 : 1,
              transition: "opacity 0.15s, background 0.15s, border-color 0.15s",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: isSelected ? "#fff" : color,
                color: isSelected ? color : "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.2,
              }}
            >
              {initials}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: isSelected ? "#fff" : THEME.text,
              }}
            >
              {member.display_name || "—"}
            </span>
            {isPending && (
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: 99,
                  background: isSelected ? "rgba(255,255,255,0.3)" : "#fef3c7",
                  color: isSelected ? "#fff" : "#92400e",
                  letterSpacing: 0.3,
                }}
                title="Invito non ancora accettato"
              >
                PEND
              </span>
            )}
          </button>
        );
      })}

      {showUnassigned && (() => {
        const isSelected = selectedKeys.includes("_unassigned_");
        const isDimmed = filterActive && !isSelected;
        return (
          <button
            onClick={() => handleClick("_unassigned_")}
            title={isSelected ? "Click per mostrare tutti" : "Click per filtrare solo non assegnati"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px 3px 3px",
              borderRadius: 99,
              background: isSelected ? "#94a3b8" : "#f1f5f9",
              border: isSelected ? `2px solid #94a3b8` : `1px solid #cbd5e1`,
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: isDimmed ? 0.4 : 1,
              transition: "opacity 0.15s, background 0.15s",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: isSelected ? "#fff" : "#94a3b8",
                color: isSelected ? "#475569" : "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              ?
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? "#fff" : THEME.muted }}>
              Non assegnati
            </span>
          </button>
        );
      })()}

      {/* Banner "Mostra tutti" visibile solo quando un filtro è attivo */}
      {filterActive && (
        <button
          onClick={() => onToggleKey(null)}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 6,
            background: THEME.panelSoft,
            border: `1px solid ${THEME.border}`,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 600,
            color: THEME.text,
          }}
          title="Rimuovi filtro operatore"
        >
          ✕ Mostra tutti
        </button>
      )}
    </div>
  );
}
