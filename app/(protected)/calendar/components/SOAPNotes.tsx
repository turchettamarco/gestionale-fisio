"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { buildPatientContext, callClinicalAI } from "@/src/lib/clinical/buildPatientContext";
import { useDictation, appendDictated } from "@/src/hooks/useDictation";
import { DictationMicButton } from "@/src/components/DictationMicButton";

const THEME = {
  teal: "#0d9488", blue: "#2563eb", text: "#0f172a",
  muted: "#64748b", border: "#e2e8f0", green: "#16a34a", red: "#dc2626",
  panelSoft: "#f8fafc",
};

// Etichette leggibili dei campi dettabili (indicatore "Sto ascoltando…")
const DICT_FIELD_LABELS: Record<string, string> = {
  quick_note: "Nota rapida",
  soap_s: "S — Soggettivo",
  soap_o: "O — Oggettivo",
  soap_a: "A — Assessment",
  soap_p: "P — Piano",
};

export type SOAPNote = {
  appointment_id: string;
  patient_id: string;
  studio_id?: string;
  soap_s?: string; soap_o?: string; soap_a?: string; soap_p?: string;
  vas_before?: number | null; vas_after?: number | null;
  quick_note?: string;
};

export function SOAPNotesEditor({ appointmentId, patientId, onSaved }: {
  appointmentId: string; patientId: string; onSaved?: () => void;
}) {
  const { studio } = useCurrentStudio();
  const [note, setNote] = useState<SOAPNote>({ appointment_id: appointmentId, patient_id: patientId });
  const [isExisting, setIsExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedMode, setExpandedMode] = useState<"quick" | "soap">("quick");

  // ── AI: espansione SOAP da nota rapida (Tappa 11) ──
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── Dettatura vocale ("Detti la seduta") ──
  // Target-based: un solo motore di riconoscimento, il campo di destinazione
  // può essere la nota rapida oppure uno dei 4 campi SOAP.
  type DictField = "quick_note" | "soap_s" | "soap_o" | "soap_a" | "soap_p";
  const [dictField, setDictField] = useState<DictField>("quick_note");
  const dictFieldRef = useRef<DictField>("quick_note");
  const [justDictated, setJustDictated] = useState(false);
  const taRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Mirror dell'intera nota: gli handler (save, expandWithAI) la leggono
  // fresca anche se l'ultimo segmento dettato arriva in modo asincrono
  const noteRef = useRef<SOAPNote>(note);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const dict = useDictation({
    lang: "it-IT",
    onFinal: (text) =>
      setNote((n) => {
        const f = dictFieldRef.current;
        return { ...n, [f]: appendDictated((n as any)[f], text) };
      }),
  });

  function setDictTarget(f: DictField) {
    dictFieldRef.current = f;
    setDictField(f);
  }

  // Ferma il microfono; se la nota rapida ha testo, evidenzia "Espandi con AI"
  function stopDictation() {
    const wasQuick = dictFieldRef.current === "quick_note";
    dict.stop();
    if (wasQuick) {
      setTimeout(() => {
        if ((noteRef.current.quick_note || "").trim()) {
          setJustDictated(true);
          setTimeout(() => setJustDictated(false), 4000);
        }
      }, 250);
    }
  }

  // Toggle per campo: stesso campo → stop; campo diverso → sposta il target
  // senza interrompere l'ascolto; spento → avvia sul campo scelto.
  function toggleDictationFor(f: DictField) {
    if (dict.listening) {
      if (dictFieldRef.current === f) {
        stopDictation();
      } else {
        setDictTarget(f);
      }
      return;
    }
    setDictTarget(f);
    dict.start();
  }

  const isDictating = (f: DictField) => dict.listening && dictField === f;

  // Valore mostrato: testo consolidato + trascrizione live (ghost) sul target
  function displayValue(f: DictField): string {
    const base = ((note as any)[f] as string) || "";
    if (dict.listening && dictField === f && dict.interim) {
      return base + (base ? " " : "") + dict.interim;
    }
    return base;
  }

  // Auto-scroll in fondo del campo attivo mentre la trascrizione cresce
  const activeDisplay = displayValue(dictField);
  useEffect(() => {
    if (dict.listening) {
      const el = taRefs.current[dictField];
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [activeDisplay, dict.listening, dictField]);

  // Cambiare vista Rapida/SOAP mentre si detta fermerebbe il flusso in modo
  // invisibile: meglio spegnere esplicitamente il microfono.
  function switchMode(m: "quick" | "soap") {
    if (dict.listening) stopDictation();
    setExpandedMode(m);
  }

  async function expandWithAI() {
    if (dict.listening) {
      dict.stop();
      // Lascia consolidare l'ultimo segmento finale della dettatura
      await new Promise((r) => setTimeout(r, 350));
    }
    setJustDictated(false);
    setAiLoading(true);
    setAiError(null);
    try {
      const ctx = await buildPatientContext({
        patientId,
        sections: ["patient", "anamnesis", "diagnosis", "plan", "tests", "sessions"],
        maxSessions: 5,
      });
      ctx.quick_note = noteRef.current.quick_note || "";
      const result = await callClinicalAI("soap", ctx);
      if (!result) throw new Error("Risposta AI vuota");
      setNote(n => ({
        ...n,
        soap_s: result.S || n.soap_s,
        soap_o: result.O || n.soap_o,
        soap_a: result.A || n.soap_a,
        soap_p: result.P || n.soap_p,
      }));
      // Passa automaticamente alla vista SOAP per mostrare il risultato
      setExpandedMode("soap");
    } catch (e: any) {
      setAiError(e?.message || "Errore AI");
    } finally {
      setAiLoading(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("session_notes")
      .select("*").eq("appointment_id", appointmentId).maybeSingle();
    if (data) {
      setNote(data as SOAPNote);
      setIsExisting(true);
      if (data.soap_s || data.soap_o || data.soap_a || data.soap_p) setExpandedMode("soap");
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!studio?.id) {
      alert("Studio non identificato. Ricarica la pagina.");
      return;
    }
    if (dict.listening) {
      dict.stop();
      // Lascia consolidare l'ultimo segmento finale della dettatura
      await new Promise((r) => setTimeout(r, 350));
    }
    setSaving(true); setSaved(false);
    const n = noteRef.current;
    // La tabella session_notes ha appointment_id come PRIMARY KEY,
    // quindi usiamo upsert on appointment_id (una nota per appuntamento).
    const payload: any = {
      appointment_id: appointmentId,
      patient_id: patientId,
      studio_id: studio.id,
      soap_s: n.soap_s || null,
      soap_o: n.soap_o || null,
      soap_a: n.soap_a || null,
      soap_p: n.soap_p || null,
      vas_before: n.vas_before ?? null,
      vas_after: n.vas_after ?? null,
      quick_note: n.quick_note || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("session_notes")
      .upsert(payload, { onConflict: "appointment_id" })
      .select()
      .maybeSingle();
    if (error) {
      alert("Errore salvataggio note: " + error.message);
      setSaving(false);
      return;
    }
    if (data) setNote(data as SOAPNote);
    setIsExisting(true);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved?.();
  }

  if (loading) return <div style={{ padding: 16, color: THEME.muted, fontSize: 12 }}>Caricamento note…</div>;

  const vasColor = (v: number | null | undefined) =>
    v == null ? THEME.muted : v <= 3 ? THEME.green : v <= 6 ? "#f59e0b" : THEME.red;

  return (
    <div style={{ padding: "14px 18px", background: THEME.panelSoft, borderRadius: 10, border: `1px solid ${THEME.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>📝 Note di seduta</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={expandWithAI}
            disabled={aiLoading}
            title="Genera S/O/A/P automatici dalla nota rapida + contesto paziente"
            style={{
              padding: "5px 11px", borderRadius: 6, border: "none",
              background: aiLoading
                ? "#e2e8f0"
                : "linear-gradient(135deg, #7c3aed, #2563eb)",
              color: aiLoading ? THEME.muted : "#fff",
              fontWeight: 700, fontSize: 11,
              cursor: aiLoading ? "wait" : "pointer",
              fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 4,
              animation: justDictated && !aiLoading ? "soapai-glow 1.1s ease-in-out 3" : "none",
            }}
          >
            {aiLoading ? (
              <>
                <span style={{
                  display: "inline-block", width: 10, height: 10,
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "soapai-spin 0.7s linear infinite",
                }} />
                Elaboro…
              </>
            ) : (
              <>✨ Espandi con AI</>
            )}
            <style>{`
              @keyframes soapai-spin { to { transform: rotate(360deg); } }
              @keyframes soapai-glow {
                0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); transform: scale(1); }
                50%      { box-shadow: 0 0 0 6px rgba(124,58,237,0.25); transform: scale(1.05); }
              }
            `}</style>
          </button>
          <div style={{ display: "flex", gap: 4, background: "#fff", borderRadius: 7, padding: 2, border: `1px solid ${THEME.border}` }}>
            <button onClick={() => switchMode("quick")} style={{
              padding: "4px 10px", borderRadius: 5, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: expandedMode === "quick" ? THEME.teal : "transparent",
              color: expandedMode === "quick" ? "#fff" : THEME.muted,
            }}>Rapida</button>
            <button onClick={() => switchMode("soap")} style={{
              padding: "4px 10px", borderRadius: 5, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: expandedMode === "soap" ? THEME.teal : "transparent",
              color: expandedMode === "soap" ? "#fff" : THEME.muted,
            }}>SOAP completa</button>
          </div>
        </div>
      </div>

      {aiError && (
        <div style={{
          padding: "6px 10px", marginBottom: 10,
          background: "rgba(220,38,38,0.05)",
          border: "1px solid rgba(220,38,38,0.2)",
          borderRadius: 6,
          fontSize: 11, color: THEME.red, fontWeight: 600,
        }}>⚠ {aiError}</div>
      )}

      {dict.listening && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 700, color: "#dc2626" }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%", background: "#dc2626",
            display: "inline-block", animation: "soapdict-blink 1s ease-in-out infinite",
          }} />
          Sto ascoltando ({DICT_FIELD_LABELS[dictField]})… parla liberamente, tocca il microfono per fermare
          <style>{`@keyframes soapdict-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
        </div>
      )}

      {dict.error && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          padding: "6px 10px", marginBottom: 8,
          background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)",
          borderRadius: 6, fontSize: 11, color: THEME.red, fontWeight: 600,
        }}>
          <span>⚠ {dict.error}</span>
          <button
            type="button"
            onClick={dict.clearError}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: THEME.red, fontWeight: 800, fontSize: 12, padding: 0 }}
            aria-label="Chiudi avviso"
          >✕</button>
        </div>
      )}

      {expandedMode === "quick" ? (
        <div>
          <div style={{ position: "relative" }}>
            <textarea
              ref={(el) => { taRefs.current["quick_note"] = el; }}
              value={displayValue("quick_note")}
              onChange={e => setNote({ ...note, quick_note: e.target.value })}
              readOnly={isDictating("quick_note")}
              placeholder={dict.supported
                ? "🎙 Detta la seduta o scrivi… Es. VAS 4→2, tecar lombare, migliora ROM"
                : "Es. VAS 4→2, miglioramento ROM, continua esercizi a casa…"}
              rows={3}
              style={{
                width: "100%", padding: "10px 12px",
                paddingRight: dict.supported ? 50 : 12,
                borderRadius: 8,
                border: isDictating("quick_note") ? "1.5px solid #dc2626" : `1.5px solid ${THEME.border}`,
                background: isDictating("quick_note") ? "rgba(220,38,38,0.03)" : "#fff",
                fontSize: 13, fontFamily: "inherit", resize: "vertical",
                outline: "none", boxSizing: "border-box",
                transition: "border-color 0.15s, background 0.15s",
              }}
            />
            <div style={{ position: "absolute", right: 8, bottom: 12 }}>
              <DictationMicButton
                listening={isDictating("quick_note")}
                supported={dict.supported}
                onToggle={() => toggleDictationFor("quick_note")}
              />
            </div>
          </div>

          {dict.supported && !dict.listening && !note.quick_note && !dict.error && (
            <div style={{ marginTop: 5, fontSize: 10.5, color: THEME.muted, fontStyle: "italic" }}>
              💡 Detta le note grezze, poi «✨ Espandi con AI»: il SOAP si scrive da solo.
            </div>
          )}

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: THEME.muted }}>VAS prima:</span>
              <input type="number" min={0} max={10} value={note.vas_before ?? ""}
                onChange={e => setNote({ ...note, vas_before: e.target.value === "" ? null : Math.min(10, Math.max(0, parseInt(e.target.value))) })}
                style={{ width: 55, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${vasColor(note.vas_before)}`, fontSize: 13, fontWeight: 700, color: vasColor(note.vas_before), textAlign: "center", outline: "none" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: THEME.muted }}>VAS dopo:</span>
              <input type="number" min={0} max={10} value={note.vas_after ?? ""}
                onChange={e => setNote({ ...note, vas_after: e.target.value === "" ? null : Math.min(10, Math.max(0, parseInt(e.target.value))) })}
                style={{ width: 55, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${vasColor(note.vas_after)}`, fontSize: 13, fontWeight: 700, color: vasColor(note.vas_after), textAlign: "center", outline: "none" }} />
            </div>
            {note.vas_before != null && note.vas_after != null && (
              <div style={{ fontSize: 11, fontWeight: 700, color: note.vas_after < note.vas_before ? THEME.green : note.vas_after > note.vas_before ? THEME.red : THEME.muted }}>
                {note.vas_after < note.vas_before ? `↓ ${note.vas_before - note.vas_after} punti` : note.vas_after > note.vas_before ? `↑ ${note.vas_after - note.vas_before} punti` : "Invariato"}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {([
            { k: "soap_s", label: "S — Soggettivo", placeholder: "Cosa riferisce il paziente (dolore, limitazioni, vissuto)", color: THEME.blue },
            { k: "soap_o", label: "O — Oggettivo", placeholder: "Cosa osservi/misuri (ROM, forza, test)", color: THEME.teal },
            { k: "soap_a", label: "A — Assessment", placeholder: "Valutazione clinica, ragionamento, diagnosi", color: "#7c3aed" },
            { k: "soap_p", label: "P — Piano", placeholder: "Cosa farai la prossima volta, esercizi, educazione", color: THEME.green },
          ] as const).map(f => (
            <div key={f.k}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: f.color, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>{f.label}</label>
              <div style={{ position: "relative" }}>
                <textarea
                  ref={(el) => { taRefs.current[f.k] = el; }}
                  value={displayValue(f.k)}
                  onChange={e => setNote({ ...note, [f.k]: e.target.value })}
                  readOnly={isDictating(f.k)}
                  placeholder={f.placeholder}
                  rows={2}
                  style={{
                    width: "100%", padding: "8px 10px",
                    paddingRight: dict.supported ? 42 : 10,
                    borderRadius: 7,
                    border: isDictating(f.k) ? "1.5px solid #dc2626" : `1.5px solid ${THEME.border}`,
                    background: isDictating(f.k) ? "rgba(220,38,38,0.03)" : "#fff",
                    fontSize: 12, fontFamily: "inherit", resize: "vertical",
                    outline: "none", boxSizing: "border-box",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                />
                <div style={{ position: "absolute", right: 6, bottom: 9 }}>
                  <DictationMicButton
                    listening={isDictating(f.k)}
                    supported={dict.supported}
                    onToggle={() => toggleDictationFor(f.k)}
                    size={26}
                  />
                </div>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: THEME.muted }}>VAS:</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: THEME.muted }}>prima</span>
              <input type="number" min={0} max={10} value={note.vas_before ?? ""}
                onChange={e => setNote({ ...note, vas_before: e.target.value === "" ? null : Math.min(10, Math.max(0, parseInt(e.target.value))) })}
                style={{ width: 50, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${vasColor(note.vas_before)}`, fontSize: 12, fontWeight: 700, color: vasColor(note.vas_before), textAlign: "center", outline: "none" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: THEME.muted }}>dopo</span>
              <input type="number" min={0} max={10} value={note.vas_after ?? ""}
                onChange={e => setNote({ ...note, vas_after: e.target.value === "" ? null : Math.min(10, Math.max(0, parseInt(e.target.value))) })}
                style={{ width: 50, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${vasColor(note.vas_after)}`, fontSize: 12, fontWeight: 700, color: vasColor(note.vas_after), textAlign: "center", outline: "none" }} />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        {saved && <span style={{ color: THEME.green, fontSize: 11, fontWeight: 700, alignSelf: "center" }}>✓ Salvato</span>}
        <button onClick={save} disabled={saving}
          style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: `linear-gradient(135deg, ${THEME.teal}, ${THEME.blue})`, color: "#fff", fontWeight: 700, fontSize: 12, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Salvataggio…" : isExisting ? "Aggiorna" : "Salva note"}
        </button>
      </div>
    </div>
  );
}
