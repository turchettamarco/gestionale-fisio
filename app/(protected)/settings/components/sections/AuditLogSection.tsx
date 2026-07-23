// ═══════════════════════════════════════════════════════════════════════
// AuditLogSection.tsx — Registro attività (mig. 073)
// ═══════════════════════════════════════════════════════════════════════
// Chi ha fatto cosa, e quando. Visibile solo a titolare e co-titolare:
// la RLS su audit_log fa già rispettare la regola, qui la sezione viene
// semplicemente nascosta agli altri.
//
// Il registro è di sola lettura: nessuno può correggerlo dall'applicazione,
// nemmeno il titolare. L'unica operazione consentita è la pulizia dello
// storico più vecchio, con un minimo di 30 giorni garantito dal database.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

const THEME = {
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  text: "#334155",
  muted: "#64748b",
  soft: "#f8fafc",
  accent: "#0f766e",
};

const PAGE_SIZE = 50;

/** Nomi tecnici → etichette leggibili. */
const TABLE_LABELS: Record<string, string> = {
  appointments: "Appuntamenti",
  patients: "Pazienti",
  studio_members: "Team e permessi",
  studios: "Impostazioni studio",
  patient_packages: "Pacchetti",
  package_payments: "Pagamenti pacchetti",
  clinical_assessments: "Valutazioni cliniche",
  clinical_goals: "Obiettivi clinici",
  convenzioni_enti: "Convenzioni",
  convenzioni_tariffe: "Tariffe convenzioni",
  studio_locations: "Sedi",
  studio_rooms: "Stanze",
  operator_schedules: "Turni",
  operator_unavailability: "Assenze",
  guest_practitioners: "Professionisti ospiti",
  patient_consents: "Consensi privacy",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Creazione",
  UPDATE: "Modifica",
  DELETE: "Eliminazione",
  READ: "Consultazione",
};

const ACTION_COLORS: Record<string, string> = {
  INSERT: "#0f766e",
  UPDATE: "#1d4ed8",
  DELETE: "#b91c1c",
  READ: "#64748b",
};

type AuditRow = {
  id: number;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  summary: string | null;
  changed: Record<string, { da: unknown; a: unknown }> | null;
  created_at: string;
};

type Props = {
  show: boolean;
  onToggle: () => void;
  studioId: string;
  /** Membri, per il filtro "chi" e per i nomi mancanti. */
  members: Array<{ user_id: string | null; display_name: string | null }>;
};

export default function AuditLogSection({ show, onToggle, studioId, members }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  // Filtri
  const [fActor, setFActor] = useState<string>("all");
  const [fTable, setFTable] = useState<string>("all");
  const [fAction, setFAction] = useState<string>("all");
  const [fDays, setFDays] = useState<number>(30);

  const [expanded, setExpanded] = useState<number | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState("");

  const nameByUser = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) if (x.user_id) m.set(x.user_id, x.display_name || "—");
    return m;
  }, [members]);

  const load = useCallback(async (p: number) => {
    if (!studioId) return;
    setLoading(true);
    setError("");
    let q = supabase
      .from("audit_log")
      .select("id, actor_id, actor_label, action, table_name, record_id, summary, changed, created_at")
      .eq("studio_id", studioId)
      .order("created_at", { ascending: false })
      .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);

    if (fActor !== "all") q = q.eq("actor_id", fActor);
    if (fTable !== "all") q = q.eq("table_name", fTable);
    if (fAction !== "all") q = q.eq("action", fAction);
    if (fDays > 0) {
      const since = new Date();
      since.setDate(since.getDate() - fDays);
      q = q.gte("created_at", since.toISOString());
    }

    const { data, error: err } = await q;
    setLoading(false);
    if (err) { setError(err.message); return; }
    const list = (data ?? []) as AuditRow[];
    setHasMore(list.length > PAGE_SIZE);
    setRows(list.slice(0, PAGE_SIZE));
  }, [studioId, fActor, fTable, fAction, fDays]);

  useEffect(() => {
    if (!show) return;
    setPage(0);
    void load(0);
  }, [show, load]);

  const purge = useCallback(async () => {
    if (!confirm("Eliminare le voci più vecchie di 12 mesi? L'operazione non è reversibile.")) return;
    setPurging(true);
    setPurgeMsg("");
    const { data, error: err } = await supabase.rpc("purge_audit_log", {
      p_studio_id: studioId,
      p_keep_days: 365,
    });
    setPurging(false);
    if (err) { setPurgeMsg("Errore: " + err.message); return; }
    setPurgeMsg(`${typeof data === "number" ? data : 0} voci rimosse.`);
    void load(0);
  }, [studioId, load]);

  const fmtValue = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "sì" : "no";
    if (typeof v === "object") return JSON.stringify(v);
    const s = String(v);
    return s.length > 120 ? s.slice(0, 120) + "…" : s;
  };

  const selectS: React.CSSProperties = {
    padding: "6px 9px", borderRadius: 7, border: `1px solid ${THEME.borderStrong}`,
    fontSize: 12, fontWeight: 600, color: THEME.text, background: "#fff",
    fontFamily: "inherit",
  };

  return (
    <div style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, marginBottom: 14, background: "#fff" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 16px", background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span>
          <span style={{ fontSize: 14, fontWeight: 800, color: THEME.text }}>Registro attività</span>
          <span style={{ display: "block", fontSize: 11.5, color: THEME.muted, marginTop: 2 }}>
            Chi ha creato, modificato o eliminato qualcosa. Sola lettura.
          </span>
        </span>
        <span style={{ fontSize: 13, color: THEME.muted }}>{show ? "▲" : "▼"}</span>
      </button>

      {show && (
        <div style={{ padding: "0 16px 16px" }}>
          {/* ── Filtri ─────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <select value={fActor} onChange={e => setFActor(e.target.value)} style={selectS}>
              <option value="all">Tutti gli utenti</option>
              {members.filter(m => m.user_id).map(m => (
                <option key={m.user_id!} value={m.user_id!}>{m.display_name || "—"}</option>
              ))}
            </select>
            <select value={fTable} onChange={e => setFTable(e.target.value)} style={selectS}>
              <option value="all">Tutte le aree</option>
              {Object.entries(TABLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select value={fAction} onChange={e => setFAction(e.target.value)} style={selectS}>
              <option value="all">Tutte le operazioni</option>
              <option value="INSERT">Creazioni</option>
              <option value="UPDATE">Modifiche</option>
              <option value="DELETE">Eliminazioni</option>
              <option value="READ">Consultazioni</option>
            </select>
            <select value={fDays} onChange={e => setFDays(Number(e.target.value))} style={selectS}>
              <option value={7}>Ultimi 7 giorni</option>
              <option value={30}>Ultimi 30 giorni</option>
              <option value={90}>Ultimi 3 mesi</option>
              <option value={365}>Ultimo anno</option>
              <option value={0}>Tutto</option>
            </select>
          </div>

          {error && (
            <div style={{
              padding: "9px 11px", borderRadius: 8, marginBottom: 10,
              background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
              color: "#7f1d1d", fontSize: 12, fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ fontSize: 12, color: THEME.muted, padding: 12 }}>Caricamento…</div>
          ) : rows.length === 0 ? (
            <div style={{ fontSize: 12, color: THEME.muted, padding: 12 }}>
              Nessuna attività registrata nel periodo selezionato.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {rows.map(r => {
                const when = new Date(r.created_at);
                const who = r.actor_label
                  || (r.actor_id ? nameByUser.get(r.actor_id) : null)
                  || (r.actor_id ? "Utente rimosso" : "Sistema");
                const isOpen = expanded === r.id;
                const nChanges = r.changed ? Object.keys(r.changed).length : 0;
                return (
                  <div key={r.id} style={{
                    border: `1px solid ${THEME.border}`, borderRadius: 8,
                    background: isOpen ? THEME.soft : "#fff",
                  }}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 11px", background: "transparent", border: "none",
                        cursor: nChanges > 0 ? "pointer" : "default", fontFamily: "inherit", textAlign: "left",
                      }}
                    >
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                        color: ACTION_COLORS[r.action] ?? THEME.muted,
                        minWidth: 78,
                      }}>
                        {ACTION_LABELS[r.action] ?? r.action}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: THEME.text, minWidth: 130 }}>
                        {who}
                      </span>
                      <span style={{ fontSize: 12, color: THEME.text, flex: 1, minWidth: 0 }}>
                        <strong style={{ fontWeight: 700 }}>{TABLE_LABELS[r.table_name] ?? r.table_name}</strong>
                        {r.summary ? <span style={{ color: THEME.muted }}> · {r.summary}</span> : null}
                      </span>
                      <span style={{ fontSize: 11, color: THEME.muted, whiteSpace: "nowrap" }}>
                        {when.toLocaleDateString("it-IT")} {when.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </button>

                    {isOpen && nChanges > 0 && (
                      <div style={{ padding: "0 11px 11px", borderTop: `1px solid ${THEME.border}` }}>
                        <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse", marginTop: 8 }}>
                          <thead>
                            <tr style={{ color: THEME.muted, textAlign: "left" }}>
                              <th style={{ padding: "3px 6px", fontWeight: 700 }}>Campo</th>
                              <th style={{ padding: "3px 6px", fontWeight: 700 }}>Prima</th>
                              <th style={{ padding: "3px 6px", fontWeight: 700 }}>Dopo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(r.changed ?? {}).map(([field, v]) => (
                              <tr key={field} style={{ borderTop: `1px solid ${THEME.border}` }}>
                                <td style={{ padding: "4px 6px", fontWeight: 600, color: THEME.text }}>{field}</td>
                                <td style={{ padding: "4px 6px", color: THEME.muted }}>{fmtValue(v?.da)}</td>
                                <td style={{ padding: "4px 6px", color: THEME.text }}>{fmtValue(v?.a)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Paginazione + manutenzione ─────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => { const p = Math.max(0, page - 1); setPage(p); void load(p); }}
              disabled={page === 0 || loading}
              style={{ ...selectS, cursor: page === 0 ? "default" : "pointer", opacity: page === 0 ? 0.5 : 1 }}
            >
              ← Precedenti
            </button>
            <span style={{ fontSize: 11.5, color: THEME.muted }}>Pagina {page + 1}</span>
            <button
              onClick={() => { const p = page + 1; setPage(p); void load(p); }}
              disabled={!hasMore || loading}
              style={{ ...selectS, cursor: hasMore ? "pointer" : "default", opacity: hasMore ? 1 : 0.5 }}
            >
              Successivi →
            </button>

            <span style={{ flex: 1 }} />

            <button onClick={purge} disabled={purging} style={{ ...selectS, cursor: "pointer", color: "#b91c1c" }}>
              {purging ? "Pulizia…" : "Elimina voci oltre 12 mesi"}
            </button>
            {purgeMsg && (
              <span style={{ fontSize: 11, fontWeight: 600, color: purgeMsg.startsWith("Errore") ? "#b91c1c" : THEME.accent }}>
                {purgeMsg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
