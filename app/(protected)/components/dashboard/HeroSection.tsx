// app/(protected)/components/dashboard/HeroSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Banner hero in alto con saluto, data, contatore sedute e 4 KPI card.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import Link from "next/link";
import { fmtTime, money, patientName, pickPatient } from "./shared/utils";
import { usePrivacyMode, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import type { AppointmentRow } from "./shared/types";

export type HeroSectionProps = {
  loading: boolean;
  todayDone: number;
  todayTotal: number;
  todayPct: number;
  todayIncassato: number;
  todayExpected: number;
  focusNext: AppointmentRow | null;
  nextCountdown: string;
  remindersToSend: AppointmentRow[];
  tomorrowAppts: AppointmentRow[];
};

export default function HeroSection(p: HeroSectionProps) {
  const { privacyMode } = usePrivacyMode();
  const { maskName } = usePrivacyDisplay();
  const kpis = [
    {
      label: "Eseguite",
      value: `${p.todayDone}/${p.todayTotal}`,
      sub:   p.todayTotal > 0 ? `${p.todayPct}%` : "—",
      highlight: p.todayPct === 100 && p.todayTotal > 0,
    },
    {
      label: "Incassato",
      value: money(p.todayIncassato),
      sub:   p.todayExpected > p.todayIncassato
              ? `manca ${money(p.todayExpected - p.todayIncassato)}`
              : "tutto incassato",
      highlight: false,
    },
    {
      label: "Prossimo",
      value: p.focusNext ? fmtTime(p.focusNext.start_at) : "—",
      sub:   p.focusNext ? (p.nextCountdown || (privacyMode ? maskName(pickPatient(p.focusNext.patients)) : patientName(p.focusNext.patients))) : "nessun appuntamento",
      highlight: false,
    },
    {
      label: "WA domani",
      value: String(p.remindersToSend.length),
      sub:   p.remindersToSend.length === 0 ? "tutti inviati" : `su ${p.tomorrowAppts.length} totali`,
      highlight: p.remindersToSend.length > 0,
    },
  ];

  return (
    <div style={{ background: "linear-gradient(135deg, #0c4a6e 0%, #0d9488 50%, #0f766e 100%)", padding: "28px 28px 0", position: "relative", overflow: "hidden" }}>
      {/* Decorazioni di sfondo */}
      <div style={{ position: "absolute", top: -60, right: -60, width: 320, height: 320, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -40, left: "30%", width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.03)", pointerEvents: "none" }} />

      {/* Greeting + data */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.65)", marginBottom: 4, letterSpacing: 0.3 }}>
            {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase())}
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: -0.8, lineHeight: 1.1 }}>
            {p.loading
              ? "Caricamento…"
              : p.todayTotal === 0
                ? "Nessuna seduta oggi"
                : `${p.todayTotal} sedut${p.todayTotal === 1 ? "a" : "e"} oggi`}
          </h1>
        </div>
        <Link href="/calendar?new=1" style={{ padding: "10px 20px", borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, backdropFilter: "blur(4px)" }}>
          + Nuovo appuntamento
        </Link>
      </div>

      {/* KPI row */}
      {!p.loading && (
        <div className="kpi-grid" style={{ display: "flex", gap: 0, flexWrap: "wrap", marginBottom: 0 }}>
          {kpis.map((k, i) => (
            <div key={k.label} style={{
              flex: "1 1 160px",
              padding: "16px 20px 20px",
              borderRight: i < 3 ? "1px solid rgba(255,255,255,0.10)" : "none",
              minWidth: 0,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: k.highlight ? "#86efac" : "#fff", lineHeight: 1, marginBottom: 4, letterSpacing: -0.5 }}>{k.value}</div>
              <div style={{ fontSize: 12, color: k.highlight ? "#86efac" : "rgba(255,255,255,0.55)", fontWeight: 500 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar sul fondo dell'hero */}
      {!p.loading && p.todayTotal > 0 && (
        <div style={{ height: 4, background: "rgba(255,255,255,0.12)", borderRadius: 0, overflow: "hidden", marginLeft: -28, marginRight: -28 }}>
          <div style={{ height: "100%", width: `${p.todayPct}%`, background: "rgba(134,239,172,0.8)", transition: "width 0.5s ease" }} />
        </div>
      )}
    </div>
  );
}
