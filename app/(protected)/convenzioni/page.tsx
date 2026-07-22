"use client";

// ═══════════════════════════════════════════════════════════════════════
// /convenzioni — Fondi sanitari, casse e assicurazioni
// ═══════════════════════════════════════════════════════════════════════
//
// Modulo opzionale (studios.convenzioni_enabled, mig. 065). Tre schede:
//
//   • ENTI          anagrafica degli enti con cui sei convenzionato, con
//                   registro precaricato dei fondi italiani, link diretto
//                   per accreditarsi e ricerca mirata del tariffario.
//   • LISTINI       per ogni ente: prestazione → tariffa ente + quota
//                   paziente. Import da foto/PDF del nomenclatore via AI.
//   • DA FATTURARE  le sedute in convenzione del mese, raggruppate per
//                   ente, con numeri di autorizzazione: è l'allegato che
//                   serve per farsi pagare.
//
// La pagina si raggiunge dal menu utente in alto a destra (desktop e
// mobile): è roba che si tocca due volte l'anno, non merita una scheda
// fissa nella barra.
// ═══════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { useDisplayPatientName } from "@/src/contexts/PrivacyModeContext";
import { useIsMobile } from "@/src/hooks/useIsMobile";
import AppNavbar from "@/src/components/AppNavbar";
import MobileTabBar from "@/src/components/MobileTabBar";
import {
  REGISTRY, KIND_LABEL, ANAGRAFE_MINISTERO, searchRegistry,
  tariffarioSearchUrl, type RegistryEntry, type EnteKind,
} from "@/src/lib/convenzioni/registry";

const T = {
  teal: "#0d9488", blue: "#2563eb", text: "#0f172a", muted: "#64748b",
  border: "#e2e8f0", borderSoft: "#eef2f7", soft: "#f8fafc",
  green: "#16a34a", amber: "#f59e0b", red: "#dc2626", appBg: "#f6f7f9",
};

type Ente = {
  id: string; name: string; kind: EnteKind;
  network_name: string | null; accreditation_url: string | null;
  site_url: string | null; contact_email: string | null;
  contact_phone: string | null; notes: string | null; is_active: boolean;
};

type Tariffa = {
  id: string; ente_id: string; prestazione: string;
  tariffa_ente: number | null; quota_paziente: number | null; note: string | null;
};

type SessionRow = {
  id: string; start_at: string; amount: number | null;
  treatment_type: string | null; status: string;
  convenzione_ente_id: string | null;
  convenzione_auth_code: string | null;
  patients: { first_name: string | null; last_name: string | null } | null;
};

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export default function ConvenzioniPage() {
  const isMobileRaw = useIsMobile();
  const isMobile = isMobileRaw === true;
  const { studio } = useCurrentStudio();
  const displayName = useDisplayPatientName();
  const studioId = studio?.id ?? null;
  const enabled = (studio as { convenzioni_enabled?: boolean } | null)?.convenzioni_enabled === true;

  const [tab, setTab] = useState<"enti" | "listini" | "fatturare">("enti");
  const [enti, setEnti] = useState<Ente[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEnti = useCallback(async () => {
    if (!studioId) return;
    setLoading(true);
    const { data } = await supabase.from("convenzioni_enti")
      .select("id, name, kind, network_name, accreditation_url, site_url, contact_email, contact_phone, notes, is_active")
      .eq("studio_id", studioId)
      .order("name");
    setEnti((data as Ente[]) || []);
    setLoading(false);
  }, [studioId]);

  useEffect(() => { void loadEnti(); }, [loadEnti]);

  const body = (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: isMobile ? "12px 12px 90px" : "20px 22px 40px" }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: isMobile ? 19 : 23, fontWeight: 800, color: T.text, margin: 0 }}>Convenzioni</h1>
        <p style={{ fontSize: 12.5, color: T.muted, margin: "4px 0 0", lineHeight: 1.5 }}>
          Fondi sanitari, casse e assicurazioni con cui lavori: anagrafica, listini e sedute da fatturare.
        </p>
      </div>

      {!enabled && (
        <div style={{
          background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 12,
          padding: "14px 16px", marginBottom: 16, fontSize: 13, color: "#92400e", lineHeight: 1.6,
        }}>
          <strong>Modulo spento.</strong> Puoi guardarti intorno, ma per usarlo davvero accendilo in{" "}
          <Link href="/settings" style={{ color: "#92400e", fontWeight: 800 }}>Impostazioni</Link>.
        </div>
      )}

      {/* Schede */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {([["enti", "Enti"], ["listini", "Listini"], ["fatturare", "Da fatturare"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "8px 15px", borderRadius: 999, fontSize: 13, fontWeight: 700,
            border: `1.5px solid ${tab === k ? T.teal : T.border}`,
            background: tab === k ? T.teal : "#fff", color: tab === k ? "#fff" : T.muted,
            cursor: "pointer", fontFamily: "inherit",
          }}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 13 }}>Carico…</div>}

      {!loading && tab === "enti" && (
        <EntiTab studioId={studioId} enti={enti} onChanged={loadEnti} isMobile={isMobile} />
      )}
      {!loading && tab === "listini" && (
        <ListiniTab studioId={studioId} enti={enti} isMobile={isMobile} />
      )}
      {!loading && tab === "fatturare" && (
        <FatturareTab studioId={studioId} enti={enti} isMobile={isMobile} displayName={displayName} />
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ minHeight: "100vh", background: T.appBg }}>
        {body}
        <MobileTabBar />
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: T.appBg }}>
      <AppNavbar active="none" />
      {body}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SCHEDA 1 — ENTI
// ─────────────────────────────────────────────────────────────────────────
function EntiTab({ studioId, enti, onChanged, isMobile }: {
  studioId: string | null; enti: Ente[]; onChanged: () => void; isMobile: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const remove = async (e: Ente) => {
    if (!window.confirm(`Rimuovere "${e.name}"? Si cancella anche il suo listino.`)) return;
    await supabase.from("convenzioni_enti").delete().eq("id", e.id);
    onChanged();
  };

  return (
    <>
      <button onClick={() => setPickerOpen(true)} style={{
        padding: "10px 16px", borderRadius: 10, border: "none",
        background: `linear-gradient(135deg, ${T.teal}, ${T.blue})`, color: "#fff",
        fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 14,
      }}>➕ Aggiungi ente</button>

      {enti.length === 0 && (
        <div style={{
          background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12,
          padding: "22px 18px", textAlign: "center", color: T.muted, fontSize: 13, lineHeight: 1.6,
        }}>
          Nessun ente ancora. Aggiungine uno dal registro: trovi i principali fondi, casse e reti italiane
          già pronti, con il link per chiedere il convenzionamento.
        </div>
      )}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
        {enti.map(e => (
          <div key={e.id} style={{
            background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: "13px 15px",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{e.name}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                  {KIND_LABEL[e.kind] ?? e.kind}
                  {e.network_name && <> · pratiche via <strong style={{ color: T.text }}>{e.network_name}</strong></>}
                </div>
              </div>
              <button onClick={() => remove(e)} title="Rimuovi" style={{
                border: "none", background: "transparent", cursor: "pointer",
                color: T.muted, fontWeight: 800, fontSize: 13, padding: "2px 4px",
              }}>✕</button>
            </div>

            {e.notes && (
              <div style={{ fontSize: 11.5, color: "#475569", marginTop: 8, lineHeight: 1.5 }}>{e.notes}</div>
            )}

            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {e.accreditation_url && (
                <a href={e.accreditation_url} target="_blank" rel="noreferrer" style={{
                  padding: "6px 11px", borderRadius: 8, border: "none",
                  background: T.teal, color: "#fff", fontWeight: 700, fontSize: 11.5,
                  textDecoration: "none",
                }}>🔗 Accreditati</a>
              )}
              <a href={tariffarioSearchUrl(e.name, e.network_name)} target="_blank" rel="noreferrer" style={{
                padding: "6px 11px", borderRadius: 8, border: `1px solid ${T.border}`,
                background: "#fff", color: "#475569", fontWeight: 700, fontSize: 11.5, textDecoration: "none",
              }}>🔎 Cerca tariffario</a>
              {e.site_url && (
                <a href={e.site_url} target="_blank" rel="noreferrer" style={{
                  padding: "6px 11px", borderRadius: 8, border: `1px solid ${T.border}`,
                  background: "#fff", color: "#475569", fontWeight: 700, fontSize: 11.5, textDecoration: "none",
                }}>Sito</a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, fontSize: 11.5, color: T.muted, lineHeight: 1.6 }}>
        Per verificare che un fondo sia realmente iscritto:{" "}
        <a href={ANAGRAFE_MINISTERO} target="_blank" rel="noreferrer" style={{ color: T.teal, fontWeight: 700 }}>
          Anagrafe dei fondi sanitari del Ministero della Salute
        </a>.
      </div>

      {pickerOpen && (
        <EntePicker
          studioId={studioId}
          existing={enti.map(e => e.name.toLowerCase())}
          onClose={() => setPickerOpen(false)}
          onAdded={() => { setPickerOpen(false); onChanged(); }}
        />
      )}
    </>
  );
}

// ── Selettore dal registro + inserimento manuale ──
function EntePicker({ studioId, existing, onClose, onAdded }: {
  studioId: string | null; existing: string[]; onClose: () => void; onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualKind, setManualKind] = useState<EnteKind>("fondo");

  const results = useMemo(() => searchRegistry(q).slice(0, 60), [q]);

  const addFromRegistry = async (r: RegistryEntry) => {
    if (!studioId || busy) return;
    setBusy(true);
    await supabase.from("convenzioni_enti").insert({
      studio_id: studioId,
      name: r.name,
      kind: r.kind,
      network_name: r.network ?? (r.kind === "rete" ? null : null),
      accreditation_url: r.accreditation ?? null,
      site_url: r.site ?? null,
      contact_email: r.contactEmail ?? null,
      notes: r.note ?? r.settore ?? null,
    });
    setBusy(false);
    onAdded();
  };

  const addManual = async () => {
    if (!studioId || !manualName.trim()) return;
    setBusy(true);
    await supabase.from("convenzioni_enti").insert({
      studio_id: studioId, name: manualName.trim(), kind: manualKind,
    });
    setBusy(false);
    onAdded();
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 250,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 14,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560, background: "#fff", borderRadius: 14,
        boxShadow: "0 20px 60px rgba(15,23,42,0.3)", overflow: "hidden",
        maxHeight: "88vh", display: "flex", flexDirection: "column",
      }}>
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Aggiungi ente</div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
              {REGISTRY.length} tra fondi, casse, mutue, reti e assicurazioni
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: T.muted, fontWeight: 700 }}>✕</button>
        </div>

        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}` }}>
          <input
            value={q} onChange={e => setQ(e.target.value)} autoFocus
            placeholder="Cerca: Metasalute, Previmedical, avvocati…"
            style={{
              width: "100%", boxSizing: "border-box", padding: "10px 12px",
              border: `1px solid ${T.border}`, borderRadius: 9,
              fontSize: 13.5, fontWeight: 600, color: T.text, fontFamily: "inherit",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 12px" }}>
          {results.map(r => {
            const already = existing.includes(r.name.toLowerCase());
            return (
              <button
                key={r.name}
                onClick={() => !already && addFromRegistry(r)}
                disabled={already || busy}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                  border: `1px solid ${T.border}`, borderRadius: 10, background: already ? T.soft : "#fff",
                  padding: "9px 12px", marginBottom: 6, cursor: already ? "default" : "pointer",
                  fontFamily: "inherit", opacity: already ? .6 : 1,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.text }}>{r.name}</span>
                  <span style={{ display: "block", fontSize: 11, color: T.muted, marginTop: 1 }}>
                    {KIND_LABEL[r.kind]}{r.settore ? ` · ${r.settore}` : ""}
                    {r.network ? ` · via ${r.network}` : ""}
                  </span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: already ? T.muted : T.teal, whiteSpace: "nowrap" }}>
                  {already ? "già presente" : "aggiungi ›"}
                </span>
              </button>
            );
          })}
          {results.length === 0 && (
            <div style={{ padding: "14px 4px", color: T.muted, fontSize: 12.5, lineHeight: 1.6 }}>
              Nessun risultato nel registro. Puoi inserirlo a mano qui sotto — il registro copre i principali,
              non tutti i fondi aziendali d&apos;Italia.
            </div>
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, background: T.soft }}>
          {!manual ? (
            <button onClick={() => setManual(true)} style={{
              border: "none", background: "transparent", color: T.teal,
              fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", padding: 0,
            }}>✏️ Non è in elenco — inseriscilo a mano</button>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={manualName} onChange={e => setManualName(e.target.value)} autoFocus
                placeholder="Nome ente"
                style={{
                  flex: "1 1 200px", padding: "9px 11px", border: `1px solid ${T.border}`,
                  borderRadius: 9, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                }}
              />
              <select value={manualKind} onChange={e => setManualKind(e.target.value as EnteKind)} style={{
                padding: "9px 11px", border: `1px solid ${T.border}`, borderRadius: 9,
                fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: "#fff",
              }}>
                {(Object.keys(KIND_LABEL) as EnteKind[]).map(k => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
              <button onClick={addManual} disabled={!manualName.trim() || busy} style={{
                padding: "9px 16px", borderRadius: 9, border: "none", background: T.teal,
                color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer",
                fontFamily: "inherit", opacity: manualName.trim() ? 1 : .5,
              }}>Aggiungi</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SCHEDA 2 — LISTINI
// ─────────────────────────────────────────────────────────────────────────
function ListiniTab({ studioId, enti, isMobile }: {
  studioId: string | null; enti: Ente[]; isMobile: boolean;
}) {
  const [enteId, setEnteId] = useState<string>("");
  const [rows, setRows] = useState<Tariffa[]>([]);
  const [loading, setLoading] = useState(false);
  const [newRow, setNewRow] = useState({ prestazione: "", tariffa: "", quota: "" });
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ prestazione: string; tariffa_ente: number | null; quota_paziente: number | null; keep: boolean }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!enteId && enti.length) setEnteId(enti[0].id); }, [enti, enteId]);

  const load = useCallback(async () => {
    if (!enteId) { setRows([]); return; }
    setLoading(true);
    const { data } = await supabase.from("convenzioni_tariffe")
      .select("id, ente_id, prestazione, tariffa_ente, quota_paziente, note")
      .eq("ente_id", enteId)
      .order("prestazione");
    setRows((data as Tariffa[]) || []);
    setLoading(false);
  }, [enteId]);

  useEffect(() => { void load(); }, [load]);

  const addRow = async () => {
    if (!studioId || !enteId || !newRow.prestazione.trim()) return;
    await supabase.from("convenzioni_tariffe").insert({
      studio_id: studioId, ente_id: enteId,
      prestazione: newRow.prestazione.trim(),
      tariffa_ente: newRow.tariffa ? Number(newRow.tariffa.replace(",", ".")) : null,
      quota_paziente: newRow.quota ? Number(newRow.quota.replace(",", ".")) : null,
    });
    setNewRow({ prestazione: "", tariffa: "", quota: "" });
    void load();
  };

  const delRow = async (r: Tariffa) => {
    await supabase.from("convenzioni_tariffe").delete().eq("id", r.id);
    void load();
  };

  // ── Import da foto o PDF del nomenclatore ──
  const onFile = async (f: File | null) => {
    if (!f || !enteId) return;
    setImporting(true); setImportError(null); setPreview(null);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] || "");
        r.onerror = () => rej(new Error("Lettura file fallita"));
        r.readAsDataURL(f);
      });
      const isPdf = f.type === "application/pdf";
      const resp = await fetch("/api/ai-tariffario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isPdf ? { pdf_base64: b64 } : { image_base64: b64, media_type: f.type || "image/jpeg" }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Errore lettura documento");
      const voci = (data?.result?.voci || []) as { prestazione: string; tariffa_ente: number | null; quota_paziente: number | null }[];
      if (!voci.length) { setImportError("Non ho trovato voci di tariffario in questo documento."); return; }
      setPreview(voci.map(v => ({ ...v, keep: true })));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Errore");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!studioId || !enteId || !preview) return;
    const keep = preview.filter(p => p.keep);
    if (!keep.length) { setPreview(null); return; }
    await supabase.from("convenzioni_tariffe").insert(
      keep.map(p => ({
        studio_id: studioId, ente_id: enteId,
        prestazione: p.prestazione,
        tariffa_ente: p.tariffa_ente,
        quota_paziente: p.quota_paziente,
      })),
    );
    setPreview(null);
    void load();
  };

  if (!enti.length) {
    return <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: "22px 18px", textAlign: "center", color: T.muted, fontSize: 13 }}>
      Aggiungi prima un ente nella scheda Enti.
    </div>;
  }

  const inputS: React.CSSProperties = {
    padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: 8,
    fontSize: 13, fontWeight: 600, fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <select value={enteId} onChange={e => setEnteId(e.target.value)} style={{ ...inputS, flex: "1 1 200px", background: "#fff" }}>
          {enti.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input
          ref={fileRef} type="file" accept="image/*,application/pdf"
          onChange={e => onFile(e.target.files?.[0] ?? null)} style={{ display: "none" }}
        />
        <button onClick={() => fileRef.current?.click()} disabled={importing} style={{
          padding: "9px 15px", borderRadius: 9, border: "none",
          background: importing ? "#cbd5e1" : `linear-gradient(135deg, ${T.teal}, ${T.blue})`,
          color: "#fff", fontWeight: 800, fontSize: 12.5,
          cursor: importing ? "default" : "pointer", fontFamily: "inherit",
        }}>{importing ? "Leggo il documento…" : "📷 Importa da foto/PDF"}</button>
      </div>

      {importError && (
        <div style={{
          padding: "10px 12px", marginBottom: 10, borderRadius: 10,
          background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
          color: T.red, fontSize: 12.5, fontWeight: 700,
        }}>{importError}</div>
      )}

      {/* Anteprima import: si conferma riga per riga, niente inserimenti al buio */}
      {preview && (
        <div style={{
          background: "#fff", border: `1px solid ${T.teal}`, borderRadius: 12,
          padding: "12px 14px", marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 4 }}>
            {preview.length} voci lette dal documento
          </div>
          <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
            Controlla gli importi prima di importare: l&apos;AI legge bene ma non è infallibile, e sulle tariffe un errore costa.
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 10 }}>
            {preview.map((p, i) => (
              <label key={i} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 4px",
                borderBottom: `1px solid ${T.borderSoft}`, fontSize: 12.5, cursor: "pointer",
              }}>
                <input type="checkbox" checked={p.keep} onChange={() => setPreview(prev => prev!.map((x, j) => j === i ? { ...x, keep: !x.keep } : x))} />
                <span style={{ flex: 1, minWidth: 0, color: T.text, fontWeight: 600 }}>{p.prestazione}</span>
                <span style={{ fontWeight: 800, color: T.teal, whiteSpace: "nowrap" }}>
                  {p.tariffa_ente != null ? euro.format(p.tariffa_ente) : "—"}
                </span>
                {p.quota_paziente != null && (
                  <span style={{ fontSize: 11, color: T.amber, fontWeight: 700, whiteSpace: "nowrap" }}>
                    +{euro.format(p.quota_paziente)} pz
                  </span>
                )}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={confirmImport} style={{
              padding: "9px 16px", borderRadius: 9, border: "none", background: T.teal,
              color: "#fff", fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
            }}>Importa {preview.filter(p => p.keep).length} voci</button>
            <button onClick={() => setPreview(null)} style={{
              padding: "9px 16px", borderRadius: 9, border: `1px solid ${T.border}`,
              background: "#fff", color: T.muted, fontWeight: 700, fontSize: 12.5,
              cursor: "pointer", fontFamily: "inherit",
            }}>Annulla</button>
          </div>
        </div>
      )}

      {/* Listino */}
      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr 76px 76px 28px" : "1fr 120px 120px 34px",
          gap: 8, padding: "9px 12px", background: T.soft, borderBottom: `1px solid ${T.borderSoft}`,
          fontSize: 10, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: 0.4,
        }}>
          <span>Prestazione</span><span>Paga l&apos;ente</span><span>Paga il pz.</span><span />
        </div>

        {loading && <div style={{ padding: 18, textAlign: "center", color: T.muted, fontSize: 12.5 }}>Carico…</div>}

        {!loading && rows.length === 0 && (
          <div style={{ padding: "18px 14px", textAlign: "center", color: T.muted, fontSize: 12.5, lineHeight: 1.6 }}>
            Listino vuoto. Aggiungi le voci a mano qui sotto, oppure carica la foto o il PDF del nomenclatore.
          </div>
        )}

        {rows.map(r => (
          <div key={r.id} style={{
            display: "grid", gridTemplateColumns: isMobile ? "1fr 76px 76px 28px" : "1fr 120px 120px 34px",
            gap: 8, padding: "9px 12px", borderBottom: `1px solid ${T.borderSoft}`, alignItems: "center",
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{r.prestazione}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: T.teal }}>{r.tariffa_ente != null ? euro.format(r.tariffa_ente) : "—"}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: r.quota_paziente ? T.amber : T.muted }}>{r.quota_paziente != null ? euro.format(r.quota_paziente) : "—"}</span>
            <button onClick={() => delRow(r)} title="Elimina" style={{
              border: "none", background: "transparent", cursor: "pointer",
              color: T.muted, fontWeight: 800, fontSize: 12, padding: 0,
            }}>✕</button>
          </div>
        ))}

        {/* Riga di inserimento */}
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr 76px 76px 28px" : "1fr 120px 120px 34px",
          gap: 8, padding: "10px 12px", background: T.soft, alignItems: "center",
        }}>
          <input
            value={newRow.prestazione}
            onChange={e => setNewRow(v => ({ ...v, prestazione: e.target.value }))}
            placeholder="Es. Seduta di fisioterapia" style={inputS}
          />
          <input value={newRow.tariffa} onChange={e => setNewRow(v => ({ ...v, tariffa: e.target.value }))} placeholder="25" inputMode="decimal" style={inputS} />
          <input value={newRow.quota} onChange={e => setNewRow(v => ({ ...v, quota: e.target.value }))} placeholder="0" inputMode="decimal" style={inputS} />
          <button onClick={addRow} disabled={!newRow.prestazione.trim()} title="Aggiungi" style={{
            border: "none", background: "transparent", cursor: "pointer",
            color: newRow.prestazione.trim() ? T.teal : T.muted, fontWeight: 800, fontSize: 17, padding: 0,
          }}>＋</button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SCHEDA 3 — DA FATTURARE
// ─────────────────────────────────────────────────────────────────────────
function FatturareTab({ studioId, enti, isMobile, displayName }: {
  studioId: string | null; enti: Ente[]; isMobile: boolean;
  displayName: (src: { first_name: string; last_name: string }, real?: string | null) => string;
}) {
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!studioId) return;
    setLoading(true);
    const from = new Date(month);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
    const { data } = await supabase.from("appointments")
      .select("id, start_at, amount, treatment_type, status, convenzione_ente_id, convenzione_auth_code, patients:patient_id(first_name, last_name)")
      .eq("studio_id", studioId)
      .not("convenzione_ente_id", "is", null)
      .neq("status", "cancelled")
      .gte("start_at", from.toISOString())
      .lte("start_at", to.toISOString())
      .order("start_at");
    setRows(((data as unknown) as SessionRow[]) || []);
    setLoading(false);
  }, [studioId, month]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const m = new Map<string, SessionRow[]>();
    rows.forEach(r => {
      const k = r.convenzione_ente_id || "?";
      const arr = m.get(k) || []; arr.push(r); m.set(k, arr);
    });
    return Array.from(m.entries()).map(([enteId, list]) => ({
      ente: enti.find(e => e.id === enteId),
      list,
      total: list.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    })).sort((a, b) => b.total - a.total);
  }, [rows, enti]);

  const exportCsv = (enteName: string, list: SessionRow[]) => {
    const head = "Data;Paziente;Prestazione;Autorizzazione;Importo\n";
    const body = list.map(r => {
      const nome = `${r.patients?.first_name ?? ""} ${r.patients?.last_name ?? ""}`.trim();
      const d = new Date(r.start_at).toLocaleDateString("it-IT");
      const imp = (Number(r.amount) || 0).toFixed(2).replace(".", ",");
      return `${d};${nome};${r.treatment_type ?? ""};${r.convenzione_auth_code ?? ""};${imp}`;
    }).join("\n");
    const blob = new Blob(["\uFEFF" + head + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${enteName.replace(/[^\w]+/g, "_")}_${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shiftMonth = (delta: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button onClick={() => shiftMonth(-1)} style={navBtn}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.text, minWidth: 150, textAlign: "center" }}>
          {month.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => shiftMonth(1)} style={navBtn}>›</button>
      </div>

      {loading && <div style={{ padding: 22, textAlign: "center", color: T.muted, fontSize: 13 }}>Carico…</div>}

      {!loading && grouped.length === 0 && (
        <div style={{
          background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12,
          padding: "22px 18px", textAlign: "center", color: T.muted, fontSize: 13, lineHeight: 1.6,
        }}>
          Nessuna seduta in convenzione questo mese. Le sedute compaiono qui quando, creando
          l&apos;appuntamento, scegli l&apos;ente nel campo «Convenzione».
        </div>
      )}

      {grouped.map(g => (
        <div key={g.ente?.id ?? "?"} style={{
          background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 12,
          marginBottom: 12, overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 14px", borderBottom: `1px solid ${T.borderSoft}`,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{g.ente?.name ?? "Ente rimosso"}</div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
                {g.list.length} sedut{g.list.length === 1 ? "a" : "e"}
                {g.ente?.network_name ? ` · pratiche via ${g.ente.network_name}` : ""}
              </div>
            </div>
            <span style={{ fontSize: 17, fontWeight: 800, color: T.teal }}>{euro.format(g.total)}</span>
            <button onClick={() => exportCsv(g.ente?.name ?? "ente", g.list)} style={{
              padding: "7px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
              background: "#fff", color: "#475569", fontWeight: 700, fontSize: 11.5,
              cursor: "pointer", fontFamily: "inherit",
            }}>⬇ CSV</button>
          </div>

          {g.list.map(r => {
            const nome = displayName(
              { first_name: r.patients?.first_name ?? "", last_name: r.patients?.last_name ?? "" },
              `${r.patients?.first_name ?? ""} ${r.patients?.last_name ?? ""}`.trim(),
            );
            return (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 14px", borderBottom: `1px solid ${T.borderSoft}`, fontSize: 12.5,
              }}>
                <span style={{ width: 58, fontWeight: 700, color: T.muted, flexShrink: 0 }}>
                  {new Date(r.start_at).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</span>
                {!isMobile && r.treatment_type && (
                  <span style={{ fontSize: 11, color: T.muted }}>{r.treatment_type}</span>
                )}
                {r.convenzione_auth_code ? (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", background: T.soft, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>
                    aut. {r.convenzione_auth_code}
                  </span>
                ) : (
                  <span title="Senza numero di autorizzazione la pratica può essere respinta" style={{ fontSize: 10.5, fontWeight: 800, color: T.amber, whiteSpace: "nowrap" }}>
                    ⚠ senza aut.
                  </span>
                )}
                <span style={{ fontWeight: 800, color: T.text, whiteSpace: "nowrap" }}>{euro.format(Number(r.amount) || 0)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

const navBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9, border: `1px solid ${T.border}`,
  background: "#fff", color: T.text, fontSize: 17, fontWeight: 800,
  cursor: "pointer", fontFamily: "inherit", lineHeight: 1,
};
