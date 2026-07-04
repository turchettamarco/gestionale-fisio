"use client";
// app/(protected)/components/dashboard/DayTimeline.tsx
// ═══════════════════════════════════════════════════════════════════════
// "🕒 La tua giornata" — la giornata come timeline oraria visuale:
//   • ogni appuntamento è un blocco colorato per stato, posizionato
//     sull'asse delle ore (corsie automatiche se si sovrappongono)
//   • la linea rossa dell'ADESSO avanza da sola (tick 30s)
//   • click su un blocco → salta alla riga in agenda e la espande
//   • rispetta la Modalità Privacy (iniziali mascherate)
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { THEME } from "./shared/theme";
import { fmtTime, patientName, pickPatient } from "./shared/utils";
import { usePrivacyMode, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import type { AppointmentRow } from "./shared/types";

const STATUS_BG: Record<string, string> = {
  done: "#16a34a",
  confirmed: "#2563eb",
  booked: "#0d9488",
  not_paid: "#dc2626",
};

export default function DayTimeline({ appts, onSelect }: {
  appts: AppointmentRow[];
  onSelect: (id: string) => void;
}) {
  const { privacyMode } = usePrivacyMode();
  const { maskInitial } = usePrivacyDisplay();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const items = useMemo(
    () => appts
      .filter(a => a.status !== "cancelled")
      .map(a => ({ a, s: new Date(a.start_at), e: new Date(a.end_at) }))
      .sort((x, y) => x.s.getTime() - y.s.getTime()),
    [appts]
  );

  // Range orario: copre 8–20 e si allarga se servono ore extra
  const { startH, endH } = useMemo(() => {
    let s = 8, e = 20;
    for (const it of items) {
      s = Math.min(s, it.s.getHours());
      e = Math.max(e, it.e.getMinutes() > 0 ? it.e.getHours() + 1 : it.e.getHours());
    }
    return { startH: Math.max(6, s), endH: Math.min(22, Math.max(e, s + 6)) };
  }, [items]);

  const span = (endH - startH) * 60;
  const pct = (d: Date) =>
    Math.min(100, Math.max(0, ((d.getHours() * 60 + d.getMinutes() - startH * 60) / span) * 100));

  // Corsie: greedy anti-sovrapposizione
  const lanes = useMemo(() => {
    const laneEnd: number[] = [];
    return items.map(it => {
      let lane = laneEnd.findIndex(end => end <= it.s.getTime());
      if (lane === -1) { lane = laneEnd.length; laneEnd.push(0); }
      laneEnd[lane] = it.e.getTime();
      return { ...it, lane };
    });
  }, [items]);
  const laneCount = Math.max(1, ...lanes.map(l => l.lane + 1));
  const trackH = 16 + laneCount * 34;

  const nowPct = pct(now);
  const nowVisible = now.getHours() >= startH && now.getHours() < endH;

  const initialsOf = (a: AppointmentRow) => {
    if (privacyMode) return maskInitial(pickPatient(a.patients));
    const n = patientName(a.patients).trim().split(/\s+/);
    return ((n[0]?.[0] ?? "") + (n[1]?.[0] ?? "")).toUpperCase() || "?";
  };

  return (
    <div style={{ background: "var(--fh-card)", border: `1px solid ${THEME.border}`, borderRadius: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.05)", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${THEME.border}`, background: "linear-gradient(135deg,rgba(13,148,136,0.045),rgba(37,99,235,0.045))", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: 9, background: "linear-gradient(135deg,rgba(13,148,136,0.14),rgba(37,99,235,0.14))", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🕒</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: THEME.text }}>La tua giornata</span>
        </span>
        <span style={{ display: "inline-flex", gap: 10, fontSize: 10.5, fontWeight: 600, color: "var(--fh-mut)" }}>
          <span>🟢 fatta</span><span>🔵 confermata</span><span>🟦 prenotata</span>
        </span>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: "18px 16px", fontSize: 12, color: "var(--fh-mut)", textAlign: "center" }}>
          Nessuna seduta in programma oggi — la timeline si popolerà da sola. ✨
        </div>
      ) : (
        <div style={{ padding: "12px 16px 10px" }}>
          <div style={{ position: "relative", height: trackH, background: "var(--fh-soft)", borderRadius: 12, border: `1px solid ${THEME.border}` }}>
            {/* Griglia ore */}
            {Array.from({ length: endH - startH + 1 }, (_, i) => startH + i).map(h => (
              <div key={h} style={{ position: "absolute", left: `${((h - startH) * 60 / span) * 100}%`, top: 0, bottom: 0 }}>
                <div style={{ width: 1, height: "100%", background: h % 2 === 0 ? "#e8edf5" : "transparent" }} />
                {h % 2 === 0 && (
                  <div style={{ position: "absolute", top: 2, left: 3, fontSize: 9, fontWeight: 600, color: "var(--fh-faint)" }}>{h}:00</div>
                )}
              </div>
            ))}

            {/* Blocchi appuntamento */}
            {lanes.map(({ a, s, e, lane }) => {
              const left = pct(s);
              const width = Math.max(3.5, pct(e) - left);
              const bg = STATUS_BG[a.status] ?? "#64748b";
              const isPast = e < now && a.status !== "done";
              return (
                <button
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  title={`${fmtTime(a.start_at)}–${fmtTime(a.end_at)} · ${privacyMode ? initialsOf(a) : patientName(a.patients)}${a.treatment_type ? ` · ${a.treatment_type}` : ""}`}
                  style={{
                    position: "absolute", left: `${left}%`, width: `${width}%`,
                    top: 14 + lane * 34, height: 28,
                    borderRadius: 8, border: "none", cursor: "pointer",
                    background: bg, opacity: isPast ? 0.55 : 1,
                    color: "#fff", fontWeight: 700, fontSize: 10.5,
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "0 8px", overflow: "hidden", whiteSpace: "nowrap",
                    boxShadow: "0 2px 6px rgba(15,23,42,0.18)",
                  }}
                >
                  <span style={{ opacity: 0.85, fontWeight: 600 }}>{fmtTime(a.start_at)}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{initialsOf(a)}</span>
                  {a.location === "domicile" && <span style={{ fontSize: 10 }}>🚗</span>}
                </button>
              );
            })}

            {/* Linea ADESSO */}
            {nowVisible && (
              <div style={{ position: "absolute", left: `${nowPct}%`, top: 0, bottom: 0, width: 2, background: "#ef4444", borderRadius: 2, zIndex: 3 }}>
                <div style={{ position: "absolute", top: -4, left: -3.5, width: 9, height: 9, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 0 3px rgba(239,68,68,0.25)" }} />
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: "var(--fh-faint)", marginTop: 6, textAlign: "center" }}>
            Clicca un blocco per aprirlo in agenda · la linea rossa è l&apos;adesso
          </div>
        </div>
      )}
    </div>
  );
}
