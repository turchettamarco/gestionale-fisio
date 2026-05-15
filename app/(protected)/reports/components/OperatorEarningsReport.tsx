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
import { studioPdfHeader, studioHeaderCss, studioPdfFooter, type StudioHeaderData } from "@/src/lib/pdfHeader";

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
  patient_id: string | null;
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

type SessionDetail = {
  appointmentId: string;
  date: Date;
  patientName: string;
  treatmentLabel: string;
  treatmentId: string | null;       // null = treatment_type non riconosciuto
  treatmentStdDuration: number;     // duration_min std del trattamento (0 = sconosciuta)
  durationMin: number;
  earnings: number;
  status: string;
  rateMissing: boolean;             // true se tariffa non impostata per (op × trattamento)
};

type OperatorStats = {
  memberId: string;
  displayName: string;
  color: string;
  sessions: number;
  hours: number;
  earnings: number;
  details: SessionDetail[];
  /** Numero sedute con tariffa mancante (info banner) */
  missingRateSessions: number;
  /** Treatment_ids per cui manca la tariffa (per il modal "imposta tariffe mancanti") */
  missingTreatmentIds: string[];
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

function fmtDate(d: Date): string {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Apre nuova finestra con PDF compilabile/stampabile per il prospetto compensi.
function printOperatorReport({
  studio,
  operatorName,
  periodLabelStr,
  details,
  totals,
}: {
  studio: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
    logo_base64?: string | null;
    multi_operator_enabled?: boolean | null;
  } | null;
  operatorName: string;
  periodLabelStr: string;
  details: SessionDetail[];
  totals: { sessions: number; hours: number; earnings: number };
}) {
  const pw = window.open("", "_blank");
  if (!pw) {
    alert("Bloccato dal browser. Abilita i popup per stampare.");
    return;
  }
  const title = `Prospetto compensi — ${operatorName}`;
  const rows = details.map((d) => `
    <tr>
      <td>${fmtDate(d.date)}</td>
      <td>${d.date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</td>
      <td>${escHtml(d.patientName)}</td>
      <td>${escHtml(d.treatmentLabel)}</td>
      <td style="text-align:right">${Math.round(d.durationMin)} min</td>
      <td style="text-align:right">${fmtEuro(d.earnings)}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>${escHtml(title)}</title>
<style>
body {
  font-family: Arial, sans-serif;
  padding: 2cm;
  color: #0f172a;
}
.intro {
  margin: 18pt 0 10pt 0;
  padding: 12pt 14pt;
  background: #f1f5f9;
  border-left: 4px solid #0d9488;
  border-radius: 4px;
}
.intro h2 {
  margin: 0 0 4pt 0;
  font-size: 14pt;
  color: #0f172a;
}
.intro p {
  margin: 2pt 0;
  font-size: 10.5pt;
  color: #475569;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12pt;
}
th, td {
  border: 1px solid #ccc;
  padding: 6pt 8pt;
  font-size: 10pt;
  text-align: left;
}
th {
  background: #0d9488;
  color: #fff;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-size: 9pt;
}
tr:nth-child(even) td {
  background: #f8fafc;
}
.totals {
  margin-top: 14pt;
  padding: 12pt 14pt;
  background: #ecfdf5;
  border: 1px solid #16a34a;
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.totals .label {
  font-size: 11pt;
  font-weight: 700;
  color: #166534;
}
.totals .amount {
  font-size: 16pt;
  font-weight: 800;
  color: #166534;
}
.no-data {
  padding: 30pt;
  text-align: center;
  color: #64748b;
  font-style: italic;
}
button.print-btn {
  padding: 8pt 16pt;
  cursor: pointer;
  margin-bottom: 24pt;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6pt;
  font-weight: 700;
  font-size: 11pt;
}
@media print {
  button.print-btn { display: none; }
  body { padding: 1.2cm; }
}
${studioHeaderCss}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨 Stampa / Salva PDF</button>
${studioPdfHeader(studio, { docTitle: title, docSubtitle: periodLabelStr })}
<div class="intro">
  <h2>Prospetto compensi — ${escHtml(operatorName)}</h2>
  <p><strong>Periodo:</strong> ${escHtml(periodLabelStr)}</p>
  <p><strong>Sedute totali:</strong> ${totals.sessions} &nbsp;·&nbsp; <strong>Ore totali:</strong> ${fmtHours(totals.hours)}</p>
</div>
${details.length === 0 ? `<div class="no-data">Nessuna seduta nel periodo selezionato.</div>` : `
<table>
  <thead>
    <tr>
      <th>Data</th>
      <th>Ora</th>
      <th>Paziente</th>
      <th>Trattamento</th>
      <th style="text-align:right">Durata</th>
      <th style="text-align:right">Compenso</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`}
<div class="totals">
  <div class="label">TOTALE COMPENSO LORDO</div>
  <div class="amount">${fmtEuro(totals.earnings)}</div>
</div>
${studioPdfFooter(studio)}
<script>window.onload=()=>setTimeout(()=>window.print(),400);</script>
</body>
</html>`;

  pw.document.write(html);
  pw.document.close();
}

export default function OperatorEarningsReport({
  studioId,
  studio,
}: {
  studioId: string;
  studio: StudioHeaderData;
}) {
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
          .select("id, operator_id, treatment_type, start_at, end_at, status, patient_id")
          .eq("studio_id", studioId)
          .in("status", ["done", "not_paid", "confirmed"])
          .gte("start_at", range.from.toISOString())
          .lt("start_at", range.to.toISOString())
          // mig. 029 → ospiti incassano direttamente, non sono "guadagni operatore"
          .is("guest_practitioner_id", null),
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

      // Carica nomi pazienti per gli appuntamenti del periodo
      const patientIds = Array.from(new Set(appts.map(a => a.patient_id).filter((x): x is string => !!x)));
      const patientMap = new Map<string, string>();
      if (patientIds.length > 0) {
        const { data: pData, error: pErr } = await supabase
          .from("patients")
          .select("id, first_name, last_name")
          .in("id", patientIds);
        if (pErr) throw new Error("Pazienti: " + pErr.message);
        for (const p of pData || []) {
          const first = (p.first_name as string | null) || "";
          const last = (p.last_name as string | null) || "";
          patientMap.set(p.id as string, `${last} ${first}`.trim() || "—");
        }
      }

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
          details: [],
          missingRateSessions: 0,
          missingTreatmentIds: [],
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
        details: [],
        missingRateSessions: 0,
        missingTreatmentIds: [],
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
        // Distinzione: tariffa NON impostata (rateMissing=true) vs tariffa 0 (intenzionale)
        let sessionEarnings = 0;
        let treatmentLabel = a.treatment_type || "—";
        let treatmentId: string | null = null;
        let treatmentStdDuration = 0;
        let rateMissing = false;

        if (opMember && a.treatment_type) {
          const tt = treatmentByKey.get(a.treatment_type);
          if (tt) {
            treatmentLabel = tt.label;
            treatmentId = tt.id;
            treatmentStdDuration = tt.duration_min;
            const rate = rateMap.get(`${opMember.id}|${tt.id}`);
            if (rate !== undefined && tt.duration_min > 0) {
              sessionEarnings = rate * (durMin / tt.duration_min);
              slot.earnings += sessionEarnings;
            } else {
              // Tariffa non impostata per questa combinazione (operatore × trattamento)
              rateMissing = true;
              slot.missingRateSessions = (slot.missingRateSessions || 0) + 1;
              if (!slot.missingTreatmentIds) slot.missingTreatmentIds = [];
              if (!slot.missingTreatmentIds.includes(tt.id)) {
                slot.missingTreatmentIds.push(tt.id);
              }
            }
          }
        }

        // Aggiungi al dettaglio (per PDF stampa)
        slot.details.push({
          appointmentId: a.id,
          date: new Date(a.start_at),
          patientName: (a.patient_id && patientMap.get(a.patient_id)) || "—",
          treatmentLabel,
          treatmentId,
          treatmentStdDuration,
          durationMin: durMin,
          earnings: sessionEarnings,
          status: a.status,
          rateMissing,
        });
      }

      // Lista finale: ordinata per nome, "Non assegnati" in fondo solo se ha sedute
      // + ordino i dettagli di ogni operatore per data crescente
      for (const slot of agg.values()) {
        slot.details.sort((a, b) => a.date.getTime() - b.date.getTime());
      }
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

  // Totale sedute con tariffa mancante (per banner alert in cima)
  const totalMissingRateSessions = useMemo(
    () => filtered.reduce((acc, s) => acc + s.missingRateSessions, 0),
    [filtered]
  );

  // Tariffe mancanti per il modal "imposta tariffe": tutte le combinazioni
  // (operator, treatment) per cui mancano tariffe.
  const [showMissingModal, setShowMissingModal] = useState(false);

  // ── Stampa PDF prospetto operatore ──────────────────────────────────
  const printOperatorStatement = useCallback((op: OperatorStats) => {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
    const fmtDate = (d: Date) => d.toLocaleDateString("it-IT");
    const fmtMin = (n: number) => `${Math.round(n)} min`;
    const periodLbl = period === "custom" && customFrom && customTo
      ? `${fmtDate(new Date(customFrom))} – ${fmtDate(new Date(customTo))}`
      : periodLabel(period);
    const title = `Prospetto compensi — ${op.displayName}`;

    // Rows: numerate, no nomi pazienti
    let rowsHtml = "";
    op.details.forEach((d, idx) => {
      const num = idx + 1;
      const earningsLbl = d.rateMissing
        ? `<span style="color:#dc2626;font-weight:700">—</span>`
        : `${d.earnings.toFixed(2).replace(".", ",")} €`;
      rowsHtml += `<tr>
        <td>${num}</td>
        <td>${fmtDate(d.date)}</td>
        <td>${esc(d.treatmentLabel)}</td>
        <td style="text-align:right">${fmtMin(d.durationMin)}</td>
        <td style="text-align:right">${earningsLbl}</td>
      </tr>`;
    });

    const totEarn = op.earnings.toFixed(2).replace(".", ",");
    const totHours = op.hours.toFixed(1).replace(".", ",");
    const missing = op.missingRateSessions;
    const missingAlert = missing > 0
      ? `<div style="margin:14pt 0;padding:10pt 12pt;background:#fef2f2;border:1px solid #fecaca;border-radius:6pt;color:#991b1b;font-size:10pt"><b>⚠ Attenzione:</b> ${missing} ${missing === 1 ? "seduta" : "sedute"} con tariffa mancante (compenso non calcolato). Imposta le tariffe nei dati operatore.</div>`
      : "";

    const printDate = new Date().toLocaleDateString("it-IT");

    const pw = window.open("", "_blank");
    if (!pw) {
      alert("Pop-up bloccato. Abilita pop-up per stampare.");
      return;
    }

    pw.document.write(`<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 2cm; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 16pt; }
    th, td { border: 1px solid #ccc; padding: 6pt; font-size: 10pt; }
    th { background: #f1f5f9; text-align: left; }
    button { padding: 8px 16px; cursor: pointer; margin-bottom: 16pt; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: 700; }
    @media print { button { display: none; } }
    ${studioHeaderCss}
  </style>
</head>
<body>
  <button onclick="window.print()">🖨 Stampa / Salva PDF</button>
  ${studioPdfHeader(studio, { docTitle: title, docSubtitle: op.displayName })}
  <div style="margin-top:14pt;font-size:11pt">
    <b>Terapista:</b> ${esc(op.displayName)}<br>
    <b>Periodo:</b> ${esc(periodLbl)}<br>
    <b>Data stampa:</b> ${printDate}
  </div>
  ${missingAlert}
  <table>
    <thead>
      <tr>
        <th style="width:50pt">N°</th>
        <th>Data</th>
        <th>Trattamento</th>
        <th style="text-align:right;width:80pt">Durata</th>
        <th style="text-align:right;width:100pt">Compenso</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="5" style="text-align:center;padding:14pt;color:#64748b">Nessuna seduta nel periodo</td></tr>`}
    </tbody>
    <tfoot>
      <tr style="background:#f1f5f9;font-weight:700">
        <td colspan="3" style="text-align:right">TOTALE</td>
        <td style="text-align:right">${totHours} h</td>
        <td style="text-align:right;color:#16a34a">${totEarn} €</td>
      </tr>
    </tfoot>
  </table>
  ${studioPdfFooter(studio)}
  <script>window.onload=()=>setTimeout(()=>window.print(),400);</script>
</body>
</html>`);
    pw.document.close();
  }, [studio, period, customFrom, customTo]);

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

      {/* Banner tariffe mancanti — visibile solo se almeno una seduta non ha tariffa */}
      {!loading && totalMissingRateSessions > 0 && (
        <div style={{
          padding: "10px 14px",
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.4)",
          color: "#92400e",
          borderRadius: 8,
          fontSize: 12,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <span style={{ flex: 1, fontWeight: 600 }}>
            <b>{totalMissingRateSessions}</b> {totalMissingRateSessions === 1 ? "seduta" : "sedute"} con tariffa mancante: compenso non calcolato.
          </span>
          <button
            onClick={() => setShowMissingModal(true)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              background: "#d97706",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            Imposta tariffe
          </button>
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
                <th style={{ padding: "10px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${THEME.border}`, width: 60 }}>PDF</th>
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
                  <td style={{ padding: "12px", textAlign: "right", color: THEME.green, fontWeight: 800 }}>
                    {fmtEuro(s.earnings)}
                    {s.missingRateSessions > 0 && (
                      <div style={{ fontSize: 10, color: "#d97706", fontWeight: 600, marginTop: 2 }}>
                        ⚠ {s.missingRateSessions} senza tariffa
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    {s.memberId !== "_unassigned_" && (
                      <button
                        onClick={() => printOperatorStatement(s)}
                        title="Stampa prospetto compensi PDF"
                        style={{
                          padding: "4px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          background: THEME.teal,
                          color: "#fff",
                          border: "none",
                          borderRadius: 5,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        PDF
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {/* Totale */}
              <tr style={{ background: THEME.panelSoft, fontWeight: 800 }}>
                <td style={{ padding: "12px", color: THEME.text }}>TOTALE</td>
                <td style={{ padding: "12px", textAlign: "right", color: THEME.text }}>{totals.sessions}</td>
                <td style={{ padding: "12px", textAlign: "right", color: THEME.text }}>{fmtHours(totals.hours)}</td>
                <td style={{ padding: "12px", textAlign: "right", color: THEME.green }}>{fmtEuro(totals.earnings)}</td>
                <td style={{ padding: "12px" }}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal "Imposta tariffe mancanti" ──────────────────────────── */}
      {showMissingModal && (
        <MissingRatesModal
          studioId={studioId}
          stats={stats}
          onClose={() => setShowMissingModal(false)}
          onSaved={() => {
            setShowMissingModal(false);
            void loadData();
          }}
        />
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MissingRatesModal — modale per impostare tariffe mancanti dal report.
// Le scritture vanno sulla stessa tabella usata dalle Impostazioni → Team,
// quindi le modifiche sono sincronizzate ovunque.
// ═══════════════════════════════════════════════════════════════════════

function MissingRatesModal({
  studioId,
  stats,
  onClose,
  onSaved,
}: {
  studioId: string;
  stats: OperatorStats[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Raccolgo le combinazioni (operator, treatment) mancanti.
  // Per ottenere il label del trattamento serve fare una query.
  const [treatmentLabels, setTreatmentLabels] = useState<Map<string, { label: string; duration_min: number }>>(new Map());
  const [rates, setRates] = useState<Record<string, string>>({}); // "memberId|treatmentId" -> "12.50"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Lista combinazioni mancanti
  const missingCombos = useMemo(() => {
    const out: Array<{ memberId: string; memberName: string; memberColor: string; treatmentId: string }> = [];
    for (const s of stats) {
      if (s.memberId === "_unassigned_") continue;
      for (const tid of s.missingTreatmentIds) {
        out.push({
          memberId: s.memberId,
          memberName: s.displayName,
          memberColor: s.color,
          treatmentId: tid,
        });
      }
    }
    return out;
  }, [stats]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (missingCombos.length === 0) return;
      const treatmentIds = Array.from(new Set(missingCombos.map(c => c.treatmentId)));
      const { data, error: err } = await supabase
        .from("treatment_types")
        .select("id, label, duration_min")
        .in("id", treatmentIds);
      if (cancelled) return;
      if (err || !data) return;
      const map = new Map<string, { label: string; duration_min: number }>();
      for (const t of data) {
        map.set(t.id as string, {
          label: t.label as string,
          duration_min: (t.duration_min as number) ?? 60,
        });
      }
      setTreatmentLabels(map);
    })();
    return () => { cancelled = true; };
  }, [missingCombos]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const toUpsert: Array<{ studio_id: string; member_id: string; treatment_type_id: string; rate_per_session: number }> = [];
      for (const c of missingCombos) {
        const key = `${c.memberId}|${c.treatmentId}`;
        const raw = (rates[key] || "").trim().replace(",", ".");
        if (raw === "") continue; // skip se non compilato
        const num = Number(raw);
        if (Number.isNaN(num) || num < 0) {
          throw new Error(`Valore non valido per ${c.memberName} — ${treatmentLabels.get(c.treatmentId)?.label || c.treatmentId}: ${raw}`);
        }
        toUpsert.push({
          studio_id: studioId,
          member_id: c.memberId,
          treatment_type_id: c.treatmentId,
          rate_per_session: num,
        });
      }
      if (toUpsert.length === 0) {
        setError("Inserisci almeno una tariffa per salvare.");
        setSaving(false);
        return;
      }
      const { error: upErr } = await supabase
        .from("operator_treatment_rates")
        .upsert(toUpsert, { onConflict: "member_id,treatment_type_id" });
      if (upErr) throw new Error(upErr.message);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15,23,42,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: 20,
    }}
    onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 12,
        maxWidth: 720,
        width: "100%",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${THEME.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: THEME.text }}>
              Imposta tariffe mancanti
            </div>
            <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
              Le tariffe vengono salvate anche in Impostazioni → Team.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 22, color: THEME.muted, padding: "0 6px" }}
            title="Chiudi"
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          {missingCombos.length === 0 ? (
            <div style={{ textAlign: "center", color: THEME.muted, fontSize: 13, padding: 20 }}>
              Nessuna tariffa mancante.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 110px 70px", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase" }}>Terapista</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase" }}>Trattamento</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", textAlign: "right" }}>Compenso (€)</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", textAlign: "right" }}>Durata</div>

              {missingCombos.map((c, i) => {
                const key = `${c.memberId}|${c.treatmentId}`;
                const t = treatmentLabels.get(c.treatmentId);
                return (
                  <div key={`${key}-${i}`} style={{ display: "contents" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.memberColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: THEME.text, fontWeight: 600 }}>{c.memberName}</span>
                    </div>
                    <div style={{ fontSize: 13, color: THEME.text, fontWeight: 500 }}>
                      {t?.label || c.treatmentId}
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={rates[key] ?? ""}
                      onChange={(e) => setRates(prev => ({ ...prev, [key]: e.target.value }))}
                      style={{
                        padding: "6px 10px",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#0f172a",
                        border: `1px solid ${THEME.border}`,
                        borderRadius: 6,
                        fontFamily: "inherit",
                        textAlign: "right",
                        background: "#fff",
                      }}
                    />
                    <div style={{ fontSize: 12, color: THEME.muted, textAlign: "right" }}>
                      {t?.duration_min ?? "—"}min
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 12,
              padding: "8px 10px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: 16, borderTop: `1px solid ${THEME.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              background: "#fff",
              color: THEME.text,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving || missingCombos.length === 0}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              background: THEME.teal,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: (saving || missingCombos.length === 0) ? "not-allowed" : "pointer",
              opacity: (saving || missingCombos.length === 0) ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {saving ? "Salvataggio…" : "Salva tariffe"}
          </button>
        </div>
      </div>
    </div>
  );
}
