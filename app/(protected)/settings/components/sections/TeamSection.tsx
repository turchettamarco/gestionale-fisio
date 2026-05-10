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

import { useState, useMemo } from "react";
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
  therapist: "Terapista",
  assistant: "Assistente",
};

const ROLE_DESCRIPTIONS: Record<StudioMemberRow["role"], string> = {
  owner: "Pieno controllo (gestisce team, sedi, fatture). Non cancellabile.",
  therapist: "Vede e modifica i suoi appuntamenti e quelli del team.",
  assistant: "Supporto operativo (gestisce agenda, non vede i ricavi).",
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
  onCopyInvite,
  onResendInvite,
  inviteUrl,
  copyFlash,
}: {
  member: StudioMemberRow;
  isCurrentUser: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCopyInvite?: () => void;
  onResendInvite?: () => void;
  inviteUrl?: string;
  copyFlash: boolean;
}) {
  const isPending = member.user_id == null;
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

// ── Section principale ────────────────────────────────────────────────────
export type TeamSectionProps = {
  show: boolean;
  onToggle: () => void;
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
  // Layout vista settimana multi-operatore (mig. 022)
  // Visibile solo se multi_operator_enabled = true
  weeklyViewLayout: "classic" | "timeline" | "pile" | "grid";
  setWeeklyViewLayout: (v: "classic" | "timeline" | "pile" | "grid") => void;
  savingWeeklyLayout: boolean;
  onSaveWeeklyLayout: () => void;
};

export default function TeamSection({
  show,
  onToggle,
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
  weeklyViewLayout,
  setWeeklyViewLayout,
  savingWeeklyLayout,
  onSaveWeeklyLayout,
}: TeamSectionProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // user_id o invite_token
  const [copyFlashId, setCopyFlashId] = useState<string | null>(null);

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
                <MemberCard
                  key={memberKey}
                  member={member}
                  isCurrentUser={isCurrentUser}
                  inviteUrl={isPending && member.invite_token ? buildInviteUrl(member.invite_token) : undefined}
                  copyFlash={copyFlashId === member.invite_token}
                  onEdit={() => setEditingId(memberKey)}
                  onDelete={() => handleDelete(member)}
                  onCopyInvite={() => member.invite_token && handleCopyInvite(member.invite_token)}
                />
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
                  status: "In arrivo",
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
                  status: "In arrivo",
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
        </div>
      )}
    </div>
  );
}
