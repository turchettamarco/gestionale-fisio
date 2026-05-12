// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/PatientSummaryPanel.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Pannello "Riassunto Clinico" mostrato in cima alla sezione Clinica
// della pagina paziente (Tappa 4 del refactor UX).
//
// SCOPO:
// Permettere a Marco di leggere "a colpo d'occhio" lo stato clinico del
// paziente quando prepara la prossima seduta, SENZA dover scorrere e
// leggere paragrafi interi di anamnesi/diagnosi/diario.
//
// 5 INDICATORI:
//   1. 🩺 Diagnosi attuale  — prima frase utile di clinical_data.diagnosis
//   2. 📉 Trend VAS         — confronto vas_before/vas_after tra prima
//                              e ultima nota SOAP, con freccia ↘/↗
//   3. 📅 Sedute             — completate / totali con barra di progresso
//   4. 🎯 Obiettivi attivi   — count + primo obiettivo da clinical_goals
//                              (se non c'è ancora niente in clinical_goals
//                              perché Tappa 7 non è ancora fatta, mostra
//                              call-to-action "Imposta obiettivi")
//   5. 📝 Ultima nota seduta — snippet (max 120 char) dell'ultima nota
//                              quick_note o SOAP S
//
// COMPORTAMENTO RESPONSIVE:
//   • Desktop (≥1024px): 5 colonne in fila
//   • Tablet (768–1023px): 2 colonne (le diagnosi/obiettivi occupano una
//                          riga, gli altri 3 indicatori si adattano)
//   • Mobile (<768px): 1 colonna, indicatori impilati
//
// NESSUNA NUOVA QUERY DB:
// Il componente riceve i dati già fetchati dal parent. Il parent può
// usare quelli che già aveva (diagnosis, therapiesCount, doneCount,
// soapNotes) + un fetch leggero di clinical_goals.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React from "react";

// ─── Tipi pubblici ──────────────────────────────────────────────────────

export type PatientSummaryData = {
  /** Testo della diagnosi (da clinical_data.diagnosis). */
  diagnosis?: string | null;

  /** Note SOAP del paziente, ordinate per data (più recenti prime). */
  soapNotes?: Array<{
    vas_before?: number | null;
    vas_after?: number | null;
    quick_note?: string | null;
    soap_s?: string | null;
    created_at?: string;
  }>;

  /** Conteggi sedute (già calcolati dal parent). */
  therapiesCount: number;
  doneCount: number;

  /** Obiettivi attivi del paziente (da clinical_goals, status='active'). */
  activeGoals?: Array<{ description: string; sort_order?: number }>;
};

export type PatientSummaryPanelProps = PatientSummaryData;

// ─── Theme locale ───────────────────────────────────────────────────────

const T = {
  panelBg:     "#ffffff",
  panelSoft:   "#f8fafc",
  text:        "#0f172a",
  textSoft:    "#334155",
  muted:       "#64748b",
  mutedSoft:   "#94a3b8",
  border:      "#e2e8f0",
  borderSoft:  "#f1f5f9",
  blue:        "#2563eb",
  teal:        "#0d9488",
  green:       "#16a34a",
  amber:       "#f59e0b",
  red:         "#dc2626",
};

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Prende la prima frase utile di un testo: tronca alla prima frase intera
 * (punto, ?, !) o ai primi N caratteri se la prima frase è troppo lunga.
 */
function firstSentence(text: string | null | undefined, maxLen = 90): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Cerca primo separatore di frase
  const m = trimmed.match(/^[^.!?\n]{1,200}[.!?]/);
  if (m) {
    const sentence = m[0].trim();
    if (sentence.length <= maxLen) return sentence;
    return sentence.slice(0, maxLen - 1).trim() + "…";
  }

  // Nessun separatore: tronca a maxLen
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 1).trim() + "…";
}

function truncate(text: string | null | undefined, maxLen = 120): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen - 1).trim() + "…";
}

/**
 * Calcola il trend VAS confrontando la PRIMA nota con valore vas_before
 * disponibile (cronologicamente la più vecchia) e l'ULTIMA con vas_after
 * (la più recente). Restituisce { from, to, delta, trend }.
 */
function computeVASTrend(
  soapNotes: PatientSummaryData["soapNotes"]
): {
  from: number | null;
  to: number | null;
  delta: number | null;
  trend: "improving" | "worsening" | "stable" | "no-data";
} {
  if (!soapNotes || soapNotes.length === 0) {
    return { from: null, to: null, delta: null, trend: "no-data" };
  }

  // soapNotes arriva ordinato DESC (prima più recente). Cerchiamo:
  //  - latest: ultima con vas_after (la più recente)
  //  - first:  prima con vas_before (la più vecchia)
  // Iteriamo dalla più recente alla più vecchia.

  let latest: number | null = null;
  for (const n of soapNotes) {
    if (typeof n.vas_after === "number") {
      latest = n.vas_after;
      break;
    }
  }

  let first: number | null = null;
  for (let i = soapNotes.length - 1; i >= 0; i--) {
    const n = soapNotes[i];
    if (typeof n.vas_before === "number") {
      first = n.vas_before;
      break;
    }
  }

  if (first === null || latest === null) {
    // Caso intermedio: ho solo un valore (es. solo l'attuale)
    if (latest !== null) {
      return { from: null, to: latest, delta: null, trend: "no-data" };
    }
    if (first !== null) {
      return { from: first, to: null, delta: null, trend: "no-data" };
    }
    return { from: null, to: null, delta: null, trend: "no-data" };
  }

  const delta = latest - first;
  let trend: "improving" | "worsening" | "stable";
  if (delta <= -1) trend = "improving";        // VAS sceso di almeno 1 punto
  else if (delta >= 1) trend = "worsening";    // VAS salito di almeno 1 punto
  else trend = "stable";

  return { from: first, to: latest, delta, trend };
}

/** Estrae lo snippet della "ultima nota seduta". Priorità: quick_note > soap_s. */
function lastSessionSnippet(
  soapNotes: PatientSummaryData["soapNotes"]
): { snippet: string | null; date: string | null } {
  if (!soapNotes || soapNotes.length === 0) return { snippet: null, date: null };
  const last = soapNotes[0]; // già ordinato DESC
  const text = last.quick_note || last.soap_s || null;
  const snippet = truncate(text, 100);
  const date = last.created_at
    ? new Date(last.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
    : null;
  return { snippet, date };
}

// ─── Sotto-componenti ───────────────────────────────────────────────────

function MetricCard({
  icon, label, children, accent,
}: {
  icon: string;
  label: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: T.panelBg,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 6,
      minHeight: 88,
      position: "relative",
      overflow: "hidden",
    }}>
      {accent && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: accent,
        }} />
      )}
      <div style={{
        fontSize: 10, fontWeight: 800, color: T.muted,
        textTransform: "uppercase", letterSpacing: 0.8,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Componente principale ──────────────────────────────────────────────

export default function PatientSummaryPanel({
  diagnosis, soapNotes, therapiesCount, doneCount, activeGoals,
}: PatientSummaryPanelProps) {

  const diagnosisSnippet = firstSentence(diagnosis, 90);

  const vas = computeVASTrend(soapNotes);

  const sessionsPct = therapiesCount > 0
    ? Math.round((doneCount / therapiesCount) * 100)
    : 0;

  const goalsCount = activeGoals?.length || 0;
  const firstGoal = activeGoals?.[0]?.description;

  const last = lastSessionSnippet(soapNotes);

  return (
    <div className="patient-summary-panel" style={{
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 10,
      marginBottom: 18,
    }}>

      {/* ── 1. DIAGNOSI ───────────────────────────────────────────────── */}
      <MetricCard icon="🩺" label="Diagnosi" accent={T.teal}>
        {diagnosisSnippet ? (
          <div style={{
            fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.35,
          }}>
            {diagnosisSnippet}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: T.mutedSoft, fontStyle: "italic" }}>
            Non ancora compilata
          </div>
        )}
      </MetricCard>

      {/* ── 2. TREND VAS ──────────────────────────────────────────────── */}
      <MetricCard
        icon="📉"
        label="Trend VAS"
        accent={
          vas.trend === "improving" ? T.green :
          vas.trend === "worsening" ? T.red :
          vas.trend === "stable"    ? T.amber :
          T.borderSoft
        }
      >
        {vas.trend === "no-data" ? (
          <div style={{ fontSize: 12, color: T.mutedSoft, fontStyle: "italic" }}>
            Nessuna misurazione
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
              {vas.from ?? "–"}
            </span>
            <span style={{
              color:
                vas.trend === "improving" ? T.green :
                vas.trend === "worsening" ? T.red :
                T.amber,
              fontSize: 14, fontWeight: 800,
            }}>
              {vas.trend === "improving" ? "↘" : vas.trend === "worsening" ? "↗" : "→"}
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
              {vas.to ?? "–"}
            </span>
            {vas.delta !== null && vas.delta !== 0 && (
              <span style={{
                marginLeft: "auto",
                fontSize: 11, fontWeight: 700,
                color: vas.trend === "improving" ? T.green : vas.trend === "worsening" ? T.red : T.muted,
              }}>
                {vas.delta > 0 ? "+" : ""}{vas.delta}
              </span>
            )}
          </div>
        )}
      </MetricCard>

      {/* ── 3. SEDUTE ─────────────────────────────────────────────────── */}
      <MetricCard icon="📅" label="Sedute" accent={T.blue}>
        {therapiesCount === 0 ? (
          <div style={{ fontSize: 12, color: T.mutedSoft, fontStyle: "italic" }}>
            Nessuna seduta
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{doneCount}</span>
              <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>
                / {therapiesCount}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: T.blue }}>
                {sessionsPct}%
              </span>
            </div>
            <div style={{
              height: 4, background: T.borderSoft, borderRadius: 2, overflow: "hidden",
            }}>
              <div style={{
                width: `${sessionsPct}%`, height: "100%", background: T.blue,
                transition: "width 0.4s ease",
              }} />
            </div>
          </>
        )}
      </MetricCard>

      {/* ── 4. OBIETTIVI ──────────────────────────────────────────────── */}
      <MetricCard icon="🎯" label="Obiettivi attivi" accent={goalsCount > 0 ? T.amber : T.borderSoft}>
        {goalsCount > 0 ? (
          <>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginBottom: 2 }}>
              {goalsCount} {goalsCount === 1 ? "obiettivo" : "obiettivi"}
            </div>
            <div style={{
              fontSize: 12, color: T.text, fontWeight: 600, lineHeight: 1.35,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}>
              {firstGoal}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: T.mutedSoft, fontStyle: "italic" }}>
            Nessun obiettivo impostato
          </div>
        )}
      </MetricCard>

      {/* ── 5. ULTIMA NOTA SEDUTA ─────────────────────────────────────── */}
      <MetricCard icon="📝" label="Ultima nota" accent="#7c3aed">
        {last.snippet ? (
          <>
            {last.date && (
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 2 }}>
                {last.date}
              </div>
            )}
            <div style={{
              fontSize: 12, color: T.textSoft, lineHeight: 1.4,
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}>
              {last.snippet}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: T.mutedSoft, fontStyle: "italic" }}>
            Nessuna nota ancora
          </div>
        )}
      </MetricCard>

      {/* ── Responsive ────────────────────────────────────────────────── */}
      <style jsx>{`
        @media (max-width: 1199px) and (min-width: 768px) {
          .patient-summary-panel {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
        @media (max-width: 767px) {
          .patient-summary-panel {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 479px) {
          .patient-summary-panel {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
