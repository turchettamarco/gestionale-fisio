// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/views/GroupEventCard.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Rendering speciale per gli eventi di gruppo (mig. 014).
// Sostituisce il contenuto della card quando event.is_group === true.
//
// Si adatta a 3 livelli di altezza (come gli eventi singoli):
//   • isShort  (< 38px)  → 1 riga compatta: ora + titolo + count
//   • isMedium (38–55px) → 2 righe: titolo+count / avatar + totale
//   • full     (≥ 56px)  → 3 righe: ora+badge / titolo / avatar+totale
//
// Colori: il gradient teal-to-cyan distingue immediatamente i gruppi
// dagli appuntamenti singoli (che usano statusBg).
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import type { CalendarEvent } from "../../utils";
import { fmtTime } from "../../utils";

export type GroupEventCardProps = {
  event: CalendarEvent;
  /** Altezza disponibile per la card (px) */
  cardH: number;
};

// Palette pastello per gli avatar dei partecipanti.
// Stesso paziente → stesso colore (deterministico via hash).
const AVATAR_COLORS: Array<{ bg: string; fg: string }> = [
  { bg: "#fbbf24", fg: "#78350f" },
  { bg: "#f472b6", fg: "#831843" },
  { bg: "#60a5fa", fg: "#1e3a8a" },
  { bg: "#a78bfa", fg: "#4c1d95" },
  { bg: "#34d399", fg: "#064e3b" },
  { bg: "#fb923c", fg: "#7c2d12" },
  { bg: "#22d3ee", fg: "#164e63" },
  { bg: "#f87171", fg: "#7f1d1d" },
];

function colorForPatient(patientId: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < patientId.length; i++) {
    hash = (hash * 31 + patientId.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsOf(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName ?? "").trim()[0] ?? "";
  const l = (lastName ?? "").trim()[0] ?? "";
  return (l + f).toUpperCase() || "?";
}

export default function GroupEventCard({ event, cardH }: GroupEventCardProps) {
  // Soglie altezza:
  //   • short  (< 38px)  → 1 riga compatta
  //   • medium (38–70px) → 2 righe (titolo + avatar/totale)
  //   • full   (≥ 70px)  → 3 righe (badge esteso + titolo grande + avatar)
  // La soglia medium → full è 70px (non 56) perché serve spazio verticale
  // per non sovrapporre il titolo agli avatar.
  const isShort = cardH < 38;
  const isMedium = !isShort && cardH < 70;

  const participants = event.participants ?? [];
  const count = participants.length;
  const max = event.group_max_participants ?? 0;
  const pricePP = event.group_price_per_person ?? 0;
  const total = participants.reduce((sum, p) => sum + (Number(p.price) || 0), 0)
    || (count * pricePP); // fallback se i prezzi individuali sono 0
  const paidCount = participants.filter((p) => p.payment_status === "paid").length;
  const title = event.group_title || event.title || "Gruppo";

  // Avatar visibili: max 5, poi "+N"
  const visibleAvatars = participants.slice(0, 5);
  const overflow = Math.max(0, count - visibleAvatars.length);

  // ─── LAYOUT COMPATTO (≤30 min) ─────────────────────────────────────
  if (isShort) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden", height: "100%" }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.85)", flexShrink: 0, lineHeight: 1 }}>
          {fmtTime(event.start.toISOString())}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#fff",
          background: "rgba(255,255,255,0.3)", padding: "1px 5px",
          borderRadius: 99, flexShrink: 0,
        }}>
          👥 {count}/{max}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1, minWidth: 0,
        }}>
          {title}
        </span>
        <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.95)", flexShrink: 0 }}>
          €{total.toFixed(0)}
        </span>
      </div>
    );
  }

  // ─── LAYOUT MEDIO (45–70 min) ─────────────────────────────────────
  if (isMedium) {
    return (
      <>
        {/* Riga 1: ora + badge gruppo + €totale (compatto) */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden", flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.85)", lineHeight: 1, flexShrink: 0 }}>
            {fmtTime(event.start.toISOString())}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#fff",
            background: "rgba(255,255,255,0.3)", padding: "1px 5px",
            borderRadius: 99, flexShrink: 0,
          }}>
            👥 {count}/{max}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", flexShrink: 0 }}>
            €{total.toFixed(0)}
          </span>
        </div>

        {/* Riga 2: titolo (su riga propria, no avatar che lo coprono) */}
        <div style={{
          fontSize: 12, fontWeight: 700, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginTop: 2, lineHeight: 1.2,
        }}>
          {title}
        </div>

        {/* Riga 3: avatar (in fondo, separati dal titolo) */}
        {count > 0 && (
          <div style={{
            display: "flex", alignItems: "center", overflow: "hidden",
            marginTop: "auto", paddingTop: 2,
          }}>
            {visibleAvatars.map((p, idx) => {
              const c = colorForPatient(p.patient_id);
              return (
                <div
                  key={p.id}
                  style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: c.bg, color: c.fg,
                    fontSize: 7, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "1.5px solid #fff",
                    marginRight: idx < visibleAvatars.length - 1 ? -5 : 0,
                    flexShrink: 0, zIndex: visibleAvatars.length - idx,
                  }}
                >
                  {initialsOf(p.patient_first_name, p.patient_last_name)}
                </div>
              );
            })}
            {overflow > 0 && (
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.85)", marginLeft: 4, flexShrink: 0 }}>
                +{overflow}
              </span>
            )}
          </div>
        )}
      </>
    );
  }

  // ─── LAYOUT FULL (≥60 min) ─────────────────────────────────────────
  return (
    <>
      {/* Riga 1: ora + badge GRUPPO con conteggio + totale */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, flexShrink: 0, marginBottom: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.85)", lineHeight: 1, flexShrink: 0 }}>
            {fmtTime(event.start.toISOString())}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, color: "#fff",
            background: "rgba(255,255,255,0.3)", padding: "1px 6px",
            borderRadius: 99, flexShrink: 0, letterSpacing: 0.3,
          }}>
            👥 GRUPPO · {count}/{max}
          </span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
          background: "rgba(255,255,255,0.2)", padding: "1px 6px", borderRadius: 4,
        }}>
          €{total.toFixed(0)}
        </span>
      </div>

      {/* Riga 2: titolo del gruppo */}
      <div style={{
        fontWeight: 700, fontSize: 13, color: "#fff", lineHeight: 1.2,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {title}
      </div>

      {/* Riga 3: avatar partecipanti + info pagati */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: "auto", gap: 4, paddingTop: 2,
      }}>
        <div style={{ display: "flex", alignItems: "center", overflow: "hidden", flex: 1 }}>
          {visibleAvatars.map((p, idx) => {
            const c = colorForPatient(p.patient_id);
            const isPaid = p.payment_status === "paid";
            return (
              <div
                key={p.id}
                title={`${p.patient_first_name ?? ""} ${p.patient_last_name ?? ""} · ${isPaid ? "Pagato" : "Da pagare"}`}
                style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: c.bg, color: c.fg,
                  fontSize: 8, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `2px solid ${isPaid ? "#10b981" : "#fff"}`,
                  marginRight: idx < visibleAvatars.length - 1 ? -6 : 0,
                  flexShrink: 0, zIndex: visibleAvatars.length - idx,
                }}
              >
                {initialsOf(p.patient_first_name, p.patient_last_name)}
              </div>
            );
          })}
          {overflow > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.95)",
              marginLeft: 6, flexShrink: 0,
            }}>
              +{overflow}
            </span>
          )}
          {count === 0 && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>
              Nessun partecipante
            </span>
          )}
        </div>
        {count > 0 && (
          <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.95)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {paidCount}/{count} pagati
          </span>
        )}
      </div>
    </>
  );
}
