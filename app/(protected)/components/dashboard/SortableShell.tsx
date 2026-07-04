"use client";
// app/(protected)/components/dashboard/SortableShell.tsx
// ═══════════════════════════════════════════════════════════════════════
// 🧩 Guscio dei widget personalizzabili: manopolina ⠿ per trascinare
// (drag & drop nativo) e occhio per nascondere. Il layout lo salva
// la home in localStorage.
// ═══════════════════════════════════════════════════════════════════════

import type React from "react";

export default function SortableShell({
  label, hidden, onToggleHidden, draggable = false,
  onDragStart, onDragOver, onDrop, children,
}: {
  label: string;
  hidden: boolean;
  onToggleHidden: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div onDragOver={onDragOver} onDrop={onDrop}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 6px 4px" }}>
        {draggable && (
          <span
            draggable
            onDragStart={onDragStart}
            title="Trascina per riordinare"
            style={{ cursor: "grab", color: "var(--fh-faint)", fontSize: 13, userSelect: "none", lineHeight: 1 }}
          >⠿</span>
        )}
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--fh-faint)" }}>{label}</span>
        <button
          onClick={onToggleHidden}
          title={hidden ? "Mostra widget" : "Nascondi widget"}
          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--fh-faint)", fontSize: 12, padding: "0 2px", fontFamily: "inherit" }}
        >{hidden ? "🙈 mostra" : "👁"}</button>
      </div>
      {!hidden && children}
      {hidden && (
        <div style={{ border: "1.5px dashed var(--fh-border)", borderRadius: 12, padding: "8px 12px", fontSize: 11, color: "var(--fh-faint)", textAlign: "center" }}>
          {label} nascosto
        </div>
      )}
    </div>
  );
}
