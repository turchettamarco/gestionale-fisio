// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/RedFlagsModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale per gestire i red flags clinici di un paziente.
// Apre dal pulsante "🚩 Red flags" nell'Anamnesi strutturata.
//
// COMPORTAMENTO:
//   - Lista tutti i red_flag_types attivi (sia di sistema is_system=true
//     che custom dello studio)
//   - Raggruppati per category (spine, neurological, ecc.)
//   - Per ogni red flag: 3 stati (✓ Presente / ✗ Escluso / – Non valutato)
//   - Note opzionali per ogni red flag presente
//   - Conta in basso quanti sono "presenti" (per badge nel pulsante)
//
// SALVATAGGIO:
//   - Upsert su clinical_red_flags con UNIQUE(patient_id, red_flag_type_id)
//   - Salvataggio "ottimistico" (UI aggiornata subito, rollback in caso di errore)
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";

const T = {
  panelBg:    "#ffffff",
  panelSoft:  "#f8fafc",
  text:       "#0f172a",
  textSoft:   "#334155",
  muted:      "#64748b",
  mutedSoft:  "#94a3b8",
  border:     "#e2e8f0",
  borderSoft: "#f1f5f9",
  blue:       "#2563eb",
  teal:       "#0d9488",
  green:      "#16a34a",
  amber:      "#f59e0b",
  red:        "#dc2626",
};

// ─── Tipi ──────────────────────────────────────────────────────────

type RedFlagType = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  category: string;
  severity: "warning" | "urgent" | "emergency";
  is_system: boolean;
  sort_order: number;
};

type RedFlagValue = {
  id?: string;
  red_flag_type_id: string;
  is_present: boolean | null;
  notes: string | null;
};

// Etichette categorie
const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  general:         { label: "Generale",         icon: "🩺" },
  spine:           { label: "Rachide",          icon: "🦴" },
  neurological:    { label: "Neurologico",      icon: "🧠" },
  oncological:     { label: "Oncologico",       icon: "🎗️" },
  infectious:      { label: "Infettivo",        icon: "🦠" },
  cardiovascular:  { label: "Cardiovascolare",  icon: "❤️" },
};

const SEVERITY_COLORS: Record<string, string> = {
  warning:   T.amber,
  urgent:    "#ea580c",
  emergency: T.red,
};

// ─── Props ─────────────────────────────────────────────────────────

export type RedFlagsModalProps = {
  patientId: string;
  studioId: string;
  ownerId: string;
  open: boolean;
  onClose: () => void;
  /** Chiamato quando le red flags vengono modificate (per aggiornare il badge). */
  onChange?: (presentCount: number, excludedCount?: number) => void;
};

// ─── Componente ────────────────────────────────────────────────────

export default function RedFlagsModal({
  patientId, studioId, ownerId, open, onClose, onChange,
}: RedFlagsModalProps) {

  const [types,  setTypes]  = useState<RedFlagType[]>([]);
  const [values, setValues] = useState<Map<string, RedFlagValue>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  // Carica i red_flag_types attivi (sistema + custom dello studio)
  const loadTypes = useCallback(async () => {
    const { data, error } = await supabase
      .from("red_flag_types")
      .select("id, code, label, description, category, severity, is_system, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) {
      console.error("Errore caricamento red_flag_types:", error);
      return;
    }
    setTypes(data || []);
  }, []);

  // Carica i red flag esistenti per questo paziente
  const loadValues = useCallback(async () => {
    const { data, error } = await supabase
      .from("clinical_red_flags")
      .select("id, red_flag_type_id, is_present, notes")
      .eq("patient_id", patientId);
    if (error) {
      console.error("Errore caricamento clinical_red_flags:", error);
      return;
    }
    const map = new Map<string, RedFlagValue>();
    (data || []).forEach((v: any) => map.set(v.red_flag_type_id, v));
    setValues(map);
  }, [patientId]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([loadTypes(), loadValues()]).then(() => setLoading(false));
  }, [open, loadTypes, loadValues]);

  // Chiudi con Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Aggiorna lo stato di un red flag (Presente/Escluso/Non valutato)
  async function setRedFlagState(typeId: string, newState: boolean | null) {
    setSavingCode(typeId);

    const existing = values.get(typeId);
    const optimistic = { ...(existing || { red_flag_type_id: typeId, notes: null }), is_present: newState };

    // Update ottimistico
    const newMap = new Map(values);
    newMap.set(typeId, optimistic as RedFlagValue);
    setValues(newMap);

    // Upsert in DB
    const payload = {
      studio_id: studioId,
      owner_id: ownerId,
      patient_id: patientId,
      red_flag_type_id: typeId,
      is_present: newState,
      notes: existing?.notes ?? null,
    };
    const { data, error } = await supabase
      .from("clinical_red_flags")
      .upsert(payload, { onConflict: "patient_id,red_flag_type_id" })
      .select()
      .maybeSingle();

    if (error) {
      console.error("Errore salvataggio red flag:", error);
      // Rollback
      const rollback = new Map(values);
      if (existing) rollback.set(typeId, existing); else rollback.delete(typeId);
      setValues(rollback);
      alert("Errore salvataggio: " + error.message);
    } else if (data) {
      const newMap2 = new Map(newMap);
      newMap2.set(typeId, data as RedFlagValue);
      setValues(newMap2);
      // Notifica al parent il nuovo count
      const presentCount = Array.from(newMap2.values()).filter(v => v.is_present === true).length;
      const excludedCount = Array.from(newMap2.values()).filter(v => v.is_present === false).length;
      onChange?.(presentCount, excludedCount);
    }
    setSavingCode(null);
  }

  // Aggiorna le note di un red flag (debounce non implementato: salva su blur)
  async function saveNotes(typeId: string, notes: string) {
    const existing = values.get(typeId);
    if (!existing) return;

    const updated = { ...existing, notes };
    const newMap = new Map(values);
    newMap.set(typeId, updated);
    setValues(newMap);

    const payload = {
      studio_id: studioId,
      owner_id: ownerId,
      patient_id: patientId,
      red_flag_type_id: typeId,
      is_present: existing.is_present,
      notes: notes || null,
    };
    await supabase
      .from("clinical_red_flags")
      .upsert(payload, { onConflict: "patient_id,red_flag_type_id" });
  }

  if (!open) return null;

  // Raggruppa per categoria
  const grouped: Record<string, RedFlagType[]> = {};
  types.forEach(t => {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  });
  const orderedCategories = Object.keys(CATEGORY_LABELS).filter(c => grouped[c]);

  const presentCount = Array.from(values.values()).filter(v => v.is_present === true).length;
  const excludedCount = Array.from(values.values()).filter(v => v.is_present === false).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.panelBg,
          borderRadius: 14,
          width: "100%", maxWidth: 720, maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>
              🚩 Red flags cliniche
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              {presentCount > 0 && <span style={{ color: T.red, fontWeight: 700 }}>{presentCount} presenti</span>}
              {presentCount > 0 && excludedCount > 0 && <span style={{ color: T.mutedSoft }}> · </span>}
              {excludedCount > 0 && <span>{excludedCount} esclusi</span>}
              {presentCount === 0 && excludedCount === 0 && <span>Nessuna valutazione ancora</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 22, color: T.muted, lineHeight: 1, padding: 6,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 13 }}>
              Caricamento…
            </div>
          ) : (
            <>
              <div style={{
                background: T.panelSoft, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: "10px 12px", marginBottom: 14,
                fontSize: 11, color: T.muted, fontWeight: 600,
                display: "flex", gap: 14, flexWrap: "wrap",
              }}>
                <span>✓ <strong>Presente</strong> — rilevato</span>
                <span>✗ <strong>Escluso</strong> — valutato e non rilevato</span>
                <span>– <strong>Non valutato</strong></span>
              </div>

              {orderedCategories.map(category => (
                <div key={category} style={{ marginBottom: 18 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 800, color: T.muted,
                    textTransform: "uppercase", letterSpacing: 0.8,
                    padding: "4px 0 8px",
                    display: "flex", alignItems: "center", gap: 6,
                    borderBottom: `1px solid ${T.borderSoft}`,
                    marginBottom: 8,
                  }}>
                    <span>{CATEGORY_LABELS[category].icon}</span>
                    <span>{CATEGORY_LABELS[category].label}</span>
                  </div>

                  {grouped[category].map(rf => {
                    const v = values.get(rf.id);
                    const state = v?.is_present;
                    const isSaving = savingCode === rf.id;

                    return (
                      <div key={rf.id} style={{
                        padding: "10px 12px",
                        background: state === true ? "rgba(220,38,38,0.04)" : T.panelBg,
                        border: `1px solid ${state === true ? "rgba(220,38,38,0.2)" : T.border}`,
                        borderRadius: 10,
                        marginBottom: 6,
                        opacity: isSaving ? 0.6 : 1,
                        transition: "opacity 0.12s",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, fontWeight: 700, color: T.text,
                              display: "flex", alignItems: "center", gap: 6,
                            }}>
                              <span style={{
                                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                                background: SEVERITY_COLORS[rf.severity],
                              }} />
                              {rf.label}
                            </div>
                            {rf.description && (
                              <div style={{ fontSize: 11, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>
                                {rf.description}
                              </div>
                            )}
                          </div>

                          {/* 3-stati toggle */}
                          <div style={{
                            display: "flex", gap: 2, padding: 2,
                            background: T.borderSoft, borderRadius: 7,
                            flexShrink: 0,
                          }}>
                            <StateButton
                              icon="✓" label="Presente"
                              active={state === true}  activeColor={T.red}
                              onClick={() => setRedFlagState(rf.id, state === true ? null : true)}
                            />
                            <StateButton
                              icon="✗" label="Escluso"
                              active={state === false} activeColor={T.green}
                              onClick={() => setRedFlagState(rf.id, state === false ? null : false)}
                            />
                          </div>
                        </div>

                        {state === true && (
                          <textarea
                            defaultValue={v?.notes || ""}
                            placeholder="Note specifiche (es. perdita peso 5kg in 2 mesi senza dieta)…"
                            onBlur={e => saveNotes(rf.id, e.target.value)}
                            rows={2}
                            style={{
                              marginTop: 8, width: "100%",
                              padding: "8px 10px",
                              border: `1px solid ${T.border}`, borderRadius: 6,
                              background: T.panelBg, color: T.text,
                              fontSize: 12, fontFamily: "inherit", resize: "vertical",
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: `1px solid ${T.border}`,
          background: T.panelSoft,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
            Le modifiche sono salvate automaticamente
          </span>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 7, border: "none",
              background: T.teal, color: "#fff", fontWeight: 700, fontSize: 13,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sotto-componente: bottone 3-stati ─────────────────────────────

function StateButton({
  icon, label, active, activeColor, onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  activeColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        padding: "5px 10px", borderRadius: 5, border: "none",
        background: active ? activeColor : "transparent",
        color: active ? "#fff" : "#64748b",
        fontWeight: 700, fontSize: 12, cursor: "pointer",
        transition: "background 0.12s",
        fontFamily: "inherit", minWidth: 30,
      }}
    >
      {icon}
    </button>
  );
}
