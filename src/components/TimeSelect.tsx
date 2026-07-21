"use client";

// ─── TimeSelect ──────────────────────────────────────────────────────────────
// Sostituisce <input type="time"> nelle modali di creazione/modifica
// appuntamenti su mobile. Motivazione: Safari iOS IGNORA l'attributo `step`
// e mostra sempre tutti i 60 minuti nella rotella. Due <select> nativi invece
// aprono il picker iOS con SOLO le opzioni che gli diamo: ore piene e minuti
// alle frazioni consentite (00/15/30/45 con agenda a 15', 00/30 a 30').
//
// Se il valore corrente ha minuti fuori griglia (appuntamenti creati prima,
// es. 09:20), quell'opzione viene inclusa per non alterare il dato aprendolo.

import React from "react";

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function TimeSelect({
  value,
  onChange,
  slotMin = 30,
  inputStyle,
}: {
  value: string;                    // "HH:MM"
  onChange: (v: string) => void;
  slotMin?: number;                 // 15 | 30
  inputStyle?: React.CSSProperties; // stile dell'input che sostituisce
}) {
  const [hRaw, mRaw] = (value || "09:00").split(":");
  const h = Math.min(23, Math.max(0, parseInt(hRaw, 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(mRaw, 10) || 0));

  const base = slotMin === 15 ? [0, 15, 30, 45] : [0, 30];
  const minOpts = base.includes(m) ? base : [...base, m].sort((a, b) => a - b);

  const sel: React.CSSProperties = {
    ...inputStyle,
    WebkitAppearance: "none",
    appearance: "none",
    textAlign: "center",
    textAlignLast: "center",
    paddingLeft: 6,
    paddingRight: 6,
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
      <select
        value={pad2(h)}
        onChange={e => onChange(`${e.target.value}:${pad2(m)}`)}
        style={{ ...sel, flex: 1 }}
        aria-label="Ora"
      >
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={pad2(i)}>{pad2(i)}</option>
        ))}
      </select>
      <span style={{ alignSelf: "center", fontWeight: 700, color: "#475569" }}>:</span>
      <select
        value={pad2(m)}
        onChange={e => onChange(`${pad2(h)}:${e.target.value}`)}
        style={{ ...sel, flex: 1 }}
        aria-label="Minuti"
      >
        {minOpts.map(v => (
          <option key={v} value={pad2(v)}>{pad2(v)}</option>
        ))}
      </select>
    </div>
  );
}
