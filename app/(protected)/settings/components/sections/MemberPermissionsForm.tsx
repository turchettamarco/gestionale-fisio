// ═══════════════════════════════════════════════════════════════════════
// MemberPermissionsForm.tsx — Tappa G (mig. 071)
// ═══════════════════════════════════════════════════════════════════════
// Pannello permessi del singolo membro, dentro Impostazioni → Team.
//
//   1. Si sceglie un livello predefinito (Base / Intermedio / Completo
//      paziente / Accesso totale) …
//   2. …oppure "Su misura" e si attivano le singole funzioni una per una.
//
// Selezionando un preset e poi modificando una spunta, si passa
// automaticamente a "Su misura" partendo da quel preset: è il modo più
// naturale di lavorare (parto dal livello medio e tolgo/aggiungo qualcosa).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import {
  PERMISSION_GROUPS,
  PRESET_LABELS,
  presetPermissions,
  resolvePermissions,
  type PermissionKey,
  type PermissionPreset,
} from "@/src/lib/permissions";

const THEME = {
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  text: "#334155",
  muted: "#64748b",
  soft: "#f8fafc",
  accent: "#0f766e",
};

type Props = {
  memberId: string;             // studio_members.id
  memberName: string;
  memberRole: string;
  currentPreset: string | null;
  currentPermissions: unknown;
  onSaved: () => void;
  onClose: () => void;
};

export default function MemberPermissionsForm({
  memberId, memberName, memberRole,
  currentPreset, currentPermissions, onSaved, onClose,
}: Props) {
  const isOwnerLike = memberRole === "owner" || memberRole === "co_owner";

  const initialSet = useMemo(
    () => resolvePermissions({ role: memberRole, permission_preset: currentPreset, permissions: currentPermissions }),
    [memberRole, currentPreset, currentPermissions]
  );

  const [preset, setPreset] = useState<PermissionPreset>(
    (currentPreset as PermissionPreset) ?? (memberRole === "assistant" ? "all" : "base")
  );
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set(initialSet));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { setSelected(new Set(initialSet)); }, [initialSet]);

  const applyPreset = useCallback((p: PermissionPreset) => {
    setPreset(p);
    setMsg("");
    if (p !== "custom") setSelected(new Set(presetPermissions(p)));
  }, []);

  const toggle = useCallback((key: PermissionKey) => {
    setMsg("");
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    // Toccare una spunta significa personalizzare: si passa a "Su misura"
    // mantenendo quanto già selezionato dal preset di partenza.
    setPreset(p => (p === "custom" ? p : "custom"));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setMsg("");
    const payload = preset === "custom"
      ? { permission_preset: "custom", permissions: Array.from(selected) }
      : { permission_preset: preset, permissions: null };
    const { error } = await supabase
      .from("studio_members")
      .update(payload)
      .eq("id", memberId);
    setSaving(false);
    if (error) { setMsg("Errore: " + error.message); return; }
    setMsg("Permessi salvati.");
    onSaved();
  }, [preset, selected, memberId, onSaved]);

  return (
    <div style={{
      marginTop: 10, padding: 16, borderRadius: 10,
      border: `1px solid ${THEME.border}`, background: THEME.soft,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <strong style={{ fontSize: 13, color: THEME.text }}>Permessi di {memberName}</strong>
        <button onClick={onClose} style={btn(false)}>Chiudi</button>
      </div>

      {isOwnerLike ? (
        <div style={{ fontSize: 12, color: THEME.muted, lineHeight: 1.6 }}>
          {memberRole === "owner" ? "Il titolare" : "Il co-titolare"} ha sempre accesso completo
          a tutte le funzioni: non ci sono permessi da configurare.
        </div>
      ) : (
        <>
          {/* ── Livelli predefiniti ───────────────────────────────── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            {(["base", "medium", "patient_full", "all", "custom"] as PermissionPreset[]).map(p => (
              <button key={p} onClick={() => applyPreset(p)} style={btn(preset === p)}>
                {PRESET_LABELS[p].label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 14, lineHeight: 1.5 }}>
            {PRESET_LABELS[preset].description}
          </div>

          {/* ── Funzioni una per una ──────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {PERMISSION_GROUPS.map(g => (
              <div key={g.group}>
                <div style={{ fontSize: 11, fontWeight: 800, color: THEME.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {g.group}
                </div>
                <div style={{ fontSize: 10.5, color: THEME.muted, marginBottom: 6 }}>{g.description}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6 }}>
                  {g.items.map(it => {
                    const on = selected.has(it.key);
                    return (
                      <label key={it.key} style={{
                        display: "flex", alignItems: "flex-start", gap: 7,
                        padding: "7px 9px", borderRadius: 7,
                        border: `1px solid ${on ? THEME.borderStrong : THEME.border}`,
                        background: on ? "#fff" : "transparent",
                        cursor: "pointer",
                      }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(it.key)} style={{ marginTop: 2 }} />
                        <span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: THEME.text }}>{it.label}</span>
                          {it.hint && (
                            <span style={{ display: "block", fontSize: 10, color: THEME.muted, marginTop: 1 }}>{it.hint}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
            <button onClick={save} disabled={saving} style={{
              padding: "8px 16px", borderRadius: 7, border: "none",
              background: THEME.accent, color: "#fff",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              {saving ? "Salvataggio…" : "Salva permessi"}
            </button>
            <span style={{ fontSize: 11, color: THEME.muted }}>
              {selected.size} funzioni attive
            </span>
            {msg && (
              <span style={{ fontSize: 11, fontWeight: 600, color: msg.startsWith("Errore") ? "#b91c1c" : THEME.accent }}>
                {msg}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function btn(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 7,
    border: `1.5px solid ${active ? "#334155" : THEME.borderStrong}`,
    background: active ? "#334155" : "#fff",
    color: active ? "#fff" : THEME.text,
    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  };
}
