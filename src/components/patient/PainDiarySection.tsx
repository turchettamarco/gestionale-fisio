"use client";

// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/PainDiarySection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Il diario del dolore compilato dal paziente nella sua area riservata
// (mig. 092), letto dal terapista.
//
// Serve a rispondere a una domanda che al controllo non ha mai una buona
// risposta: "come è andata in queste due settimane?". Il paziente ricorda
// gli ultimi due o tre giorni, non l'andamento. Qui c'è il dato giorno per
// giorno, con la media dell'ultima settimana confrontata con la precedente.
//
// Sola lettura: il diario è del paziente, il terapista lo consulta.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

type PainRow = { day: string; level: number; note: string | null };

export type PainDiarySectionProps = {
  patientId: string;
  /** Se lo studio non ha attivato il diario, si dice perché è vuoto. */
  enabled: boolean;
};

/** Colore per intensità: verde fino a 3, ambra 4-6, rosso da 7. */
function colorFor(level: number): string {
  if (level >= 7) return "#dc2626";
  if (level >= 4) return "#f59e0b";
  return "#0d9488";
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default function PainDiarySection(p: PainDiarySectionProps) {
  const [rows, setRows] = useState<PainRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!p.patientId) return;
    setLoading(true);
    const { data } = await supabase
      .from("patient_pain_log")
      .select("day, level, note")
      .eq("patient_id", p.patientId)
      .order("day", { ascending: false })
      .limit(60);
    setRows((data as PainRow[]) ?? []);
    setLoading(false);
  }, [p.patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Media ultimi 7 giorni contro i 7 precedenti
  const today = new Date();
  const dayOffset = (iso: string) =>
    Math.floor((today.getTime() - new Date(iso + "T12:00:00").getTime()) / 86400000);

  const last7 = mean(rows.filter(r => dayOffset(r.day) < 7).map(r => r.level));
  const prev7 = mean(rows.filter(r => {
    const d = dayOffset(r.day);
    return d >= 7 && d < 14;
  }).map(r => r.level));

  const delta = last7 !== null && prev7 !== null ? last7 - prev7 : null;

  // Ultimi 21 giorni in ordine cronologico, per il grafico
  const chart = [...rows]
    .filter(r => dayOffset(r.day) < 21)
    .sort((a, b) => a.day.localeCompare(b.day));

  const withNotes = rows.filter(r => r.note && r.note.trim() !== "").slice(0, 8);

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, background: "#fff" }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Diario del dolore</div>
      <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2, marginBottom: 12 }}>
        Compilato dal paziente nella sua area riservata
      </div>

      {loading ? (
        <div style={{ fontSize: 12.5, color: "#64748b" }}>Caricamento…</div>
      ) : rows.length === 0 ? (
        <div style={{
          padding: "12px 14px", borderRadius: 8, background: "#f8fafc",
          border: "1px solid #e2e8f0", fontSize: 12.5, color: "#64748b", lineHeight: 1.5,
        }}>
          {p.enabled
            ? "Nessuna registrazione. Il diario è attivo: ricorda al paziente che può segnare il dolore dalla sua area riservata."
            : "Il diario non è attivo per il tuo studio. Puoi accenderlo da Impostazioni → Area Paziente."}
        </div>
      ) : (
        <>
          {/* Confronto fra le due settimane */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 120px", padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Ultimi 7 giorni
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: last7 !== null ? colorFor(last7) : "#64748b", marginTop: 2 }}>
                {last7 !== null ? last7.toFixed(1) : "—"}
                <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}> /10</span>
              </div>
            </div>
            <div style={{ flex: "1 1 120px", padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Settimana prima
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#475569", marginTop: 2 }}>
                {prev7 !== null ? prev7.toFixed(1) : "—"}
                <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}> /10</span>
              </div>
            </div>
            {delta !== null && (
              <div style={{ flex: "1 1 120px", padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Andamento
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4, color: delta < -0.5 ? "#15803d" : delta > 0.5 ? "#b45309" : "#475569" }}>
                  {delta < -0.5 ? "↓ in calo" : delta > 0.5 ? "↑ in aumento" : "≈ stabile"}
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>
                    {" "}({delta > 0 ? "+" : ""}{delta.toFixed(1)})
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Grafico ultimi 21 giorni */}
          {chart.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 70 }}>
                {chart.map(r => (
                  <div key={r.day} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
                    title={`${new Date(r.day).toLocaleDateString("it-IT")} — ${r.level}/10${r.note ? `\n${r.note}` : ""}`}>
                    <div style={{
                      height: `${Math.max(6, (r.level / 10) * 100)}%`,
                      background: colorFor(r.level), borderRadius: 3,
                    }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
                <span>{new Date(chart[0].day).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}</span>
                <span>{new Date(chart[chart.length - 1].day).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}</span>
              </div>
            </div>
          )}

          {/* Note scritte dal paziente */}
          {withNotes.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                Con annotazione
              </div>
              {withNotes.map(r => (
                <div key={r.day} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{
                    flexShrink: 0, minWidth: 30, textAlign: "center", fontSize: 11, fontWeight: 800,
                    color: "#fff", background: colorFor(r.level), borderRadius: 4, padding: "2px 0",
                  }}>{r.level}</span>
                  <span style={{ fontSize: 12, color: "#475569", lineHeight: 1.45 }}>
                    <strong style={{ color: "#0f172a" }}>
                      {new Date(r.day).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                    </strong>{" "}
                    {r.note}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 10, lineHeight: 1.45 }}>
            {rows.length} registrazioni in totale. È il vissuto riferito dal paziente,
            non una misura clinica.
          </div>
        </>
      )}
    </div>
  );
}
