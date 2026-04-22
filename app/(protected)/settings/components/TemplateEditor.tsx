"use client";

// TemplateEditor.tsx — versione 2 con:
// 1. Firma automatica: se la firma dello studio non è presente nel template,
//    viene aggiunta automaticamente in fondo al caricamento.
// 2. Galleria template pre-costruiti: bottone "📚 Galleria" apre una modale
//    con template di esempio che l'utente può selezionare.
// 3. Generazione AI: bottone "✨ AI" chiede all'utente una descrizione e
//    l'AI genera un template su misura (mostrato come suggerimento).

import React, { useRef, useState, useCallback, useMemo, useEffect } from "react";

export type PlaceholderDef = {
  key: string;
  label: string;
  icon?: string;
  example: string;
};

export const DEFAULT_PLACEHOLDERS: PlaceholderDef[] = [
  { key: "nome",          label: "Nome paziente",   icon: "👤", example: "Mario" },
  { key: "data_relativa", label: "Data (Oggi/Domani/Mer 5 giu)", icon: "📅", example: "Domani" },
  { key: "data",          label: "Data completa",   icon: "📅", example: "05/06/2026" },
  { key: "ora",           label: "Ora",             icon: "⏰", example: "15:30" },
  { key: "luogo",         label: "Luogo",           icon: "📍", example: "Via Roma 10, Milano" },
  { key: "link_conferma", label: "Link conferma",   icon: "🔗", example: "https://gestionale.app/conferma/abc123" },
];

// ─── Galleria template di esempio ──────────────────────────────────────────
// Ogni galleria è associata a un "tipo" (key), così mostriamo solo quelli pertinenti.
// {firma} verrà sostituito con la firma dinamica dell'utente.
export type GalleryItem = {
  label: string;
  template: string;
};

export const TEMPLATE_GALLERY: Record<string, GalleryItem[]> = {
  // Template per promemoria appuntamento/conferma
  reminder: [
    {
      label: "Promemoria standard",
      template: "Buongiorno {nome},\n\nLe ricordiamo il suo appuntamento di {data_relativa} alle ore {ora}.\n\n📍 {luogo}\n\nCordiali saluti,\n{firma}",
    },
    {
      label: "Promemoria amichevole",
      template: "Ciao {nome}! 👋\n\nLe ricordo il nostro appuntamento di {data_relativa} alle {ora}.\n📍 {luogo}\n\nA presto!\n{firma}",
    },
    {
      label: "Conferma con richiesta risposta",
      template: "Gentile {nome},\n\nl'appuntamento è confermato per {data_relativa} alle ore {ora}.\n📍 {luogo}\n\nLe chiediamo cortesemente una conferma di lettura.\n\nGrazie,\n{firma}",
    },
  ],
  // Welcome (nuovo paziente)
  welcome: [
    {
      label: "Benvenuto cordiale",
      template: "Benvenuto/a {nome}!\n\nSiamo lieti di averla come nuovo paziente. Per qualsiasi informazione siamo a sua disposizione.\n\nA presto,\n{firma}",
    },
    {
      label: "Benvenuto professionale",
      template: "Gentile {nome},\n\nla ringraziamo per aver scelto il nostro studio. Siamo a sua completa disposizione per qualsiasi esigenza.\n\nCordiali saluti,\n{firma}",
    },
  ],
  // Booking confirmation (dopo prenotazione web)
  booking: [
    {
      label: "Conferma breve",
      template: "Gentile {nome},\n\nla sua prenotazione per il {data} alle {ora} è confermata.\n\nA presto,\n{firma}",
    },
    {
      label: "Conferma dettagliata",
      template: "Gentile {nome},\n\nabbiamo ricevuto la sua prenotazione:\n📅 {data}\n🕐 {ora}\n\nSaremo lieti di riceverla.\nCordiali saluti,\n{firma}",
    },
  ],
  // Payment reminder
  payment: [
    {
      label: "Sollecito gentile",
      template: "Gentile {nome},\n\nle ricordiamo un saldo aperto di €{importo} per le sedute effettuate.\n\nPer qualsiasi informazione non esiti a contattarci.\n\nCordiali saluti,\n{firma}",
    },
    {
      label: "Sollecito breve",
      template: "Gentile {nome},\nsaldo aperto: €{importo}.\nGrazie per la collaborazione.\n{firma}",
    },
  ],
  // Birthday
  birthday: [
    {
      label: "Auguri classici",
      template: "Tanti auguri di buon compleanno {nome}! 🎉\n\nLe auguriamo una splendida giornata.\n\nCordiali saluti,\n{firma}",
    },
    {
      label: "Auguri con staff",
      template: "Buon compleanno {nome}! 🎂\n\nTutto lo staff le augura una giornata serena e piena di gioia.\n\n{firma}",
    },
  ],
  // Satisfaction survey
  satisfaction: [
    {
      label: "Questionario standard",
      template: "Gentile {nome},\n\nil suo ciclo di trattamento è terminato. Le saremmo grati se volesse dedicare 2 minuti per rispondere a 3 brevi domande:\n\n🔗 {link}\n\nGrazie di cuore,\n{firma}",
    },
  ],
};

// ─── Helper: applica la firma automatica ──────────────────────────────────
// Se il template non contiene {firma}, la aggiunge in fondo
export function applySignature(template: string, signature: string): string {
  if (!template) return template;
  // Se il template già contiene {firma}, lo sostituiamo
  if (template.includes("{firma}")) {
    return template.replace(/\{firma\}/g, signature || "");
  }
  // Altrimenti, se c'è una firma disponibile, la aggiungiamo in fondo
  // (solo se il template non già termina con righe simili alla firma, per evitare duplicati)
  if (!signature) return template;
  const sigFirstLine = signature.split("\n")[0].trim();
  if (sigFirstLine && template.includes(sigFirstLine)) return template;  // firma già presente
  return template.trimEnd() + "\n\n" + signature;
}

// Converte il template raw in JSX con chip colorati per i placeholder
function renderPreview(
  template: string,
  placeholders: PlaceholderDef[],
  mode: "chips" | "example"
): React.ReactNode {
  if (!template) return <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(vuoto)</span>;

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
  // ─── Nuove props v2 ───
  signature?: string;            // firma dinamica (es. "Dr. Mario Rossi\nFisioterapia")
  autoAppendSignature?: boolean; // default true; aggiunge automaticamente la firma
  galleryKey?: keyof typeof TEMPLATE_GALLERY; // quale galleria mostrare
  messageKind?: string;          // descrizione del tipo di messaggio (per AI)
};

export default function TemplateEditor({
  value,
  onChange,
  placeholders = DEFAULT_PLACEHOLDERS,
  rows = 6,
  label,
  helperText,
  signature,
  autoAppendSignature = true,
  galleryKey,
  messageKind,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [previewMode, setPreviewMode] = useState<"chips" | "example">("chips");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [aiError, setAiError] = useState("");

  // Firma automatica: se il template è vuoto e abbiamo una firma, aggiungila
  // oppure se il template non contiene {firma} né la firma dinamica, aggiungi
  useEffect(() => {
    if (!autoAppendSignature || !signature) return;
    if (!value || value.trim() === "") return;
    const sigFirstLine = signature.split("\n")[0].trim();
    if (!sigFirstLine) return;
    // Se il template non contiene la firma (né in forma letterale né come {firma}),
    // aggiungila automaticamente in fondo (una sola volta)
    if (!value.includes(sigFirstLine) && !value.includes("{firma}")) {
      const withSig = value.trimEnd() + "\n\n" + signature;
      onChange(withSig);
    }
    // deliberatamente solo al primo mount: non vogliamo aggiungere la firma
    // ogni volta che l'utente modifica il testo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setTimeout(() => {
      ta.focus();
      const newPos = start + `{${key}}`.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }, [value, onChange]);

  // Applica un template dalla galleria (sostituisce il contenuto)
  const applyGalleryItem = useCallback((template: string) => {
    const withSig = (signature || "").trim()
      ? template.replace(/\{firma\}/g, signature!)
      : template.replace(/\{firma\}/g, "");
    onChange(withSig);
    setGalleryOpen(false);
  }, [onChange, signature]);

  // Chiamata AI per suggerire un template
  const askAI = useCallback(async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiSuggestion("");
    try {
      const r = await fetch("/api/ai-generate-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          messageKind: messageKind || "generico",
          availablePlaceholders: placeholders.map(p => p.key),
          signature: signature || "",
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setAiError(j.error || "Errore durante la generazione");
        return;
      }
      setAiSuggestion(j.template || "");
    } catch (e: any) {
      setAiError(e?.message || "Errore di rete");
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, placeholders, signature, messageKind]);

  const acceptAiSuggestion = useCallback(() => {
    if (aiSuggestion) {
      onChange(aiSuggestion);
      setAiOpen(false);
      setAiPrompt("");
      setAiSuggestion("");
    }
  }, [aiSuggestion, onChange]);

  const previewContent = useMemo(
    () => renderPreview(value, placeholders, previewMode),
    [value, placeholders, previewMode]
  );

  const galleryItems = galleryKey ? (TEMPLATE_GALLERY[galleryKey] || []) : [];

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

      {/* Barra bottoni azione rapida: galleria + AI */}
      {(galleryItems.length > 0 || true) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {galleryItems.length > 0 && (
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              style={{
                padding: "6px 12px", borderRadius: 6, border: "1.5px solid #a78bfa",
                background: "#faf5ff", color: "#6b21a8", fontSize: 12, fontWeight: 700,
                cursor: "pointer",
              }}
            >
              📚 Scegli da galleria
            </button>
          )}
          <button
            type="button"
            onClick={() => { setAiOpen(true); setAiSuggestion(""); setAiError(""); }}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "1.5px solid #fbbf24",
              background: "linear-gradient(135deg,#fef3c7,#fde68a)", color: "#92400e",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            ✨ Genera con AI
          </button>
        </div>
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

      {/* Textarea */}
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

      {/* Firma info */}
      {autoAppendSignature && signature && (
        <div style={{
          fontSize: 11, color: "#0d9488", fontWeight: 600,
          padding: "6px 10px", background: "rgba(13,148,136,0.06)",
          borderRadius: 6, border: "1px solid rgba(13,148,136,0.2)",
        }}>
          ✓ La tua firma è inserita automaticamente — modifica dalla sezione "Il tuo Studio" se vuoi cambiarla
        </div>
      )}

      {helperText && (
        <div style={{ fontSize: 11, color: "#64748b" }}>{helperText}</div>
      )}

      {/* Anteprima */}
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

      {/* Modale galleria */}
      {galleryOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
          zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }} onClick={() => setGalleryOpen(false)}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 24, maxWidth: 600, width: "100%",
            maxHeight: "85vh", overflowY: "auto",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                📚 Galleria template
              </h3>
              <button
                type="button"
                onClick={() => setGalleryOpen(false)}
                style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: "#64748b" }}
              >×</button>
            </div>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              Clicca un template per usarlo. La tua firma verrà inserita automaticamente.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {galleryItems.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyGalleryItem(item.template)}
                  style={{
                    padding: 14, borderRadius: 10, border: "1.5px solid #e2e8f0",
                    background: "#fff", textAlign: "left", cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#a78bfa"; e.currentTarget.style.background = "#faf5ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#fff"; }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#6b21a8", marginBottom: 6 }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: 12, color: "#334155", lineHeight: 1.5,
                    whiteSpace: "pre-wrap", fontFamily: "Inter, -apple-system, sans-serif",
                    maxHeight: 100, overflow: "hidden",
                  }}>
                    {item.template.replace(/\{firma\}/g, signature || "[firma]")}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modale AI */}
      {aiOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
          zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }} onClick={() => setAiOpen(false)}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 24, maxWidth: 560, width: "100%",
            maxHeight: "85vh", overflowY: "auto",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                ✨ Genera con AI
              </h3>
              <button
                type="button"
                onClick={() => setAiOpen(false)}
                style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: "#64748b" }}
              >×</button>
            </div>

            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              Descrivi che tipo di messaggio vuoi. L'AI genererà un template con segnaposti e la tua firma.
            </p>

            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              rows={3}
              placeholder="Es. 'Un messaggio caloroso di auguri per Natale da inviare ai miei pazienti'"
              style={{
                width: "100%", padding: 10, borderRadius: 8, border: "1.5px solid #cbd5e1",
                fontSize: 14, outline: "none", resize: "vertical",
                fontFamily: "Inter, -apple-system, sans-serif", boxSizing: "border-box",
                marginBottom: 12,
              }}
            />

            <button
              type="button"
              onClick={askAI}
              disabled={aiLoading || !aiPrompt.trim()}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 8, border: "none",
                background: aiLoading || !aiPrompt.trim() ? "#cbd5e1" : "linear-gradient(135deg,#f59e0b,#d97706)",
                color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: aiLoading || !aiPrompt.trim() ? "not-allowed" : "pointer",
                marginBottom: 12,
              }}
            >
              {aiLoading ? "Generazione in corso…" : "✨ Genera suggerimento"}
            </button>

            {aiError && (
              <div style={{
                padding: 10, borderRadius: 6, background: "rgba(220,38,38,0.08)",
                border: "1px solid rgba(220,38,38,0.2)", color: "#dc2626",
                fontSize: 13, marginBottom: 12,
              }}>
                {aiError}
              </div>
            )}

            {aiSuggestion && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Suggerimento AI
                </div>
                <div style={{
                  padding: 12, borderRadius: 8, background: "#f0fdf4",
                  border: "1.5px solid #86efac", fontSize: 13, color: "#0f172a",
                  lineHeight: 1.6, whiteSpace: "pre-wrap",
                  fontFamily: "Inter, -apple-system, sans-serif",
                  marginBottom: 12,
                }}>
                  {aiSuggestion}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={acceptAiSuggestion}
                    style={{
                      flex: 1, padding: "10px 14px", borderRadius: 8, border: "none",
                      background: "#16a34a", color: "#fff", fontSize: 14, fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ✓ Usa questo testo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAiSuggestion(""); setAiPrompt(""); }}
                    style={{
                      padding: "10px 14px", borderRadius: 8, border: "1.5px solid #cbd5e1",
                      background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Riprova
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
