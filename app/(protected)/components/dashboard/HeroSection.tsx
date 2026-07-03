"use client";
// app/(protected)/components/dashboard/HeroSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Header a fascia colorata: STESSO gradiente della navbar (teal→blu) così
// le due superfici si fondono in un'unica banda continua — niente stacco.
// Dentro: data, titolo, CTA e 4 KPI "glass" con progress bar sul fondo.
// Tipografia con pesi reali (max 700) per un rendering pulito.
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const router = useRouter();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);
  // Salta all'elemento della pagina e lo evidenzia per un attimo
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("fh-flash");
    setTimeout(() => el.classList.remove("fh-flash"), 1400);
  };
  const { privacyMode } = usePrivacyMode();
  const { maskName } = usePrivacyDisplay();

  const dateLabel = new Date()
    .toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    .replace(/^\w/, c => c.toUpperCase());

  const allDone = p.todayPct === 100 && p.todayTotal > 0;

  const kpis = [
    {
      icon: "✅", label: "Eseguite",
      value: `${p.todayDone}/${p.todayTotal}`,
      sub: p.todayTotal > 0 ? `${p.todayPct}% della giornata` : "nessuna seduta",
      glow: allDone, go: () => jump("fh-agenda"), hint: "Vai all'agenda",
    },
    {
      icon: "💶", label: "Incassato",
      value: money(p.todayIncassato),
      sub: p.todayExpected > p.todayIncassato
        ? `mancano ${money(p.todayExpected - p.todayIncassato)}`
        : "tutto incassato",
      glow: p.todayExpected > 0 && p.todayIncassato >= p.todayExpected, go: () => router.push("/reports"), hint: "Apri i report",
    },
    {
      icon: "⏰", label: "Prossimo",
      value: p.focusNext ? fmtTime(p.focusNext.start_at) : "—",
      sub: p.focusNext
        ? (p.nextCountdown || (privacyMode ? maskName(pickPatient(p.focusNext.patients)) : patientName(p.focusNext.patients)))
        : "nessun appuntamento",
      glow: false, go: () => jump("fh-next"), hint: "Vai al prossimo",
    },
    {
      icon: "📲", label: "Promemoria",
      value: String(p.remindersToSend.length),
      sub: p.remindersToSend.length === 0 ? "tutti inviati" : `su ${p.tomorrowAppts.length} per domani`,
      glow: false, go: () => jump("fh-actions"), hint: "Vai alle cose da fare",
    },
  ];

  return (
    <div style={{ background: "linear-gradient(135deg, #0d9488 0%, #1d4ed8 100%)", position: "relative", overflow: "hidden" }}>
      {/* Decorazioni morbide */}
      <div style={{ position: "absolute", top: -70, right: -70, width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -50, left: "28%", width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "24px 24px 0", position: "relative" }}>
        {/* Data + titolo + CTA */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.72)", marginBottom: 4 }}>
              {dateLabel}
              <span style={{ marginLeft: 10, padding: "2px 9px", borderRadius: 999, background: "rgba(255,255,255,0.15)", fontSize: 11.5, fontWeight: 700, color: "#fff" }}>
                🕐 {clock.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: -0.3, lineHeight: 1.15 }}>
              {p.loading
                ? "Caricamento…"
                : p.todayTotal === 0
                  ? "Nessuna seduta oggi"
                  : allDone
                    ? "Giornata completata 🎉"
                    : `${p.todayTotal} sedut${p.todayTotal === 1 ? "a" : "e"} oggi`}
            </h1>
          </div>
          <Link
            href="/calendar?new=1"
            style={{
              padding: "10px 18px", borderRadius: 10,
              border: "1.5px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.14)", backdropFilter: "blur(4px)",
              color: "#fff", fontWeight: 700, fontSize: 13,
              display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
            }}
          >
            + Nuovo appuntamento
          </Link>
        </div>

        {/* KPI glass */}
        {!p.loading && (
          <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, paddingBottom: 20 }}>
            {kpis.map((k) => (
              <div key={k.label} className="kpi-click" role="button" tabIndex={0} title={k.hint}
                onClick={k.go} onKeyDown={(e) => { if (e.key === "Enter") k.go(); }}
                style={{ cursor: "pointer",
                background: "rgba(255,255,255,0.12)",
                border: `1.5px solid ${k.glow ? "rgba(134,239,172,0.5)" : "rgba(255,255,255,0.20)"}`,
                borderRadius: 14, padding: "12px 14px",
                backdropFilter: "blur(4px)", minWidth: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.16)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{k.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.78)" }}>{k.label}</span>
                </div>
                <div style={{ fontSize: 21, fontWeight: 700, color: k.glow ? "#bbf7d0" : "#fff", lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {k.value}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: k.glow ? "rgba(187,247,208,0.9)" : "rgba(255,255,255,0.65)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {k.sub}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress della giornata sul fondo della fascia */}
      {!p.loading && p.todayTotal > 0 && (
        <div style={{ height: 4, background: "rgba(255,255,255,0.14)" }}>
          <div style={{ height: "100%", width: `${p.todayPct}%`, background: "rgba(134,239,172,0.85)", transition: "width 0.5s ease" }} />
        </div>
      )}
    </div>
  );
}
