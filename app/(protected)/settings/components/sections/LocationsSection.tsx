// app/(protected)/settings/components/sections/LocationsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Sedi di lavoro" — gestione multi-sede.
//
// Fase 1 della feature multi-sede:
//   • Toggle globale `multi_location_enabled` su tabella studios
//   • Lista delle sedi (tabella studio_locations) con CRUD
//   • Una sede è marcata is_primary (creata automaticamente dalla migration
//     usando studios.name + studios.address esistenti)
//   • Ogni sede secondaria ha un border_color scelto da palette di 6 preset
//
// Le sedi alimenteranno il dropdown nel modale Crea/Modifica appuntamento
// (Fase 2) e il bordo colorato sulle card del calendario (Fase 3).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState } from "react";
import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import type { StudioLocation } from "../shared/types";

// ── Palette dei 6 colori preimpostati per il bordo ───────────────────────
// Combaciano con THEME.blue/red/green/amber/teal e un viola per varietà.
export const LOCATION_BORDER_PRESETS: Array<{ value: string; label: string }> = [
  { value: "#2563eb", label: "Blu" },
  { value: "#dc2626", label: "Rosso" },
  { value: "#16a34a", label: "Verde" },
  { value: "#f97316", label: "Arancio" },
  { value: "#7c3aed", label: "Viola" },
  { value: "#0d9488", label: "Teal" },
];

export type LocationsSectionProps = {
  show: boolean;
  onToggle: () => void;
  // Toggle globale (su tabella studios)
  multiLocationEnabled: boolean;
  setMultiLocationEnabled: (v: boolean) => void;
  savingMultiToggle: boolean;
  onSaveMultiToggle: () => void;
  // Elenco sedi (su tabella studio_locations)
  locations: StudioLocation[];
  loadingLocations: boolean;
  savingLocation: boolean;
  onCreate: (payload: { name: string; address: string; border_color: string | null }) => Promise<void>;
  onUpdate: (id: string, payload: Partial<{ name: string; address: string; border_color: string | null }>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetPrimary: (id: string) => Promise<void>;
};

// ── Form inline per nuova sede / edit ────────────────────────────────────
function LocationForm({
  initial,
  onCancel,
  onSubmit,
  saving,
  isEdit = false,
}: {
  initial?: { name: string; address: string; border_color: string | null };
  onCancel: () => void;
  onSubmit: (payload: { name: string; address: string; border_color: string | null }) => void;
  saving: boolean;
  isEdit?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [borderColor, setBorderColor] = useState<string | null>(initial?.border_color ?? LOCATION_BORDER_PRESETS[0].value);

  const submit = () => {
    if (!name.trim()) { alert("Il nome della sede è obbligatorio"); return; }
    onSubmit({ name: name.trim(), address: address.trim(), border_color: borderColor });
  };

  return (
    <div style={{
      background: THEME.panelSoft, border: `1px solid ${THEME.border}`,
      borderRadius: 8, padding: 14, marginTop: 8,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Nome sede *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Es. Studio Roccasecca"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Indirizzo</label>
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Via Piave 34, Roccasecca"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Colore bordo (sulle card del calendario)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {LOCATION_BORDER_PRESETS.map(preset => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setBorderColor(preset.value)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 10px", borderRadius: 7,
                border: borderColor === preset.value
                  ? `2px solid ${preset.value}`
                  : `1px solid ${THEME.border}`,
                background: borderColor === preset.value ? `${preset.value}10` : "#fff",
                cursor: "pointer", fontSize: 12, fontWeight: 600,
                color: borderColor === preset.value ? preset.value : THEME.muted,
              }}
            >
              <span style={{
                width: 14, height: 14, borderRadius: 4,
                background: preset.value, display: "inline-block",
              }} />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <BtnOutline label="Annulla" onClick={onCancel} disabled={saving} />
        <BtnPrimary label={saving ? "Salvataggio…" : isEdit ? "Salva modifiche" : "Aggiungi sede"} onClick={submit} disabled={saving} />
      </div>
    </div>
  );
}

// ── Card di una singola sede esistente ───────────────────────────────────
function LocationCard({
  loc,
  onEdit,
  onDelete,
  onSetPrimary,
  isOnly,
}: {
  loc: StudioLocation;
  onEdit: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
  isOnly: boolean;
}) {
  const borderColor = loc.is_primary ? THEME.border : (loc.border_color || THEME.border);
  const borderWidth = loc.is_primary ? 1 : 2;

  return (
    <div style={{
      background: "#fff",
      border: `${borderWidth}px solid ${borderColor}`,
      borderRadius: 8,
      padding: 14,
      marginTop: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {loc.is_primary ? (
            <span style={{
              background: "rgba(37,99,235,0.1)", color: THEME.blue,
              fontSize: 10, fontWeight: 700, padding: "3px 8px",
              borderRadius: 99, textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              Principale
            </span>
          ) : (
            <span style={{
              background: `${loc.border_color || THEME.gray}15`,
              color: loc.border_color || THEME.muted,
              fontSize: 10, fontWeight: 700, padding: "3px 8px",
              borderRadius: 99, textTransform: "uppercase", letterSpacing: 0.5,
            }}>
              Secondaria
            </span>
          )}
          <span style={{ fontSize: 14, fontWeight: 700, color: THEME.text }}>{loc.name}</span>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {!loc.is_primary && (
            <button
              onClick={onSetPrimary}
              style={{
                padding: "4px 10px", fontSize: 11, fontWeight: 600,
                background: "#fff", color: THEME.muted,
                border: `1px solid ${THEME.border}`, borderRadius: 6,
                cursor: "pointer",
              }}
              title="Rendi principale"
            >
              Rendi principale
            </button>
          )}
          <button
            onClick={onEdit}
            style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 600,
              background: "#fff", color: THEME.muted,
              border: `1px solid ${THEME.border}`, borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Modifica
          </button>
          {!loc.is_primary && !isOnly && (
            <button
              onClick={onDelete}
              style={{
                padding: "4px 10px", fontSize: 11, fontWeight: 600,
                background: "#fff", color: THEME.red,
                border: `1px solid ${THEME.red}40`, borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Rimuovi
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Nome
          </div>
          <div style={{ fontSize: 13, color: THEME.text, marginTop: 2 }}>{loc.name}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: THEME.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Indirizzo
          </div>
          <div style={{ fontSize: 13, color: THEME.text, marginTop: 2 }}>
            {loc.address || <span style={{ color: THEME.gray, fontStyle: "italic" }}>—</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principale ────────────────────────────────────────────────
export default function LocationsSection(p: LocationsSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sortedLocs = [...p.locations].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const handleCreate = async (payload: { name: string; address: string; border_color: string | null }) => {
    await p.onCreate(payload);
    setShowAddForm(false);
  };

  const handleUpdate = async (id: string, payload: { name: string; address: string; border_color: string | null }) => {
    await p.onUpdate(id, payload);
    setEditingId(null);
  };

  const handleDelete = async (loc: StudioLocation) => {
    if (loc.is_primary) { alert("Non puoi rimuovere la sede principale."); return; }
    const ok = confirm(`Rimuovere la sede "${loc.name}"?\n\nGli appuntamenti già esistenti collegati a questa sede non saranno cancellati, ma rimarranno senza sede assegnata.`);
    if (!ok) return;
    await p.onDelete(loc.id);
  };

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>📍 Sedi di lavoro</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            {p.loadingLocations
              ? "Caricamento…"
              : p.multiLocationEnabled
                ? `${p.locations.length} ${p.locations.length === 1 ? "sede attiva" : "sedi attive"} · indirizzo automatico nei promemoria`
                : "Studio singolo · attiva per gestire più sedi"}
          </div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: 20 }}>

          {/* Toggle globale */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px", borderRadius: 8,
            background: p.multiLocationEnabled ? "rgba(37,99,235,0.05)" : "rgba(148,163,184,0.06)",
            border: `1px solid ${p.multiLocationEnabled ? "rgba(37,99,235,0.2)" : THEME.border}`,
            marginBottom: 16,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: THEME.text }}>
                Più sedi di lavoro
              </div>
              <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
                Quando attivo, in fase di creazione appuntamento puoi scegliere la sede; l&apos;indirizzo della sede selezionata viene usato automaticamente nel promemoria WhatsApp.
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0, marginLeft: 16 }}>
              <input
                type="checkbox"
                checked={p.multiLocationEnabled}
                onChange={e => p.setMultiLocationEnabled(e.target.checked)}
                style={{ display: "none" }}
              />
              <span style={{
                position: "relative", width: 44, height: 24,
                background: p.multiLocationEnabled ? THEME.blue : THEME.gray,
                borderRadius: 99, transition: "background 0.2s",
              }}>
                <span style={{
                  position: "absolute", top: 2,
                  left: p.multiLocationEnabled ? 22 : 2,
                  width: 20, height: 20, background: "#fff",
                  borderRadius: 99, transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </span>
            </label>
          </div>

          {/* Save toggle button (separato perché impatta studios.multi_location_enabled) */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <BtnPrimary
              label={p.savingMultiToggle ? "Salvataggio…" : "Salva impostazione multi-sede"}
              onClick={p.onSaveMultiToggle}
              disabled={p.savingMultiToggle}
            />
          </div>

          {/* Lista sedi (sempre visibile, anche quando multi è OFF, così l'utente
              può comunque modificare nome/indirizzo della principale) */}
          <div style={{ paddingTop: 4, borderTop: `1px dashed ${THEME.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Le tue sedi
              </div>
              {p.multiLocationEnabled && !showAddForm && (
                <button
                  onClick={() => { setShowAddForm(true); setEditingId(null); }}
                  style={{
                    padding: "6px 12px", fontSize: 12, fontWeight: 700,
                    background: "linear-gradient(135deg, #0d9488, #2563eb)",
                    color: "#fff", border: "none", borderRadius: 7,
                    cursor: "pointer",
                  }}
                >
                  + Aggiungi sede
                </button>
              )}
            </div>

            {p.loadingLocations && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: THEME.muted }}>
                Caricamento sedi…
              </div>
            )}

            {!p.loadingLocations && sortedLocs.map(loc => (
              <div key={loc.id}>
                {editingId === loc.id ? (
                  <LocationForm
                    initial={{ name: loc.name, address: loc.address ?? "", border_color: loc.border_color }}
                    onCancel={() => setEditingId(null)}
                    onSubmit={payload => void handleUpdate(loc.id, payload)}
                    saving={p.savingLocation}
                    isEdit
                  />
                ) : (
                  <LocationCard
                    loc={loc}
                    onEdit={() => { setEditingId(loc.id); setShowAddForm(false); }}
                    onDelete={() => void handleDelete(loc)}
                    onSetPrimary={() => void p.onSetPrimary(loc.id)}
                    isOnly={sortedLocs.length === 1}
                  />
                )}
              </div>
            ))}

            {showAddForm && (
              <LocationForm
                onCancel={() => setShowAddForm(false)}
                onSubmit={handleCreate}
                saving={p.savingLocation}
              />
            )}

            {!p.loadingLocations && !p.multiLocationEnabled && (
              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 7,
                background: "rgba(148,163,184,0.06)",
                border: `1px solid ${THEME.border}`,
                fontSize: 12, color: THEME.muted,
              }}>
                <strong style={{ color: THEME.text }}>ℹ️ Nota:</strong> con multi-sede disattivato, tutti gli appuntamenti useranno automaticamente la sede principale. Per gestire più sedi, attiva l&apos;interruttore qui sopra.
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
