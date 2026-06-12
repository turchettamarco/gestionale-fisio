"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════════
// app/scale/[token]/page.tsx — Compilazione scala pubblica (paziente)
// ═══════════════════════════════════════════════════════════════════════
// Il paziente apre il link WhatsApp, risponde con gli slider (una domanda
// alla volta su mobile, con barra di avanzamento) e invia. Il punteggio
// viene calcolato server-side e atterra nella scheda del paziente.
// ═══════════════════════════════════════════════════════════════════════

const T = {
  appBg: "#f1f5f9", panelBg: "#ffffff", text: "#0f172a", muted: "#475569",
  faint: "#64748b", border: "#cbd5e1", blue: "#2563eb", green: "#16a34a",
  red: "#dc2626", teal: "#0d9488", gradient: "linear-gradient(135deg,#0d9488,#2563eb)",
};

type Q = { label: string; max: number; minLabel: string | null; maxLabel: string | null };

type ApiData = {
  status: "pending" | "completed";
  scale: { id: string; name: string; full: string; area: string; icon: string; questions: Q[] };
  studio: { name?: string | null; signature_name?: string | null; signature_title?: string | null } | null;
};

export default function ScalaPubblicaPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [data, setData] = useState<ApiData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [idx, setIdx] = useState(0);          // domanda corrente
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/scales?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok) { setLoadError(json?.error ?? "Errore caricamento"); return; }
        setData(json as ApiData);
        setAnswers(new Array((json as ApiData).scale.questions.length).fill(null));
      } catch {
        setLoadError("Errore di rete. Riprova.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const qs = data?.scale.questions ?? [];
  const total = qs.length;
  const answered = answers.filter(a => a !== null).length;
  const allAnswered = total > 0 && answered === total;
  const isLast = idx === total - 1;

  function setAnswer(v: number) {
    setAnswers(prev => prev.map((a, i) => (i === idx ? v : a)));
  }

  async function submit() {
    if (!allAnswered) { setSubmitError("Rispondi a tutte le domande."); return; }
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/scales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answers: answers as number[], note: note || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setSubmitError(json?.error ?? "Errore invio."); return; }
      setDone(true);
    } catch {
      setSubmitError("Errore di rete. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  const studioHeader = data?.studio
    ? [data.studio.signature_name, data.studio.signature_title]
        .filter(Boolean).join(" · ") || data.studio.name || ""
    : "";

  const q = qs[idx];
  const cur = answers[idx];

  return (
    <div style={{ minHeight: "100vh", background: T.appBg,
      fontFamily: "Inter,-apple-system,'Segoe UI',sans-serif",
      display: "flex", justifyContent: "center", padding: "24px 14px" }}>
      <div style={{ width: "100%", maxWidth: 560 }}>

        {loading && (
          <div style={{ textAlign: "center", padding: 48, color: T.faint, fontSize: 14 }}>
            Caricamento…
          </div>
        )}

        {!loading && loadError && (
          <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
            borderRadius: 16, padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{loadError}</div>
            <div style={{ fontSize: 13, color: T.faint, marginTop: 6 }}>
              Contatta lo studio per ricevere un nuovo link.
            </div>
          </div>
        )}

        {!loading && data && (
          <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
            borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(15,23,42,0.07)" }}>

            {/* Header */}
            <div style={{ background: T.gradient, padding: "18px 22px" }}>
              {studioHeader && (
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  {studioHeader}
                </div>
              )}
              <div style={{ fontWeight: 800, fontSize: 17, color: "#fff" }}>
                {data.scale.icon} {data.scale.full}
              </div>
            </div>

            {/* Già compilato / fatto */}
            {(data.status === "completed" || done) && (
              <div style={{ padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: T.green }}>
                  {done ? "Risposte inviate, grazie!" : "Questionario già compilato"}
                </div>
                <div style={{ fontSize: 13, color: T.faint, marginTop: 6 }}>
                  {done
                    ? "Il tuo fisioterapista vedrà i risultati nella tua scheda."
                    : "Se devi ricompilarlo, chiedi un nuovo link allo studio."}
                </div>
              </div>
            )}

            {/* Compilazione */}
            {data.status === "pending" && !done && q && (
              <div style={{ padding: "20px 22px" }}>

                {/* Avanzamento */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1, height: 7, borderRadius: 99, background: "#e2e8f0",
                    overflow: "hidden" }}>
                    <div style={{ width: `${(answered / total) * 100}%`, height: "100%",
                      background: T.gradient, borderRadius: 99, transition: "width 0.25s" }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.teal, whiteSpace: "nowrap" }}>
                    {idx + 1} / {total}
                  </div>
                </div>

                {/* Domanda */}
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.5,
                  minHeight: 48, marginBottom: 18 }}>
                  {q.label}
                </div>

                {/* Valore selezionato */}
                <div style={{ textAlign: "center", marginBottom: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 54, height: 54, borderRadius: 16, fontSize: 24, fontWeight: 800,
                    background: cur === null ? "#f1f5f9" : "rgba(13,148,136,0.1)",
                    border: `2px solid ${cur === null ? T.border : T.teal}`,
                    color: cur === null ? T.faint : T.teal, padding: "0 12px" }}>
                    {cur === null ? "–" : cur}
                  </span>
                </div>

                {/* Slider */}
                <input type="range" min={0} max={q.max} step={1}
                  value={cur ?? Math.floor(q.max / 2)}
                  onChange={e => setAnswer(parseInt(e.target.value))}
                  onPointerDown={() => { if (cur === null) setAnswer(Math.floor(q.max / 2)); }}
                  style={{ width: "100%", accentColor: T.teal, height: 34, cursor: "pointer" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2,
                  fontSize: 10.5, color: T.faint, fontWeight: 600, gap: 12 }}>
                  <span style={{ maxWidth: "45%" }}>0 — {q.minLabel ?? "Minimo"}</span>
                  <span style={{ maxWidth: "45%", textAlign: "right" }}>{q.max} — {q.maxLabel ?? "Massimo"}</span>
                </div>

                {/* Bottoni numerici rapidi (per scale corte) */}
                {q.max <= 10 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 12,
                    justifyContent: "center" }}>
                    {Array.from({ length: q.max + 1 }, (_, v) => (
                      <button key={v} onClick={() => setAnswer(v)}
                        style={{ width: 38, height: 38, borderRadius: 10, fontWeight: 800,
                          fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                          border: cur === v ? "none" : `1.5px solid ${T.border}`,
                          background: cur === v ? T.gradient : "#fff",
                          color: cur === v ? "#fff" : T.muted }}>
                        {v}
                      </button>
                    ))}
                  </div>
                )}

                {/* Note finali */}
                {isLast && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 10, color: T.faint, fontWeight: 800,
                      textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
                      Note per il fisioterapista (facoltative)
                    </div>
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                      placeholder="Es: il dolore peggiora la sera…"
                      style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
                        borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 14,
                        fontFamily: "inherit", color: T.text, resize: "vertical" }} />
                  </div>
                )}

                {submitError && (
                  <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10,
                    background: "rgba(220,38,38,0.07)", border: "1.5px solid rgba(220,38,38,0.25)",
                    color: T.red, fontSize: 13, fontWeight: 600 }}>
                    ⚠️ {submitError}
                  </div>
                )}

                {/* Navigazione */}
                <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                  {idx > 0 && (
                    <button onClick={() => setIdx(i => i - 1)}
                      style={{ padding: "13px 18px", borderRadius: 12,
                        border: `1.5px solid ${T.border}`, background: "#fff", color: T.muted,
                        fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                      ←
                    </button>
                  )}
                  {!isLast ? (
                    <button onClick={() => setIdx(i => i + 1)} disabled={cur === null}
                      style={{ flex: 1, padding: "13px 16px", borderRadius: 12, border: "none",
                        background: cur === null ? "#cbd5e1" : T.gradient, color: "#fff",
                        fontWeight: 800, fontSize: 15, cursor: cur === null ? "default" : "pointer",
                        fontFamily: "inherit" }}>
                      Avanti →
                    </button>
                  ) : (
                    <button onClick={submit} disabled={submitting || !allAnswered}
                      style={{ flex: 1, padding: "13px 16px", borderRadius: 12, border: "none",
                        background: !allAnswered ? "#cbd5e1" : T.gradient, color: "#fff",
                        fontWeight: 800, fontSize: 15,
                        cursor: submitting || !allAnswered ? "default" : "pointer",
                        opacity: submitting ? 0.7 : 1, fontFamily: "inherit" }}>
                      {submitting ? "Invio…" : "✓ Invia risposte"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
