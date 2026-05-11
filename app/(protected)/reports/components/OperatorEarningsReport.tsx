// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/reports/components/OperatorEarningsReport.tsx
// ═══════════════════════════════════════════════════════════════════════
// Fase R3: report sedute/ore/compensi per terapista.
//
// MOSTRA:
//   - Selettore periodo (mese/trimestre/anno corrente o personalizzato)
//   - Tabella: operatore × sedute × ore totali × compenso totale
//   - Calcolo compenso: per ogni seduta done/not_paid/confirmed,
//     somma rate_per_session × (durata_reale / durata_standard)
//
// SOLO multi-op (multi_operator_enabled = true) e visibile dal proprietario.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";

const THEME = {
  text: "#0f172a",
  textSoft: "#334155",
  muted: "#64748b",
  border: "#e2e8f0",
  panelBg: "#fff",
  panelSoft: "#f8fafc",
  teal: "#0d9488",
  blue: "#2563eb",
  green: "#16a34a",
  red: "#dc2626",
  amber: "#d97706",
};

type Period = "this_month" | "last_month" | "this_quarter" | "this_year" | "custom";

type MemberRow = {
  id: string;
  display_name: string | null;
  display_color: string | null;
  user_id: string | null;
};

type AppointmentRow = {
  id: string;
  operator_id: string | null;
  treatment_type: string | null; // key
  start_at: string;
  end_at: string;
  status: string;
};

type TreatmentRow = {
  id: string;
  key: string;
  label: string;
  duration_min: number;
};

type RateRow = {
  member_id: string;
  treatment_type_id: string;
  rate_per_session: number;
};

type OperatorStats = {
  memberId: string;
  displayName: string;
  color: string;
  sessions: number;
  hours: number;
  earnings: number;
};

function periodRange(p: Period, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date();
  switch (p) {
    case "this_month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { from, to };
    }
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const from = new Date(now.getFullYear(), q * 3, 1);
      const to = new Date(now.getFullYear(), q * 3 + 3, 1);
      return { from, to };
    }
    case "this_year": {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear() + 1, 0, 1);
      return { from, to };
    }
    case "custom": {
      const from = customFrom ? new Date(customFrom) : new Date(now.getFullYear(), 0, 1);
      const to = customTo ? new Date(new Date(customTo).getTime() + 86400000) : new Date();
      return { from, to };
    }
  }
}

function periodLabel(p: Period): string {
  switch (p) {
    case "this_month": return "Mese corrente";
    case "last_month": return "Mese scorso";
    case "this_quarter": return "Trimestre corrente";
    case "this_year": return "Anno corrente";
    case "custom": return "Personalizzato";
  }
}

function fmtEuro(n: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtHours(n: number): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " h";
}

export default function OperatorEarningsReport({ studioId }: { studioId: string }) {
  const [period, setPeriod] = useState<Period>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<OperatorStats[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null); // filtro singolo

  const range = useMemo(() => periodRange(period, customFrom, customTo), [period, customFrom, customTo]);

  const loadData = useCallback(async () => {
    if (!studioId) return;
    setLoading(true);
    setError("");
    try {
      // Query parallele
      const [membersR, appointmentsR, treatmentsR, ratesR] = await Promise.all([
        supabase
          .from("studio_members")
          .select("id, display_name, display_color, user_id, is_active")
          .eq("studio_id", studioId)
          .eq("is_active", true),
        supabase
          .from("appointments")
          .select("id, operator_id, treatment_type, start_at, end_at, status")
          .eq("studio_id", studioId)
          .in("status", ["done", "not_paid", "confirmed"])
          .gte("start_at", range.from.toISOString())
          .lt("start_at", range.to.toISOString()),
        supabase
          .from("treatment_types")
          .select("id, key, label, duration_min")
          .eq("studio_id", studioId),
        supabase
          .from("operator_treatment_rates")
          .select("member_id, treatment_type_id, rate_per_session")
          .eq("studio_id", studioId),
      ]);

      if (membersR.error) throw new Error("Membri: " + membersR.error.message);
      if (appointmentsR.error) throw new Error("Appuntamenti: " + appointmentsR.error.message);
      if (treatmentsR.error) throw new Error("Trattamenti: " + treatmentsR.error.message);
      if (ratesR.error) throw new Error("Tariffe: " + ratesR.error.message);

      const members = (membersR.data || []) as MemberRow[];
      const appts = (appointmentsR.data || []) as AppointmentRow[];
      const treatments = (treatmentsR.data || []) as TreatmentRow[];
      const rates = (ratesR.data || []) as RateRow[];

      // Indici di lookup
      // member: user_id → studio_members.id (per join con appointment.operator_id che è user_id)
      const memberByUserId = new Map<string, MemberRow>();
      const memberById = new Map<string, MemberRow>();
      for (const m of members) {
        if (m.user_id) memberByUserId.set(m.user_id, m);
        memberById.set(m.id, m);
      }
      // treatment: key → row
      const treatmentByKey = new Map<string, TreatmentRow>();
      const treatmentById = new Map<string, TreatmentRow>();
      for (const t of treatments) {
        treatmentByKey.set(t.key, t);
        treatmentById.set(t.id, t);
      }
      // rate: (member_id, treatment_type_id) → rate
      const rateMap = new Map<string, number>();
      for (const r of rates) {
        rateMap.set(`${r.member_id}|${r.treatment_type_id}`, Number(r.rate_per_session));
      }

      // Aggrega
      const agg = new Map<string, OperatorStats>();
      for (const m of members) {
        agg.set(m.id, {
          memberId: m.id,
          displayName: m.display_name || "—",
          color: m.display_color || "#94a3b8",
          sessions: 0,
          hours: 0,
          earnings: 0,
        });
      }
      // Slot "Non assegnati" per appuntamenti con operator_id null
      const UNASSIGNED_KEY = "_unassigned_";
      agg.set(UNASSIGNED_KEY, {
        memberId: UNASSIGNED_KEY,
        displayName: "Non assegnati",
        color: "#94a3b8",
        sessions: 0,
        hours: 0,
        earnings: 0,
      });

      for (const a of appts) {
        const opMember = a.operator_id ? memberByUserId.get(a.operator_id) : null;
        const slot = opMember ? agg.get(opMember.id) : agg.get(UNASSIGNED_KEY);
        if (!slot) continue;

        // Calcola durata reale in minuti
        const startMs = new Date(a.start_at).getTime();
        const endMs = new Date(a.end_at).getTime();
        const durMin = Math.max(0, (endMs - startMs) / 60000);

        slot.sessions += 1;
        slot.hours += durMin / 60;

        // Calcola compenso: rate × (durMin / std_duration)
        if (opMember && a.treatment_type) {
          const tt = treatmentByKey.get(a.treatment_type);
          if (tt) {
            const rate = rateMap.get(`${opMember.id}|${tt.id}`);
            if (rate !== undefined && tt.duration_min > 0) {
              slot.earnings += rate * (durMin / tt.duration_min);
            }
          }
        }
      }

      // Lista finale: ordinata per nome, "Non assegnati" in fondo solo se ha sedute
      const list = Array.from(agg.values())
        .filter(s => s.memberId !== UNASSIGNED_KEY || s.sessions > 0)
        .sort((a, b) => {
          if (a.memberId === UNASSIGNED_KEY) return 1;
          if (b.memberId === UNASSIGNED_KEY) return -1;
          return a.displayName.localeCompare(b.displayName);
        });

      setStats(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore caricamento dati");
    } finally {
      setLoading(false);
    }
  }, [studioId, range]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = selectedMemberId
    ? stats.filter(s => s.memberId === selectedMemberId)
    : stats;

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, s) => ({
        sessions: acc.sessions + s.sessions,
        hours: acc.hours + s.hours,
        earnings: acc.earnings + s.earnings,
      }),
      { sessions: 0, hours: 0, earnings: 0 }
    );
  }, [filtered]);

  return (
    <section style={{
      background: THEME.panelBg,
      border: `1px solid ${THEME.border}`,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: THEME.text, marginBottom: 2 }}>
            Sedute, ore e compensi per terapista
          </div>
          <div style={{ fontSize: 12, color: THEME.muted }}>
            Sedute eseguite, confermate e non pagate nel periodo selezionato. Compenso calcolato proporzionalmente alla durata.
          </div>
        </div>
      </div>

      {/* Selettore periodo */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(["this_month", "last_month", "this_quarter", "this_year", "custom"] as Period[]).map(p => {
          const active = period === p;
          return (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                background: active ? THEME.teal : "#fff",
                color: active ? "#fff" : THEME.text,
                border: `1px solid ${active ? THEME.teal : THEME.border}`,
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {periodLabel(p)}
            </button>
          );
        })}
      </div>

      {/* Range custom */}
      {period === "custom" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: THEME.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
            Da
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ padding: "4px 8px", fontSize: 12, fontWeight: 600, color: "#0f172a", border: `1px solid ${THEME.border}`, borderRadius: 6, fontFamily: "inherit" }}
            />
          </label>
          <label style={{ fontSize: 12, color: THEME.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
            A
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ padding: "4px 8px", fontSize: 12, fontWeight: 600, color: "#0f172a", border: `1px solid ${THEME.border}`, borderRadius: 6, fontFamily: "inherit" }}
            />
          </label>
        </div>
      )}

      {/* Filtro operatore */}
      {stats.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", marginRight: 4 }}>Filtra:</span>
          <button
            onClick={() => setSelectedMemberId(null)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              background: selectedMemberId === null ? "#0f172a" : "#fff",
              color: selectedMemberId === null ? "#fff" : THEME.text,
              border: `1px solid ${THEME.border}`,
              borderRadius: 99,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Tutti
          </button>
          {stats.map(s => (
            <button
              key={s.memberId}
              onClick={() => setSelectedMemberId(s.memberId === selectedMemberId ? null : s.memberId)}
              style={{
                padding: "4px 10px 4px 8px",
                fontSize: 11,
                fontWeight: 600,
                background: selectedMemberId === s.memberId ? s.color : `${s.color}14`,
                color: selectedMemberId === s.memberId ? "#fff" : THEME.text,
                border: `1px solid ${s.color}40`,
                borderRadius: 99,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: selectedMemberId === s.memberId ? "#fff" : s.color, flexShrink: 0 }} />
              {s.displayName}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 6, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: THEME.muted, fontSize: 13 }}>
          Caricamento…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: THEME.muted, fontSize: 13 }}>
          Nessun dato nel periodo selezionato.
        </div>
      ) : (
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: THEME.panelSoft }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${THEME.border}` }}>Terapista</th>
                <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${THEME.border}` }}>Sedute</th>
                <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${THEME.border}` }}>Ore</th>
                <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${THEME.border}` }}>Compenso</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.memberId} style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: "12px", color: THEME.text, fontWeight: 600 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                      {s.displayName}
                    </span>
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: THEME.text, fontWeight: 600 }}>{s.sessions}</td>
                  <td style={{ padding: "12px", textAlign: "right", color: THEME.text, fontWeight: 600 }}>{fmtHours(s.hours)}</td>
                  <td style={{ padding: "12px", textAlign: "right", color: THEME.green, fontWeight: 800 }}>{fmtEuro(s.earnings)}</td>
                </tr>
              ))}
              {/* Totale */}
              <tr style={{ background: THEME.panelSoft, fontWeight: 800 }}>
                <td style={{ padding: "12px", color: THEME.text }}>TOTALE</td>
                <td style={{ padding: "12px", textAlign: "right", color: THEME.text }}>{totals.sessions}</td>
                <td style={{ padding: "12px", textAlign: "right", color: THEME.text }}>{fmtHours(totals.hours)}</td>
                <td style={{ padding: "12px", textAlign: "right", color: THEME.green }}>{fmtEuro(totals.earnings)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
