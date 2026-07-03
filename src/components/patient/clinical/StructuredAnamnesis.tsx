// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/StructuredAnamnesis.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Form strutturato per l'Anamnesi del paziente (Tappa 5 refactor UX — v2).
//
// STILE: Variante A "checklist con pallini" — scelta da Marco dopo aver
// trovato la v1 troppo caotica (troppi chip colorati visibili insieme).
//
// LAYOUT:
//   - Header card con titolo + contatore "X/8" + bottoni Salva/Ripristina
//   - 8 righe pulite, una per campo:
//       [pallino verde/grigio] [etichetta]  [valore]  [chevron ›]
//   - Riga "in lettura": testo del valore o "— Non specificato"
//   - Riga "in modifica" (click): si espande inline con editor specifico
//   - Niente icone emoji sulle righe (solo 🩺 nel header)
//   - Niente chip colorati nei valori — testo separato da virgole
//
// COMPILATO/VUOTO (pallino verde):
//   - Sede dolore: ≥1 zona
//   - Durata:      numero E unità
//   - Insorgenza:  selezionata
//   - Frequenza:   selezionata
//   - Caratteristiche: ≥1
//   - Aggravato:   ≥1 chip
//   - Alleviato:   ≥1 chip
//   - Red flags:   ≥1 valutata (presente O esclusa)
//
// SALVATAGGIO:
//   - Manuale, bottone "Salva" in alto a destra
//   - Badge "● modifiche" quando dirty, "✓ salvato" 2s dopo successo
//   - Red flags salvano in tempo reale (dentro modale)
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { PAIN_DISTRICTS, getPainLocationLabel, type PainLocation } from "@/src/lib/clinical/painLocations";
import {
  ONSET_TYPES, PAIN_FREQUENCIES, PAIN_CHARACTERISTICS,
  DURATION_UNITS, COMMON_AGGRAVATING_FACTORS, COMMON_RELIEVING_FACTORS,
  labelOf,
} from "@/src/lib/clinical/anamnesisOptions";
import RedFlagsModal from "./RedFlagsModal";
import { VoiceAnamnesisModal } from "./VoiceAnamnesisModal";

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

export type AnamnesisData = {
  pain_locations:       string[];
  duration_value:       number | null;
  duration_unit:        string | null;
  onset_type:           string | null;
  pain_frequency:       string | null;
  pain_characteristics: string[];
  aggravating_factors:  string[];
  relieving_factors:    string[];
};

const EMPTY: AnamnesisData = {
  pain_locations: [],
  duration_value: null,
  duration_unit: null,
  onset_type: null,
  pain_frequency: null,
  pain_characteristics: [],
  aggravating_factors: [],
  relieving_factors: [],
};

type FieldId = "locations" | "duration" | "onset" | "frequency" | "characteristics" | "aggravating" | "relieving" | "redflags";

export type StructuredAnamnesisProps = {
  patientId: string;
  studioId: string;
  ownerId: string;
};

export default function StructuredAnamnesis({ patientId, studioId, ownerId }: StructuredAnamnesisProps) {

  const [data, setData] = useState<AnamnesisData>(EMPTY);
  const initialData = useRef<AnamnesisData>(EMPTY);

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const [redFlagsModalOpen, setRedFlagsModalOpen] = useState(false);
  const [redFlagsPresent,   setRedFlagsPresent]   = useState(0);
  const [redFlagsExcluded,  setRedFlagsExcluded]  = useState(0);

  const [editingField, setEditingField] = useState<FieldId | null>(null);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: row } = await supabase
        .from("clinical_assessments")
        .select("pain_locations, duration_value, duration_unit, onset_type, pain_frequency, pain_characteristics, aggravating_factors, relieving_factors")
        .eq("patient_id", patientId)
        .maybeSingle();

      if (cancelled) return;

      const loaded: AnamnesisData = row ? {
        pain_locations:       row.pain_locations || [],
        duration_value:       row.duration_value,
        duration_unit:        row.duration_unit,
        onset_type:           row.onset_type,
        pain_frequency:       row.pain_frequency,
        pain_characteristics: row.pain_characteristics || [],
        aggravating_factors:  row.aggravating_factors || [],
        relieving_factors:    row.relieving_factors || [],
      } : EMPTY;

      setData(loaded);
      initialData.current = loaded;

      const [{ count: presCount }, { count: exclCount }] = await Promise.all([
        supabase.from("clinical_red_flags").select("*", { count: "exact", head: true })
          .eq("patient_id", patientId).eq("is_present", true),
        supabase.from("clinical_red_flags").select("*", { count: "exact", head: true })
          .eq("patient_id", patientId).eq("is_present", false),
      ]);
      if (!cancelled) {
        setRedFlagsPresent(presCount ?? 0);
        setRedFlagsExcluded(exclCount ?? 0);
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [patientId]);

  const dirty = JSON.stringify(data) !== JSON.stringify(initialData.current);

  const filled: Record<FieldId, boolean> = {
    locations:       data.pain_locations.length > 0,
    duration:        data.duration_value != null && !!data.duration_unit,
    onset:           !!data.onset_type,
    frequency:       !!data.pain_frequency,
    characteristics: data.pain_characteristics.length > 0,
    aggravating:     data.aggravating_factors.length > 0,
    relieving:       data.relieving_factors.length > 0,
    redflags:        redFlagsPresent + redFlagsExcluded > 0,
  };

  const totalFilled = Object.values(filled).filter(Boolean).length;

  async function save(next?: AnamnesisData) {
    const d = next ?? data;
    setSaving(true); setSaved(false);
    const payload = {
      studio_id: studioId,
      owner_id: ownerId,
      patient_id: patientId,
      ...d,
    };
    const { error } = await supabase
      .from("clinical_assessments")
      .upsert(payload, { onConflict: "patient_id" });
    if (error) {
      alert("Errore salvataggio: " + error.message);
      setSaving(false);
      return;
    }
    initialData.current = { ...d };
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2500);
  }

  // ── Anamnesi vocale: applica i campi approvati e salva subito ──
  const [voiceOpen, setVoiceOpen] = useState(false);

  async function applyVoice(
    partial: Partial<AnamnesisData>,
    extras: { occupation?: string | null; sport?: string | null }
  ) {
    const merged: AnamnesisData = { ...data, ...partial };
    setData(merged);
    await save(merged);
    // Professione/sport vivono sulla scheda paziente
    if (extras.occupation !== undefined || extras.sport !== undefined) {
      const patch: Record<string, string | null> = {};
      if (extras.occupation !== undefined) patch.occupation = extras.occupation;
      if (extras.sport !== undefined) patch.sport = extras.sport;
      await supabase.from("patients").update(patch).eq("id", patientId);
    }
  }

  function reset() {
    setData({ ...initialData.current });
    setEditingField(null);
  }

  const toggleLocation = useCallback((code: string) => {
    setData(d => {
      const has = d.pain_locations.includes(code);
      return { ...d, pain_locations: has
        ? d.pain_locations.filter(c => c !== code)
        : [...d.pain_locations, code] };
    });
  }, []);

  const toggleCharacteristic = useCallback((code: string) => {
    setData(d => {
      const has = d.pain_characteristics.includes(code);
      return { ...d, pain_characteristics: has
        ? d.pain_characteristics.filter(c => c !== code)
        : [...d.pain_characteristics, code] };
    });
  }, []);

  function handleRowClick(field: FieldId) {
    if (field === "redflags") {
      setRedFlagsModalOpen(true);
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
      }}>Caricamento anamnesi…</div>
    );
  }

  return (
    <div style={{
      background: T.panelBg,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      overflow: "hidden",
    }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
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
          }}>🩺</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
              Quadro clinico — Anamnesi
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
              {totalFilled}/8 campi compilati
              {dirty && <span style={{ color: T.amber, marginLeft: 8, fontWeight: 700 }}>● modifiche non salvate</span>}
              {!dirty && saved && <span style={{ color: T.green, marginLeft: 8, fontWeight: 700 }}>✓ salvato</span>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setVoiceOpen(true)}
            title="Detta la valutazione: l'AI compila i campi strutturati"
            style={{
              padding: "6px 12px", borderRadius: 7, border: "none",
              background: "linear-gradient(135deg, #7c3aed, #2563eb)",
              color: "#fff", fontWeight: 700, fontSize: 11,
              cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >🎙 Vocale</button>
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
            onClick={() => save()}
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

      {/* ── RIGHE ─────────────────────────────────────────────── */}
      <div>
        <Row
          label="Sede del dolore"
          filled={filled.locations}
          editing={editingField === "locations"}
          value={data.pain_locations.length === 0 ? null : data.pain_locations.map(getPainLocationLabel).join(", ")}
          onClick={() => handleRowClick("locations")}
        >
          <LocationsEditor
            selected={data.pain_locations}
            onToggle={toggleLocation}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Durata"
          filled={filled.duration}
          editing={editingField === "duration"}
          value={filled.duration ? `${data.duration_value} ${labelOf(DURATION_UNITS, data.duration_unit)}` : null}
          onClick={() => handleRowClick("duration")}
        >
          <DurationEditor
            value={data.duration_value}
            unit={data.duration_unit}
            onChange={(v, u) => setData(d => ({ ...d, duration_value: v, duration_unit: u }))}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Insorgenza"
          filled={filled.onset}
          editing={editingField === "onset"}
          value={labelOf(ONSET_TYPES, data.onset_type)}
          onClick={() => handleRowClick("onset")}
        >
          <SingleChoiceEditor
            options={ONSET_TYPES}
            current={data.onset_type}
            onChange={v => setData(d => ({ ...d, onset_type: v }))}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Frequenza"
          filled={filled.frequency}
          editing={editingField === "frequency"}
          value={labelOf(PAIN_FREQUENCIES, data.pain_frequency)}
          onClick={() => handleRowClick("frequency")}
        >
          <SingleChoiceEditor
            options={PAIN_FREQUENCIES}
            current={data.pain_frequency}
            onChange={v => setData(d => ({ ...d, pain_frequency: v }))}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Caratteristiche"
          filled={filled.characteristics}
          editing={editingField === "characteristics"}
          value={data.pain_characteristics.length === 0 ? null : data.pain_characteristics.map(c => labelOf(PAIN_CHARACTERISTICS, c)).join(", ")}
          onClick={() => handleRowClick("characteristics")}
        >
          <MultiChoiceEditor
            options={PAIN_CHARACTERISTICS}
            current={data.pain_characteristics}
            onToggle={toggleCharacteristic}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Aggravato da"
          filled={filled.aggravating}
          editing={editingField === "aggravating"}
          value={data.aggravating_factors.length === 0 ? null : data.aggravating_factors.join(", ")}
          onClick={() => handleRowClick("aggravating")}
        >
          <ChipsTextEditor
            chips={data.aggravating_factors}
            suggestions={COMMON_AGGRAVATING_FACTORS}
            onChange={chips => setData(d => ({ ...d, aggravating_factors: chips }))}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Alleviato da"
          filled={filled.relieving}
          editing={editingField === "relieving"}
          value={data.relieving_factors.length === 0 ? null : data.relieving_factors.join(", ")}
          onClick={() => handleRowClick("relieving")}
        >
          <ChipsTextEditor
            chips={data.relieving_factors}
            suggestions={COMMON_RELIEVING_FACTORS}
            onChange={chips => setData(d => ({ ...d, relieving_factors: chips }))}
            onClose={() => setEditingField(null)}
          />
        </Row>

        <Row
          label="Red flags"
          filled={filled.redflags}
          editing={false}
          value={
            redFlagsPresent === 0 && redFlagsExcluded === 0
              ? null
              : redFlagsPresent > 0
                ? `${redFlagsPresent} presenti${redFlagsExcluded > 0 ? ` · ${redFlagsExcluded} escluse` : ""}`
                : `Nessuna presente · ${redFlagsExcluded} valutate`
          }
          valueColor={redFlagsPresent > 0 ? T.red : undefined}
          onClick={() => handleRowClick("redflags")}
          isLast
        >
          <></>
        </Row>
      </div>

      {/* ── Modale anamnesi vocale ────────────────────────────── */}
      <VoiceAnamnesisModal
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        current={data}
        onApply={applyVoice}
      />

      {/* ── Modale red flags ──────────────────────────────────── */}
      <RedFlagsModal
        patientId={patientId}
        studioId={studioId}
        ownerId={ownerId}
        open={redFlagsModalOpen}
        onClose={() => setRedFlagsModalOpen(false)}
        onChange={count => {
          setRedFlagsPresent(count);
          (async () => {
            const { count: excl } = await supabase
              .from("clinical_red_flags")
              .select("*", { count: "exact", head: true })
              .eq("patient_id", patientId).eq("is_present", false);
            setRedFlagsExcluded(excl ?? 0);
          })();
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROW: pallino + etichetta + valore (e editor inline opzionale)
// ═══════════════════════════════════════════════════════════════════

function Row({
  label, filled, editing, value, valueColor, onClick, children, isLast,
}: {
  label: string;
  filled: boolean;
  editing: boolean;
  value: string | null;
  valueColor?: string;
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

        <span style={{
          fontSize: 13, fontWeight: 600, color: T.muted,
        }}>{label}</span>

        <span style={{
          fontSize: 13,
          color: value ? (valueColor || T.text) : T.mutedLight,
          fontStyle: value ? "normal" : "italic",
          fontWeight: value && valueColor ? 700 : 500,
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
// EDITOR: Sede del dolore
// ═══════════════════════════════════════════════════════════════════

function LocationsEditor({
  selected, onToggle, onClose,
}: {
  selected: string[];
  onToggle: (code: string) => void;
  onClose: () => void;
}) {
  const [openDistrict, setOpenDistrict] = useState<string | null>(PAIN_DISTRICTS[0]?.id || null);

  function countInDistrict(districtId: string): number {
    const district = PAIN_DISTRICTS.find(d => d.id === districtId);
    if (!district) return 0;
    let count = 0;
    for (const z of district.zones) {
      if (z.bilateral) {
        if (selected.includes(`${z.code}_left`)) count++;
        if (selected.includes(`${z.code}_right`)) count++;
        if (selected.includes(`${z.code}_bilateral`)) count++;
      } else if (selected.includes(z.code)) count++;
    }
    return count;
  }

  return (
    <div style={{
      background: T.panelBg, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: 12, maxHeight: 380, overflowY: "auto",
    }}>
      {PAIN_DISTRICTS.map(d => {
        const count = countInDistrict(d.id);
        const isOpen = openDistrict === d.id;
        return (
          <div key={d.id} style={{ marginBottom: isOpen ? 8 : 0 }}>
            <button
              onClick={() => setOpenDistrict(isOpen ? null : d.id)}
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
                {d.label}
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
                {d.zones.map(z => <ZoneButton key={z.code} zone={z} selected={selected} onToggle={onToggle} />)}
              </div>
            )}
          </div>
        );
      })}
      <EditorClose onClose={onClose} />
    </div>
  );
}

function ZoneButton({
  zone, selected, onToggle,
}: { zone: PainLocation; selected: string[]; onToggle: (code: string) => void; }) {
  if (!zone.bilateral) {
    const isSel = selected.includes(zone.code);
    return (
      <Chip selected={isSel} onClick={() => onToggle(zone.code)}>{zone.label}</Chip>
    );
  }
  return (
    <div style={{
      display: "inline-flex", border: `1px solid ${T.border}`, borderRadius: 99,
      overflow: "hidden", height: 26,
    }}>
      <span style={{
        padding: "4px 10px", background: T.borderSoft,
        fontSize: 11, fontWeight: 700, color: T.muted,
        display: "inline-flex", alignItems: "center",
      }}>
        {zone.label}
      </span>
      {(["left", "right", "bilateral"] as const).map(side => {
        const code = `${zone.code}_${side}`;
        const isSel = selected.includes(code);
        return (
          <button
            key={side}
            onClick={() => onToggle(code)}
            style={{
              padding: "0 9px", border: "none",
              background: isSel ? T.text : T.panelBg,
              color: isSel ? "#fff" : T.muted,
              fontWeight: 700, fontSize: 11, cursor: "pointer",
              fontFamily: "inherit",
              borderLeft: `1px solid ${T.border}`,
            }}
          >
            {side === "left" ? "sx" : side === "right" ? "dx" : "bil"}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EDITOR: Durata
// ═══════════════════════════════════════════════════════════════════

function DurationEditor({
  value, unit, onChange, onClose,
}: {
  value: number | null;
  unit: string | null;
  onChange: (v: number | null, u: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      background: T.panelBg, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: 14,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          min={1}
          value={value ?? ""}
          onChange={e => {
            const v = e.target.value;
            onChange(v ? parseInt(v) : null, unit);
          }}
          placeholder="es. 3"
          style={{
            width: 100, padding: "8px 10px",
            border: `1px solid ${T.border}`, borderRadius: 6,
            fontSize: 13, fontFamily: "inherit", color: T.text, outline: "none",
          }}
        />
        <select
          value={unit ?? ""}
          onChange={e => onChange(value, e.target.value || null)}
          style={{
            flex: 1, padding: "8px 10px",
            border: `1px solid ${T.border}`, borderRadius: 6,
            fontSize: 13, fontFamily: "inherit", color: T.text,
            background: T.panelBg, outline: "none",
          }}
        >
          <option value="">— unità —</option>
          {DURATION_UNITS.map(u => (
            <option key={u.code} value={u.code}>{u.label}</option>
          ))}
        </select>
      </div>
      <EditorClose onClose={onClose} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EDITOR: SingleChoice
// ═══════════════════════════════════════════════════════════════════

function SingleChoiceEditor({
  options, current, onChange, onClose,
}: {
  options: ReadonlyArray<{ code: string; label: string; description?: string }>;
  current: string | null;
  onChange: (v: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      background: T.panelBg, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: 12,
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {options.map(o => (
          <Chip
            key={o.code}
            selected={current === o.code}
            onClick={() => onChange(current === o.code ? null : o.code)}
            title={o.description}
          >
            {o.label}
          </Chip>
        ))}
      </div>
      <EditorClose onClose={onClose} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EDITOR: MultiChoice
// ═══════════════════════════════════════════════════════════════════

function MultiChoiceEditor({
  options, current, onToggle, onClose,
}: {
  options: ReadonlyArray<{ code: string; label: string }>;
  current: string[];
  onToggle: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      background: T.panelBg, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: 12,
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {options.map(o => (
          <Chip
            key={o.code}
            selected={current.includes(o.code)}
            onClick={() => onToggle(o.code)}
          >
            {o.label}
          </Chip>
        ))}
      </div>
      <EditorClose onClose={onClose} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EDITOR: ChipsText
// ═══════════════════════════════════════════════════════════════════

function ChipsTextEditor({
  chips, suggestions, onChange, onClose,
}: {
  chips: string[];
  suggestions: string[];
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

  const available = suggestions.filter(s => !chips.includes(s));

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
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); addChip(input); }
        }}
        placeholder="Scrivi e premi invio, o scegli dai suggerimenti…"
        style={{
          width: "100%", padding: "7px 10px",
          border: `1px solid ${T.border}`, borderRadius: 6,
          fontSize: 12, fontFamily: "inherit", color: T.text,
          background: T.panelBg, outline: "none",
        }}
      />

      {available.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: T.mutedSoft, fontWeight: 700, marginTop: 8, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Suggerimenti
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {available.slice(0, 12).map(s => (
              <Chip key={s} selected={false} onClick={() => addChip(s)}>{s}</Chip>
            ))}
          </div>
        </>
      )}

      <EditorClose onClose={onClose} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CHIP COMUNE
// ═══════════════════════════════════════════════════════════════════

function Chip({
  selected, onClick, children, title,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: "4px 11px", borderRadius: 99,
        border: `1px solid ${selected ? T.text : T.border}`,
        background: selected ? T.text : T.panelBg,
        color: selected ? "#fff" : T.muted,
        fontWeight: selected ? 700 : 600, fontSize: 12,
        cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.12s",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
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
