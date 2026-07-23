// ═══════════════════════════════════════════════════════════════════════
// OperatorHandoverForm.tsx — Sostituzione e passaggio consegne (Tappa L)
// ═══════════════════════════════════════════════════════════════════════
// "Elena si è data malata giovedì": riassegna in blocco gli appuntamenti di
// un operatore a un collega, in un periodo scelto.
//
// FLUSSO IN DUE TEMPI, di proposito:
//   1. ANTEPRIMA — mostra esattamente cosa succederà, appuntamento per
//      appuntamento, segnalando quelli che il sostituto non può prendere
//      perché già occupato in quell'orario o perché assente.
//   2. CONFERMA — applica solo gli appuntamenti trasferibili. Quelli in
//      conflitto restano all'operatore originale e vengono elencati, così
//      sai quali sistemare a mano invece di scoprirli dopo.
//
// Ogni riassegnazione passa dai trigger di audit (mig. 073): nel registro
// attività resta traccia di chi ha spostato cosa.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { translateError } from "@/src/lib/translateError";

const THEME = {
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  text: "#334155",
  muted: "#64748b",
  soft: "#f8fafc",
  accent: "#0f766e",
  warn: "#92400e",
};

type ApptRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  room_id: string | null;
  patient_name: string;
  /** Motivo per cui NON è trasferibile (null = trasferibile) */
  blocked: string | null;
};

type Props = {
  studioId: string;
  /** Operatore da sostituire */
  fromUserId: string;
  fromName: string;
  /** Colleghi selezionabili come sostituti (solo registrati) */
  members: Array<{ user_id: string | null; display_name: string | null }>;
  onClose: () => void;
  onDone: () => void;
};

export default function OperatorHandoverForm({
  studioId, fromUserId, fromName, members, onClose, onDone,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [toUserId, setToUserId] = useState<string>("");
  const [rows, setRows] = useState<ApptRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<string>("");

  const candidates = useMemo(
    () => members.filter(m => m.user_id && m.user_id !== fromUserId),
    [members, fromUserId]
  );

  const transferable = useMemo(() => (rows ?? []).filter(r => !r.blocked), [rows]);
  const blocked = useMemo(() => (rows ?? []).filter(r => r.blocked), [rows]);

  // ── Anteprima ─────────────────────────────────────────────────────────
  const preview = useCallback(async () => {
    if (!toUserId) { setError("Scegli il collega che prende le sedute."); return; }
    if (dateTo < dateFrom) { setError("La data di fine è precedente a quella di inizio."); return; }
    setLoading(true); setError(""); setResult(""); setRows(null);

    const startISO = new Date(`${dateFrom}T00:00:00`).toISOString();
    const endISO = new Date(`${dateTo}T23:59:59`).toISOString();

    // Appuntamenti da spostare
    const { data: mine, error: e1 } = await supabase
      .from("appointments")
      .select("id, start_at, end_at, status, room_id, patients:patient_id(first_name,last_name)")
      .eq("studio_id", studioId)
      .eq("operator_id", fromUserId)
      .neq("status", "cancelled")
      .gte("start_at", startISO)
      .lte("start_at", endISO)
      .order("start_at", { ascending: true });

    if (e1) { setLoading(false); setError(translateError(e1)); return; }

    // Impegni già presenti del sostituto nello stesso periodo
    const { data: theirs } = await supabase
      .from("appointments")
      .select("start_at, end_at")
      .eq("studio_id", studioId)
      .eq("operator_id", toUserId)
      .neq("status", "cancelled")
      .gte("start_at", startISO)
      .lte("start_at", endISO);

    // Assenze del sostituto (ferie/malattia)
    const { data: unav } = await supabase
      .from("operator_unavailability")
      .select("start_at, end_at, reason")
      .eq("studio_id", studioId)
      .eq("operator_id", toUserId);

    const busy = (theirs ?? []).map(t => ({
      s: new Date(t.start_at as string).getTime(),
      e: new Date(t.end_at as string).getTime(),
    }));
    const away = (unav ?? []).map(u => ({
      s: new Date(u.start_at as string).getTime(),
      e: new Date(u.end_at as string).getTime(),
      reason: (u.reason as string | null) ?? null,
    }));

    const list: ApptRow[] = (mine ?? []).map(a => {
      const s = new Date(a.start_at as string).getTime();
      const e = new Date(a.end_at as string).getTime();
      const p = a.patients as unknown as { first_name?: string; last_name?: string } | null;
      const name = p ? `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() || "—" : "—";

      let blockedReason: string | null = null;
      if (busy.some(b => !(b.e <= s || b.s >= e))) {
        blockedReason = "già occupato in quell'orario";
      } else {
        const a2 = away.find(u => !(u.e <= s || u.s >= e));
        if (a2) blockedReason = `assente${a2.reason ? ` (${a2.reason})` : ""}`;
      }

      return {
        id: a.id as string,
        start_at: a.start_at as string,
        end_at: a.end_at as string,
        status: a.status as string,
        room_id: (a.room_id as string | null) ?? null,
        patient_name: name,
        blocked: blockedReason,
      };
    });

    setRows(list);
    setLoading(false);
  }, [studioId, fromUserId, toUserId, dateFrom, dateTo]);

  // ── Applica ───────────────────────────────────────────────────────────
  const apply = useCallback(async () => {
    if (transferable.length === 0) return;
    const toName = candidates.find(c => c.user_id === toUserId)?.display_name || "il collega";
    if (!confirm(`Trasferire ${transferable.length} appuntamenti da ${fromName} a ${toName}?`)) return;

    setApplying(true); setError(""); setResult("");
    let ok = 0;
    const failed: string[] = [];

    // Uno per uno invece che in blocco: se il database rifiuta una riga
    // (vincolo anti doppia prenotazione, mig. 074) le altre passano lo
    // stesso e sappiamo esattamente quale ha fallito.
    for (const r of transferable) {
      const { error: e } = await supabase
        .from("appointments")
        .update({ operator_id: toUserId })
        .eq("id", r.id);
      if (e) failed.push(`${r.patient_name}: ${translateError(e)}`);
      else ok++;
    }

    setApplying(false);
    setResult(
      `${ok} appuntamenti trasferiti a ${toName}.` +
      (failed.length ? ` ${failed.length} non trasferiti.` : "") +
      (blocked.length ? ` ${blocked.length} lasciati a ${fromName} per conflitto.` : "")
    );
    if (failed.length) setError(failed.slice(0, 3).join(" · "));
    await preview();
    onDone();
  }, [transferable, blocked.length, toUserId, candidates, fromName, preview, onDone]);

  const inputS: React.CSSProperties = {
    padding: "6px 9px", borderRadius: 7, border: `1px solid ${THEME.borderStrong}`,
    fontSize: 12, fontWeight: 600, color: THEME.text, background: "#fff", fontFamily: "inherit",
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div style={{ marginTop: 10, padding: 16, borderRadius: 10, border: `1px solid ${THEME.border}`, background: THEME.soft }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <strong style={{ fontSize: 13, color: THEME.text }}>Sostituisci {fromName}</strong>
        <button onClick={onClose} style={{ ...inputS, cursor: "pointer" }}>Chiudi</button>
      </div>
      <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 12, lineHeight: 1.5 }}>
        Trasferisce gli appuntamenti a un collega nel periodo indicato. Prima vedi l&apos;anteprima,
        poi confermi: nulla viene modificato finché non premi Trasferisci.
      </div>

      {/* ── Parametri ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: THEME.muted }}>Dal</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputS} />
        <label style={{ fontSize: 11.5, fontWeight: 700, color: THEME.muted }}>al</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputS} />
        <label style={{ fontSize: 11.5, fontWeight: 700, color: THEME.muted }}>a</label>
        <select value={toUserId} onChange={e => setToUserId(e.target.value)} style={inputS}>
          <option value="">Scegli collega…</option>
          {candidates.map(c => (
            <option key={c.user_id!} value={c.user_id!}>{c.display_name || "—"}</option>
          ))}
        </select>
        <button onClick={preview} disabled={loading} style={{ ...inputS, cursor: "pointer", fontWeight: 700 }}>
          {loading ? "Verifica…" : "Anteprima"}
        </button>
      </div>

      {error && (
        <div style={{
          padding: "9px 11px", borderRadius: 8, marginBottom: 10,
          background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
          color: "#7f1d1d", fontSize: 12, fontWeight: 600,
        }}>{error}</div>
      )}
      {result && (
        <div style={{
          padding: "9px 11px", borderRadius: 8, marginBottom: 10,
          background: "rgba(15,118,110,0.07)", border: "1px solid rgba(15,118,110,0.25)",
          color: THEME.accent, fontSize: 12, fontWeight: 700,
        }}>{result}</div>
      )}

      {/* ── Anteprima ─────────────────────────────────────────── */}
      {rows && (
        rows.length === 0 ? (
          <div style={{ fontSize: 12, color: THEME.muted, padding: 8 }}>
            Nessun appuntamento di {fromName} nel periodo scelto.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: THEME.text, fontWeight: 700, marginBottom: 6 }}>
              {transferable.length} trasferibili
              {blocked.length > 0 && <span style={{ color: THEME.warn }}> · {blocked.length} in conflitto</span>}
            </div>
            <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${THEME.border}`, borderRadius: 8, background: "#fff" }}>
              {rows.map(r => (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "7px 10px", borderBottom: `1px solid ${THEME.border}`,
                  opacity: r.blocked ? 0.65 : 1,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: r.blocked ? "#f59e0b" : THEME.accent,
                  }} />
                  <span style={{ fontSize: 11.5, color: THEME.muted, minWidth: 92 }}>{fmt(r.start_at)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: THEME.text, flex: 1, minWidth: 0 }}>
                    {r.patient_name}
                  </span>
                  {r.blocked && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: THEME.warn, whiteSpace: "nowrap" }}>
                      {r.blocked}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={apply}
              disabled={applying || transferable.length === 0}
              style={{
                marginTop: 12, padding: "8px 16px", borderRadius: 7, border: "none",
                background: transferable.length === 0 ? THEME.borderStrong : THEME.accent,
                color: "#fff", fontSize: 12, fontWeight: 700,
                cursor: transferable.length === 0 ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {applying ? "Trasferimento…" : `Trasferisci ${transferable.length} appuntamenti`}
            </button>
            {blocked.length > 0 && (
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 8, lineHeight: 1.5 }}>
                Gli appuntamenti in conflitto restano a {fromName}: vanno spostati a mano dal calendario,
                oppure prova con un altro collega o un periodo più stretto.
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
