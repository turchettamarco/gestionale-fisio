// app/(protected)/components/dashboard/shared/StatusPill.tsx
// ═══════════════════════════════════════════════════════════════════════
// Pillola di stato appuntamento + hook useCountdown.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState } from "react";
import { THEME } from "./theme";
import type { Status } from "./types";

export function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; color: string; bg: string }> = {
    done:      { label: "Eseguito",   color: THEME.green, bg: "rgba(22,163,74,0.10)"  },
    confirmed: { label: "Confermato", color: THEME.blue,  bg: "rgba(37,99,235,0.10)"  },
    booked:    { label: "Prenotato",  color: THEME.teal,  bg: "rgba(13,148,136,0.10)" },
    cancelled: { label: "Annullato",  color: THEME.gray,  bg: "rgba(148,163,184,0.12)" },
    not_paid:  { label: "Non pagato", color: THEME.amber, bg: "rgba(249,115,22,0.10)" },
  };
  const m = map[status] ?? { label: status, color: THEME.gray, bg: "rgba(148,163,184,0.12)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 8px", borderRadius: 5,
      fontSize: 11, fontWeight: 700,
      background: m.bg, color: m.color,
      whiteSpace: "nowrap",
    }}>
      {m.label}
    </span>
  );
}

export function useCountdown(targetISO: string | null): string {
  const [t, setT] = useState("");
  useEffect(() => {
    if (!targetISO) { setT(""); return; }
    const target = new Date(targetISO).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setT("adesso"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setT(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [targetISO]);
  return t;
}
