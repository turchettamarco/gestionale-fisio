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
  effectiveOpposizione,
  effectiveTipoSpesa,
  patientFullName,
  docNumber,
  hasDocNumber,
  type SpesaRow,
} from "@/src/lib/contabilita/tsExport";
import PaidPill from "@/src/components/PaidPill";
import type { PaymentMethod } from "@/src/components/PaidPopover";

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
  const [busy, setBusy] = useState<"" | "assign" | "export" | "sent" | "reset" | "import" | "xml" | "invio" | "esito" | "ricevuta">("");

  const [tsEnabled, setTsEnabled] = useState(false);
  const [tsDefault, setTsDefault] = useState("SP");
  const [numberingMode, setNumberingMode] = useState<"external" | "fisiohub">("external");
  const [tsCfProprietario, setTsCfProprietario] = useState("");
  const [tsPiva, setTsPiva] = useState("");
  const [tsDispositivo, setTsDispositivo] = useState(1);
  const [tsRegimeForfettario, setTsRegimeForfettario] = useState(true);
  const [tsWsUser, setTsWsUser] = useState("");
  const [tsWsPassword, setTsWsPassword] = useState("");
  const [tsWsPincode, setTsWsPincode] = useState("");
  const [tsWsAmbiente, setTsWsAmbiente] = useState<"test" | "prod">("test");
  const [tsInvioEmailEnabled, setTsInvioEmailEnabled] = useState(true);
  const [invioMsg, setInvioMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [onlyInvoiced, setOnlyInvoiced] = useState(true);
  const [month, setMonth] = useState<number>(0); // 0 = tutti i mesi
  const [sortKey, setSortKey] = useState<"date" | "name" | "payment">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc"); // default: piu' recenti prima

  const [rows, setRows] = useState<SpesaRow[]>([]);
  const [editRow, setEditRow] = useState<SpesaRow | null>(null);
  const [showImport, setShowImport] = useState(false);

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
          .select("ts_enabled, ts_tipo_spesa_default, ts_numbering_mode, ts_cf_proprietario, ts_dispositivo, ts_regime_forfettario, vat_number, ts_ws_user, ts_ws_password, ts_ws_pincode, ts_ws_ambiente, ts_invio_email_enabled")
          .eq("owner_id", uid)
          .maybeSingle();
        setTsEnabled(Boolean((ps as any)?.ts_enabled));
        setTsDefault(((ps as any)?.ts_tipo_spesa_default as string) || "SP");
        setNumberingMode(((ps as any)?.ts_numbering_mode as string) === "fisiohub" ? "fisiohub" : "external");
        setTsCfProprietario(((ps as any)?.ts_cf_proprietario as string || "").toUpperCase());
        setTsPiva(((ps as any)?.vat_number as string || "").trim());
        setTsDispositivo(Number((ps as any)?.ts_dispositivo ?? 1) || 1);
        setTsRegimeForfettario((ps as any)?.ts_regime_forfettario !== false);
        setTsWsUser(((ps as any)?.ts_ws_user as string || "").trim());
        setTsWsPassword(((ps as any)?.ts_ws_password as string) || "");
        setTsWsPincode(((ps as any)?.ts_ws_pincode as string || "").trim());
        setTsWsAmbiente((ps as any)?.ts_ws_ambiente === "prod" ? "prod" : "test");
        setTsInvioEmailEnabled((ps as any)?.ts_invio_email_enabled !== false);
      }

      // Spese dell'anno: sedute pagate, non ospiti, con paziente
      const { data, error: e } = await supabase
        .from("appointments")
        .select(
          "id, paid_at, start_at, amount, payment_method, price_type, is_paid, guest_practitioner_id, patient_id, ts_exclude, ts_opposizione, ts_tipo_spesa, ts_doc_number, ts_doc_ref, ts_doc_year, ts_doc_date, ts_sent_at, ts_protocollo, ts_esito, patient:patients(first_name, last_name, tax_code, ts_opposizione)"
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
          session_at: r.start_at ?? null,
          amount: r.amount ?? null,
          payment_method: r.payment_method ?? null,
          price_type: r.price_type ?? null,
          ts_exclude: r.ts_exclude ?? false,
          ts_tipo_spesa: r.ts_tipo_spesa ?? null,
          ts_opposizione: r.ts_opposizione ?? false,
          ts_doc_number: r.ts_doc_number ?? null,
          ts_doc_ref: r.ts_doc_ref ?? null,
          ts_doc_year: r.ts_doc_year ?? null,
          ts_doc_date: r.ts_doc_date ?? null,
          ts_sent_at: r.ts_sent_at ?? null,
          ts_protocollo: r.ts_protocollo ?? null,
          ts_esito: r.ts_esito ?? null,
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

  // Ricarica quando si torna sulla pagina (es. dopo aver corretto l'appuntamento
  // nel calendario), così le modifiche compaiono senza azioni manuali.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  // ─── Aggiornamenti per-riga (ottimistici) ─────────────────────────────
  async function patchRow(id: string, patch: Partial<SpesaRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const { error: e } = await supabase.from("appointments").update(patch as any).eq("id", id);
    if (e) { setError(e.message); void load(); }
  }

  // Aggiornamento pagamento dal PaidPill (inline, senza lasciare Contabilità).
  async function onPaidUpdate(id: string, next: { is_paid: boolean; paid_at: string | null; payment_method: PaymentMethod | null }) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, payment_method: next.payment_method, paid_at: next.paid_at } : r)));
    const { error: e } = await supabase.from("appointments").update({
      is_paid: next.is_paid,
      paid_at: next.paid_at,
      payment_method: next.payment_method,
    } as any).eq("id", id);
    if (e) { setError(e.message); void load(); return; }
    // Se l'appuntamento non è più "pagato" esce dall'elenco: ricarico.
    if (!next.is_paid) void load();
  }

  // Salvataggio dalla finestra "Modifica spesa" (apre l'appuntamento in Contabilità).
  async function saveEditRow(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const { error: e } = await supabase.from("appointments").update(patch as any).eq("id", id);
    if (e) { setError(e.message); return false; }
    await load();
    return true;
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
  const da_numerare = useMemo(() => eligible.filter(r => !hasDocNumber(r)), [eligible]);
  const numerate   = useMemo(() => eligible.filter(r => hasDocNumber(r)), [eligible]);
  const inviate    = useMemo(() => eligible.filter(r => r.ts_sent_at != null), [eligible]);
  const totale     = useMemo(() => eligible.reduce((s, r) => s + (r.amount ?? 0), 0), [eligible]);

  // Da numerare a livello ANNO (l'assegnazione numeri e' sempre annuale).
  const daNumerareYear = useMemo(
    () => rows.filter(r => r.price_type === "invoiced" && !r.ts_exclude && (r.amount ?? 0) > 0 && r.patient && !hasDocNumber(r)).length,
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
      const sorted = [...numerate].sort((a, b) => docNumber(a).localeCompare(docNumber(b), undefined, { numeric: true }));
      const csv = buildTsCsv(sorted, tsDefault);
      const suffix = month > 0 ? `-${String(month).padStart(2, "0")}` : "";
      downloadTextFile(`spese-sanitarie-TS-${year}${suffix}.csv`, csv);
    } finally {
      setBusy("");
    }
  }

  // Costruisce l'elenco documenti per TS (raggruppati per numero documento).
  function buildTsDocuments(): { documents: any[]; skippedNoCf: number; includedIds: string[] } {
    const map = new Map<string, SpesaRow[]>();
    for (const r of numerate) {
      const key = docNumber(r);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    let skippedNoCf = 0;
    const documents: any[] = [];
    const includedIds: string[] = [];
    for (const g of Array.from(map.values())) {
      const first = g[0];
      const opp = g.some(effectiveOpposizione);
      const cf = (first.patient?.tax_code || "").trim().toUpperCase();
      if (!cf && !opp) { skippedNoCf++; continue; }
      for (const x of g) includedIds.push(x.id);
      documents.push({
        paziente: patientFullName(first.patient) || "—",
        numDocumento: docNumber(first),
        dataEmissione: toDateInputValue(first.ts_doc_date || first.paid_at),
        dataPagamento: toDateInputValue(first.paid_at),
        cfCittadino: cf,
        pagamentoTracciato: g.every(x => isPagamentoTracciato(x.payment_method)) ? "SI" : "NO",
        flagOpposizione: opp ? "1" : "0",
        tipoSpesa: effectiveTipoSpesa(first, tsDefault),
        importo: g.reduce((s, x) => s + (x.amount ?? 0), 0),
      });
    }
    return { documents, skippedNoCf, includedIds };
  }

  // Genera il file XML ufficiale Sistema TS (CF cifrati lato server con SanitelCF.cer).
  async function doExportXml() {
    if (numerate.length === 0) {
      alert("Nessuna spesa numerata da esportare. Numera/abbina prima i documenti.");
      return;
    }
    if (!tsCfProprietario || !tsPiva) {
      setError("Per l'XML servono il tuo codice fiscale e la partita IVA in Impostazioni → Sistema TS.");
      return;
    }
    setBusy("xml");
    setError("");
    try {
      const { documents, skippedNoCf } = buildTsDocuments();
      if (documents.length === 0) {
        setError("Nessun documento inviabile: mancano i codici fiscali dei pazienti.");
        return;
      }
      const suffix = month > 0 ? `-${String(month).padStart(2, "0")}` : "";
      const base = `spese-sanitarie-TS-${year}${suffix}`;
      const res = await fetch("/api/ts-xml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cfProprietario: tsCfProprietario,
          pIva: tsPiva,
          dispositivo: tsDispositivo,
          naturaIVA: tsRegimeForfettario ? "N2.2" : "N4",
          fileName: base,
          documents,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j.error || "Errore nella generazione dell'XML");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (skippedNoCf > 0) {
        setError(`File ZIP generato. Nota: ${skippedNoCf} document${skippedNoCf > 1 ? "i" : "o"} senza codice fiscale ${skippedNoCf > 1 ? "esclusi" : "escluso"} (CF obbligatorio salvo opposizione).`);
      }
    } catch (e: any) {
      setError(e?.message || "Errore nella generazione dell'XML");
    } finally {
      setBusy("");
    }
  }

  // Invia il file direttamente al Sistema TS via Web Service (SOAP MTOM).
  async function doInvio() {
    if (numerate.length === 0) {
      alert("Nessuna spesa numerata da inviare. Numera/abbina prima i documenti.");
      return;
    }
    if (!tsCfProprietario || !tsPiva) {
      setError("Per l'invio servono il tuo codice fiscale e la partita IVA in Impostazioni → Sistema TS.");
      return;
    }
    if (!tsWsUser || !tsWsPassword || !tsWsPincode) {
      setError("Credenziali Web Service mancanti: inseriscile in Impostazioni → Sistema TS.");
      return;
    }
    const ambienteLabel = tsWsAmbiente === "prod" ? "PRODUZIONE (invio reale)" : "TEST (collaudo)";
    if (!confirm(`Invio al Sistema TS in ambiente ${ambienteLabel}.\n\nDocumenti numerati del periodo selezionato. Procedere?`)) return;

    setBusy("invio");
    setError("");
    setInvioMsg(null);
    try {
      const { documents, skippedNoCf, includedIds } = buildTsDocuments();
      if (documents.length === 0) {
        setError("Nessun documento inviabile: mancano i codici fiscali dei pazienti.");
        return;
      }
      const suffix = month > 0 ? `-${String(month).padStart(2, "0")}` : "";
      const base = `spese-sanitarie-TS-${year}${suffix}`;
      const res = await fetch("/api/ts-invio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cfProprietario: tsCfProprietario,
          pIva: tsPiva,
          dispositivo: tsDispositivo,
          naturaIVA: tsRegimeForfettario ? "N2.2" : "N4",
          fileName: base,
          documents,
          wsUser: tsWsUser,
          wsPassword: tsWsPassword,
          wsPincode: tsWsPincode,
          ambiente: tsWsAmbiente,
        }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || j.error) {
        setInvioMsg({ ok: false, text: j.error || `Errore invio (HTTP ${res.status}).` });
        return;
      }
      if (j.ok) {
        // Punto 2: marca come inviate le spese incluse e salva il protocollo
        if (includedIds.length > 0) {
          const ts = new Date().toISOString();
          await supabase.from("appointments").update({ ts_sent_at: ts, ts_protocollo: j.protocollo ?? null } as any).in("id", includedIds);
          await load();
        }
        const extra = skippedNoCf > 0 ? ` — ${skippedNoCf} senza CF esclusi.` : "";
        const prot = j.protocollo ? `Protocollo ${j.protocollo}. ` : "";
        const det = j.descrizioneEsito || "In attesa di elaborazione.";

        // Email di riepilogo: accodata lato server (cron) e inviata fra qualche minuto,
        // quando la ricevuta SOGEI è pronta. Robusto anche a scheda chiusa.
        let emailNote = "";
        if (tsInvioEmailEnabled && j.protocollo) {
          const { data: u } = await supabase.auth.getUser();
          const ownerId = u?.user?.id;
          const email = u?.user?.email || "";
          if (ownerId) {
            const sendAfter = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // ~3 minuti
            const { error: qErr } = await supabase.from("ts_email_queue").insert({
              owner_id: ownerId,
              protocollo: j.protocollo,
              periodo: month > 0 ? `${String(month).padStart(2, "0")}/${year}` : String(year),
              esito: det,
              ambiente: tsWsAmbiente,
              righe: documents.map((d: any) => ({ paziente: d.paziente, numero: d.numDocumento, importo: d.importo })),
              send_after: sendAfter,
            } as any);
            if (!qErr) emailNote = ` Il report con ricevuta PDF arriverà via email tra qualche minuto${email ? ` a ${email}` : ""}.`;
          }
        }
        setInvioMsg({ ok: true, text: `File accolto dal Sistema TS (${j.ambiente === "prod" ? "produzione" : "test"}). ${prot}${det}${extra}${emailNote}` });
      } else {
        const det = [j.codiceEsito && `esito ${j.codiceEsito}`, j.descrizioneEsito, j.idErrore && `idErrore ${j.idErrore}`].filter(Boolean).join(" — ");
        setInvioMsg({ ok: false, text: `Il Sistema TS non ha accolto il file${det ? ": " + det : "."}` });
      }
    } catch (e: any) {
      setInvioMsg({ ok: false, text: e?.message || "Errore di rete nell'invio." });
    } finally {
      setBusy("");
    }
  }

  // Punto 1: verifica l'esito (ricevuta) degli invii del periodo tramite protocollo.
  async function doVerificaEsito() {
    const protos = Array.from(new Set(eligible.map(r => (r.ts_protocollo || "").trim()).filter(Boolean)));
    if (protos.length === 0) {
      setError("Nessun protocollo da verificare: invia prima le spese al Sistema TS.");
      return;
    }
    if (!tsWsUser || !tsWsPassword || !tsWsPincode) {
      setError("Credenziali Web Service mancanti: inseriscile in Impostazioni → Sistema TS.");
      return;
    }
    setBusy("esito");
    setError("");
    setInvioMsg(null);
    try {
      const parts: string[] = [];
      let anyErr = false;
      for (const protocollo of protos) {
        const res = await fetch("/api/ts-esito", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ protocollo, wsUser: tsWsUser, wsPassword: tsWsPassword, wsPincode: tsWsPincode, ambiente: tsWsAmbiente }),
        });
        const j = await res.json().catch(() => ({} as any));
        if (!res.ok || j.error) { parts.push(`${protocollo}: ${j.error || "errore"}`); anyErr = true; continue; }
        if (j.trovato && j.dettaglio) {
          const d = j.dettaglio;
          const sintesi = `inviati ${d.nInviati ?? "?"}, accolti ${d.nAccolti ?? "?"}` + (d.nErrori ? `, errori ${d.nErrori}` : "") + (d.nWarnings ? `, warning ${d.nWarnings}` : "");
          parts.push(`${protocollo}: ${d.descrizione || j.descrizioneEsito || "esito"} (${sintesi})`);
          if (d.nErrori) anyErr = true;
          // salva esito sintetico sulle spese di quel protocollo
          const esitoTxt = `${d.descrizione || j.descrizioneEsito || "esito"} — ${sintesi}`;
          const ids = eligible.filter(r => (r.ts_protocollo || "").trim() === protocollo).map(r => r.id);
          if (ids.length > 0) {
            await supabase.from("appointments").update({ ts_esito: esitoTxt.slice(0, 300), ts_esito_at: new Date().toISOString() } as any).in("id", ids);
          }
        } else {
          parts.push(`${protocollo}: ${j.descrizioneEsito || "ancora in elaborazione"}`);
        }
      }
      await load();
      setInvioMsg({ ok: !anyErr, text: "Esito Sistema TS — " + parts.join(" · ") });
    } catch (e: any) {
      setInvioMsg({ ok: false, text: e?.message || "Errore nella verifica esito." });
    } finally {
      setBusy("");
    }
  }

  // Punto 1: scarica la ricevuta PDF ufficiale e la invia via email.
  async function doRicevuta() {
    const protos = Array.from(new Set(eligible.map(r => (r.ts_protocollo || "").trim()).filter(Boolean)));
    if (protos.length === 0) {
      setError("Nessun protocollo: invia prima le spese al Sistema TS.");
      return;
    }
    if (!tsWsUser || !tsWsPassword || !tsWsPincode) {
      setError("Credenziali Web Service mancanti: inseriscile in Impostazioni → Sistema TS.");
      return;
    }
    setBusy("ricevuta");
    setError("");
    setInvioMsg(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const email = u?.user?.email || "";
      const periodo = month > 0 ? `${String(month).padStart(2, "0")}/${year}` : String(year);
      const parts: string[] = [];
      let anyErr = false;
      for (const protocollo of protos) {
        const esitoText = (eligible.find(r => (r.ts_protocollo || "").trim() === protocollo)?.ts_esito) || "";
        const res = await fetch("/api/ts-ricevuta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ protocollo, wsUser: tsWsUser, wsPassword: tsWsPassword, wsPincode: tsWsPincode, ambiente: tsWsAmbiente, email, periodo, esitoText }),
        });
        const j = await res.json().catch(() => ({} as any));
        if (!res.ok || j.error || !j.pdf) { parts.push(`${protocollo}: ${j.error || "ricevuta non disponibile"}`); anyErr = true; continue; }
        // download PDF
        try {
          const bin = atob(j.pdf);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `ricevuta-TS-${protocollo}.pdf`;
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        } catch { /* download non bloccante */ }
        parts.push(`${protocollo}: ricevuta scaricata${j.emailed ? ` e inviata a ${email}` : (email ? " (email non riuscita)" : "")}`);
      }
      setInvioMsg({ ok: !anyErr, text: "Ricevuta PDF — " + parts.join(" · ") });
    } catch (e: any) {
      setInvioMsg({ ok: false, text: e?.message || "Errore nel recupero della ricevuta." });
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

  // Azzera la numerazione dell'anno mostrato (NON tocca le sedute già inviate al TS).
  async function doReset() {
    const target = rows.filter(r => hasDocNumber(r) && !r.ts_sent_at);
    if (target.length === 0) { alert("Niente da azzerare: nessuna seduta numerata e non ancora inviata in questo anno."); return; }
    if (!confirm(`Azzeri la numerazione di ${target.length} sedute del ${year}?\nLe sedute già inviate al Sistema TS NON vengono toccate.`)) return;
    setBusy("reset");
    setError("");
    try {
      const ids = target.map(r => r.id);
      const { error: e } = await supabase
        .from("appointments")
        .update({ ts_doc_number: null, ts_doc_ref: null, ts_doc_year: null, ts_doc_date: null } as any)
        .in("id", ids);
      if (e) throw new Error(e.message);
      // In modalità FisioHub riallineo il contatore: riparte dopo l'ultimo numero già INVIATO (se c'è), altrimenti da 0.
      if (numberingMode === "fisiohub") {
        const { data: uid } = await supabase.auth.getUser();
        const ownerId = uid?.user?.id;
        if (ownerId) {
          const maxSent = rows
            .filter(r => r.ts_sent_at && r.ts_doc_number != null && r.ts_doc_year === year)
            .reduce((m, r) => Math.max(m, r.ts_doc_number ?? 0), 0);
          await supabase.from("ts_doc_counters")
            .upsert({ owner_id: ownerId, year, last_number: maxSent } as any, { onConflict: "owner_id,year" });
        }
      }
      await load();
      alert("Numerazione azzerata.");
    } catch (err: any) {
      setError(err?.message || "Errore azzeramento numerazione");
    } finally {
      setBusy("");
    }
  }

  // Applica i numeri abbinati dall'import Xolo.
  async function applyXoloImport(updates: { id: string; ts_doc_ref: string; ts_doc_date: string }[]): Promise<boolean> {
    setBusy("import");
    setError("");
    try {
      for (const u of updates) {
        const { error: e } = await supabase
          .from("appointments")
          .update({ ts_doc_ref: u.ts_doc_ref, ts_doc_date: u.ts_doc_date } as any)
          .eq("id", u.id);
        if (e) throw new Error(e.message);
      }
      await load();
      return true;
    } catch (err: any) {
      setError(err?.message || "Errore durante l'import");
      return false;
    } finally {
      setBusy("");
    }
  }
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

        {invioMsg && (
          <div style={{
            padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13,
            background: invioMsg.ok ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
            border: `1px solid ${invioMsg.ok ? T.green : T.red}`,
            color: invioMsg.ok ? T.green : T.red,
            display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start",
          }}>
            <span>{invioMsg.text}</span>
            <button onClick={() => setInvioMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}>×</button>
          </div>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            {numberingMode === "fisiohub" && (
              <Btn onClick={() => void doAssign()} disabled={busy !== ""} tone="teal">
                {busy === "assign" ? "Assegno…" : `Assegna numeri${daNumerareYear ? ` (${daNumerareYear})` : ""}`}
              </Btn>
            )}
            {numberingMode === "external" && (
              <Btn onClick={() => setShowImport(true)} disabled={busy !== ""} tone="teal">
                Importa da Xolo
              </Btn>
            )}
            <Btn onClick={() => void doInvio()} disabled={busy !== "" || numerate.length === 0} tone={tsWsAmbiente === "prod" ? "red" : "teal"}>
              {busy === "invio" ? "Invio…" : `Invia al Sistema TS${tsWsAmbiente === "test" ? " (test)" : ""}`}
            </Btn>

            {/* Menu altre azioni */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMoreOpen(v => !v)}
                disabled={busy !== ""}
                aria-label="Altre azioni"
                style={{
                  padding: "6px 10px", borderRadius: 8, fontSize: 14, fontWeight: 700, lineHeight: 1,
                  background: "#fff", color: T.sub, border: `1px solid ${T.border}`,
                  cursor: busy !== "" ? "not-allowed" : "pointer", opacity: busy !== "" ? 0.45 : 1,
                }}
              >
                {busy === "xml" || busy === "esito" || busy === "ricevuta" || busy === "export" || busy === "sent" || busy === "reset" ? "…" : "⋯"}
              </button>
              {moreOpen && (
                <>
                  <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 41, minWidth: 230,
                    background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
                    boxShadow: "0 10px 30px rgba(15,23,42,0.14)", overflow: "hidden",
                  }}>
                    <MenuItem onClick={() => { setMoreOpen(false); void doExportXml(); }} disabled={numerate.length === 0}>
                      Scarica file .zip (XML)
                    </MenuItem>
                    {eligible.some(r => (r.ts_protocollo || "").trim()) && (
                      <MenuItem onClick={() => { setMoreOpen(false); void doVerificaEsito(); }}>
                        Verifica esito
                      </MenuItem>
                    )}
                    {eligible.some(r => (r.ts_protocollo || "").trim()) && (
                      <MenuItem onClick={() => { setMoreOpen(false); void doRicevuta(); }}>
                        Ricevuta PDF (email)
                      </MenuItem>
                    )}
                    <MenuItem onClick={() => { setMoreOpen(false); doExport(); }} disabled={numerate.length === 0}>
                      Genera file CSV
                    </MenuItem>
                    <MenuItem onClick={() => { setMoreOpen(false); void doMarkSent(); }} disabled={numerate.filter(r => r.ts_sent_at == null).length === 0}>
                      Segna come inviate
                    </MenuItem>
                    <MenuItem onClick={() => { setMoreOpen(false); void doReset(); }} disabled={numerate.filter(r => r.ts_sent_at == null).length === 0} danger>
                      Azzera numerazione
                    </MenuItem>
                  </div>
                </>
              )}
            </div>
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
                        <Td><NumeroCell row={r} editable={numberingMode === "external" && !sent && fatturata && !excluded} onSave={(id, ref) => void saveEditRow(id, { ts_doc_ref: ref || null, ts_doc_date: r.ts_doc_date || toDateInputValue(r.paid_at) || null })} /></Td>
                        <Td><span style={{ color: T.text }}>{dateITA(r.ts_doc_date || r.paid_at)}</span></Td>
                        <Td>
                          {r.patient_id ? (
                            <Link href={`/patients/${r.patient_id}`} style={{ fontWeight: 600, color: T.blue, textDecoration: "none" }}>
                              {patientFullName(r.patient) || "—"}
                            </Link>
                          ) : (
                            <span style={{ fontWeight: 600, color: T.text }}>{patientFullName(r.patient) || "—"}</span>
                          )}
                          <button
                            onClick={() => setEditRow(r)}
                            title="Apri e modifica la spesa (resti in Contabilità)"
                            style={{ marginLeft: 8, border: "none", background: "transparent", color: T.teal, cursor: "pointer", fontWeight: 800, fontSize: 13 }}
                          >✎</button>
                        </Td>
                        <Td>{cf ? <span style={{ fontFamily: "monospace", fontSize: 12, color: T.text }}>{cf.toUpperCase()}</span> : <span style={{ color: T.red, fontSize: 11, fontWeight: 700 }}>mancante</span>}</Td>
                        <Td><span style={{ fontWeight: 700, color: T.text }}>{euro2.format(r.amount ?? 0)}</span></Td>
                        <Td>
                          <PaidPill
                            compact
                            data={{ is_paid: true, paid_at: r.paid_at, payment_method: (r.payment_method as PaymentMethod | null), price_type: r.price_type }}
                            onUpdate={(next) => onPaidUpdate(r.id, next)}
                          />
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
                        <Td>{!fatturata ? <Badge tone="gray">Non fatturata</Badge> : sent ? <Badge tone="green">Inviata</Badge> : excluded ? <Badge tone="gray">Esclusa</Badge> : hasDocNumber(r) ? <Badge tone="blue">Numerata</Badge> : <Badge tone="gray">Da numerare</Badge>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, fontSize: 11.5, color: T.muted, lineHeight: 1.7 }}>
          <div><strong style={{ color: T.sub }}>Come funziona:</strong> al Sistema TS vanno solo le sedute <strong>fatturate</strong>; le sedute in contanti non fatturate non si numerano e non vengono inviate. {numberingMode === "external"
            ? <>Inserisci il <strong>numero della ricevuta</strong> (es. da Xolo) con la ✎ su ogni riga, poi <strong>Invia al Sistema TS</strong>.</>
            : <>Premi <strong>Assegna numeri</strong> per il progressivo, poi <strong>Invia al Sistema TS</strong>.</>}</div>
          <div style={{ marginTop: 6 }}><strong style={{ color: T.sub }}>Opposiz.</strong> = il paziente si oppone all&rsquo;invio della spesa all&rsquo;Agenzia delle Entrate (resta nei tuoi documenti ma non finisce nel suo 730 precompilato). <strong style={{ color: T.sub }}>Escludi</strong> = togli la singola seduta dall&rsquo;invio (es. fattura B2B a società/assicurazione).</div>
          <div style={{ marginTop: 6 }}>Le altre azioni (CSV, &ldquo;segna come inviate&rdquo;, &ldquo;azzera numerazione&rdquo;) sono nel menu <strong>⋯</strong>.</div>
        </div>
      </div>

      {editRow && (
        <EditSpesaModal
          row={editRow}
          tsDefault={tsDefault}
          numberingMode={numberingMode}
          onClose={() => setEditRow(null)}
          onSave={saveEditRow}
        />
      )}

      {showImport && (
        <ImportXoloModal
          rows={rows}
          year={year}
          onClose={() => setShowImport(false)}
          onApply={applyXoloImport}
        />
      )}
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

function Btn({ children, onClick, disabled, tone }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone: "teal" | "blue" | "outline" | "red" }) {
  const base: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", opacity: disabled ? 0.45 : 1, lineHeight: 1.4, whiteSpace: "nowrap" };
  const styles: React.CSSProperties =
    tone === "teal" ? { background: T.teal, color: "#fff" }
    : tone === "blue" ? { background: T.blue, color: "#fff" }
    : tone === "red" ? { background: T.red, color: "#fff" }
    : { background: "#fff", color: T.sub, border: `1px solid ${T.border}` };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...styles }}>{children}</button>;
}

function MenuItem({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: "9px 14px",
        background: "#fff", border: "none", borderBottom: `1px solid ${T.soft}`,
        fontSize: 13, fontWeight: 500, color: disabled ? T.muted : (danger ? T.red : T.text),
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

// Cella "N." modificabile al volo: scrivi il numero documento direttamente in riga.
function NumeroCell({ row, editable, onSave }: { row: SpesaRow; editable: boolean; onSave: (id: string, ref: string) => void }) {
  const current = docNumber(row) || "";
  const [val, setVal] = useState(current);
  useEffect(() => { setVal(docNumber(row) || ""); }, [row.id, row.ts_doc_ref, row.ts_doc_number]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!editable) {
    return <span style={{ fontWeight: 700, color: hasDocNumber(row) ? T.text : T.gray }}>{current || "—"}</span>;
  }
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => { if (val.trim() !== current) onSave(row.id, val.trim()); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      placeholder="n. doc"
      style={{ width: 92, padding: "4px 7px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, fontWeight: 700, color: T.text, background: "#fff" }}
    />
  );
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

// ─── Finestra "Modifica spesa": apre l'appuntamento dentro Contabilità ─────────
function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoWithDate(originalIso: string | null, ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = originalIso ? new Date(originalIso) : new Date();
  if (isNaN(base.getTime())) base.setTime(Date.now());
  base.setFullYear(y, (m || 1) - 1, d || 1);
  return base.toISOString();
}

function EditSpesaModal({ row, tsDefault, numberingMode, onClose, onSave }: {
  row: SpesaRow;
  tsDefault: string;
  numberingMode: "external" | "fisiohub";
  onClose: () => void;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const [importo, setImporto] = useState(row.amount != null ? String(row.amount) : "");
  const [fatturata, setFatturata] = useState(row.price_type === "invoiced");
  const [metodo, setMetodo] = useState<string>(row.payment_method ?? "cash");
  const [dataPag, setDataPag] = useState(toDateInputValue(row.paid_at));
  const [tipoSpesa, setTipoSpesa] = useState(row.ts_tipo_spesa || tsDefault);
  const [opp, setOpp] = useState(!!row.ts_opposizione);
  const [escludi, setEscludi] = useState(!!row.ts_exclude);
  const [numDoc, setNumDoc] = useState(row.ts_doc_ref ?? (row.ts_doc_number != null ? String(row.ts_doc_number) : ""));
  const [dataDoc, setDataDoc] = useState(toDateInputValue(row.ts_doc_date));
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    const amountNum = parseFloat(importo.replace(",", "."));
    const patch: Record<string, unknown> = {
      amount: isNaN(amountNum) ? 0 : amountNum,
      price_type: fatturata ? "invoiced" : "cash",
      payment_method: fatturata ? metodo : "cash",
      paid_at: dataPag ? isoWithDate(row.paid_at, dataPag) : row.paid_at,
      ts_tipo_spesa: tipoSpesa,
      ts_opposizione: opp,
      ts_exclude: escludi,
    };
    // In modalità Esterna (Xolo) il numero/data documento si inseriscono a mano.
    if (numberingMode === "external") {
      patch.ts_doc_ref = numDoc.trim() || null;
      patch.ts_doc_date = (dataDoc || dataPag) || null;
    }
    const ok = await onSave(row.id, patch);
    setBusy(false);
    if (ok) onClose();
  }

  const labelS: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 };
  const inputS: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 14, color: T.text, background: "#fff", boxSizing: "border-box" };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div style={{ width: "100%", maxWidth: 460, background: "#fff", borderRadius: 16, boxShadow: "0 24px 64px rgba(15,23,42,0.3)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", background: T.gradient, color: "#fff" }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{patientFullName(row.patient) || "Spesa"}</div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>Seduta del {dateITA(row.session_at || row.paid_at)}</div>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div>
            <label style={labelS}>Importo (€)</label>
            <input value={importo} onChange={e => setImporto(e.target.value)} placeholder="0,00" style={inputS} inputMode="decimal" />
          </div>

          <div>
            <label style={labelS}>Tipo</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ k: true, l: "Fatturata" }, { k: false, l: "Contante (non fatturata)" }].map(o => (
                <button
                  key={String(o.k)}
                  onClick={() => setFatturata(o.k)}
                  style={{ flex: 1, padding: "9px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    border: `1.5px solid ${fatturata === o.k ? T.teal : T.border}`,
                    background: fatturata === o.k ? "rgba(13,148,136,0.10)" : "#fff",
                    color: fatturata === o.k ? T.teal : T.muted }}
                >{o.l}</button>
              ))}
            </div>
          </div>

          <div style={{ opacity: fatturata ? 1 : 0.5 }}>
            <label style={labelS}>Metodo di pagamento</label>
            <select value={metodo} onChange={e => setMetodo(e.target.value)} disabled={!fatturata} style={{ ...inputS, cursor: fatturata ? "pointer" : "not-allowed" }}>
              <option value="cash">Contanti</option>
              <option value="pos">POS</option>
              <option value="bank_transfer">Bonifico</option>
            </select>
            {!fatturata && <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>Le sedute non fatturate sono sempre in contanti.</div>}
          </div>

          <div>
            <label style={labelS}>Data pagamento</label>
            <input type="date" value={dataPag} onChange={e => setDataPag(e.target.value)} style={inputS} />
          </div>

          <div style={{ opacity: fatturata ? 1 : 0.5 }}>
            <label style={labelS}>Tipo spesa (Sistema TS)</label>
            <select value={tipoSpesa} onChange={e => setTipoSpesa(e.target.value)} disabled={!fatturata} style={{ ...inputS, cursor: fatturata ? "pointer" : "not-allowed" }}>
              {TIPI_SPESA.map(t => <option key={t.code} value={t.code}>{t.code} · {t.label}</option>)}
            </select>
          </div>

          {fatturata && (
            numberingMode === "external" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelS}>Numero documento</label>
                  <input value={numDoc} onChange={e => setNumDoc(e.target.value)} placeholder="es. 2026/123 (Xolo)" style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Data documento</label>
                  <input type="date" value={dataDoc} onChange={e => setDataDoc(e.target.value)} style={inputS} />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: T.muted, background: "rgba(148,163,184,0.08)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px" }}>
                Numero documento: <strong style={{ color: T.text }}>{numDoc || "verrà assegnato da FisioHub"}</strong>
              </div>
            )
          )}

          <div style={{ display: "flex", gap: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text, cursor: "pointer" }}>
              <input type="checkbox" checked={opp} onChange={e => setOpp(e.target.checked)} style={{ width: 16, height: 16, accentColor: T.amber }} /> Opposizione
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text, cursor: "pointer" }}>
              <input type="checkbox" checked={escludi} onChange={e => setEscludi(e.target.checked)} style={{ width: 16, height: 16, accentColor: T.gray }} /> Escludi dal TS
            </label>
          </div>
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, border: `1.5px solid ${T.border}`, background: "#fff", color: T.text, cursor: "pointer" }}>Annulla</button>
          <button onClick={() => void handleSave()} disabled={busy} style={{ padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 700, border: "none", background: T.teal, color: "#fff", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Salvataggio…" : "Salva"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══ Import numeri documento da Xolo (CSV) ════════════════════════════════
type XoloInvoice = { cliente: string; numero: string; data: string; importo: number };

function normName(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function nameTokens(s: string): string {
  return normName(s).split(" ").filter(Boolean).sort().join(" ");
}
function parseImporto(s: string): number {
  if (!s) return NaN;
  let t = s.trim().replace(/[€\s]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  return parseFloat(t);
}
function dayDiff(iso: string | null, ymd: string): number {
  if (!iso || !ymd) return 99999;
  const a = new Date(iso).getTime();
  const b = new Date(ymd + "T12:00:00").getTime();
  if (isNaN(a) || isNaN(b)) return 99999;
  return Math.round((a - b) / 86400000);
}
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}
function parseXoloCsv(text: string): XoloInvoice[] {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map(h => normName(h));
  const iCliente = header.findIndex(h => h.includes("cliente"));
  const iNumero  = header.findIndex(h => h.includes("numero"));
  const iData    = header.findIndex(h => h === "data");
  const iImporto = header.findIndex(h => h.includes("importo"));
  const inv: XoloInvoice[] = [];
  for (let k = 1; k < lines.length; k++) {
    const cells = splitCsvLine(lines[k]);
    const numero = (cells[iNumero >= 0 ? iNumero : 2] || "").trim();
    if (!numero) continue;
    inv.push({
      cliente: (cells[iCliente >= 0 ? iCliente : 0] || "").trim(),
      numero,
      data: (cells[iData >= 0 ? iData : 3] || "").trim().slice(0, 10),
      importo: parseImporto(cells[iImporto >= 0 ? iImporto : 5] || ""),
    });
  }
  return inv;
}

// Cerca il sottoinsieme di sedute la cui somma (in centesimi) fa ESATTAMENTE il
// totale fattura, preferendo le sedute più vicine alla data fattura (diff minore)
// e, a parità, il minor numero di sedute. Ritorna gli id, o null se non esiste.
function bestSubsetIds(items: { id: string; cents: number; diff: number }[], target: number): string[] | null {
  const list = [...items].sort((a, b) => a.diff - b.diff).slice(0, 22);
  const bestRef: { v: { ids: string[]; diff: number } | null } = { v: null };
  const chosen: string[] = [];
  let steps = 0;
  function rec(idx: number, sum: number, diffSum: number) {
    if (steps++ > 300000) return; // guardia anti-esplosione combinatoria
    if (sum === target) {
      const b = bestRef.v;
      if (!b || diffSum < b.diff || (diffSum === b.diff && chosen.length < b.ids.length)) {
        bestRef.v = { ids: chosen.slice(), diff: diffSum };
      }
      return;
    }
    if (sum > target || idx >= list.length) return; // importi positivi: pota
    chosen.push(list[idx].id);
    rec(idx + 1, sum + list[idx].cents, diffSum + list[idx].diff);
    chosen.pop();
    rec(idx + 1, sum, diffSum);
  }
  rec(0, 0, 0);
  return bestRef.v ? bestRef.v.ids : null;
}

function ImportXoloModal({ rows, year, onClose, onApply }: {
  rows: SpesaRow[];
  year: number;
  onClose: () => void;
  onApply: (updates: { id: string; ts_doc_ref: string; ts_doc_date: string }[]) => Promise<boolean>;
}) {
  const [invoices, setInvoices] = useState<XoloInvoice[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [parseErr, setParseErr] = useState("");
  // assegnazione: id seduta -> indice fattura (una seduta appartiene a UNA sola fattura)
  const [assign, setAssign] = useState<Record<string, number>>({});
  const [onlyReview, setOnlyReview] = useState(false);
  const [busy, setBusy] = useState(false);

  const pool = useMemo(
    () => rows.filter(r => r.price_type === "invoiced" && r.patient && (r.amount ?? 0) > 0),
    [rows]
  );
  const poolByName = useMemo(() => {
    const m = new Map<string, SpesaRow[]>();
    for (const r of pool) {
      const k = nameTokens(patientFullName(r.patient));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    // ordino le sedute per data seduta crescente
    for (const arr of m.values()) arr.sort((a, b) => (a.session_at || "").localeCompare(b.session_at || ""));
    return m;
  }, [pool]);

  // numeri documento GIÀ presenti sulle sedute (per riconoscere i re-import)
  const existingRefs = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.ts_doc_ref && r.ts_doc_ref.trim()) s.add(r.ts_doc_ref.trim());
    return s;
  }, [rows]);

  // abbinamento automatico: per ogni fattura cerca la COMBINAZIONE ESATTA di sedute
  // che somma al totale fattura (preferendo le date più vicine). Se non c'è una
  // combinazione esatta, lascia un parziale (greedy) da rivedere a mano.
  useEffect(() => {
    if (!invoices) return;
    const next: Record<string, number> = {};
    const used = new Set<string>();
    const order = invoices.map((inv, i) => ({ inv, i })).sort((a, b) => a.inv.data.localeCompare(b.inv.data));
    for (const { inv, i } of order) {
      if (existingRefs.has(inv.numero.trim())) continue; // già importata: non riabbinare
      const target = Math.round((inv.importo || 0) * 100);
      if (!isFinite(target) || target <= 0) continue;
      const avail = (poolByName.get(nameTokens(inv.cliente)) || [])
        .filter(r => !used.has(r.id) && !(r.ts_doc_ref && r.ts_doc_ref.trim()));
      const items = avail
        .map(r => ({ id: r.id, cents: Math.round((r.amount ?? 0) * 100), diff: Math.abs(dayDiff(r.session_at, inv.data)) }))
        .filter(it => it.cents > 0 && it.cents <= target);
      let ids = bestSubsetIds(items, target);
      if (!ids) {
        // fallback parziale: aggiunge per data più vicina fino a raggiungere il totale
        const greedy: string[] = [];
        let sum = 0;
        for (const it of [...items].sort((a, b) => a.diff - b.diff)) {
          if (sum >= target) break;
          greedy.push(it.id); sum += it.cents;
        }
        ids = greedy.length ? greedy : null;
      }
      if (ids) for (const id of ids) { next[id] = i; used.add(id); }
    }
    setAssign(next);
    setOnlyReview(invoices.length > 12);
  }, [invoices, poolByName, existingRefs]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseErr("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const inv = parseXoloCsv(String(reader.result || ""));
        if (inv.length === 0) { setParseErr("Nessuna fattura trovata nel file."); setInvoices(null); return; }
        setInvoices(inv);
      } catch {
        setParseErr("File non leggibile. Carica il CSV scaricato da Xolo.");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function toggle(sessionId: string, i: number, checked: boolean) {
    setAssign(a => {
      const n = { ...a };
      if (checked) n[sessionId] = i; else delete n[sessionId];
      return n;
    });
  }

  const assignedSessions = useMemo(() => Object.keys(assign).length, [assign]);

  // Stato per ogni fattura: ok (somma quadra) / attention (somma non quadra) / none (nessuna seduta).
  const status = useMemo<("ok" | "attention" | "none" | "already")[]>(() => {
    if (!invoices) return [];
    return invoices.map((inv, i) => {
      if (existingRefs.has(inv.numero.trim())) return "already";
      const cands = poolByName.get(nameTokens(inv.cliente)) || [];
      if (cands.length === 0) return "none";
      const sumSel = cands.filter(r => assign[r.id] === i).reduce((s, r) => s + (r.amount ?? 0), 0);
      if (Math.abs(sumSel - inv.importo) < 0.01 && sumSel > 0) return "ok";
      return "attention";
    });
  }, [invoices, poolByName, assign, existingRefs]);
  const okCount = useMemo(() => status.filter(s => s === "ok").length, [status]);
  const attentionCount = useMemo(() => status.filter(s => s === "attention").length, [status]);
  const noneCount = useMemo(() => status.filter(s => s === "none").length, [status]);
  const alreadyCount = useMemo(() => status.filter(s => s === "already").length, [status]);
  const reviewCount = useMemo(() => status.filter(s => s === "attention" || s === "none").length, [status]);

  async function handleApply() {
    if (!invoices) return;
    const updates = Object.entries(assign).map(([id, i]) => ({
      id,
      ts_doc_ref: invoices[i].numero,
      ts_doc_date: invoices[i].data,
    }));
    if (updates.length === 0) return;
    setBusy(true);
    const ok = await onApply(updates);
    setBusy(false);
    if (ok) onClose();
  }

  const labelS: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: T.sub, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div style={{ width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16, boxShadow: "0 24px 64px rgba(15,23,42,0.3)", overflow: "hidden", color: T.text }}>
        <div style={{ padding: "16px 20px", background: T.gradient, color: "#fff" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Importa numeri da Xolo</div>
          <div style={{ fontSize: 12, opacity: 0.95, marginTop: 2 }}>Carica il CSV del fatturato: abbino le fatture alle sedute del {year} per paziente e <strong>data della seduta</strong>. Una fattura può coprire più sedute.</div>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelS}>File CSV (fatturato Xolo)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, color: "#fff", background: T.teal, cursor: "pointer" }}>
                Scegli file CSV
                <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
              </label>
              <span style={{ fontSize: 13, color: fileName ? T.sub : T.muted, fontWeight: fileName ? 600 : 400 }}>
                {fileName || "Nessun file selezionato"}
              </span>
            </div>
            {parseErr && <div style={{ marginTop: 8, fontSize: 12.5, color: T.red }}>{parseErr}</div>}
          </div>

          {invoices && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ fontSize: 12.5, color: T.sub }}>
                  {invoices.length} fatture · <strong style={{ color: T.green }}>{okCount} ok ✓</strong>
                  {attentionCount > 0 && <> · <strong style={{ color: T.amber }}>{attentionCount} da controllare</strong></>}
                  {noneCount > 0 && <> · <strong style={{ color: T.muted }}>{noneCount} senza paziente in FisioHub</strong></>}
                  {alreadyCount > 0 && <> · <strong style={{ color: T.blue }}>{alreadyCount} già importate</strong></>}
                  {" · "}{assignedSessions} sedute selezionate
                </div>
                {reviewCount > 0 && (
                  <div style={{ display: "inline-flex", border: `1.5px solid ${T.border}`, borderRadius: 9, overflow: "hidden", background: "#fff" }}>
                    <button onClick={() => setOnlyReview(false)} style={{ padding: "6px 11px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: !onlyReview ? T.teal : "#fff", color: !onlyReview ? "#fff" : T.muted }}>Tutte ({invoices.length})</button>
                    <button onClick={() => setOnlyReview(true)} style={{ padding: "6px 11px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: onlyReview ? T.teal : "#fff", color: onlyReview ? "#fff" : T.muted }}>Da controllare ({reviewCount})</button>
                  </div>
                )}
              </div>

              {onlyReview && reviewCount === 0 && (
                <div style={{ fontSize: 13, color: T.green, fontWeight: 700, padding: "10px 0" }}>Tutte le fatture abbinate correttamente. Premi Applica.</div>
              )}

              <div style={{ display: "grid", gap: 12 }}>
                {invoices.map((inv, i) => ({ inv, i })).filter(({ i }) => !onlyReview || (status[i] !== "ok" && status[i] !== "already")).map(({ inv, i }) => {
                  const cands = poolByName.get(nameTokens(inv.cliente)) || [];
                  const sumSel = cands.filter(r => assign[r.id] === i).reduce((s, r) => s + (r.amount ?? 0), 0);
                  const ok = status[i] === "ok";
                  const already = status[i] === "already";
                  const partial = sumSel > 0 && !ok;
                  return (
                    <div key={i} style={{ border: `1.5px solid ${already ? T.blue : ok ? T.green : partial ? T.amber : T.border}`, borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", background: T.soft }}>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>
                          Fattura {inv.numero} · {dateITA(inv.data)} · {inv.cliente}
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: already ? T.blue : ok ? T.green : partial ? T.amber : T.muted }}>
                          {already ? "già importata" : `${`€ ${sumSel.toFixed(2)} / € ${isNaN(inv.importo) ? "?" : inv.importo.toFixed(2)}`} ${ok ? "✓" : partial ? "⚠" : ""}`}
                        </div>
                      </div>
                      <div style={{ padding: "8px 12px" }}>
                        {already ? (
                          <div style={{ fontSize: 12.5, color: T.sub }}>Numero <strong>{inv.numero}</strong> già presente su una seduta: la fattura non viene reimportata (nessun doppione).</div>
                        ) : cands.length === 0 ? (
                          <div style={{ fontSize: 12.5, color: T.muted, fontStyle: "italic" }}>Nessun paziente con sedute in FisioHub per «{inv.cliente}». Se è una cooperativa/società o un cliente non registrato, non viene importata (e le fatture B2B non vanno comunque nel Sistema TS).</div>
                        ) : (
                          <div style={{ display: "grid", gap: 4 }}>
                            {cands.map(r => {
                              const mine = assign[r.id] === i;
                              const elseIdx = assign[r.id] != null && assign[r.id] !== i ? assign[r.id] : null;
                              const taken = elseIdx != null;
                              return (
                                <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: taken ? T.muted : T.text, cursor: taken ? "not-allowed" : "pointer", padding: "2px 0" }}>
                                  <input
                                    type="checkbox"
                                    checked={mine}
                                    disabled={taken}
                                    onChange={e => toggle(r.id, i, e.target.checked)}
                                    style={{ width: 15, height: 15, accentColor: T.teal }}
                                  />
                                  <span><strong>{dateITA(r.session_at)}</strong> · € {(r.amount ?? 0).toFixed(2)}</span>
                                  {r.ts_doc_ref && <span style={{ color: T.muted }}>(già: {r.ts_doc_ref})</span>}
                                  {taken && <span style={{ color: T.amber }}>→ fattura {invoices[elseIdx as number].numero}</span>}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 12, lineHeight: 1.6 }}>
                Le date mostrate sono quelle <strong>della seduta</strong>. Spunta le sedute coperte da ciascuna fattura: la somma deve combaciare col totale fattura (✓). Più sedute della stessa fattura verranno inviate al TS come <strong>un&rsquo;unica riga</strong> col totale. Le sedute già inviate non vanno toccate.
              </div>
            </>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, border: `1.5px solid ${T.border}`, background: "#fff", color: T.text, cursor: "pointer" }}>Annulla</button>
          <button
            onClick={() => void handleApply()}
            disabled={busy || !invoices || assignedSessions === 0}
            style={{ padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 700, border: "none", background: T.teal, color: "#fff", cursor: (busy || assignedSessions === 0) ? "default" : "pointer", opacity: (busy || !invoices || assignedSessions === 0) ? 0.55 : 1 }}
          >{busy ? "Importo…" : `Applica${assignedSessions ? ` (${assignedSessions})` : ""}`}</button>
        </div>
      </div>
    </div>
  );
}
