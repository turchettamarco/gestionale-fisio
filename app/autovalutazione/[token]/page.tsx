"use client";

// ════════════════════════════════════════════════════════════════════════
// app/autovalutazione/[token]/page.tsx
// ════════════════════════════════════════════════════════════════════════
// Pagina che il paziente compila prima della visita (mig. 093).
// Una sezione alla volta, per non presentare un muro di domande: su
// telefono un modulo lungo si abbandona a metà.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { INTAKE_SECTIONS } from "@/src/lib/intakeQuestions";

const T = {
  bg: "#f1f5f9", panel: "#fff", text: "#0f172a", soft: "#475569",
  muted: "#64748b", border: "#cbd5e1", borderSoft: "#e2e8f0",
  teal: "#0d9488", red: "#dc2626",
};

export default function IntakePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [studioName, setStudioName] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/intake?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        if (d.status === "completed") { setDone(true); return; }
        setStudioName(d.studio?.name ?? null);
        setFirstName(d.patient_first_name ?? null);
        setAnswers(d.payload ?? {});
      })
      .catch(() => setError("Errore di connessione"))
      .finally(() => setLoading(false));
  }, [token]);

  const section = INTAKE_SECTIONS[step];
  const isLast = step === INTAKE_SECTIONS.length - 1;

  function set(id: string, v: unknown) {
    setAnswers(prev => ({ ...prev, [id]: v }));
  }

  const missing = section?.questions
    .filter(q => q.required)
    .filter(q => {
      const v = answers[q.id];
      return v === undefined || v === null || String(v).trim() === "";
    }) ?? [];

  async function submit() {
    setSending(true);
    try {
      const r = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answers }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Errore invio"); return; }
      setDone(true);
    } catch {
      setError("Errore di connessione");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Center>Caricamento…</Center>;
  if (error) return <Center>{error}</Center>;

  if (done) {
    return (
      <Center>
        <div style={{ textAlign: "center", maxWidth: 340 }}>
          <div style={{
            width: 54, height: 54, borderRadius: "50%", background: T.teal, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, margin: "0 auto 16px",
          }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 8 }}>
            Grazie, abbiamo ricevuto tutto
          </div>
          <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55 }}>
            Le tue risposte sono già a disposizione del terapista: ne parlerete
            insieme durante la visita.
          </div>
        </div>
      </Center>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <div style={{ background: "linear-gradient(135deg,#0d9488,#2563eb)", padding: "26px 20px 20px", color: "#fff" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.85, letterSpacing: 0.5, textTransform: "uppercase" }}>
            Prima della visita
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
            {firstName ? `Ciao ${firstName}` : "Qualche domanda"}
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 4 }}>
            {studioName ? `${studioName} · ` : ""}Ci vogliono cinque minuti
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "18px 20px 60px" }}>
        {/* Avanzamento */}
        <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
          {INTAKE_SECTIONS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? T.teal : T.borderSoft,
            }} />
          ))}
        </div>

        <div style={{ background: T.panel, borderRadius: 14, border: `1px solid ${T.borderSoft}`, padding: "20px 18px" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: section.intro ? 6 : 16 }}>
            {section.title}
          </div>
          {section.intro && (
            <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
              {section.intro}
            </div>
          )}

          {section.questions.map(q => (
            <div key={q.id} style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: q.hint ? 2 : 6 }}>
                {q.label}{q.required && <span style={{ color: T.red }}> *</span>}
              </label>
              {q.hint && (
                <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 6, lineHeight: 1.45 }}>{q.hint}</div>
              )}

              {q.type === "textarea" && (
                <textarea rows={3} value={String(answers[q.id] ?? "")}
                  onChange={e => set(q.id, e.target.value)} style={field} />
              )}
              {q.type === "text" && (
                <input value={String(answers[q.id] ?? "")}
                  onChange={e => set(q.id, e.target.value)} style={field} />
              )}
              {q.type === "select" && (
                <select value={String(answers[q.id] ?? "")}
                  onChange={e => set(q.id, e.target.value)} style={field}>
                  <option value="">Scegli…</option>
                  {q.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {q.type === "scale" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(11,1fr)", gap: 3 }}>
                  {Array.from({ length: 11 }, (_, i) => i).map(n => {
                    const active = answers[q.id] === n;
                    return (
                      <button key={n} onClick={() => set(q.id, n)} style={{
                        padding: "8px 0", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 800,
                        border: `1px solid ${active ? T.teal : T.borderSoft}`,
                        background: active ? T.teal : "#fff", color: active ? "#fff" : T.soft,
                      }}>{n}</button>
                    );
                  })}
                </div>
              )}
              {q.type === "checkbox" && (
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={answers[q.id] === true}
                    onChange={e => set(q.id, e.target.checked)}
                    style={{ width: 20, height: 20, cursor: "pointer" }} />
                  <span style={{ fontSize: 13, color: T.soft }}>Sì</span>
                </label>
              )}
            </div>
          ))}

          {missing.length > 0 && (
            <div style={{ fontSize: 12, color: T.red, marginBottom: 10 }}>
              Manca ancora qualche risposta contrassegnata con *
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={{
                padding: "13px 18px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${T.border}`, background: "#fff", color: T.soft,
                fontWeight: 700, fontSize: 14,
              }}>Indietro</button>
            )}
            <button
              onClick={() => isLast ? void submit() : setStep(s => s + 1)}
              disabled={missing.length > 0 || sending}
              style={{
                flex: 1, padding: "13px", borderRadius: 10, border: "none",
                background: T.teal, color: "#fff", fontWeight: 700, fontSize: 14,
                cursor: "pointer", opacity: (missing.length > 0 || sending) ? 0.5 : 1,
              }}
            >
              {sending ? "Invio…" : isLast ? "Invia le risposte" : "Continua →"}
            </button>
          </div>
        </div>

        <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 12, textAlign: "center", lineHeight: 1.5 }}>
          Le risposte vanno solo al tuo terapista e servono a preparare la visita.
        </div>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh", background: T.bg, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
      color: T.muted, fontSize: 14, fontWeight: 600,
    }}>{children}</div>
  );
}

const field: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: `1px solid ${T.border}`, fontSize: 13.5, color: T.text,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical",
};
