"use client";
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { showToast } from "@/src/components/mobile/ToastProvider";
import { openWhatsApp } from "@/src/lib/whatsapp";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { SCALES, getScale, psfsQuestions, computeScore, type ScaleDef } from "@/src/lib/scales/defs";

// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/ScalesSection.tsx — v2
// ═══════════════════════════════════════════════════════════════════════
// Scale di valutazione: compilazione in studio + INVIO AL PAZIENTE via
// link + GRAFICO ANDAMENTO nel tempo. Componente condiviso desktop/mobile.
//
//   • Catalogo scale per distretto (VAS, PSFS, NDI, Oswestry, QuickDASH,
//     LEFS) con item descrittivi e ancore
//   • "Compila ora" → modal con slider e interpretazione live
//   • "📲 Invia" → richiesta remota (token), il paziente compila da casa
//   • Trend chart SVG per scala: punteggi nel tempo, delta vs precedente
//     interpretato nella direzione giusta (MCID-aware), origine 🏥/📱
// ═══════════════════════════════════════════════════════════════════════

const T = {
  panelBg: "#ffffff", panelSoft: "#f7f9fd", text: "#0f172a", muted: "#334155",
  faint: "#64748b", border: "#cbd5e1", blue: "#2563eb", green: "#16a34a",
  red: "#dc2626", amber: "#d97706", teal: "#0d9488", violet: "#7c3aed",
  gradient: "linear-gradient(135deg,#0d9488,#2563eb)",
};

type ScaleRow = {
  id: string;
  scale_type: string;
  score: number;
  details: { answers?: number[]; questions?: string[]; activities?: string[] } | null;
  note: string | null;
  source: "studio" | "remote" | null;
  created_at: string;
};

type RequestRow = {
  id: string;
  scale_type: string;
  access_token: string;
  status: "pending" | "completed";
  sent_at: string;
  payload: { activities?: string[] } | null;
};

type Props = {
  patientId: string;
  patientFirstName?: string;
  patientPhone?: string | null;
  studio?: {
    id?: string;
    name?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
  } | null;
};

function fmtD(s: string): string {
  return new Date(s).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ─── Grafico andamento SVG ────────────────────────────────────────────────
function TrendChart({ def, rows }: { def: ScaleDef; rows: ScaleRow[] }) {
  // rows in ordine cronologico
  const W = 560, H = 120, PX = 30, PY = 16;
  const max = def.maxScore;
  const pts = rows.map((r, i) => ({
    x: rows.length === 1 ? W / 2 : PX + (i * (W - 2 * PX)) / (rows.length - 1),
    y: PY + (1 - r.score / max) * (H - 2 * PY),
    r,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const lastColor = def.interpret(rows[rows.length - 1].score).color;

  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* griglia */}
      {[0, 0.5, 1].map(f => (
        <line key={f} x1={PX} x2={W - PX} y1={PY + f * (H - 2 * PY)} y2={PY + f * (H - 2 * PY)}
          stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3 4" />
      ))}
      <text x={PX - 5} y={PY + 4} textAnchor="end" fontSize={9} fill="#94a3b8" fontWeight={700}>{max}</text>
      <text x={PX - 5} y={H - PY + 4} textAnchor="end" fontSize={9} fill="#94a3b8" fontWeight={700}>0</text>
      {/* linea */}
      {pts.length > 1 && <path d={path} fill="none" stroke={T.teal} strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />}
      {/* punti */}
      {pts.map((p, i) => {
        const col = def.interpret(p.r.score).color;
        return (
          <g key={p.r.id}>
            <circle cx={p.x} cy={p.y} r={i === pts.length - 1 ? 6 : 4.5} fill={col}
              stroke="#fff" strokeWidth={2} />
            <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize={10.5} fontWeight={800}
              fill={col}>{p.r.score}</text>
            <text x={p.x} y={H + 12} textAnchor="middle" fontSize={8.5} fill="#94a3b8"
              fontWeight={600}>{fmtD(p.r.created_at)}</text>
          </g>
        );
      })}
      {/* ultimo valore evidenziato */}
      {pts.length > 0 && (
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={10}
          fill="none" stroke={lastColor} strokeWidth={1.5} opacity={0.4} />
      )}
    </svg>
  );
}

export default function ScalesSection({ patientId, patientFirstName, patientPhone, studio }: Props) {
  const [rows, setRows] = useState<ScaleRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  // Compilazione in studio
  const [modalScale, setModalScale] = useState<ScaleDef | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // PSFS: attività (sia per compilazione in studio sia per invio)
  const [psfsActs, setPsfsActs] = useState<string[]>(["", "", ""]);
  const [psfsMode, setPsfsMode] = useState<"compile" | "send" | null>(null);

  const [sending, setSending] = useState<string | null>(null);   // scale id in invio
  const [openTrend, setOpenTrend] = useState<string | null>(null);

  const [notice, setNotice] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  function notify(kind: "success" | "error", msg: string) {
    showToast[kind](msg);
    setNotice({ kind, msg });
    setTimeout(() => setNotice(n => (n?.msg === msg ? null : n)), 3500);
  }

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from("clinical_scales").select("*")
        .eq("patient_id", patientId).order("created_at", { ascending: true }),
      supabase.from("scale_requests").select("id, scale_type, access_token, status, sent_at, payload")
        .eq("patient_id", patientId).eq("status", "pending").order("sent_at", { ascending: false }),
    ]);
    if (!a.error) setRows((a.data ?? []) as ScaleRow[]);
    if (!b.error) setRequests((b.data ?? []) as RequestRow[]);
    setLoading(false);
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);

  // ── Compilazione in studio ────────────────────────────────────────────
  function openCompile(def: ScaleDef) {
    if (def.psfs) { setPsfsMode("compile"); setPsfsActs(["", "", ""]); return; }
    startCompile(def, def.questions.length);
  }
  function startCompile(def: ScaleDef, nQuestions: number) {
    setModalScale(def);
    setAnswers(new Array(nQuestions).fill(0));
    setNote("");
  }

  async function saveCompile() {
    if (!modalScale) return;
    const studioId = studio?.id ?? null;
    if (!studioId) { notify("error", "Studio non disponibile, ricarica la pagina"); return; }
    const acts = modalScale.psfs ? psfsActs.filter(Boolean) : [];
    const questions = modalScale.psfs ? psfsQuestions(acts) : modalScale.questions;
    const score = computeScore(modalScale, answers);
    setSaving(true);
    const res = await supabase.from("clinical_scales").insert({
      patient_id: patientId,
      studio_id: studioId,
      scale_type: modalScale.id,
      score,
      details: {
        answers,
        questions: questions.map(q => q.label),
        ...(modalScale.psfs ? { activities: acts } : {}),
      },
      note: note || null,
      source: "studio",
    });
    setSaving(false);
    if (res.error) { notify("error", `Errore: ${res.error.message}`); return; }
    setModalScale(null);
    setPsfsMode(null);
    notify("success", `${modalScale.name}: ${score} registrato ✓`);
    await load();
  }

  // ── Invio al paziente ─────────────────────────────────────────────────
  async function sendScale(def: ScaleDef, activities?: string[]) {
    const studioId = studio?.id ?? null;
    if (!studioId) { notify("error", "Studio non disponibile, ricarica la pagina"); return; }
    setSending(def.id);
    const res = await supabase.from("scale_requests").insert({
      studio_id: studioId,
      patient_id: patientId,
      scale_type: def.id,
      payload: def.psfs ? { activities: (activities ?? []).filter(Boolean) } : null,
    }).select("id, scale_type, access_token, status, sent_at, payload").single();
    setSending(null);
    if (res.error) { notify("error", `Errore: ${res.error.message}`); return; }
    const r = res.data as RequestRow;
    setRequests(prev => [r, ...prev]);
    setPsfsMode(null);

    const url = `${window.location.origin}/scale/${r.access_token}`;
    if (patientPhone) {
      const branding = getStudioBranding(studio ?? null);
      const firma = branding.signatureName ? `\n\n${branding.signatureName}` : "";
      openWhatsApp(patientPhone,
        `Gentile ${patientFirstName ?? ""},\nti chiedo di compilare questo breve ` +
        `questionario sul tuo stato attuale (1-2 minuti, direttamente dal telefono):\n\n${url}${firma}`);
      notify("success", `${def.name} inviata → WhatsApp aperto`);
    } else {
      try {
        await navigator.clipboard.writeText(url);
        notify("success", `${def.name}: link copiato negli appunti ✓`);
      } catch {
        notify("error", "Creata, ma copia non riuscita");
      }
    }
  }

  async function deleteRequest(r: RequestRow) {
    if (!confirm("Annullare questa richiesta? Il link smetterà di funzionare.")) return;
    const res = await supabase.from("scale_requests").delete().eq("id", r.id);
    if (res.error) { notify("error", `Errore: ${res.error.message}`); return; }
    setRequests(prev => prev.filter(x => x.id !== r.id));
    notify("success", "Richiesta annullata");
  }

  async function deleteRow(row: ScaleRow) {
    if (!confirm("Eliminare questa valutazione dallo storico?")) return;
    const res = await supabase.from("clinical_scales").delete().eq("id", row.id);
    if (res.error) { notify("error", `Errore: ${res.error.message}`); return; }
    await load();
  }

  // ── Derivati ──────────────────────────────────────────────────────────
  const byType = new Map<string, ScaleRow[]>();
  for (const r of rows) {
    const arr = byType.get(r.scale_type) ?? [];
    arr.push(r);
    byType.set(r.scale_type, arr);
  }

  function deltaBadge(def: ScaleDef, hist: ScaleRow[]) {
    if (hist.length < 2) return null;
    const last = hist[hist.length - 1].score;
    const prev = hist[hist.length - 2].score;
    const diff = Math.round((last - prev) * 10) / 10;
    if (diff === 0) return <span style={{ fontSize: 10.5, fontWeight: 800, color: T.faint }}>＝ stabile</span>;
    const improving = def.higherIsBetter ? diff > 0 : diff < 0;
    const col = improving ? T.green : T.red;
    const mcidNote = def.mcid && Math.abs(diff) >= def.mcid ? " · clinicamente rilevante" : "";
    return (
      <span style={{ fontSize: 10.5, fontWeight: 800, color: col }}>
        {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}{improving ? " miglioramento" : " peggioramento"}{mcidNote}
      </span>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 16, fontSize: 13, color: T.faint }}>Caricamento scale…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header + guida */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: T.faint,
          textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Scale di valutazione
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
        <div style={{ padding: "11px 13px", borderRadius: 10,
          background: "rgba(37,99,235,0.05)", border: "1.5px solid rgba(37,99,235,0.2)",
          fontSize: 11.5, color: T.muted, lineHeight: 1.65 }}>
          <strong>Compila ora</strong> apre il questionario qui (slider, punteggio e
          interpretazione live). <strong>📲 Invia</strong> manda il link al paziente, che
          compila da casa: il risultato finisce automaticamente nello storico con il badge 📱.
          Ogni scala con 2+ misurazioni mostra il <strong>grafico andamento</strong> e il
          delta rispetto alla precedente, già interpretato nella direzione giusta della scala
          (es. LEFS che sale = miglioramento). I delta ≥ MCID sono marcati "clinicamente
          rilevante". Per la <strong>PSFS</strong> definisci 3 attività significative per il
          paziente (es. "salire le scale di casa").
        </div>
      )}

      {notice && (
        <div style={{ padding: "9px 13px", borderRadius: 10, fontSize: 12.5, fontWeight: 700,
          background: notice.kind === "success" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.07)",
          border: `1.5px solid ${notice.kind === "success" ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.25)"}`,
          color: notice.kind === "success" ? T.green : T.red }}>
          {notice.kind === "success" ? "✓" : "⚠️"} {notice.msg}
        </div>
      )}

      {/* Richieste in attesa */}
      {requests.length > 0 && (
        <div style={{ border: `1.5px solid rgba(217,119,6,0.3)`, borderRadius: 11,
          background: "rgba(217,119,6,0.04)", padding: "10px 13px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: T.amber, marginBottom: 6 }}>
            ⏳ IN ATTESA DI COMPILAZIONE
          </div>
          {requests.map(r => {
            const def = getScale(r.scale_type);
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8,
                padding: "5px 0", fontSize: 12.5 }}>
                <span style={{ flex: 1, fontWeight: 700, color: T.text }}>
                  {def?.icon} {def?.name ?? r.scale_type}
                  <span style={{ fontWeight: 500, color: T.faint }}> · inviata {fmtD(r.sent_at)}</span>
                </span>
                <button onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}/scale/${r.access_token}`);
                    notify("success", "Link copiato ✓");
                  } catch { notify("error", "Copia non riuscita"); }
                }} style={{ padding: "4px 9px", borderRadius: 7, border: `1.5px solid ${T.blue}30`,
                  background: `${T.blue}0d`, color: T.blue, fontSize: 11, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit" }}>Copia</button>
                <button onClick={() => deleteRequest(r)}
                  style={{ padding: "4px 9px", borderRadius: 7, border: `1.5px solid ${T.red}30`,
                    background: `${T.red}0a`, color: T.red, fontSize: 11, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit" }}>🗑</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Catalogo scale */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 9 }}>
        {SCALES.map(def => {
          const hist = byType.get(def.id) ?? [];
          const last = hist[hist.length - 1];
          const interp = last ? def.interpret(last.score) : null;
          const isOpen = openTrend === def.id;
          return (
            <div key={def.id} style={{ border: `1.5px solid ${T.border}`, borderRadius: 12,
              background: T.panelBg, overflow: "hidden",
              gridColumn: isOpen ? "1 / -1" : undefined }}>
              <div style={{ padding: "11px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 16 }}>{def.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{def.name}</div>
                    <div style={{ fontSize: 10, color: T.faint }}>{def.area} · {def.full}</div>
                  </div>
                  {last && interp && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: interp.color }}>
                        {last.score}<span style={{ fontSize: 10, color: T.faint }}>/{def.maxScore}</span>
                      </div>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: interp.color }}>{interp.text}</div>
                    </div>
                  )}
                </div>
                {hist.length >= 2 && (
                  <div style={{ marginTop: 3 }}>{deltaBadge(def, hist)}</div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                  <button onClick={() => openCompile(def)}
                    style={{ flex: 1, padding: "7px 8px", borderRadius: 8,
                      border: `1.5px solid ${T.teal}40`, background: `${T.teal}0d`,
                      color: T.teal, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                      fontFamily: "inherit" }}>
                    ✏️ Compila ora
                  </button>
                  <button
                    onClick={() => def.psfs
                      ? (setPsfsMode("send"), setPsfsActs(["", "", ""]))
                      : sendScale(def)}
                    disabled={sending === def.id}
                    style={{ flex: 1, padding: "7px 8px", borderRadius: 8,
                      border: `1.5px solid ${T.blue}40`, background: `${T.blue}0d`,
                      color: T.blue, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                      fontFamily: "inherit", opacity: sending === def.id ? 0.6 : 1 }}>
                    {sending === def.id ? "…" : "📲 Invia"}
                  </button>
                  {hist.length > 0 && (
                    <button onClick={() => setOpenTrend(isOpen ? null : def.id)}
                      style={{ padding: "7px 10px", borderRadius: 8,
                        border: `1.5px solid ${T.violet}40`, background: `${T.violet}0d`,
                        color: T.violet, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                        fontFamily: "inherit" }}>
                      📊 {hist.length}
                    </button>
                  )}
                </div>
              </div>

              {/* Trend + storico */}
              {isOpen && hist.length > 0 && (
                <div style={{ borderTop: `1.5px solid ${T.border}`, padding: "12px 13px",
                  background: T.panelSoft }}>
                  <TrendChart def={def} rows={hist} />
                  <div style={{ marginTop: 8 }}>
                    {[...hist].reverse().map(r => {
                      const it = def.interpret(r.score);
                      return (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8,
                          padding: "6px 0", borderTop: `1px solid #e8edf3`, fontSize: 12 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%",
                            background: it.color, flexShrink: 0 }} />
                          <span style={{ fontWeight: 800, color: it.color, width: 56 }}>
                            {r.score}/{def.maxScore}
                          </span>
                          <span style={{ color: T.muted, flex: 1 }}>
                            {it.text} · {fmtD(r.created_at)} {r.source === "remote" ? "📱" : "🏥"}
                            {r.note ? ` · "${r.note}"` : ""}
                            {def.psfs && r.details?.activities?.length
                              ? ` · ${r.details.activities.join(", ")}` : ""}
                          </span>
                          <button onClick={() => deleteRow(r)}
                            style={{ padding: "2px 7px", borderRadius: 6,
                              border: `1px solid ${T.red}30`, background: `${T.red}0a`,
                              color: T.red, fontSize: 10.5, fontWeight: 700,
                              cursor: "pointer", fontFamily: "inherit" }}>🗑</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modal PSFS: definisci attività ── */}
      {psfsMode && (
        <div onClick={() => setPsfsMode(null)} style={{ position: "fixed", inset: 0,
          background: "rgba(15,23,42,0.5)", zIndex: 90, display: "flex",
          alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 440,
            background: "#fff", borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>
              🎯 PSFS — Attività del paziente
            </div>
            <div style={{ fontSize: 12, color: T.faint, marginBottom: 14, lineHeight: 1.5 }}>
              Indica fino a 3 attività importanti per il paziente che il problema rende
              difficili (es. "salire le scale di casa", "sollevare la spesa").
            </div>
            {psfsActs.map((a, i) => (
              <input key={i} value={a}
                onChange={e => setPsfsActs(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                placeholder={`Attività ${i + 1}${i > 0 ? " (opzionale)" : ""}`}
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
                  borderRadius: 9, border: `1.5px solid ${T.border}`, fontSize: 13.5,
                  fontFamily: "inherit", color: T.text, marginBottom: 8 }} />
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={() => setPsfsMode(null)}
                style={{ padding: "11px 16px", borderRadius: 10, border: `1.5px solid ${T.border}`,
                  background: "#fff", color: T.muted, fontWeight: 700, fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit" }}>Annulla</button>
              <button
                disabled={!psfsActs[0].trim()}
                onClick={() => {
                  const def = getScale("PSFS")!;
                  const acts = psfsActs.filter(x => x.trim());
                  if (psfsMode === "send") { void sendScale(def, acts); }
                  else { startCompile(def, acts.length); }
                }}
                style={{ flex: 1, padding: "11px 16px", borderRadius: 10, border: "none",
                  background: psfsActs[0].trim() ? T.gradient : "#cbd5e1", color: "#fff",
                  fontWeight: 800, fontSize: 13, cursor: psfsActs[0].trim() ? "pointer" : "default",
                  fontFamily: "inherit" }}>
                {psfsMode === "send" ? "📲 Invia al paziente" : "✏️ Compila ora"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal compilazione in studio ── */}
      {modalScale && (
        <div onClick={() => setModalScale(null)} style={{ position: "fixed", inset: 0,
          background: "rgba(15,23,42,0.5)", zIndex: 95, display: "flex",
          alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560,
            maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: 16,
            padding: "18px 20px" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 2 }}>
              {modalScale.icon} {modalScale.name} — {modalScale.full}
            </div>
            <div style={{ fontSize: 11.5, color: T.faint, marginBottom: 14 }}>{modalScale.area}</div>

            {(modalScale.psfs ? psfsQuestions(psfsActs.filter(Boolean)) : modalScale.questions)
              .map((q, i) => (
              <div key={i} style={{ marginBottom: 14, paddingBottom: 12,
                borderBottom: `1px solid #f1f5f9` }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, lineHeight: 1.45 }}>
                    {i + 1}. {q.label}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: T.teal,
                    minWidth: 24, textAlign: "right" }}>{answers[i]}</span>
                </div>
                <input type="range" min={0} max={q.max} step={1} value={answers[i] ?? 0}
                  onChange={e => setAnswers(prev =>
                    prev.map((a, j) => j === i ? parseInt(e.target.value) : a))}
                  style={{ width: "100%", accentColor: T.teal, height: 26, cursor: "pointer" }} />
                <div style={{ display: "flex", justifyContent: "space-between",
                  fontSize: 9.5, color: T.faint, fontWeight: 600 }}>
                  <span>0 — {q.minLabel ?? "Min"}</span>
                  <span>{q.max} — {q.maxLabel ?? "Max"}</span>
                </div>
              </div>
            ))}

            {/* Punteggio live */}
            {(() => {
              const score = computeScore(modalScale, answers);
              const it = modalScale.interpret(score);
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 10, background: `${it.color}10`,
                  border: `1.5px solid ${it.color}35`, marginBottom: 12 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: it.color }}>
                    {score}<span style={{ fontSize: 11, color: T.faint }}>/{modalScale.maxScore}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: it.color }}>{it.text}</span>
                </div>
              );
            })()}

            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="Note cliniche (facoltative)…"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
                borderRadius: 9, border: `1.5px solid ${T.border}`, fontSize: 13,
                fontFamily: "inherit", color: T.text, marginBottom: 12 }} />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setModalScale(null)}
                style={{ padding: "11px 16px", borderRadius: 10, border: `1.5px solid ${T.border}`,
                  background: "#fff", color: T.muted, fontWeight: 700, fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit" }}>Annulla</button>
              <button onClick={saveCompile} disabled={saving}
                style={{ flex: 1, padding: "11px 16px", borderRadius: 10, border: "none",
                  background: T.gradient, color: "#fff", fontWeight: 800, fontSize: 13,
                  cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1,
                  fontFamily: "inherit" }}>
                {saving ? "Salvataggio…" : "💾 Salva valutazione"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
