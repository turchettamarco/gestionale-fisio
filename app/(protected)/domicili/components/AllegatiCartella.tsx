// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/domicili/components/AllegatiCartella.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Cartelle cartacee allegate al paziente PAI: quelle già compilate a
// mano, o compilate da un altro operatore, che devono comunque finire
// nel gestionale accanto alle valutazioni digitali.
//
// FLUSSO FOTO (quello buono): si fotografano le pagine con l'iPad, ogni
// scatto viene compresso e tutte le pagine finiscono in un solo PDF.
// Il peso prima/dopo è mostrato esplicitamente.
//
// STORAGE: bucket `patient_docs`, prefisso `coop_valutazioni/`. Se il
// bucket rifiuta la scrittura l'errore viene detto per quello che è
// (policy da aggiungere), invece di sparire in un generico "errore".
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import {
  comprimiPagina, paginePdf, ottimizzaPdf, kb,
  type PaginaCompressa,
} from "@/src/lib/domicili/scanCompress";

const T = {
  text: "#0f172a", muted: "#334155", label: "#64748b",
  border: "#cbd5e1", borderSoft: "#e2e8f0",
  teal: "#0d9488", tealDark: "#0f766e", red: "#dc2626", green: "#16a34a",
};

const BUCKET = "patient_docs";
const PREFIX = "coop_valutazioni";

export type Allegato = {
  id: string;
  titolo: string;
  storage_path: string;
  mime: string | null;
  size_kb: number | null;
  pagine: number | null;
  origine: string | null;
  created_at: string;
};

export default function AllegatiCartella({
  studioId, patientId, valutazioneId, nomePaziente, onWhatsApp,
}: {
  studioId: string;
  patientId: string;
  valutazioneId: string | null;
  nomePaziente: string;
  /** Invia un allegato via WhatsApp (condivisione nativa o fallback). */
  onWhatsApp: (file: File) => void;
}) {
  const [lista, setLista] = useState<Allegato[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagine, setPagine] = useState<PaginaCompressa[]>([]);
  const [pesoOriginale, setPesoOriginale] = useState(0);
  const [titolo, setTitolo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  // Ricarica pilotata da un contatore: le azioni chiamano carica(), che si
  // limita a incrementarlo — così nell'effect non c'è nessun setState
  // sincrono e la lista resta una sola fonte di verità.
  const [rev, setRev] = useState(0);
  const carica = useCallback(() => setRev(n => n + 1), []);

  useEffect(() => {
    if (!patientId) return;
    let vivo = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("coop_allegati")
          .select("id, titolo, storage_path, mime, size_kb, pagine, origine, created_at")
          .eq("coop_patient_id", patientId)
          .order("created_at", { ascending: false });
        if (vivo) setLista((data || []) as Allegato[]);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [patientId, rev]);

  const aggiungiFoto = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setErr(null);
    setBusy("Comprimo le pagine…");
    try {
      const nuove: PaginaCompressa[] = [];
      let orig = 0;
      for (const f of Array.from(files)) {
        orig += f.size;
        nuove.push(await comprimiPagina(f));
      }
      setPagine(p => [...p, ...nuove]);
      setPesoOriginale(v => v + orig);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore compressione");
    } finally {
      setBusy(null);
      if (fotoRef.current) fotoRef.current.value = "";
    }
  };

  const upload = async (blob: Blob, nomeFile: string, origine: string, nPagine: number) => {
    const path = `${PREFIX}/${patientId}/${Date.now()}_${nomeFile.replace(/[^\w.\-() ]+/g, "_")}`;
    const up = await supabase.storage.from(BUCKET).upload(path, blob, {
      upsert: false, contentType: "application/pdf",
    });
    if (up.error) {
      const m = up.error.message || "";
      if (/policy|permission|unauthor|row-level/i.test(m)) {
        throw new Error(
          "Lo storage ha rifiutato il caricamento: al bucket manca la policy per la cartella coop_valutazioni. " +
          "Aggiungila in Supabase (SQL nella consegna) e riprova."
        );
      }
      throw new Error(m || "Upload fallito");
    }
    const ins = await supabase.from("coop_allegati").insert({
      studio_id: studioId,
      coop_patient_id: patientId,
      valutazione_id: valutazioneId,
      titolo: titolo.trim() || nomeFile,
      storage_path: path,
      mime: "application/pdf",
      size_kb: Math.round(blob.size / 1024),
      pagine: nPagine || null,
      origine,
    });
    if (ins.error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw new Error(ins.error.message);
    }
  };

  const salvaFoto = async () => {
    if (!pagine.length) return;
    setErr(null);
    setBusy("Creo il PDF…");
    try {
      const blob = await paginePdf(pagine);
      await upload(blob, `${titolo.trim() || "Cartella"}.pdf`, "foto", pagine.length);
      setPagine([]); setPesoOriginale(0); setTitolo("");
      carica();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore salvataggio");
    } finally {
      setBusy(null);
    }
  };

  const caricaPdf = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setErr(null);
    setBusy("Ottimizzo il PDF…");
    try {
      const { blob, pagine: n } = await ottimizzaPdf(f);
      await upload(blob, f.name, "pdf", n);
      setTitolo("");
      carica();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setBusy(null);
      if (pdfRef.current) pdfRef.current.value = "";
    }
  };

  const apri = async (a: Allegato) => {
    const res = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 300);
    if (res.error || !res.data?.signedUrl) { setErr("Impossibile aprire il file."); return; }
    window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const inviaWa = async (a: Allegato) => {
    setBusy("Preparo l'invio…");
    try {
      const res = await supabase.storage.from(BUCKET).download(a.storage_path);
      if (res.error || !res.data) { setErr("Impossibile scaricare il file."); return; }
      onWhatsApp(new File([res.data], `${a.titolo}.pdf`, { type: "application/pdf" }));
    } finally {
      setBusy(null);
    }
  };

  const elimina = async (a: Allegato) => {
    if (!window.confirm(`Eliminare "${a.titolo}"?`)) return;
    await supabase.from("coop_allegati").delete().eq("id", a.id);
    await supabase.storage.from(BUCKET).remove([a.storage_path]);
    carica();
  };

  const pesoCompresso = pagine.reduce((s, p) => s + p.bytes, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {err && (
        <div style={{
          background: "#fef2f2", color: T.red, border: "1px solid #fecaca",
          borderRadius: 10, padding: "10px 12px", fontSize: 12.5, fontWeight: 600, lineHeight: 1.5,
        }}>{err}</div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 14, padding: "15px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: T.text, marginBottom: 3 }}>Allega una cartella cartacea</div>
        <div style={{ fontSize: 12, color: T.label, marginBottom: 12, lineHeight: 1.5 }}>
          Fotografa le pagine una per una: vengono compresse e unite in un solo PDF.
          Se hai già un PDF puoi caricarlo direttamente.
        </div>

        <input ref={fotoRef} type="file" accept="image/*" multiple capture="environment"
          onChange={e => void aggiungiFoto(e.target.files)} style={{ display: "none" }} />
        <input ref={pdfRef} type="file" accept="application/pdf"
          onChange={e => void caricaPdf(e.target.files)} style={{ display: "none" }} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: pagine.length ? 14 : 0 }}>
          <button type="button" disabled={!!busy} onClick={() => fotoRef.current?.click()} style={btn("pri", !!busy)}>
            📷 Fotografa pagine
          </button>
          <button type="button" disabled={!!busy} onClick={() => pdfRef.current?.click()} style={btn("ghost", !!busy)}>
            📄 Carica PDF
          </button>
          {busy && <span style={{ alignSelf: "center", fontSize: 12.5, fontWeight: 700, color: T.tealDark }}>{busy}</span>}
        </div>

        {pagine.length > 0 && (
          <div style={{ borderTop: `1px solid ${T.borderSoft}`, paddingTop: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                {pagine.length} {pagine.length === 1 ? "pagina" : "pagine"}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 800, color: T.green,
                background: "#f0fdf4", borderRadius: 8, padding: "3px 9px",
              }}>
                {kb(pesoOriginale)} → {kb(pesoCompresso)}
                {pesoOriginale > 0 ? ` · −${Math.round((1 - pesoCompresso / pesoOriginale) * 100)}%` : ""}
              </span>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={() => { setPagine([]); setPesoOriginale(0); }} style={btn("ghost")}>
                Svuota
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 12 }}>
              {pagine.map((p, i) => (
                <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.dataUrl} alt={`Pagina ${i + 1}`} style={{
                    width: 78, height: 104, objectFit: "cover",
                    borderRadius: 8, border: `1px solid ${T.border}`, display: "block",
                  }} />
                  <span style={{
                    position: "absolute", top: 4, left: 4, background: "rgba(15,23,42,.75)",
                    color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 5, padding: "1px 5px",
                  }}>{i + 1}</span>
                  <button type="button" onClick={() => setPagine(list => list.filter((_, j) => j !== i))}
                    title="Togli questa pagina"
                    style={{
                      position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 6,
                      border: "none", background: "rgba(220,38,38,.9)", color: "#fff",
                      fontSize: 11, fontWeight: 900, cursor: "pointer", lineHeight: 1,
                    }}>✕</button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={titolo} onChange={e => setTitolo(e.target.value)}
                placeholder="Titolo (es. Cartella firmata 22/07)"
                style={{
                  flex: "1 1 220px", border: `1.5px solid ${T.border}`, borderRadius: 10,
                  padding: "10px 12px", fontSize: 14, color: T.text, fontFamily: "inherit", outline: "none",
                }} />
              <button type="button" disabled={!!busy} onClick={() => void salvaFoto()} style={btn("pri", !!busy)}>
                Salva come PDF
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${T.borderSoft}`, borderRadius: 14, padding: "15px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: T.text, marginBottom: 11 }}>
          Cartelle allegate di {nomePaziente}
        </div>
        {loading && <div style={{ fontSize: 12.5, color: T.label }}>Caricamento…</div>}
        {!loading && lista.length === 0 && (
          <div style={{ fontSize: 12.5, color: T.label, lineHeight: 1.5, padding: "6px 0" }}>
            Nessuna cartella allegata. Le scansioni caricate qui restano insieme alle valutazioni digitali.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lista.map(a => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              border: `1px solid ${T.borderSoft}`, borderRadius: 11, padding: "10px 12px",
            }}>
              <span style={{ fontSize: 17 }}>{a.origine === "foto" ? "🖼" : "📄"}</span>
              <span style={{ flex: "1 1 150px", minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.titolo}
                </span>
                <span style={{ display: "block", fontSize: 11, color: T.label, fontWeight: 600 }}>
                  {new Date(a.created_at).toLocaleDateString("it-IT")}
                  {a.pagine ? ` · ${a.pagine} pag.` : ""}
                  {a.size_kb ? ` · ${a.size_kb} KB` : ""}
                </span>
              </span>
              <button type="button" onClick={() => void apri(a)} style={btn("ghost")}>Apri</button>
              <button type="button" disabled={!!busy} onClick={() => void inviaWa(a)} style={btn("wa", !!busy)}>WhatsApp</button>
              <button type="button" onClick={() => void elimina(a)} title="Elimina" style={btn("danger")}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function btn(kind: "pri" | "ghost" | "wa" | "danger", busy?: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 800,
    cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? .6 : 1,
    flexShrink: 0,
  };
  if (kind === "pri") return { ...base, border: "none", background: T.teal, color: "#fff" };
  if (kind === "wa") return { ...base, border: "none", background: "#25D366", color: "#0b3d1f" };
  if (kind === "danger") return { ...base, border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.05)", color: T.red, padding: "10px 12px" };
  return { ...base, border: `1px solid ${T.border}`, background: "#fff", color: T.muted };
}
