"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { buildPatientContext, callClinicalAI } from "@/src/lib/clinical/buildPatientContext";
import { useDictation, appendDictated } from "@/src/hooks/useDictation";
import { DictationMicButton } from "@/src/components/DictationMicButton";
import { PhotoNoteModal, PhotoNoteButton, appendTextBlock, type PhotoSOAP } from "@/src/components/clinical/PhotoNoteModal";

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

  // ── Modelli SOAP per patologia (mig. 064) ──
  type SoapTemplate = { id: string; name: string; soap_s: string | null; soap_o: string | null; soap_a: string | null; soap_p: string | null };
  const [tplOpen, setTplOpen] = useState(false);
  const [templates, setTemplates] = useState<SoapTemplate[] | null>(null);
  const [tplBusy, setTplBusy] = useState(false);

  const loadTemplates = useCallback(async () => {
    if (!studio?.id) return;
    const { data } = await supabase.from("soap_templates")
      .select("id, name, soap_s, soap_o, soap_a, soap_p")
      .eq("studio_id", studio.id)
      .order("name");
    setTemplates((data as SoapTemplate[]) || []);
  }, [studio?.id]);

  const applyTemplate = useCallback((t: SoapTemplate) => {
    const hasContent = !!(note.soap_s || note.soap_o || note.soap_a || note.soap_p);
    if (hasContent && !window.confirm(`Sostituire i campi SOAP con il modello "${t.name}"?`)) return;
    setNote(n => ({ ...n, soap_s: t.soap_s || "", soap_o: t.soap_o || "", soap_a: t.soap_a || "", soap_p: t.soap_p || "" }));
    setExpandedMode("soap");
    setTplOpen(false);
  }, [note.soap_s, note.soap_o, note.soap_a, note.soap_p]);

  const saveAsTemplate = useCallback(async () => {
    if (!studio?.id) return;
    if (!(note.soap_s || note.soap_o || note.soap_a || note.soap_p)) {
      window.alert("Compila almeno un campo SOAP prima di salvarlo come modello.");
      return;
    }
    const name = window.prompt("Nome del modello (es. «Lombalgia — prima fase»):");
    if (!name?.trim()) return;
    setTplBusy(true);
    await supabase.from("soap_templates").insert({
      studio_id: studio.id, name: name.trim(),
      soap_s: note.soap_s || null, soap_o: note.soap_o || null,
      soap_a: note.soap_a || null, soap_p: note.soap_p || null,
    });
    setTplBusy(false);
    await loadTemplates();
  }, [studio?.id, note.soap_s, note.soap_o, note.soap_a, note.soap_p, loadTemplates]);

  const deleteTemplate = useCallback(async (t: SoapTemplate) => {
    if (!window.confirm(`Eliminare il modello "${t.name}"?`)) return;
    await supabase.from("soap_templates").delete().eq("id", t.id);
    await loadTemplates();
  }, [loadTemplates]);

  // 5 esempi pronti, inseribili quando la lista è vuota
  const seedTemplates = useCallback(async () => {
    if (!studio?.id) return;
    setTplBusy(true);
    const seed = [
      { name: "Lombalgia aspecifica — fase iniziale",
        soap_s: "Dolore lombare basso, insorgenza da alcuni giorni, VAS —/10. Peggiora con flessione e stazione seduta prolungata, migliora col movimento. Nega irradiazione sotto il ginocchio, nega parestesie.",
        soap_o: "Flessione lombare limitata e dolorosa a fine range, estensione conservata. Contrattura paravertebrale bilaterale. SLR negativo bilateralmente. Forza e riflessi AAII nella norma.",
        soap_a: "Quadro compatibile con lombalgia meccanica aspecifica, fase acuta/subacuta. Nessun segno di red flag.",
        soap_p: "Terapia manuale sui tessuti molli paravertebrali, mobilizzazioni dolci in flessione progressiva. Educazione: mantenersi attivo, evitare riposo a letto. Esercizi domiciliari di mobilità. Rivalutazione alla prossima seduta." },
      { name: "Cervicalgia — tensione miofasciale",
        soap_s: "Dolore cervicale posteriore e trapezio superiore, correlato a carico lavorativo al videoterminale. Cefalea muscolotensiva occasionale. Nega vertigini, nega deficit di forza AASS.",
        soap_o: "ROM cervicale: rotazioni lievemente limitate, dolore a fine range in estensione. Trigger point su trapezio superiore ed elevatore della scapola bilateralmente. Test neurologici AASS negativi.",
        soap_a: "Cervicalgia meccanica con componente miofasciale prevalente, correlata a postura lavorativa.",
        soap_p: "Trattamento miofasciale trapezi ed elevatore, mobilizzazioni cervicali dolci, esercizi di mobilità e rinforzo profondo. Consigli ergonomici postazione. Rivalutazione fra 2 sedute." },
      { name: "Spalla dolorosa — sindrome subacromiale",
        soap_s: "Dolore alla spalla su arco di movimento, specie in elevazione oltre i 90°. Difficoltà nelle attività sopra il capo e nel dormire sul lato affetto.",
        soap_o: "Arco doloroso tra 70° e 120° di abduzione. Test di Jobe positivo, Neer positivo, forza extrarotatori lievemente ridotta con dolore. ROM passivo completo.",
        soap_a: "Quadro riferibile a sindrome dolorosa subacromiale con interessamento della cuffia (sovraspinato).",
        soap_p: "Esercizi di rinforzo progressivo cuffia ed extrarotatori sotto soglia del dolore, controllo scapolare, terapia manuale. Educazione sulla gestione del carico. Progressione del carico nelle prossime sedute." },
      { name: "Post-ricostruzione LCA — fase intermedia",
        soap_s: "In percorso post-ricostruzione LCA. Riferisce buona tolleranza al carico, saltuario fastidio anteriore dopo sforzo. Nega cedimenti, nega blocchi.",
        soap_o: "Ginocchio asciutto, ROM completo in flesso-estensione. Deficit di forza quadricipite rispetto al controlaterale. Buon controllo nel mini-squat monopodalico, lieve valgo dinamico.",
        soap_a: "Decorso regolare, fase intermedia: priorità al recupero di forza del quadricipite e al controllo neuromuscolare.",
        soap_p: "Rinforzo quadricipite e catena posteriore con carichi progressivi, lavoro propriocettivo e controllo del valgo dinamico. Introduzione graduale di gesti pre-atletici secondo criteri. Monitoraggio versamento e dolore post-carico." },
      { name: "Tendinopatia achillea — gestione del carico",
        soap_s: "Dolore al tendine d'Achille a inizio attività, si attenua col riscaldamento e ricompare a freddo. Rigidità mattutina di breve durata.",
        soap_o: "Dolorabilità alla palpazione della porzione media del tendine, lieve ispessimento fusiforme. Heel raise monopodalico evocativo del dolore, forza in flessione plantare lievemente ridotta.",
        soap_a: "Tendinopatia achillea della porzione media, quadro da sovraccarico funzionale.",
        soap_p: "Programma di esercizio con carico progressivo (isometrie → heel raise lenti con carico), gestione dei volumi di corsa/attività, educazione sul dolore accettabile. Monitoraggio della rigidità mattutina come indicatore." },
    ];
    await supabase.from("soap_templates").insert(seed.map(t => ({ studio_id: studio.id, ...t })));
    setTplBusy(false);
    await loadTemplates();
  }, [studio?.id, loadTemplates]);

  // ── AI: espansione SOAP da nota rapida (Tappa 11) ──
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── AI: seduta da foto degli appunti manoscritti (Tappa 12) ──
  const [photoOpen, setPhotoOpen] = useState(false);

  function openPhotoModal() {
    if (dict.listening) dict.stop();
    setPhotoOpen(true);
  }

  // La trascrizione va in coda alla nota rapida (niente sovrascritture)
  function insertPhotoQuickNote(text: string) {
    setNote(n => ({ ...n, quick_note: appendTextBlock(n.quick_note, text) }));
    setExpandedMode("quick");
  }

  // Il SOAP proposto va in coda ai campi esistenti; i campi vuoti
  // della proposta lasciano invariato ciò che c'è già.
  function insertPhotoSOAP(s: PhotoSOAP) {
    setNote(n => ({
      ...n,
      soap_s: appendTextBlock(n.soap_s, s.S),
      soap_o: appendTextBlock(n.soap_o, s.O),
      soap_a: appendTextBlock(n.soap_a, s.A),
      soap_p: appendTextBlock(n.soap_p, s.P),
    }));
    setExpandedMode("soap");
  }

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
          <PhotoNoteButton onClick={openPhotoModal} />
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
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setTplOpen(o => !o); if (templates == null) void loadTemplates(); }}
              title="Modelli SOAP per patologia"
              style={{
                padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontFamily: "inherit",
              }}
            >📋 Modelli ▾</button>
            {tplOpen && (
              <>
                <div onClick={() => setTplOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 55 }} />
                <div style={{
                  position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 56,
                  width: 280, maxHeight: 300, overflowY: "auto",
                  background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 10,
                  boxShadow: "0 12px 32px rgba(15,23,42,0.16)", padding: 6,
                }}>
                  {templates == null && <div style={{ padding: 10, fontSize: 11.5, color: THEME.muted }}>Carico…</div>}
                  {templates && templates.length === 0 && (
                    <div style={{ padding: "8px 8px 4px" }}>
                      <div style={{ fontSize: 11.5, color: THEME.muted, lineHeight: 1.5, marginBottom: 8 }}>
                        Nessun modello ancora. Puoi partire da 5 esempi (lombalgia, cervicalgia, spalla, post-LCA, tendinopatia) e adattarli.
                      </div>
                      <button onClick={() => void seedTemplates()} disabled={tplBusy} style={{
                        width: "100%", padding: "8px 10px", borderRadius: 8, border: "none",
                        background: THEME.teal, color: "#fff", fontWeight: 700, fontSize: 12,
                        cursor: "pointer", fontFamily: "inherit", opacity: tplBusy ? .6 : 1,
                      }}>{tplBusy ? "Carico…" : "Carica esempi"}</button>
                    </div>
                  )}
                  {templates?.map(t => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => applyTemplate(t)} style={{
                        flex: 1, textAlign: "left", padding: "8px 10px", borderRadius: 8,
                        border: "none", background: "transparent", cursor: "pointer",
                        fontSize: 12.5, fontWeight: 700, color: THEME.text, fontFamily: "inherit",
                      }}>{t.name}</button>
                      <button onClick={() => void deleteTemplate(t)} title="Elimina modello" style={{
                        border: "none", background: "transparent", cursor: "pointer",
                        color: THEME.muted, fontWeight: 800, fontSize: 12, padding: "4px 8px",
                      }}>✕</button>
                    </div>
                  ))}
                  {templates && templates.length > 0 && <div style={{ height: 1, background: THEME.border, margin: "4px 2px" }} />}
                  {templates && (
                    <button onClick={() => void saveAsTemplate()} disabled={tplBusy} style={{
                      width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8,
                      border: "none", background: "transparent", cursor: "pointer",
                      fontSize: 12, fontWeight: 700, color: THEME.teal, fontFamily: "inherit",
                    }}>💾 Salva nota corrente come modello</button>
                  )}
                </div>
              </>
            )}
          </div>
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

      {/* Modale "Seduta da foto" (Tappa 12): trascrive gli appunti manoscritti.
          I testi vengono inseriti nei campi ma NON salvati: si salva col
          bottone Salva/Aggiorna qui sopra, dopo la revisione. */}
      <PhotoNoteModal
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        patientId={patientId}
        onInsertQuickNote={insertPhotoQuickNote}
        onInsertSOAP={insertPhotoSOAP}
      />
    </div>
  );
}
