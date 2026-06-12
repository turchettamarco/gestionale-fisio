"use client";
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { showToast } from "@/src/components/mobile/ToastProvider";
import { openWhatsApp } from "@/src/lib/whatsapp";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { openHtmlWindow } from "@/src/lib/openHtmlWindow";
import { renderProgramHtml } from "@/src/lib/exercise/printProgram";

// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/ExerciseProgramSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Programma esercizi con progressione settimanale — componente CONDIVISO
// desktop (sezione Scheda Esercizi) e mobile (tab Esercizi).
//
// Potenzia la scheda esistente (schede_esercizi_pubbliche) con:
//   • Fase clinica (acuta/subacuta/cronica) → l'AI dosa di conseguenza
//   • Durata in settimane + data inizio → la pagina pubblica evidenzia
//     la settimana corrente del paziente
//   • Progressione per esercizio: serie/ripetizioni/carico che cambiano
//     settimana per settimana (editor + auto-progressione + AI)
//   • Generazione AI programma completo, aggiunta singolo esercizio (AI
//     o manuale), riordino, modifica inline, arricchimento YouTube+foto
//
// Retrocompatibile: schede esistenti senza progressione restano valide.
// ═══════════════════════════════════════════════════════════════════════

const T = {
  panelBg: "#ffffff", panelSoft: "#f7f9fd", text: "#0f172a", muted: "#334155",
  faint: "#64748b", border: "#cbd5e1", blue: "#2563eb", green: "#16a34a",
  red: "#dc2626", amber: "#d97706", teal: "#0d9488", violet: "#7c3aed",
  gradient: "linear-gradient(135deg,#0d9488,#2563eb)",
};

const CAT_COLORS: Record<string, string> = {
  stretching: "#7c3aed", rinforzo: "#0d9488", mobilita: "#2563eb",
  respirazione: "#0891b2", equilibrio: "#d97706",
};

type Fase = "acuta" | "subacuta" | "cronica";

const FASE_LABEL: Record<Fase, string> = {
  acuta: "Acuta", subacuta: "Subacuta", cronica: "Cronica",
};
const FASE_HINT: Record<Fase, string> = {
  acuta: "dolore recente: mobilità dolce, isometrici, no carico",
  subacuta: "recupero: carico progressivo moderato",
  cronica: "consolidamento: rinforzo e carico crescente",
};

export type ProgressStep = {
  settimana: number;
  serie: string;
  ripetizioni: string;
  carico: string;
};

export type Esercizio = {
  id: string;
  nome: string;
  descrizione: string;
  serie: string;
  ripetizioni: string;
  frequenza: string;
  note?: string;
  avvertenze?: string;
  youtube_id?: string;
  image_url?: string;
  image_query?: string;
  categoria?: string;
  progressione?: ProgressStep[];
};

type Props = {
  patientId: string;
  patientName: string;       // "Cognome Nome"
  patientPhone: string | null;
  studio: {
    id?: string;
    name?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
  } | null;
};

export default function ExerciseProgramSection({
  patientId, patientName, patientPhone, studio,
}: Props) {
  const [esercizi, setEsercizi] = useState<Esercizio[]>([]);
  const [schedaId, setSchedaId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  const [fase, setFase] = useState<Fase>("subacuta");
  const [durata, setDurata] = useState(4);
  const [startDate, setStartDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10));

  const [genLoading, setGenLoading] = useState(false);
  const [aiHint, setAiHint] = useState("");
  const [addName, setAddName] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const [notice, setNotice] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  function notify(kind: "success" | "error", msg: string) {
    showToast[kind](msg);
    setNotice({ kind, msg });
    setTimeout(() => setNotice(n => (n?.msg === msg ? null : n)), 3500);
  }

  const pubLink = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/esercizi/${token}` : "";

  // ── Caricamento ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("schede_esercizi_pubbliche")
      .select("id, token, esercizi, fase, durata_settimane, start_date, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      const s = data[0];
      setSchedaId(s.id);
      setToken(s.token);
      try { setEsercizi(JSON.parse(s.esercizi ?? "[]")); } catch { setEsercizi([]); }
      if (s.fase) setFase(s.fase as Fase);
      if (s.durata_settimane) setDurata(s.durata_settimane);
      if (s.start_date) setStartDate(s.start_date);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);

  // ── Arricchimento YouTube + foto ──────────────────────────────────────
  async function enrich(e: Esercizio): Promise<Esercizio> {
    const out = { ...e };
    try {
      const r = await fetch(`/api/youtube-search?q=${encodeURIComponent(e.nome)}`);
      const d = await r.json();
      if (d.videoId) out.youtube_id = d.videoId;
    } catch {}
    try {
      const iq = e.image_query || e.nome;
      const r = await fetch(`/api/image-search?q=${encodeURIComponent(iq + " exercise")}`);
      const d = await r.json();
      if (d.url || d.thumbnail) out.image_url = d.url || d.thumbnail;
    } catch {}
    return out;
  }

  // ── Auto-progressione deterministica ──────────────────────────────────
  function autoProgress(e: Esercizio): ProgressStep[] {
    const baseS = parseInt(e.serie) || 3;
    const baseR = parseInt(e.ripetizioni) || 10;
    const steps: ProgressStep[] = [];
    for (let w = 1; w <= durata; w++) {
      const rep = baseR + Math.floor((w - 1) / 2) * 2;
      const ser = baseS + (w > Math.ceil(durata * 0.6) ? 1 : 0);
      const carico =
        w <= Math.ceil(durata / 3) ? "Come indicato" :
        w <= Math.ceil((durata * 2) / 3) ? "Aumenta resistenza se senza dolore" :
        "Resistenza maggiore / rallenta l'esecuzione";
      steps.push({ settimana: w, serie: String(ser), ripetizioni: String(rep), carico });
    }
    return steps;
  }

  // ── Generazione programma AI (fase-aware, con progressione) ──────────
  async function generaProgramma() {
    setGenLoading(true);
    try {
      const prompt =
        `Sei un fisioterapista esperto. Genera un programma di esercizi domiciliari per il paziente: ${patientName}.\n` +
        `FASE CLINICA: ${fase} (${FASE_HINT[fase]}).\n` +
        `DURATA: ${durata} settimane con progressione settimanale.\n` +
        (aiHint.trim() ? `INDICAZIONI AGGIUNTIVE: ${aiHint.trim()}.\n` : "") +
        `Genera esattamente 5 esercizi adeguati alla fase. Per ogni esercizio includi la progressione settimana per settimana (${durata} righe) con serie, ripetizioni e indicazione sul carico/variante coerenti con la fase.\n` +
        `Per image_query scrivi 2-4 parole IN INGLESE (es: "side plank exercise"). Testo in italiano.\n` +
        `Rispondi SOLO con array JSON:\n` +
        `[{"id":"1","nome":"","descrizione":"","serie":"3","ripetizioni":"10","frequenza":"1 volta al giorno","note":"","avvertenze":"","categoria":"rinforzo","image_query":"english terms","progressione":[{"settimana":1,"serie":"3","ripetizioni":"10","carico":""}]}]\n` +
        `Per categoria scegli tra: stretching, rinforzo, mobilita, respirazione, equilibrio.`;
      const res = await fetch("/api/ai-esercizi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const match = (data.text ?? "").replace(/```json|```/g, "").trim().match(/\[[\s\S]*\]/);
      if (!match) throw new Error("Risposta AI non valida, riprova");
      const parsed: Esercizio[] = JSON.parse(match[0]);
      const normalized = parsed.map((e, i) => ({
        ...e,
        id: e.id || String(i + 1),
        progressione: Array.isArray(e.progressione) && e.progressione.length > 0
          ? e.progressione.slice(0, durata)
          : autoProgress(e),
      }));
      const enriched = await Promise.all(normalized.map(enrich));
      setEsercizi(enriched);
      setDirty(true);
      notify("success", "Programma generato — controlla, modifica e salva");
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Errore generazione");
    } finally {
      setGenLoading(false);
    }
  }

  // ── Aggiunta singolo esercizio (AI o manuale) ─────────────────────────
  async function aggiungiAI() {
    const nome = addName.trim();
    if (!nome) return;
    setAddLoading(true);
    try {
      const prompt =
        `Sei un fisioterapista. Descrivi l'esercizio "${nome}" come scheda domiciliare per fase ${fase} (${FASE_HINT[fase]}), con progressione su ${durata} settimane.\n` +
        `Per categoria scegli tra: stretching, rinforzo, mobilita, respirazione, equilibrio.\n` +
        `Per image_query 2-4 parole IN INGLESE. Testo in italiano.\n` +
        `Rispondi SOLO con oggetto JSON: {"nome":"${nome}","descrizione":"","serie":"3","ripetizioni":"10","frequenza":"1 volta al giorno","note":"","avvertenze":"","categoria":"rinforzo","image_query":"","progressione":[{"settimana":1,"serie":"3","ripetizioni":"10","carico":""}]}`;
      const res = await fetch("/api/ai-esercizi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const match = (data.text ?? "").replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Risposta AI non valida");
      const obj: Esercizio = JSON.parse(match[0]);
      obj.id = crypto.randomUUID().slice(0, 8);
      if (!Array.isArray(obj.progressione) || obj.progressione.length === 0) {
        obj.progressione = autoProgress(obj);
      } else {
        obj.progressione = obj.progressione.slice(0, durata);
      }
      const enriched = await enrich(obj);
      setEsercizi(prev => [...prev, enriched]);
      setAddName("");
      setDirty(true);
      notify("success", `"${enriched.nome}" aggiunto`);
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Errore");
    } finally {
      setAddLoading(false);
    }
  }

  function aggiungiManuale() {
    const nuovo: Esercizio = {
      id: crypto.randomUUID().slice(0, 8),
      nome: "Nuovo esercizio", descrizione: "", serie: "3", ripetizioni: "10",
      frequenza: "1 volta al giorno", categoria: "rinforzo",
      progressione: [],
    };
    nuovo.progressione = autoProgress(nuovo);
    setEsercizi(prev => [...prev, nuovo]);
    setExpanded(nuovo.id);
    setDirty(true);
  }

  // ── Modifica / riordino / eliminazione ────────────────────────────────
  function patch(id: string, p: Partial<Esercizio>) {
    setEsercizi(prev => prev.map(e => (e.id === id ? { ...e, ...p } : e)));
    setDirty(true);
  }
  function patchStep(id: string, settimana: number, p: Partial<ProgressStep>) {
    setEsercizi(prev => prev.map(e => {
      if (e.id !== id) return e;
      const prog = (e.progressione ?? []).map(s =>
        s.settimana === settimana ? { ...s, ...p } : s);
      return { ...e, progressione: prog };
    }));
    setDirty(true);
  }
  function move(id: string, dir: -1 | 1) {
    setEsercizi(prev => {
      const i = prev.findIndex(e => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  }
  function removeEx(id: string) {
    if (!confirm("Rimuovere questo esercizio dal programma?")) return;
    setEsercizi(prev => prev.filter(e => e.id !== id));
    setDirty(true);
  }

  // Riallinea le progressioni quando cambia la durata
  function changeDurata(n: number) {
    const v = Math.min(12, Math.max(1, n));
    setDurata(v);
    setEsercizi(prev => prev.map(e => {
      let prog = (e.progressione ?? []).slice(0, v);
      const baseS = parseInt(e.serie) || 3;
      const baseR = parseInt(e.ripetizioni) || 10;
      for (let w = prog.length + 1; w <= v; w++) {
        const last = prog[prog.length - 1];
        prog = [...prog, {
          settimana: w,
          serie: last?.serie ?? String(baseS),
          ripetizioni: last?.ripetizioni ?? String(baseR),
          carico: last?.carico ?? "Come indicato",
        }];
      }
      return { ...e, progressione: prog.map((s, i) => ({ ...s, settimana: i + 1 })) };
    }));
    setDirty(true);
  }

  // ── Salvataggio ───────────────────────────────────────────────────────
  async function salva() {
    if (esercizi.length === 0) { notify("error", "Nessun esercizio da salvare"); return; }
    setSaving(true);
    const payload = {
      patient_id: patientId,
      patient_name: patientName,
      esercizi: JSON.stringify(esercizi),
      fase,
      durata_settimane: durata,
      start_date: startDate,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
    if (schedaId) {
      const res = await supabase
        .from("schede_esercizi_pubbliche").update(payload).eq("id", schedaId);
      setSaving(false);
      if (res.error) { notify("error", `Errore: ${res.error.message}`); return; }
    } else {
      const newToken = crypto.randomUUID();
      const res = await supabase
        .from("schede_esercizi_pubbliche")
        .insert({ ...payload, token: newToken })
        .select("id, token").single();
      setSaving(false);
      if (res.error) { notify("error", `Errore: ${res.error.message}`); return; }
      setSchedaId(res.data.id);
      setToken(res.data.token);
    }
    setDirty(false);
    notify("success", "Programma salvato ✓");
  }

  function stampaPdf() {
    const branding = getStudioBranding(studio);
    const html = renderProgramHtml(esercizi, {
      patientName,
      fase,
      durata,
      startDate,
      studio: {
        name: studio?.name ?? null,
        signature_name: branding.signatureName,
        signature_title: branding.signatureTitle,
      },
      publicUrl: pubLink || null,
    });
    openHtmlWindow(html, { width: 850, height: 950 });
  }

  async function copyLink() {
    if (!pubLink) return;
    try {
      await navigator.clipboard.writeText(pubLink);
      notify("success", "Link copiato ✓");
    } catch { notify("error", "Copia non riuscita"); }
  }

  function sendWA() {
    if (!pubLink || !patientPhone) return;
    const branding = getStudioBranding(studio);
    const firma = branding.signatureName ? `\n\n${branding.signatureName}` : "";
    const firstName = patientName.split(" ").pop() ?? "";
    openWhatsApp(patientPhone,
      `Gentile ${firstName},\nqui trovi il tuo programma di esercizi personalizzato ` +
      `(${durata} settimane, con video dimostrativi). La pagina ti mostra ` +
      `automaticamente la settimana in cui ti trovi:\n\n${pubLink}${firma}`);
  }

  // ── UI helpers ────────────────────────────────────────────────────────
  const inp = (v: string, on: (s: string) => void, w?: number | string, ph?: string) => (
    <input value={v} onChange={e => on(e.target.value)} placeholder={ph}
      style={{ width: w ?? "100%", boxSizing: "border-box", padding: "7px 10px",
        borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 12.5,
        fontFamily: "inherit", color: T.text, background: "#fff" }} />
  );

  const catChip = (e: Esercizio) => {
    const col = CAT_COLORS[e.categoria ?? ""] ?? T.faint;
    return (
      <select value={e.categoria ?? "rinforzo"}
        onChange={ev => patch(e.id, { categoria: ev.target.value })}
        style={{ padding: "3px 8px", borderRadius: 99, fontSize: 10.5, fontWeight: 800,
          background: `${col}14`, border: `1.5px solid ${col}40`, color: col,
          fontFamily: "inherit", cursor: "pointer" }}>
        {Object.keys(CAT_COLORS).map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 20, fontSize: 13, color: T.faint }}>Caricamento programma…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Impostazioni programma ── */}
      <div style={{ background: T.panelSoft, border: `1.5px solid ${T.border}`,
        borderRadius: 12, padding: "13px 15px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.faint,
            textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Programma
          </div>
          <button onClick={() => setShowInfo(s => !s)} title="Come funziona"
            style={{ width: 24, height: 24, borderRadius: "50%",
              border: `1.5px solid ${showInfo ? T.blue : T.border}`,
              background: showInfo ? "rgba(37,99,235,0.08)" : "#fff",
              color: showInfo ? T.blue : T.faint, fontSize: 12, fontWeight: 800,
              cursor: "pointer", fontFamily: "Georgia,serif", fontStyle: "italic" }}>
            i
          </button>
        </div>

        {showInfo && (
          <div style={{ marginBottom: 12, padding: "11px 13px", borderRadius: 10,
            background: "rgba(37,99,235,0.05)", border: "1.5px solid rgba(37,99,235,0.2)",
            fontSize: 11.5, color: T.muted, lineHeight: 1.65 }}>
            <strong>1.</strong> Imposta fase clinica, durata e data di inizio — l'AI dosa gli
            esercizi di conseguenza. <strong>2.</strong> Genera il programma (o aggiungi
            esercizi singoli, AI o manuali) e modifica tutto inline: ogni esercizio ha la sua
            tabella di progressione settimanale (📈 la ricalcola in automatico).{" "}
            <strong>3.</strong> Salva e invia il link: il paziente vede video, foto e i
            parametri della <em>sua</em> settimana corrente. Il link vale 90 giorni.
          </div>
        )}

        {/* Fase */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
          {(Object.keys(FASE_LABEL) as Fase[]).map(f => (
            <button key={f} onClick={() => { setFase(f); setDirty(true); }}
              title={FASE_HINT[f]}
              style={{ padding: "7px 13px", borderRadius: 99,
                border: `1.5px solid ${fase === f ? T.teal : T.border}`,
                background: fase === f ? "rgba(13,148,136,0.09)" : "#fff",
                color: fase === f ? T.teal : T.faint, fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit" }}>
              {fase === f ? "✓ " : ""}{FASE_LABEL[f]}
            </button>
          ))}
        </div>

        {/* Durata + inizio */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>Durata</span>
            <button onClick={() => changeDurata(durata - 1)}
              style={{ width: 26, height: 26, borderRadius: 7, border: `1.5px solid ${T.border}`,
                background: "#fff", cursor: "pointer", fontWeight: 800, color: T.muted }}>−</button>
            <span style={{ fontSize: 13, fontWeight: 800, color: T.text, minWidth: 64,
              textAlign: "center" }}>{durata} sett.</span>
            <button onClick={() => changeDurata(durata + 1)}
              style={{ width: 26, height: 26, borderRadius: 7, border: `1.5px solid ${T.border}`,
                background: "#fff", cursor: "pointer", fontWeight: 800, color: T.muted }}>+</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>Inizio</span>
            <input type="date" value={startDate}
              onChange={e => { setStartDate(e.target.value); setDirty(true); }}
              style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${T.border}`,
                fontSize: 12.5, fontFamily: "inherit", color: T.text, background: "#fff" }} />
          </div>
        </div>
      </div>

      {notice && (
        <div style={{ padding: "9px 13px", borderRadius: 10, fontSize: 12.5, fontWeight: 700,
          background: notice.kind === "success" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.07)",
          border: `1.5px solid ${notice.kind === "success" ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.25)"}`,
          color: notice.kind === "success" ? T.green : T.red }}>
          {notice.kind === "success" ? "✓" : "⚠️"} {notice.msg}
        </div>
      )}

      {/* ── Generazione ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {inp(aiHint, setAiHint, "100%",
          "Indicazioni per l'AI (opzionale, es: lombalgia, solo esercizi in scarico, evitare rotazioni…)")}
        <button onClick={generaProgramma} disabled={genLoading}
          style={{ padding: "12px 16px", borderRadius: 10, border: "none",
            background: T.gradient, color: "#fff", fontWeight: 800, fontSize: 13,
            cursor: genLoading ? "wait" : "pointer", opacity: genLoading ? 0.7 : 1,
            fontFamily: "inherit", boxShadow: "0 2px 8px rgba(13,148,136,0.25)" }}>
          {genLoading ? "Generazione in corso… (15-30s)" :
            esercizi.length > 0 ? "🤖 Rigenera programma AI (sostituisce)" : "🤖 Genera programma AI"}
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {inp(addName, setAddName, undefined, "Aggiungi esercizio (es: plank laterale)…")}
          <button onClick={aggiungiAI} disabled={addLoading || !addName.trim()}
            style={{ padding: "7px 13px", borderRadius: 8, border: `1.5px solid ${T.violet}40`,
              background: `${T.violet}0d`, color: T.violet, fontWeight: 700, fontSize: 12,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              opacity: addLoading ? 0.6 : 1 }}>
            {addLoading ? "…" : "🤖 AI"}
          </button>
          <button onClick={aggiungiManuale}
            style={{ padding: "7px 13px", borderRadius: 8, border: `1.5px solid ${T.border}`,
              background: "#fff", color: T.muted, fontWeight: 700, fontSize: 12,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            ＋ Manuale
          </button>
        </div>
      </div>

      {/* ── Lista esercizi ── */}
      {esercizi.map((e, i) => {
        const isOpen = expanded === e.id;
        return (
          <div key={e.id} style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
            borderRadius: 12, overflow: "hidden" }}>

            {/* Riga compatta */}
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 13px" }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: T.gradient,
                color: "#fff", fontSize: 11, fontWeight: 800, display: "inline-flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
              <button onClick={() => setExpanded(isOpen ? null : e.id)}
                style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.text,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {e.nome}
                </span>
                <span style={{ display: "block", fontSize: 10.5, color: T.faint, marginTop: 1 }}>
                  {e.serie}×{e.ripetizioni} · {e.frequenza}
                  {e.youtube_id ? " · 🎬 video" : ""}
                </span>
              </button>
              {catChip(e)}
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                <button onClick={() => move(e.id, -1)} disabled={i === 0}
                  style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`,
                    background: "#fff", cursor: "pointer", fontSize: 11, color: T.faint,
                    opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                <button onClick={() => move(e.id, 1)} disabled={i === esercizi.length - 1}
                  style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`,
                    background: "#fff", cursor: "pointer", fontSize: 11, color: T.faint,
                    opacity: i === esercizi.length - 1 ? 0.35 : 1 }}>↓</button>
                <button onClick={() => removeEx(e.id)}
                  style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.red}30`,
                    background: `${T.red}0a`, cursor: "pointer", fontSize: 11, color: T.red }}>🗑</button>
              </div>
            </div>

            {/* Dettaglio espanso */}
            {isOpen && (
              <div style={{ borderTop: `1.5px solid ${T.border}`, padding: "12px 13px",
                display: "flex", flexDirection: "column", gap: 10, background: T.panelSoft }}>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 200px" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.faint, marginBottom: 3 }}>NOME</div>
                    {inp(e.nome, v => patch(e.id, { nome: v }))}
                  </div>
                  <div style={{ width: 70 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.faint, marginBottom: 3 }}>SERIE</div>
                    {inp(e.serie, v => patch(e.id, { serie: v }))}
                  </div>
                  <div style={{ width: 70 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.faint, marginBottom: 3 }}>RIPET.</div>
                    {inp(e.ripetizioni, v => patch(e.id, { ripetizioni: v }))}
                  </div>
                  <div style={{ flex: "1 1 150px" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.faint, marginBottom: 3 }}>FREQUENZA</div>
                    {inp(e.frequenza, v => patch(e.id, { frequenza: v }))}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.faint, marginBottom: 3 }}>DESCRIZIONE</div>
                  <textarea value={e.descrizione}
                    onChange={ev => patch(e.id, { descrizione: ev.target.value })}
                    rows={3}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px",
                      borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 12.5,
                      fontFamily: "inherit", color: T.text, background: "#fff", resize: "vertical" }} />
                </div>

                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.faint, marginBottom: 3 }}>AVVERTENZE</div>
                  {inp(e.avvertenze ?? "", v => patch(e.id, { avvertenze: v }), "100%",
                    "Es: interrompere se compare dolore irradiato…")}
                </div>

                {/* Progressione settimanale */}
                <div>
                  <div style={{ display: "flex", alignItems: "center",
                    justifyContent: "space-between", marginBottom: 5 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.faint }}>
                      PROGRESSIONE SETTIMANALE
                    </div>
                    <button onClick={() => { patch(e.id, { progressione: autoProgress(e) }); }}
                      title="Ricalcola la progressione in automatico dai valori base"
                      style={{ padding: "3px 9px", borderRadius: 7,
                        border: `1.5px solid ${T.teal}40`, background: `${T.teal}0d`,
                        color: T.teal, fontSize: 10.5, fontWeight: 800, cursor: "pointer",
                        fontFamily: "inherit" }}>
                      📈 Auto
                    </button>
                  </div>
                  <div style={{ display: "grid",
                    gridTemplateColumns: "44px 56px 56px 1fr", gap: 4, alignItems: "center" }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: T.faint }}>SETT.</div>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: T.faint }}>SERIE</div>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: T.faint }}>RIP.</div>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: T.faint }}>CARICO / VARIANTE</div>
                    {(e.progressione ?? []).map(s => (
                      <React.Fragment key={s.settimana}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: T.teal }}>{s.settimana}</div>
                        {inp(s.serie, v => patchStep(e.id, s.settimana, { serie: v }))}
                        {inp(s.ripetizioni, v => patchStep(e.id, s.settimana, { ripetizioni: v }))}
                        {inp(s.carico, v => patchStep(e.id, s.settimana, { carico: v }))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {e.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.image_url} alt={e.nome}
                    style={{ maxHeight: 120, borderRadius: 10, objectFit: "cover",
                      alignSelf: "flex-start", border: `1.5px solid ${T.border}` }} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Salvataggio + condivisione ── */}
      {esercizi.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={salva} disabled={saving}
            style={{ padding: "12px 16px", borderRadius: 10, border: "none",
              background: dirty ? T.green : "#94a3b8", color: "#fff", fontWeight: 800,
              fontSize: 13, cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1, fontFamily: "inherit" }}>
            {saving ? "Salvataggio…" : dirty ? "💾 Salva programma" : "✓ Salvato"}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
              {token && patientPhone && (
                <button onClick={sendWA}
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 9,
                    border: `1.5px solid ${T.green}40`, background: `${T.green}0d`,
                    color: T.green, fontWeight: 700, fontSize: 12, cursor: "pointer",
                    fontFamily: "inherit" }}>
                  📲 Invia su WhatsApp
                </button>
              )}
              {token && <button onClick={copyLink}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 9,
                  border: `1.5px solid ${T.blue}40`, background: `${T.blue}0d`,
                  color: T.blue, fontWeight: 700, fontSize: 12, cursor: "pointer",
                  fontFamily: "inherit" }}>
                🔗 Copia link paziente
              </button>}
              <button onClick={stampaPdf}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 9,
                  border: `1.5px solid ${T.violet}40`, background: `${T.violet}0d`,
                  color: T.violet, fontWeight: 700, fontSize: 12, cursor: "pointer",
                  fontFamily: "inherit" }}>
                🖨️ Stampa / PDF
              </button>
          </div>
          {dirty && token && (
            <div style={{ fontSize: 11, color: T.amber, fontWeight: 600, textAlign: "center" }}>
              ⚠️ Modifiche non salvate: il link mostra l'ultima versione salvata
            </div>
          )}
        </div>
      )}
    </div>
  );
}
