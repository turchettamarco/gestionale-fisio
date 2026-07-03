"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/VoiceAnamnesisModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// "Detti la prima valutazione. L'AI compila la cartella."
//
// FLUSSO (2 step):
//   1. DETTATURA — mic grande, trascrizione live editabile (useDictation).
//   2. REVISIONE — l'AI (azione "anamnesis" di /api/ai-clinical) estrae i
//      campi strutturati; il fisioterapista spunta cosa applicare, vede
//      il confronto con i valori attuali, poi «Applica».
//
// POLITICA DI MERGE (lato chiamante, StructuredAnamnesis):
//   - array (sedi, caratteristiche, fattori): UNIONE con l'esistente
//   - scalari (durata, insorgenza, frequenza): SOSTITUZIONE
//   - red flag menzionati: SOLO avviso visivo, mai scritti in automatico
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { useDictation, appendDictated } from "@/src/hooks/useDictation";
import { DictationMicButton } from "@/src/components/DictationMicButton";
import {
  ONSET_TYPES, PAIN_FREQUENCIES, PAIN_CHARACTERISTICS, DURATION_UNITS, labelOf,
} from "@/src/lib/clinical/anamnesisOptions";
import { getPainLocationLabel } from "@/src/lib/clinical/painLocations";
import type { AnamnesisData } from "./StructuredAnamnesis";

const T = {
  teal: "#0d9488", blue: "#2563eb", purple: "#7c3aed", text: "#0f172a",
  muted: "#64748b", border: "#e2e8f0", red: "#dc2626", amber: "#f59e0b",
  green: "#16a34a", panelSoft: "#f8fafc",
};

export type VoiceAnamnesisExtraction = {
  pain_locations: string[];
  duration_value: number | null;
  duration_unit: string | null;
  onset_type: string | null;
  pain_frequency: string | null;
  pain_characteristics: string[];
  aggravating_factors: string[];
  relieving_factors: string[];
  red_flag_mentions: string[];
  occupation: string | null;
  sport: string | null;
  unmapped_notes: string;
};

type FieldKey =
  | "pain_locations" | "duration" | "onset_type" | "pain_frequency"
  | "pain_characteristics" | "aggravating_factors" | "relieving_factors"
  | "occupation" | "sport";

export function VoiceAnamnesisModal({
  open, onClose, current, onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** Valori attuali dell'anamnesi, per mostrare il confronto in revisione */
  current: AnamnesisData;
  /**
   * Applica i campi approvati. `partial` contiene SOLO i campi spuntati
   * (array già uniti all'esistente dal chiamante); extras = occupation/sport
   * + trascrizione integrale da archiviare nelle note cliniche (se richiesto).
   */
  onApply: (
    extracted: Partial<AnamnesisData>,
    extras: { occupation?: string | null; sport?: string | null; transcript?: string | null }
  ) => Promise<void>;
}) {
  const [step, setStep] = useState<"dictate" | "review">("dictate");
  const [transcript, setTranscript] = useState("");
  const [saveTranscript, setSaveTranscript] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<VoiceAnamnesisExtraction | null>(null);
  const [approved, setApproved] = useState<Set<FieldKey>>(new Set());

  const dict = useDictation({
    lang: "it-IT",
    onFinal: (text) => setTranscript((prev) => appendDictated(prev, text)),
  });

  const displayTranscript =
    transcript + (dict.listening && dict.interim ? (transcript ? " " : "") + dict.interim : "");

  function resetAll() {
    dict.stop();
    setStep("dictate");
    setTranscript("");
    setSaveTranscript(true);
    setExtraction(null);
    setApproved(new Set());
    setErr(null);
    setAnalyzing(false);
    setApplying(false);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  async function analyze() {
    if (dict.listening) {
      dict.stop();
      await new Promise((r) => setTimeout(r, 350));
    }
    setAnalyzing(true);
    setErr(null);
    try {
      const res = await fetch("/api/ai-clinical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "anamnesis", context: { transcript } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Errore AI");
      const ex = data.result as VoiceAnamnesisExtraction;
      setExtraction(ex);

      // Pre-spunta tutti i campi che hanno un valore estratto
      const pre = new Set<FieldKey>();
      if (ex.pain_locations.length) pre.add("pain_locations");
      if (ex.duration_value != null && ex.duration_unit) pre.add("duration");
      if (ex.onset_type) pre.add("onset_type");
      if (ex.pain_frequency) pre.add("pain_frequency");
      if (ex.pain_characteristics.length) pre.add("pain_characteristics");
      if (ex.aggravating_factors.length) pre.add("aggravating_factors");
      if (ex.relieving_factors.length) pre.add("relieving_factors");
      if (ex.occupation) pre.add("occupation");
      if (ex.sport) pre.add("sport");
      setApproved(pre);
      setStep("review");
    } catch (e: any) {
      setErr(e?.message || "Errore durante l'analisi");
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleApproved(k: FieldKey) {
    setApproved((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  const mergeArr = (curr: string[], add: string[]) =>
    Array.from(new Set([...curr, ...add]));

  async function apply() {
    if (!extraction) return;
    setApplying(true);
    setErr(null);
    try {
      const partial: Partial<AnamnesisData> = {};
      if (approved.has("pain_locations"))
        partial.pain_locations = mergeArr(current.pain_locations, extraction.pain_locations);
      if (approved.has("duration")) {
        partial.duration_value = extraction.duration_value;
        partial.duration_unit = extraction.duration_unit;
      }
      if (approved.has("onset_type")) partial.onset_type = extraction.onset_type;
      if (approved.has("pain_frequency")) partial.pain_frequency = extraction.pain_frequency;
      if (approved.has("pain_characteristics"))
        partial.pain_characteristics = mergeArr(current.pain_characteristics, extraction.pain_characteristics);
      if (approved.has("aggravating_factors"))
        partial.aggravating_factors = mergeArr(current.aggravating_factors, extraction.aggravating_factors);
      if (approved.has("relieving_factors"))
        partial.relieving_factors = mergeArr(current.relieving_factors, extraction.relieving_factors);

      const extras: { occupation?: string | null; sport?: string | null; transcript?: string | null } = {};
      if (approved.has("occupation")) extras.occupation = extraction.occupation;
      if (approved.has("sport")) extras.sport = extraction.sport;
      if (saveTranscript && transcript.trim()) extras.transcript = transcript.trim();

      await onApply(partial, extras);
      handleClose();
    } catch (e: any) {
      setErr(e?.message || "Errore durante il salvataggio");
      setApplying(false);
    }
  }

  if (!open) return null;

  // ── Righe di revisione ──────────────────────────────────────────────

  type ReviewRow = { key: FieldKey; label: string; currentText: string; newText: string; additive: boolean };

  const rows: ReviewRow[] = [];
  if (extraction) {
    if (extraction.pain_locations.length)
      rows.push({
        key: "pain_locations", label: "📍 Sedi del dolore", additive: true,
        currentText: current.pain_locations.map(getPainLocationLabel).join(", ") || "—",
        newText: extraction.pain_locations.map(getPainLocationLabel).join(", "),
      });
    if (extraction.duration_value != null && extraction.duration_unit)
      rows.push({
        key: "duration", label: "⏳ Durata", additive: false,
        currentText: current.duration_value && current.duration_unit
          ? `${current.duration_value} ${labelOf(DURATION_UNITS, current.duration_unit)}` : "—",
        newText: `${extraction.duration_value} ${labelOf(DURATION_UNITS, extraction.duration_unit)}`,
      });
    if (extraction.onset_type)
      rows.push({
        key: "onset_type", label: "⚡ Insorgenza", additive: false,
        currentText: current.onset_type ? labelOf(ONSET_TYPES, current.onset_type) || current.onset_type : "—",
        newText: labelOf(ONSET_TYPES, extraction.onset_type) || extraction.onset_type,
      });
    if (extraction.pain_frequency)
      rows.push({
        key: "pain_frequency", label: "🔁 Frequenza", additive: false,
        currentText: current.pain_frequency ? labelOf(PAIN_FREQUENCIES, current.pain_frequency) || current.pain_frequency : "—",
        newText: labelOf(PAIN_FREQUENCIES, extraction.pain_frequency) || extraction.pain_frequency,
      });
    if (extraction.pain_characteristics.length)
      rows.push({
        key: "pain_characteristics", label: "🎯 Caratteristiche", additive: true,
        currentText: current.pain_characteristics.map((c) => labelOf(PAIN_CHARACTERISTICS, c) || c).join(", ") || "—",
        newText: extraction.pain_characteristics.map((c) => labelOf(PAIN_CHARACTERISTICS, c) || c).join(", "),
      });
    if (extraction.aggravating_factors.length)
      rows.push({
        key: "aggravating_factors", label: "📈 Fattori aggravanti", additive: true,
        currentText: current.aggravating_factors.join(", ") || "—",
        newText: extraction.aggravating_factors.join(", "),
      });
    if (extraction.relieving_factors.length)
      rows.push({
        key: "relieving_factors", label: "📉 Fattori allevianti", additive: true,
        currentText: current.relieving_factors.join(", ") || "—",
        newText: extraction.relieving_factors.join(", "),
      });
    if (extraction.occupation)
      rows.push({ key: "occupation", label: "💼 Professione", additive: false, currentText: "(scheda paziente)", newText: extraction.occupation });
    if (extraction.sport)
      rows.push({ key: "sport", label: "🏃 Sport", additive: false, currentText: "(scheda paziente)", newText: extraction.sport });
  }

  return (
    <div
      onClick={handleClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 240, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 620, maxHeight: "90vh",
          background: "#fff", borderRadius: 16, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 70px rgba(15,23,42,0.35)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${T.border}`,
          background: "linear-gradient(135deg, rgba(124,58,237,0.07), rgba(37,99,235,0.07))",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
              🎙 Anamnesi vocale
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
              {step === "dictate"
                ? "Detta la valutazione: l'AI compila i campi strutturati."
                : "Rivedi cosa applicare: spunta i campi corretti."}
            </div>
          </div>
          <button onClick={handleClose} aria-label="Chiudi" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: T.muted, fontWeight: 700, padding: 4 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

          {err && (
            <div style={{ padding: "7px 11px", background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, fontSize: 12, color: T.red, fontWeight: 600 }}>
              ⚠ {err}
            </div>
          )}

          {step === "dictate" && (
            <>
              {!dict.supported && (
                <div style={{ padding: "8px 11px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                  Questo browser non supporta la dettatura: puoi comunque scrivere o incollare il testo qui sotto.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "6px 0 2px" }}>
                <DictationMicButton
                  listening={dict.listening}
                  supported={dict.supported}
                  onToggle={() => (dict.listening ? dict.stop() : dict.start())}
                  size={62}
                />
                {dict.listening ? (
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.red }}>● Sto ascoltando… tocca per fermare</div>
                ) : dict.supported ? (
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>Tocca il microfono e parla liberamente</div>
                ) : null}
              </div>

              <textarea
                value={displayTranscript}
                onChange={(e) => setTranscript(e.target.value)}
                readOnly={dict.listening}
                rows={7}
                placeholder={"Es. «Paziente di 45 anni, impiegata, dolore lombare a destra da tre mesi, insorgenza graduale, peggiora stando seduta e sollevando pesi, migliora camminando, dolore sordo e a volte irradiato al gluteo destro, nessun trauma, niente febbre né perdita di peso…»"}
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 10,
                  border: dict.listening ? "1.5px solid #dc2626" : `1.5px solid ${T.border}`,
                  background: dict.listening ? "rgba(220,38,38,0.03)" : "#fff",
                  fontSize: 13, fontFamily: "inherit", lineHeight: 1.6,
                  resize: "vertical", outline: "none", boxSizing: "border-box",
                }}
              />

              {dict.error && (
                <div style={{ fontSize: 11.5, color: T.red, fontWeight: 600 }}>⚠ {dict.error}</div>
              )}

              <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                💡 Più dettagli detti (sede e lato, da quanto tempo, cosa peggiora e cosa
                allevia, come è iniziato), più campi verranno compilati. Puoi correggere il
                testo a mano prima di analizzarlo.
              </div>
            </>
          )}

          {step === "review" && extraction && (
            <>
              {rows.length === 0 ? (
                <div style={{ padding: "18px 12px", textAlign: "center", color: T.muted, fontSize: 13, lineHeight: 1.6 }}>
                  Non sono riuscito a estrarre campi strutturati da questa trascrizione.
                  Torna indietro e aggiungi qualche dettaglio in più (sede, durata, fattori).
                </div>
              ) : (
                rows.map((r) => {
                  const on = approved.has(r.key);
                  return (
                    <label
                      key={r.key}
                      style={{
                        display: "flex", gap: 10, alignItems: "flex-start",
                        border: `1.5px solid ${on ? "rgba(13,148,136,0.45)" : T.border}`,
                        background: on ? "rgba(13,148,136,0.04)" : "#fff",
                        borderRadius: 10, padding: "10px 12px", cursor: "pointer",
                        transition: "border-color 0.12s, background 0.12s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleApproved(r.key)}
                        style={{ marginTop: 3, width: 15, height: 15, accentColor: T.teal, cursor: "pointer" }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: T.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {r.label}
                          <span style={{
                            fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4,
                            color: r.additive ? T.teal : T.purple,
                            background: r.additive ? "rgba(13,148,136,0.1)" : "rgba(124,58,237,0.1)",
                            borderRadius: 999, padding: "2px 7px",
                          }}>{r.additive ? "si aggiunge" : "sostituisce"}</span>
                        </div>
                        {r.currentText !== "—" && (
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                            Attuale: {r.currentText}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: T.text, marginTop: 3, fontWeight: 600 }}>
                          → {r.newText}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}

              {extraction.red_flag_mentions.length > 0 && (
                <div style={{
                  border: "1.5px solid rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.06)",
                  borderRadius: 10, padding: "10px 12px",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#92400e" }}>🚩 Possibili red flag menzionati</div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11.5, color: "#92400e", lineHeight: 1.5 }}>
                    {extraction.red_flag_mentions.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                  <div style={{ fontSize: 10.5, color: "#92400e", marginTop: 5, opacity: 0.85 }}>
                    Non vengono salvati in automatico: verificali nella sezione Red Flags.
                  </div>
                </div>
              )}

              {extraction.unmapped_notes && (
                <div style={{ border: `1px solid ${T.border}`, background: T.panelSoft, borderRadius: 10, padding: "9px 12px", fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                  <strong style={{ color: T.text }}>ℹ Non mappato:</strong> {extraction.unmapped_notes}
                </div>
              )}

              <label style={{
                display: "flex", gap: 9, alignItems: "center",
                border: `1px solid ${T.border}`, borderRadius: 10,
                padding: "9px 12px", cursor: "pointer", background: "#fff",
              }}>
                <input
                  type="checkbox"
                  checked={saveTranscript}
                  onChange={(e) => setSaveTranscript(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: T.teal, cursor: "pointer" }}
                />
                <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>
                  💾 Archivia la trascrizione integrale nelle note cliniche
                </span>
              </label>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {step === "review" ? (
            <button
              onClick={() => { setStep("dictate"); setErr(null); }}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: T.blue, fontWeight: 700, fontSize: 12, fontFamily: "inherit", padding: 0 }}
            >← Torna alla dettatura</button>
          ) : <span />}

          {step === "dictate" ? (
            <button
              onClick={analyze}
              disabled={analyzing || transcript.trim().length < 10}
              style={{
                padding: "9px 20px", borderRadius: 9, border: "none",
                background: analyzing || transcript.trim().length < 10
                  ? "#cbd5e1"
                  : "linear-gradient(135deg, #7c3aed, #2563eb)",
                color: "#fff", fontWeight: 800, fontSize: 13,
                cursor: analyzing || transcript.trim().length < 10 ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >{analyzing ? "Analizzo…" : "✨ Compila anamnesi"}</button>
          ) : (
            <button
              onClick={apply}
              disabled={applying || approved.size === 0}
              style={{
                padding: "9px 20px", borderRadius: 9, border: "none",
                background: applying || approved.size === 0
                  ? "#cbd5e1"
                  : `linear-gradient(135deg, ${T.teal}, ${T.blue})`,
                color: "#fff", fontWeight: 800, fontSize: 13,
                cursor: applying || approved.size === 0 ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >{applying ? "Applico…" : `✓ Applica ${approved.size} camp${approved.size === 1 ? "o" : "i"}`}</button>
          )}
        </div>
      </div>
    </div>
  );
}
