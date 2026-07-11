"use client";

// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/domicili/components/PaiPatientModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Nuovo/modifica paziente PAI — sezione Domicili Cooperative.
//
// FLUSSO NUOVO PAZIENTE (2 strade):
//   📷 Da foto  — scatta/carica la foto del Modulo PAI Operatori,
//                 compressione lato client (max 1600px, JPEG 85%, come
//                 Seduta da foto), /api/domicili/pai-foto estrae i campi,
//                 la scheda si precompila e resta EDITABILE prima del
//                 salvataggio. La foto non viene salvata da nessuna parte.
//   ✏️ Manuale  — stessa identica scheda, vuota.
//
// PIANIFICAZIONE: giorni fissi settimanali (LUN–SAB) con orario opzionale
// per giorno. Al salvataggio gli accessi vengono generati fino a scadenza
// PAI o esaurimento del tot_accessi (src/lib/domicili/types.ts).
// In modifica, se cambia la pianificazione vengono rigenerati SOLO gli
// accessi futuri ancora "pianificato": i fatti/saltati restano storici.
//
// ISOLAMENTO: scrive solo su coop_patients / coop_accesses (mig. 055).
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import {
  Cooperative, CoopPatient, CoopPatientStato, GiornoOrario,
  DOW_LABELS, generateAccessDates, localISO, parseISODate, fmtIT, normTime,
} from "@/src/lib/domicili/types";

const T = {
  teal: "#0d9488", tealDark: "#0f766e", blue: "#2563eb", text: "#0f172a",
  muted: "#475569", label: "#64748b", border: "#e2e8f0", borderInput: "#cbd5e1", soft: "#f8fafc", red: "#dc2626",
  amber: "#b45309", amberBg: "#fffbeb", green: "#16a34a",
};

// Stili condivisi del form (a livello modulo: Field NON va ridefinito nel
// render, altrimenti gli input perdono il focus a ogni carattere digitato)
const inp: React.CSSProperties = {
  width: "100%", border: `1px solid #cbd5e1`, borderRadius: 9,
  padding: "9px 11px", fontSize: 14, color: T.text, background: "#fff", outline: "none",
};
const lab: React.CSSProperties = {
  display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: .5,
  textTransform: "uppercase", color: "#64748b", marginBottom: 4,
};

function Field(p: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div style={{ gridColumn: p.span2 ? "1 / -1" : undefined }}>
      <label style={lab}>{p.label}</label>
      {p.children}
    </div>
  );
}

// ─── Compressione immagine lato client (stesso schema di Seduta da foto) ──

async function fileToCompressedBase64(
  file: File,
): Promise<{ base64: string; mediaType: string }> {
  const dataURL: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lettura file fallita"));
    reader.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Immagine non valida"));
    el.src = dataURL;
  });

  const MAX = 1600;
  let { width, height } = img;
  if (width > MAX || height > MAX) {
    const scale = MAX / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.drawImage(img, 0, 0, width, height);

  const jpeg = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: jpeg.split(",")[1] || "", mediaType: "image/jpeg" };
}

// ─── Tipi form ────────────────────────────────────────────────────────

type PaiExtraction = {
  cooperativa: string | null;
  data_arrivo: string | null;
  data_attivazione: string | null;
  data_scadenza: string | null;
  cognome: string | null;
  nome: string | null;
  data_nascita: string | null;
  residenza: string | null;
  citta: string | null;
  distretto: string | null;
  recapiti: string | null;
  diagnosi: string | null;
  prestazione: string | null;
  frequenza_settimanale: number | null;
  tot_accessi: number | null;
  operatori: string | null;
  incerti: string[];
};

type FormState = {
  cooperative_id: string;
  cognome: string; nome: string; data_nascita: string;
  residenza: string; citta: string; distretto: string;
  recapiti: string; diagnosi: string;
  data_arrivo: string; data_attivazione: string; data_scadenza: string;
  prestazione: string; frequenza_settimanale: string; tot_accessi: string;
  operatori: string; note: string; stato: CoopPatientStato;
};

const EMPTY_FORM: FormState = {
  cooperative_id: "",
  cognome: "", nome: "", data_nascita: "",
  residenza: "", citta: "", distretto: "",
  recapiti: "", diagnosi: "",
  data_arrivo: "", data_attivazione: "", data_scadenza: "",
  prestazione: "Fisioterapia", frequenza_settimanale: "", tot_accessi: "",
  operatori: "", note: "", stato: "attivo",
};

type Props = {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
  studioId: string;
  cooperatives: Cooperative[];
  /** Cooperativa preselezionata (tab attivo della pagina). */
  defaultCooperativeId?: string | null;
  /** Se presente → modifica; altrimenti nuovo paziente. */
  patient?: CoopPatient | null;
  /** Accessi esistenti del paziente (per rigenerazione e budget). */
  patientAccesses?: { data: string; stato: string }[];
  /** true → apre direttamente il flusso foto. */
  startWithPhoto?: boolean;
  onSaved: () => void;
};

// ─── Componente ───────────────────────────────────────────────────────

export default function PaiPatientModal({
  open, onClose, isMobile, studioId, cooperatives, defaultCooperativeId,
  patient, patientAccesses, startWithPhoto, onSaved,
}: Props) {
  const isEdit = !!patient;

  const [step, setStep] = useState<"scelta" | "loading" | "form" | "batch">("scelta");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [giorni, setGiorni] = useState<Map<number, string>>(new Map()); // dow → orario ("" = senza)
  const [incerti, setIncerti] = useState<string[]>([]);
  const [fromPhoto, setFromPhoto] = useState(false);
  const [startMode, setStartMode] = useState<"oggi" | "attivazione">("oggi");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Snapshot pianificazione originale (per capire se rigenerare in edit)
  const originalPlanRef = useRef<string>("");

  // Reset all'apertura
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setIncerti([]);
    setFromPhoto(false);

    // startMode iniziale coerente col paziente: se ha già accessi passati
    // "fatto" (quindi pianificazione retroattiva già applicata), riseleziona
    // "retroattivo"; altrimenti "da oggi".
    // Modalità inizio: ora è un dato REALE del paziente (mig. 057), non più indovinato.
    const savedRetro = patient?.pianificazione_retroattiva === true;
    setStartMode(savedRetro ? "attivazione" : "oggi");

    if (patient) {
      setForm({
        cooperative_id: patient.cooperative_id,
        cognome: patient.cognome, nome: patient.nome,
        data_nascita: patient.data_nascita || "",
        residenza: patient.residenza || "", citta: patient.citta || "",
        distretto: patient.distretto || "", recapiti: patient.recapiti || "",
        diagnosi: patient.diagnosi || "",
        data_arrivo: patient.data_arrivo || "",
        data_attivazione: patient.data_attivazione || "",
        data_scadenza: patient.data_scadenza || "",
        prestazione: patient.prestazione || "Fisioterapia",
        frequenza_settimanale: patient.frequenza_settimanale != null ? String(patient.frequenza_settimanale) : "",
        tot_accessi: patient.tot_accessi != null ? String(patient.tot_accessi) : "",
        operatori: patient.operatori || "", note: patient.note || "",
        stato: patient.stato,
      });
      const g = new Map<number, string>();
      (patient.giorni_orari || []).forEach(x => g.set(x.dow, normTime(x.orario) || ""));
      setGiorni(g);
      originalPlanRef.current = planSignature(patient.giorni_orari || [], patient.data_scadenza, patient.tot_accessi) + `|${savedRetro ? "attivazione" : "oggi"}|${patient.data_attivazione || ""}`;
      setStep("form");
    } else {
      setForm({ ...EMPTY_FORM, cooperative_id: defaultCooperativeId || cooperatives[0]?.id || "" });
      setGiorni(new Map());
      originalPlanRef.current = "";
      if (startWithPhoto) {
        setStep("scelta");
        // apre subito il file picker (scatto su mobile)
        setTimeout(() => fileRef.current?.click(), 150);
      } else {
        setStep("scelta");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const [multiProgress, setMultiProgress] = useState<{ done: number; total: number } | null>(null);

  // Flusso BATCH: più PAI insieme → lista (cognome, nome, data inizio) → salva tutti
  type BatchRow = { extraction: PaiExtraction; cognome: string; nome: string; dataInizio: string };
  const [batch, setBatch] = useState<BatchRow[] | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchDone, setBatchDone] = useState(0);

  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));

  // ─── Foto → estrazione AI ───────────────────────────────────────────

  const onPickPhotos = async (files: FileList | File[] | null) => {
    const arr = files ? Array.from(files) : [];
    if (arr.length === 0) return;
    setError(null);
    setStep("loading");
    setMultiProgress({ done: 0, total: arr.length });
    try {
      const results: PaiExtraction[] = [];
      for (let i = 0; i < arr.length; i++) {
        const { base64, mediaType } = await fileToCompressedBase64(arr[i]);
        const res = await fetch("/api/domicili/pai-foto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: base64, image_media_type: mediaType }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Errore lettura pagina ${i + 1}`);
        results.push(data.result as PaiExtraction);
        setMultiProgress({ done: i + 1, total: arr.length });
      }
      if (results.length === 1) {
        applyExtraction(results[0]);
        setFromPhoto(true);
        setStep("form");
      } else {
        // Più PAI insieme: una riga per paziente, con data inizio modificabile
        const today = localISO(new Date());
        setBatch(results.map(r => ({
          extraction: r,
          cognome: r.cognome || "",
          nome: r.nome || "",
          dataInizio: r.data_attivazione || today,
        })));
        setStep("batch");
      }
    } catch (e: any) {
      setError(e?.message || "Errore lettura modulo");
      setStep("scelta");
    } finally {
      setMultiProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Fonde più estrazioni: mantiene il primo valore non vuoto per ogni campo,
  // concatena diagnosi/operatori se compaiono su pagine diverse.
  const mergeExtractions = (list: PaiExtraction[]): PaiExtraction => {
    const out: any = {};
    const incerti = new Set<string>();
    const keys: (keyof PaiExtraction)[] = [
      "cooperativa","cognome","nome","data_nascita","residenza","citta","distretto",
      "recapiti","diagnosi","data_arrivo","data_attivazione",
      "prestazione","frequenza_settimanale","tot_accessi","operatori",
    ];
    for (const r of list) {
      for (const k of keys) {
        const v = (r as any)[k];
        if (v == null || v === "") continue;
        if (out[k] == null || out[k] === "") { out[k] = v; }
        else if ((k === "diagnosi" || k === "operatori") && String(out[k]) !== String(v) && !String(out[k]).includes(String(v))) {
          out[k] = `${out[k]} · ${v}`; // pagine diverse → concatena
        }
      }
      (r.incerti || []).forEach(i => incerti.add(i));
    }
    out.incerti = Array.from(incerti);
    return out as PaiExtraction;
  };

  const applyExtraction = (r: PaiExtraction) => {
    // match cooperativa per nome (case-insensitive, contains)
    let coopId = form.cooperative_id || defaultCooperativeId || "";
    if (r.cooperativa) {
      const found = cooperatives.find(c =>
        c.nome.toLowerCase().includes(r.cooperativa!.toLowerCase()) ||
        r.cooperativa!.toLowerCase().includes(c.nome.toLowerCase())
      );
      if (found) coopId = found.id;
    }
    setForm(f => ({
      ...f,
      cooperative_id: coopId || f.cooperative_id,
      cognome: r.cognome || "", nome: r.nome || "",
      data_nascita: r.data_nascita || "",
      residenza: r.residenza || "", citta: r.citta || "",
      distretto: r.distretto || "", recapiti: r.recapiti || "",
      diagnosi: r.diagnosi || "",
      data_arrivo: r.data_arrivo || "", data_attivazione: r.data_attivazione || "",
      // data_scadenza: NON letta dalla foto (impostazione manuale)
      prestazione: r.prestazione || "Fisioterapia",
      frequenza_settimanale: r.frequenza_settimanale != null ? String(r.frequenza_settimanale) : "",
      tot_accessi: r.tot_accessi != null ? String(r.tot_accessi) : "",
      operatori: r.operatori || "",
    }));
    setIncerti(r.incerti || []);
  };

  // ─── Giorni fissi ───────────────────────────────────────────────────

  const toggleDow = (dow: number) => {
    setGiorni(prev => {
      const next = new Map(prev);
      if (next.has(dow)) next.delete(dow);
      else next.set(dow, "");
      return next;
    });
  };
  const setDowTime = (dow: number, time: string) => {
    setGiorni(prev => {
      const next = new Map(prev);
      next.set(dow, time);
      return next;
    });
  };

  const giorniArray: GiornoOrario[] = useMemo(
    () => Array.from(giorni.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dow, orario]) => ({ dow, orario: orario || null })),
    [giorni]
  );

  const freqNum = parseInt(form.frequenza_settimanale, 10);
  const freqMatch = Number.isFinite(freqNum) && freqNum > 0
    ? giorni.size === freqNum
    : null;

  // ─── Salvataggio ────────────────────────────────────────────────────

  const save = async () => {
    setError(null);
    if (!form.cooperative_id) { setError("Seleziona la cooperativa."); return; }
    if (!form.cognome.trim() || !form.nome.trim()) { setError("Cognome e nome sono obbligatori."); return; }

    setSaving(true);
    try {
      const payload = {
        studio_id: studioId,
        cooperative_id: form.cooperative_id,
        cognome: form.cognome.trim(),
        nome: form.nome.trim(),
        data_nascita: form.data_nascita || null,
        residenza: form.residenza.trim() || null,
        citta: form.citta.trim() || null,
        distretto: form.distretto.trim() || null,
        recapiti: form.recapiti.trim() || null,
        diagnosi: form.diagnosi.trim() || null,
        data_arrivo: form.data_arrivo || null,
        data_attivazione: form.data_attivazione || null,
        data_scadenza: form.data_scadenza || null,
        prestazione: form.prestazione.trim() || "Fisioterapia",
        frequenza_settimanale: Number.isFinite(freqNum) && freqNum > 0 ? freqNum : null,
        tot_accessi: (() => { const n = parseInt(form.tot_accessi, 10); return Number.isFinite(n) && n > 0 ? n : null; })(),
        operatori: form.operatori.trim() || null,
        giorni_orari: giorniArray,
        note: form.note.trim() || null,
        stato: form.stato,
        pianificazione_retroattiva: startMode === "attivazione",
        updated_at: new Date().toISOString(),
      };

      // Retroattivo: parte dalla data di attivazione (crea anche i giorni passati)
      const fromDate = startMode === "attivazione" && payload.data_attivazione
        ? parseISODate(payload.data_attivazione)
        : undefined;

      let patientId = patient?.id || "";

      if (isEdit && patient) {
        const { error: upErr } = await supabase
          .from("coop_patients").update(payload).eq("id", patient.id);
        if (upErr) throw upErr;
        patientId = patient.id;

        // Rigenera se cambia la pianificazione OPPURE la modalità d'inizio
        // (da oggi ↔ retroattivo). La firma include ora startMode+attivazione.
        const newPlan = planSignature(giorniArray, payload.data_scadenza, payload.tot_accessi) + `|${startMode}|${payload.data_attivazione || ""}`;
        if (newPlan !== originalPlanRef.current && form.stato === "attivo") {
          const todayISO = localISO(new Date());
          if (startMode === "attivazione" && fromDate) {
            // Retroattivo: rifà TUTTA la pianificazione da capo (passati=fatto, futuri=pianificato).
            // Si cancellano solo gli accessi generati (pianificato + fatto), NON i "saltato" manuali.
            const { error: delErr } = await supabase
              .from("coop_accesses").delete()
              .eq("coop_patient_id", patientId)
              .in("stato", ["pianificato", "fatto"]);
            if (delErr) throw delErr;
            const keepSaltati = (patientAccesses || []).filter(a => a.stato === "saltato");
            const dates = generateAccessDates(
              { giorni_orari: giorniArray, data_attivazione: payload.data_attivazione, data_scadenza: payload.data_scadenza, tot_accessi: payload.tot_accessi },
              keepSaltati, fromDate,
            );
            if (dates.length > 0) {
              const rows = dates.map(d => ({ studio_id: studioId, coop_patient_id: patientId, data: d.data, orario: d.orario, stato: d.stato }));
              const { error: insErr } = await supabase.from("coop_accesses").insert(rows);
              if (insErr) throw insErr;
            }
          } else {
            // Da oggi: tocca solo i futuri "pianificato", lo storico (fatto) resta.
            const { error: delErr } = await supabase
              .from("coop_accesses").delete()
              .eq("coop_patient_id", patientId)
              .eq("stato", "pianificato")
              .gte("data", todayISO);
            if (delErr) throw delErr;
            const keep = (patientAccesses || []).filter(a => !(a.stato === "pianificato" && a.data >= todayISO));
            const dates = generateAccessDates(
              { giorni_orari: giorniArray, data_attivazione: payload.data_attivazione, data_scadenza: payload.data_scadenza, tot_accessi: payload.tot_accessi },
              keep, undefined,
            );
            if (dates.length > 0) {
              const rows = dates.map(d => ({ studio_id: studioId, coop_patient_id: patientId, data: d.data, orario: d.orario, stato: d.stato }));
              const { error: insErr } = await supabase.from("coop_accesses").insert(rows);
              if (insErr) throw insErr;
            }
          }
        }
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("coop_patients").insert(payload).select("id").single();
        if (insErr) throw insErr;
        patientId = inserted.id;

        const dates = generateAccessDates(
          { giorni_orari: giorniArray, data_attivazione: payload.data_attivazione, data_scadenza: payload.data_scadenza, tot_accessi: payload.tot_accessi },
          [],
          fromDate,
        );
        if (dates.length > 0) {
          const rows = dates.map(d => ({
            studio_id: studioId, coop_patient_id: patientId,
            data: d.data, orario: d.orario, stato: d.stato,
          }));
          const { error: accErr } = await supabase.from("coop_accesses").insert(rows);
          if (accErr) throw accErr;
        }
      }

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const saveBatch = async () => {
    if (!batch) return;
    // Cooperativa: usa quella estratta o, in mancanza, la default corrente
    setError(null);
    const validi = batch.filter(b => b.cognome.trim() && b.nome.trim());
    if (validi.length === 0) { setError("Nessun paziente valido da salvare."); return; }
    setBatchSaving(true);
    setBatchDone(0);
    try {
      for (let i = 0; i < batch.length; i++) {
        const b = batch[i];
        if (!b.cognome.trim() || !b.nome.trim()) { setBatchDone(i + 1); continue; }
        const r = b.extraction;
        // match cooperativa
        let coopId = defaultCooperativeId || "";
        if (r.cooperativa) {
          const found = cooperatives.find(c =>
            c.nome.toLowerCase().includes(r.cooperativa!.toLowerCase()) ||
            r.cooperativa!.toLowerCase().includes(c.nome.toLowerCase()));
          if (found) coopId = found.id;
        }
        const freq = r.frequenza_settimanale != null ? Number(r.frequenza_settimanale) : null;
        const totAcc = r.tot_accessi != null ? Number(r.tot_accessi) : null;
        const giorni_orari: any[] = []; // l'AI non estrae i giorni fissi: si impostano poi nella scheda paziente
        const payload: any = {
          studio_id: studioId, cooperative_id: coopId || null,
          cognome: b.cognome.trim(), nome: b.nome.trim(),
          data_nascita: r.data_nascita || null,
          residenza: r.residenza || null, citta: r.citta || null, distretto: r.distretto || null,
          recapiti: r.recapiti || null, diagnosi: r.diagnosi || null,
          data_arrivo: r.data_arrivo || null,
          data_attivazione: b.dataInizio || null,   // ← data inizio scelta (anche retroattiva)
          data_scadenza: r.data_scadenza || null,
          prestazione: r.prestazione || "Fisioterapia",
          frequenza_settimanale: Number.isFinite(freq!) && freq! > 0 ? freq : null,
          tot_accessi: Number.isFinite(totAcc!) && totAcc! > 0 ? totAcc : null,
          operatori: r.operatori || null,
          giorni_orari, note: null, stato: "attivo",
          pianificazione_retroattiva: !!(b.dataInizio && b.dataInizio < localISO(new Date())),
          updated_at: new Date().toISOString(),
        };
        const { data: ins, error: insErr } = await supabase
          .from("coop_patients").insert(payload).select("id").single();
        if (insErr) throw insErr;
        // accessi dalla data inizio (retroattiva inclusa)
        const fromDate = b.dataInizio ? parseISODate(b.dataInizio) : undefined;
        const dates = generateAccessDates(
          { giorni_orari, data_attivazione: payload.data_attivazione, data_scadenza: payload.data_scadenza, tot_accessi: payload.tot_accessi },
          [], fromDate,
        );
        if (dates.length > 0) {
          const rows = dates.map(d => ({ studio_id: studioId, coop_patient_id: ins.id, data: d.data, orario: d.orario, stato: d.stato }));
          const { error: accErr } = await supabase.from("coop_accesses").insert(rows);
          if (accErr) throw accErr;
        }
        setBatchDone(i + 1);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Errore durante il salvataggio multiplo");
      setBatchSaving(false);
    }
  };

  const deletePatient = async () => {
    if (!patient) return;
    const ok = window.confirm(
      `Eliminare ${patient.cognome} ${patient.nome} e tutti i suoi accessi?\nL'operazione non è reversibile.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      const { error: delErr } = await supabase.from("coop_patients").delete().eq("id", patient.id);
      if (delErr) throw delErr;
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Errore durante l'eliminazione");
      setSaving(false);
    }
  };

  if (!open) return null;

  // ─── Stili ──────────────────────────────────────────────────────────

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000,
    display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
    padding: isMobile ? 0 : 20,
  };
  const sheet: React.CSSProperties = isMobile
    ? { background: "#fff", color: T.text, width: "100%", maxHeight: "94vh", borderRadius: "18px 18px 0 0", display: "flex", flexDirection: "column", overflow: "hidden" }
    : { background: "#fff", color: T.text, width: 680, maxWidth: "96vw", maxHeight: "92vh", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(15,23,42,.25)" };

  const sec: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, letterSpacing: .8, textTransform: "uppercase",
    color: T.tealDark, margin: "16px 0 8px",
  };
  const btn = (variant: "pri" | "ghost" | "danger" = "ghost"): React.CSSProperties => ({
    borderRadius: 10, fontSize: 13.5, fontWeight: 700, padding: "11px 16px",
    border: `1px solid ${variant === "pri" ? T.teal : variant === "danger" ? "#fecaca" : T.border}`,
    background: variant === "pri" ? T.teal : variant === "danger" ? "#fef2f2" : "#fff",
    color: variant === "pri" ? "#fff" : variant === "danger" ? T.red : T.text,
    cursor: "pointer",
  });

  return (
    <div style={overlay}>
      <div style={sheet} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 16.5, fontWeight: 800, flex: 1 }}>
            {isEdit ? "Scheda paziente PAI" : "Nuovo paziente PAI"}
          </div>
          <button onClick={onClose} style={{ ...btn(), padding: "6px 12px" }}>✕</button>
        </div>

        {/* input file nascosto (scatto su mobile) */}
        <input
          ref={fileRef} type="file" accept="image/*" multiple
          style={{ display: "none" }}
          onChange={e => onPickPhotos(e.target.files)}
        />

        {/* ── STEP: scelta foto/manuale ── */}
        {step === "scelta" && (
          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            {error && <div style={{ background: "#fef2f2", color: T.red, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>{error}</div>}
            <button onClick={() => fileRef.current?.click()} style={{ ...btn("pri"), padding: "16px", fontSize: 15, display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
              Fotografa il Modulo PAI
            </button>
            <div style={{ textAlign: "center", fontSize: 12, color: T.muted }}>
              Puoi caricare <b>più pagine insieme</b> (modulo, diagnosi, piano accessi):<br />
              l'AI le legge tutte e unisce i dati. Le foto non vengono salvate.
            </div>
            <button onClick={() => setStep("form")} style={{ ...btn(), padding: "14px", fontSize: 14 }}>
              Inserimento manuale
            </button>
          </div>
        )}

        {/* ── STEP: loading ── */}
        {step === "loading" && (
          <div style={{ padding: "46px 22px", textAlign: "center" }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", margin: "0 auto 14px",
              border: "4px solid #ccfbf1", borderTopColor: T.teal, animation: "paiSpin 1s linear infinite",
            }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tealDark }}>
              {multiProgress && multiProgress.total > 1 ? `Lettura PAI ${multiProgress.done + 1} di ${multiProgress.total}…` : "Claude legge il modulo…"}
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Date PAI, anagrafica, prestazione, accessi</div>
            <style>{`@keyframes paiSpin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* ── STEP: batch (più PAI insieme) ── */}
        {step === "batch" && batch && (
          <>
            <div style={{ padding: "14px 18px 6px" }}>
              <div style={{ fontSize: 13, color: T.muted, fontWeight: 600, lineHeight: 1.5 }}>
                <b style={{ color: T.text }}>{batch.length} PAI letti.</b> Controlla nome e cognome e imposta la
                <b style={{ color: T.text }}> data d'inizio accessi</b> di ciascuno (puoi metterla anche nel passato: gli accessi verranno creati a ritroso). Poi salva tutti.
              </div>
              {error && <div style={{ marginTop: 10, background: "#fef2f2", color: T.red, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>{error}</div>}
            </div>
            <div style={{ padding: "6px 18px 14px", overflowY: "auto", flex: 1 }}>
              {batch.map((b, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                  border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8,
                  background: b.cognome.trim() && b.nome.trim() ? "#fff" : "#fef2f2",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.muted, width: 20, flexShrink: 0 }}>{i + 1}</span>
                  <input value={b.cognome} placeholder="Cognome"
                    onChange={e => setBatch(bs => bs!.map((x, j) => j === i ? { ...x, cognome: e.target.value } : x))}
                    style={{ flex: "1 1 120px", minWidth: 90, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text, background: "#fff" }} />
                  <input value={b.nome} placeholder="Nome"
                    onChange={e => setBatch(bs => bs!.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                    style={{ flex: "1 1 120px", minWidth: 90, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 13, fontWeight: 600, color: T.text, background: "#fff" }} />
                  <label style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: T.muted }}>dal</span>
                    <input type="date" value={b.dataInizio}
                      onChange={e => setBatch(bs => bs!.map((x, j) => j === i ? { ...x, dataInizio: e.target.value } : x))}
                      style={{ padding: "7px 8px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 12.5, fontWeight: 600, color: T.text, background: "#fff" }} />
                  </label>
                  <button onClick={() => setBatch(bs => bs!.filter((_, j) => j !== i))}
                    title="Togli dalla lista"
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: T.muted, fontSize: 16, flexShrink: 0, padding: "0 2px" }}>✕</button>
                </div>
              ))}
              {batch.length === 0 && <div style={{ textAlign: "center", color: T.muted, fontSize: 13, padding: 20 }}>Lista vuota.</div>}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 18px", borderTop: `1px solid ${T.border}`, background: "#fff" }}>
              {batchSaving && <span style={{ fontSize: 12, fontWeight: 700, color: T.tealDark }}>Salvo {batchDone}/{batch.length}…</span>}
              <div style={{ flex: 1 }} />
              <button onClick={onClose} disabled={batchSaving} style={btn()}>Annulla</button>
              <button onClick={saveBatch} disabled={batchSaving || batch.length === 0} style={{ ...btn("pri"), opacity: batchSaving ? .6 : 1 }}>
                {batchSaving ? "Salvo…" : `Salva ${batch.filter(b => b.cognome.trim() && b.nome.trim()).length} pazienti`}
              </button>
            </div>
          </>
        )}

        {/* ── STEP: form ── */}
        {step === "form" && (
          <>
            <div style={{ padding: "16px 18px", overflowY: "auto", flex: 1 }}>
              {error && <div style={{ background: "#fef2f2", color: T.red, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{error}</div>}

              {fromPhoto && (
                <div style={{ background: "#f0fdfa", border: `1px solid ${T.border}`, color: T.tealDark, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
                  ✓ Scheda precompilata dalla foto — controlla i campi prima di salvare.
                  {!isEdit && (
                    <button onClick={() => fileRef.current?.click()} style={{ marginLeft: 8, border: "none", background: "none", color: T.blue, fontWeight: 700, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>
                      Aggiungi o rifai pagine
                    </button>
                  )}
                </div>
              )}

              {incerti.length > 0 && (
                <div style={{ background: T.amberBg, border: `1px solid ${T.border}`, color: T.amber, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 12 }}>
                  <b>Letture incerte:</b> {incerti.join(" · ")}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "10px 12px" }}>

                <Field label="Cooperativa" span2>
                  <select value={form.cooperative_id} onChange={e => set("cooperative_id")(e.target.value)} style={inp}>
                    <option value="">— seleziona —</option>
                    {cooperatives.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </Field>
                {isEdit && (
                  <Field label="Stato" span2>
                    <select value={form.stato} onChange={e => set("stato")(e.target.value as CoopPatientStato)} style={inp}>
                      <option value="attivo">Attivo</option>
                      <option value="sospeso">Sospeso</option>
                      <option value="concluso">Concluso</option>
                    </select>
                  </Field>
                )}

                <div style={{ ...sec, gridColumn: "1 / -1", margin: "8px 0 0" }}>Date PAI</div>
                <Field label="Data arrivo"><input type="date" value={form.data_arrivo} onChange={e => set("data_arrivo")(e.target.value)} style={inp} /></Field>
                <Field label="Data attivazione"><input type="date" value={form.data_attivazione} onChange={e => set("data_attivazione")(e.target.value)} style={inp} /></Field>
                <Field label="Data scadenza"><input type="date" value={form.data_scadenza} onChange={e => set("data_scadenza")(e.target.value)} style={inp} /></Field>
                <div />

                <div style={{ ...sec, gridColumn: "1 / -1", margin: "8px 0 0" }}>Paziente</div>
                <Field label="Cognome *"><input value={form.cognome} onChange={e => set("cognome")(e.target.value)} style={inp} /></Field>
                <Field label="Nome *"><input value={form.nome} onChange={e => set("nome")(e.target.value)} style={inp} /></Field>
                <Field label="Nato/a il"><input type="date" value={form.data_nascita} onChange={e => set("data_nascita")(e.target.value)} style={inp} /></Field>
                <Field label="Recapiti"><input value={form.recapiti} onChange={e => set("recapiti")(e.target.value)} style={inp} placeholder="Telefono" /></Field>
                <Field label="Residenza" span2><input value={form.residenza} onChange={e => set("residenza")(e.target.value)} style={inp} placeholder="Via e civico" /></Field>
                <Field label="Città"><input value={form.citta} onChange={e => set("citta")(e.target.value)} style={inp} /></Field>
                <Field label="Distretto"><input value={form.distretto} onChange={e => set("distretto")(e.target.value)} style={inp} placeholder="es. D" /></Field>
                <Field label="Diagnosi" span2>
                  <input value={form.diagnosi} onChange={e => set("diagnosi")(e.target.value)} style={inp} />
                </Field>
                <Field label="Note" span2>
                  <input value={form.note} onChange={e => set("note")(e.target.value)} style={inp} placeholder="Es. citofono, piano, caregiver…" />
                </Field>

                <div style={{ ...sec, gridColumn: "1 / -1", margin: "8px 0 0" }}>Prestazione</div>
                <Field label="Tipo"><input value={form.prestazione} onChange={e => set("prestazione")(e.target.value)} style={inp} /></Field>
                <Field label="Frequenza / sett."><input type="number" min={1} max={7} value={form.frequenza_settimanale} onChange={e => set("frequenza_settimanale")(e.target.value)} style={inp} /></Field>
                <Field label="Tot. accessi"><input type="number" min={1} value={form.tot_accessi} onChange={e => set("tot_accessi")(e.target.value)} style={inp} /></Field>
                <Field label="Operatori"><input value={form.operatori} onChange={e => set("operatori")(e.target.value)} style={inp} placeholder="—" /></Field>

                <div style={{ ...sec, gridColumn: "1 / -1", margin: "8px 0 0" }}>Pianificazione — giorni fissi e orario</div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(6, 1fr)", gap: 8 }}>
                    {[1, 2, 3, 4, 5, 6].map(dow => {
                      const sel = giorni.has(dow);
                      return (
                        <div key={dow} style={{
                          border: `1px solid ${sel ? "#cbd5e1" : T.border}`,
                          background: sel ? "#f0fdfa" : T.soft,
                          borderRadius: 10, padding: "8px 8px 9px", textAlign: "center",
                        }}>
                          <button onClick={() => toggleDow(dow)} style={{
                            border: "none", background: "none", cursor: "pointer",
                            fontSize: 12, fontWeight: 800, color: sel ? T.tealDark : "#64748b",
                            width: "100%", padding: "2px 0",
                          }}>
                            {DOW_LABELS[dow]}
                          </button>
                          {sel && (
                            <input
                              type="time" value={giorni.get(dow) || ""}
                              onChange={e => setDowTime(dow, e.target.value)}
                              style={{ ...inp, marginTop: 6, padding: "5px 6px", fontSize: 12.5, textAlign: "center" }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{
                    marginTop: 8, fontSize: 12, fontWeight: 700,
                    color: freqMatch === false ? T.amber : freqMatch === true ? T.green : T.muted,
                  }}>
                    {giorni.size === 0
                      ? "Nessun giorno selezionato: il paziente non verrà messo in calendario (potrai farlo dopo)."
                      : freqMatch === true
                        ? `✓ ${giorni.size} giorni = frequenza ${form.frequenza_settimanale}/settimana. Gli accessi vengono generati fino a scadenza PAI o esaurimento del totale.`
                        : freqMatch === false
                          ? `⚠ ${giorni.size} giorni selezionati ma frequenza dal modulo = ${form.frequenza_settimanale}/settimana.`
                          : `${giorni.size} giorni selezionati. L'orario è opzionale.`}
                  </div>

                  {/* Inizio pianificazione: da oggi oppure retroattivo dalla data di attivazione */}
                  {((form.data_attivazione && form.data_attivazione < localISO(new Date())) || startMode === "attivazione") && giorni.size > 0 && (
                    <div style={{
                      marginTop: 10, background: T.soft, border: `1px solid ${T.border}`,
                      borderRadius: 10, padding: "10px 12px",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: "#64748b", marginBottom: 7 }}>
                        Inizio pianificazione
                      </div>
                      {([
                        { v: "oggi" as const, t: "Da oggi", d: "Crea solo gli accessi futuri." },
                        { v: "attivazione" as const, t: `Dalla data d'inizio — retroattivo`, d: "Crea anche i giorni già passati: verranno segnati \"fatto\" così il contatore scala da subito." },
                      ]).map(o => (
                        <label key={o.v} style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", padding: "5px 0" }}>
                          <input
                            type="radio" name="paiStartMode" checked={startMode === o.v}
                            onChange={() => setStartMode(o.v)}
                            style={{ marginTop: 2, accentColor: T.teal }}
                          />
                          <span style={{ flex: 1 }}>
                            <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.text }}>{o.t}</span>
                            <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.muted, lineHeight: 1.4 }}>{o.d}</span>
                            {o.v === "attivazione" && startMode === "attivazione" && (
                              <span style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: T.muted }}>Inizio accessi dal</span>
                                <input
                                  type="date" value={form.data_attivazione}
                                  max={localISO(new Date())}
                                  onChange={e => set("data_attivazione")(e.target.value)}
                                  style={{ padding: "6px 8px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 12.5, fontWeight: 700, color: T.text, background: "#fff" }}
                                />
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {isEdit && (
                    <div style={{ marginTop: 6, fontSize: 11.5, color: T.muted }}>
                      Se cambi la pianificazione, vengono rigenerati solo gli accessi futuri ancora "pianificato": lo storico resta.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: "flex", gap: 10, padding: "12px 18px", borderTop: `1px solid ${T.border}`, background: "#fff" }}>
              {isEdit && (
                <button onClick={deletePatient} disabled={saving} style={btn("danger")}>Elimina</button>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={onClose} disabled={saving} style={btn()}>Annulla</button>
              <button onClick={save} disabled={saving} style={{ ...btn("pri"), opacity: saving ? .6 : 1 }}>
                {saving ? "Salvo…" : isEdit ? "Salva modifiche" : "Salva e pianifica"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────

/** Firma della pianificazione: se cambia, in edit si rigenerano i futuri. */
function planSignature(
  giorni: GiornoOrario[],
  scadenza: string | null | undefined,
  tot: number | null | undefined,
): string {
  const g = [...giorni]
    .sort((a, b) => a.dow - b.dow)
    .map(x => `${x.dow}:${normTime(x.orario) || ""}`)
    .join("|");
  return `${g}#${scadenza || ""}#${tot ?? ""}`;
}
