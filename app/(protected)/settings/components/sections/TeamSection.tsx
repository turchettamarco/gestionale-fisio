// app/(protected)/settings/components/sections/TeamSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Team" — gestione multi-operatore.
//
// Fase 3a della feature multi-operatore (mig. 019 + 020):
//   • Toggle globale `multi_operator_enabled` su tabella studios
//   • Lista membri attivi (tabella studio_members) — owner non cancellabile
//   • Inviti pendenti separati (user_id IS NULL, invite_token valorizzato)
//   • Per ogni membro: nome, ruolo, colore, iniziali (signature_short)
//   • Invito link: si genera un token e si copia l'URL da condividere
//
// Le modifiche che si fanno qui alimentano:
//   - Calendario (Fase 4): colonne/filtri per operatore
//   - Modal creazione appuntamento: selettore operatore
//   - Reports: breakdown per operatore
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import MemberPermissionsForm from "./MemberPermissionsForm";
import OperatorHandoverForm from "./OperatorHandoverForm";
import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import type { StudioMemberRow } from "../shared/types";

// ── Palette di 6 colori distintivi per gli operatori ─────────────────────
// Stessa logica di LOCATION_BORDER_PRESETS — ciclata sui membri nuovi
// in ordine, l'utente può sempre cambiarla in edit.
export const OPERATOR_COLOR_PRESETS: Array<{ value: string; label: string }> = [
  { value: "#0d9488", label: "Teal" },        // Marco / owner di default
  { value: "#2563eb", label: "Blu" },
  { value: "#8b5cf6", label: "Viola" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#f59e0b", label: "Ambra" },
  { value: "#16a34a", label: "Verde" },
];

const ROLE_LABELS: Record<StudioMemberRow["role"], string> = {
  owner: "Titolare",
  co_owner: "Co-titolare",
  therapist: "Terapista",
  assistant: "Assistente",
};

const ROLE_DESCRIPTIONS: Record<StudioMemberRow["role"], string> = {
  owner: "Pieno controllo (gestisce team, sedi, fatture). Non cancellabile.",
  co_owner: "Secondo titolare: stesso accesso completo del titolare. Per studi con più soci.",
  therapist: "Accesso limitato: i permessi si configurano col pulsante 🔐.",
  assistant: "Segreteria: accesso completo a agenda, pazienti e incassi.",
};

// Calcola iniziali da display_name (es. "Marco Turchetta" → "MT")
function computeInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 0) return "?";
  return parts.slice(0, 3).map(p => p[0].toUpperCase()).join("");
}

// ── Form inline per nuovo membro / edit ──────────────────────────────────
function MemberForm({
  initial,
  onCancel,
  onSubmit,
  saving,
  isEdit = false,
  isOwnerEdit = false,
  alreadyUsedColors = [],
}: {
  initial?: Partial<StudioMemberRow>;
  onCancel: () => void;
  onSubmit: (payload: {
    display_name: string;
    email: string;
    role: StudioMemberRow["role"];
    display_color: string;
    signature_short: string;
  }) => void;
  saving: boolean;
  isEdit?: boolean;
  isOwnerEdit?: boolean;
  alreadyUsedColors?: string[];
}) {
  // Suggerisci il primo colore non ancora usato (se è un nuovo membro)
  const suggestedColor = useMemo(() => {
    if (initial?.display_color) return initial.display_color;
    return OPERATOR_COLOR_PRESETS.find(p => !alreadyUsedColors.includes(p.value))?.value
      ?? OPERATOR_COLOR_PRESETS[0].value;
  }, [initial?.display_color, alreadyUsedColors]);

  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<StudioMemberRow["role"]>(initial?.role ?? "therapist");
  const [color, setColor] = useState<string>(suggestedColor);
  const [signature, setSignature] = useState<string>(
    initial?.signature_short ?? computeInitials(initial?.display_name ?? "")
  );

  const submit = () => {
    if (!displayName.trim()) {
      alert("Il nome del membro è obbligatorio");
      return;
    }
    if (!isEdit && !email.trim()) {
      alert("L'email è obbligatoria per generare il link di invito");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      alert("Email non valida");
      return;
    }
    if (!signature.trim()) {
      alert("Le iniziali sono obbligatorie (max 3 caratteri)");
      return;
    }
    onSubmit({
      display_name: displayName.trim(),
      email: email.trim().toLowerCase(),
      role,
      display_color: color,
      signature_short: signature.trim().toUpperCase().slice(0, 3),
    });
  };

  // Auto-calcola signature quando si scrive il nome (solo se non è edit)
  const onNameChange = (v: string) => {
    setDisplayName(v);
    if (!isEdit) {
      setSignature(computeInitials(v));
    }
  };

  return (
    <div style={{
      background: THEME.panelSoft, border: `1px solid ${THEME.border}`,
      borderRadius: 8, padding: 14, marginTop: 8,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Nome completo *</label>
          <input
            value={displayName}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Es. Marco Turchetta"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Iniziali *</label>
          <input
            value={signature}
            onChange={e => setSignature(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="MT"
            maxLength={3}
            style={{ ...inputStyle, fontWeight: 800, letterSpacing: 2, textAlign: "center" }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Email {!isEdit && "*"}</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="collega@email.it"
            type="email"
            disabled={isEdit && initial?.user_id != null} // se è già un membro registrato, email è sua
            style={{
              ...inputStyle,
              opacity: (isEdit && initial?.user_id != null) ? 0.5 : 1,
              cursor: (isEdit && initial?.user_id != null) ? "not-allowed" : "text",
            }}
          />
          {!isEdit && (
            <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
              Genera un link di invito da condividere via WhatsApp / email.
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>Ruolo *</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value as StudioMemberRow["role"])}
            disabled={isOwnerEdit}
            style={{
              ...inputStyle,
              opacity: isOwnerEdit ? 0.5 : 1,
              cursor: isOwnerEdit ? "not-allowed" : "pointer",
            }}
          >
            {!isOwnerEdit && <option value="therapist">Terapista</option>}
            {!isOwnerEdit && <option value="assistant">Assistente</option>}
            {!isOwnerEdit && <option value="co_owner">Co-titolare</option>}
            {isOwnerEdit && <option value="owner">Titolare</option>}
          </select>
          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
            {ROLE_DESCRIPTIONS[role]}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Colore identificativo</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {OPERATOR_COLOR_PRESETS.map(preset => {
            const isUsed = alreadyUsedColors.includes(preset.value) && preset.value !== initial?.display_color;
            const isSelected = color === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => setColor(preset.value)}
                title={isUsed ? `${preset.label} (già in uso)` : preset.label}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: preset.value,
                  border: isSelected ? `3px solid ${THEME.text}` : `2px solid ${THEME.border}`,
                  cursor: "pointer",
                  position: "relative",
                  opacity: isUsed ? 0.4 : 1,
                  transition: "transform 0.1s",
                  transform: isSelected ? "scale(1.1)" : "scale(1)",
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

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <BtnOutline label="Annulla" onClick={onCancel} disabled={saving} />
        <BtnPrimary
          label={saving ? "Salvataggio..." : (isEdit ? "Salva modifiche" : "Genera invito")}
          onClick={submit}
          disabled={saving}
        />
      </div>
    </div>
  );
}

// ── Card singolo membro (read-only o pending) ────────────────────────────
function MemberCard({
  member,
  isCurrentUser,
  onEdit,
  onDelete,
  onRates,
  onSchedule,
  onPermissions,
  onHandover,
  onCopyInvite,
  onResendInvite,
  inviteUrl,
  copyFlash,
}: {
  member: StudioMemberRow;
  isCurrentUser: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRates: () => void;
  onSchedule: () => void;
  onPermissions: () => void;
  onHandover: () => void;
  onCopyInvite?: () => void;
  onResendInvite?: () => void;
  inviteUrl?: string;
  copyFlash: boolean;
}) {
  const isPending = member.user_id == null;
  // Titolare = proprietario dell'abbonamento (non eliminabile).
  // Il co-titolare ha gli stessi poteri operativi ma resta rimuovibile.
  const isOwner = member.role === "owner";
  const initials = member.signature_short || computeInitials(member.display_name);

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${THEME.border}`,
      borderRadius: 10,
      padding: 14,
      display: "flex",
      alignItems: "center",
      gap: 14,
      opacity: isPending ? 0.85 : 1,
    }}>
      {/* Avatar colorato con iniziali */}
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: member.display_color || "#94a3b8",
        color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 800,
        letterSpacing: 1,
        flexShrink: 0,
        boxShadow: "0 2px 6px rgba(15,23,42,0.15)",
      }}>
        {initials}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: THEME.text }}>
            {member.display_name || (isPending ? "In attesa di accettazione" : "(senza nome)")}
          </span>
          {isCurrentUser && (
            <span style={{
              fontSize: 10, fontWeight: 800, padding: "2px 6px",
              background: "rgba(13,148,136,0.12)", color: THEME.teal,
              borderRadius: 4, letterSpacing: 0.5,
            }}>TU</span>
          )}
          {isPending && (
            <span style={{
              fontSize: 10, fontWeight: 800, padding: "2px 6px",
              background: "#fef3c7", color: "#92400e",
              borderRadius: 4, letterSpacing: 0.5,
            }}>INVITO PENDENTE</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
          {ROLE_LABELS[member.role]}
          {member.email && <> · {member.email}</>}
        </div>

        {/* Link invito (solo se pending) */}
        {isPending && inviteUrl && (
          <div style={{
            marginTop: 8,
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
            <code style={{
              fontSize: 11,
              background: THEME.panelSoft,
              padding: "4px 8px",
              borderRadius: 4,
              color: THEME.muted,
              border: `1px solid ${THEME.border}`,
              fontFamily: "ui-monospace, monospace",
              maxWidth: 280,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {inviteUrl}
            </code>
            <button
              onClick={onCopyInvite}
              style={{
                fontSize: 11, fontWeight: 700,
                padding: "4px 10px",
                background: copyFlash ? THEME.teal : "#fff",
                color: copyFlash ? "#fff" : THEME.text,
                border: `1px solid ${copyFlash ? THEME.teal : THEME.border}`,
                borderRadius: 6,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {copyFlash ? "✓ Copiato" : "📋 Copia"}
            </button>
          </div>
        )}
      </div>

      {/* Azioni */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {member.user_id && (
          <button
            onClick={onHandover}
            title="Sostituisci: trasferisci i suoi appuntamenti a un collega"
            style={{
              padding: "6px 10px", fontSize: 13, fontWeight: 700,
              background: "#fff", color: THEME.text,
              border: `1px solid ${THEME.border}`, borderRadius: 6,
              cursor: "pointer",
            }}
          >
            🔁
          </button>
        )}
        <button
          onClick={onPermissions}
          title="Permessi e visibilità dati"
          style={{
            padding: "6px 10px", fontSize: 13, fontWeight: 700,
            background: "#fff", color: THEME.text,
            border: `1px solid ${THEME.border}`, borderRadius: 6,
            cursor: "pointer",
          }}
        >
          🔐
        </button>
        <button
          onClick={onSchedule}
          title="Turni di lavoro"
          style={{
            padding: "6px 10px", fontSize: 13, fontWeight: 700,
            background: "#fff", color: THEME.blue,
            border: `1px solid ${THEME.border}`, borderRadius: 6,
            cursor: "pointer",
          }}
        >
          🕐
        </button>
        <button
          onClick={onRates}
          title="Tariffe per trattamento"
          style={{
            padding: "6px 10px", fontSize: 13, fontWeight: 700,
            background: "#fff", color: THEME.teal,
            border: `1px solid ${THEME.border}`, borderRadius: 6,
            cursor: "pointer",
          }}
        >
          €
        </button>
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
        {!isOwner && !isCurrentUser && (
          <button
            onClick={onDelete}
            title={isPending ? "Annulla invito" : "Rimuovi dal team"}
            style={{
              padding: "6px 10px", fontSize: 12, fontWeight: 700,
              background: "#fff", color: THEME.red,
              border: `1px solid ${THEME.border}`, borderRadius: 6,
              cursor: "pointer",
            }}
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}

// ── Form tariffe trattamento per operatore (Fase R1) ─────────────────────
// Mostra una lista trattamenti × input €. Carica le tariffe esistenti dal DB
// e fa upsert al salva. La durata standard del trattamento è mostrata accanto
// per ricordare al proprietario che il compenso scala con la durata reale.
function MemberRatesForm({
  studioId,
  memberId,
  memberDisplayName,
  treatments,
  onClose,
}: {
  studioId: string;
  memberId: string; // studio_members.id (NB: non user_id)
  memberDisplayName: string;
  treatments: Array<{ id: string; label: string; duration_min: number; color: string }>;
  onClose: () => void;
}) {
  const [rates, setRates] = useState<Record<string, string>>({}); // treatment_type_id -> "12.50"
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: fetchErr } = await supabase
        .from("operator_treatment_rates")
        .select("treatment_type_id, rate_per_session")
        .eq("member_id", memberId);
      if (cancelled) return;
      if (fetchErr) {
        setError("Errore caricamento tariffe: " + fetchErr.message);
        setLoading(false);
        return;
      }
      const map: Record<string, string> = {};
      for (const r of data || []) {
        map[r.treatment_type_id as string] = String(r.rate_per_session);
      }
      setRates(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [memberId]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      // Upsert per ciascun trattamento con valore numerico valido (>=0).
      // Valore vuoto = nessuna tariffa = DELETE riga (se esiste).
      for (const t of treatments) {
        const raw = (rates[t.id] || "").trim().replace(",", ".");
        const isEmpty = raw === "";
        const num = isEmpty ? null : Number(raw);
        if (num !== null && (Number.isNaN(num) || num < 0)) {
          throw new Error(`Tariffa non valida per "${t.label}": ${raw}`);
        }
        if (num === null) {
          // Cancella eventuale riga esistente
          await supabase
            .from("operator_treatment_rates")
            .delete()
            .eq("member_id", memberId)
            .eq("treatment_type_id", t.id);
        } else {
          // Upsert
          const { error: upsertErr } = await supabase
            .from("operator_treatment_rates")
            .upsert(
              {
                studio_id: studioId,
                member_id: memberId,
                treatment_type_id: t.id,
                rate_per_session: num,
              },
              { onConflict: "member_id,treatment_type_id" }
            );
          if (upsertErr) throw new Error(upsertErr.message);
        }
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: "#f8fafc",
      border: `1px dashed ${THEME.border}`,
      borderRadius: 10,
      padding: 14,
      marginTop: -4,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>
          Compensi per trattamento — <span style={{ color: THEME.teal }}>{memberDisplayName}</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 16, color: THEME.muted, padding: "0 4px",
          }}
          title="Chiudi"
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 12, lineHeight: 1.5 }}>
        Il compenso indicato è per una seduta alla durata standard del trattamento.
        Per durate diverse il compenso reale si scala in proporzione (es. tariffa €25 a 60min → 30min = €12.50, 90min = €37.50).
        Lascia vuoto per non assegnare una tariffa a un trattamento.
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: THEME.muted, padding: "8px 0" }}>Caricamento…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 70px", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase" }}>Trattamento</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", textAlign: "right" }}>Compenso (€)</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, textTransform: "uppercase", textAlign: "right" }}>Durata std</div>

          {treatments.map(t => (
            <React.Fragment key={t.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: t.color, flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, color: THEME.text, fontWeight: 500 }}>{t.label}</span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={rates[t.id] ?? ""}
                onChange={(e) => setRates(prev => ({ ...prev, [t.id]: e.target.value }))}
                style={{
                  padding: "6px 10px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 6,
                  fontFamily: "inherit",
                  textAlign: "right",
                  background: "#fff",
                }}
              />
              <div style={{ fontSize: 12, color: THEME.muted, textAlign: "right" }}>
                {t.duration_min}min
              </div>
            </React.Fragment>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 10, padding: "8px 10px",
          background: "#fef2f2", border: "1px solid #fecaca",
          color: "#991b1b", borderRadius: 6, fontSize: 12, fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        {savedFlash && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: THEME.green,
            display: "inline-flex", alignItems: "center", padding: "0 8px",
          }}>
            ✓ Salvato
          </span>
        )}
        <button
          onClick={onClose}
          style={{
            padding: "8px 14px", fontSize: 12, fontWeight: 600,
            background: "#fff", color: THEME.text,
            border: `1px solid ${THEME.border}`, borderRadius: 6,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Chiudi
        </button>
        <button
          onClick={handleSave}
          disabled={loading || saving}
          style={{
            padding: "8px 14px", fontSize: 12, fontWeight: 700,
            background: THEME.teal, color: "#fff",
            border: "none", borderRadius: 6,
            cursor: (loading || saving) ? "not-allowed" : "pointer",
            opacity: (loading || saving) ? 0.6 : 1,
            fontFamily: "inherit",
          }}
        >
          {saving ? "Salvataggio…" : "Salva tariffe"}
        </button>
      </div>
    </div>
  );
}

// ── Form turni operatore (Fase R2) ──────────────────────────────────────
// Griglia settimanale 7 giorni. Ogni giorno può contenere N fasce orarie.
// Salvataggio: cancella tutte le righe del membro e re-INSERT (più semplice
// che diff puntuali; tabella piccola, costo trascurabile).
const DOW_LABELS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // ordine lun-dom (lun primo)

type ScheduleSlot = { start: string; end: string }; // "HH:MM"

function MemberSchedulesForm({
  studioId,
  memberId,
  memberDisplayName,
  onClose,
}: {
  studioId: string;
  memberId: string;
  memberDisplayName: string;
  onClose: () => void;
}) {
  const [slots, setSlots] = useState<Record<number, ScheduleSlot[]>>({
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: fetchErr } = await supabase
        .from("operator_schedules")
        .select("day_of_week, start_time, end_time")
        .eq("member_id", memberId)
        .order("day_of_week")
        .order("start_time");
      if (cancelled) return;
      if (fetchErr) {
        setError("Errore caricamento turni: " + fetchErr.message);
        setLoading(false);
        return;
      }
      const next: Record<number, ScheduleSlot[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
      for (const r of data || []) {
        const dow = r.day_of_week as number;
        // start_time arriva come "HH:MM:SS"
        const start = String(r.start_time).slice(0, 5);
        const end = String(r.end_time).slice(0, 5);
        next[dow].push({ start, end });
      }
      setSlots(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [memberId]);

  const addSlot = (dow: number) => {
    setSlots(prev => ({
      ...prev,
      [dow]: [...prev[dow], { start: "09:00", end: "13:00" }],
    }));
  };

  const removeSlot = (dow: number, idx: number) => {
    setSlots(prev => ({
      ...prev,
      [dow]: prev[dow].filter((_, i) => i !== idx),
    }));
  };

  const updateSlot = (dow: number, idx: number, field: "start" | "end", value: string) => {
    setSlots(prev => ({
      ...prev,
      [dow]: prev[dow].map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      // Validation: end > start per ogni fascia
      for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
        for (const s of slots[dow]) {
          if (s.end <= s.start) {
            throw new Error(`${DOW_LABELS[dow]}: l'ora fine (${s.end}) deve essere dopo l'ora inizio (${s.start})`);
          }
        }
      }
      // DELETE all + re-INSERT (più semplice di diff)
      const { error: delErr } = await supabase
        .from("operator_schedules")
        .delete()
        .eq("member_id", memberId);
      if (delErr) throw new Error("Errore cancellazione: " + delErr.message);

      const rows: Array<{ studio_id: string; member_id: string; day_of_week: number; start_time: string; end_time: string }> = [];
      for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
        for (const s of slots[dow]) {
          rows.push({
            studio_id: studioId,
            member_id: memberId,
            day_of_week: dow,
            start_time: s.start + ":00",
            end_time: s.end + ":00",
          });
        }
      }
      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("operator_schedules")
          .insert(rows);
        if (insErr) throw new Error("Errore salvataggio: " + insErr.message);
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: "#f8fafc",
      border: `1px dashed ${THEME.border}`,
      borderRadius: 10,
      padding: 14,
      marginTop: -4,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>
          Turni di lavoro — <span style={{ color: THEME.blue }}>{memberDisplayName}</span>
        </div>
        <button
          onClick={onClose}
          style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: THEME.muted, padding: "0 4px" }}
          title="Chiudi"
        >×</button>
      </div>
      <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 12, lineHeight: 1.5 }}>
        Per ogni giorno della settimana puoi aggiungere una o più fasce orarie (es. mattina 09:00–13:00 + pomeriggio 15:00–19:00). Giorni senza fasce = non lavora.
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: THEME.muted, padding: "8px 0" }}>Caricamento…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DOW_ORDER.map(dow => (
            <div key={dow} style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr 32px",
              gap: 8,
              alignItems: "center",
              padding: "8px 10px",
              background: "#fff",
              borderRadius: 6,
              border: `1px solid ${THEME.border}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text }}>
                {DOW_LABELS[dow]}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {slots[dow].length === 0 ? (
                  <span style={{ fontSize: 11, color: THEME.muted, fontStyle: "italic" }}>Riposo</span>
                ) : (
                  slots[dow].map((s, i) => (
                    <div key={i} style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 6px",
                      background: "#f1f5f9",
                      borderRadius: 6,
                      border: `1px solid ${THEME.border}`,
                    }}>
                      <input
                        type="time"
                        value={s.start}
                        onChange={(e) => updateSlot(dow, i, "start", e.target.value)}
                        style={{ padding: "3px 4px", fontSize: 12, fontWeight: 600, color: "#0f172a", border: `1px solid ${THEME.border}`, borderRadius: 4, fontFamily: "inherit", width: 84 }}
                      />
                      <span style={{ fontSize: 11, color: THEME.muted }}>–</span>
                      <input
                        type="time"
                        value={s.end}
                        onChange={(e) => updateSlot(dow, i, "end", e.target.value)}
                        style={{ padding: "3px 4px", fontSize: 12, fontWeight: 600, color: "#0f172a", border: `1px solid ${THEME.border}`, borderRadius: 4, fontFamily: "inherit", width: 84 }}
                      />
                      <button
                        onClick={() => removeSlot(dow, i)}
                        title="Rimuovi fascia"
                        style={{ background: "transparent", border: "none", color: THEME.red, cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                      >×</button>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={() => addSlot(dow)}
                title="Aggiungi fascia"
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  border: `1px solid ${THEME.border}`,
                  background: "#fff", color: THEME.teal,
                  cursor: "pointer", fontSize: 16, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "inherit",
                }}
              >+</button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 10, padding: "8px 10px",
          background: "#fef2f2", border: "1px solid #fecaca",
          color: "#991b1b", borderRadius: 6, fontSize: 12, fontWeight: 600,
        }}>{error}</div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        {savedFlash && (
          <span style={{ fontSize: 12, fontWeight: 700, color: THEME.green, display: "inline-flex", alignItems: "center", padding: "0 8px" }}>
            ✓ Salvato
          </span>
        )}
        <button
          onClick={onClose}
          style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, background: "#fff", color: THEME.text, border: `1px solid ${THEME.border}`, borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}
        >Chiudi</button>
        <button
          onClick={handleSave}
          disabled={loading || saving}
          style={{ padding: "8px 14px", fontSize: 12, fontWeight: 700, background: THEME.blue, color: "#fff", border: "none", borderRadius: 6, cursor: (loading || saving) ? "not-allowed" : "pointer", opacity: (loading || saving) ? 0.6 : 1, fontFamily: "inherit" }}
        >
          {saving ? "Salvataggio…" : "Salva turni"}
        </button>
      </div>
    </div>
  );
}

// ── Section principale ────────────────────────────────────────────────────
export type TeamSectionProps = {
  show: boolean;
  onToggle: () => void;
  /** ID dello studio corrente (Fase R1: usato per caricare tariffe e treatments). */
  studioId: string;
  // Toggle globale
  multiOperatorEnabled: boolean;
  setMultiOperatorEnabled: (v: boolean) => void;
  savingMultiToggle: boolean;
  onSaveMultiToggle: () => void;
  // Membri
  members: StudioMemberRow[];
  currentUserId: string | null;
  loadingMembers: boolean;
  savingMember: boolean;
  onCreateInvite: (payload: {
    display_name: string;
    email: string;
    role: StudioMemberRow["role"];
    display_color: string;
    signature_short: string;
  }) => Promise<{ inviteToken: string } | null>;
  onUpdateMember: (
    userIdOrToken: string,
    isToken: boolean,
    payload: Partial<{
      display_name: string;
      role: StudioMemberRow["role"];
      display_color: string;
      signature_short: string;
    }>
  ) => Promise<void>;
  onDeleteMember: (userIdOrToken: string, isToken: boolean) => Promise<void>;
  /** Tappa G: ricarica la lista membri dopo il salvataggio dei permessi. */
  onReloadMembers?: () => void | Promise<void>;
  // Layout vista settimana multi-operatore (mig. 022)
  // Visibile solo se multi_operator_enabled = true
  weeklyViewLayout: "classic" | "timeline" | "pile" | "grid" | "roster";
  setWeeklyViewLayout: (v: "classic" | "timeline" | "pile" | "grid" | "roster") => void;
  savingWeeklyLayout: boolean;
  onSaveWeeklyLayout: () => void;
  // Vista calendario predefinita all'apertura (mig. 023, Fase D).
  // Visibile solo se multi_operator_enabled = true.
};

export default function TeamSection({
  show,
  onToggle,
  studioId,
  multiOperatorEnabled,
  setMultiOperatorEnabled,
  savingMultiToggle,
  onSaveMultiToggle,
  members,
  currentUserId,
  loadingMembers,
  savingMember,
  onCreateInvite,
  onUpdateMember,
  onDeleteMember,
  onReloadMembers,
  weeklyViewLayout,
  setWeeklyViewLayout,
  savingWeeklyLayout,
  onSaveWeeklyLayout,
}: TeamSectionProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // user_id o invite_token
  const [copyFlashId, setCopyFlashId] = useState<string | null>(null);

  // Stato form tariffe (Fase R1): id studio_members del membro per cui è
  // aperto il pannello tariffe. null = chiuso.
  const [ratesMemberId, setRatesMemberId] = useState<string | null>(null);

  // Stato form turni (Fase R2)
  const [scheduleMemberId, setScheduleMemberId] = useState<string | null>(null);
  // Tappa G: pannello permessi granulari del membro (mig. 071)
  const [permsMemberId, setPermsMemberId] = useState<string | null>(null);
  // Sostituzione operatore (Tappa L): riassegnazione massiva appuntamenti.
  const [handoverMemberId, setHandoverMemberId] = useState<string | null>(null);

  // Catalogo trattamenti dello studio (per la matrice tariffe).
  // Carico una volta al mount, refresh quando si apre la sezione tariffe.
  const [treatmentsCatalog, setTreatmentsCatalog] = useState<Array<{
    id: string;
    label: string;
    duration_min: number;
    color: string;
  }>>([]);
  useEffect(() => {
    if (!studioId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("treatment_types")
        .select("id, label, duration_min, color, is_active, sort_order")
        .eq("studio_id", studioId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (cancelled) return;
      if (error || !data) {
        setTreatmentsCatalog([]);
        return;
      }
      setTreatmentsCatalog(
        data.map((r) => ({
          id: r.id as string,
          label: r.label as string,
          duration_min: (r.duration_min as number) ?? 60,
          color: (r.color as string) ?? "#94a3b8",
        }))
      );
    })();
    return () => { cancelled = true; };
  }, [studioId]);

  // Ordinamento: owner prima, poi attivi, poi pending
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.role === "owner" && b.role !== "owner") return -1;
      if (a.role !== "owner" && b.role === "owner") return 1;
      const aPending = a.user_id == null ? 1 : 0;
      const bPending = b.user_id == null ? 1 : 0;
      if (aPending !== bPending) return aPending - bPending;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [members]);

  // Colori già usati (per evitare duplicati nel suggested)
  const usedColors = useMemo(() => {
    return members
      .map(m => m.display_color)
      .filter((c): c is string => c != null);
  }, [members]);

  const handleCreate = async (payload: {
    display_name: string;
    email: string;
    role: StudioMemberRow["role"];
    display_color: string;
    signature_short: string;
  }) => {
    const result = await onCreateInvite(payload);
    if (result) {
      setShowNewForm(false);
    }
  };

  const buildInviteUrl = (token: string): string => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/signup?invite=${token}`;
  };

  const handleCopyInvite = async (token: string) => {
    const url = buildInviteUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopyFlashId(token);
      setTimeout(() => setCopyFlashId(null), 1500);
    } catch {
      alert("Impossibile copiare automaticamente. Link:\n" + url);
    }
  };

  const handleDelete = async (member: StudioMemberRow) => {
    const isPending = member.user_id == null;
    const msg = isPending
      ? `Annullare l'invito per ${member.email}?`
      : `Rimuovere ${member.display_name} dal team? Gli appuntamenti già creati resteranno visibili ma "non assegnati".`;
    if (!confirm(msg)) return;
    const idOrToken = isPending ? (member.invite_token ?? "") : (member.user_id ?? "");
    if (!idOrToken) return;
    await onDeleteMember(idOrToken, isPending);
  };

  return (
    <div style={cardStyle}>
      <div
        style={sectionHead}
        onClick={onToggle}
      >
        <div>
          <span style={{ fontSize: 20, marginRight: 10 }}>👥</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: THEME.text }}>
            Team & Operatori
          </span>
          {multiOperatorEnabled && (
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
          {/* ── Toggle multi-operatore ─────────────────────────────────── */}
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
                  Modalità multi-operatore
                </div>
                <div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.5 }}>
                  Quando attiva, il calendario mostra colonne per operatore, i nuovi appuntamenti
                  richiedono di scegliere chi li svolge, e i report mostrano statistiche per ogni
                  membro del team. Disattivala se preferisci la vista classica a calendario unico.
                </div>
              </div>
              <label style={{
                position: "relative", display: "inline-block",
                width: 48, height: 26, flexShrink: 0,
              }}>
                <input
                  type="checkbox"
                  checked={multiOperatorEnabled}
                  onChange={e => setMultiOperatorEnabled(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: "absolute", cursor: "pointer", inset: 0,
                  background: multiOperatorEnabled
                    ? "linear-gradient(135deg, #0d9488, #2563eb)"
                    : THEME.border,
                  borderRadius: 26, transition: "background 0.2s",
                }}>
                  <span style={{
                    position: "absolute",
                    height: 20, width: 20, left: multiOperatorEnabled ? 25 : 3,
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

          {/* ── Lista membri ───────────────────────────────────────────── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>
              Membri del team ({sortedMembers.filter(m => m.user_id != null).length})
              {sortedMembers.filter(m => m.user_id == null).length > 0 && (
                <span style={{ fontWeight: 600, color: THEME.muted }}>
                  {" "}+ {sortedMembers.filter(m => m.user_id == null).length} invito/i pendente/i
                </span>
              )}
            </div>
            {!showNewForm && (
              <BtnPrimary label="+ Invita collega" onClick={() => setShowNewForm(true)} />
            )}
          </div>

          {showNewForm && (
            <MemberForm
              onCancel={() => setShowNewForm(false)}
              onSubmit={handleCreate}
              saving={savingMember}
              alreadyUsedColors={usedColors}
            />
          )}

          {loadingMembers && sortedMembers.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: THEME.muted, fontSize: 13 }}>
              Caricamento membri...
            </div>
          )}

          {!loadingMembers && sortedMembers.length === 0 && (
            <div style={{
              padding: 24, textAlign: "center",
              background: THEME.panelSoft,
              border: `1px dashed ${THEME.border}`,
              borderRadius: 10,
            }}>
              <div style={{ fontSize: 13, color: THEME.muted, marginBottom: 8 }}>
                Nessun membro. Invita il primo collega per iniziare a usare il multi-operatore.
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {sortedMembers.map(member => {
              const memberKey = member.user_id ?? member.invite_token ?? "?";
              const isEditing = editingId === memberKey;
              const isCurrentUser = member.user_id != null && member.user_id === currentUserId;
              const isPending = member.user_id == null;

              if (isEditing) {
                return (
                  <MemberForm
                    key={memberKey}
                    initial={member}
                    isEdit
                    isOwnerEdit={member.role === "owner"}
                    alreadyUsedColors={usedColors.filter(c => c !== member.display_color)}
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (payload) => {
                      const idOrToken = isPending ? (member.invite_token ?? "") : (member.user_id ?? "");
                      if (!idOrToken) return;
                      await onUpdateMember(idOrToken, isPending, {
                        display_name: payload.display_name,
                        role: payload.role,
                        display_color: payload.display_color,
                        signature_short: payload.signature_short,
                      });
                      setEditingId(null);
                    }}
                    saving={savingMember}
                  />
                );
              }

              return (
                <React.Fragment key={memberKey}>
                  <MemberCard
                    member={member}
                    isCurrentUser={isCurrentUser}
                    inviteUrl={isPending && member.invite_token ? buildInviteUrl(member.invite_token) : undefined}
                    copyFlash={copyFlashId === member.invite_token}
                    onEdit={() => setEditingId(memberKey)}
                    onDelete={() => handleDelete(member)}
                    onRates={() => {
                      setScheduleMemberId(null);
                      setRatesMemberId(ratesMemberId === member.id ? null : member.id);
                    }}
                    onSchedule={() => {
                      setRatesMemberId(null);
                      setPermsMemberId(null);
                      setScheduleMemberId(scheduleMemberId === member.id ? null : member.id);
                    }}
                    onPermissions={() => {
                      setRatesMemberId(null);
                      setScheduleMemberId(null);
                      setHandoverMemberId(null);
                      setPermsMemberId(permsMemberId === member.id ? null : member.id);
                    }}
                    onHandover={() => {
                      setRatesMemberId(null);
                      setScheduleMemberId(null);
                      setPermsMemberId(null);
                      setHandoverMemberId(handoverMemberId === member.id ? null : member.id);
                    }}
                    onCopyInvite={() => member.invite_token && handleCopyInvite(member.invite_token)}
                  />
                  {ratesMemberId === member.id && treatmentsCatalog.length > 0 && (
                    <MemberRatesForm
                      studioId={studioId}
                      memberId={member.id}
                      memberDisplayName={member.display_name || "—"}
                      treatments={treatmentsCatalog}
                      onClose={() => setRatesMemberId(null)}
                    />
                  )}
                  {ratesMemberId === member.id && treatmentsCatalog.length === 0 && (
                    <div style={{
                      background: "#f8fafc",
                      border: `1px dashed ${THEME.border}`,
                      borderRadius: 10,
                      padding: 14,
                      fontSize: 12,
                      color: THEME.muted,
                      textAlign: "center",
                    }}>
                      Nessun trattamento configurato. Vai prima nella sezione "Trattamenti" per crearne almeno uno.
                    </div>
                  )}
                  {handoverMemberId === member.id && member.user_id && (
                    <OperatorHandoverForm
                      studioId={studioId}
                      fromUserId={member.user_id}
                      fromName={member.display_name || "—"}
                      members={members.map(m => ({ user_id: m.user_id, display_name: m.display_name }))}
                      onClose={() => setHandoverMemberId(null)}
                      onDone={() => { void onReloadMembers?.(); }}
                    />
                  )}
                  {permsMemberId === member.id && (
                    <MemberPermissionsForm
                      memberId={member.id}
                      memberName={member.display_name || "—"}
                      memberRole={member.role}
                      currentPreset={member.permission_preset ?? null}
                      currentPermissions={member.permissions}
                      onSaved={() => { void onReloadMembers?.(); }}
                      onClose={() => setPermsMemberId(null)}
                    />
                  )}
                  {scheduleMemberId === member.id && (
                    <MemberSchedulesForm
                      studioId={studioId}
                      memberId={member.id}
                      memberDisplayName={member.display_name || "—"}
                      onClose={() => setScheduleMemberId(null)}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* ── Layout vista settimanale (mig. 022) ─────────────────────
              Visibile solo in modalità multi-operatore. La scelta vale per
              tutto il team. In single-op il calendario usa sempre la
              vista settimana classica indipendentemente da questo setting. */}
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px dashed ${THEME.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text, marginBottom: 4 }}>
              Layout vista settimana
            </div>
            <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 12, lineHeight: 1.5 }}>
              Quando il team ha 2+ operatori, scegli come visualizzare la settimana. La scelta vale per tutto il team. In modalità single-operatore viene sempre usata la vista classica.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {([
                {
                  k: "classic" as const,
                  title: "Classica",
                  desc: "Sub-colonne MGA dentro ogni giorno. Vista tradizionale, densità alta.",
                  status: "Attiva",
                  preview: (
                    // 4 colonne giorno × 3 sub-colonne MGA strette dentro ciascuna
                    <div style={{ display: "flex", gap: 2, height: 36, background: "#f8fafc", padding: 3, borderRadius: 6 }}>
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                          <div style={{ background: "#0d9488", borderRadius: 1, opacity: 0.85 }} />
                          <div style={{ background: "#8b5cf6", borderRadius: 1, opacity: 0.85 }} />
                          <div style={{ background: "#ec4899", borderRadius: 1, opacity: 0.85 }} />
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  k: "timeline" as const,
                  title: "Timeline operatore",
                  desc: "Una riga per persona, settimana orizzontale. Nomi pieni leggibili.",
                  status: "Attiva",
                  preview: (
                    // 3 righe (una per operatore) × 5 colonne giorno con chip per appuntamento
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, height: 36, background: "#f8fafc", padding: 3, borderRadius: 6 }}>
                      {[
                        { color: "#0d9488", filled: [true, true, false, true, true] },
                        { color: "#8b5cf6", filled: [true, false, true, true, false] },
                        { color: "#ec4899", filled: [false, true, true, false, true] },
                      ].map((row, i) => (
                        <div key={i} style={{ flex: 1, display: "flex", gap: 1 }}>
                          {row.filled.map((on, j) => (
                            <div key={j} style={{ flex: 1, background: on ? row.color : "#e2e8f0", borderRadius: 1, opacity: on ? 0.9 : 0.4 }} />
                          ))}
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  k: "pile" as const,
                  title: "Pile cronologiche",
                  desc: "Ogni giorno è una pila di card colorate per operatore.",
                  status: "Attiva",
                  preview: (
                    // 5 colonne giorno con pila verticale di card colori mescolati
                    <div style={{ display: "flex", gap: 2, height: 36, background: "#f8fafc", padding: 3, borderRadius: 6 }}>
                      {[
                        ["#0d9488", "#8b5cf6", "#0d9488", "#ec4899"],
                        ["#8b5cf6", "#0d9488", "#ec4899"],
                        ["#0d9488", "#8b5cf6"],
                        ["#ec4899", "#0d9488", "#8b5cf6", "#0d9488", "#ec4899"],
                        ["#0d9488", "#ec4899", "#8b5cf6"],
                      ].map((dayColors, i) => (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                          {dayColors.map((c, j) => (
                            <div key={j} style={{ flex: 1, background: c, borderRadius: 1, opacity: 0.85 }} />
                          ))}
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  k: "grid" as const,
                  title: "Griglia + chip",
                  desc: "Griglia ora × giorno classica. Dentro ogni cella, chip colorati MGA.",
                  status: "Attiva",
                  preview: (
                    // 3 fasce orarie × 4 giorni, ogni cella ha 2-3 chip arrotondati
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, height: 36, background: "#f8fafc", padding: 3, borderRadius: 6 }}>
                      {[
                        [["#0d9488", "#8b5cf6"], ["#0d9488"], ["#0d9488", "#8b5cf6", "#ec4899"], ["#8b5cf6"]],
                        [["#0d9488"], ["#0d9488", "#ec4899"], ["#8b5cf6"], ["#0d9488", "#8b5cf6"]],
                        [["#ec4899"], ["#0d9488", "#8b5cf6"], ["#0d9488"], ["#ec4899", "#0d9488"]],
                      ].map((row, i) => (
                        <div key={i} style={{ flex: 1, display: "flex", gap: 1 }}>
                          {row.map((cell, j) => (
                            <div key={j} style={{ flex: 1, display: "flex", gap: 1, alignItems: "center", padding: "0 1px" }}>
                              {cell.map((c, k) => (
                                <div key={k} style={{ flex: 1, height: 3, background: c, borderRadius: 99, opacity: 0.9 }} />
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  k: "roster" as const,
                  title: "Roster",
                  desc: "Griglia ora × giorno. Per ogni cella, lista verticale di tutti gli operatori con il paziente assegnato (o ASSEGNA in rosso se libero).",
                  status: "Attiva",
                  preview: (
                    // 2 fasce orarie × 3 giorni × 3 operatori
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, height: 36, background: "#f8fafc", padding: 2, borderRadius: 6 }}>
                      {[0, 1].map((row) => (
                        <div key={row} style={{ flex: 1, display: "flex", gap: 1 }}>
                          {[
                            // Op M: paziente / ASSEGNA / paziente
                            // Op G: ASSEGNA / paziente / paziente
                            // Op A: paziente / paziente / ASSEGNA
                            [
                              [{c: "#0d9488", a: false}, {c: "#dc2626", a: true}, {c: "#0d9488", a: false}],
                              [{c: "#dc2626", a: true}, {c: "#8b5cf6", a: false}, {c: "#8b5cf6", a: false}],
                              [{c: "#ec4899", a: false}, {c: "#ec4899", a: false}, {c: "#dc2626", a: true}],
                            ],
                            [
                              [{c: "#0d9488", a: false}, {c: "#0d9488", a: false}, {c: "#0d9488", a: false}],
                              [{c: "#8b5cf6", a: false}, {c: "#dc2626", a: true}, {c: "#8b5cf6", a: false}],
                              [{c: "#dc2626", a: true}, {c: "#ec4899", a: false}, {c: "#ec4899", a: false}],
                            ],
                          ][row].map((day, j) => (
                            <div key={j} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
                              {day.map((op, k) => (
                                <div key={k} style={{
                                  flex: 1,
                                  background: op.c,
                                  borderRadius: 1,
                                  opacity: op.a ? 0.85 : 0.6,
                                }} />
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ),
                },
              ]).map(opt => {
                const active = weeklyViewLayout === opt.k;
                const comingSoon = opt.status === "In arrivo";
                return (
                  <button
                    key={opt.k}
                    onClick={() => setWeeklyViewLayout(opt.k)}
                    style={{
                      padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                      border: active ? `2px solid ${THEME.teal}` : `1.5px solid ${THEME.border}`,
                      background: active ? "rgba(13,148,136,0.06)" : "#fff",
                      textAlign: "left", fontFamily: "inherit",
                      display: "flex", flexDirection: "column", gap: 8,
                      opacity: comingSoon ? 0.85 : 1,
                    }}
                  >
                    {opt.preview}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: active ? THEME.teal : THEME.text }}>
                        {opt.title}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 99,
                          background: comingSoon ? "#fef3c7" : "rgba(22,163,74,0.1)",
                          color: comingSoon ? "#92400e" : "#15803d",
                          letterSpacing: 0.3,
                        }}
                      >
                        {comingSoon ? "IN ARRIVO" : "DISPONIBILE"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: THEME.muted, lineHeight: 1.4 }}>
                      {opt.desc}
                    </div>
                    {active && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: THEME.teal, marginTop: 2 }}>
                        ✓ Selezionato
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <BtnPrimary
                label={savingWeeklyLayout ? "Salvataggio…" : "Salva layout"}
                onClick={onSaveWeeklyLayout}
                disabled={savingWeeklyLayout}
              />
            </div>
          </div>

          {/* ── Layout vista mese (Fase 5b) — INFORMATIVO ───────────────────
              In modalità multi-operatore la vista mese ha un solo layout fisso
              (variante A: lista verticale con cognome paziente per ogni
              appuntamento, colorato per operatore). Mostriamo solo l'anteprima
              come riferimento, non è modificabile. */}
          <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px dashed ${THEME.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text, marginBottom: 4 }}>
              Layout vista mese
            </div>
            <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 12, lineHeight: 1.5 }}>
              In modalità multi-operatore la vista mese mostra tutti gli appuntamenti come righe colorate per operatore (cognome paziente + orario). La cella cresce in altezza con il numero di sedute. Layout non modificabile.
            </div>

            <div style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: `1.5px solid ${THEME.teal}`,
              background: "rgba(13,148,136,0.04)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}>
              {/* Header anteprima */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: THEME.teal }}>
                  Anteprima cella giorno
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 99, background: "rgba(22,163,74,0.1)", color: "#15803d", letterSpacing: 0.3 }}>
                  ATTIVO
                </span>
              </div>

              {/* Anteprima SVG/HTML statica della cella mese multi-op */}
              <div style={{
                background: "#fff",
                border: `1px solid ${THEME.border}`,
                borderRadius: 6,
                padding: "5px 6px",
                width: 160,
              }}>
                {/* Header cella: numero + count */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: THEME.text }}>15</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: THEME.muted }}>6</span>
                </div>
                {/* Righe appuntamenti esempio */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {[
                    { time: "9", name: "Rossi M.", color: "#0d9488" },
                    { time: "9:30", name: "Costa V.", color: "#8b5cf6" },
                    { time: "10", name: "Verdi L.", color: "#0d9488" },
                    { time: "11", name: "Galli S.", color: "#ec4899" },
                    { time: "11:30", name: "De Luca", color: "#0d9488" },
                    { time: "15", name: "Lombardi", color: "#8b5cf6" },
                  ].map((row, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 9,
                        lineHeight: 1.25,
                        padding: "2px 5px",
                        borderLeft: `2px solid ${row.color}`,
                        background: `${row.color}1f`,
                        borderRadius: 3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: THEME.text,
                      }}
                    >
                      <span style={{ fontWeight: 800, marginRight: 3 }}>{row.time}</span>
                      {row.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Note tecniche */}
              <div style={{ fontSize: 11, color: THEME.muted, lineHeight: 1.5 }}>
                Le righe sono colorate in base all'operatore assegnato. Sono solo visualizzazione: per modificare un appuntamento, apri vista Giorno o Settimana. Il filtro operatore in alto al calendario funziona anche qui.
              </div>
            </div>
          </div>



        </div>
      )}
    </div>
  );
}
