"use client";

// ═══════════════════════════════════════════════════════════════════════
// ConvenzioneFields — ente + autorizzazione sull'appuntamento
// ═══════════════════════════════════════════════════════════════════════
//
// Blocco riusabile per le modali di creazione/modifica appuntamento.
// Si mostra SOLO se il modulo convenzioni è acceso e c'è almeno un ente:
// chi lavora in privato non vede nulla di tutto questo.
//
// Perché il numero di autorizzazione: in assistenza diretta la rete emette
// un voucher prima della seduta e senza quel codice la pratica può essere
// respinta. La scadenza è un promemoria: le autorizzazioni hanno una
// finestra di validità e un ciclo lungo rischia di sforarla.
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";

export type ConvenzioneValue = {
  enteId: string;          // "" = nessuna convenzione (privato)
  authCode: string;
  authExpires: string;     // "YYYY-MM-DD" o ""
};

export const EMPTY_CONVENZIONE: ConvenzioneValue = { enteId: "", authCode: "", authExpires: "" };

/** Colonne pronte per insert/update su appointments. */
export function convenzioneToColumns(v: ConvenzioneValue) {
  return {
    convenzione_ente_id: v.enteId || null,
    convenzione_auth_code: v.enteId ? (v.authCode.trim() || null) : null,
    convenzione_auth_expires: v.enteId ? (v.authExpires || null) : null,
  };
}

/** Giorni alla scadenza dell'autorizzazione (null se non impostata). */
export function authDaysLeft(expires: string | null | undefined): number | null {
  if (!expires) return null;
  const d = new Date(expires + "T23:59:59");
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export default function ConvenzioneFields({
  value, onChange, inputStyle, labelStyle, compact = false,
}: {
  value: ConvenzioneValue;
  onChange: (v: ConvenzioneValue) => void;
  inputStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
  compact?: boolean;
}) {
  const { studio } = useCurrentStudio();
  const [enti, setEnti] = useState<{ id: string; name: string; network_name: string | null }[]>([]);

  useEffect(() => {
    if (studio?.convenzioni_enabled !== true || !studio?.id) { setEnti([]); return; }
    let dead = false;
    (async () => {
      const { data } = await supabase.from("convenzioni_enti")
        .select("id, name, network_name")
        .eq("studio_id", studio.id)
        .eq("is_active", true)
        .order("name");
      if (!dead) setEnti((data as { id: string; name: string; network_name: string | null }[]) || []);
    })();
    return () => { dead = true; };
  }, [studio?.id, studio?.convenzioni_enabled]);

  if (studio?.convenzioni_enabled !== true || enti.length === 0) return null;

  const inS: React.CSSProperties = inputStyle ?? {
    width: "100%", boxSizing: "border-box", padding: "9px 11px",
    border: "1px solid #cbd5e1", borderRadius: 9,
    fontSize: 13, fontWeight: 600, color: "#0f172a", fontFamily: "inherit", background: "#fff",
  };
  const lbS: React.CSSProperties = labelStyle ?? {
    fontSize: 10.5, fontWeight: 800, color: "#64748b", marginBottom: 4,
    textTransform: "uppercase", letterSpacing: 0.4,
  };

  const days = authDaysLeft(value.authExpires);
  const ente = enti.find(e => e.id === value.enteId);

  return (
    <div style={{ marginTop: compact ? 8 : 10 }}>
      <div style={lbS}>Convenzione</div>
      <select
        value={value.enteId}
        onChange={e => onChange({ ...value, enteId: e.target.value })}
        style={{ ...inS, appearance: "none", WebkitAppearance: "none" }}
      >
        <option value="">Nessuna — privato</option>
        {enti.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>

      {value.enteId && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px" }}>
              <div style={lbS}>N° autorizzazione</div>
              <input
                value={value.authCode}
                onChange={e => onChange({ ...value, authCode: e.target.value })}
                placeholder="es. 123456789"
                style={inS}
              />
            </div>
            <div style={{ flex: "1 1 130px" }}>
              <div style={lbS}>Valida fino al</div>
              <input
                type="date"
                value={value.authExpires}
                onChange={e => onChange({ ...value, authExpires: e.target.value })}
                style={inS}
              />
            </div>
          </div>

          {days !== null && days <= 7 && (
            <div style={{
              marginTop: 7, padding: "6px 10px", borderRadius: 8,
              background: days < 0 ? "rgba(220,38,38,0.07)" : "#fffbeb",
              border: `1px solid ${days < 0 ? "rgba(220,38,38,0.3)" : "#fcd34d"}`,
              fontSize: 11.5, fontWeight: 700, color: days < 0 ? "#dc2626" : "#92400e",
            }}>
              {days < 0
                ? "⚠ Autorizzazione scaduta: rischi che la pratica venga respinta."
                : `⚠ L'autorizzazione scade fra ${days} giorn${days === 1 ? "o" : "i"}.`}
            </div>
          )}

          {!value.authCode.trim() && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
              Senza numero di autorizzazione {ente?.network_name || "la rete"} può respingere la pratica.
            </div>
          )}
        </>
      )}
    </div>
  );
}
