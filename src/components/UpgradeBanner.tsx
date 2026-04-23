// ═══════════════════════════════════════════════════════════════════════
// src/components/UpgradeBanner.tsx
// ═══════════════════════════════════════════════════════════════════════
// Banner in cima al gestionale che appare quando l'utente è vicino o
// ha superato un limite del suo piano.
//
// Stati visivi:
//   - near (80-99%):  blu/info "Stai per raggiungere il limite"
//   - over soft:      arancione "Hai superato il limite, puoi continuare"
//   - over hard:      rosso "Limite raggiunto, blocca l'azione"
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { usePlanLimits, type LimitCheck } from "@/src/hooks/usePlanLimits";
import UpgradeButtons from "./UpgradeButtons";

const LABELS: Record<string, string> = {
  patients: "pazienti",
  appointments: "appuntamenti questo mese",
  operators: "operatori",
};

type Props = {
  /** Se true, banner sempre visibile (anche quando "ok"). Default false. */
  alwaysVisible?: boolean;
  /** Se true, il banner è più compatto (usato nelle pagine interne). */
  compact?: boolean;
};

export default function UpgradeBanner({ alwaysVisible = false, compact = false }: Props) {
  const limits = usePlanLimits();

  // Nascondi mentre carica per evitare flash
  if (limits.loading) return null;
  if (!limits.plan) return null;

  // Trova il check più critico
  const entries = Object.entries(limits.checks) as [string, LimitCheck][];
  const over = entries.filter(([, c]) => c.status === "over");
  const near = entries.filter(([, c]) => c.status === "near");

  // Priorità: over-hard > over-soft > near
  const criticalOverHard = over.find(([, c]) => c.mode === "hard");
  const criticalOverSoft = over.find(([, c]) => c.mode === "soft");
  const criticalNear = near[0];

  const critical = criticalOverHard ?? criticalOverSoft ?? criticalNear;

  if (!critical && !alwaysVisible) return null;
  if (!critical) return null;

  const [key, check] = critical;
  const label = LABELS[key] ?? key;
  const isOverHard = check.status === "over" && check.mode === "hard";
  const isOverSoft = check.status === "over" && check.mode === "soft";
  // isNear is implied when not overHard and not overSoft (the remaining case)

  const colors = isOverHard
    ? { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b", accent: "#dc2626", badgeBg: "#dc2626" }
    : isOverSoft
    ? { bg: "#ffedd5", border: "#fdba74", text: "#9a3412", accent: "#ea580c", badgeBg: "#ea580c" }
    : { bg: "#dbeafe", border: "#93c5fd", text: "#1e40af", accent: "#2563eb", badgeBg: "#2563eb" };

  const title = isOverHard
    ? `Hai raggiunto il limite di ${label}`
    : isOverSoft
    ? `Hai superato il limite di ${label}`
    : `Stai per raggiungere il limite di ${label}`;

  const body = isOverHard
    ? `Il tuo piano ${limits.plan.plan_name ?? ""} include fino a ${check.max} ${label}. Per creare nuovi ${label} serve un piano superiore.`
    : isOverSoft
    ? `Stai usando ${check.used} ${label} sul limite di ${check.max} del piano ${limits.plan.plan_name ?? ""}. Puoi continuare, ma valuta l'upgrade.`
    : `Stai usando ${check.used} ${label} su ${check.max} disponibili (${check.percent}%).`;

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: compact ? "10px 12px" : "14px 16px",
        marginBottom: 14,
        display: "flex",
        alignItems: compact ? "center" : "flex-start",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      {/* Icona */}
      <div
        style={{
          width: compact ? 24 : 32,
          height: compact ? 24 : 32,
          borderRadius: "50%",
          background: colors.badgeBg,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compact ? 13 : 16,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        !
      </div>

      {/* Testo */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div
          style={{
            fontSize: compact ? 13 : 14,
            fontWeight: 700,
            color: colors.text,
            marginBottom: 3,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: compact ? 12 : 13, color: colors.text, lineHeight: 1.5 }}>
          {body}
        </div>

        {/* Barra riempimento */}
        {check.max !== null && !compact && (
          <div
            style={{
              marginTop: 8,
              background: "rgba(0,0,0,0.08)",
              borderRadius: 4,
              height: 6,
              overflow: "hidden",
              maxWidth: 360,
            }}
          >
            <div
              style={{
                width: `${Math.min(check.percent, 100)}%`,
                height: "100%",
                background: colors.accent,
                transition: "width 0.3s",
              }}
            />
          </div>
        )}
      </div>

      {/* CTA pulsanti */}
      <div style={{ flexShrink: 0 }}>
        <UpgradeButtons
          size={compact ? "sm" : "md"}
          currentPlan={limits.plan.plan_name ?? undefined}
        />
      </div>
    </div>
  );
}
