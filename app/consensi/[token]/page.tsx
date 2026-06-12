"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════════
// app/consensi/[token]/page.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Pagina pubblica di firma consensi a distanza.
//
// Flusso:
//   1. Il paziente apre turchettamarco.com/consensi/{token} (link WhatsApp)
//   2. GET /api/consents?token={token} → testo consenso + branding studio
//   3. Il paziente legge, spunta la presa visione, digita nome e cognome,
//      firma sul canvas (touch/mouse)
//   4. POST /api/consents → status='signed'
//   5. Conferma verde. Se il link viene riaperto dopo la firma: vista
//      read-only con data firma.
//
// NB: raggiungibile anche come /mobile/consensi/{token} (re-export, vedi
// middleware che reindirizza i telefoni su /mobile/*).
// ═══════════════════════════════════════════════════════════════════════

const T = {
  appBg: "#f1f5f9", panelBg: "#ffffff", text: "#0f172a", muted: "#475569",
  border: "#cbd5e1", blue: "#2563eb", green: "#16a34a", red: "#dc2626",
  teal: "#0d9488", gradient: "linear-gradient(135deg,#0d9488,#2563eb)",
};

type ApiConsent = {
  consent_type: string;
  title: string;
  body_text: string;
  status: "pending" | "signed" | "revoked";
  signed_at: string | null;
  signed_name: string | null;
  studio: {
    name?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
    multi_operator_enabled?: boolean | null;
    address?: string | null;
  } | null;
};

export default function ConsensoPubblicoPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [consent, setConsent] = useState<ApiConsent | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [accepted, setAccepted] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/consents?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) { setLoadError(data?.error ?? "Errore caricamento"); return; }
        setConsent(data as ApiConsent);
      } catch {
        setLoadError("Errore di rete. Riprova.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // ── Canvas firma ─────────────────────────────────────────────────────
  function setupCanvas(el: HTMLCanvasElement | null) {
    if (!el || canvasRef.current === el) return;
    canvasRef.current = el;
    const dpr = window.devicePixelRatio || 1;
    const rect = el.getBoundingClientRect();
    el.width = Math.round(rect.width * dpr);
    el.height = Math.round(140 * dpr);
    const ctx = el.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, 140);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function ptr(e: React.PointerEvent<HTMLCanvasElement>) {
    const el = canvasRef.current!;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const el = canvasRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = el.getContext("2d")!;
    const p = ptr(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const el = canvasRef.current!;
    const ctx = el.getContext("2d")!;
    const p = ptr(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasDrawnRef.current) { hasDrawnRef.current = true; setHasDrawn(true); }
  }

  function onUp() { drawingRef.current = false; }

  function clearCanvas() {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    const r = el.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, r.width, 140);
    hasDrawnRef.current = false;
    setHasDrawn(false);
  }

  async function submit() {
    if (!accepted) { setSubmitError("Spunta la presa visione per continuare."); return; }
    if (name.trim().length < 5 || !name.trim().includes(" ")) {
      setSubmitError("Inserisci nome e cognome completi."); return;
    }
    if (!hasDrawnRef.current) { setSubmitError("Firma nello spazio dedicato."); return; }

    setSubmitError("");
    setSubmitting(true);
    try {
      const sig = canvasRef.current!.toDataURL("image/png");
      const res = await fetch("/api/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signed_name: name.trim(),
          signature_data: sig,
          accepted: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data?.error ?? "Errore invio firma."); return; }
      setDone(true);
    } catch {
      setSubmitError("Errore di rete. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────
  function renderBody(bodyText: string) {
    const blocks = bodyText.split(/\n\n+/).map(b => b.trim()).filter(Boolean);
    const out: React.ReactNode[] = [];
    let list: string[] = [];
    const flush = (key: string) => {
      if (list.length) {
        out.push(
          <ul key={key} style={{ margin: "8px 0", paddingLeft: 22 }}>
            {list.map((li, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.7, marginBottom: 3 }}>{li}</li>
            ))}
          </ul>
        );
        list = [];
      }
    };
    blocks.forEach((b, i) => {
      if (b.startsWith("• ")) { list.push(b.slice(2)); return; }
      flush(`ul-${i}`);
      out.push(<p key={i} style={{ fontSize: 13.5, lineHeight: 1.7, margin: "0 0 12px" }}>{b}</p>);
    });
    flush("ul-end");
    return out;
  }

  const studioHeader = consent?.studio
    ? [consent.studio.signature_name, consent.studio.signature_title]
        .filter(Boolean).join(" · ") || consent.studio.name || ""
    : "";

  // ── UI ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: T.appBg,
      fontFamily: "Inter,-apple-system,'Segoe UI',sans-serif",
      display: "flex", justifyContent: "center", padding: "24px 14px" }}>
      <div style={{ width: "100%", maxWidth: 640 }}>

        {loading && (
          <div style={{ textAlign: "center", padding: 48, color: T.muted, fontSize: 14 }}>
            Caricamento…
          </div>
        )}

        {!loading && loadError && (
          <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
            borderRadius: 16, padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{loadError}</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
              Contatta lo studio per ricevere un nuovo link.
            </div>
          </div>
        )}

        {!loading && consent && (
          <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
            borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(15,23,42,0.07)" }}>

            {/* Header brand */}
            <div style={{ background: T.gradient, padding: "18px 22px" }}>
              {studioHeader && (
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                  textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  {studioHeader}
                </div>
              )}
              <div style={{ fontWeight: 800, fontSize: 17, color: "#fff", lineHeight: 1.35 }}>
                {consent.title}
              </div>
            </div>

            {/* Già firmato */}
            {(consent.status === "signed" || done) && (
              <div style={{ padding: "22px" }}>
                <div style={{ background: "rgba(22,163,74,0.08)",
                  border: "1.5px solid rgba(22,163,74,0.3)", borderRadius: 12,
                  padding: "16px 18px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: T.green }}>
                    Consenso firmato
                  </div>
                  {(consent.signed_name || done) && (
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
                      {done
                        ? "Grazie! La firma è stata registrata correttamente."
                        : `Firmato da ${consent.signed_name} il ${consent.signed_at
                            ? new Date(consent.signed_at).toLocaleDateString("it-IT", {
                                day: "2-digit", month: "long", year: "numeric" })
                            : "—"}`}
                    </div>
                  )}
                </div>
                {!done && (
                  <div style={{ marginTop: 18 }}>{renderBody(consent.body_text)}</div>
                )}
              </div>
            )}

            {/* Revocato */}
            {consent.status === "revoked" && !done && (
              <div style={{ padding: 28, textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🚫</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>
                  Questo link non è più attivo
                </div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
                  Contatta lo studio per ricevere un nuovo link.
                </div>
              </div>
            )}

            {/* Da firmare */}
            {consent.status === "pending" && !done && (
              <div style={{ padding: "20px 22px" }}>
                {renderBody(consent.body_text)}

                <div style={{ borderTop: `1.5px solid ${T.border}`, marginTop: 18, paddingTop: 18 }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10,
                    fontSize: 13.5, color: T.text, cursor: "pointer", lineHeight: 1.5 }}>
                    <input type="checkbox" checked={accepted}
                      onChange={e => setAccepted(e.target.checked)}
                      style={{ width: 18, height: 18, marginTop: 2, accentColor: T.teal }} />
                    <span>
                      Dichiaro di aver <strong>letto e compreso</strong> il documento sopra
                      riportato e di prestare il mio consenso.
                    </span>
                  </label>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 10, color: T.muted, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                      Nome e cognome
                    </div>
                    <input value={name} onChange={e => setName(e.target.value)}
                      placeholder="Es. Mario Rossi"
                      style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px",
                        borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 15,
                        fontFamily: "inherit", color: T.text, background: "#fff" }} />
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: T.muted, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Firma qui sotto (dito o mouse)
                      </div>
                      <button onClick={clearCanvas} style={{ padding: "3px 10px",
                        borderRadius: 6, border: `1px solid ${T.border}`, background: "#fff",
                        color: T.muted, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                        Cancella
                      </button>
                    </div>
                    <canvas
                      ref={setupCanvas}
                      onPointerDown={onDown}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onPointerLeave={onUp}
                      style={{ display: "block", width: "100%", height: 140,
                        border: `1.5px dashed ${hasDrawn ? T.teal : "#94a3b8"}`,
                        borderRadius: 10, background: "#fff", touchAction: "none",
                        cursor: "crosshair" }}
                    />
                  </div>

                  {submitError && (
                    <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10,
                      background: "rgba(220,38,38,0.07)", border: "1.5px solid rgba(220,38,38,0.25)",
                      color: T.red, fontSize: 13, fontWeight: 600 }}>
                      ⚠️ {submitError}
                    </div>
                  )}

                  <button onClick={submit} disabled={submitting}
                    style={{ marginTop: 16, width: "100%", padding: "14px 16px",
                      borderRadius: 12, border: "none", background: T.gradient,
                      color: "#fff", fontWeight: 800, fontSize: 15, cursor: submitting ? "wait" : "pointer",
                      opacity: submitting ? 0.7 : 1, fontFamily: "inherit",
                      boxShadow: "0 2px 10px rgba(13,148,136,0.3)" }}>
                    {submitting ? "Invio in corso…" : "✓ Conferma e firma"}
                  </button>

                  <div style={{ fontSize: 11, color: T.muted, marginTop: 10, textAlign: "center" }}>
                    La firma viene registrata con data, ora e indirizzo IP come evidenza.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
