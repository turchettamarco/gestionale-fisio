// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/RoomLegend.tsx
// ═══════════════════════════════════════════════════════════════════════
// Legenda colori-stanze sticky, mostrata sopra il calendario quando lo
// studio è in modalità multi-stanza (multi_room_enabled=true + ≥1 stanza).
// Speculare a OperatorLegend ma con click che attiva un filtro indipendente.
//
// Comportamento:
//   - Click su un chip → filtra solo per quella stanza
//   - Click di nuovo sullo stesso chip → torna a "tutte"
//   - Combinabile con il filtro operatori (filtri additivi: AND)
//
// Mostrata in: Day, Week (tutti i layout), Roster, Mese.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME } from "../utils";

export type RoomLegendRoom = {
  id: string;
  name: string;
  color: string | null;
};

export type RoomLegendProps = {
  rooms: RoomLegendRoom[];
  /** Filtro attivo: id stanza selezionata. null = mostra tutte. */
  selectedRoomId: string | null;
  /** Callback al click. Il padre gestisce il toggle. */
  onSelectRoomId: (id: string | null) => void;
  /** Se true, mostra anche il chip "Senza stanza" (eventi con room_id null) */
  showUnassigned?: boolean;
};

export default function RoomLegend({
  rooms,
  selectedRoomId,
  onSelectRoomId,
  showUnassigned = false,
}: RoomLegendProps) {
  if (rooms.length === 0) return null;

  const filterActive = selectedRoomId !== null;

  const handleClick = (id: string) => {
    if (selectedRoomId === id) {
      onSelectRoomId(null);
    } else {
      onSelectRoomId(id);
    }
  };

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
        Stanze
      </span>

      {rooms.map((r) => {
        const color = r.color || "#94a3b8";
        const isSelected = selectedRoomId === r.id;
        const isDimmed = filterActive && !isSelected;
        return (
          <button
            key={r.id}
            onClick={() => handleClick(r.id)}
            title={isSelected ? "Click per mostrare tutte" : `Click per filtrare solo ${r.name}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 12px 3px 8px",
              borderRadius: 99,
              background: isSelected ? color : `${color}14`,
              border: isSelected ? `2px solid ${color}` : `1px solid ${color}40`,
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: isDimmed ? 0.4 : 1,
              transition: "opacity 0.15s, background 0.15s, border-color 0.15s",
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: isSelected ? "#fff" : color,
                flexShrink: 0,
                border: isSelected ? `2px solid ${color}` : "none",
                boxSizing: "border-box",
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: isSelected ? "#fff" : THEME.text,
              }}
            >
              {r.name}
            </span>
          </button>
        );
      })}

      {showUnassigned && (() => {
        const isSelected = selectedRoomId === "_no_room_";
        const isDimmed = filterActive && !isSelected;
        return (
          <button
            onClick={() => handleClick("_no_room_")}
            title={isSelected ? "Click per mostrare tutte" : "Click per filtrare solo senza stanza"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 12px 3px 8px",
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
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: isSelected ? "#fff" : "#94a3b8",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: isSelected ? "#fff" : THEME.text,
              }}
            >
              Senza stanza
            </span>
          </button>
        );
      })()}

      {filterActive && (
        <button
          onClick={() => onSelectRoomId(null)}
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 600,
            color: THEME.teal,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 6,
            fontFamily: "inherit",
          }}
        >
          Mostra tutte
        </button>
      )}
    </div>
  );
}
