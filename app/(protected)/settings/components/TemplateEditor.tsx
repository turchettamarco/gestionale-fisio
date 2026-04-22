"use client";

// TemplateEditor.tsx
// Editor visuale per template messaggi WhatsApp.
// Invece di chiedere all'utente di scrivere {nome} {data_relativa} {ora} {luogo},
// offriamo bottoni cliccabili che inseriscono automaticamente il placeholder.
// Quando l'utente vede il template, i placeholder appaiono come "chip" colorati.
//
// INPUT: valore raw con {nome} {data} ecc.
// OUTPUT: onChange riceve il valore raw aggiornato.

import React, { useRef, useState, useCallback, useMemo } from "react";

export type PlaceholderDef = {
  key: string;         // es. "nome" (senza graffe)
  label: string;       // es. "Nome paziente"
  icon?: string;       // es. "👤"
  example: string;     // es. "Mario" — usato per l'anteprima
};

export const DEFAULT_PLACEHOLDERS: PlaceholderDef[] = [
  { key: "nome",          label: "Nome paziente",   icon: "👤", example: "Mario" },
  { key: "data_relativa", label: "Data (Oggi/Domani/Mer 5 giu)", icon: "📅", example: "Domani" },
  { key: "data",          label: "Data completa",   icon: "📅", example: "05/06/2026" },
  { key: "ora",           label: "Ora",             icon: "⏰", example: "15:30" },
  { key: "luogo",         label: "Luogo",           icon: "📍", example: "Via Roma 10, Milano" },
  { key: "link_conferma", label: "Link conferma",   icon: "🔗", example: "https://gestionale.app/conferma/abc123" },
];

// Converte il template raw in JSX con chip colorati per i placeholder
function renderPreview(
  template: string,
  placeholders: PlaceholderDef[],
  mode: "chips" | "example"
): React.ReactNode {
  if (!template) return <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(vuoto)</span>;

  // Regex per catturare qualsiasi {...}
  const parts: Array<{ type: "text" | "chip"; content: string; def?: PlaceholderDef }> = [];
  const regex = /\{(\w+)\}/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(template)) !== null) {
    if (m.index > lastIdx) {
      parts.push({ type: "text", content: template.slice(lastIdx, m.index) });
    }
    const key = m[1];
    const def = placeholders.find(p => p.key === key);
    parts.push({ type: "chip", content: key, def });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < template.length) {
    parts.push({ type: "text", content: template.slice(lastIdx) });
  }

  return parts.map((p, i) => {
    if (p.type === "text") {
      return <span key={i}>{p.content}</span>;
    }
    // chip
    if (mode === "example" && p.def) {
      return (
        <span key={i} style={{
          background: "#dcfce7", color: "#166534", padding: "1px 6px", borderRadius: 4,
          fontWeight: 600, fontSize: "0.92em",
        }}>
          {p.def.example}
        </span>
      );
    }
    const label = p.def ? `${p.def.icon || ""} ${p.def.label}` : `{${p.content}}`;
    const bg = p.def ? "#dbeafe" : "#fef3c7";
    const color = p.def ? "#1e40af" : "#92400e";
    return (
      <span key={i} style={{
        display: "inline-block", background: bg, color, padding: "1px 8px", borderRadius: 5,
        fontWeight: 600, fontSize: "0.88em", margin: "0 1px", border: `1px solid ${p.def ? "#bfdbfe" : "#fde68a"}`,
      }}>
        {label}
      </span>
    );
  });
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholders?: PlaceholderDef[];
  rows?: number;
  label?: string;
  helperText?: string;
};

export default function TemplateEditor({
  value,
  onChange,
  placeholders = DEFAULT_PLACEHOLDERS,
  rows = 6,
  label,
  helperText,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [previewMode, setPreviewMode] = useState<"chips" | "example">("chips");

  const insertPlaceholder = useCallback((key: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value + `{${key}}`);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const newValue = value.slice(0, start) + `{${key}}` + value.slice(end);
    onChange(newValue);
    // Ripristina il focus e posiziona il cursore DOPO il placeholder inserito
    setTimeout(() => {
      ta.focus();
      const newPos = start + `{${key}}`.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }, [value, onChange]);

  const previewContent = useMemo(
    () => renderPreview(value, placeholders, previewMode),
    [value, placeholders, previewMode]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {label && (
        <label style={{
          display: "block", fontSize: 12, fontWeight: 600, color: "#334155",
          textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          {label}
        </label>
      )}

      {/* Barra dei bottoni per inserire placeholder */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6,
        padding: 10, borderRadius: 8, background: "#f0f9ff",
        border: "1px solid #bae6fd",
      }}>
        <div style={{ width: "100%", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 4 }}>
          Clicca per inserire nel messaggio:
        </div>
        {placeholders.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => insertPlaceholder(p.key)}
            style={{
              padding: "6px 10px", borderRadius: 6, border: "1px solid #93c5fd",
              background: "#fff", color: "#1e40af", fontSize: 12, fontWeight: 600,
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#dbeafe"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
            title={`Inserisce ${p.label} nel messaggio`}
          >
            {p.icon && <span>{p.icon}</span>}
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {/* Textarea di editing */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 8,
          border: "1.5px solid #cbd5e1", fontSize: 14, outline: "none",
          background: "#fff", color: "#0f172a", resize: "vertical",
          fontFamily: "Inter, -apple-system, sans-serif", lineHeight: 1.5,
          boxSizing: "border-box",
        }}
      />

      {helperText && (
        <div style={{ fontSize: 11, color: "#64748b" }}>{helperText}</div>
      )}

      {/* Area anteprima */}
      <div style={{
        marginTop: 4, padding: 12, borderRadius: 8, background: "#f8fafc",
        border: "1px solid #e2e8f0",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#475569",
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            Anteprima
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              onClick={() => setPreviewMode("chips")}
              style={{
                padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                border: "1px solid",
                borderColor: previewMode === "chips" ? "#2563eb" : "#cbd5e1",
                background: previewMode === "chips" ? "#dbeafe" : "#fff",
                color: previewMode === "chips" ? "#1e40af" : "#64748b",
                cursor: "pointer",
              }}
            >
              Con segnaposto
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("example")}
              style={{
                padding: "4px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                border: "1px solid",
                borderColor: previewMode === "example" ? "#16a34a" : "#cbd5e1",
                background: previewMode === "example" ? "#dcfce7" : "#fff",
                color: previewMode === "example" ? "#166534" : "#64748b",
                cursor: "pointer",
              }}
            >
              Esempio reale
            </button>
          </div>
        </div>
        <div style={{
          fontSize: 13.5, color: "#0f172a", lineHeight: 1.6, whiteSpace: "pre-wrap",
          fontFamily: "Inter, -apple-system, sans-serif",
          minHeight: 40,
        }}>
          {previewContent}
        </div>
      </div>
    </div>
  );
}
