// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/ClinicalGoalsModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale per gestire gli obiettivi del paziente (Tappa 7).
// Apre dal click sulla riga "Obiettivi del paziente" del Piano.
//
// COMPORTAMENTO:
//   - Lista obiettivi ordinati per sort_order
//   - Filtri: Attivi / Raggiunti / Archiviati
//   - "+ Aggiungi obiettivo" → form inline
//   - Per ogni obiettivo: descrizione + stato + target_date + drag handle
//   - Click su un obiettivo → modifica inline
//
// SALVATAGGIO:
//   - INSERT / UPDATE / DELETE su clinical_goals
//   - Quando status passa a 'achieved', popola automaticamente achieved_at
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";

const T = {
  panelBg:    "#ffffff",
  panelSoft:  "#f8fafc",
  text:       "#0f172a",
  textSoft:   "#1e293b",
  muted:      "#475569",
  mutedSoft:  "#94a3b8",
  mutedLight: "#cbd5e1",
  border:     "#e2e8f0",
  borderSoft: "#f1f5f9",
  blue:       "#2563eb",
  teal:       "#0d9488",
  green:      "#16a34a",
  amber:      "#f59e0b",
  red:        "#dc2626",
};

// ─── Tipi ────────────────────────────────────────────────────

type Goal = {
  id?: string;
  description: string;
  status: "active" | "achieved" | "archived";
  sort_order: number;
  target_date: string | null;
  achieved_at: string | null;
  created_at?: string;
};

type FilterType = "active" | "achieved" | "archived" | "all";

const STATUS_LABELS: Record<Goal["status"], string> = {
  active:   "Attivo",
  achieved: "Raggiunto",
  archived: "Archiviato",
};

const STATUS_COLORS: Record<Goal["status"], string> = {
  active:   T.amber,
  achieved: T.green,
  archived: T.mutedSoft,
};

// ─── Props ─────────────────────────────────────────────────

export type ClinicalGoalsModalProps = {
  patientId: string;
  studioId: string;
  ownerId: string;
  open: boolean;
  onClose: () => void;
  onChange?: (counts: { total: number; active: number; achieved: number }) => void;
};

// ─── Componente principale ─────────────────────────────────

export default function ClinicalGoalsModal({
  patientId, studioId, ownerId, open, onClose, onChange,
}: ClinicalGoalsModalProps) {

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("active");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [editingDraft, setEditingDraft] = useState<Goal | null>(null);

  const loadGoals = useCallback(async () => {
    const { data, error } = await supabase
      .from("clinical_goals")
      .select("id, description, status, sort_order, target_date, achieved_at, created_at")
      .eq("patient_id", patientId)
      .order("status", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) { console.error(error); return; }
    const rows = (data as Goal[]) || [];
    setGoals(rows);
    notifyChange(rows);
  }, [patientId]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setEditingId(null);
    setEditingDraft(null);
    loadGoals().finally(() => setLoading(false));
  }, [open, loadGoals]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !editingId) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, editingId, onClose]);

  function notifyChange(rows: Goal[]) {
    onChange?.({
      total: rows.length,
      active: rows.filter(g => g.status === "active").length,
      achieved: rows.filter(g => g.status === "achieved").length,
    });
  }

  function startNew() {
    const maxOrder = goals.length > 0 ? Math.max(...goals.map(g => g.sort_order)) : 0;
    setEditingDraft({
      description: "",
      status: "active",
      sort_order: maxOrder + 1,
      target_date: null,
      achieved_at: null,
    });
    setEditingId("new");
  }

  function startEdit(g: Goal) {
    setEditingDraft({ ...g });
    setEditingId(g.id!);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingDraft(null);
  }

  async function saveEdit() {
    if (!editingDraft) return;
    const desc = editingDraft.description.trim();
    if (!desc) { alert("Inserisci la descrizione dell'obiettivo."); return; }

    // Popola achieved_at se passa a achieved e non c'era ancora
    const achieved_at = editingDraft.status === "achieved" && !editingDraft.achieved_at
      ? new Date().toISOString()
      : editingDraft.status !== "achieved" ? null : editingDraft.achieved_at;

    const payload: any = {
      studio_id: studioId,
      owner_id: ownerId,
      patient_id: patientId,
      description: desc,
      status: editingDraft.status,
      sort_order: editingDraft.sort_order,
      target_date: editingDraft.target_date,
      achieved_at,
    };

    let error;
    if (editingId === "new") {
      ({ error } = await supabase.from("clinical_goals").insert(payload));
    } else {
      ({ error } = await supabase.from("clinical_goals").update(payload).eq("id", editingId));
    }
    if (error) { alert("Errore salvataggio: " + error.message); return; }
    cancelEdit();
    loadGoals();
  }

  async function deleteGoal(id?: string) {
    if (!id) return;
    if (!confirm("Eliminare questo obiettivo? L'azione non è reversibile.")) return;
    const { error } = await supabase.from("clinical_goals").delete().eq("id", id);
    if (error) { alert("Errore eliminazione: " + error.message); return; }
    cancelEdit();
    loadGoals();
  }

  // Quick toggle: cambia stato senza aprire l'editor
  async function quickSetStatus(g: Goal, newStatus: Goal["status"]) {
    const achieved_at = newStatus === "achieved" && !g.achieved_at
      ? new Date().toISOString()
      : newStatus !== "achieved" ? null : g.achieved_at;
    const { error } = await supabase
      .from("clinical_goals")
      .update({ status: newStatus, achieved_at })
      .eq("id", g.id);
    if (error) { alert("Errore: " + error.message); return; }
    loadGoals();
  }

  if (!open) return null;

  // Filtra
  const filtered = filter === "all" ? goals : goals.filter(g => g.status === filter);

  const counts = {
    active:   goals.filter(g => g.status === "active").length,
    achieved: goals.filter(g => g.status === "achieved").length,
    archived: goals.filter(g => g.status === "archived").length,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => { if (!editingId) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.panelBg, borderRadius: 14,
          width: "100%", maxWidth: 640, maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >

        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
              🎯 Obiettivi del paziente
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              {goals.length === 0
                ? "Nessun obiettivo registrato"
                : `${counts.active} attivi · ${counts.achieved} raggiunti${counts.archived > 0 ? ` · ${counts.archived} archiviati` : ""}`}
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

        {/* Filtri */}
        <div style={{
          padding: "10px 20px", borderBottom: `1px solid ${T.borderSoft}`,
          display: "flex", gap: 5, flexWrap: "wrap",
        }}>
          {(["active", "achieved", "archived", "all"] as FilterType[]).map(f => {
            const count = f === "all" ? goals.length : counts[f as keyof typeof counts];
            const labels: Record<FilterType, string> = {
              active: "Attivi", achieved: "Raggiunti", archived: "Archiviati", all: "Tutti",
            };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "4px 10px", borderRadius: 6,
                  border: `1px solid ${filter === f ? T.text : T.border}`,
                  background: filter === f ? T.text : T.panelBg,
                  color: filter === f ? "#fff" : T.muted,
                  fontWeight: 700, fontSize: 11,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >{labels[f]} ({count})</button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 13 }}>Caricamento…</div>
          ) : (
            <>
              {/* + Aggiungi obiettivo */}
              {editingId !== "new" && (
                <button
                  onClick={startNew}
                  style={{
                    width: "100%", padding: "10px 14px",
                    border: `1.5px dashed ${T.border}`, borderRadius: 8,
                    background: T.panelBg, color: T.teal,
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                    fontFamily: "inherit", marginBottom: 14,
                  }}
                >+ Aggiungi obiettivo</button>
              )}

              {/* Form nuovo obiettivo */}
              {editingId === "new" && editingDraft && (
                <GoalEditor
                  goal={editingDraft}
                  isNew
                  onChange={setEditingDraft}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                />
              )}

              {/* Lista obiettivi */}
              {filtered.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: 30,
                  color: T.mutedSoft, fontSize: 13, fontStyle: "italic",
                }}>
                  {filter === "active" ? "Nessun obiettivo attivo." :
                   filter === "achieved" ? "Nessun obiettivo raggiunto." :
                   filter === "archived" ? "Nessun obiettivo archiviato." :
                   "Nessun obiettivo ancora."}
                </div>
              ) : (
                filtered.map(g => {
                  if (editingId === g.id && editingDraft) {
                    return (
                      <GoalEditor
                        key={g.id}
                        goal={editingDraft}
                        isNew={false}
                        onChange={setEditingDraft}
                        onSave={saveEdit}
                        onCancel={cancelEdit}
                        onDelete={() => deleteGoal(g.id)}
                      />
                    );
                  }
                  return (
                    <GoalRow
                      key={g.id}
                      goal={g}
                      onClick={() => startEdit(g)}
                      onQuickStatus={(s) => quickSetStatus(g, s)}
                    />
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: `1px solid ${T.border}`,
          background: T.panelSoft,
          display: "flex", justifyContent: "flex-end",
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 7, border: "none",
              background: T.teal, color: "#fff", fontWeight: 700, fontSize: 13,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >Chiudi</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// GoalRow: riga obiettivo in lettura
// ═══════════════════════════════════════════════════════════════════

function GoalRow({
  goal, onClick, onQuickStatus,
}: {
  goal: Goal;
  onClick: () => void;
  onQuickStatus: (s: Goal["status"]) => void;
}) {
  const targetDate = goal.target_date
    ? new Date(goal.target_date).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : null;
  const achievedDate = goal.achieved_at
    ? new Date(goal.achieved_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : null;

  return (
    <div
      style={{
        padding: "12px 14px", marginBottom: 6,
        border: `1px solid ${T.border}`, borderRadius: 8,
        background: T.panelBg,
        opacity: goal.status === "archived" ? 0.55 : 1,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "flex-start" }}>
        <div onClick={onClick} style={{ cursor: "pointer", minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.4,
            textDecoration: goal.status === "achieved" ? "line-through" : "none",
          }}>
            {goal.description}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 10, color: T.muted, fontWeight: 600 }}>
            {targetDate && <span>🎯 Target: {targetDate}</span>}
            {achievedDate && <span>✓ Raggiunto: {achievedDate}</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
          {/* Quick status buttons */}
          {goal.status === "active" && (
            <>
              <button
                onClick={() => onQuickStatus("achieved")}
                title="Segna come raggiunto"
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "none",
                  background: T.green, color: "#fff",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >✓</button>
              <button
                onClick={() => onQuickStatus("archived")}
                title="Archivia"
                style={{
                  padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border}`,
                  background: T.panelBg, color: T.muted,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >🗃</button>
            </>
          )}
          {goal.status === "achieved" && (
            <button
              onClick={() => onQuickStatus("active")}
              title="Riapri (segna come attivo)"
              style={{
                padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
                background: T.panelBg, color: T.muted,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >↻</button>
          )}
          {goal.status === "archived" && (
            <button
              onClick={() => onQuickStatus("active")}
              title="Ripristina come attivo"
              style={{
                padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
                background: T.panelBg, color: T.muted,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >↻</button>
          )}
          <span style={{
            padding: "3px 9px", borderRadius: 99,
            background: STATUS_COLORS[goal.status], color: "#fff",
            fontSize: 9, fontWeight: 800,
          }}>{STATUS_LABELS[goal.status]}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// GoalEditor: form per nuovo/modifica obiettivo
// ═══════════════════════════════════════════════════════════════════

function GoalEditor({
  goal, isNew, onChange, onSave, onCancel, onDelete,
}: {
  goal: Goal;
  isNew: boolean;
  onChange: (g: Goal) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  return (
    <div style={{
      background: T.panelSoft, border: `1.5px solid ${T.teal}`,
      borderRadius: 10, padding: 14, marginBottom: 14,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        {isNew ? "Nuovo obiettivo" : "Modifica obiettivo"}
      </div>

      <textarea
        value={goal.description}
        onChange={e => onChange({ ...goal, description: e.target.value })}
        placeholder="es. Tornare a correre 5km/settimana entro 2 mesi"
        rows={2}
        autoFocus
        style={{
          width: "100%", padding: "8px 10px",
          border: `1px solid ${T.border}`, borderRadius: 6,
          fontSize: 13, fontFamily: "inherit", color: T.text,
          background: T.panelBg, resize: "vertical", outline: "none",
          marginBottom: 10,
        }}
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
            Stato
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["active", "achieved", "archived"] as Goal["status"][]).map(s => (
              <button
                key={s}
                onClick={() => onChange({ ...goal, status: s })}
                style={{
                  padding: "4px 10px", borderRadius: 6,
                  border: `1.5px solid ${goal.status === s ? STATUS_COLORS[s] : T.border}`,
                  background: goal.status === s ? STATUS_COLORS[s] : T.panelBg,
                  color: goal.status === s ? "#fff" : T.muted,
                  fontWeight: 700, fontSize: 11,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >{STATUS_LABELS[s]}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
            Target date (opzionale)
          </div>
          <input
            type="date"
            value={goal.target_date ? goal.target_date.slice(0, 10) : ""}
            onChange={e => onChange({ ...goal, target_date: e.target.value || null })}
            style={{
              padding: "6px 10px",
              border: `1px solid ${T.border}`, borderRadius: 6,
              fontSize: 12, fontFamily: "inherit", color: T.text,
              background: T.panelBg, outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
        <div>
          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: "6px 12px", borderRadius: 6,
                border: `1px solid ${T.border}`, background: T.panelBg,
                color: T.red, fontWeight: 700, fontSize: 11,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >🗑 Elimina</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 12px", borderRadius: 6,
              border: `1px solid ${T.border}`, background: T.panelBg,
              color: T.muted, fontWeight: 600, fontSize: 11,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >Annulla</button>
          <button
            onClick={onSave}
            style={{
              padding: "6px 18px", borderRadius: 6, border: "none",
              background: "linear-gradient(135deg, #0d9488, #2563eb)",
              color: "#fff", fontWeight: 800, fontSize: 11,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >{isNew ? "Aggiungi" : "Salva"}</button>
        </div>
      </div>
    </div>
  );
}
