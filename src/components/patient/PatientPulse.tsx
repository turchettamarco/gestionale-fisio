"use client";

// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/PatientPulse.tsx
// ═══════════════════════════════════════════════════════════════════════
// Riga di sintesi su come è andato il paziente FRA una seduta e l'altra,
// mostrata quando apri l'appuntamento.
//
// I dati esistevano già ma vivevano in cartella: e in cartella non ci
// entri mentre il paziente si sta spogliando. Qui arrivano nel momento in
// cui servono davvero — prima di cominciare — in una riga sola:
//   andamento del dolore · giorni di esercizi · autovalutazione in attesa
//
// Se non c'è nulla da dire il componente non rende niente, così non
// aggiunge rumore agli appuntamenti dei pazienti che non usano l'area.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

export type PatientPulseProps = { patientId: string };

type Pulse = {
  last7: number | null;
  prev7: number | null;
  entries: number;
  adherenceDays: number;
  hasScheda: boolean;
  intakePending: boolean;
  intakeCompleted: boolean;
};

function mean(v: number[]): number | null {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export default function PatientPulse({ patientId }: PatientPulseProps) {
  const [p, setP] = useState<Pulse | null>(null);

  const load = useCallback(async () => {
    if (!patientId) return;

    const since14 = new Date(Date.now() - 13 * 86400000)
      .toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
    const since7 = new Date(Date.now() - 6 * 86400000)
      .toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

    const [painRes, schedaRes, intakeRes] = await Promise.all([
      supabase.from("patient_pain_log")
        .select("day, level").eq("patient_id", patientId).gte("day", since14),
      supabase.from("schede_esercizi_pubbliche")
        .select("id").eq("patient_id", patientId)
        .order("created_at", { ascending: false }).limit(1),
      supabase.from("patient_intake")
        .select("status").eq("patient_id", patientId)
        .order("sent_at", { ascending: false }).limit(1),
    ]);

    const pain = (painRes.data ?? []) as Array<{ day: string; level: number }>;
    const last7 = mean(pain.filter(r => r.day >= since7).map(r => r.level));
    const prev7 = mean(pain.filter(r => r.day < since7).map(r => r.level));

    let adherenceDays = 0;
    const schedaId = schedaRes.data?.[0]?.id;
    if (schedaId) {
      const { data: checks } = await supabase.from("esercizi_aderenza")
        .select("done_date").eq("scheda_id", schedaId).gte("done_date", since7);
      adherenceDays = new Set((checks ?? []).map(c => c.done_date as string)).size;
    }

    const intakeStatus = intakeRes.data?.[0]?.status as string | undefined;

    setP({
      last7, prev7,
      entries: pain.length,
      adherenceDays,
      hasScheda: Boolean(schedaId),
      intakePending: intakeStatus === "pending",
      intakeCompleted: intakeStatus === "completed",
    });
  }, [patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!p) return null;

  const nothingToSay = p.entries === 0 && !p.hasScheda && !p.intakePending && !p.intakeCompleted;
  if (nothingToSay) return null;

  const delta = p.last7 !== null && p.prev7 !== null ? p.last7 - p.prev7 : null;
  const painColor = p.last7 === null ? "#64748b"
    : p.last7 >= 7 ? "#dc2626" : p.last7 >= 4 ? "#f59e0b" : "#0d9488";

  const chips: Array<{ text: string; color: string; strong?: boolean }> = [];

  if (p.last7 !== null) {
    const trend = delta === null ? "" : delta < -0.5 ? " ↓" : delta > 0.5 ? " ↑" : " →";
    chips.push({ text: `Dolore ${p.last7.toFixed(1)}/10${trend}`, color: painColor, strong: true });
  } else if (p.entries > 0) {
    chips.push({ text: "Diario iniziato", color: "#64748b" });
  }

  if (p.hasScheda) {
    chips.push({
      text: `Esercizi ${p.adherenceDays}/7 gg`,
      color: p.adherenceDays >= 4 ? "#0d9488" : p.adherenceDays >= 1 ? "#f59e0b" : "#94a3b8",
    });
  }

  if (p.intakePending) chips.push({ text: "Autovalutazione da compilare", color: "#b45309" });
  else if (p.intakeCompleted) chips.push({ text: "Autovalutazione compilata", color: "#0d9488" });

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
      padding: "8px 12px", borderRadius: 8,
      background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 12,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 800, color: "#94a3b8",
        letterSpacing: 0.4, textTransform: "uppercase", marginRight: 2,
      }}>
        Da casa
      </span>
      {chips.map((c, i) => (
        <span key={i} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11.5, fontWeight: c.strong ? 800 : 600, color: c.color,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: c.color, display: "inline-block",
          }} />
          {c.text}
        </span>
      ))}
    </div>
  );
}
