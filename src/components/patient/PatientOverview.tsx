"use client";
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { getScale, type ScaleDef } from "@/src/lib/scales/defs";

// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/PatientOverview.tsx — clinical-first
// ═══════════════════════════════════════════════════════════════════════
// Panoramica: andamento clinico protagonista (numero grande + sparkline +
// delta interpretato), stato sintetico, "dove eravamo". Condivisa
// desktop/mobile; il layout si adatta (2 col → 1 col sotto i 720px).
// ═══════════════════════════════════════════════════════════════════════

const T = {
  bg: "#ffffff", soft: "#f7f9fb", ink: "#0f172a", body: "#475569", faint: "#94a3b8",
  line: "#e9eef5", accent: "#0d9488", accentSoft: "rgba(13,148,136,0.08)",
  green: "#15803d", red: "#dc2626", amber: "#b45309", blue: "#1d4ed8",
};

export type OverviewTarget =
  | "terapie" | "scale" | "esercizi" | "gdpr" | "diario" | "anagrafica" | "pacchetti";

type Props = { patientId: string; onNavigate?: (t: OverviewTarget) => void };

type Appt = { id: string; start_at: string; status: string | null; is_paid: boolean | null; amount: number | null };
type ScaleRow = { scale_type: string; score: number; created_at: string };
type NoteRow = { quick_note: string | null; soap_s: string | null; created_at: string };

function rel(iso: string): string {
  const d = new Date(iso).getTime(), now = Date.now();
  const days = Math.round((d - now) / 86400000), abs = Math.abs(days), fut = days >= 0;
  if (abs === 0) { const h = Math.round((d - now) / 3600000); return h === 0 ? "tra poco" : fut ? `tra ${h} h` : `${Math.abs(h)} h fa`; }
  if (abs === 1) return fut ? "domani" : "ieri";
  if (abs < 7) return fut ? `tra ${abs} giorni` : `${abs} giorni fa`;
  if (abs < 14) return fut ? "tra una settimana" : "una settimana fa";
  if (abs < 60) return fut ? `tra ${Math.round(abs / 7)} settimane` : `${Math.round(abs / 7)} settimane fa`;
  return fut ? `tra ${Math.round(abs / 30)} mesi` : `${Math.round(abs / 30)} mesi fa`;
}
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
}
function shortD(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function Spark({ def, rows, h = 80 }: { def: ScaleDef; rows: ScaleRow[]; h?: number }) {
  const w = 320, PX = 6, PY = 12, max = def.maxScore;
  const pts = rows.map((r, i) => ({
    x: rows.length === 1 ? w / 2 : PX + (i * (w - 2 * PX)) / (rows.length - 1),
    y: PY + (1 - r.score / max) * (h - 2 * PY), r,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z` : "";
  const lastCol = def.interpret(rows[rows.length - 1].score).color;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs><linearGradient id={`sg-${def.id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={T.accent} stopOpacity="0.15" />
        <stop offset="100%" stopColor={T.accent} stopOpacity="0" /></linearGradient></defs>
      {area && <path d={area} fill={`url(#sg-${def.id})`} />}
      {pts.length > 1 && <path d={line} fill="none" stroke={T.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {pts.map((p, i) => {
        const last = i === pts.length - 1;
        return <circle key={i} cx={p.x} cy={p.y} r={last ? 4.5 : 2.5}
          fill={last ? lastCol : T.accent} stroke="#fff" strokeWidth={1.5} />;
      })}
    </svg>
  );
}

export default function PatientOverview({ patientId, onNavigate }: Props) {
  const [loading, setLoading] = useState(true);
  const [nextAppt, setNextAppt] = useState<Appt | null>(null);
  const [lastAppt, setLastAppt] = useState<Appt | null>(null);
  const [unpaid, setUnpaid] = useState({ count: 0, total: 0 });
  const [doneCount, setDoneCount] = useState(0);
  const [lastNote, setLastNote] = useState<NoteRow | null>(null);
  const [scaleRows, setScaleRows] = useState<ScaleRow[]>([]);
  const [consents, setConsents] = useState<{ signed: Set<string>; pending: number }>({ signed: new Set(), pending: 0 });
  const [program, setProgram] = useState<{ durata: number | null; start: string | null; nEx: number } | null>(null);
  const [activeScale, setActiveScale] = useState<string | null>(null);

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const [a, n, s, c, p] = await Promise.all([
      supabase.from("appointments").select("id, start_at, status, is_paid, amount").eq("patient_id", patientId).order("start_at", { ascending: true }),
      supabase.from("session_notes").select("quick_note, soap_s, created_at").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(1),
      supabase.from("clinical_scales").select("scale_type, score, created_at").eq("patient_id", patientId).order("created_at", { ascending: true }),
      supabase.from("patient_consents").select("consent_type, status").eq("patient_id", patientId),
      supabase.from("schede_esercizi_pubbliche").select("esercizi, durata_settimane, start_date").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(1),
    ]);
    if (!a.error) {
      const appts = (a.data ?? []) as Appt[];
      const fut = appts.filter(x => x.start_at >= nowIso && x.status !== "cancelled");
      const past = appts.filter(x => x.start_at < nowIso && x.status !== "cancelled");
      setNextAppt(fut[0] ?? null);
      setLastAppt(past[past.length - 1] ?? null);
      setDoneCount(appts.filter(x => x.status === "done").length);
      const due = past.filter(x => !x.is_paid && (x.amount ?? 0) > 0);
      setUnpaid({ count: due.length, total: due.reduce((acc, x) => acc + (x.amount ?? 0), 0) });
    }
    if (!n.error) setLastNote((n.data?.[0] as NoteRow) ?? null);
    if (!s.error) {
      const rows = (s.data ?? []) as ScaleRow[];
      setScaleRows(rows);
      setActiveScale([...new Set(rows.map(r => r.scale_type))][0] ?? null);
    }
    if (!c.error) {
      const rows = (c.data ?? []) as { consent_type: string; status: string }[];
      setConsents({ signed: new Set(rows.filter(r => r.status === "signed").map(r => r.consent_type)), pending: rows.filter(r => r.status === "pending").length });
    }
    if (!p.error && p.data?.[0]) {
      const row = p.data[0] as { esercizi: string; durata_settimane: number | null; start_date: string | null };
      let nEx = 0; try { nEx = (JSON.parse(row.esercizi ?? "[]") as unknown[]).length; } catch {}
      setProgram({ durata: row.durata_settimane, start: row.start_date, nEx });
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);

  const consentsOk = consents.signed.has("gdpr_informativa_privacy") && consents.signed.has("consenso_trattamento");
  const scaleTypes = [...new Set(scaleRows.map(r => r.scale_type))];
  const activeRows = scaleRows.filter(r => r.scale_type === activeScale);
  const activeDef = activeScale ? getScale(activeScale) : undefined;

  let programLabel: string | null = null, programExpired = false;
  if (program?.durata && program.start) {
    const days = Math.floor((Date.now() - new Date(program.start + "T00:00:00").getTime()) / 86400000);
    const w = Math.floor(days / 7) + 1;
    if (days < 0) programLabel = `inizia ${rel(program.start + "T00:00:00")}`;
    else if (w > program.durata) { programLabel = "completato"; programExpired = true; }
    else programLabel = `Settimana ${w} di ${program.durata}`;
  } else if (program && program.nEx > 0) programLabel = `${program.nEx} esercizi`;

  function delta(def: ScaleDef, rows: ScaleRow[]) {
    if (rows.length < 2) return null;
    const last = rows[rows.length - 1].score, prev = rows[rows.length - 2].score;
    const diff = Math.round((last - prev) * 10) / 10;
    if (diff === 0) return { txt: "stabile", col: T.faint, arrow: "=" };
    const improving = def.higherIsBetter ? diff > 0 : diff < 0;
    const mcid = def.mcid && Math.abs(diff) >= def.mcid;
    return { txt: `${Math.abs(diff)} ${improving ? "in miglioramento" : "in peggioramento"}${mcid ? " · rilevante" : ""}`, col: improving ? T.green : T.red, arrow: diff > 0 ? "↑" : "↓" };
  }

  const alerts: { msg: string; t: OverviewTarget; col: string }[] = [];
  if (!consentsOk) alerts.push({ msg: consents.pending > 0 ? "Consensi in attesa di firma" : "Consensi non firmati", t: "gdpr", col: T.amber });
  if (unpaid.count > 0) alerts.push({ msg: `${unpaid.count} sedut${unpaid.count === 1 ? "a" : "e"} da incassare · €\u00A0${unpaid.total.toFixed(2).replace(".", ",")}`, t: "terapie", col: T.red });
  if (programExpired) alerts.push({ msg: "Programma esercizi completato", t: "esercizi", col: T.blue });

  const plabel = (s: string) => <div style={{ fontSize: 11, fontWeight: 800, color: T.faint, letterSpacing: 0.5, textTransform: "uppercase" }}>{s}</div>;
  const stat = (k: string, v: React.ReactNode, sub: React.ReactNode, t?: OverviewTarget, last = false) => (
    <button onClick={t && onNavigate ? () => onNavigate(t) : undefined} disabled={!t || !onNavigate}
      style={{ width: "100%", textAlign: "left", background: "transparent", border: "none",
        borderBottom: last ? "none" : `1px solid ${T.line}`, padding: "12px 0",
        cursor: t && onNavigate ? "pointer" : "default", fontFamily: "inherit",
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
      <span style={{ fontSize: 12.5, color: T.body, fontWeight: 600, whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ textAlign: "right", minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
        {sub && <span style={{ display: "block", fontSize: 11, color: T.faint, marginTop: 1 }}>{sub}</span>}
      </span>
    </button>
  );

  if (loading) return <div style={{ padding: 18, fontSize: 13, color: T.faint }}>Caricamento…</div>;

  return (
    <div>
      {alerts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
          {alerts.map((a, i) => (
            <button key={i} onClick={onNavigate ? () => onNavigate(a.t) : undefined}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px",
                borderRadius: 99, border: `1px solid ${a.col}33`, background: `${a.col}0c`, color: a.col,
                fontSize: 12, fontWeight: 700, cursor: onNavigate ? "pointer" : "default", fontFamily: "inherit" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: a.col }} />{a.msg}
            </button>
          ))}
        </div>
      )}

      <div className="ov-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
        {/* Andamento clinico */}
        <section style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 14, padding: "15px 17px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            {plabel("Andamento clinico")}
            {scaleTypes.length > 0 && onNavigate && (
              <button onClick={() => onNavigate("scale")} style={{ background: "transparent", border: "none", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Gestisci →</button>
            )}
          </div>
          {scaleTypes.length === 0 ? (
            <div style={{ padding: "22px 0", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Nessuna misurazione</div>
              <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 14 }}>Somministra una scala per tracciare i progressi.</div>
              {onNavigate && <button onClick={() => onNavigate("scale")} style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Apri scale di valutazione</button>}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {scaleTypes.map(st => {
                  const def = getScale(st), on = st === activeScale;
                  return <button key={st} onClick={() => setActiveScale(st)} style={{ padding: "5px 11px", borderRadius: 8, fontFamily: "inherit", border: `1px solid ${on ? T.accent : T.line}`, background: on ? T.accentSoft : "transparent", color: on ? T.accent : T.body, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{def?.name ?? st}</button>;
                })}
              </div>
              {activeDef && activeRows.length > 0 && (() => {
                const last = activeRows[activeRows.length - 1], it = activeDef.interpret(last.score), d = delta(activeDef, activeRows);
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: it.color, letterSpacing: -1 }}>{last.score}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: T.faint }}>/ {activeDef.maxScore}</span>
                      </div>
                      <div style={{ paddingBottom: 3 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: it.color }}>{it.text}</div>
                        {d && <div style={{ fontSize: 11.5, fontWeight: 700, color: d.col }}>{d.arrow} {d.txt}</div>}
                      </div>
                    </div>
                    <Spark def={activeDef} rows={activeRows} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 10.5, color: T.faint }}>
                      <span>{shortD(activeRows[0].created_at)}</span><span>{activeRows.length} misurazioni</span><span>{shortD(last.created_at)}</span>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </section>

        {/* Stato */}
        <section style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 14, padding: "15px 17px" }}>
          <div style={{ marginBottom: 4 }}>{plabel("Stato")}</div>
          {stat("Prossima seduta", nextAppt ? rel(nextAppt.start_at) : "—", nextAppt ? dayLabel(nextAppt.start_at) : "nessuna in agenda", "terapie")}
          {stat("Ultima seduta", lastAppt ? rel(lastAppt.start_at) : "—", lastAppt ? (lastAppt.is_paid ? "pagata" : "da incassare") : "nessuna svolta", "terapie")}
          {stat("Insoluti", unpaid.count > 0 ? <span style={{ color: T.red }}>€&nbsp;{unpaid.total.toFixed(2).replace(".", ",")}</span> : <span style={{ color: T.green }}>0</span>, unpaid.count > 0 ? `${unpaid.count} da saldare` : "tutto incassato", "terapie")}
          {stat("Consensi", <span style={{ color: consentsOk ? T.green : consents.pending ? T.amber : T.red }}>{consentsOk ? "Firmati" : consents.pending ? "In attesa" : "Mancanti"}</span>, null, "gdpr")}
          {stat("Sedute svolte", String(doneCount), null, "terapie")}
          {stat("Programma esercizi", programLabel ? <span style={{ color: programExpired ? T.amber : T.accent }}>{programLabel}</span> : "—", programLabel ? null : "nessuno attivo", "esercizi", true)}
        </section>
      </div>

      {lastNote && (lastNote.quick_note || lastNote.soap_s) && (
        <button onClick={onNavigate ? () => onNavigate("diario") : undefined}
          style={{ width: "100%", textAlign: "left", marginTop: 14, background: T.soft, border: `1px solid ${T.line}`, borderRadius: 14, padding: "13px 17px", cursor: onNavigate ? "pointer" : "default", fontFamily: "inherit" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
            {plabel("Dove eravamo")}<span style={{ fontSize: 11, color: T.faint }}>{rel(lastNote.created_at)}</span>
          </div>
          <div style={{ fontSize: 13, color: T.body, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{lastNote.quick_note || lastNote.soap_s}</div>
        </button>
      )}

      <style jsx>{`@media (max-width:720px){ .ov-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}
