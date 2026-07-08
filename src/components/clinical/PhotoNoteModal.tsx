"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/clinical/PhotoNoteModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// "Fotografa i tuoi appunti. L'AI li scrive nella seduta."
//
// FLUSSO (3 step):
//   1. PICK     — scatta una foto (mobile) o scegli un'immagine dalla
//                 galleria/PC. L'immagine viene ricompressa lato client
//                 (max 1600px, JPEG ~85%) per stare nei limiti di Vercel.
//   2. LOADING  — l'azione "photo" di /api/ai-clinical (Claude vision)
//                 trascrive la calligrafia e propone una struttura SOAP.
//   3. REVIEW   — trascrizione editabile + punti dubbi evidenziati +
//                 SOAP proposto editabile. Il fisioterapista sceglie:
//                 «Inserisci → Nota rapida» oppure «Inserisci → SOAP».
//
// GARANZIE:
//   - La foto NON viene salvata da nessuna parte: è solo il mezzo di
//     input, il testo è il dato clinico. (GDPR-friendly)
//   - L'AI segnala le letture incerte con "(?)" invece di inventare.
//   - Niente viene scritto nel DB da questo modal: i callback inseriscono
//     il testo nei campi dell'editor, il salvataggio resta al chiamante
//     (con l'eccezione del diario clinico che salva il SOAP via callback).
//
// USATO DA:
//   - SOAPNotesEditor (calendario desktop + mobile, diario mobile)
//   - ClinicalDiarySection → DiarySessionCard (scheda paziente desktop)
// ═══════════════════════════════════════════════════════════════════════

import { useRef, useState } from "react";
import { buildPatientContext, callClinicalAI } from "@/src/lib/clinical/buildPatientContext";

const T = {
  teal: "#0d9488", blue: "#2563eb", purple: "#7c3aed", text: "#0f172a",
  muted: "#64748b", border: "#e2e8f0", red: "#dc2626", amber: "#f59e0b",
  green: "#16a34a", panelSoft: "#f8fafc",
};

export type PhotoSOAP = { S: string; O: string; A: string; P: string };

export type PhotoNoteResult = {
  transcription: string;
  soap: PhotoSOAP;
  uncertain: string[];
  detected_patient: string | null;
  detected_date: string | null;
};

/**
 * Accoda un blocco di testo a un campo esistente senza perdere nulla:
 * - se il campo è vuoto → solo il nuovo testo
 * - se il nuovo testo è vuoto → il campo resta invariato
 * - altrimenti → campo esistente + newline + nuovo testo
 */
export function appendTextBlock(base: string | null | undefined, add: string | null | undefined): string {
  const b = (base || "").trimEnd();
  const a = (add || "").trim();
  if (!a) return base || "";
  if (!b) return a;
  return b + "\n" + a;
}

// ─── Compressione immagine lato client ──────────────────────────
// Le foto degli smartphone sono 3-12MB: le riportiamo a ~200-500KB
// (max 1600px lato lungo, JPEG 85%) — più che sufficienti per la
// lettura della calligrafia e ben dentro il limite richieste di Vercel.

async function fileToCompressedBase64(
  file: File
): Promise<{ base64: string; mediaType: string; previewUrl: string }> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Lettura del file fallita"));
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Formato immagine non supportato"));
    i.src = dataUrl;
  });

  const MAX = 1600;
  let { width, height } = img;
  if (width > MAX || height > MAX) {
    const scale = Math.min(MAX / width, MAX / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile su questo browser");
  ctx.drawImage(img, 0, 0, width, height);

  const outUrl = canvas.toDataURL("image/jpeg", 0.85);
  const base64 = outUrl.split(",")[1] || "";
  if (!base64) throw new Error("Compressione immagine fallita");
  return { base64, mediaType: "image/jpeg", previewUrl: outUrl };
}

// ─── Bottone riutilizzabile «Da foto» ────────────────────────────

export function PhotoNoteButton({
  onClick,
  size = "md",
  title = "Fotografa gli appunti cartacei della seduta: l'AI li trascrive qui",
}: {
  onClick: () => void;
  size?: "sm" | "md";
  title?: string;
}) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: sm ? "3px 8px" : "5px 11px",
        borderRadius: 6,
        border: `1px solid ${T.border}`,
        background: "#fff",
        color: T.text,
        fontWeight: 700,
        fontSize: sm ? 10 : 11,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
      }}
    >
      📷 Da foto
    </button>
  );
}

// ─── Modal principale ────────────────────────────────────────────

type Step = "pick" | "loading" | "review";

export function PhotoNoteModal({
  open,
  onClose,
  patientId,
  onInsertQuickNote,
  onInsertSOAP,
  soapLabel = "Inserisci → SOAP",
}: {
  open: boolean;
  onClose: () => void;
  /** Se presente, l'AI riceve un contesto leggero (anagrafica + diagnosi) per interpretare meglio le abbreviazioni. */
  patientId?: string;
  /** Inserisce la trascrizione (rivista) nella nota rapida dell'editor chiamante. */
  onInsertQuickNote: (text: string) => void;
  /** Inserisce/salva la proposta SOAP (rivista). Se assente, il bottone SOAP non compare. */
  onInsertSOAP?: (soap: PhotoSOAP) => void;
  /** Etichetta del bottone SOAP (es. "Salva → SOAP" nel diario, dove scrive subito su DB). */
  soapLabel?: string;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLarge, setPreviewLarge] = useState(false);

  const [transcription, setTranscription] = useState("");
  const [soap, setSoap] = useState<PhotoSOAP>({ S: "", O: "", A: "", P: "" });
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [detectedPatient, setDetectedPatient] = useState<string | null>(null);
  const [detectedDate, setDetectedDate] = useState<string | null>(null);
  const [showSoap, setShowSoap] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  // Evita che una risposta arrivata dopo la chiusura del modal riapra la review
  const runIdRef = useRef(0);

  function resetState() {
    setStep("pick");
    setError(null);
    setPreviewUrl(null);
    setPreviewLarge(false);
    setTranscription("");
    setSoap({ S: "", O: "", A: "", P: "" });
    setUncertain([]);
    setDetectedPatient(null);
    setDetectedDate(null);
    setShowSoap(false);
  }

  /** Chiusura interna: invalida le richieste in volo e ripulisce lo stato per la prossima apertura. */
  function close() {
    runIdRef.current += 1;
    resetState();
    onClose();
  }

  async function analyzeFile(file: File) {
    const myRun = ++runIdRef.current;
    setError(null);
    setStep("loading");
    try {
      const { base64, mediaType, previewUrl: pUrl } = await fileToCompressedBase64(file);
      if (runIdRef.current !== myRun) return;
      setPreviewUrl(pUrl);

      // Contesto leggero (facoltativo): aiuta l'AI a decifrare abbreviazioni
      // coerenti con la diagnosi. Se fallisce, procediamo senza.
      let ctx: Record<string, unknown> = {};
      if (patientId) {
        try {
          ctx = await buildPatientContext({
            patientId,
            sections: ["patient", "diagnosis"],
            maxSessions: 0,
          });
        } catch {
          ctx = {};
        }
      }
      if (runIdRef.current !== myRun) return;

      ctx.image_base64 = base64;
      ctx.image_media_type = mediaType;

      const result: PhotoNoteResult = await callClinicalAI("photo", ctx);
      if (runIdRef.current !== myRun) return;
      if (!result || !(result.transcription || "").trim()) {
        throw new Error("Non sono riuscito a leggere appunti in questa foto. Prova con più luce o inquadrando meglio il foglio.");
      }

      setTranscription(result.transcription || "");
      setSoap({
        S: result.soap?.S || "",
        O: result.soap?.O || "",
        A: result.soap?.A || "",
        P: result.soap?.P || "",
      });
      setUncertain(Array.isArray(result.uncertain) ? result.uncertain : []);
      setDetectedPatient(result.detected_patient || null);
      setDetectedDate(result.detected_date || null);
      setStep("review");
    } catch (e) {
      if (runIdRef.current !== myRun) return;
      setError(e instanceof Error && e.message ? e.message : "Errore durante la lettura della foto");
      setStep("pick");
    }
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Permetti di riscegliere lo stesso file
    e.target.value = "";
    if (file) analyzeFile(file);
  }

  const soapHasContent = !!(soap.S.trim() || soap.O.trim() || soap.A.trim() || soap.P.trim());

  function handleInsertQuick() {
    const text = transcription.trim();
    if (!text) return;
    onInsertQuickNote(text);
    close();
  }

  function handleInsertSOAP() {
    if (!onInsertSOAP || !soapHasContent) return;
    onInsertSOAP({
      S: soap.S.trim(),
      O: soap.O.trim(),
      A: soap.A.trim(),
      P: soap.P.trim(),
    });
    close();
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        style={{
          background: "#fff", borderRadius: 14, width: "100%", maxWidth: 580,
          maxHeight: "92dvh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 50px rgba(15,23,42,0.35)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "13px 16px", borderBottom: `1px solid ${T.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
          background: T.panelSoft,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
              📷 Seduta da foto
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
              Fotografa i tuoi appunti cartacei: l&apos;AI li trascrive nella seduta
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Chiudi"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: T.muted, fontSize: 18, fontWeight: 800, padding: "2px 6px",
              flexShrink: 0, lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>

          {/* ── STEP 1: scelta foto ── */}
          {step === "pick" && (
            <div>
              {error && (
                <div style={{
                  padding: "8px 11px", marginBottom: 12,
                  background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)",
                  borderRadius: 8, fontSize: 12, color: T.red, fontWeight: 600, lineHeight: 1.5,
                }}>⚠ {error}</div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  style={{
                    padding: "16px 14px", borderRadius: 10, border: "none",
                    background: `linear-gradient(135deg, ${T.teal}, ${T.blue})`,
                    color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
                    fontFamily: "inherit", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 8,
                  }}
                >
                  📷 Scatta una foto
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  style={{
                    padding: "13px 14px", borderRadius: 10,
                    border: `1.5px solid ${T.border}`, background: "#fff",
                    color: T.text, fontWeight: 700, fontSize: 13, cursor: "pointer",
                    fontFamily: "inherit", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 8,
                  }}
                >
                  🖼 Scegli dalla galleria
                </button>
              </div>

              <div style={{
                marginTop: 14, padding: "10px 12px",
                background: T.panelSoft, borderRadius: 8,
                fontSize: 11.5, color: T.muted, lineHeight: 1.6,
              }}>
                💡 <b>Per una lettura migliore:</b> foglio ben illuminato, inquadratura
                dritta, una pagina per foto. Le parti cancellate vengono ignorate,
                le parole dubbie segnalate con &quot;(?)&quot;.
                <br />
                🔒 La foto non viene salvata: serve solo per la trascrizione.
              </div>

              {/* Input nascosti: camera diretta su mobile + galleria/PC */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onFileChosen}
                style={{ display: "none" }}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={onFileChosen}
                style={{ display: "none" }}
              />
            </div>
          )}

          {/* ── STEP 2: lettura in corso ── */}
          {step === "loading" && (
            <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Anteprima appunti"
                  style={{
                    maxWidth: "100%", maxHeight: 200, borderRadius: 10,
                    border: `1px solid ${T.border}`, objectFit: "contain",
                    marginBottom: 14,
                  }}
                />
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <span style={{
                  display: "inline-block", width: 18, height: 18,
                  border: `3px solid ${T.border}`, borderTopColor: T.teal,
                  borderRadius: "50%", animation: "photonote-spin 0.8s linear infinite",
                }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                  Sto leggendo i tuoi appunti…
                </span>
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
                Trascrizione e strutturazione in corso (10–25 secondi)
              </div>
              <style>{`@keyframes photonote-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── STEP 3: revisione ── */}
          {step === "review" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Anteprima + metadati rilevati */}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Appunti fotografati"
                    onClick={() => setPreviewLarge(v => !v)}
                    title={previewLarge ? "Riduci" : "Ingrandisci"}
                    style={{
                      width: previewLarge ? "100%" : 74,
                      maxHeight: previewLarge ? 420 : 74,
                      borderRadius: 8, border: `1px solid ${T.border}`,
                      objectFit: previewLarge ? "contain" : "cover",
                      cursor: "zoom-in", flexShrink: 0,
                      transition: "width 0.15s",
                    }}
                  />
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: 1 }}>
                  {(detectedPatient || detectedDate) && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {detectedPatient && (
                        <span style={{
                          padding: "3px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 800,
                          background: "rgba(13,148,136,0.1)", color: T.teal,
                          border: "1px solid rgba(13,148,136,0.25)",
                        }}>👤 Sul foglio: {detectedPatient}</span>
                      )}
                      {detectedDate && (
                        <span style={{
                          padding: "3px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 800,
                          background: "rgba(37,99,235,0.08)", color: T.blue,
                          border: "1px solid rgba(37,99,235,0.22)",
                        }}>📅 Data sul foglio: {detectedDate}</span>
                      )}
                    </div>
                  )}
                  {(detectedPatient || detectedDate) && (
                    <div style={{ fontSize: 10.5, color: T.muted, lineHeight: 1.45 }}>
                      Verifica che coincidano con la seduta aperta prima di inserire.
                    </div>
                  )}
                </div>
              </div>

              {/* Punti dubbi */}
              {uncertain.length > 0 && (
                <div style={{
                  padding: "8px 11px",
                  background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#b45309", marginBottom: 4 }}>
                    ⚠ Letture da verificare
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: "#92400e", lineHeight: 1.6 }}>
                    {uncertain.map((u, i) => <li key={i}>{u}</li>)}
                  </ul>
                </div>
              )}

              {/* Trascrizione editabile */}
              <div>
                <label style={{
                  display: "block", fontSize: 11, fontWeight: 800, color: T.teal,
                  marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4,
                }}>📝 Trascrizione (modificabile)</label>
                <textarea
                  value={transcription}
                  onChange={e => setTranscription(e.target.value)}
                  rows={Math.min(12, Math.max(5, transcription.split("\n").length + 1))}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: `1.5px solid ${T.border}`, background: "#fff",
                    fontSize: 12.5, fontFamily: "inherit", resize: "vertical",
                    outline: "none", boxSizing: "border-box", lineHeight: 1.55,
                    color: T.text,
                  }}
                />
              </div>

              {/* SOAP proposto (collassabile) */}
              {onInsertSOAP && soapHasContent && (
                <div style={{
                  border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden",
                }}>
                  <button
                    type="button"
                    onClick={() => setShowSoap(v => !v)}
                    style={{
                      width: "100%", padding: "9px 12px", border: "none",
                      background: T.panelSoft, cursor: "pointer", fontFamily: "inherit",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, color: T.purple, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      📋 SOAP proposto (modificabile)
                    </span>
                    <span style={{
                      color: T.muted, fontSize: 12, fontWeight: 800,
                      transform: showSoap ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.15s", display: "inline-block",
                    }}>›</span>
                  </button>
                  {showSoap && (
                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
                      {([
                        { k: "S" as const, label: "S — Soggettivo", color: T.blue },
                        { k: "O" as const, label: "O — Oggettivo", color: T.teal },
                        { k: "A" as const, label: "A — Assessment", color: T.purple },
                        { k: "P" as const, label: "P — Piano", color: T.green },
                      ]).map(f => (
                        <div key={f.k}>
                          <label style={{
                            display: "block", fontSize: 10, fontWeight: 800, color: f.color,
                            marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4,
                          }}>{f.label}</label>
                          <textarea
                            value={soap[f.k]}
                            onChange={e => setSoap({ ...soap, [f.k]: e.target.value })}
                            rows={2}
                            placeholder="(vuoto — non presente nel foglio)"
                            style={{
                              width: "100%", padding: "7px 10px", borderRadius: 7,
                              border: `1.5px solid ${f.color}40`,
                              borderLeft: `3px solid ${f.color}`,
                              fontSize: 12, fontFamily: "inherit", resize: "vertical",
                              outline: "none", boxSizing: "border-box", lineHeight: 1.5,
                              background: "#fff", color: T.text,
                            }}
                          />
                        </div>
                      ))}
                      <div style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>
                        I campi vuoti non sovrascrivono nulla: viene inserito solo ciò che c&apos;è.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer azioni (solo in review) */}
        {step === "review" && (
          <div style={{
            padding: "11px 16px", borderTop: `1px solid ${T.border}`,
            display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
            background: "#fff",
          }}>
            <button
              type="button"
              onClick={() => { setStep("pick"); setError(null); }}
              style={{
                padding: "8px 12px", borderRadius: 7,
                border: `1px solid ${T.border}`, background: "#fff",
                color: T.muted, fontWeight: 700, fontSize: 11.5,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >↺ Altra foto</button>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={handleInsertQuick}
              disabled={!transcription.trim()}
              style={{
                padding: "8px 14px", borderRadius: 7, border: "none",
                background: transcription.trim() ? T.teal : "#e2e8f0",
                color: transcription.trim() ? "#fff" : T.muted,
                fontWeight: 800, fontSize: 11.5,
                cursor: transcription.trim() ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >Inserisci → Nota rapida</button>
            {onInsertSOAP && (
              <button
                type="button"
                onClick={handleInsertSOAP}
                disabled={!soapHasContent}
                title={soapHasContent ? "" : "Nessun contenuto SOAP rilevato nel foglio"}
                style={{
                  padding: "8px 14px", borderRadius: 7, border: "none",
                  background: soapHasContent ? `linear-gradient(135deg, ${T.purple}, ${T.blue})` : "#e2e8f0",
                  color: soapHasContent ? "#fff" : T.muted,
                  fontWeight: 800, fontSize: 11.5,
                  cursor: soapHasContent ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
              >{soapLabel}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
