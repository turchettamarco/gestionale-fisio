"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════════
// app/consensi/[token]/page.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Pagina pubblica di firma consensi a distanza — FIRMA UNICA + VERIFICA
// IDENTITÀ con data di nascita.
//
// Flusso:
//   1. GET ?token → se il paziente ha birth_date in anagrafica, l'API
//      risponde con verification_required=true e SOLO i metadati
//   2. Step verifica: il paziente inserisce la propria data di nascita
//      → POST action=verify → documenti completi (max 10 tentativi,
//      poi il link si blocca)
//   3. Il paziente legge ogni documento, spunta la presa visione di
//      ciascuno, digita nome e cognome, firma UNA volta sul canvas
//   4. POST action=sign (con birth_date ri-verificata stateless)
//   5. Conferma verde / vista read-only se già firmato.
//
// NB: raggiungibile anche come /mobile/consensi/{token} (re-export).
// ═══════════════════════════════════════════════════════════════════════

const T = {
  appBg: "#f1f5f9", panelBg: "#ffffff", text: "#0f172a", muted: "#475569",
  border: "#cbd5e1", blue: "#2563eb", green: "#16a34a", red: "#dc2626",
  teal: "#0d9488", gradient: "linear-gradient(135deg,#0d9488,#2563eb)",
};

type ApiDoc = {
  id: string;
  consent_type: string;
  title: string;
  body_text: string;
  status: "pending" | "signed" | "revoked";
  signed_at: string | null;
  signed_name: string | null;
};

type StudioInfo = {
  name?: string | null;
  signature_name?: string | null;
  signature_title?: string | null;
} | null;

export default function ConsensoPubblicoPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [studio, setStudio] = useState<StudioInfo>(null);

  // Step verifica
  const [needsVerification, setNeedsVerification] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // Documenti (disponibili solo dopo verifica, o subito se non richiesta)
  const [documents, setDocuments] = useState<ApiDoc[] | null>(null);
  const [docCount, setDocCount] = useState(0);

  // Firma
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
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
        const json = await res.json();
        if (!res.ok) { setLoadError(json?.error ?? "Errore caricamento"); return; }
        setStudio(json.studio ?? null);
        if (json.verification_required) {
          setNeedsVerification(true);
          setDocCount(json.documents_meta?.length ?? 0);
        } else {
          setDocuments(json.documents as ApiDoc[]);
        }
      } catch {
        setLoadError("Errore di rete. Riprova.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function verify() {
    if (!birthDate) { setVerifyError("Inserisci la tua data di nascita."); return; }
    setVerifyError("");
    setVerifying(true);
    try {
      const res = await fetch("/api/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", token, birth_date: birthDate }),
      });
      const json = await res.json();
      if (!res.ok) { setVerifyError(json?.error ?? "Verifica non riuscita."); return; }
      setDocuments(json.documents as ApiDoc[]);
      setNeedsVerification(false);
    } catch {
      setVerifyError("Errore di rete. Riprova.");
    } finally {
      setVerifying(false);
    }
  }

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

  function toggleAccepted(id: string) {
    setAcceptedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const pendingDocs = documents?.filter(d => d.status === "pending") ?? [];
  const signedDocs  = documents?.filter(d => d.status === "signed") ?? [];
  const allRevoked  = (documents?.length ?? 0) > 0 &&
    documents!.every(d => d.status === "revoked");

  async function submit() {
    if (acceptedIds.size === 0) {
      setSubmitError("Spunta la presa visione dei documenti per continuare."); return;
    }
    if (acceptedIds.size < pendingDocs.length) {
      const proceed = confirm(
        "Non hai spuntato tutti i documenti: verranno firmati solo quelli selezionati. Continuare?"
      );
      if (!proceed) return;
    }
    if (name.trim().length < 5 || !name.trim().includes(" ")) {
      setSubmitError("Inserisci nome e cognome completi."); return;
    }
    // Firma grafica facoltativa: spunta + nome e cognome sono sufficienti
    // (firma elettronica semplice, eIDAS). Se disegnata, è evidenza extra.

    setSubmitError("");
    setSubmitting(true);
    try {
      const sig = hasDrawnRef.current
        ? canvasRef.current!.toDataURL("image/png")
        : null;
      const res = await fetch("/api/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign",
          token,
          birth_date: birthDate || undefined,
          signed_name: name.trim(),
          signature_data: sig,
          accepted_ids: Array.from(acceptedIds),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setSubmitError(json?.error ?? "Errore invio firma."); return; }
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
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.7, marginBottom: 3, color: T.text }}>{li}</li>
            ))}
          </ul>
        );
        list = [];
      }
    };
    blocks.forEach((b, i) => {
      if (b.startsWith("• ")) { list.push(b.slice(2)); return; }
      flush(`ul-${i}`);
      out.push(<p key={i} style={{ fontSize: 13.5, lineHeight: 1.7, margin: "0 0 12px", color: T.text }}>{b}</p>);
    });
    flush("ul-end");
    return out;
  }

  const studioHeader = studio
    ? [studio.signature_name, studio.signature_title]
        .filter(Boolean).join(" · ") || studio.name || ""
    : "";

  const headerTitle = needsVerification
    ? "Verifica identità"
    : documents && documents.length > 1
      ? `Documenti da firmare (${documents.length})`
      : documents?.[0]?.title ?? `Documenti da firmare${docCount > 1 ? ` (${docCount})` : ""}`;

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

        {!loading && !loadError && (
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
                {headerTitle}
              </div>
            </div>

            {/* STEP VERIFICA */}
            {needsVerification && (
              <div style={{ padding: "24px 22px" }}>
                <div style={{ fontSize: 14, color: T.text, lineHeight: 1.6, marginBottom: 18 }}>
                  Per la tua sicurezza, prima di mostrarti
                  {docCount > 1 ? " i documenti" : " il documento"} ti chiediamo di
                  confermare la tua <strong>data di nascita</strong>.
                </div>
                <input type="date" value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px",
                    borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 16,
                    fontFamily: "inherit", color: T.text, background: "#fff" }} />

                {verifyError && (
                  <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10,
                    background: "rgba(220,38,38,0.07)", border: "1.5px solid rgba(220,38,38,0.25)",
                    color: T.red, fontSize: 13, fontWeight: 600 }}>
                    ⚠️ {verifyError}
                  </div>
                )}

                <button onClick={verify} disabled={verifying}
                  style={{ marginTop: 16, width: "100%", padding: "13px 16px",
                    borderRadius: 12, border: "none", background: T.gradient,
                    color: "#fff", fontWeight: 800, fontSize: 15,
                    cursor: verifying ? "wait" : "pointer",
                    opacity: verifying ? 0.7 : 1, fontFamily: "inherit" }}>
                  {verifying ? "Verifica…" : "Continua →"}
                </button>

                <div style={{ fontSize: 11, color: T.muted, marginTop: 10, textAlign: "center" }}>
                  La data viene confrontata con quella presente nella tua scheda.
                </div>
              </div>
            )}

            {/* Tutto firmato / appena firmato */}
            {documents && (done || (pendingDocs.length === 0 && signedDocs.length > 0)) && (
              <div style={{ padding: 22 }}>
                <div style={{ background: "rgba(22,163,74,0.08)",
                  border: "1.5px solid rgba(22,163,74,0.3)", borderRadius: 12,
                  padding: "16px 18px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: T.green }}>
                    {done ? "Firma registrata correttamente" : "Consensi già firmati"}
                  </div>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
                    {done
                      ? "Grazie! Puoi chiudere questa pagina."
                      : signedDocs[0]
                        ? `Firmato da ${signedDocs[0].signed_name} il ${signedDocs[0].signed_at
                            ? new Date(signedDocs[0].signed_at).toLocaleDateString("it-IT", {
                                day: "2-digit", month: "long", year: "numeric" })
                            : "—"}`
                        : ""}
                  </div>
                </div>
              </div>
            )}

            {/* Tutto revocato */}
            {documents && allRevoked && !done && (
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

            {/* Documenti da firmare */}
            {documents && pendingDocs.length > 0 && !done && (
              <div style={{ padding: "20px 22px" }}>

                {pendingDocs.map((doc, i) => (
                  <div key={doc.id} style={{ marginBottom: 18 }}>
                    {documents.length > 1 && (
                      <div style={{ fontWeight: 800, fontSize: 14.5, color: T.text,
                        padding: "10px 0 8px", borderTop: i > 0 ? `1.5px solid ${T.border}` : "none",
                        marginTop: i > 0 ? 6 : 0 }}>
                        {i + 1}. {doc.title}
                      </div>
                    )}
                    {renderBody(doc.body_text)}
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10,
                      fontSize: 13.5, color: T.text, cursor: "pointer", lineHeight: 1.5,
                      background: acceptedIds.has(doc.id) ? "rgba(13,148,136,0.06)" : T.appBg,
                      border: `1.5px solid ${acceptedIds.has(doc.id) ? T.teal : T.border}`,
                      borderRadius: 10, padding: "11px 14px" }}>
                      <input type="checkbox" checked={acceptedIds.has(doc.id)}
                        onChange={() => toggleAccepted(doc.id)}
                        style={{ width: 18, height: 18, marginTop: 2, accentColor: T.teal }} />
                      <span>
                        Dichiaro di aver <strong>letto e compreso</strong> questo documento
                        e di prestare il mio consenso.
                      </span>
                    </label>
                  </div>
                ))}

                <div style={{ borderTop: `1.5px solid ${T.border}`, paddingTop: 18 }}>
                  <div>
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
                        {pendingDocs.length > 1
                          ? "Firma grafica — facoltativa, vale per tutti i documenti"
                          : "Firma grafica — facoltativa"}
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
                      color: "#fff", fontWeight: 800, fontSize: 15,
                      cursor: submitting ? "wait" : "pointer",
                      opacity: submitting ? 0.7 : 1, fontFamily: "inherit",
                      boxShadow: "0 2px 10px rgba(13,148,136,0.3)" }}>
                    {submitting ? "Invio in corso…"
                      : pendingDocs.length > 1
                        ? `✓ Firma ${acceptedIds.size > 0 ? acceptedIds.size : ""} document${acceptedIds.size === 1 ? "o" : "i"}`
                        : "✓ Conferma e firma"}
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
