"use client";

// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/settings/components/sections/DataTransferSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Portare i dati dentro e fuori da FisioHub.
//
// L'import è a tre passi dichiarati — file, corrispondenze, anteprima —
// perché scrivere in archivio senza aver mostrato prima cosa si sta per
// scrivere è il modo più veloce per rovinare un anagrafica pazienti.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { supabase } from "@/src/lib/supabaseClient";
import { esportaStudio } from "@/src/lib/dataTransfer/exportStudio";
import {
  leggiFile, suggerisciMappatura, preparaAnteprima,
  CAMPI, type CampoPaziente, type FileLetto, type Anteprima,
} from "@/src/lib/dataTransfer/importPatients";

export type DataTransferSectionProps = {
  show: boolean;
  onToggle: () => void;
  studioId: string | null;
};

type Passo = "file" | "mappa" | "anteprima" | "fatto";

export default function DataTransferSection(p: DataTransferSectionProps) {
  // ── Export ──
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // ── Import ──
  const [passo, setPasso] = useState<Passo>("file");
  const [fileNome, setFileNome] = useState("");
  const [letto, setLetto] = useState<FileLetto | null>(null);
  const [mappa, setMappa] = useState<Record<number, CampoPaziente | "">>({});
  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [lavorando, setLavorando] = useState(false);
  const [importate, setImportate] = useState(0);

  async function esporta() {
    if (!p.studioId) return;
    setExporting(true); setExportMsg(null);
    try {
      const { blob, nomeFile, conteggi } = await esportaStudio(
        p.studioId,
        (fatto, totale, etichetta) => setExportMsg(`${etichetta}… (${fatto}/${totale})`)
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeFile; a.click();
      URL.revokeObjectURL(url);
      const totRighe = Object.values(conteggi).filter(n => n > 0).reduce((s, n) => s + n, 0);
      setExportMsg(`Scaricato ${nomeFile} — ${totRighe} righe in ${Object.keys(conteggi).length} fogli.`);
    } catch (e) {
      setExportMsg("Errore: " + (e instanceof Error ? e.message : "imprevisto"));
    } finally {
      setExporting(false);
    }
  }

  async function scegliFile(f: File) {
    setErrore(null); setLavorando(true); setFileNome(f.name);
    try {
      const r = await leggiFile(f);
      if (r.righe.length === 0) { setErrore("Il file non contiene righe di dati."); return; }
      setLetto(r);
      setMappa(suggerisciMappatura(r.intestazioni));
      setPasso("mappa");
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Non riesco a leggere il file.");
    } finally {
      setLavorando(false);
    }
  }

  async function vaiAdAnteprima() {
    if (!letto || !p.studioId) return;
    setLavorando(true);
    try {
      // Serve l'anagrafica attuale per riconoscere chi c'è già
      const { data } = await supabase.from("patients")
        .select("tax_code, last_name, first_name, birth_date")
        .eq("studio_id", p.studioId);
      setAnteprima(preparaAnteprima(letto, mappa, data ?? []));
      setPasso("anteprima");
    } finally {
      setLavorando(false);
    }
  }

  async function importa() {
    if (!anteprima || !p.studioId) return;
    setLavorando(true);
    try {
      const daInserire = anteprima.righe.filter(r => !r.scarta).map(r => ({
        ...r.valori, studio_id: p.studioId,
      }));
      // A blocchi: un unico insert da migliaia di righe va in timeout
      let fatte = 0;
      for (let i = 0; i < daInserire.length; i += 100) {
        const blocco = daInserire.slice(i, i + 100);
        const { error } = await supabase.from("patients").insert(blocco);
        if (error) { setErrore(`Errore alla riga ${i + 1}: ${error.message}`); break; }
        fatte += blocco.length;
        setImportate(fatte);
      }
      setImportate(fatte);
      setPasso("fatto");
    } finally {
      setLavorando(false);
    }
  }

  function ricomincia() {
    setPasso("file"); setLetto(null); setAnteprima(null);
    setFileNome(""); setErrore(null); setImportate(0);
  }

  const campiObbligatoriMancanti = CAMPI
    .filter(c => c.obbligatorio)
    .filter(c => !Object.values(mappa).includes(c.id));

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Importa ed esporta dati</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            Porta dentro le anagrafiche da un altro gestionale, o scarica tutto
          </div>
        </div>
        <span style={{
          color: THEME.muted, fontSize: 12,
          transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s",
        }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: 20 }}>

          {/* ── ESPORTA ────────────────────────────────────────────── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>
              Esporta tutto
            </div>
            <p style={{ fontSize: 12.5, color: THEME.muted, marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
              Un file Excel con un foglio per ogni cosa: pazienti, appuntamenti,
              pacchetti, scale, diario, autovalutazioni, consensi, listino.
              I tuoi dati restano tuoi e puoi portarteli via quando vuoi.
            </p>
            <button onClick={() => void esporta()} disabled={exporting || !p.studioId}
              style={{
                padding: "9px 18px", borderRadius: 7, border: "none", background: THEME.teal,
                color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                opacity: exporting ? 0.6 : 1,
              }}>
              {exporting ? "Preparo il file…" : "Scarica export completo"}
            </button>
            {exportMsg && (
              <div style={{ fontSize: 12, color: THEME.muted, marginTop: 8 }}>{exportMsg}</div>
            )}
          </div>

          <div style={{ height: 1, background: THEME.border, marginBottom: 20 }} />

          {/* ── IMPORTA ────────────────────────────────────────────── */}
          <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 4 }}>
            Importa anagrafiche
          </div>
          <p style={{ fontSize: 12.5, color: THEME.muted, marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
            Va bene qualunque file Excel o CSV, da qualsiasi gestionale: sei tu a
            dire quale colonna è cosa. Prima di scrivere niente ti mostro
            l&apos;anteprima con doppioni e righe problematiche.
          </p>

          {/* Avanzamento */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {(["file", "mappa", "anteprima", "fatto"] as Passo[]).map((s, i) => {
              const attivo = ["file", "mappa", "anteprima", "fatto"].indexOf(passo) >= i;
              return (
                <div key={s} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: attivo ? THEME.teal : THEME.border,
                }} />
              );
            })}
          </div>

          {errore && (
            <div style={{
              padding: "10px 12px", borderRadius: 7, marginBottom: 12,
              background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.25)",
              color: THEME.red, fontSize: 12.5,
            }}>{errore}</div>
          )}

          {/* Passo 1 — file */}
          {passo === "file" && (
            <div>
              <label style={labelStyle}>Scegli il file</label>
              <input type="file" accept=".csv,.xlsx,.xls"
                onChange={e => { const f = e.target.files?.[0]; if (f) void scegliFile(f); }}
                style={{ ...inputStyle, padding: 8 }} />
              <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 6 }}>
                Se il tuo gestionale esporta in PDF, non va bene: serve un file di
                dati. Quasi tutti hanno un&apos;opzione &quot;esporta in Excel&quot; o &quot;CSV&quot;.
              </div>
            </div>
          )}

          {/* Passo 2 — corrispondenze */}
          {passo === "mappa" && letto && (
            <div>
              <div style={{ fontSize: 12.5, color: THEME.textSoft, marginBottom: 10 }}>
                <strong>{fileNome}</strong> · {letto.righe.length} righe ·{" "}
                {letto.intestazioni.length} colonne. Ho già proposto gli
                abbinamenti che riconosco: correggi quelli sbagliati e lascia
                vuoto ciò che non ti serve.
              </div>

              <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${THEME.border}`, borderRadius: 8 }}>
                {letto.intestazioni.map((h, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                    borderBottom: i < letto.intestazioni.length - 1 ? `1px solid ${THEME.border}` : "none",
                  }}>
                    <div style={{ flex: "1 1 40%", minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text }}>{h}</div>
                      <div style={{
                        fontSize: 11, color: THEME.muted, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {letto.righe.slice(0, 2).map(r => r[i]).filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <span style={{ color: THEME.muted, fontSize: 13 }}>→</span>
                    <select
                      value={mappa[i] ?? ""}
                      onChange={e => setMappa({ ...mappa, [i]: e.target.value as CampoPaziente | "" })}
                      style={{ ...inputStyle, flex: "1 1 45%", padding: "6px 8px", fontSize: 12.5 }}
                    >
                      <option value="">— non importare —</option>
                      {CAMPI.map(c => (
                        <option key={c.id} value={c.id}>{c.label}{c.obbligatorio ? " *" : ""}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {campiObbligatoriMancanti.length > 0 && (
                <div style={{ fontSize: 12, color: THEME.red, marginTop: 8 }}>
                  Manca l&apos;abbinamento per: {campiObbligatoriMancanti.map(c => c.label).join(", ")}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={ricomincia}
                  style={{ padding: "9px 16px", borderRadius: 7, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  Cambia file
                </button>
                <button onClick={() => void vaiAdAnteprima()}
                  disabled={campiObbligatoriMancanti.length > 0 || lavorando}
                  style={{
                    padding: "9px 18px", borderRadius: 7, border: "none", background: THEME.teal,
                    color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                    opacity: (campiObbligatoriMancanti.length > 0 || lavorando) ? 0.5 : 1,
                  }}>
                  {lavorando ? "Controllo…" : "Vedi anteprima"}
                </button>
              </div>
            </div>
          )}

          {/* Passo 3 — anteprima */}
          {passo === "anteprima" && anteprima && (
            <div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <Riquadro n={anteprima.valide} etichetta="da importare" colore={THEME.teal} />
                <Riquadro n={anteprima.scartate} etichetta="saltate" colore={anteprima.scartate > 0 ? "#b45309" : THEME.muted} />
                <Riquadro n={anteprima.conAvvisi} etichetta="con avvisi" colore={THEME.muted} />
              </div>

              <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${THEME.border}`, borderRadius: 8 }}>
                {anteprima.righe.map(r => (
                  <div key={r.numero} style={{
                    padding: "8px 12px", borderBottom: `1px solid ${THEME.border}`,
                    background: r.scarta ? "rgba(180,83,9,0.04)" : "#fff",
                    opacity: r.scarta ? 0.75 : 1,
                  }}>
                    <div style={{ fontSize: 12.5, color: THEME.text, fontWeight: r.scarta ? 400 : 700 }}>
                      {r.numero}. {r.valori.last_name ?? "—"} {r.valori.first_name ?? ""}
                      {r.valori.birth_date && (
                        <span style={{ fontWeight: 400, color: THEME.muted }}>
                          {" "}· {new Date(r.valori.birth_date).toLocaleDateString("it-IT")}
                        </span>
                      )}
                    </div>
                    {r.problemi.length > 0 && (
                      <div style={{ fontSize: 11, color: r.scarta ? "#b45309" : THEME.muted, marginTop: 1 }}>
                        {r.problemi.join(" · ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={() => setPasso("mappa")}
                  style={{ padding: "9px 16px", borderRadius: 7, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  Correggi abbinamenti
                </button>
                <button onClick={() => void importa()} disabled={anteprima.valide === 0 || lavorando}
                  style={{
                    padding: "9px 18px", borderRadius: 7, border: "none", background: THEME.teal,
                    color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                    opacity: (anteprima.valide === 0 || lavorando) ? 0.5 : 1,
                  }}>
                  {lavorando ? `Importo… ${importate}` : `Importa ${anteprima.valide} pazienti`}
                </button>
              </div>
            </div>
          )}

          {/* Passo 4 — fatto */}
          {passo === "fatto" && (
            <div style={{
              padding: "16px", borderRadius: 8,
              background: "rgba(13,148,136,0.06)", border: `1px solid ${THEME.border}`,
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: THEME.text, marginBottom: 4 }}>
                Importati {importate} pazienti
              </div>
              <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 12, lineHeight: 1.5 }}>
                Li trovi nell&apos;elenco pazienti. Le righe saltate non sono state
                scritte: se erano doppioni è corretto così, altrimenti correggi il
                file e reimporta solo quelle.
              </div>
              <button onClick={ricomincia}
                style={{ padding: "8px 16px", borderRadius: 7, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.text, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                Importa un altro file
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Riquadro({ n, etichetta, colore }: { n: number; etichetta: string; colore: string }) {
  return (
    <div style={{
      flex: "1 1 90px", padding: "9px 12px", borderRadius: 8,
      background: THEME.panelSoft, border: `1px solid ${THEME.border}`,
    }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: colore }}>{n}</div>
      <div style={{ fontSize: 11, color: THEME.muted }}>{etichetta}</div>
    </div>
  );
}
