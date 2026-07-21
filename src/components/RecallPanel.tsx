"use client";

// ═══════════════════════════════════════════════════════════════════════
// RecallPanel — Pazienti da richiamare
// ═══════════════════════════════════════════════════════════════════════
//
// Trova i pazienti "dormienti": ultima seduta più vecchia della soglia
// scelta (3/6/12 mesi), nessun appuntamento futuro in agenda. Per ognuno:
// da quanto manca, ultima visita, WhatsApp col messaggio di riattivazione
// precompilato (modificabile prima dell'invio, come sempre su wa.me) e
// "segna contattato" che lo toglie dalla lista per 60 giorni.
//
// Il contatto è salvato su patients.last_recall_at (mig. 063), quindi vale
// su tutti i dispositivi. Riempire sedie con pazienti che ti conoscono già
// è il marketing più economico che esista: questa lista è quel marketing.
// ═══════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { openWhatsApp } from "@/src/lib/whatsapp";

const T = {
  teal: "#0d9488", blue: "#2563eb", text: "#0f172a", muted: "#64748b",
  border: "#e2e8f0", soft: "#f8fafc", red: "#dc2626", amber: "#f59e0b",
};

type RecallRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  lastVisit: Date | null;
  monthsAgo: number;
  last_recall_at: string | null;
};

const SOGLIE = [3, 6, 12];
/** Dopo un contatto, il paziente sparisce dalla lista per questo periodo. */
const GIORNI_SILENZIO_POST_CONTATTO = 60;

export function RecallPanel({
  open, onClose, studioId, studioName, displayName,
}: {
  open: boolean;
  onClose: () => void;
  studioId: string;
  studioName?: string | null;
  /** Passa il displayName della Privacy Mode per mascherare i nomi a video. */
  displayName?: (full: string) => string;
}) {
  const [months, setMonths] = useState(3);
  const [rows, setRows] = useState<RecallRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [contacted, setContacted] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!studioId) return;
    setLoading(true);
    try {
      // Due query leggere, aggregazione in memoria: l'ultima visita per
      // paziente e la presenza di appuntamenti futuri.
      const [patsRes, apptsRes] = await Promise.all([
        supabase.from("patients")
          .select("id, first_name, last_name, phone, last_recall_at")
          .eq("studio_id", studioId),
        supabase.from("appointments")
          .select("patient_id, start_at, status")
          .eq("studio_id", studioId)
          .neq("status", "cancelled")
          .not("patient_id", "is", null),
      ]);
      const pats = (patsRes.data as {
        id: string; first_name: string | null; last_name: string | null;
        phone: string | null; last_recall_at: string | null;
      }[]) || [];
      const appts = (apptsRes.data as { patient_id: string; start_at: string }[]) || [];

      const now = Date.now();
      const lastByPatient = new Map<string, number>();
      const hasFuture = new Set<string>();
      for (const a of appts) {
        const t = new Date(a.start_at).getTime();
        if (t > now) { hasFuture.add(a.patient_id); continue; }
        const prev = lastByPatient.get(a.patient_id);
        if (!prev || t > prev) lastByPatient.set(a.patient_id, t);
      }

      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      const silence = GIORNI_SILENZIO_POST_CONTATTO * 86_400_000;

      const out: RecallRow[] = [];
      for (const p of pats) {
        if (hasFuture.has(p.id)) continue;               // ha già un futuro in agenda
        const last = lastByPatient.get(p.id);
        if (!last) continue;                             // mai venuto: non è un "richiamo"
        if (last > cutoff.getTime()) continue;           // troppo recente per la soglia
        if (p.last_recall_at && now - new Date(p.last_recall_at).getTime() < silence) continue;
        out.push({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          phone: p.phone,
          lastVisit: new Date(last),
          monthsAgo: Math.floor((now - last) / (30.44 * 86_400_000)),
          last_recall_at: p.last_recall_at,
        });
      }
      // Prima chi manca da più tempo: è il più a rischio di perdersi.
      out.sort((a, b) => (a.lastVisit?.getTime() ?? 0) - (b.lastVisit?.getTime() ?? 0));
      setRows(out);
    } finally {
      setLoading(false);
    }
  }, [studioId, months]);

  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => { if (!open) { setContacted(new Set()); setRows(null); } }, [open]);

  const nameOf = useCallback((r: RecallRow) => {
    const full = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Paziente";
    return displayName ? displayName(full) : full;
  }, [displayName]);

  const markContacted = useCallback(async (r: RecallRow) => {
    setContacted(prev => new Set(prev).add(r.id));
    await supabase.from("patients")
      .update({ last_recall_at: new Date().toISOString() })
      .eq("id", r.id);
  }, []);

  const proponi = useCallback((r: RecallRow) => {
    // Il nome nel messaggio è SEMPRE quello vero: parte sul telefono del
    // paziente, la Privacy Mode riguarda solo lo schermo dello studio.
    const nomeVero = (r.first_name ?? "").trim() || "";
    const firma = studioName ? ` — ${studioName}` : "";
    const msg =
      `Ciao${nomeVero ? " " + nomeVero : ""}! È passato un po' dall'ultima seduta ` +
      `e volevo sapere come stai. Se senti il bisogno di un controllo o di ` +
      `riprendere il percorso, dimmi pure: ti trovo volentieri un posto in agenda.${firma}`;
    const ok = openWhatsApp(r.phone, msg);
    if (ok) void markContacted(r);
  }, [studioName, markContacted]);

  const visibleRows = useMemo(
    () => (rows || []).filter(r => !contacted.has(r.id)),
    [rows, contacted],
  );

  if (!open) return null;

  const chip = (on: boolean): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
    border: `1.5px solid ${on ? T.teal : T.border}`,
    background: on ? T.teal : "#fff", color: on ? "#fff" : T.muted,
    cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 240, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "#fff", borderRadius: 14,
          boxShadow: "0 20px 60px rgba(15,23,42,0.3)", overflow: "hidden",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${T.border}`,
          background: "linear-gradient(135deg, rgba(13,148,136,0.06), rgba(37,99,235,0.06))",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>🔔 Da richiamare</div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
              Pazienti senza sedute recenti né appuntamenti futuri
            </div>
          </div>
          <button onClick={onClose} aria-label="Chiudi" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: T.muted, fontWeight: 700 }}>✕</button>
        </div>

        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: T.muted }}>NON VIENE DA</span>
          {SOGLIE.map(m => (
            <button key={m} onClick={() => setMonths(m)} style={chip(months === m)}>{m} mesi</button>
          ))}
          <span style={{ flex: 1 }} />
          {rows && <span style={{ fontSize: 11.5, fontWeight: 800, color: T.text }}>{visibleRows.length}</span>}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px 14px" }}>
          {loading && <div style={{ padding: 22, textAlign: "center", color: T.muted, fontSize: 12.5 }}>Cerco…</div>}
          {!loading && rows && visibleRows.length === 0 && (
            <div style={{ padding: "22px 12px", textAlign: "center", color: T.muted, fontSize: 12.5, lineHeight: 1.6 }}>
              Nessun paziente da richiamare con questa soglia. 👏
            </div>
          )}
          {!loading && visibleRows.map(r => (
            <div key={r.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              border: `1px solid ${T.border}`, borderRadius: 10,
              padding: "10px 12px", marginBottom: 7, background: "#fff",
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {nameOf(r)}
                </div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                  ultima seduta {r.lastVisit?.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}
                  <strong style={{ color: r.monthsAgo >= 6 ? T.red : T.amber }}>{r.monthsAgo} mes{r.monthsAgo === 1 ? "e" : "i"} fa</strong>
                </div>
              </div>
              <button
                onClick={() => markContacted(r)}
                title="Segna come contattato senza inviare (sparisce per 60 giorni)"
                style={{
                  padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`,
                  background: "#fff", color: T.muted, fontWeight: 700, fontSize: 11,
                  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                }}
              >✓ Fatto</button>
              <button
                onClick={() => proponi(r)}
                disabled={!r.phone}
                title={r.phone ? "Apri WhatsApp col messaggio di riattivazione" : "Nessun numero di telefono"}
                style={{
                  padding: "7px 12px", borderRadius: 8, border: "none",
                  background: r.phone ? "#25D366" : "#cbd5e1", color: "#fff",
                  fontWeight: 700, fontSize: 11.5, cursor: r.phone ? "pointer" : "default",
                  fontFamily: "inherit", whiteSpace: "nowrap",
                }}
              >📲 Richiama</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
