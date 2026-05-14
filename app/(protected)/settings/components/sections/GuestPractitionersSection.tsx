// app/(protected)/settings/components/sections/GuestPractitionersSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Professionisti ospiti" — gestione visiting practitioners.
//
// Feature (mig. 029):
//   • Toggle globale `guest_practitioners_enabled` su tabella studios
//   • Lista professionisti ospiti (tabella guest_practitioners) con CRUD
//   • Per ogni ospite: nome, cognome, specialità, colore, stanza default
//
// COSA È:
//   I "professionisti ospiti" sono esterni allo studio che vengono saltua-
//   riamente (ortopedico una volta al mese, nutrizionista due volte al
//   mese, podologo, psicologo, ecc.). NON sono membri del team: non hanno
//   login, non vedono il gestionale. Sono solo "etichette" che permettono
//   al titolare di annotare appuntamenti gestiti dal/per il professionista
//   ospite e di stamparne l'agenda mensile.
//
// COSA NON È:
//   - Non è multi-operatore (quello richiede login dell'operatore)
//   - Non è multi-studio
//   - I loro appuntamenti NON entrano negli incassi del titolare
//     (il professionista ospite incassa direttamente dai suoi pazienti)
//
// VINCOLI:
//   - Disabilitazione di un ospite = soft-delete (is_active = FALSE).
//     Gli appuntamenti passati restano in DB ma vengono nascosti dall'UI.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useMemo } from "react";
import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import type { GuestPractitionerRow, StudioRoomRow } from "../shared/types";

// ── Palette di colori per ospiti ─────────────────────────────────────────
// Tonalità calde/sature, leggibili sia come fondo card (testo bianco sopra)
// che come accento header. Magenta è il default suggerito perché non collide
// né col verde-blu del brand né col rosso usato per status danger.
export const GUEST_COLOR_PRESETS: Array<{ value: string; label: string }> = [
  { value: "#DB2777", label: "Magenta" },
  { value: "#7C3AED", label: "Viola" },
  { value: "#0891B2", label: "Ciano" },
  { value: "#EA580C", label: "Arancione" },
  { value: "#65A30D", label: "Lime" },
  { value: "#475569", label: "Grigio scuro" },
];

// ── Specialità suggerite (placeholder per il datalist) ───────────────────
const SPECIALTY_SUGGESTIONS = [
  "Ortopedico",
  "Nutrizionista",
  "Podologo",
  "Psicologo",
  "Logopedista",
  "Dietista",
  "Medico dello sport",
  "Posturologo",
];

// ── Form inline per nuovo ospite / edit ──────────────────────────────────
function GuestForm({
  initial,
  rooms,
  onCancel,
  onSubmit,
  saving,
  isEdit = false,
}: {
  initial?: Partial<GuestPractitionerRow>;
  rooms: StudioRoomRow[];
  onCancel: () => void;
  onSubmit: (payload: {
    first_name: string;
    last_name: string;
    specialty: string;
    display_color: string | null;
    default_room_id: string | null;
    notes: string | null;
  }) => void;
  saving: boolean;
  isEdit?: boolean;
}) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? "");
  const [lastName, setLastName] = useState(initial?.last_name ?? "");
  const [specialty, setSpecialty] = useState(initial?.specialty ?? "");
  const [color, setColor] = useState<string | null>(
    initial?.display_color ?? GUEST_COLOR_PRESETS[0].value
  );
  const [roomId, setRoomId] = useState<string | null>(initial?.default_room_id ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const submit = () => {
    if (!firstName.trim() || !lastName.trim() || !specialty.trim()) {
      alert("Nome, cognome e specialità sono obbligatori.");
      return;
    }
    onSubmit({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      specialty: specialty.trim(),
      display_color: color,
      default_room_id: roomId,
      notes: notes.trim() || null,
    });
  };

  return (
    <div style={{
      background: THEME.panelSoft, border: `1px solid ${THEME.border}`,
      borderRadius: 8, padding: 14, marginTop: 8,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Nome *</label>
          <input
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="Andrea"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Cognome *</label>
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Alfieri"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Specialità *</label>
        <input
          list="guest-specialty-suggestions"
          value={specialty}
          onChange={e => setSpecialty(e.target.value)}
          placeholder="Es. Ortopedico, Nutrizionista..."
          style={inputStyle}
        />
        <datalist id="guest-specialty-suggestions">
          {SPECIALTY_SUGGESTIONS.map(s => <option key={s} value={s} />)}
        </datalist>
        <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
          Comparirà come etichetta sotto al nome nel calendario.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Colore identificativo</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {GUEST_COLOR_PRESETS.map(c => {
              const isSelected = color === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    border: `3px solid ${isSelected ? THEME.text : "#fff"}`,
                    boxShadow: isSelected
                      ? `0 0 0 2px ${c.value}`
                      : "0 1px 3px rgba(15,23,42,0.15)",
                    background: c.value,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                />
              );
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Stanza predefinita</label>
          <select
            value={roomId ?? ""}
            onChange={e => setRoomId(e.target.value || null)}
            style={inputStyle}
          >
            <option value="">— Nessuna preselezione —</option>
            {rooms.filter(r => r.is_active).map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
            Verrà preselezionata in fase di creazione appuntamento.
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Note (opzionale)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Es. Viene il primo sabato del mese, contatto: 333 1234567"
          style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <BtnOutline label="Annulla" onClick={onCancel} disabled={saving} />
        <BtnPrimary
          label={saving ? "Salvataggio..." : (isEdit ? "Salva modifiche" : "Aggiungi ospite")}
          onClick={submit}
          disabled={saving}
        />
      </div>
    </div>
  );
}

// ── Card singolo professionista ospite ───────────────────────────────────
function GuestCard({
  guest,
  rooms,
  onEdit,
  onDelete,
}: {
  guest: GuestPractitionerRow;
  rooms: StudioRoomRow[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const room = rooms.find(r => r.id === guest.default_room_id);
  const initials = `${guest.first_name.charAt(0)}${guest.last_name.charAt(0)}`.toUpperCase();
  const color = guest.display_color || "#94a3b8";

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
      {/* Avatar iniziali colorato */}
      <div style={{
        width: 48, height: 48, borderRadius: 10,
        background: color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 800, color: "#fff",
        flexShrink: 0,
        boxShadow: "0 2px 6px rgba(15,23,42,0.15)",
        letterSpacing: 0.5,
      }}>
        {initials}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: THEME.text }}>
          {guest.first_name} {guest.last_name}
        </div>
        <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
          {guest.specialty}
          {room && <> · Stanza: {room.name}</>}
        </div>
        {guest.notes && (
          <div style={{
            fontSize: 11, color: THEME.muted, marginTop: 4,
            fontStyle: "italic", maxWidth: 480,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {guest.notes}
          </div>
        )}
      </div>

      {/* Azioni */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={onEdit}
          style={{
            padding: "6px 12px", fontSize: 12, fontWeight: 700,
            border: `1.5px solid ${THEME.border}`,
            background: "#fff", color: THEME.text,
            borderRadius: 7, cursor: "pointer",
          }}
        >
          Modifica
        </button>
        <button
          onClick={onDelete}
          style={{
            padding: "6px 12px", fontSize: 12, fontWeight: 700,
            border: `1.5px solid ${THEME.red}`,
            background: "#fff", color: THEME.red,
            borderRadius: 7, cursor: "pointer",
          }}
        >
          Disattiva
        </button>
      </div>
    </div>
  );
}

// ── Props del componente principale ──────────────────────────────────────
export type GuestPractitionersSectionProps = {
  show: boolean;
  onToggle: () => void;
  // Toggle generale feature
  guestEnabled: boolean;
  setGuestEnabled: (v: boolean) => void;
  savingGuestToggle: boolean;
  onSaveGuestToggle: () => void;
  // Dati
  guests: GuestPractitionerRow[];
  rooms: StudioRoomRow[];
  loadingGuests: boolean;
  savingGuest: boolean;
  // CRUD callbacks
  onCreate: (payload: {
    first_name: string;
    last_name: string;
    specialty: string;
    display_color: string | null;
    default_room_id: string | null;
    notes: string | null;
  }) => Promise<void>;
  onUpdate: (id: string, payload: Partial<{
    first_name: string;
    last_name: string;
    specialty: string;
    display_color: string | null;
    default_room_id: string | null;
    notes: string | null;
  }>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export default function GuestPractitionersSection({
  show,
  onToggle,
  guestEnabled,
  setGuestEnabled,
  savingGuestToggle,
  onSaveGuestToggle,
  guests,
  rooms,
  loadingGuests,
  savingGuest,
  onCreate,
  onUpdate,
  onDelete,
}: GuestPractitionersSectionProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Ordinamento: per sort_order, poi cognome
  const sortedGuests = useMemo(() => {
    return [...guests]
      .filter(g => g.is_active)
      .sort((a, b) => {
        const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (so !== 0) return so;
        return a.last_name.localeCompare(b.last_name);
      });
  }, [guests]);

  const handleDelete = async (guest: GuestPractitionerRow) => {
    if (!confirm(
      `Disattivare "${guest.first_name} ${guest.last_name}"?\n\n` +
      `Gli appuntamenti già creati restano in archivio ma non saranno più ` +
      `visibili nel calendario. Puoi riattivarlo in seguito.`
    )) return;
    await onDelete(guest.id);
  };

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={onToggle}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 800, color: THEME.text }}>
            Professionisti ospiti
          </span>
          {guestEnabled && (
            <span style={{
              marginLeft: 10,
              fontSize: 10, fontWeight: 800, padding: "2px 6px",
              background: "rgba(186,117,23,0.12)", color: "#BA7517",
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

          {/* ── Toggle generale feature ──────────────────────────────── */}
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
                  Abilita gestione professionisti ospiti
                </div>
                <div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.5 }}>
                  Quando attiva, puoi registrare professionisti esterni (ortopedico,
                  nutrizionista, podologo...) che vengono saltuariamente nel tuo studio.
                  Nel calendario avranno una colonna dedicata nei giorni in cui sono
                  presenti. I loro incassi non rientrano nei tuoi report economici.
                </div>
              </div>
              <label style={{
                position: "relative", display: "inline-block",
                width: 48, height: 26, flexShrink: 0,
              }}>
                <input
                  type="checkbox"
                  checked={guestEnabled}
                  onChange={e => setGuestEnabled(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: "absolute", cursor: "pointer", inset: 0,
                  background: guestEnabled
                    ? "linear-gradient(135deg, #BA7517, #7c3aed)"
                    : THEME.border,
                  borderRadius: 26, transition: "background 0.2s",
                }}>
                  <span style={{
                    position: "absolute",
                    height: 20, width: 20, left: guestEnabled ? 25 : 3,
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
                label={savingGuestToggle ? "Salvataggio..." : "Salva impostazione"}
                onClick={onSaveGuestToggle}
                disabled={savingGuestToggle}
              />
            </div>
          </div>

          {/* ── Lista ospiti (solo se feature attiva) ────────────────── */}
          {guestEnabled && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>
                  Professionisti registrati ({sortedGuests.length})
                </div>
                {!showNewForm && (
                  <BtnPrimary
                    label="+ Aggiungi professionista"
                    onClick={() => { setShowNewForm(true); setEditingId(null); }}
                    disabled={savingGuest}
                  />
                )}
              </div>

              {/* Form nuovo ospite */}
              {showNewForm && (
                <GuestForm
                  rooms={rooms}
                  saving={savingGuest}
                  onCancel={() => setShowNewForm(false)}
                  onSubmit={async (payload) => {
                    await onCreate(payload);
                    setShowNewForm(false);
                  }}
                />
              )}

              {/* Lista */}
              {loadingGuests ? (
                <div style={{ padding: 20, textAlign: "center", color: THEME.muted, fontSize: 13 }}>
                  Caricamento...
                </div>
              ) : sortedGuests.length === 0 && !showNewForm ? (
                <div style={{
                  padding: 24, textAlign: "center", color: THEME.muted, fontSize: 13,
                  background: THEME.panelSoft, borderRadius: 8,
                  border: `1px dashed ${THEME.border}`,
                }}>
                  Nessun professionista ospite registrato.<br />
                  Clicca "+ Aggiungi professionista" per iniziare.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: showNewForm ? 12 : 0 }}>
                  {sortedGuests.map(g => editingId === g.id ? (
                    <GuestForm
                      key={g.id}
                      initial={g}
                      rooms={rooms}
                      saving={savingGuest}
                      isEdit={true}
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (payload) => {
                        await onUpdate(g.id, payload);
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <GuestCard
                      key={g.id}
                      guest={g}
                      rooms={rooms}
                      onEdit={() => { setEditingId(g.id); setShowNewForm(false); }}
                      onDelete={() => void handleDelete(g)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {!guestEnabled && (
            <div style={{
              padding: 16, fontSize: 12, color: THEME.muted, lineHeight: 1.5,
              background: THEME.panelSoft, borderRadius: 8,
              border: `1px dashed ${THEME.border}`,
            }}>
              Funzionalità disattivata. Attiva il toggle sopra per iniziare a registrare
              i professionisti ospiti del tuo studio.
            </div>
          )}

        </div>
      )}
    </div>
  );
}
