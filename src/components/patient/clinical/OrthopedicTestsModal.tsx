// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/OrthopedicTestsModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale per gestire i test ortopedici di un paziente (Tappa 6 v2).
//
// FLUSSO UTENTE:
//   1. Click "+ Aggiungi test" → si apre la vista "scegli test"
//   2. Vista "scegli test" mostra:
//        a) BARRA RICERCA in alto con autocomplete (matching nome + alias)
//        b) "oppure scegli da" — 13 CARTELLE DISTRETTO collapsabili
//        c) "+ Test personalizzato" — testo libero
//   3. Click su un test del catalogo → form pre-compilato
//   4. Click "+ Test personalizzato" → form vuoto
//   5. Form: nome + risultato + lato + data + note → Salva
//
// TOOLTIP "i":
//   - Icona blu accanto a ogni test del catalogo
//   - Hover/click → tooltip nero con 4 sezioni:
//        • A cosa serve (purpose)
//        • Esecuzione (procedure)
//        • Positività (positive)
//        • Sensibilità/Specificità (se disponibile in letteratura)
//        • Fonte (se disponibile)
//
// SALVATAGGIO:
//   - clinical_tests, una riga per test eseguito
//   - INSERT per nuovi, UPDATE per modifiche
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import {
  ORTHOPEDIC_TESTS,
  searchOrthopedicTests,
  findTestByName,
  getTestsByDistrict,
  TEST_RESULTS,
  TEST_SIDES,
  DISTRICT_LABELS,
  DISTRICT_ICONS,
  DISTRICT_ORDER,
  type OrthopedicTest,
  type TestDistrict,
} from "@/src/lib/clinical/orthopedicTests";

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

// ─── Tipi ────────────────────────────────────────────────────────

type TestRow = {
  id?: string;
  test_name: string;
  result: "positive" | "negative" | "inconclusive" | "not_assessable";
  side: "left" | "right" | "bilateral" | null;
  notes: string | null;
  performed_at: string;
};

const EMPTY_TEST: TestRow = {
  test_name: "",
  result: "positive",
  side: null,
  notes: null,
  performed_at: new Date().toISOString(),
};

type ViewMode = "list" | "picker" | "editor";

// ─── Props ───────────────────────────────────────────────────────

export type OrthopedicTestsModalProps = {
  patientId: string;
  studioId: string;
  ownerId: string;
  open: boolean;
  onClose: () => void;
  onChange?: (counts: { total: number; positive: number; negative: number }) => void;
};

// ─── Componente principale ───────────────────────────────────────

export default function OrthopedicTestsModal({
  patientId, studioId, ownerId, open, onClose, onChange,
}: OrthopedicTestsModalProps) {

  const [tests, setTests] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
  const [editing, setEditing] = useState<TestRow | null>(null);
  const [isNew, setIsNew] = useState(false);

  const loadTests = useCallback(async () => {
    const { data, error } = await supabase
      .from("clinical_tests")
      .select("id, test_name, result, side, notes, performed_at")
      .eq("patient_id", patientId)
      .order("performed_at", { ascending: false });
    if (error) { console.error(error); return; }
    const rows = (data as TestRow[]) || [];
    setTests(rows);
    notifyChange(rows);
  }, [patientId]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setView("list");
    setEditing(null);
    loadTests().finally(() => setLoading(false));
  }, [open, loadTests]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && view === "list") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, view, onClose]);

  function notifyChange(rows: TestRow[]) {
    onChange?.({
      total: rows.length,
      positive: rows.filter(r => r.result === "positive").length,
      negative: rows.filter(r => r.result === "negative").length,
    });
  }

  function openPickerForNew() {
    setView("picker");
    setEditing(null);
    setIsNew(true);
  }

  function selectTestFromCatalog(t: OrthopedicTest) {
    setEditing({ ...EMPTY_TEST, test_name: t.name });
    setView("editor");
  }

  function startCustomTest() {
    setEditing({ ...EMPTY_TEST });
    setView("editor");
  }

  function startEdit(t: TestRow) {
    setEditing({ ...t });
    setIsNew(false);
    setView("editor");
  }

  async function saveEdit() {
    if (!editing) return;
    const name = editing.test_name.trim();
    if (!name) { alert("Inserisci il nome del test."); return; }

    const payload: any = {
      studio_id: studioId,
      owner_id: ownerId,
      patient_id: patientId,
      test_name: name,
      result: editing.result,
      side: editing.side,
      notes: editing.notes?.trim() || null,
      performed_at: editing.performed_at,
    };

    let error;
    if (isNew) {
      ({ error } = await supabase.from("clinical_tests").insert(payload));
    } else {
      ({ error } = await supabase.from("clinical_tests").update(payload).eq("id", editing.id));
    }
    if (error) { alert("Errore salvataggio: " + error.message); return; }
    setView("list");
    setEditing(null);
    loadTests();
  }

  async function deleteTest(id?: string) {
    if (!id) return;
    if (!confirm("Eliminare questo test? L'azione non è reversibile.")) return;
    const { error } = await supabase.from("clinical_tests").delete().eq("id", id);
    if (error) { alert("Errore eliminazione: " + error.message); return; }
    setView("list");
    setEditing(null);
    loadTests();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => { if (view === "list") onClose(); }}
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
          width: "100%", maxWidth: 720, maxHeight: "90vh",
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
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
              {view !== "list" && (
                <button
                  onClick={() => { setView("list"); setEditing(null); }}
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    color: T.muted, fontSize: 16, padding: "2px 6px", borderRadius: 4,
                  }}
                  aria-label="Indietro"
                >‹</button>
              )}
              {view === "list" && "🩺 Test ortopedici eseguiti"}
              {view === "picker" && "Scegli un test"}
              {view === "editor" && (isNew ? "✚ Nuovo test" : "✎ Modifica test")}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              {view === "list" && (tests.length === 0
                ? "Nessun test ancora registrato"
                : `${tests.length} test totali · ${tests.filter(t => t.result === "positive").length} positivi`)}
              {view === "picker" && `${ORTHOPEDIC_TESTS.length} test disponibili nel catalogo`}
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
            <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 13 }}>Caricamento…</div>
          ) : view === "list" ? (
            <ListView
              tests={tests}
              onAdd={openPickerForNew}
              onEdit={startEdit}
            />
          ) : view === "picker" ? (
            <PickerView
              onSelectCatalog={selectTestFromCatalog}
              onCustom={startCustomTest}
            />
          ) : (
            editing && (
              <TestEditor
                test={editing}
                isNew={isNew}
                onChange={t => setEditing(t)}
                onSave={saveEdit}
                onCancel={() => { setView("list"); setEditing(null); }}
                onDelete={!isNew ? () => deleteTest(editing.id) : undefined}
              />
            )
          )}
        </div>

        {/* Footer (solo list view) */}
        {view === "list" && (
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
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LIST VIEW (test esistenti del paziente)
// ═══════════════════════════════════════════════════════════════════

function ListView({
  tests, onAdd, onEdit,
}: {
  tests: TestRow[];
  onAdd: () => void;
  onEdit: (t: TestRow) => void;
}) {
  return (
    <>
      <button
        onClick={onAdd}
        style={{
          width: "100%", padding: "10px 14px",
          border: `1.5px dashed ${T.border}`, borderRadius: 8,
          background: T.panelBg, color: T.teal,
          fontWeight: 700, fontSize: 13, cursor: "pointer",
          fontFamily: "inherit", marginBottom: 14,
        }}
      >+ Aggiungi test</button>

      {tests.length === 0 ? (
        <div style={{ textAlign: "center", padding: 30, color: T.mutedSoft, fontSize: 13, fontStyle: "italic" }}>
          Nessun test eseguito ancora. Clicca "Aggiungi test" sopra.
        </div>
      ) : (
        tests.map(t => <TestRowItem key={t.id} test={t} onClick={() => onEdit(t)} />)
      )}
    </>
  );
}

function TestRowItem({ test, onClick }: { test: TestRow; onClick: () => void; }) {
  const resultInfo = TEST_RESULTS.find(r => r.code === test.result)!;
  const sideLabel = test.side === "left" ? "sx" : test.side === "right" ? "dx" : test.side === "bilateral" ? "bil" : null;
  const date = new Date(test.performed_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const catalog = findTestByName(test.test_name);

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 14px", marginBottom: 6,
        border: `1px solid ${T.border}`, borderRadius: 8,
        background: T.panelBg, cursor: "pointer",
        display: "grid", gridTemplateColumns: "1fr auto", gap: 10,
        alignItems: "center",
      }}
      onMouseEnter={e => e.currentTarget.style.background = T.panelSoft}
      onMouseLeave={e => e.currentTarget.style.background = T.panelBg}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
          {test.test_name}
          {catalog && <InfoTooltip test={catalog} />}
          {sideLabel && <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>({sideLabel})</span>}
        </div>
        {test.notes && (
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
            {test.notes}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          padding: "3px 9px", borderRadius: 99,
          background: resultInfo.color, color: "#fff",
          fontSize: 10, fontWeight: 800,
        }}>{resultInfo.label}</span>
        <span style={{ fontSize: 10, color: T.mutedSoft, fontWeight: 600 }}>{date}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PICKER VIEW (scegli test: search + cartelle + custom)
// ═══════════════════════════════════════════════════════════════════

function PickerView({
  onSelectCatalog, onCustom,
}: {
  onSelectCatalog: (t: OrthopedicTest) => void;
  onCustom: () => void;
}) {
  const [search, setSearch] = useState("");
  const [openDistricts, setOpenDistricts] = useState<Set<TestDistrict>>(new Set());

  const grouped = getTestsByDistrict();
  const matches = search.trim() ? searchOrthopedicTests(search, 12) : [];

  function toggleDistrict(d: TestDistrict) {
    setOpenDistricts(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  return (
    <>
      {/* Barra ricerca */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: T.mutedSoft, fontSize: 14, pointerEvents: "none",
        }}>🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca un test per nome (es. Lasègue, FABER, McMurray…)"
          autoFocus
          style={{
            width: "100%", padding: "10px 12px 10px 36px",
            border: `1.5px solid ${T.border}`, borderRadius: 9,
            fontSize: 13, fontFamily: "inherit", color: T.text,
            background: T.panelSoft, outline: "none",
          }}
          onFocus={e => { e.currentTarget.style.background = T.panelBg; e.currentTarget.style.borderColor = T.teal; }}
          onBlur={e => { e.currentTarget.style.background = T.panelSoft; e.currentTarget.style.borderColor = T.border; }}
        />
      </div>

      {/* Risultati ricerca (se attiva) */}
      {search.trim() && matches.length > 0 && (
        <>
          <SectionDivider label="Risultati ricerca" />
          <div style={{ background: T.panelSoft, border: `1px solid ${T.border}`, borderRadius: 9, padding: 4, marginBottom: 16 }}>
            {matches.map(t => (
              <TestPickItem key={t.name} test={t} onClick={() => onSelectCatalog(t)} />
            ))}
          </div>
        </>
      )}

      {search.trim() && matches.length === 0 && (
        <div style={{
          padding: 14, background: T.panelSoft, border: `1px solid ${T.border}`,
          borderRadius: 9, color: T.muted, fontSize: 12, fontStyle: "italic",
          textAlign: "center", marginBottom: 16,
        }}>
          Nessun test trovato. Prova a sfogliare le cartelle sotto o aggiungi un test personalizzato.
        </div>
      )}

      {/* Divider */}
      {!search.trim() && <SectionDivider label="oppure scegli da" />}

      {/* Cartelle distretto */}
      <div style={{ display: "grid", gap: 6 }}>
        {DISTRICT_ORDER.map(d => {
          const list = grouped[d];
          if (!list || list.length === 0) return null;
          const isOpen = openDistricts.has(d);
          return (
            <div key={d} style={{
              background: T.panelSoft,
              border: `1px solid ${T.border}`,
              borderRadius: 9, overflow: "hidden",
            }}>
              <button
                onClick={() => toggleDistrict(d)}
                style={{
                  width: "100%", padding: "11px 14px",
                  background: isOpen ? T.borderSoft : "transparent", border: "none",
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 10,
                }}
              >
                <span style={{ fontSize: 16, width: 22, textAlign: "center", flexShrink: 0 }}>{DISTRICT_ICONS[d]}</span>
                <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 700, color: T.textSoft }}>
                  {DISTRICT_LABELS[d]}
                </span>
                <span style={{
                  background: T.mutedLight, color: T.muted,
                  padding: "2px 8px", borderRadius: 99,
                  fontSize: 10, fontWeight: 800,
                }}>{list.length}</span>
                <span style={{
                  color: T.mutedSoft, fontSize: 12,
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 0.15s",
                }}>›</span>
              </button>
              {isOpen && (
                <div style={{ padding: "4px 8px 10px" }}>
                  {list.map(t => (
                    <TestPickItem key={t.name} test={t} onClick={() => onSelectCatalog(t)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <SectionDivider label="non trovi quello che cerchi?" />

      {/* Test custom */}
      <button
        onClick={onCustom}
        style={{
          width: "100%", padding: "11px 14px",
          border: `1.5px dashed ${T.border}`, borderRadius: 9,
          background: T.panelBg, color: T.muted,
          fontWeight: 700, fontSize: 13, cursor: "pointer",
          fontFamily: "inherit",
        }}
      >+ Aggiungi test personalizzato (testo libero)</button>
    </>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      margin: "16px 0 12px",
      fontSize: 10, fontWeight: 800, color: T.mutedSoft,
      textTransform: "uppercase", letterSpacing: 0.8,
    }}>
      <span style={{ flex: 1, height: 1, background: T.border }} />
      <span>{label}</span>
      <span style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
}

function TestPickItem({
  test, onClick,
}: { test: OrthopedicTest; onClick: () => void; }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "8px 10px", borderRadius: 6, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 10,
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = T.panelBg; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.text }}>{test.name}</span>
      <InfoTooltip test={test} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EDITOR (form per il test selezionato/custom)
// ═══════════════════════════════════════════════════════════════════

function TestEditor({
  test, isNew, onChange, onSave, onCancel, onDelete,
}: {
  test: TestRow;
  isNew: boolean;
  onChange: (t: TestRow) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const matched = findTestByName(test.test_name);

  return (
    <div style={{
      background: T.panelSoft, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: 16,
    }}>
      <Field label="Nome test">
        <div style={{ position: "relative" }}>
          <input
            type="text"
            value={test.test_name}
            onChange={e => onChange({ ...test, test_name: e.target.value })}
            placeholder="es. Lasègue, FABER, Hawkins-Kennedy…"
            style={{
              width: "100%", padding: "8px 36px 8px 10px",
              border: `1px solid ${T.border}`, borderRadius: 6,
              fontSize: 13, fontFamily: "inherit", color: T.text,
              background: T.panelBg, outline: "none",
            }}
          />
          {matched && (
            <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}>
              <InfoTooltip test={matched} />
            </div>
          )}
        </div>
      </Field>

      <Field label="Risultato">
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {TEST_RESULTS.map(r => (
            <button
              key={r.code}
              onClick={() => onChange({ ...test, result: r.code as TestRow["result"] })}
              style={{
                padding: "5px 12px", borderRadius: 7,
                border: `1.5px solid ${test.result === r.code ? r.color : T.border}`,
                background: test.result === r.code ? r.color : T.panelBg,
                color: test.result === r.code ? "#fff" : T.muted,
                fontWeight: test.result === r.code ? 800 : 600, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >{r.label}</button>
          ))}
        </div>
      </Field>

      <Field label="Lato">
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {TEST_SIDES.map(s => (
            <button
              key={s.code || "none"}
              onClick={() => onChange({ ...test, side: s.code ? s.code as TestRow["side"] : null })}
              style={{
                padding: "5px 12px", borderRadius: 7,
                border: `1px solid ${(test.side || "") === s.code ? T.text : T.border}`,
                background: (test.side || "") === s.code ? T.text : T.panelBg,
                color: (test.side || "") === s.code ? "#fff" : T.muted,
                fontWeight: (test.side || "") === s.code ? 700 : 600, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >{s.label}</button>
          ))}
        </div>
      </Field>

      <Field label="Data esecuzione">
        <input
          type="date"
          value={test.performed_at.slice(0, 10)}
          onChange={e => {
            const newDate = e.target.value
              ? new Date(e.target.value + "T12:00:00").toISOString()
              : new Date().toISOString();
            onChange({ ...test, performed_at: newDate });
          }}
          style={{
            padding: "7px 10px",
            border: `1px solid ${T.border}`, borderRadius: 6,
            fontSize: 13, fontFamily: "inherit", color: T.text,
            background: T.panelBg, outline: "none",
          }}
        />
      </Field>

      <Field label="Note">
        <textarea
          value={test.notes || ""}
          onChange={e => onChange({ ...test, notes: e.target.value })}
          placeholder="es. riproduce sintomi a 45°"
          rows={2}
          style={{
            width: "100%", padding: "8px 10px",
            border: `1px solid ${T.border}`, borderRadius: 6,
            fontSize: 12, fontFamily: "inherit", color: T.text,
            background: T.panelBg, resize: "vertical", outline: "none",
          }}
        />
      </Field>

      {/* Azioni */}
      <div style={{ display: "flex", gap: 6, justifyContent: "space-between", marginTop: 18 }}>
        <div>
          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: "7px 14px", borderRadius: 7,
                border: `1px solid ${T.border}`, background: T.panelBg,
                color: T.red, fontWeight: 700, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >🗑 Elimina</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "7px 14px", borderRadius: 7,
              border: `1px solid ${T.border}`, background: T.panelBg,
              color: T.muted, fontWeight: 600, fontSize: 12,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >Annulla</button>
          <button
            onClick={onSave}
            style={{
              padding: "7px 18px", borderRadius: 7, border: "none",
              background: "linear-gradient(135deg, #0d9488, #2563eb)",
              color: "#fff", fontWeight: 800, fontSize: 12,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >{isNew ? "Aggiungi" : "Salva"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 800, color: T.muted,
        textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5,
      }}>{label}</div>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// InfoTooltip: icona "i" con 4 sezioni (purpose/procedure/positive/sens-spec)
// ═══════════════════════════════════════════════════════════════════

function InfoTooltip({ test }: { test: OrthopedicTest }) {
  const [hover, setHover] = useState(false);
  const iconRef = React.useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{top: number; left: number} | null>(null);

  // Calcola posizione assoluta del tooltip rispetto al viewport
  // quando si attiva l'hover, così esce sopra tutto.
  useEffect(() => {
    if (!hover || !iconRef.current) {
      setPos(null);
      return;
    }
    const rect = iconRef.current.getBoundingClientRect();
    const tooltipWidth = 360;
    const tooltipHeightEstimate = 280;

    // Posizione: sotto l'icona, allineata a destra di default
    let top = rect.bottom + 8;
    let left = rect.right - tooltipWidth;

    // Se va fuori dalla finestra in basso, mostralo sopra
    if (top + tooltipHeightEstimate > window.innerHeight) {
      top = rect.top - tooltipHeightEstimate - 8;
    }
    // Se va fuori a sinistra, allinealo a sinistra dell'icona
    if (left < 8) {
      left = Math.max(8, rect.left);
    }
    // Se va fuori a destra, clampa
    if (left + tooltipWidth > window.innerWidth - 8) {
      left = window.innerWidth - tooltipWidth - 8;
    }

    setPos({ top, left });
  }, [hover]);

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={e => { e.stopPropagation(); setHover(h => !h); }}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 17, height: 17, borderRadius: "50%",
          background: T.blue, color: "#fff",
          fontSize: 10, fontWeight: 800,
          cursor: "help", position: "relative",
          fontStyle: "italic", fontFamily: "Georgia, serif",
          flexShrink: 0,
        }}
      >
        i
      </span>
      {hover && pos && (
        <div style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: 360, maxWidth: "calc(100vw - 16px)",
          background: T.text, color: "#fff",
          padding: 14, borderRadius: 8,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          zIndex: 9999, textAlign: "left",
          pointerEvents: "none",
        }}>
          <div style={{
            fontSize: 13, fontWeight: 800, marginBottom: 10,
            color: "#fff",
            display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          }}>
            {test.name}
            <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {DISTRICT_LABELS[test.district]}
            </span>
          </div>

          <TooltipSection label="A cosa serve" text={test.purpose} />
          <TooltipSection label="Esecuzione" text={test.procedure} />
          <TooltipSection label="Positività" text={test.positive} />

          {(test.sensitivity || test.specificity) && (
            <div style={{ marginTop: 8, padding: "6px 8px", background: "rgba(255,255,255,0.05)", borderRadius: 5 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
                Affidabilità
              </div>
              <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.5 }}>
                {test.sensitivity && <span>Sensibilità: <strong style={{ color: "#fff" }}>{test.sensitivity}</strong></span>}
                {test.sensitivity && test.specificity && <span> · </span>}
                {test.specificity && <span>Specificità: <strong style={{ color: "#fff" }}>{test.specificity}</strong></span>}
              </div>
            </div>
          )}

          {test.source && (
            <div style={{ fontSize: 9, color: "#64748b", fontStyle: "italic", marginTop: 8, lineHeight: 1.4 }}>
              📚 {test.source}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function TooltipSection({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: "#e2e8f0", lineHeight: 1.5, fontStyle: "normal", fontWeight: 400 }}>
        {text}
      </div>
    </div>
  );
}
