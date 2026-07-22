// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/domicili/components/CartellaValutazione.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Cartella di valutazione Santa Lucia Life, compilabile dall'app.
//
// COMPILAZIONE: tutti i campi sono <input>/<textarea> normali — su iPad
// la Apple Pencil li riempie con Scribble (si scrive a mano sopra il
// campo e diventa testo), e la tastiera funziona come sempre. Nessun
// doppio percorso da mantenere.
//
// FIRMA: un solo canvas. La firma del paziente si disegna una volta e
// viene replicata in tutti i punti firma del PDF (consenso informato,
// consensi GDPR, dichiarazione di responsabilità).
//
// PUNTEGGI: ADL, IADL, MMSE e Tinetti si sommano da soli mentre compili,
// con fascia di rischio per Tinetti. Le regole stanno in cartellaSchema.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import type { CoopPatient } from "@/src/lib/domicili/types";
import {
  ADL, IADL, TINETTI_EQ, TINETTI_AND, MMSE_ITEMS, MMSE_MAX,
  scoreBlock, missingCount, scoreMmse, mmseMissing,
  tinettiRischio, autonomiaLabel, mmseLabel,
  type Risposte, type ScaleBlock,
} from "@/src/lib/domicili/cartellaSchema";
import { buildCartellaPdf, cartellaFileName, type CartellaData } from "@/src/lib/domicili/cartellaPdf";
import { compilaModuloOriginale } from "@/src/lib/domicili/cartellaTemplate";
import AllegatiCartella from "./AllegatiCartella";

const T = {
  panelBg: "#ffffff", panelSoft: "#FFFDF9",
  text: "#0f172a", muted: "#334155", mutedLight: "#475569", label: "#64748b",
  border: "#cbd5e1", borderSoft: "#e2e8f0",
  teal: "#0d9488", tealDark: "#0f766e", blue: "#2563eb",
  red: "#dc2626", amber: "#b45309", green: "#16a34a",
};

/** Numero fisso a cui inviare le cartelle compilate. */
const WHATSAPP_NUMERO = "393403830483";
const WHATSAPP_LABEL = "+39 340 383 0483";

type Tab = "anagrafica" | "adl" | "mmse" | "tinetti" | "firme" | "cartacea";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "anagrafica", label: "Anagrafica e consensi" },
  { id: "adl", label: "ADL / IADL" },
  { id: "mmse", label: "MMSE" },
  { id: "tinetti", label: "Tinetti" },
  { id: "firme", label: "Firme e invio" },
  { id: "cartacea", label: "Cartacea" },
];

type FormState = Omit<CartellaData, "risposte" | "firma_paziente" | "firma_operatore">;

const EMPTY: FormState = {
  cognome: "", nome: "", data_nascita: "", luogo_nascita: "", codice_fiscale: "",
  residenza: "", data_valutazione: "", attivazione_pai: "",
  tutore_nome: "", tutore_nascita: "", tutore_cf: "", tutore_tel: "", tutore_qualita: "",
  trattamento: "", operatore_nome: "", operatore_qualifica: "",
  consenso1: false, consenso2: false, consenso3: false, responsabilita: false,
  mmse_aggiustato: "", note: "",
};

/** Precompilazione dall'anagrafica PAI: tutto ciò che lo studio ha già
    non si ridigita. Ciò che il PAI non contiene (luogo di nascita, codice
    fiscale) viene ereditato dalla valutazione precedente, se c'è. */
function datiDaAnagrafica(p: CoopPatient, operatore?: string): FormState {
  return {
    ...EMPTY,
    cognome: p.cognome || "",
    nome: p.nome || "",
    data_nascita: p.data_nascita || "",
    residenza: [p.residenza, p.citta].filter(Boolean).join(", "),
    data_valutazione: localISO(new Date()),
    attivazione_pai: p.data_attivazione || "",
    trattamento: p.prestazione || "",
    tutore_tel: (p.recapiti || "").split(/[;\n]/)[0].trim(),
    // L'operatore è CHI COMPILA (utente loggato), non il campo "operatori"
    // del PAI: quello elenca il personale assegnato dalla cooperativa.
    operatore_nome: operatore || "",
  };
}

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════════════════
// Firma: canvas a mano libera (Pencil, dito, mouse)
// ═══════════════════════════════════════════════════════════════════════

function SignaturePad({ value, onChange, label }: {
  value: string;
  onChange: (dataUrl: string) => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const dirty = useRef(false);

  // Ridimensiona al DPR e ridisegna la firma già presente
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    if (value) {
      const img = new Image();
      img.onload = () => {
        // l'immagine salvata è già ritagliata sul tratto: si ridisegna
        // rispettando le proporzioni, centrata, senza stirarla
        const k = Math.min((rect.width - 12) / img.width, (rect.height - 12) / img.height, 1);
        const w = img.width * k, h = img.height * k;
        ctx.drawImage(img, (rect.width - w) / 2, (rect.height - h) / 2, w, h);
      };
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    dirty.current = true;
    last.current = pos(e);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* iOS vecchi */ }
    // punto singolo (tap): traccia un pallino, così il puntino della "i" resta
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  /** Ritaglia il canvas al solo tratto: esportarlo intero significherebbe
      salvare soprattutto spazio vuoto, e nel PDF la firma finirebbe
      rimpicciolita a francobollo dentro il suo stesso margine. */
  const ritaglia = (cv: HTMLCanvasElement): string => {
    const ctx = cv.getContext("2d");
    if (!ctx) return cv.toDataURL("image/png");
    const { width: W, height: H } = cv;
    const px = ctx.getImageData(0, 0, W, H).data;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (px[(y * W + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return "";                       // canvas vuoto
    const pad = 6;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
    const out = document.createElement("canvas");
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    const octx = out.getContext("2d");
    if (!octx) return cv.toDataURL("image/png");
    octx.drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const cv = canvasRef.current;
    if (cv && dirty.current) onChange(ritaglia(cv));
  };

  const clear = () => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    dirty.current = false;
    onChange("");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: T.label, letterSpacing: .3, textTransform: "uppercase" }}>{label}</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={clear} style={{
          border: `1px solid ${T.border}`, background: "#fff", color: T.mutedLight,
          borderRadius: 8, padding: "5px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
        }}>Cancella</button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        style={{
          width: "100%", height: 150, display: "block",
          border: `1.5px dashed ${value ? T.teal : T.border}`,
          borderRadius: 12, background: "#fff", touchAction: "none", cursor: "crosshair",
        }}
      />
      <div style={{ fontSize: 11, color: T.label, marginTop: 5 }}>
        Firma con la penna o con il dito. {label.includes("paziente") ? "Questa firma viene riportata in tutti i punti firma del documento." : ""}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Blocchi UI riusabili
// ═══════════════════════════════════════════════════════════════════════

function Field({ label, value, onChange, type = "text", placeholder, wide }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; wide?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: wide ? "1 1 100%" : "1 1 190px", minWidth: 0 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: T.label, letterSpacing: .4, textTransform: "uppercase" }}>{label}</span>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "11px 12px",
          fontSize: 15, fontWeight: 600, color: T.text, background: "#fff",
          fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box",
        }}
      />
    </label>
  );
}

function CheckRow({ checked, onChange, title, text }: {
  checked: boolean; onChange: (v: boolean) => void; title: string; text: string;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{
      display: "flex", gap: 11, alignItems: "flex-start", width: "100%", textAlign: "left",
      border: `1.5px solid ${checked ? T.teal : T.border}`,
      background: checked ? "rgba(13,148,136,0.04)" : "#fff",
      borderRadius: 12, padding: "13px 14px", cursor: "pointer", fontFamily: "inherit",
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
        border: `2px solid ${checked ? T.teal : T.border}`,
        background: checked ? T.teal : "#fff", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 900, lineHeight: 1,
      }}>{checked ? "✓" : ""}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.text, marginBottom: 3 }}>{title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: T.mutedLight, lineHeight: 1.5 }}>{text}</span>
      </span>
    </button>
  );
}

/** Voce di scala a scelta singola. Salva valore e indice dell'opzione. */
function ScaleQuestion({ item, risposte, onPick }: {
  item: ScaleBlock["items"][number];
  risposte: Risposte;
  onPick: (key: string, value: number, index: number) => void;
}) {
  const chosenIdx = risposte[`${item.key}__i`];
  return (
    <div style={{ padding: "13px 0", borderBottom: `1px solid ${T.borderSoft}` }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, marginBottom: item.hint ? 2 : 8 }}>{item.title}</div>
      {item.hint && <div style={{ fontSize: 11.5, color: T.label, marginBottom: 8, lineHeight: 1.4 }}>{item.hint}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {item.options.map((o, i) => {
          const active = chosenIdx === i;
          return (
            <button key={i} type="button" onClick={() => onPick(item.key, o.value, i)} style={{
              display: "flex", alignItems: "center", gap: 10, textAlign: "left", width: "100%",
              border: `1.5px solid ${active ? T.teal : T.border}`,
              background: active ? "rgba(13,148,136,0.05)" : "#fff",
              borderRadius: 10, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit",
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${active ? T.teal : T.border}`,
                background: active ? T.teal : "#fff",
              }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? T.text : T.muted, lineHeight: 1.45 }}>
                {o.label}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 900, flexShrink: 0,
                color: active ? T.teal : T.label,
                border: `1px solid ${active ? T.teal : T.borderSoft}`,
                borderRadius: 6, padding: "2px 7px",
              }}>{o.value}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScoreBar({ label, score, max, note, color, missing }: {
  label: string; score: number; max: number; note: string; color: string; missing: number;
}) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 5,
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      background: "#fff", border: `1.5px solid ${color}`, borderRadius: 12,
      padding: "11px 14px", marginBottom: 10,
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: T.text }}>{label}</span>
      <span style={{ fontSize: 21, fontWeight: 900, color, lineHeight: 1 }}>{score}<span style={{ fontSize: 13, color: T.label, fontWeight: 800 }}> / {max}</span></span>
      <span style={{ fontSize: 12, fontWeight: 800, color }}>{note}</span>
      <div style={{ flex: 1 }} />
      {missing > 0 && (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: T.amber }}>
          {missing} {missing === 1 ? "voce da compilare" : "voci da compilare"}
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Componente principale
// ═══════════════════════════════════════════════════════════════════════

export default function CartellaValutazione({
  open, onClose, isMobile, studioId, patient, operatoreDefault, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
  studioId: string;
  patient: CoopPatient | null;
  /** Nome dell'operatore che compila, precompilato nel consenso. */
  operatoreDefault?: string;
  onSaved?: () => void;
}) {
  const { member } = useCurrentStudio();
  const [nomeOperatore, setNomeOperatore] = useState("");
  const [tab, setTab] = useState<Tab>("anagrafica");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [risposte, setRisposte] = useState<Risposte>({});
  const [firmaPaziente, setFirmaPaziente] = useState("");
  const [firmaOperatore, setFirmaOperatore] = useState("");
  const [valutazioneId, setValutazioneId] = useState<string | null>(null);
  const [storico, setStorico] = useState<Array<{
    id: string; data_valutazione: string;
    adl_score: number | null; iadl_score: number | null;
    mmse_score: number | null; tinetti_tot: number | null;
  }>>([]);
  const [salvatoAlle, setSalvatoAlle] = useState<string | null>(null);
  const pronto = useRef(false);        // evita di salvare durante il caricamento
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Nome dell'operatore che compila: prima il nome del membro dello studio,
  // altrimenti il titolare configurato in Contabilità.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const daMembro = (member?.display_name || "").trim();
      if (daMembro) { if (vivo) setNomeOperatore(daMembro); return; }
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) return;
        const { data } = await supabase.from("practice_settings")
          .select("owner_full_name").eq("owner_id", uid).maybeSingle();
        const n = ((data as { owner_full_name?: string } | null)?.owner_full_name || "").trim();
        if (vivo && n) setNomeOperatore(n);
      } catch { /* resta vuoto: si scrive a mano */ }
    })();
    return () => { vivo = false; };
  }, [member?.display_name]);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3200);
  };

  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const pick = useCallback((key: string, value: number, index: number) => {
    setRisposte(r => ({ ...r, [key]: value, [`${key}__i`]: index }));
  }, []);

  const pickMmse = useCallback((key: string, value: number) => {
    setRisposte(r => ({ ...r, [key]: r[key] === value ? undefined : value }));
  }, []);

  // ── Apertura: riprende l'ultima valutazione così com'era ────────────────
  // Riaprendo il paziente si continua a lavorare su quella in corso: niente
  // va perso se il PDF, un aggiornamento o la chiusura dell'app portano via
  // la pagina. Per ricominciare da capo c'è "Nuova valutazione".
  useEffect(() => {
    if (!open || !patient) return;
    let annullato = false;
    (async () => {
      setTab("anagrafica");
      setLoading(true);
      const base = datiDaAnagrafica(patient, operatoreDefault || nomeOperatore);
      try {
        const { data, error } = await supabase
          .from("coop_valutazioni")
          .select("id, data_valutazione, dati, adl_score, iadl_score, mmse_score, tinetti_tot")
          .eq("coop_patient_id", patient.id)
          .order("data_valutazione", { ascending: false })
          .limit(20);
        if (error) throw new Error(error.message);
        const rows = (data || []) as Array<{
          id: string; data_valutazione: string; dati: Record<string, unknown>;
          adl_score: number | null; iadl_score: number | null;
          mmse_score: number | null; tinetti_tot: number | null;
        }>;
        if (annullato) return;
        setStorico(rows.map(r => ({
          id: r.id, data_valutazione: r.data_valutazione,
          adl_score: r.adl_score, iadl_score: r.iadl_score,
          mmse_score: r.mmse_score, tinetti_tot: r.tinetti_tot,
        })));

        const last = rows[0];
        if (last?.dati) {
          const d = last.dati as Partial<FormState> & {
            risposte?: Risposte; firma_paziente?: string; firma_operatore?: string;
          };
          setForm({
            ...base,
            ...Object.fromEntries(
              (Object.keys(EMPTY) as Array<keyof FormState>)
                .filter(k => d[k] !== undefined && d[k] !== "")
                .map(k => [k, d[k]])
            ),
            // l'operatore resta comunque chi sta compilando ora
            operatore_nome: base.operatore_nome || d.operatore_nome || "",
          } as FormState);
          setRisposte(d.risposte || {});
          setFirmaPaziente(d.firma_paziente || "");
          setFirmaOperatore(d.firma_operatore || "");
          setValutazioneId(last.id);
        } else {
          setForm(base);
          setRisposte({});
          setFirmaPaziente("");
          setFirmaOperatore("");
          setValutazioneId(null);
        }
      } catch (e) {
        if (annullato) return;
        setForm(base);
        setRisposte({});
        setValutazioneId(null);
        flash("err", e instanceof Error ? e.message : "Impossibile leggere le valutazioni precedenti");
      } finally {
        if (!annullato) {
          setLoading(false);
          // da qui in poi ogni modifica viene salvata da sola
          setTimeout(() => { pronto.current = true; }, 400);
        }
      }
    })();
    return () => { annullato = true; pronto.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient?.id]);

  /** Ricomincia da zero: l'attuale resta salvata nello storico. */
  const nuovaValutazione = async () => {
    if (valutazioneId && !window.confirm(
      "Iniziare una nuova valutazione?\nQuella in corso resta salvata e consultabile qui sotto."
    )) return;
    if (!patient) return;
    pronto.current = false;
    await save();                       // l'attuale finisce nello storico
    const { data } = await supabase
      .from("coop_valutazioni")
      .select("id, data_valutazione, adl_score, iadl_score, mmse_score, tinetti_tot")
      .eq("coop_patient_id", patient.id)
      .order("data_valutazione", { ascending: false }).limit(20);
    setStorico((data || []) as typeof storico);
    setForm(datiDaAnagrafica(patient, operatoreDefault || nomeOperatore));
    setRisposte({});
    setFirmaPaziente("");
    setFirmaOperatore("");
    setValutazioneId(null);
    setTab("anagrafica");
    setSalvatoAlle(null);
    flash("ok", "Nuova valutazione iniziata.");
    setTimeout(() => { pronto.current = true; }, 400);
  };

  // ── Punteggi ──
  const adl = useMemo(() => scoreBlock(ADL, risposte), [risposte]);
  const iadl = useMemo(() => scoreBlock(IADL, risposte), [risposte]);
  const mmse = useMemo(() => scoreMmse(risposte), [risposte]);
  const tEq = useMemo(() => scoreBlock(TINETTI_EQ, risposte), [risposte]);
  const tAnd = useMemo(() => scoreBlock(TINETTI_AND, risposte), [risposte]);
  const tTot = tEq + tAnd;
  const risk = tinettiRischio(tTot);
  const mmL = mmseLabel(mmse);

  const cartellaData = (): CartellaData => ({
    ...form, risposte,
    firma_paziente: firmaPaziente,
    firma_operatore: firmaOperatore,
  });

  // ── Salvataggio ──
  const save = async (): Promise<string | null> => {
    if (!patient || !studioId) return null;
    setSaving(true);
    try {
      const payload = {
        studio_id: studioId,
        coop_patient_id: patient.id,
        data_valutazione: form.data_valutazione || localISO(new Date()),
        dati: { ...form, risposte, firma_paziente: firmaPaziente, firma_operatore: firmaOperatore },
        adl_score: adl, iadl_score: iadl, mmse_score: mmse,
        mmse_aggiustato: form.mmse_aggiustato ? Number(form.mmse_aggiustato.replace(",", ".")) || null : null,
        tinetti_eq: tEq, tinetti_and: tAnd, tinetti_tot: tTot,
        updated_at: new Date().toISOString(),
      };
      if (valutazioneId) {
        const { error } = await supabase.from("coop_valutazioni").update(payload).eq("id", valutazioneId);
        if (error) throw new Error(error.message);
        flash("ok", "Valutazione aggiornata.");
        onSaved?.();
        return valutazioneId;
      }
      const { data, error } = await supabase.from("coop_valutazioni").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      const id = (data as { id: string }).id;
      setValutazioneId(id);
      setSalvatoAlle(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
      onSaved?.();
      return id;
    } catch (e) {
      const m = e instanceof Error ? e.message : "Errore salvataggio";
      flash("err", /coop_valutazioni|does not exist|schema cache/i.test(m)
        ? "Le valutazioni non possono essere salvate: manca la migrazione 068 sul database. Esegui npm run db:migrate."
        : m);
      return null;
    } finally {
      setSaving(false);
    }
  };

  // ── PDF: genera (e salva prima, così il documento e il DB coincidono) ──
  // ── Salvataggio automatico ──────────────────────────────────────────────
  // Ogni modifica viene scritta da sola dopo una breve pausa: chiudendo la
  // cartella, aprendo il PDF o perdendo la pagina non si perde nulla.
  const salvaRef = useRef(save);
  useEffect(() => { salvaRef.current = save; });   // sempre l'ultima versione
  useEffect(() => {
    if (!open || !patient || loading || !pronto.current) return;
    const qualcosaDaSalvare =
      form.cognome.trim() !== "" || form.nome.trim() !== "" ||
      Object.keys(risposte).length > 0 || firmaPaziente !== "" || firmaOperatore !== "";
    if (!qualcosaDaSalvare) return;
    const t = setTimeout(() => { void salvaRef.current(); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, risposte, firmaPaziente, firmaOperatore, open, patient?.id, loading]);

  /** Apre una valutazione precedente al posto di quella corrente. */
  const apriStorica = async (id: string) => {
    if (id === valutazioneId) return;
    pronto.current = false;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("coop_valutazioni").select("id, dati").eq("id", id).single();
      if (error) throw new Error(error.message);
      const d = ((data as { dati?: Record<string, unknown> })?.dati || {}) as
        Partial<FormState> & { risposte?: Risposte; firma_paziente?: string; firma_operatore?: string };
      setForm(f => ({
        ...f,
        ...Object.fromEntries(
          (Object.keys(EMPTY) as Array<keyof FormState>)
            .filter(k => d[k] !== undefined)
            .map(k => [k, d[k]])
        ),
      } as FormState));
      setRisposte(d.risposte || {});
      setFirmaPaziente(d.firma_paziente || "");
      setFirmaOperatore(d.firma_operatore || "");
      setValutazioneId(id);
      setTab("anagrafica");
      flash("ok", "Valutazione precedente aperta.");
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Impossibile aprire la valutazione");
    } finally {
      setLoading(false);
      setTimeout(() => { pronto.current = true; }, 400);
    }
  };

  /** `originale` = il modulo cartaceo della cooperativa compilato;
      altrimenti il riepilogo sintetico ricomposto. */
  const makePdf = async (originale = true): Promise<File | null> => {
    setBusyPdf(true);
    try {
      await save();
      const d = cartellaData();
      const blob = originale ? await compilaModuloOriginale(d) : await buildCartellaPdf(d);
      const nome = cartellaFileName(d);
      return new File([blob], originale ? nome : nome.replace(".pdf", "_riepilogo.pdf"), { type: "application/pdf" });
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Errore generazione PDF");
      return null;
    } finally {
      setBusyPdf(false);
    }
  };

  /** Apre il PDF senza far perdere la pagina. Su iPad passa dal foglio di
      condivisione di sistema (si stampa, si salva in File, si apre in
      Anteprima) perché aprire una scheda dopo una generazione asincrona
      veniva bloccato da Safari e restava un about:blank vuoto. */
  const downloadPdf = async (originale = true) => {
    const file = await makePdf(originale);
    if (!file) return;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: file.name });
        return;
      }
    } catch {
      // condivisione annullata: si scarica normalmente
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  /** Invio di un qualsiasi PDF: condivisione nativa se c'è (l'allegato
      entra dentro WhatsApp), altrimenti download + chat sul numero fisso. */
  const inviaFile = async (file: File, testo: string) => {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: file.name, text: testo });
        return;
      }
    } catch {
      // condivisione annullata dall'utente: si prosegue col fallback
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = file.name; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(testo)}`, "_blank", "noopener");
    flash("ok", "PDF scaricato: allegalo nella chat che si è aperta.");
  };

  const testoInvio = () =>
    `Valutazione ${form.cognome} ${form.nome} — ${form.data_valutazione}\n` +
    `ADL ${adl}/6 · IADL ${iadl}/8 · MMSE ${mmse}/30 · Tinetti ${tTot}/28 (rischio ${risk.label.toLowerCase()})`;

  const sendWhatsApp = async () => {
    const file = await makePdf();
    if (!file) return;
    await inviaFile(file, testoInvio());
  };

  if (!open || !patient) return null;

  const tabDone: Record<Tab, boolean> = {
    anagrafica: Boolean(form.cognome && form.nome && form.data_valutazione),
    adl: missingCount(ADL, risposte) === 0 && missingCount(IADL, risposte) === 0,
    mmse: mmseMissing(risposte) === 0,
    tinetti: missingCount(TINETTI_EQ, risposte) === 0 && missingCount(TINETTI_AND, risposte) === 0,
    firme: Boolean(firmaPaziente),
    cartacea: false,   // sempre facoltativa: nessuna spunta di completamento
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 1200,
      display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
      padding: isMobile ? 0 : 18,
    }}>
      <div style={{
        background: T.panelSoft, width: "100%", maxWidth: 880,
        height: isMobile ? "94vh" : "92vh",
        borderRadius: isMobile ? "18px 18px 0 0" : 18,
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* ── Testata ── */}
        <div style={{ background: "#fff", borderBottom: `1px solid ${T.borderSoft}`, padding: "14px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 900, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Cartella di valutazione
              </div>
              <div style={{ fontSize: 12, color: T.label, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {patient.cognome} {patient.nome}
                {saving
                  ? <span style={{ color: T.tealDark, fontWeight: 800 }}> · salvataggio…</span>
                  : salvatoAlle
                    ? <span style={{ color: T.green, fontWeight: 800 }}> · salvata alle {salvatoAlle}</span>
                    : null}
              </div>
            </div>
            <button onClick={onClose} style={{
              border: `1px solid ${T.border}`, background: "#fff", borderRadius: 9,
              width: 34, height: 34, cursor: "pointer", fontSize: 15, fontWeight: 800, color: T.mutedLight, lineHeight: 1,
            }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit",
                  padding: "9px 12px 11px", whiteSpace: "nowrap",
                  fontSize: 13, fontWeight: active ? 900 : 600,
                  color: active ? T.tealDark : T.mutedLight,
                  borderBottom: `2.5px solid ${active ? T.teal : "transparent"}`,
                }}>
                  {t.label}
                  {tabDone[t.id] && <span style={{ color: T.green, marginLeft: 5, fontWeight: 900 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {msg && (
          <div style={{
            padding: "9px 18px", fontSize: 12.5, fontWeight: 700,
            background: msg.kind === "ok" ? "#f0fdf4" : "#fef2f2",
            color: msg.kind === "ok" ? T.green : T.red,
            borderBottom: `1px solid ${T.borderSoft}`,
          }}>{msg.text}</div>
        )}

        {/* ── Corpo ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 22px", WebkitOverflowScrolling: "touch" }}>
          {loading && <div style={{ color: T.label, fontSize: 13, padding: 20, textAlign: "center" }}>Caricamento…</div>}

          {/* ═══ ANAGRAFICA E CONSENSI ═══ */}
          {!loading && tab === "anagrafica" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                background: "#f0fdfa", border: `1px solid ${T.teal}`, borderRadius: 12, padding: "10px 13px",
              }}>
                <span style={{ fontSize: 12.5, color: T.muted, fontWeight: 600, flex: 1, lineHeight: 1.5 }}>
                  Precompilata dall&apos;anagrafica PAI del paziente. Luogo di nascita e codice fiscale
                  vengono ereditati dalla valutazione precedente, se ce n&apos;è una.
                </span>
                <button type="button"
                  onClick={() => setForm(f => ({
                    ...datiDaAnagrafica(patient, operatoreDefault || nomeOperatore),
                    luogo_nascita: f.luogo_nascita, codice_fiscale: f.codice_fiscale,
                    tutore_nome: f.tutore_nome, tutore_cf: f.tutore_cf,
                    tutore_nascita: f.tutore_nascita, tutore_qualita: f.tutore_qualita,
                    operatore_qualifica: f.operatore_qualifica,
                  }))}
                  style={{
                    border: `1px solid ${T.teal}`, background: "#fff", color: T.tealDark,
                    borderRadius: 9, padding: "8px 13px", fontSize: 12.5, fontWeight: 800,
                    cursor: "pointer", flexShrink: 0,
                  }}>↻ Ricarica</button>
              </div>

              {storico.length > 0 && (
                <Card title="Valutazioni di questo paziente"
                  hint="Quella in cima è la più recente. Toccane una per rivederla o modificarla; con «Nuova» ne cominci un'altra senza toccare queste.">
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {storico.map(v => {
                      const corrente = v.id === valutazioneId;
                      return (
                        <button key={v.id} type="button" onClick={() => void apriStorica(v.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                            border: `1.5px solid ${corrente ? T.teal : T.borderSoft}`,
                            background: corrente ? "rgba(13,148,136,0.05)" : "#fff",
                            borderRadius: 11, padding: "10px 12px", cursor: corrente ? "default" : "pointer",
                            fontFamily: "inherit", textAlign: "left", width: "100%",
                          }}>
                          <span style={{ fontSize: 13, fontWeight: 900, color: T.text, minWidth: 88 }}>
                            {v.data_valutazione ? v.data_valutazione.split("-").reverse().join("/") : "—"}
                          </span>
                          <span style={{ flex: 1, fontSize: 11.5, color: T.mutedLight, fontWeight: 700 }}>
                            ADL {v.adl_score ?? "—"}/6 · IADL {v.iadl_score ?? "—"}/8 · MMSE {v.mmse_score ?? "—"}/30 · Tinetti {v.tinetti_tot ?? "—"}/28
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: corrente ? T.tealDark : T.teal, flexShrink: 0 }}>
                            {corrente ? "in modifica" : "apri ›"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              )}

              <Card title="Assistito">
                <Row>
                  <Field label="Cognome" value={form.cognome} onChange={set("cognome")} />
                  <Field label="Nome" value={form.nome} onChange={set("nome")} />
                </Row>
                <Row>
                  <Field label="Data di nascita" value={form.data_nascita} onChange={set("data_nascita")} type="date" />
                  <Field label="Luogo di nascita" value={form.luogo_nascita} onChange={set("luogo_nascita")} />
                </Row>
                <Row>
                  <Field label="Codice fiscale" value={form.codice_fiscale} onChange={v => set("codice_fiscale")(v.toUpperCase())} />
                  <Field label="Residenza" value={form.residenza} onChange={set("residenza")} />
                </Row>
                <Row>
                  <Field label="Data valutazione" value={form.data_valutazione} onChange={set("data_valutazione")} type="date" />
                  <Field label="Attivazione PAI" value={form.attivazione_pai} onChange={set("attivazione_pai")} type="date" />
                </Row>
              </Card>

              <Card title="Tutore o familiare delegato" hint="Da compilare solo se il consenso è prestato da un familiare o tutore legale.">
                <Row>
                  <Field label="Nome e cognome" value={form.tutore_nome} onChange={set("tutore_nome")} />
                  <Field label="In qualità di" value={form.tutore_qualita} onChange={set("tutore_qualita")} placeholder="assistito / familiare / delegato" />
                </Row>
                <Row>
                  <Field label="Data di nascita" value={form.tutore_nascita} onChange={set("tutore_nascita")} type="date" />
                  <Field label="Codice fiscale" value={form.tutore_cf} onChange={v => set("tutore_cf")(v.toUpperCase())} />
                  <Field label="Telefono" value={form.tutore_tel} onChange={set("tutore_tel")} type="tel" />
                </Row>
              </Card>

              <Card title="Consenso informato">
                <Row>
                  <Field label="Trattamento proposto" value={form.trattamento} onChange={set("trattamento")} placeholder="es. FKT" wide />
                </Row>
                <Row>
                  <Field label="Operatore che informa" value={form.operatore_nome} onChange={set("operatore_nome")} />
                  <Field label="Qualifica" value={form.operatore_qualifica} onChange={set("operatore_qualifica")} placeholder="es. FKT" />
                </Row>
              </Card>

              <Card title="Consensi GDPR 2016/679">
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <CheckRow checked={form.consenso1} onChange={set("consenso1")}
                    title="Consenso n° 1 — attività medico-sanitarie"
                    text="Presa visione dell'informativa, autorizzo al trattamento dei miei dati ai fini dello svolgimento delle attività mediche e socio-sanitarie." />
                  <CheckRow checked={form.consenso2} onChange={set("consenso2")}
                    title="Consenso n° 2 — genitore o tutore legale"
                    text="In qualità di genitore o tutore, presto il consenso al trattamento dei dati dell'utente ai fini dello svolgimento delle attività mediche e socio-sanitarie." />
                  <CheckRow checked={form.consenso3} onChange={set("consenso3")}
                    title="Consenso n° 3 — comunicazioni e campagne"
                    text="Autorizzo al trattamento dei miei dati per ricevere comunicazioni relative a campagne di informazione e promozione sul territorio." />
                  <CheckRow checked={form.responsabilita} onChange={set("responsabilita")}
                    title="Dichiarazione di assunzione di responsabilità"
                    text="Nessun altro operatore sanitario interviene nel trattamento previsto dal PAI; sollevo la Cooperativa da responsabilità per complicanze derivanti dall'intervento di operatori esterni, impegnandomi a segnalarne tempestivamente la presenza." />
                </div>
              </Card>
            </div>
          )}

          {/* ═══ ADL / IADL ═══ */}
          {!loading && tab === "adl" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <ScoreBar label="ADL" score={adl} max={6} note={autonomiaLabel(adl, 6)} color={T.teal} missing={missingCount(ADL, risposte)} />
                <Card title={ADL.title} hint={ADL.subtitle}>
                  {ADL.items.map(it => <ScaleQuestion key={it.key} item={it} risposte={risposte} onPick={pick} />)}
                </Card>
              </div>
              <div>
                <ScoreBar label="IADL" score={iadl} max={8} note={autonomiaLabel(iadl, 8)} color={T.teal} missing={missingCount(IADL, risposte)} />
                <Card title={IADL.title} hint={IADL.subtitle}>
                  {IADL.items.map(it => <ScaleQuestion key={it.key} item={it} risposte={risposte} onPick={pick} />)}
                </Card>
              </div>
            </div>
          )}

          {/* ═══ MMSE ═══ */}
          {!loading && tab === "mmse" && (
            <div>
              <ScoreBar label="MMSE" score={mmse} max={MMSE_MAX} note={mmL.label} color={mmL.color} missing={mmseMissing(risposte)} />
              <Card title="Mini-Mental State Examination" hint="Tocca il punteggio ottenuto in ciascuna prova.">
                {MMSE_ITEMS.map(it => {
                  const v = risposte[it.key];
                  return (
                    <div key={it.key} style={{ padding: "13px 0", borderBottom: `1px solid ${T.borderSoft}` }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text }}>{it.title}</div>
                      {it.hint && <div style={{ fontSize: 11.5, color: T.label, marginTop: 2, lineHeight: 1.4 }}>{it.hint}</div>}
                      <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
                        {Array.from({ length: it.max + 1 }, (_, n) => {
                          const active = v === n;
                          return (
                            <button key={n} type="button" onClick={() => pickMmse(it.key, n)} style={{
                              minWidth: 46, padding: "10px 0", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                              border: `1.5px solid ${active ? T.blue : T.border}`,
                              background: active ? "rgba(37,99,235,0.06)" : "#fff",
                              fontSize: 15, fontWeight: active ? 900 : 700,
                              color: active ? T.blue : T.mutedLight,
                            }}>{n}</button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div style={{ paddingTop: 14 }}>
                  <Row>
                    <Field label="Punteggio aggiustato (età e scolarità)" value={form.mmse_aggiustato} onChange={set("mmse_aggiustato")} placeholder="es. 24,3" />
                  </Row>
                  <div style={{ fontSize: 11.5, color: T.label, marginTop: 7, lineHeight: 1.5 }}>
                    Il grezzo è calcolato automaticamente. L&apos;aggiustato dipende dai coefficienti per età e scolarità:
                    va inserito a mano perché il modulo cartaceo non riporta la tabella di correzione.
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ═══ TINETTI ═══ */}
          {!loading && tab === "tinetti" && (
            <div>
              <ScoreBar label="Tinetti totale" score={tTot} max={28} note={`Rischio cadute: ${risk.label}`} color={risk.color}
                missing={missingCount(TINETTI_EQ, risposte) + missingCount(TINETTI_AND, risposte)} />
              <div style={{ display: "flex", gap: 9, marginBottom: 12, flexWrap: "wrap" }}>
                <MiniScore label="Equilibrio" score={tEq} max={16} />
                <MiniScore label="Andatura" score={tAnd} max={12} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <Card title="Equilibrio" hint="Totale 16 punti.">
                  {TINETTI_EQ.items.map(it => <ScaleQuestion key={it.key} item={it} risposte={risposte} onPick={pick} />)}
                </Card>
                <Card title="Andatura" hint="Totale 12 punti.">
                  {TINETTI_AND.items.map(it => <ScaleQuestion key={it.key} item={it} risposte={risposte} onPick={pick} />)}
                </Card>
                <div style={{ fontSize: 12, color: T.mutedLight, lineHeight: 1.6, padding: "0 2px" }}>
                  Soglie del modulo: ≤ 18 rischio di cadute <b>alto</b> · 19-24 <b>medio</b> · ≥ 25 <b>basso</b>.
                </div>
              </div>
            </div>
          )}

          {/* ═══ FIRME E INVIO ═══ */}
          {!loading && tab === "firme" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Card title="Firma del paziente o del tutore"
                hint="Si firma una volta sola: la firma viene riportata sul consenso informato, sui consensi GDPR e sulla dichiarazione di responsabilità.">
                <SignaturePad value={firmaPaziente} onChange={setFirmaPaziente} label="Firma paziente / tutore" />
              </Card>
              <Card title="Firma dell'operatore">
                <SignaturePad value={firmaOperatore} onChange={setFirmaOperatore} label="Firma operatore" />
              </Card>
              <Card title="Note">
                <textarea
                  value={form.note} onChange={e => set("note")(e.target.value)}
                  placeholder="Osservazioni sulla valutazione, obiettivi, indicazioni…"
                  rows={4}
                  style={{
                    width: "100%", boxSizing: "border-box", resize: "vertical",
                    border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "11px 12px",
                    fontSize: 14.5, color: T.text, fontFamily: "inherit", outline: "none", lineHeight: 1.5,
                  }}
                />
              </Card>
              <Card title="Riepilogo punteggi">
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  <MiniScore label="ADL" score={adl} max={6} />
                  <MiniScore label="IADL" score={iadl} max={8} />
                  <MiniScore label="MMSE" score={mmse} max={30} />
                  <MiniScore label="Tinetti" score={tTot} max={28} color={risk.color} note={risk.label} />
                </div>
              </Card>
              <div style={{ fontSize: 12, color: T.mutedLight, lineHeight: 1.6 }}>
                <b>Modulo</b> compila il documento originale della cooperativa — loghi, impaginazione e testi identici
                al cartaceo — con risposte evidenziate, punteggi e firme al loro posto.
                <b> Riepilogo</b> produce invece una sintesi con le note, utile per l&apos;archivio interno.
                L&apos;invio WhatsApp usa il modulo originale ed è preimpostato su {WHATSAPP_LABEL}.
              </div>
            </div>
          )}

          {/* ═══ CARTELLA CARTACEA ═══ */}
          {!loading && tab === "cartacea" && (
            <AllegatiCartella
              studioId={studioId}
              patientId={patient.id}
              valutazioneId={valutazioneId}
              nomePaziente={`${patient.cognome} ${patient.nome}`}
              onWhatsApp={f => void inviaFile(f, `Cartella ${form.cognome} ${form.nome}`)}
            />
          )}
        </div>

        {/* ── Barra azioni ── */}
        <div style={{
          display: "flex", gap: 9, padding: "11px 16px",
          borderTop: `1px solid ${T.borderSoft}`, background: "#fff", flexWrap: "wrap",
        }}>
          <button onClick={() => void save()} disabled={saving} style={btnStyle("ghost", saving)}>
            {saving ? "Salvo…" : "Salva"}
          </button>
          <button onClick={() => void nuovaValutazione()} disabled={saving}
            title="Archivia questa e comincia una valutazione nuova"
            style={btnStyle("ghost", saving)}>Nuova</button>
          <button onClick={() => void downloadPdf(true)} disabled={busyPdf} style={btnStyle("ghost", busyPdf)}>
            {busyPdf ? "Genero…" : "📄 Modulo"}
          </button>
          <button onClick={() => void downloadPdf(false)} disabled={busyPdf}
            title="Riepilogo sintetico con punteggi e note (non è il modulo della cooperativa)"
            style={btnStyle("ghost", busyPdf)}>
            Riepilogo
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={btnStyle("ghost")}>Chiudi</button>
          <button onClick={() => void sendWhatsApp()} disabled={busyPdf} style={btnStyle("wa", busyPdf)}>
            {busyPdf ? "Preparo…" : "Invia WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pezzi di layout ──────────────────────────────────────────────────

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 14, padding: "15px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: T.text, marginBottom: hint ? 3 : 11 }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: T.label, marginBottom: 11, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 11 }}>{children}</div>;
}

function MiniScore({ label, score, max, color = T.teal, note }: {
  label: string; score: number; max: number; color?: string; note?: string;
}) {
  return (
    <div style={{
      flex: "1 1 120px", border: `1px solid ${T.borderSoft}`, borderRadius: 11,
      padding: "10px 12px", background: "#fff",
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.label, letterSpacing: .4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color, marginTop: 2 }}>
        {score}<span style={{ fontSize: 12, color: T.label }}> / {max}</span>
      </div>
      {note && <div style={{ fontSize: 11, fontWeight: 800, color, marginTop: 1 }}>{note}</div>}
    </div>
  );
}

function btnStyle(kind: "ghost" | "wa", busy?: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: 10, padding: "11px 16px", fontSize: 13.5, fontWeight: 800,
    cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? .6 : 1,
  };
  if (kind === "wa") return { ...base, border: "none", background: "#25D366", color: "#0b3d1f" };
  return { ...base, border: `1px solid ${T.border}`, background: "#fff", color: T.muted };
}
