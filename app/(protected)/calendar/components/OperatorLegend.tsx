// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/OperatorLegend.tsx
// ═══════════════════════════════════════════════════════════════════════
// Legenda colori-operatori sticky, mostrata sopra il calendario quando lo
// studio è in modalità multi-operatore (multi_operator_enabled=true +
// activeMembers≥2). Aiuta l'utente a ricordare il mapping colore→nome
// senza dover aprire le impostazioni o il footer.
//
// Mostrata in TUTTE le viste multi-op: Day (DayTimelineMulti), Week
// (Classica/Timeline/Pile), Month (futura). È un "memo" persistente.
//
// Render:
//   • Riga compatta con avatar circolari colorati + nome di ogni membro
//   • Indicatore "Non assegnati" alla fine se tra gli eventi della
//     vista corrente ce ne sono senza operator_id
//   • Sticky disabilitato di default: è un blocchetto inline sopra il
//     calendario, non sticky in alto (per non sovrapporsi alla toolbar).
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
}: OperatorLegendProps) {
  const rows = members
    .map(m => ({ key: memberKey(m), member: m }))
    .filter((r): r is { key: string; member: StudioMember } => r.key !== null);

  if (rows.length === 0) return null;

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
      {rows.map(({ key, member }) => {
        const color = operatorColorMap.get(key) || "#94a3b8";
        const isPending = !member.user_id;
        const initials = (member.signature_short || member.display_name || "?")
          .substring(0, 2)
          .toUpperCase();
        return (
          <span
            key={key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px 3px 3px",
              borderRadius: 99,
              background: `${color}14`,
              border: `1px solid ${color}40`,
            }}
            title={member.display_name || ""}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: color,
                color: "#fff",
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
                color: THEME.text,
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
                  background: "#fef3c7",
                  color: "#92400e",
                  letterSpacing: 0.3,
                }}
                title="Invito non ancora accettato"
              >
                PEND
              </span>
            )}
          </span>
        );
      })}
      {showUnassigned && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 10px 3px 3px",
            borderRadius: 99,
            background: "#f1f5f9",
            border: `1px solid #cbd5e1`,
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "#94a3b8",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            ?
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: THEME.muted }}>
            Non assegnati
          </span>
        </span>
      )}
    </div>
  );
}
