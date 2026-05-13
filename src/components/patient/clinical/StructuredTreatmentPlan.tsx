// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/StructuredTreatmentPlan.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Form strutturato per il Piano di Trattamento del paziente (Tappa 7).
//
// STILE: checklist con pallini (come Tappa 5/6).
//
// 4 RIGHE:
//   1. Frequenza prevista       — numero + "sedute/settimana"
//   2. Durata stimata           — numero + "settimane"
//   3. Tecniche pianificate     — chip multi-select (catalogo + custom)
//   4. Obiettivi del paziente   — apre ClinicalGoalsModal
//
// COMPILATO/VUOTO (pallino verde):
//   - Frequenza: numero > 0
//   - Durata:    numero > 0
//   - Tecniche:  ≥1 tecnica selezionata
//   - Obiettivi: ≥1 obiettivo attivo
//
// SALVATAGGIO:
//   - Manuale per i primi 3 campi (bottone Salva header)
//   - Obiettivi: salvataggio diretto dentro la modale
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import {
  TREATMENT_TECHNIQUES, CATEGORY_LABELS, CATEGORY_ORDER,
  getTechniqueLabel, getTechniquesByCategory,
  type TechniqueCategory,
} from "@/src/lib/clinical/treatmentTechniques";
import ClinicalGoalsModal from "./ClinicalGoalsModal";
import AISuggestionModal from "./AISuggestionModal";
import { buildPatientContext, callClinicalAI } from "@/src/lib/clinical/buildPatientContext";

const T = {
  panelBg:     "#ffffff",
  panelSoft:   "#f8fafc",
  text:        "#0f172a",
  textSoft:    "#1e293b",
  muted:       "#475569",
  mutedSoft:   "#94a3b8",
  mutedLight:  "#cbd5e1",
  border:      "#e2e8f0",
  borderSoft:  "#f1f5f9",
  borderFaint: "#fafbfc",
  green:       "#16a34a",
  amber:       "#f59e0b",
  red:         "#dc2626",
  teal:        "#0d9488",
};

// ─── Tipi ──────────────────────────────────────────────────────

export type PlanData = {
  planned_frequency_per_week: number | null;
  planned_duration_weeks:     number | null;
  planned_techniques:         string[];
};

const EMPTY: PlanData = {
  planned_frequency_per_week: null,
  planned_duration_weeks:     null,
  planned_techniques:         [],
};

type FieldId = "frequency" | "duration" | "techniques" | "goals";

export type StructuredTreatmentPlanProps = {
  patientId: string;
  studioId: string;
  ownerId: string;
};

// ─── Componente principale ─────────────────────────────────

export default function StructuredTreatmentPlan({ patientId, studioId, ownerId }: StructuredTreatmentPlanProps) {

  const [data, setData] = useState<PlanData>(EMPTY);
  const initialData = useRef<PlanData>(EMPTY);

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const [editingField, setEditingField] = useState<FieldId | null>(null);

  const [goalsModalOpen, setGoalsModalOpen] = useState(false);
  const [goalsCounts, setGoalsCounts] = useState({ total: 0, active: 0, achieved: 0 });

  // ── AI Suggerimento piano (Tappa 10) ─────────────────────────
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{
    frequency_per_week: number;
    duration_weeks: number;
    techniques: string[];
    reasoning: string;
  } | null>(null);

  async function suggestPlanWithAI() {
    setAiModalOpen(true);
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const ctx = await buildPatientContext({
        patientId,
        sections: ["patient", "anamnesis", "redflags", "diagnosis", "tests"],
      });
      const result = await callClinicalAI("plan", ctx);
      if (!result?.frequency_per_week || !result?.duration_weeks) {
        throw new Error("Risposta AI incompleta");
      }
      setAiResult({
        frequency_per_week: Number(result.frequency_per_week) || 2,
        duration_weeks: Number(result.duration_weeks) || 6,
        techniques: Array.isArray(result.techniques) ? result.techniques : [],
        reasoning: result.reasoning || "",
      });
    } catch (e: any) {
      setAiError(e?.message || "Errore");
    } finally {
      setAiLoading(false);
    }
  }

  function applyAIPlanSuggestion() {
    if (!aiResult) return;

    // Mappa le label AI ai code interni (cerca tra TREATMENT_TECHNIQUES)
    const mappedCodes: string[] = [];
    for (const techLabel of aiResult.techniques) {
      // Match esatto su label
      const found = TREATMENT_TECHNIQUES.find(t =>
        t.label.toLowerCase() === techLabel.toLowerCase()
      );
      if (found) {
        mappedCodes.push(found.code);
      } else {
        // Aggiunge come custom (testo libero)
        mappedCodes.push(techLabel);
      }
    }

    setData(d => ({
      ...d,
      planned_frequency_per_week: aiResult.frequency_per_week,
      planned_duration_weeks: aiResult.duration_weeks,
      planned_techniques: mappedCodes,
    }));
    setAiModalOpen(false);
    setAiResult(null);
  }

  // ── Carica i dati esistenti ──
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: row } = await supabase
        .from("clinical_assessments")
        .select("planned_frequency_per_week, planned_duration_weeks, planned_techniques")
        .eq("patient_id", patientId)
        .maybeSingle();

      if (cancelled) return;

      const loaded: PlanData = row ? {
        planned_frequency_per_week: row.planned_frequency_per_week,
        planned_duration_weeks:     row.planned_duration_weeks,
        planned_techniques:         row.planned_techniques || [],
      } : EMPTY;

      setData(loaded);
      initialData.current = loaded;

      // Carica conteggi obiettivi
      const { data: goalsRows } = await supabase
        .from("clinical_goals")
        .select("status")
        .eq("patient_id", patientId);
      if (!cancelled) {
        const rows = goalsRows || [];
        setGoalsCounts({
          total: rows.length,
          active: rows.filter(g => g.status === "active").length,
          achieved: rows.filter(g => g.status === "achieved").length,
        });
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [patientId]);

  const dirty = JSON.stringify(data) !== JSON.stringify(initialData.current);

  const filled: Record<FieldId, boolean> = {
    frequency:  data.planned_frequency_per_week != null && data.planned_frequency_per_week > 0,
    duration:   data.planned_duration_weeks != null && data.planned_duration_weeks > 0,
    techniques: data.planned_techniques.length > 0,
    goals:      goalsCounts.active > 0,
  };

  const totalFilled = Object.values(filled).filter(Boolean).length;

  async function save() {
    setSaving(true); setSaved(false);

    // Merge con dati esistenti per non sovrascrivere campi della Tappa 5/6
    const { data: existing } = await supabase
      .from("clinical_assessments")
      .select("*")
      .eq("patient_id", patientId)
      .maybeSingle();

    const payload = {
      ...(existing || {
        studio_id: studioId,
        owner_id: ownerId,
        patient_id: patientId,
      }),
      planned_frequency_per_week: data.planned_frequency_per_week,
      planned_duration_weeks:     data.planned_duration_weeks,
      planned_techniques:         data.planned_techniques,
    };

    const { error } = await supabase
      .from("clinical_assessments")
      .upsert(payload, { onConflict: "patient_id" });

    if (error) {
      alert("Errore salvataggio: " + error.message);
      setSaving(false);
      return;
    }

    initialData.current = { ...data };
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  }

  function reset() {
    setData({ ...initialData.current });
    setEditingField(null);
  }

  function handleRowClick(field: FieldId) {
    if (field === "goals") {
      setGoalsModalOpen(true);
      return;
    }
    setEditingField(editingField === field ? null : field);
  }

  const toggleTechnique = useCallback((code: string) => {
    setData(d => {
      const has = d.planned_techniques.includes(code);
      return { ...d, planned_techniques: has
        ? d.planned_techniques.filter(c => c !== code)
        : [...d.planned_techniques, code] };
    });
  }, []);

  if (loading) {
    return (
      <div style={{
        padding: 24, textAlign: "center",
        color: T.muted, fontSize: 13,
        background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 14,
      }}>Caricamento piano…</div>
    );
  }

  return (
    <div style={{
      background: T.panelBg,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      overflow: "hidden",
    }}>

      {/* HEADER */}
      <div style={{
        padding: "14px 22px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "rgba(13,148,136,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15,
          }}>📌</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
              Piano di trattamento
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
              {totalFilled}/4 campi compilati
              {dirty && <span style={{ color: T.amber, marginLeft: 8, fontWeight: 700 }}>● modifiche non salvate</span>}
              {!dirty && saved && <span style={{ color: T.green, marginLeft: 8, fontWeight: 700 }}>✓ salvato</span>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={suggestPlanWithAI}
            disabled={saving}
            title="Suggerisce frequenza, durata e tecniche basate sulla diagnosi"
            style={{
              padding: "6px 12px", borderRadius: 7, border: "none",
              background: "linear-gradient(135deg, #7c3aed, #2563eb)",
              color: "#fff", fontWeight: 700, fontSize: 11,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.5 : 1,
              fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >✨ Suggerisci con AI</button>
          <button
            onClick={reset}
            disabled={!dirty || saving}
            style={{
              padding: "6px 12px", borderRadius: 7,
              border: `1px solid ${T.border}`, background: T.panelBg,
              color: T.muted, fontWeight: 600, fontSize: 12,
              cursor: dirty && !saving ? "pointer" : "not-allowed",
              opacity: dirty && !saving ? 1 : 0.4,
              fontFamily: "inherit",
            }}
          >Ripristina</button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{
              padding: "6px 14px", borderRadius: 7, border: "none",
              background: dirty ? "linear-gradient(135deg, #0d9488, #2563eb)" : T.borderSoft,
              color: dirty ? "#fff" : T.muted,
              fontWeight: 700, fontSize: 12,
              cursor: dirty && !saving ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >{saving ? "Salvataggio…" : "Salva"}</button>
        </div>
      </div>

      {/* RIGHE */}
      <div>
        <Row
          label="Frequenza prevista"
          filled={filled.frequency}
          editing={editingField === "frequency"}
          value={filled.frequency ? `${data.planned_frequency_per_week} sedute/settimana` : null}
          onClick={() => handleRowClick("frequency")}
        >
          <NumberEditor
            value={data.planned_frequency_per_week}
            placeholder="es. 2"
            suffix="sedute/settimana"
            min={0.5} step={0.5}
            onChange={v => setData(d => ({ ...d, planned_frequency_per_week: v }))}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Durata stimata"
          filled={filled.duration}
          editing={editingField === "duration"}
          value={filled.duration ? `${data.planned_duration_weeks} settimane` : null}
          onClick={() => handleRowClick("duration")}
        >
          <NumberEditor
            value={data.planned_duration_weeks}
            placeholder="es. 6"
            suffix="settimane"
            min={1} step={1} isInteger
            onChange={v => setData(d => ({ ...d, planned_duration_weeks: v }))}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Tecniche pianificate"
          filled={filled.techniques}
          editing={editingField === "techniques"}
          value={
            data.planned_techniques.length === 0
              ? null
              : data.planned_techniques.length <= 4
                ? data.planned_techniques.map(getTechniqueLabel).join(", ")
                : `${data.planned_techniques.slice(0, 3).map(getTechniqueLabel).join(", ")} +${data.planned_techniques.length - 3} altre`
          }
          onClick={() => handleRowClick("techniques")}
        >
          <TechniquesEditor
            selected={data.planned_techniques}
            onToggle={toggleTechnique}
            onChange={chips => setData(d => ({ ...d, planned_techniques: chips }))}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Obiettivi del paziente"
          filled={filled.goals}
          editing={false}
          value={
            goalsCounts.total === 0
              ? null
              : goalsCounts.active > 0
                ? `${goalsCounts.active} attivi${goalsCounts.achieved > 0 ? ` · ${goalsCounts.achieved} raggiunti` : ""}`
                : `${goalsCounts.achieved} raggiunti · 0 attivi`
          }
          onClick={() => handleRowClick("goals")}
          isLast
        >
          <></>
        </Row>
      </div>

      {/* Modale obiettivi */}
      <ClinicalGoalsModal
        patientId={patientId}
        studioId={studioId}
        ownerId={ownerId}
        open={goalsModalOpen}
        onClose={() => setGoalsModalOpen(false)}
        onChange={c => setGoalsCounts(c)}
      />

      {/* Modale AI suggerimento piano (Tappa 10) */}
      <AISuggestionModal
        open={aiModalOpen}
        title="📋 Piano di trattamento suggerito"
        loading={aiLoading}
        error={aiError}
        onClose={() => { setAiModalOpen(false); setAiResult(null); setAiError(null); }}
        onApply={applyAIPlanSuggestion}
        applyLabel="Applica piano"
        applyDisabled={!aiResult}
      >
        {aiResult && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
                  Frequenza
                </div>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  value={aiResult.frequency_per_week}
                  onChange={e => setAiResult({ ...aiResult, frequency_per_week: parseFloat(e.target.value) || 0 })}
                  style={{
                    width: "100%", padding: "8px 10px",
                    border: "1.5px solid #7c3aed", borderRadius: 8,
                    fontSize: 14, fontFamily: "inherit", color: "#0f172a",
                    fontWeight: 700, outline: "none",
                  }}
                />
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>sedute/settimana</div>
              </div>

              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
                  Durata
                </div>
                <input
                  type="number"
                  step={1}
                  min={1}
                  value={aiResult.duration_weeks}
                  onChange={e => setAiResult({ ...aiResult, duration_weeks: parseInt(e.target.value) || 0 })}
                  style={{
                    width: "100%", padding: "8px 10px",
                    border: "1.5px solid #7c3aed", borderRadius: 8,
                    fontSize: 14, fontFamily: "inherit", color: "#0f172a",
                    fontWeight: 700, outline: "none",
                  }}
                />
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>settimane</div>
              </div>
            </div>

            {aiResult.techniques.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
                  Tecniche pianificate ({aiResult.techniques.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {aiResult.techniques.map((t, i) => (
                    <span key={i} style={{
                      padding: "5px 11px", borderRadius: 99,
                      background: "#0f172a", color: "#fff",
                      fontWeight: 700, fontSize: 11,
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                      {t}
                      <span
                        onClick={() => setAiResult({
                          ...aiResult,
                          techniques: aiResult.techniques.filter((_, j) => j !== i)
                        })}
                        style={{ opacity: 0.6, cursor: "pointer" }}
                      >×</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiResult.reasoning && (
              <div style={{
                padding: 12, borderRadius: 8,
                background: "rgba(124,58,237,0.05)",
                borderLeft: "3px solid #7c3aed",
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Razionale
                </div>
                <div style={{ fontSize: 12, color: "#1e293b", lineHeight: 1.5 }}>
                  {aiResult.reasoning}
                </div>
              </div>
            )}
          </div>
        )}
      </AISuggestionModal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROW: pattern checklist
// ═══════════════════════════════════════════════════════════════════

function Row({
  label, filled, editing, value, onClick, children, isLast,
}: {
  label: string;
  filled: boolean;
  editing: boolean;
  value: string | null;
  onClick: () => void;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div style={{
      borderBottom: isLast ? "none" : `1px solid ${T.borderSoft}`,
      background: editing ? T.borderFaint : "transparent",
      transition: "background 0.12s",
    }}>
      <div
        onClick={onClick}
        style={{
          display: "grid",
          gridTemplateColumns: "14px 170px 1fr 14px",
          gap: 12,
          padding: "13px 22px",
          alignItems: "center",
          cursor: "pointer",
        }}
        onMouseEnter={e => { if (!editing) e.currentTarget.style.background = T.borderFaint; }}
        onMouseLeave={e => { if (!editing) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{
          width: 9, height: 9, borderRadius: "50%",
          background: filled ? T.green : T.border,
          flexShrink: 0,
        }} />

        <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>{label}</span>

        <span style={{
          fontSize: 13,
          color: value ? T.text : T.mutedLight,
          fontStyle: value ? "normal" : "italic",
          fontWeight: 500,
          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {value || "— Non specificato"}
        </span>

        <span style={{
          color: T.mutedLight, fontSize: 13, textAlign: "right",
          transform: editing ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.15s",
        }}>›</span>
      </div>

      {editing && (
        <div style={{ padding: "0 22px 16px", background: T.borderFaint }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EDITOR: input numerico con suffisso
// ═══════════════════════════════════════════════════════════════════

function NumberEditor({
  value, placeholder, suffix, min, step, isInteger, onChange, onClose,
}: {
  value: number | null;
  placeholder?: string;
  suffix?: string;
  min?: number;
  step?: number;
  isInteger?: boolean;
  onChange: (v: number | null) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      background: T.panelBg, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: 12,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          value={value ?? ""}
          min={min}
          step={step}
          onChange={e => {
            const v = e.target.value;
            if (!v) { onChange(null); return; }
            const n = isInteger ? parseInt(v) : parseFloat(v);
            onChange(isNaN(n) ? null : n);
          }}
          placeholder={placeholder}
          autoFocus
          style={{
            width: 120, padding: "8px 10px",
            border: `1px solid ${T.border}`, borderRadius: 6,
            fontSize: 13, fontFamily: "inherit", color: T.text,
            outline: "none",
          }}
        />
        {suffix && (
          <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{suffix}</span>
        )}
      </div>
      <EditorClose onClose={onClose} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EDITOR: Tecniche (catalogo per categoria + custom)
// ═══════════════════════════════════════════════════════════════════

function TechniquesEditor({
  selected, onToggle, onChange, onClose,
}: {
  selected: string[];
  onToggle: (code: string) => void;
  onChange: (chips: string[]) => void;
  onClose: () => void;
}) {
  const grouped = getTechniquesByCategory();
  const [openCategory, setOpenCategory] = useState<TechniqueCategory | null>("manual");
  const [customInput, setCustomInput] = useState("");

  function toggleCategory(c: TechniqueCategory) {
    setOpenCategory(openCategory === c ? null : c);
  }

  function addCustom(text: string) {
    const trimmed = text.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange([...selected, trimmed]);
    setCustomInput("");
  }

  // Tecniche custom (non nel catalogo)
  const customs = selected.filter(s => !TREATMENT_TECHNIQUES.find(t => t.code === s));

  function countInCategory(c: TechniqueCategory): number {
    const techs = grouped[c] || [];
    return techs.filter(t => selected.includes(t.code)).length;
  }

  return (
    <div style={{
      background: T.panelBg, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: 12, maxHeight: 420, overflowY: "auto",
    }}>
      {/* Chip selezionate sopra */}
      {selected.length > 0 && (
        <div style={{
          padding: 10, background: T.panelSoft, borderRadius: 6,
          marginBottom: 10, border: `1px solid ${T.borderSoft}`,
          display: "flex", flexWrap: "wrap", gap: 5,
        }}>
          {selected.map(code => (
            <span
              key={code}
              onClick={() => onToggle(code)}
              style={{
                padding: "3px 9px", borderRadius: 99,
                background: T.text, color: "#fff",
                fontWeight: 700, fontSize: 11, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              {getTechniqueLabel(code)} <span style={{ opacity: 0.7 }}>×</span>
            </span>
          ))}
        </div>
      )}

      {/* Categorie collapsabili */}
      {CATEGORY_ORDER.map(c => {
        const techs = grouped[c] || [];
        if (techs.length === 0) return null;
        const isOpen = openCategory === c;
        const count = countInCategory(c);
        return (
          <div key={c} style={{ marginBottom: isOpen ? 8 : 0 }}>
            <button
              onClick={() => toggleCategory(c)}
              style={{
                width: "100%", padding: "8px 4px",
                background: "transparent", border: "none",
                borderBottom: `1px solid ${T.borderSoft}`,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                fontSize: 12, fontWeight: 700, color: T.textSoft,
              }}
            >
              <span>
                {CATEGORY_LABELS[c]}
                {count > 0 && (
                  <span style={{
                    background: T.green, color: "#fff",
                    padding: "1px 7px", borderRadius: 10,
                    fontSize: 10, fontWeight: 800, marginLeft: 8,
                  }}>{count}</span>
                )}
              </span>
              <span style={{ fontSize: 11, color: T.mutedSoft }}>{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "10px 4px 4px", display: "flex", flexWrap: "wrap", gap: 5 }}>
                {techs.map(t => {
                  const isSel = selected.includes(t.code);
                  return (
                    <button
                      key={t.code}
                      onClick={() => onToggle(t.code)}
                      style={{
                        padding: "4px 11px", borderRadius: 99,
                        border: `1px solid ${isSel ? T.text : T.border}`,
                        background: isSel ? T.text : T.panelBg,
                        color: isSel ? "#fff" : T.muted,
                        fontWeight: isSel ? 700 : 600, fontSize: 12,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >{t.label}</button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Input custom */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.borderSoft}` }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
          Tecnica personalizzata
        </div>
        <input
          type="text"
          value={customInput}
          onChange={e => setCustomInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(customInput); } }}
          placeholder="Scrivi una tecnica non in lista e premi invio…"
          style={{
            width: "100%", padding: "7px 10px",
            border: `1px solid ${T.border}`, borderRadius: 6,
            fontSize: 12, fontFamily: "inherit", color: T.text,
            background: T.panelBg, outline: "none",
          }}
        />
      </div>

      <EditorClose onClose={onClose} />
    </div>
  );
}

function EditorClose({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
      <button
        onClick={onClose}
        style={{
          padding: "5px 14px", borderRadius: 6,
          border: `1px solid ${T.border}`, background: T.panelBg,
          color: T.muted, fontWeight: 700, fontSize: 11,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >Chiudi</button>
    </div>
  );
}
