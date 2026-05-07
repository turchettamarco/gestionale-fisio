// app/(protected)/settings/components/sections/RoomsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Stanze" — gestione multi-stanza.
//
// Fase 3a della feature multi-stanza (mig. 019 + 020):
//   • Toggle globale `multi_room_enabled` su tabella studios
//   • Lista stanze (tabella studio_rooms) con CRUD
//   • Per ogni stanza: nome, colore, sede di appartenenza, trattamenti consentiti
//   • Le stanze alimentano il modal di creazione appuntamento (Fase 4)
//
// Differenze rispetto a "Sedi":
//   - Le sedi sono indirizzi geografici diversi (Studio Centro, Studio Sud).
//   - Le stanze sono ambienti DENTRO una sede (Sala 1, Sala 2, Palestra).
//   - Una stanza può limitare i trattamenti (es. "TECAR" solo nella Sala TECAR).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useMemo } from "react";
import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import type { StudioRoomRow, StudioLocation } from "../shared/types";
import type { TreatmentTypeRow } from "@/src/lib/treatmentTypes";

// ── Palette di 6 colori per le stanze ────────────────────────────────────
// Stessa palette degli operatori — il colore aiuta a riconoscere a colpo
// d'occhio in che stanza è una seduta.
export const ROOM_COLOR_PRESETS: Array<{ value: string; label: string }> = [
  { value: "#0d9488", label: "Teal" },
  { value: "#2563eb", label: "Blu" },
  { value: "#8b5cf6", label: "Viola" },
  { value: "#f59e0b", label: "Ambra" },
  { value: "#16a34a", label: "Verde" },
  { value: "#dc2626", label: "Rosso" },
];

// ── Form inline per nuova stanza / edit ──────────────────────────────────
function RoomForm({
  initial,
  locations,
  treatments,
  onCancel,
  onSubmit,
  saving,
  isEdit = false,
}: {
  initial?: Partial<StudioRoomRow>;
  locations: StudioLocation[];
  treatments: TreatmentTypeRow[];
  onCancel: () => void;
  onSubmit: (payload: {
    name: string;
    color: string | null;
    location_id: string | null;
    treatment_types: string[] | null;
  }) => void;
  saving: boolean;
  isEdit?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string | null>(initial?.color ?? ROOM_COLOR_PRESETS[0].value);
  const [locationId, setLocationId] = useState<string | null>(initial?.location_id ?? null);
  const [treatmentMode, setTreatmentMode] = useState<"all" | "limited">(
    !initial?.treatment_types || initial.treatment_types.length === 0 ? "all" : "limited"
  );
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>(
    initial?.treatment_types ?? []
  );

  const toggleTreatment = (key: string) => {
    setSelectedTreatments(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const submit = () => {
    if (!name.trim()) {
      alert("Il nome della stanza è obbligatorio");
      return;
    }
    onSubmit({
      name: name.trim(),
      color: color,
      location_id: locationId,
      treatment_types: treatmentMode === "all" ? null : selectedTreatments,
    });
  };

  return (
    <div style={{
      background: THEME.panelSoft, border: `1px solid ${THEME.border}`,
      borderRadius: 8, padding: 14, marginTop: 8,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Nome stanza *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Es. Sala 1, Palestra, Sala TECAR"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Sede</label>
          <select
            value={locationId ?? ""}
            onChange={e => setLocationId(e.target.value || null)}
            style={inputStyle}
          >
            <option value="">Tutte le sedi (trasversale)</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.name}{loc.is_primary ? " (principale)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Colore identificativo</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ROOM_COLOR_PRESETS.map(preset => {
            const isSelected = color === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => setColor(preset.value)}
                title={preset.label}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: preset.value,
                  border: isSelected ? `3px solid ${THEME.text}` : `2px solid ${THEME.border}`,
                  cursor: "pointer",
                  position: "relative",
                  transition: "transform 0.1s",
                  transform: isSelected ? "scale(1.1)" : "scale(1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {isSelected && (
                  <span style={{
                    color: "#fff", fontSize: 16, fontWeight: 900,
                    textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                  }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Trattamenti consentiti</label>
        <div style={{ display: "flex", gap: 16, marginTop: 4, marginBottom: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
            <input
              type="radio"
              name="treatmentMode"
              checked={treatmentMode === "all"}
              onChange={() => setTreatmentMode("all")}
            />
            <span style={{ fontWeight: 700 }}>Tutti i trattamenti</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
            <input
              type="radio"
              name="treatmentMode"
              checked={treatmentMode === "limited"}
              onChange={() => setTreatmentMode("limited")}
            />
            <span style={{ fontWeight: 700 }}>Solo alcuni trattamenti</span>
          </label>
        </div>

        {treatmentMode === "limited" && (
          <div style={{
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            padding: 10,
            background: "#fff",
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {treatments.length === 0 && (
                <div style={{ fontSize: 12, color: THEME.muted, fontStyle: "italic" }}>
                  Nessun trattamento configurato. Aggiungi trattamenti dalla tab Studio.
                </div>
              )}
              {treatments.map(t => {
                const isSelected = selectedTreatments.includes(t.key);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTreatment(t.key)}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12, fontWeight: 700,
                      border: `2px solid ${isSelected ? t.color : THEME.border}`,
                      background: isSelected ? `${t.color}22` : "#fff",
                      color: isSelected ? t.color : THEME.muted,
                      borderRadius: 999,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {isSelected && "✓ "}{t.label}
                  </button>
                );
              })}
            </div>
            {treatmentMode === "limited" && selectedTreatments.length === 0 && (
              <div style={{ fontSize: 11, color: THEME.red, marginTop: 8, fontStyle: "italic" }}>
                Seleziona almeno un trattamento, oppure scegli "Tutti i trattamenti".
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 11, color: THEME.muted, marginTop: 6, lineHeight: 1.4 }}>
          {treatmentMode === "all"
            ? "La stanza può ospitare qualsiasi trattamento."
            : "Quando crei un appuntamento, questa stanza apparirà solo se il trattamento è tra quelli selezionati."}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <BtnOutline label="Annulla" onClick={onCancel} disabled={saving} />
        <BtnPrimary
          label={saving ? "Salvataggio..." : (isEdit ? "Salva modifiche" : "Aggiungi stanza")}
          onClick={submit}
          disabled={saving}
        />
      </div>
    </div>
  );
}

// ── Card singola stanza ──────────────────────────────────────────────────
function RoomCard({
  room,
  locations,
  treatments,
  onEdit,
  onDelete,
}: {
  room: StudioRoomRow;
  locations: StudioLocation[];
  treatments: TreatmentTypeRow[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const location = locations.find(l => l.id === room.location_id);
  const allowedTreatments = (room.treatment_types && room.treatment_types.length > 0)
    ? treatments.filter(t => room.treatment_types!.includes(t.key))
    : null;

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${THEME.border}`,
      borderRadius: 10,
      padding: 14,
      display: "flex",
      alignItems: "center",
      gap: 14,
    }}>
      {/* Icona colorata stanza */}
      <div style={{
        width: 48, height: 48, borderRadius: 10,
        background: room.color || "#94a3b8",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22,
        flexShrink: 0,
        boxShadow: "0 2px 6px rgba(15,23,42,0.15)",
      }}>
        🚪
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: THEME.text }}>
          {room.name}
        </div>
        <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
          {location ? `📍 ${location.name}` : "📍 Tutte le sedi"}
          {allowedTreatments && (
            <> · {allowedTreatments.length === 1
              ? `Solo ${allowedTreatments[0].label}`
              : `${allowedTreatments.length} trattamenti specifici`
            }</>
          )}
          {!allowedTreatments && <> · Universale</>}
        </div>
        {allowedTreatments && allowedTreatments.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {allowedTreatments.slice(0, 4).map(t => (
              <span key={t.id} style={{
                fontSize: 10, fontWeight: 700,
                padding: "2px 6px",
                background: `${t.color}22`,
                color: t.color,
                borderRadius: 4,
              }}>
                {t.label}
              </span>
            ))}
            {allowedTreatments.length > 4 && (
              <span style={{ fontSize: 10, color: THEME.muted, padding: "2px 6px" }}>
                +{allowedTreatments.length - 4}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Azioni */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={onEdit}
          title="Modifica"
          style={{
            padding: "6px 10px", fontSize: 12, fontWeight: 700,
            background: "#fff", color: THEME.text,
            border: `1px solid ${THEME.border}`, borderRadius: 6,
            cursor: "pointer",
          }}
        >
          ✏️
        </button>
        <button
          onClick={onDelete}
          title="Elimina stanza"
          style={{
            padding: "6px 10px", fontSize: 12, fontWeight: 700,
            background: "#fff", color: THEME.red,
            border: `1px solid ${THEME.border}`, borderRadius: 6,
            cursor: "pointer",
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

// ── Section principale ────────────────────────────────────────────────────
export type RoomsSectionProps = {
  show: boolean;
  onToggle: () => void;
  // Toggle globale
  multiRoomEnabled: boolean;
  setMultiRoomEnabled: (v: boolean) => void;
  savingMultiToggle: boolean;
  onSaveMultiToggle: () => void;
  // Stanze
  rooms: StudioRoomRow[];
  locations: StudioLocation[];
  treatments: TreatmentTypeRow[];
  loadingRooms: boolean;
  savingRoom: boolean;
  onCreate: (payload: {
    name: string;
    color: string | null;
    location_id: string | null;
    treatment_types: string[] | null;
  }) => Promise<void>;
  onUpdate: (id: string, payload: Partial<{
    name: string;
    color: string | null;
    location_id: string | null;
    treatment_types: string[] | null;
  }>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export default function RoomsSection({
  show,
  onToggle,
  multiRoomEnabled,
  setMultiRoomEnabled,
  savingMultiToggle,
  onSaveMultiToggle,
  rooms,
  locations,
  treatments,
  loadingRooms,
  savingRoom,
  onCreate,
  onUpdate,
  onDelete,
}: RoomsSectionProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Ordinamento: per sort_order, poi per nome
  const sortedRooms = useMemo(() => {
    return [...rooms].sort((a, b) => {
      const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (so !== 0) return so;
      return a.name.localeCompare(b.name);
    });
  }, [rooms]);

  const handleDelete = async (room: StudioRoomRow) => {
    if (!confirm(`Eliminare la stanza "${room.name}"? Gli appuntamenti già creati resteranno visibili ma "non assegnati a stanza".`)) return;
    await onDelete(room.id);
  };

  return (
    <div style={cardStyle}>
      <div
        style={sectionHead}
        onClick={onToggle}
      >
        <div>
          <span style={{ fontSize: 20, marginRight: 10 }}>🚪</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: THEME.text }}>
            Stanze & Ambienti
          </span>
          {multiRoomEnabled && (
            <span style={{
              marginLeft: 10,
              fontSize: 10, fontWeight: 800, padding: "2px 6px",
              background: "rgba(13,148,136,0.12)", color: THEME.teal,
              borderRadius: 4, letterSpacing: 0.5,
            }}>
              ATTIVO
            </span>
          )}
        </div>
        <span style={{ fontSize: 16, color: THEME.muted }}>{show ? "▾" : "▸"}</span>
      </div>

      {show && (
        <div style={{ padding: "12px 18px 18px" }}>
          {/* ── Toggle multi-stanza ───────────────────────────────────── */}
          <div style={{
            background: THEME.panelSoft,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: 14,
            marginBottom: 18,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text, marginBottom: 4 }}>
                  Modalità multi-stanza
                </div>
                <div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.5 }}>
                  Quando attiva, ogni appuntamento può essere associato a una stanza specifica
                  e il calendario controlla i conflitti (non puoi prenotare la stessa stanza
                  alla stessa ora). Disattivala se hai un solo ambiente di lavoro.
                </div>
              </div>
              <label style={{
                position: "relative", display: "inline-block",
                width: 48, height: 26, flexShrink: 0,
              }}>
                <input
                  type="checkbox"
                  checked={multiRoomEnabled}
                  onChange={e => setMultiRoomEnabled(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: "absolute", cursor: "pointer", inset: 0,
                  background: multiRoomEnabled
                    ? "linear-gradient(135deg, #0d9488, #2563eb)"
                    : THEME.border,
                  borderRadius: 26, transition: "background 0.2s",
                }}>
                  <span style={{
                    position: "absolute",
                    height: 20, width: 20, left: multiRoomEnabled ? 25 : 3,
                    bottom: 3,
                    background: "#fff", borderRadius: "50%",
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </span>
              </label>
            </div>
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
              <BtnPrimary
                label={savingMultiToggle ? "Salvataggio..." : "Salva impostazione"}
                onClick={onSaveMultiToggle}
                disabled={savingMultiToggle}
              />
            </div>
          </div>

          {/* ── Lista stanze ───────────────────────────────────────────── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>
              Stanze configurate ({sortedRooms.length})
            </div>
            {!showNewForm && (
              <BtnPrimary label="+ Aggiungi stanza" onClick={() => setShowNewForm(true)} />
            )}
          </div>

          {showNewForm && (
            <RoomForm
              locations={locations}
              treatments={treatments}
              onCancel={() => setShowNewForm(false)}
              onSubmit={async (payload) => {
                await onCreate(payload);
                setShowNewForm(false);
              }}
              saving={savingRoom}
            />
          )}

          {loadingRooms && sortedRooms.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: THEME.muted, fontSize: 13 }}>
              Caricamento stanze...
            </div>
          )}

          {!loadingRooms && sortedRooms.length === 0 && !showNewForm && (
            <div style={{
              padding: 24, textAlign: "center",
              background: THEME.panelSoft,
              border: `1px dashed ${THEME.border}`,
              borderRadius: 10,
            }}>
              <div style={{ fontSize: 13, color: THEME.muted, marginBottom: 4 }}>
                Nessuna stanza configurata.
              </div>
              <div style={{ fontSize: 11, color: THEME.muted }}>
                Aggiungi le tue stanze (es. Sala 1, Sala 2, Palestra) per organizzare il calendario.
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {sortedRooms.map(room => {
              if (editingId === room.id) {
                return (
                  <RoomForm
                    key={room.id}
                    initial={room}
                    locations={locations}
                    treatments={treatments}
                    isEdit
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (payload) => {
                      await onUpdate(room.id, payload);
                      setEditingId(null);
                    }}
                    saving={savingRoom}
                  />
                );
              }
              return (
                <RoomCard
                  key={room.id}
                  room={room}
                  locations={locations}
                  treatments={treatments}
                  onEdit={() => setEditingId(room.id)}
                  onDelete={() => handleDelete(room)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
