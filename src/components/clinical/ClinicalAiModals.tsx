"use client";

// ═══════════════════════════════════════════════════════════════════════
// ClinicalAiModals — Briefing pre-seduta ✚ Lettera al medico
// ═══════════════════════════════════════════════════════════════════════
//
// Due strumenti AI della scheda paziente, costruiti sull'infrastruttura
// esistente (buildPatientContext + /api/ai-clinical):
//
//   • AiBriefingModal — "le consegne": 5-8 righe operative prima che il
//     paziente entri. Si genera all'apertura, si può rigenerare/copiare.
//
//   • AiLetterModal — lettera formale al medico/collega generata dal
//     percorso clinico: destinatario + motivo → bozza → la rivedi in un
//     campo di testo → stampa su carta intestata dello studio.
//
// L'AI propone, il fisioterapista dispone: la lettera non parte mai
// senza passare dai tuoi occhi e dalle tue modifiche.
// ═══════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from "react";
import { buildPatientContext } from "@/src/lib/clinical/buildPatientContext";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { getStudioBranding } from "@/src/lib/studioBranding";
import ReportPrintModal from "@/src/components/mobile/ReportPrintModal";

const T = {
  teal: "#0d9488", blue: "#2563eb", text: "#0f172a", muted: "#64748b",
  border: "#e2e8f0", soft: "#f8fafc", red: "#dc2626",
};

const ALL_SECTIONS = ["patient", "anamnesis", "redflags", "diagnosis", "tests", "plan", "goals", "sessions"] as const;

async function callAi(action: "briefing" | "letter", context: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/ai-clinical", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, context }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Errore AI");
  const out = data?.briefing || data?.letter || data?.result || "";
  if (!out) throw new Error("Risposta vuota");
  return String(out);
}

function shell(children: React.ReactNode, onClose: () => void, maxWidth = 560) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth, background: "#fff", borderRadius: 14,
          boxShadow: "0 20px 60px rgba(15,23,42,0.3)", overflow: "hidden",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Header({ icon, title, sub, onClose }: { icon: string; title: string; sub: string; onClose: () => void }) {
  return (
    <div style={{
      padding: "14px 16px", borderBottom: `1px solid ${T.border}`,
      background: "linear-gradient(135deg, rgba(13,148,136,0.06), rgba(37,99,235,0.06))",
      display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{icon} {title}</div>
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>{sub}</div>
      </div>
      <button onClick={onClose} aria-label="Chiudi" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: T.muted, fontWeight: 700 }}>✕</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Briefing pre-seduta
// ─────────────────────────────────────────────────────────────────────────
export function AiBriefingModal({
  open, onClose, patientId, patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ctx = await buildPatientContext({ patientId, sections: [...ALL_SECTIONS], maxSessions: 6 });
      setText(await callAi("briefing", ctx));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (open) { setText(null); setCopied(false); void generate(); }
  }, [open, generate]);

  if (!open) return null;

  return shell(
    <>
      <Header icon="✨" title="Briefing pre-seduta" sub={patientName ? `Le consegne su ${patientName}, prima che entri` : "Le consegne, prima che entri"} onClose={onClose} />
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {loading && <div style={{ padding: 20, textAlign: "center", color: T.muted, fontSize: 12.5 }}>Preparo le consegne…</div>}
        {error && <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.25)", color: T.red, fontSize: 12.5, fontWeight: 700 }}>{error}</div>}
        {text && (
          <div style={{
            whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.65, color: T.text,
            background: T.soft, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px",
          }}>{text}</div>
        )}
        <div style={{ fontSize: 10.5, color: T.muted, marginTop: 10, lineHeight: 1.5 }}>
          Generato dall&apos;AI a partire dal fascicolo: verifica sempre prima di agire. Non sostituisce il tuo giudizio clinico.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
        <button onClick={() => void generate()} disabled={loading} style={{
          border: `1px solid ${T.border}`, background: "#fff", color: T.text,
          borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit", opacity: loading ? .6 : 1,
        }}>↻ Rigenera</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={async () => { if (text) { await navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1600); } }}
          disabled={!text}
          style={{
            border: "none", background: T.teal, color: "#fff",
            borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", opacity: text ? 1 : .5,
          }}
        >{copied ? "✓ Copiato" : "Copia"}</button>
      </div>
    </>,
    onClose,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Lettera al medico / collega
// ─────────────────────────────────────────────────────────────────────────
const REASONS = [
  "Aggiornamento sul percorso riabilitativo",
  "Richiesta di valutazione specialistica",
  "Relazione di fine trattamento",
  "Altro (specifica nel testo)",
];

export function AiLetterModal({
  open, onClose, patientId, patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}) {
  const { studio } = useCurrentStudio();
  const [dest, setDest] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setText(""); setError(null); }
  }, [open]);

  const generate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ctx = await buildPatientContext({ patientId, sections: [...ALL_SECTIONS], maxSessions: 8 });
      ctx.letter_to = dest.trim() || "Collega";
      ctx.letter_reason = reason;
      setText(await callAi("letter", ctx));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }, [patientId, dest, reason]);

  const print = useCallback(() => {
    if (!text.trim()) return;
    const b = getStudioBranding(studio);
    const oggi = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const paragraphs = text.trim().split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`).join("");
    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 22mm 20mm; }
      body { font-family: Georgia, "Times New Roman", serif; color: #0f172a; font-size: 12pt; line-height: 1.65; }
      .head { border-bottom: 1.5px solid #0d9488; padding-bottom: 10px; margin-bottom: 26px; }
      .studio { font-size: 15pt; font-weight: bold; color: #0f172a; }
      .sub { font-size: 9.5pt; color: #475569; margin-top: 2px; }
      .meta { text-align: right; font-size: 10.5pt; color: #475569; margin-bottom: 22px; }
      .dest { font-weight: bold; margin-bottom: 18px; }
      p { margin: 0 0 12px; text-align: justify; }
      .sign { margin-top: 34px; }
      .sign .name { font-weight: bold; }
      .sign .title { font-size: 10.5pt; color: #475569; }
    </style></head><body>
      <div class="head">
        <div class="studio">${esc(studio?.name || "Studio")}</div>
        <div class="sub">${esc([studio?.address, (studio as { phone?: string } | null)?.phone].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="meta">${esc(oggi)}</div>
      ${dest.trim() ? `<div class="dest">${esc("Alla c.a. " + dest.trim())}</div>` : ""}
      ${paragraphs}
      <div class="sign">
        <div class="name">${esc(b.signatureName || studio?.name || "")}</div>
        ${b.signatureTitle ? `<div class="title">${esc(b.signatureTitle)}</div>` : ""}
      </div>
    </body></html>`;
    setPrintHtml(html);
  }, [text, dest, studio]);

  if (!open) return null;

  const inputS: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "9px 11px",
    border: `1px solid ${T.border}`, borderRadius: 9,
    fontSize: 13, fontWeight: 600, color: T.text, fontFamily: "inherit",
  };

  return (
    <>
      {shell(
        <>
          <Header icon="🖋" title="Lettera al medico" sub={patientName ? `Relazione sul percorso di ${patientName}` : "Relazione sul percorso clinico"} onClose={onClose} />
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ flex: "1 1 220px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: T.muted, marginBottom: 4 }}>DESTINATARIO</div>
                <input value={dest} onChange={e => setDest(e.target.value)}
                  placeholder="Dott. Rossi — Medico curante" style={inputS} />
              </div>
              <div style={{ flex: "1 1 220px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: T.muted, marginBottom: 4 }}>MOTIVO</div>
                <select value={reason} onChange={e => setReason(e.target.value)} style={{ ...inputS, appearance: "none", WebkitAppearance: "none" }}>
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {error && <div style={{ padding: "10px 12px", marginBottom: 8, borderRadius: 10, background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.25)", color: T.red, fontSize: 12.5, fontWeight: 700 }}>{error}</div>}

            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={loading ? "Scrivo la bozza dal fascicolo…" : "Genera la bozza, poi correggila qui prima di stamparla."}
              style={{
                ...inputS, minHeight: 240, resize: "vertical", lineHeight: 1.6,
                fontWeight: 500, background: loading ? T.soft : "#fff",
              }}
            />
            <div style={{ fontSize: 10.5, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
              La bozza nasce dal fascicolo clinico: rileggila e correggila — la firma è la tua.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
            <button onClick={() => void generate()} disabled={loading} style={{
              border: `1px solid ${T.border}`, background: "#fff", color: T.text,
              borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", opacity: loading ? .6 : 1,
            }}>{loading ? "Genero…" : text ? "↻ Rigenera" : "✨ Genera bozza"}</button>
            <div style={{ flex: 1 }} />
            <button onClick={print} disabled={!text.trim()} style={{
              border: "none", background: T.teal, color: "#fff",
              borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", opacity: text.trim() ? 1 : .5,
            }}>🖨 Stampa / PDF</button>
          </div>
        </>,
        onClose,
        640,
      )}
      {printHtml && <ReportPrintModal html={printHtml} title="Lettera" onClose={() => setPrintHtml(null)} />}
    </>
  );
}
