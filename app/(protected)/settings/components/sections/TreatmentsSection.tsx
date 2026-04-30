// app/(protected)/settings/components/sections/TreatmentsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Catalogo Trattamenti".
// Permette di:
//   • Aggiungere voci nuove (es. "Linfodrenaggio Vodder")
//   • Modificare voci esistenti (label, prezzi, durata, colore)
//   • Disattivare/riattivare voci (incluse le built-in, con conferma)
//   • Riordinare le voci (frecce su/giù → modifica sort_order)
//
// Le 6 voci built-in (seduta, macchinario, laser, tecar, onde_urto, tens)
// sono marcate con badge e non sono cancellabili (solo disattivabili).
// Le voci custom create dall'utente sono cancellabili definitivamente
// solo se non sono mai state usate in un appuntamento.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import {
  type TreatmentTypeRow,
  loadTreatmentTypes,
  keyFromLabel,
} from "@/src/lib/treatmentTypes";

// ─── Palette colori predefinita ───────────────────────────────────────────
const COLOR_PALETTE: { value: string; name: string }[] = [
  { value: "#0d9488", name: "Teal" },
  { value: "#2563eb", name: "Blu" },
  { value: "#d97706", name: "Ambra" },
  { value: "#ea580c", name: "Arancio" },
  { value: "#7c3aed", name: "Viola" },
  { value: "#059669", name: "Verde" },
  { value: "#db2777", name: "Rosa" },
  { value: "#4f46e5", name: "Indaco" },
  { value: "#dc2626", name: "Rosso" },
  { value: "#475569", name: "Grigio" },
];

// ─── Form state per drawer ────────────────────────────────────────────────
interface DrawerFormState {
  id: string | null;        // null = nuova voce
  label: string;
  color: string;
  priceInvoice: string;
  priceCash: string;
  durationMin: string;
  isActive: boolean;
  isBuiltin: boolean;       // serve solo come info per UI (non modificabile)
}

const EMPTY_FORM: DrawerFormState = {
  id: null,
  label: "",
  color: COLOR_PALETTE[0].value,
  priceInvoice: "",
  priceCash: "",
  durationMin: "30",
  isActive: true,
  isBuiltin: false,
};

// ─── Props ────────────────────────────────────────────────────────────────
export type TreatmentsSectionProps = {
  show: boolean;
  onToggle: () => void;
  studioId: string | null;
  onChanged?: () => void;   // callback opzionale dopo modifiche
};

// ═══════════════════════════════════════════════════════════════════════
// Componente
// ═══════════════════════════════════════════════════════════════════════
export default function TreatmentsSection(p: TreatmentsSectionProps) {
  const [items, setItems] = useState<TreatmentTypeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<DrawerFormState>(EMPTY_FORM);

  // ── Caricamento ─────────────────────────────────────────────────────────
  async function reload() {
    if (!p.studioId) return;
    setLoading(true);
    setError("");
    try {
      const rows = await loadTreatmentTypes(p.studioId, false); // anche disattivati
      setItems(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore caricamento trattamenti.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (p.show && p.studioId) {
      void reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.show, p.studioId]);

  // ── Apertura drawer ─────────────────────────────────────────────────────
  function openNew() {
    // Suggerisce sort_order in fondo alla lista
    setForm({ ...EMPTY_FORM });
    setDrawerOpen(true);
  }

  function openEdit(row: TreatmentTypeRow) {
    setForm({
      id: row.id,
      label: row.label,
      color: row.color,
      priceInvoice: String(row.price_invoice ?? ""),
      priceCash: String(row.price_cash ?? ""),
      durationMin: String(row.duration_min ?? 30),
      isActive: row.is_active,
      isBuiltin: row.is_builtin,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setForm(EMPTY_FORM);
  }

  // ── Salva (insert o update) ─────────────────────────────────────────────
  async function saveForm() {
    if (!p.studioId) {
      setError("Studio non disponibile.");
      return;
    }
    const label = form.label.trim();
    if (label.length < 2) {
      setError("Il nome del trattamento è troppo corto.");
      return;
    }
    const priceInvoice = Number(form.priceInvoice.replace(",", "."));
    const priceCash    = Number(form.priceCash.replace(",", "."));
    const durationMin  = Number(form.durationMin);
    if (!Number.isFinite(priceInvoice) || priceInvoice < 0) {
      setError("Prezzo con ricevuta non valido.");
      return;
    }
    if (!Number.isFinite(priceCash) || priceCash < 0) {
      setError("Prezzo in contanti non valido.");
      return;
    }
    if (!Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 480) {
      setError("Durata non valida (1-480 min).");
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (form.id) {
        // UPDATE — non cambiamo la key (per mantenere appuntamenti storici)
        const { error: upErr } = await supabase
          .from("treatment_types")
          .update({
            label,
            color: form.color,
            price_invoice: priceInvoice,
            price_cash: priceCash,
            duration_min: durationMin,
            is_active: form.isActive,
          })
          .eq("id", form.id);
        if (upErr) throw new Error(upErr.message);
      } else {
        // INSERT — calcola key dal label
        let key = keyFromLabel(label);
        // Verifica univocità: se esiste già, aggiunge suffisso numerico
        const existingKeys = new Set(items.map((i: TreatmentTypeRow) => i.key));
        if (existingKeys.has(key)) {
          let n = 2;
          while (existingKeys.has(`${key}_${n}`)) n++;
          key = `${key}_${n}`;
        }
        const maxOrder = items.reduce((m: number, i: TreatmentTypeRow) => Math.max(m, i.sort_order), 0);
        const { error: insErr } = await supabase
          .from("treatment_types")
          .insert({
            studio_id: p.studioId,
            key,
            label,
            color: form.color,
            price_invoice: priceInvoice,
            price_cash: priceCash,
            duration_min: durationMin,
            is_active: form.isActive,
            sort_order: maxOrder + 10,
            is_builtin: false,
          });
        if (insErr) throw new Error(insErr.message);
      }
      closeDrawer();
      await reload();
      p.onChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore salvataggio.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle attivo/disattivo ─────────────────────────────────────────────
  async function toggleActive(row: TreatmentTypeRow) {
    if (row.is_builtin && row.is_active) {
      const ok = confirm(
        `Vuoi disattivare "${row.label}"?\n\nNon comparirà più nei selettori del calendario, ma gli appuntamenti già esistenti restano invariati. Potrai riattivarlo in qualsiasi momento.`
      );
      if (!ok) return;
    }
    setSaving(true);
    setError("");
    try {
      const { error: upErr } = await supabase
        .from("treatment_types")
        .update({ is_active: !row.is_active })
        .eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
      await reload();
      p.onChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Cancella (solo voci custom) ─────────────────────────────────────────
  async function deleteRow(row: TreatmentTypeRow) {
    if (row.is_builtin) {
      alert("Le voci di sistema non possono essere cancellate. Puoi disattivarle.");
      return;
    }
    const ok = confirm(
      `Cancellare definitivamente "${row.label}"?\n\nGli appuntamenti già creati con questo tipo manterranno la dicitura, ma non potrai più crearne di nuovi.`
    );
    if (!ok) return;
    setSaving(true);
    setError("");
    try {
      const { error: delErr } = await supabase
        .from("treatment_types")
        .delete()
        .eq("id", row.id);
      if (delErr) throw new Error(delErr.message);
      await reload();
      p.onChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore cancellazione.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Riordino (frecce su/giù) ────────────────────────────────────────────
  async function move(row: TreatmentTypeRow, direction: -1 | 1) {
    const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((i: TreatmentTypeRow) => i.id === row.id);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const other = sorted[newIdx];

    setSaving(true);
    setError("");
    try {
      // Swap dei sort_order
      await supabase.from("treatment_types").update({ sort_order: other.sort_order }).eq("id", row.id);
      await supabase.from("treatment_types").update({ sort_order: row.sort_order }).eq("id", other.id);
      await reload();
      p.onChanged?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore riordino.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════════════════
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order);
  const activeCount = items.filter((i: TreatmentTypeRow) => i.is_active).length;

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Catalogo Trattamenti</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            {items.length === 0 ? "Caricamento…" : `${activeCount} attivi · ${items.length} totali`}
          </div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px", opacity: loading ? 0.6 : 1 }}>
          {/* Header con bottone aggiungi */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 13, color: THEME.muted, maxWidth: 540 }}>
              Aggiungi nuovi tipi di trattamento, modifica nome/prezzo/durata/colore di quelli esistenti, riordinali o disattiva quelli che non usi. Le voci appaiono ovunque nel gestionale (calendario, ricevute, report).
            </div>
            <BtnPrimary label="+ Aggiungi trattamento" onClick={openNew} disabled={saving} />
          </div>

          {error && (
            <div style={{ padding: 10, borderRadius: 7, background: "#fef2f2", border: `1px solid ${THEME.red}`, color: THEME.red, fontSize: 12, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {/* Lista trattamenti */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.length === 0 && !loading && (
              <div style={{ padding: 24, textAlign: "center", color: THEME.muted, fontSize: 13, border: `1px dashed ${THEME.border}`, borderRadius: 8 }}>
                Nessun trattamento. Clicca <strong>+ Aggiungi</strong> per crearne uno.
              </div>
            )}

            {sorted.map((row, idx) => (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.border}`,
                  background: row.is_active ? "#fff" : "#f8fafc",
                  opacity: row.is_active ? 1 : 0.6,
                }}
              >
                {/* Frecce ordinamento */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button
                    onClick={() => void move(row, -1)}
                    disabled={idx === 0 || saving}
                    title="Sposta su"
                    style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? THEME.gray : THEME.muted, fontSize: 11, padding: 0, lineHeight: 1 }}
                  >▲</button>
                  <button
                    onClick={() => void move(row, 1)}
                    disabled={idx === sorted.length - 1 || saving}
                    title="Sposta giù"
                    style={{ background: "none", border: "none", cursor: idx === sorted.length - 1 ? "default" : "pointer", color: idx === sorted.length - 1 ? THEME.gray : THEME.muted, fontSize: 11, padding: 0, lineHeight: 1 }}
                  >▼</button>
                </div>

                {/* Pallino colore */}
                <div style={{ width: 14, height: 14, borderRadius: "50%", background: row.color, flexShrink: 0, border: "1px solid rgba(0,0,0,0.08)" }} />

                {/* Label + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{row.label}</span>
                    {row.is_builtin && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#e2e8f0", color: THEME.muted, letterSpacing: 0.3 }}>SISTEMA</span>
                    )}
                    {!row.is_active && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#fee2e2", color: THEME.red, letterSpacing: 0.3 }}>DISATTIVATO</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>
                    €{row.price_invoice} fattura · €{row.price_cash} contanti · {row.duration_min} min
                  </div>
                </div>

                {/* Switch attivo */}
                <button
                  onClick={() => void toggleActive(row)}
                  disabled={saving}
                  title={row.is_active ? "Disattiva" : "Attiva"}
                  style={{
                    width: 38, height: 22, borderRadius: 11, border: "none",
                    background: row.is_active ? THEME.teal : THEME.gray,
                    position: "relative", cursor: "pointer", flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 2, left: row.is_active ? 18 : 2,
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    transition: "left 0.15s",
                  }} />
                </button>

                {/* Modifica */}
                <button
                  onClick={() => openEdit(row)}
                  disabled={saving}
                  style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Modifica
                </button>

                {/* Cancella (solo non-builtin) */}
                {!row.is_builtin && (
                  <button
                    onClick={() => void deleteRow(row)}
                    disabled={saving}
                    title="Cancella"
                    style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.red, fontSize: 13, cursor: "pointer" }}
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <BtnOutline label="Ricarica" onClick={() => void reload()} disabled={loading || saving} />
          </div>
        </div>
      )}

      {/* ── Drawer laterale ── */}
      {drawerOpen && (
        <DrawerForm
          form={form}
          setForm={setForm}
          onSave={() => void saveForm()}
          onClose={closeDrawer}
          saving={saving}
          error={error}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Drawer form (componente interno)
// ═══════════════════════════════════════════════════════════════════════
function DrawerForm({
  form, setForm, onSave, onClose, saving, error,
}: {
  form: DrawerFormState;
  setForm: (f: DrawerFormState) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)",
          zIndex: 999, animation: "fadeIn 0.15s",
        }}
      />
      {/* Drawer */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(440px, 100vw)",
          background: "#fff", zIndex: 1000,
          boxShadow: "-4px 0 16px rgba(15,23,42,0.12)",
          display: "flex", flexDirection: "column",
          animation: "slideInRight 0.2s ease-out",
        }}
      >
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        `}</style>

        {/* Header drawer */}
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${THEME.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: THEME.text }}>
              {form.id ? "Modifica trattamento" : "Nuovo trattamento"}
            </div>
            {form.isBuiltin && (
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>Voce di sistema · puoi modificare nome, prezzi e durata</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, color: THEME.muted, cursor: "pointer", lineHeight: 1, padding: 0 }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          {error && (
            <div style={{ padding: 10, borderRadius: 7, background: "#fef2f2", border: `1px solid ${THEME.red}`, color: THEME.red, fontSize: 12, marginBottom: 14 }}>
              {error}
            </div>
          )}

          {/* Nome */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nome trattamento</label>
            <input
              value={form.label}
              onChange={e => setForm({ ...form, label: e.target.value })}
              placeholder="Es. Linfodrenaggio Vodder"
              style={inputStyle}
              disabled={saving}
            />
          </div>

          {/* Colore */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Colore</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {COLOR_PALETTE.map(c => {
                const selected = form.color === c.value;
                return (
                  <button
                    key={c.value}
                    onClick={() => setForm({ ...form, color: c.value })}
                    title={c.name}
                    disabled={saving}
                    style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: c.value,
                      border: selected ? `3px solid ${THEME.text}` : "2px solid rgba(0,0,0,0.06)",
                      cursor: "pointer",
                      transition: "transform 0.1s",
                      transform: selected ? "scale(1.1)" : "scale(1)",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Prezzi */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Con ricevuta (€)</label>
              <input
                value={form.priceInvoice}
                onChange={e => setForm({ ...form, priceInvoice: e.target.value })}
                placeholder="0.00"
                style={inputStyle}
                inputMode="decimal"
                disabled={saving}
              />
            </div>
            <div>
              <label style={labelStyle}>In contanti (€)</label>
              <input
                value={form.priceCash}
                onChange={e => setForm({ ...form, priceCash: e.target.value })}
                placeholder="0.00"
                style={inputStyle}
                inputMode="decimal"
                disabled={saving}
              />
            </div>
          </div>

          {/* Durata */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Durata (minuti)</label>
            <input
              value={form.durationMin}
              onChange={e => setForm({ ...form, durationMin: e.target.value })}
              placeholder="30"
              style={{ ...inputStyle, maxWidth: 120 }}
              inputMode="numeric"
              disabled={saving}
            />
          </div>

          {/* Attivo */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.panelSoft, marginBottom: 14 }}>
            <input
              type="checkbox"
              id="treatment-active"
              checked={form.isActive}
              onChange={e => setForm({ ...form, isActive: e.target.checked })}
              style={{ width: 16, height: 16, marginTop: 2, cursor: "pointer" }}
              disabled={saving}
            />
            <label htmlFor="treatment-active" style={{ cursor: "pointer", flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>Attivo</div>
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>Se disattivato, il trattamento non comparirà nei selettori del calendario.</div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${THEME.border}`, display: "flex", justifyContent: "flex-end", gap: 8, background: "#fff" }}>
          <BtnOutline label="Annulla" onClick={onClose} disabled={saving} />
          <BtnPrimary label={saving ? "Salvataggio…" : (form.id ? "Salva modifiche" : "Crea trattamento")} onClick={onSave} disabled={saving} />
        </div>
      </div>
    </>
  );
}
