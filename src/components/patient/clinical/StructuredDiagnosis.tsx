// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/StructuredDiagnosis.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Form strutturato per la Diagnosi del paziente (Tappa 6 refactor UX).
//
// STILE: stesso "checklist con pallini" della Tappa 5 (Anamnesi).
//
// 3 RIGHE:
//   1. Diagnosi principale     — input testo singola riga
//   2. Diagnosi differenziali  — chip multi-select (testo libero + Enter)
//   3. Test eseguiti           — apre modale OrthopedicTestsModal
//
// COMPILATO/VUOTO (pallino verde):
//   - Diagnosi principale: testo non vuoto
//   - Differenziali:       ≥1 chip
//   - Test eseguiti:       ≥1 test
//
// SALVATAGGIO:
//   - Manuale per i primi 2 campi (bottone Salva header)
//   - Test eseguiti: salvataggio diretto dentro la modale
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import OrthopedicTestsModal from "./OrthopedicTestsModal";

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

export type DiagnosisData = {
  primary_diagnosis:      string | null;
  differential_diagnoses: string[];
};

const EMPTY: DiagnosisData = {
  primary_diagnosis:      null,
  differential_diagnoses: [],
};

type FieldId = "primary" | "differentials" | "tests";

export type StructuredDiagnosisProps = {
  patientId: string;
  studioId: string;
  ownerId: string;
};

// ─── Componente principale ─────────────────────────────────────

export default function StructuredDiagnosis({ patientId, studioId, ownerId }: StructuredDiagnosisProps) {

  const [data, setData] = useState<DiagnosisData>(EMPTY);
  const initialData = useRef<DiagnosisData>(EMPTY);

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const [editingField, setEditingField] = useState<FieldId | null>(null);

  const [testsModalOpen, setTestsModalOpen] = useState(false);
  const [testCounts, setTestCounts] = useState({ total: 0, positive: 0, negative: 0 });

  // ── Carica i dati esistenti ──
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: row } = await supabase
        .from("clinical_assessments")
        .select("primary_diagnosis, differential_diagnoses")
        .eq("patient_id", patientId)
        .maybeSingle();

      if (cancelled) return;

      const loaded: DiagnosisData = row ? {
        primary_diagnosis:      row.primary_diagnosis,
        differential_diagnoses: row.differential_diagnoses || [],
      } : EMPTY;

      setData(loaded);
      initialData.current = loaded;

      // Carica conteggi test
      const { data: testsRows } = await supabase
        .from("clinical_tests")
        .select("result")
        .eq("patient_id", patientId);
      if (!cancelled) {
        const rows = testsRows || [];
        setTestCounts({
          total:    rows.length,
          positive: rows.filter(r => r.result === "positive").length,
          negative: rows.filter(r => r.result === "negative").length,
        });
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [patientId]);

  const dirty = JSON.stringify(data) !== JSON.stringify(initialData.current);

  const filled: Record<FieldId, boolean> = {
    primary:       !!data.primary_diagnosis && data.primary_diagnosis.trim().length > 0,
    differentials: data.differential_diagnoses.length > 0,
    tests:         testCounts.total > 0,
  };

  const totalFilled = Object.values(filled).filter(Boolean).length;

  async function save() {
    setSaving(true); setSaved(false);

    // Recupera primo i dati esistenti (per non sovrascrivere campi della Tappa 5)
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
      primary_diagnosis:      data.primary_diagnosis?.trim() || null,
      differential_diagnoses: data.differential_diagnoses,
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
    if (field === "tests") {
      setTestsModalOpen(true);
      return;
    }
    setEditingField(editingField === field ? null : field);
  }

  if (loading) {
    return (
      <div style={{
        padding: 24, textAlign: "center",
        color: T.muted, fontSize: 13,
        background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 14,
      }}>Caricamento diagnosi…</div>
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
          }}>🧠</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
              Diagnosi clinica
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
              {totalFilled}/3 campi compilati
              {dirty && <span style={{ color: T.amber, marginLeft: 8, fontWeight: 700 }}>● modifiche non salvate</span>}
              {!dirty && saved && <span style={{ color: T.green, marginLeft: 8, fontWeight: 700 }}>✓ salvato</span>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
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
          label="Diagnosi principale"
          filled={filled.primary}
          editing={editingField === "primary"}
          value={data.primary_diagnosis || null}
          onClick={() => handleRowClick("primary")}
        >
          <TextInputEditor
            value={data.primary_diagnosis || ""}
            placeholder="es. Sindrome facettale L4-L5"
            onChange={v => setData(d => ({ ...d, primary_diagnosis: v }))}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Diagnosi differenziali"
          filled={filled.differentials}
          editing={editingField === "differentials"}
          value={data.differential_diagnoses.length === 0 ? null : data.differential_diagnoses.join(", ")}
          onClick={() => handleRowClick("differentials")}
        >
          <ChipsTextEditor
            chips={data.differential_diagnoses}
            onChange={chips => setData(d => ({ ...d, differential_diagnoses: chips }))}
            placeholder="es. Ernia discale L4-L5, scrivi e invio"
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Test eseguiti"
          filled={filled.tests}
          editing={false}
          value={
            testCounts.total === 0
              ? null
              : `${testCounts.total} test · ${testCounts.positive} pos · ${testCounts.negative} neg`
          }
          onClick={() => handleRowClick("tests")}
          isLast
        >
          <></>
        </Row>
      </div>

      {/* Modale test */}
      <OrthopedicTestsModal
        patientId={patientId}
        studioId={studioId}
        ownerId={ownerId}
        open={testsModalOpen}
        onClose={() => setTestsModalOpen(false)}
        onChange={c => setTestCounts(c)}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROW: stesso pattern di Tappa 5
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
// EDITOR: input testo singola riga
// ═══════════════════════════════════════════════════════════════════

function TextInputEditor({
  value, placeholder, onChange, onClose,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      background: T.panelBg, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: 12,
    }}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onClose(); } }}
        placeholder={placeholder}
        autoFocus
        style={{
          width: "100%", padding: "8px 10px",
          border: `1px solid ${T.border}`, borderRadius: 6,
          fontSize: 13, fontFamily: "inherit", color: T.text,
          background: T.panelBg, outline: "none",
        }}
      />
      <EditorClose onClose={onClose} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EDITOR: ChipsText (lista di chip da input libero)
// ═══════════════════════════════════════════════════════════════════

function ChipsTextEditor({
  chips, placeholder, onChange, onClose,
}: {
  chips: string[];
  placeholder?: string;
  onChange: (chips: string[]) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");

  function addChip(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chips.includes(trimmed)) return;
    onChange([...chips, trimmed]);
    setInput("");
  }
  function removeChip(text: string) {
    onChange(chips.filter(c => c !== text));
  }

  return (
    <div style={{
      background: T.panelBg, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: 12,
    }}>
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {chips.map(c => (
            <span
              key={c}
              onClick={() => removeChip(c)}
              style={{
                padding: "3px 9px", borderRadius: 99,
                background: T.text, color: "#fff",
                fontWeight: 700, fontSize: 11, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              {c} <span style={{ opacity: 0.6 }}>×</span>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addChip(input); } }}
        placeholder={placeholder}
        autoFocus
        style={{
          width: "100%", padding: "7px 10px",
          border: `1px solid ${T.border}`, borderRadius: 6,
          fontSize: 12, fontFamily: "inherit", color: T.text,
          background: T.panelBg, outline: "none",
        }}
      />

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
