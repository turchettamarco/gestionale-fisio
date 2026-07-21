"use client";

// ─── TimeSelect ──────────────────────────────────────────────────────────────
// Selettore orario UNICO per le modali di creazione/modifica appuntamenti.
// Un solo tap: si apre la rotella nativa (su iPhone) già posizionata
// sull'orario corrente, con le sole opzioni valide — a passi di 15 o 30
// minuti secondo l'impostazione dell'agenda.
//
// Perché una <select> e non <input type="time">: Safari iOS ignora `step`
// e mostrerebbe tutti i 60 minuti. Le opzioni di una select invece vengono
// rispettate ovunque.
//
// Fascia proposta: 07:00 → 22:00. Se il valore corrente è fuori fascia o
// fuori passo (appuntamenti creati prima, es. 09:20), viene incluso comunque
// così aprendo la modale il dato non cambia da solo.

import React, { useMemo } from "react";

const pad2 = (n: number) => String(n).padStart(2, "0");
const H_FROM = 7;
const H_TO = 22;

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
  const current = useMemo(() => {
    const [h, m] = (value || "09:00").split(":").map(x => parseInt(x, 10) || 0);
    return `${pad2(Math.min(23, Math.max(0, h)))}:${pad2(Math.min(59, Math.max(0, m)))}`;
  }, [value]);

  const options = useMemo(() => {
    const step = slotMin === 15 ? 15 : 30;
    const out: string[] = [];
    for (let t = H_FROM * 60; t <= H_TO * 60; t += step) {
      out.push(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`);
    }
    if (!out.includes(current)) {
      out.push(current);
      out.sort();
    }
    return out;
  }, [slotMin, current]);

  return (
    <select
      value={current}
      onChange={e => onChange(e.target.value)}
      aria-label="Orario"
      style={{
        ...inputStyle,
        WebkitAppearance: "none",
        appearance: "none",
        textAlign: "center",
        textAlignLast: "center",
      }}
    >
      {options.map(t => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}
