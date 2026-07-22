// app/(protected)/settings/components/SettingsSearch.tsx
// ═══════════════════════════════════════════════════════════════════════
// Ricerca tra le impostazioni. Digiti "orari", "15 minuti", "P.IVA",
// "whatsapp" — e salti dritto alla sezione giusta, nella tab giusta, già
// aperta. Perché nessuno ricorda in quale tab vive una impostazione, e
// non dovrebbe servire ricordarlo.
//
// L'indice è statico e dichiarato dal client (id, label, tab, keywords):
// niente magia, si estende aggiungendo una riga.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useMemo, useRef, useState } from "react";
import { THEME } from "./shared/theme";

export type SettingsSearchItem = {
  id: string;
  label: string;
  /** Dove vive (mostrato come contesto nel risultato). */
  place: string;
  keywords: string;
};

export default function SettingsSearch({
  items, onJump, placeholder = "Cerca nelle impostazioni… (es. orari, 15 minuti, P.IVA)",
}: {
  items: SettingsSearchItem[];
  onJump: (id: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return items
      .filter(it =>
        it.label.toLowerCase().includes(t) ||
        it.keywords.toLowerCase().includes(t) ||
        it.place.toLowerCase().includes(t))
      .slice(0, 8);
  }, [q, items]);

  const jump = (id: string) => {
    setQ(""); setOpen(false); setHi(0);
    onJump(id);
  };

  return (
    <div ref={boxRef} style={{ position: "relative", marginBottom: 14 }}>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: THEME.muted, pointerEvents: "none", display: "flex",
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (!results.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, results.length - 1)); }
            if (e.key === "ArrowUp")   { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
            if (e.key === "Enter")     { e.preventDefault(); jump(results[hi].id); }
            if (e.key === "Escape")    { setOpen(false); }
          }}
          placeholder={placeholder}
          style={{
            width: "100%", boxSizing: "border-box", padding: "11px 13px 11px 36px",
            border: `1.5px solid ${THEME.border}`, borderRadius: 11,
            fontSize: 13.5, fontWeight: 600, color: THEME.text,
            fontFamily: "inherit", background: "#fff", outline: "none",
          }}
        />
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, zIndex: 60,
          background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 12,
          boxShadow: "0 14px 40px rgba(15,23,42,0.14)", overflow: "hidden",
        }}>
          {results.map((r, i) => (
            <button
              key={r.id}
              onMouseDown={e => { e.preventDefault(); jump(r.id); }}
              onMouseEnter={() => setHi(i)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 13px", border: "none", textAlign: "left",
                background: i === hi ? "rgba(13,148,136,0.07)" : "transparent",
                cursor: "pointer", fontFamily: "inherit",
                borderBottom: i < results.length - 1 ? "1px solid #eef2f7" : "none",
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: THEME.text }}>{r.label}</span>
                <span style={{ display: "block", fontSize: 10.5, color: THEME.muted, marginTop: 1 }}>{r.place}</span>
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: THEME.teal }}>vai ›</span>
            </button>
          ))}
        </div>
      )}

      {open && q.trim().length >= 2 && results.length === 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, zIndex: 60,
          background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 12,
          boxShadow: "0 14px 40px rgba(15,23,42,0.14)", padding: "12px 14px",
          fontSize: 12.5, color: THEME.muted,
        }}>
          Nessuna impostazione trovata per «{q.trim()}».
        </div>
      )}
    </div>
  );
}
