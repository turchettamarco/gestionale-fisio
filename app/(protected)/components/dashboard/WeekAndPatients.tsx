"use client";
// app/(protected)/components/dashboard/WeekAndPatients.tsx
// ═══════════════════════════════════════════════════════════════════════
// Home v2 — due card compatte del rail:
//   • WeekCard: polso della settimana (sedute, incasso, delta vs scorsa)
//     + previsione dei prossimi 7 giorni. Sostituisce weekStats card +
//     ForecastAndRentalSection lato forecast.
//   • PatientsPanel: tab Inattivi / Recenti con azioni di ricontatto.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react";
import Link from "next/link";
import { THEME } from "./shared/theme";
import { fmtDate, money, openWA, patientName, pickPatient, pctDelta } from "./shared/utils";
import { usePrivacyMode, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import type { AppointmentRow, InactivePatientRow, WeekStats, ForecastRevenue } from "./shared/types";

const card: React.CSSProperties = {
  background: "var(--fh-card)", border: `1px solid ${THEME.border}`, borderRadius: 16,
  boxShadow: "0 1px 3px rgba(15,23,42,0.05)", overflow: "hidden",
};
const head: React.CSSProperties = {
  padding: "12px 16px", borderBottom: `1px solid ${THEME.border}`,
  background: "linear-gradient(135deg,rgba(13,148,136,0.045),rgba(37,99,235,0.045))",
  display: "flex", alignItems: "center", justifyContent: "space-between",
};

// ─── WeekCard ────────────────────────────────────────────────────────────

export function WeekCard({ weekStats, forecastRevenue, spark }: {
  weekStats: WeekStats;
  forecastRevenue: ForecastRevenue;
  spark?: { label: string; v: number; today: boolean }[];
}) {
  const dSess = pctDelta(weekStats.this.done, weekStats.last.done);
  const dInc  = pctDelta(weekStats.this.expected, weekStats.last.expected);
  const Delta = ({ v }: { v: number }) => (
    <span style={{ fontSize: 10.5, fontWeight: 800, color: v >= 0 ? THEME.green : THEME.red }}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v)}%
    </span>
  );

  return (
    <div style={card}>
      <div style={head}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 26, height: 26, borderRadius: 9, background: "linear-gradient(135deg,rgba(13,148,136,0.14),rgba(37,99,235,0.14))", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📈</span><span style={{ fontSize: 13.5, fontWeight: 700, color: THEME.text }}>Settimana</span></span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--fh-faint)" }}>vs scorsa</span>
      </div>
      {spark && spark.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, padding: "10px 16px 0", height: 48 }}>
          {spark.map((d, i) => {
            const max = Math.max(1, ...spark.map(x => x.v));
            const h = Math.max(3, Math.round((d.v / max) * 28));
            return (
              <div key={i} style={{ flex: 1, textAlign: "center" }} title={`${d.v} sedute fatte`}>
                <div style={{ height: h, borderRadius: 4, background: d.today ? "linear-gradient(180deg,#0d9488,#2563eb)" : "rgba(37,99,235,0.20)", transition: "height 0.3s" }} />
                <div style={{ fontSize: 9, color: "var(--fh-faint)", marginTop: 3, fontWeight: 600 }}>{d.label}</div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fh-mut)" }}>Sedute fatte</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--fh-ink)", marginTop: 3 }}>
            {weekStats.this.done} <Delta v={dSess} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fh-mut)" }}>Incasso</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--fh-ink)", marginTop: 3 }}>
            {money(weekStats.this.expected)} <Delta v={dInc} />
          </div>
        </div>
      </div>
      <div style={{ padding: "10px 16px", background: "var(--fh-soft)", borderTop: `1px solid ${THEME.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fh-mut)" }}>🔮 Prossimi {forecastRevenue.days} gg</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: THEME.teal }}>
          {money(forecastRevenue.total)} <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fh-faint)" }}>({forecastRevenue.sessCount} sedute)</span>
        </span>
      </div>
    </div>
  );
}

// ─── PatientsPanel ───────────────────────────────────────────────────────

export function PatientsPanel(p: {
  inactiveThreshold: 30 | 45 | 60;
  setInactiveThreshold: (v: 30 | 45 | 60) => void;
  inactiveLoading: boolean;
  inactivePatients: InactivePatientRow[];
  contactedPatients: Set<string>;
  setContactedPatients: React.Dispatch<React.SetStateAction<Set<string>>>;
  recentPatients: AppointmentRow[];
}) {
  const [tab, setTab] = useState<"inactive" | "recent">("inactive");
  const { privacyMode } = usePrivacyMode();
  const { maskName } = usePrivacyDisplay();

  const contactInactive = (r: InactivePatientRow) => {
    if (!r.phone) return;
    openWA(r.phone, `Ciao ${r.first_name}! È da un po' che non ci vediamo in studio: come va? Se vuoi fare un controllo o riprendere il percorso, scrivimi pure e troviamo un orario. 🙂`);
    p.setContactedPatients(prev => new Set(prev).add(r.patient_id));
  };

  const tabBtn = (id: "inactive" | "recent", label: string): React.CSSProperties => ({
    flex: 1, padding: "7px 4px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
    border: "none", borderBottom: tab === id ? `2px solid ${THEME.blue}` : "2px solid transparent",
    background: "transparent", color: tab === id ? THEME.blue : "#94a3b8",
  });

  return (
    <div style={card}>
      <div style={{ ...head, paddingBottom: 0, borderBottom: "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 26, height: 26, borderRadius: 9, background: "linear-gradient(135deg,rgba(13,148,136,0.14),rgba(37,99,235,0.14))", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>👥</span><span style={{ fontSize: 13.5, fontWeight: 700, color: THEME.text }}>Pazienti</span></span>
        {tab === "inactive" && (
          <select
            value={p.inactiveThreshold}
            onChange={e => p.setInactiveThreshold(Number(e.target.value) as 30 | 45 | 60)}
            style={{ fontSize: 10.5, fontWeight: 700, color: "var(--fh-mut)", border: `1px solid ${THEME.border}`, borderRadius: 6, padding: "2px 6px", background: "var(--fh-card)" }}
          >
            <option value={30}>30+ gg</option>
            <option value={45}>45+ gg</option>
            <option value={60}>60+ gg</option>
          </select>
        )}
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${THEME.border}`, padding: "0 10px", marginTop: 6 }}>
        <button style={tabBtn("inactive", "")} onClick={() => setTab("inactive")}>
          Da ricontattare{p.inactivePatients.length > 0 ? ` (${p.inactivePatients.length})` : ""}
        </button>
        <button style={tabBtn("recent", "")} onClick={() => setTab("recent")}>Recenti</button>
      </div>

      {tab === "inactive" ? (
        p.inactiveLoading ? (
          <div style={{ padding: 16, fontSize: 11.5, color: "var(--fh-mut)", textAlign: "center" }}>Caricamento…</div>
        ) : p.inactivePatients.length === 0 ? (
          <div style={{ padding: "16px 14px", fontSize: 11.5, color: "var(--fh-mut)", textAlign: "center" }}>
            Nessun paziente fermo da {p.inactiveThreshold}+ giorni 👏
          </div>
        ) : (
          <div>
            {p.inactivePatients.slice(0, 6).map((r, i) => {
              const contacted = p.contactedPatients.has(r.patient_id);
              const name = privacyMode ? maskName({ first_name: r.first_name, last_name: r.last_name }) : `${r.first_name} ${r.last_name}`;
              return (
                <div key={r.patient_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: i < Math.min(p.inactivePatients.length, 6) - 1 ? `1px solid ${THEME.border}` : "none", opacity: contacted ? 0.5 : 1 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Link href={`/patients/${r.patient_id}`} style={{ fontSize: 12, fontWeight: 700, color: THEME.text, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </Link>
                    <div style={{ fontSize: 10.5, color: "var(--fh-faint)" }}>{r.days_since_last} giorni fa</div>
                  </div>
                  {contacted ? (
                    <span style={{ fontSize: 10, fontWeight: 800, color: THEME.green }}>✓ contattato</span>
                  ) : r.phone ? (
                    <button onClick={() => contactInactive(r)} style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: "#25D366", color: "#fff", fontWeight: 800, fontSize: 10.5, cursor: "pointer" }}>📲</button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div>
          {p.recentPatients.length === 0 ? (
            <div style={{ padding: 16, fontSize: 11.5, color: "var(--fh-mut)", textAlign: "center" }}>Nessun paziente recente.</div>
          ) : p.recentPatients.map((a, i) => {
            const name = privacyMode ? maskName(pickPatient(a.patients)) : patientName(a.patients);
            return (
              <Link key={a.patient_id} href={`/patients/${a.patient_id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 14px", borderBottom: i < p.recentPatients.length - 1 ? `1px solid ${THEME.border}` : "none" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: THEME.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ fontSize: 10.5, color: "var(--fh-faint)", whiteSpace: "nowrap" }}>{fmtDate(a.start_at)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
