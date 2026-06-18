"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import AppNavbar from "@/src/components/AppNavbar";
import { TIPI_SPESA } from "@/src/lib/contabilita/tsTipiSpesa";
import {
  buildTsCsv,
  downloadTextFile,
  isPagamentoTracciato,
  paymentLabel,
  effectiveOpposizione,
  patientFullName,
  type SpesaRow,
} from "@/src/lib/contabilita/tsExport";

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  appBg: "#f1f5f9", panelBg: "#ffffff", soft: "#f7f9fd",
  text: "#0f172a", sub: "#1e293b", muted: "#64748b",
  border: "#e2e8f0", blue: "#2563eb", teal: "#0d9488", green: "#16a34a",
  red: "#dc2626", amber: "#f97316", gray: "#94a3b8",
  gradient: "linear-gradient(135deg,#0d9488,#2563eb)",
};

const euro2 = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dateITA(ymdOrIso: string | null): string {
  if (!ymdOrIso) return "—";
  const d = ymdOrIso.length > 10 ? new Date(ymdOrIso) : new Date(ymdOrIso + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const NOW_YEAR = new Date().getFullYear();
const YEARS = [NOW_YEAR, NOW_YEAR - 1, NOW_YEAR - 2];
const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export default function ContabilitaClient() {
  const [year, setYear] = useState<number>(NOW_YEAR);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "assign" | "export" | "sent">("");

  const [tsEnabled, setTsEnabled] = useState(false);
  const [tsDefault, setTsDefault] = useState("SP");
  const [onlyInvoiced, setOnlyInvoiced] = useState(true);
  const [month, setMonth] = useState<number>(0); // 0 = tutti i mesi
  const [sortKey, setSortKey] = useState<"date" | "name" | "payment">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc"); // default: piu' recenti prima

  const [rows, setRows] = useState<SpesaRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Config TS (per soggetto)
      const { data: uData } = await supabase.auth.getUser();
      const uid = uData?.user?.id;
      if (uid) {
        const { data: ps } = await supabase
          .from("practice_settings")
          .select("ts_enabled, ts_tipo_spesa_default")
          .eq("owner_id", uid)
          .maybeSingle();
        setTsEnabled(Boolean((ps as any)?.ts_enabled));
        setTsDefault(((ps as any)?.ts_tipo_spesa_default as string) || "SP");
      }

      // Spese dell'anno: sedute pagate, non ospiti, con paziente
      const { data, error: e } = await supabase
        .from("appointments")
        .select(
          "id, paid_at, amount, payment_method, price_type, is_paid, guest_practitioner_id, patient_id, ts_exclude, ts_opposizione, ts_tipo_spesa, ts_doc_number, ts_doc_year, ts_doc_date, ts_sent_at, patient:patients(first_name, last_name, tax_code, ts_opposizione)"
        )
        .eq("is_paid", true)
        .is("guest_practitioner_id", null)
        .not("patient_id", "is", null)
        .gte("paid_at", `${year}-01-01T00:00:00.000`)
        .lte("paid_at", `${year}-12-31T23:59:59.999`)
        .order("paid_at", { ascending: true });
      if (e) throw new Error(e.message);

      const mapped: SpesaRow[] = (data ?? []).map((r: any) => {
        const pat = Array.isArray(r.patient) ? r.patient[0] : r.patient;
        return {
          id: r.id,
          patient_id: r.patient_id ?? null,
          paid_at: r.paid_at ?? null,
          amount: r.amount ?? null,
          payment_method: r.payment_method ?? null,
          price_type: r.price_type ?? null,
          ts_exclude: r.ts_exclude ?? false,
          ts_tipo_spesa: r.ts_tipo_spesa ?? null,
          ts_opposizione: r.ts_opposizione ?? false,
          ts_doc_number: r.ts_doc_number ?? null,
          ts_doc_year: r.ts_doc_year ?? null,
          ts_doc_date: r.ts_doc_date ?? null,
          ts_sent_at: r.ts_sent_at ?? null,
          patient: pat
            ? {
                first_name: pat.first_name ?? null,
                last_name: pat.last_name ?? null,
                tax_code: pat.tax_code ?? null,
                ts_opposizione: pat.ts_opposizione ?? false,
              }
            : null,
        };
      });
      setRows(mapped);
    } catch (err: any) {
      setError(err?.message || "Errore di caricamento");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { void load(); }, [load]);

  // ─── Aggiornamenti per-riga (ottimistici) ─────────────────────────────
  async function patchRow(id: string, patch: Partial<SpesaRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const { error: e } = await supabase.from("appointments").update(patch as any).eq("id", id);
    if (e) { setError(e.message); void load(); }
  }

  // ─── Insiemi derivati ─────────────────────────────────────────────────
  const monthOf = (iso: string | null) => (iso ? new Date(iso).getMonth() + 1 : 0);

  // Base secondo il toggle fatturate, poi filtro mese.
  const monthFiltered = useMemo(() => {
    const base = onlyInvoiced ? rows.filter(r => r.price_type === "invoiced") : rows;
    return month > 0 ? base.filter(r => monthOf(r.paid_at) === month) : base;
  }, [rows, onlyInvoiced, month]);

  // Righe mostrate in tabella: filtrate + ordinate.
  const visibleRows = useMemo(() => {
    const arr = [...monthFiltered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "name") {
        const cmp = patientFullName(a.patient).localeCompare(patientFullName(b.patient), "it", { sensitivity: "base" });
        return cmp * dir;
      }
      if (sortKey === "payment") {
        const cmp = (a.payment_method || "").localeCompare(b.payment_method || "", "it");
        return cmp * dir;
      }
      // date
      const ta = a.paid_at ? new Date(a.paid_at).getTime() : 0;
      const tb = b.paid_at ? new Date(b.paid_at).getTime() : 0;
      return (ta - tb) * dir;
    });
    return arr;
  }, [monthFiltered, sortKey, sortDir]);

  // Ambito TS (statistiche + export): fatturate eleggibili dentro il filtro mese.
  const eligible = useMemo(
    () => monthFiltered.filter(r => r.price_type === "invoiced" && !r.ts_exclude && (r.amount ?? 0) > 0 && r.patient),
    [monthFiltered]
  );
  const senza_cf   = useMemo(() => eligible.filter(r => !r.patient?.tax_code), [eligible]);
  const contanti   = useMemo(() => eligible.filter(r => !isPagamentoTracciato(r.payment_method)), [eligible]);
  const da_numerare = useMemo(() => eligible.filter(r => r.ts_doc_number == null), [eligible]);
  const numerate   = useMemo(() => eligible.filter(r => r.ts_doc_number != null), [eligible]);
  const inviate    = useMemo(() => eligible.filter(r => r.ts_sent_at != null), [eligible]);
  const totale     = useMemo(() => eligible.reduce((s, r) => s + (r.amount ?? 0), 0), [eligible]);

  // Da numerare a livello ANNO (l'assegnazione numeri e' sempre annuale).
  const daNumerareYear = useMemo(
    () => rows.filter(r => r.price_type === "invoiced" && !r.ts_exclude && (r.amount ?? 0) > 0 && r.patient && r.ts_doc_number == null).length,
    [rows]
  );

  function onSort(key: "date" | "name" | "payment") {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  }

  // ─── Azioni ───────────────────────────────────────────────────────────
  async function doAssign() {
    setBusy("assign");
    setError("");
    try {
      const { data, error: e } = await supabase.rpc("assign_ts_doc_numbers");
      if (e) throw new Error(e.message);
      await load();
      const n = typeof data === "number" ? data : 0;
      alert(n > 0 ? `Assegnati ${n} numeri documento.` : "Nessun nuovo numero da assegnare.");
    } catch (err: any) {
      setError(err?.message || "Errore assegnazione numeri");
    } finally {
      setBusy("");
    }
  }

  function doExport() {
    if (numerate.length === 0) {
      alert("Nessuna spesa numerata da esportare. Assegna prima i numeri documento.");
      return;
    }
    setBusy("export");
    try {
      const sorted = [...numerate].sort((a, b) => (a.ts_doc_number ?? 0) - (b.ts_doc_number ?? 0));
      const csv = buildTsCsv(sorted, tsDefault);
      const suffix = month > 0 ? `-${String(month).padStart(2, "0")}` : "";
      downloadTextFile(`spese-sanitarie-TS-${year}${suffix}.csv`, csv);
    } finally {
      setBusy("");
    }
  }

  async function doMarkSent() {
    const target = numerate.filter(r => r.ts_sent_at == null);
    if (target.length === 0) { alert("Nessuna spesa numerata da marcare."); return; }
    if (!confirm(`Confermi di aver caricato ${target.length} spese sul portale Sistema TS? Verranno marcate come inviate.`)) return;
    setBusy("sent");
    setError("");
    try {
      const ids = target.map(r => r.id);
      const ts = new Date().toISOString();
      const { error: e } = await supabase.from("appointments").update({ ts_sent_at: ts } as any).in("id", ids);
      if (e) throw new Error(e.message);
      await load();
    } catch (err: any) {
      setError(err?.message || "Errore aggiornamento stato invio");
    } finally {
      setBusy("");
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: T.appBg }}>
      <AppNavbar active="contabilita" onRefresh={() => void load()} />

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 60px" }}>
        {/* Sub-header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: T.text }}>Contabilità</h1>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>Sistema Tessera Sanitaria · invio dati di spesa sanitaria</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", border: `1.5px solid ${T.border}`, borderRadius: 9, overflow: "hidden", background: "#fff" }}>
              <button
                onClick={() => setOnlyInvoiced(true)}
                style={{ padding: "7px 12px", fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer", background: onlyInvoiced ? T.teal : "#fff", color: onlyInvoiced ? "#fff" : T.muted }}
              >
                Solo fatturate
              </button>
              <button
                onClick={() => setOnlyInvoiced(false)}
                style={{ padding: "7px 12px", fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer", background: !onlyInvoiced ? T.teal : "#fff", color: !onlyInvoiced ? "#fff" : T.muted }}
              >
                Tutte
              </button>
            </div>
            <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>Anno</span>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 14, fontWeight: 700, color: T.text, background: "#fff", cursor: "pointer" }}
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 14, fontWeight: 700, color: T.text, background: "#fff", cursor: "pointer" }}
            >
              <option value={0}>Tutti i mesi</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Banner TS disattivato */}
        {!tsEnabled && (
          <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(249,115,22,0.08)", border: `1px solid ${T.amber}`, marginBottom: 18, fontSize: 13, color: T.sub }}>
            <strong style={{ color: T.text }}>Sistema TS non attivo.</strong> Per generare l&rsquo;export attivalo in{" "}
            <Link href="/settings" style={{ color: T.blue, fontWeight: 700 }}>Impostazioni → Dati fiscali</Link>{" "}
            e imposta il tipo spesa. Qui sotto vedi comunque le spese registrate.
          </div>
        )}

        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(220,38,38,0.08)", border: `1px solid ${T.red}`, marginBottom: 16, fontSize: 13, color: T.red }}>{error}</div>
        )}

        {/* Cards riepilogo */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          <Card label="Spese (anno)" value={String(eligible.length)} />
          <Card label="Totale incassato" value={euro2.format(totale)} />
          <Card label="Da numerare" value={String(da_numerare.length)} tone={da_numerare.length ? "amber" : "muted"} />
          <Card label="Già inviate" value={String(inviate.length)} tone={inviate.length ? "green" : "muted"} />
          <Card label="Senza CF" value={String(senza_cf.length)} tone={senza_cf.length ? "red" : "muted"} />
          <Card label="In contanti" value={String(contanti.length)} tone={contanti.length ? "amber" : "muted"} />
        </div>

        {/* Azioni */}
        {tsEnabled && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <Btn onClick={() => void doAssign()} disabled={busy !== ""} tone="teal">
              {busy === "assign" ? "Assegno…" : `Assegna numeri documento${daNumerareYear ? ` (${daNumerareYear})` : ""}`}
            </Btn>
            <Btn onClick={doExport} disabled={busy !== "" || numerate.length === 0} tone="blue">
              {busy === "export" ? "Genero…" : `Genera file Sistema TS (CSV)`}
            </Btn>
            <Btn onClick={() => void doMarkSent()} disabled={busy !== "" || numerate.filter(r => r.ts_sent_at == null).length === 0} tone="outline">
              {busy === "sent" ? "Aggiorno…" : "Segna come inviate"}
            </Btn>
          </div>
        )}

        {senza_cf.length > 0 && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(220,38,38,0.06)", border: `1px solid rgba(220,38,38,0.3)`, marginBottom: 14, fontSize: 12.5, color: T.red }}>
            ⚠️ {senza_cf.length} spese non hanno il codice fiscale del paziente: il Sistema TS lo richiede. Aggiungilo nella scheda paziente o escludile dall&rsquo;invio.
          </div>
        )}

        {/* Tabella */}
        <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: "center", color: T.muted, fontWeight: 600 }}>Caricamento spese…</div>
          ) : visibleRows.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: T.muted, fontWeight: 600 }}>
              {onlyInvoiced ? `Nessuna seduta fatturata nel ${year}.` : `Nessuna seduta pagata nel ${year}.`}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: T.soft, color: T.muted, textAlign: "left" }}>
                    <Th>N.</Th>
                    <SortableTh label="Data" col="date" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <SortableTh label="Paziente" col="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <Th>CF</Th><Th>Importo</Th>
                    <SortableTh label="Pagamento" col="payment" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                    <Th>Tipo spesa</Th>
                    <th style={{ padding: "10px 12px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }} title="Opposizione: il paziente non vuole che la spesa sia inviata all'Agenzia delle Entrate per il 730 precompilato">Opposiz.</th>
                    <Th>Escludi</Th><Th>Stato</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(r => {
                    const fatturata = r.price_type === "invoiced";
                    const tracciato = isPagamentoTracciato(r.payment_method);
                    const opp = effectiveOpposizione(r);
                    const excluded = !!r.ts_exclude;
                    const sent = !!r.ts_sent_at;
                    const cf = r.patient?.tax_code || "";
                    const locked = excluded || !fatturata;
                    return (
                      <tr key={r.id} style={{ borderTop: `1px solid ${T.border}`, opacity: (excluded || !fatturata) ? 0.5 : 1, background: sent ? "rgba(22,163,74,0.04)" : "transparent" }}>
                        <Td><span style={{ fontWeight: 700, color: r.ts_doc_number != null ? T.text : T.gray }}>{r.ts_doc_number ?? "—"}</span></Td>
                        <Td><span style={{ color: T.text }}>{dateITA(r.ts_doc_date || r.paid_at)}</span></Td>
                        <Td>
                          {r.patient_id ? (
                            <Link href={`/patients/${r.patient_id}`} style={{ fontWeight: 600, color: T.blue, textDecoration: "none" }}>
                              {patientFullName(r.patient) || "—"}
                            </Link>
                          ) : (
                            <span style={{ fontWeight: 600, color: T.text }}>{patientFullName(r.patient) || "—"}</span>
                          )}
                        </Td>
                        <Td>{cf ? <span style={{ fontFamily: "monospace", fontSize: 12, color: T.text }}>{cf.toUpperCase()}</span> : <span style={{ color: T.red, fontSize: 11, fontWeight: 700 }}>mancante</span>}</Td>
                        <Td><span style={{ fontWeight: 700, color: T.text }}>{euro2.format(r.amount ?? 0)}</span></Td>
                        <Td>
                          <span style={{ fontWeight: 600, color: tracciato ? T.text : T.amber }}>{paymentLabel(r.payment_method)}</span>
                          {!tracciato && r.payment_method === "cash" && (
                            <span style={{ display: "block", fontSize: 10, color: T.muted }}>non detraibile</span>
                          )}
                        </Td>
                        <Td>
                          {fatturata ? (
                            <select
                              value={r.ts_tipo_spesa || tsDefault}
                              onChange={e => void patchRow(r.id, { ts_tipo_spesa: e.target.value })}
                              disabled={locked}
                              style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12, background: "#fff", color: T.text, cursor: locked ? "not-allowed" : "pointer" }}
                            >
                              {TIPI_SPESA.map(t => <option key={t.code} value={t.code}>{t.code}</option>)}
                            </select>
                          ) : <span style={{ color: T.gray, fontSize: 12 }}>—</span>}
                        </Td>
                        <Td style={{ textAlign: "center" }}>
                          <input type="checkbox" checked={opp} disabled={locked}
                            onChange={e => void patchRow(r.id, { ts_opposizione: e.target.checked })}
                            style={{ width: 16, height: 16, cursor: locked ? "not-allowed" : "pointer", accentColor: T.amber }} />
                        </Td>
                        <Td style={{ textAlign: "center" }}>
                          <input type="checkbox" checked={excluded} disabled={!fatturata}
                            onChange={e => void patchRow(r.id, { ts_exclude: e.target.checked })}
                            style={{ width: 16, height: 16, cursor: !fatturata ? "not-allowed" : "pointer", accentColor: T.gray }} />
                        </Td>
                        <Td>{!fatturata ? <Badge tone="gray">Non fatturata</Badge> : sent ? <Badge tone="green">Inviata</Badge> : excluded ? <Badge tone="gray">Esclusa</Badge> : r.ts_doc_number != null ? <Badge tone="blue">Numerata</Badge> : <Badge tone="gray">Da numerare</Badge>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, fontSize: 11.5, color: T.muted, lineHeight: 1.7 }}>
          <div><strong style={{ color: T.sub }}>Come funziona:</strong> al Sistema TS vanno solo le sedute <strong>fatturate</strong>; le sedute in contanti non fatturate non si numerano e non vengono inviate. Premi <strong>Assegna numeri documento</strong> per dare il numero progressivo alle fatturate dell&rsquo;anno, poi <strong>Genera file Sistema TS</strong>.</div>
          <div style={{ marginTop: 6 }}><strong style={{ color: T.sub }}>Opposiz.</strong> = il paziente si oppone all&rsquo;invio della spesa all&rsquo;Agenzia delle Entrate (resta nei tuoi documenti ma non finisce nel suo 730 precompilato). <strong style={{ color: T.sub }}>Escludi</strong> = togli la singola seduta dall&rsquo;invio (es. fattura B2B a società/assicurazione).</div>
          <div style={{ marginTop: 6 }}>Cadenza 2026 annuale (dati {year} entro il 31 gennaio {year + 1}), con invii parziali possibili. La generazione dell&rsquo;XML conforme all&rsquo;XSD ufficiale è il passo successivo.</div>
        </div>
      </div>
    </div>
  );
}

// ─── UI atoms ─────────────────────────────────────────────────────────────────
function Card({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "green" | "amber" | "red" }) {
  const color = tone === "green" ? T.green : tone === "amber" ? T.amber : tone === "red" ? T.red : T.text;
  return (
    <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function Btn({ children, onClick, disabled, tone }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone: "teal" | "blue" | "outline" }) {
  const base: React.CSSProperties = { padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", border: "none", opacity: disabled ? 0.5 : 1 };
  const styles: React.CSSProperties =
    tone === "teal" ? { background: T.teal, color: "#fff" }
    : tone === "blue" ? { background: T.blue, color: "#fff" }
    : { background: "#fff", color: T.text, border: `1.5px solid ${T.border}` };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...styles }}>{children}</button>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" | "blue" | "gray" }) {
  const map = {
    green: { bg: "rgba(22,163,74,0.12)", c: T.green },
    amber: { bg: "rgba(249,115,22,0.12)", c: T.amber },
    blue: { bg: "rgba(37,99,235,0.12)", c: T.blue },
    gray: { bg: "rgba(148,163,184,0.16)", c: T.muted },
  }[tone];
  return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: map.bg, color: map.c }}>{children}</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "10px 12px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{children}</th>;
}
function SortableTh({ label, col, sortKey, sortDir, onSort }: {
  label: string;
  col: "date" | "name" | "payment";
  sortKey: "date" | "name" | "payment";
  sortDir: "asc" | "desc";
  onSort: (k: "date" | "name" | "payment") => void;
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{ padding: "10px 12px", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", color: active ? T.teal : undefined }}
      title="Clicca per ordinare"
    >
      {label}{" "}
      <span style={{ opacity: active ? 1 : 0.3 }}>{active ? (sortDir === "asc" ? "▲" : "▼") : "▾"}</span>
    </th>
  );
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "9px 12px", whiteSpace: "nowrap", color: T.text, ...style }}>{children}</td>;
}
