// ═══════════════════════════════════════════════════════════════════════
// src/lib/exercise/printProgram.ts
// ═══════════════════════════════════════════════════════════════════════
// Renderer HTML stampabile (→ PDF) del programma esercizi completo, con
// tabella di progressione settimanale per ogni esercizio. Stile brand
// FisioHub (gradiente teal→blu). Usato dal builder via openHtmlWindow:
// la finestra si apre e lancia la stampa (Salva come PDF).
// ═══════════════════════════════════════════════════════════════════════

import type { Esercizio } from "@/src/components/patient/ExerciseProgramSection";

const FASE_LABEL: Record<string, string> = {
  acuta: "Fase acuta", subacuta: "Fase subacuta", cronica: "Fase di consolidamento",
};

const CAT_LABEL: Record<string, string> = {
  stretching: "Stretching", rinforzo: "Rinforzo", mobilita: "Mobilità",
  respirazione: "Respirazione", equilibrio: "Equilibrio",
};

type Opts = {
  patientName: string;
  fase: string;
  durata: number;
  startDate: string;          // YYYY-MM-DD
  studio: {
    name?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
  } | null;
  publicUrl?: string | null;  // link alla scheda online (mostrato in nota)
};

function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderProgramHtml(esercizi: Esercizio[], o: Opts): string {
  const startFmt = o.startDate
    ? new Date(o.startDate + "T00:00:00").toLocaleDateString("it-IT",
        { day: "2-digit", month: "long", year: "numeric" })
    : "—";
  const header = [o.studio?.signature_name, o.studio?.signature_title]
    .filter(Boolean).join(" · ") || o.studio?.name || "";

  const blocks = esercizi.map((e, i) => {
    const cat = CAT_LABEL[(e.categoria ?? "").toLowerCase()] ?? "Rinforzo";
    const rows = (e.progressione ?? [])
      .map(s => `<tr>
        <td class="w">${s.settimana}</td>
        <td>${esc(s.serie)}</td>
        <td>${esc(s.ripetizioni)}</td>
        <td class="c">${esc(s.carico)}</td>
      </tr>`).join("");

    return `
    <div class="ex">
      <div class="ex-head">
        <span class="num">${i + 1}</span>
        <span class="ex-nome">${esc(e.nome)}</span>
        <span class="cat">${esc(cat)}</span>
      </div>
      <div class="dose">Base: <strong>${esc(e.serie)} serie × ${esc(e.ripetizioni)}</strong> · ${esc(e.frequenza)}</div>
      ${e.descrizione ? `<p class="desc">${esc(e.descrizione)}</p>` : ""}
      ${e.avvertenze ? `<p class="warn">⚠ ${esc(e.avvertenze)}</p>` : ""}
      ${rows ? `
      <table>
        <thead><tr><th class="w">Sett.</th><th>Serie</th><th>Rip.</th><th class="c">Carico / variante</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : ""}
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Programma esercizi — ${esc(o.patientName)}</title>
<style>
  @page { size: A4; margin: 14mm 13mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a;
    margin: 0; font-size: 12px; line-height: 1.55; }
  .head { border-radius: 12px; padding: 16px 20px; color: #fff; margin-bottom: 14px;
    background: linear-gradient(135deg, #0d9488, #2563eb);
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head .studio { font-size: 10.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .07em; opacity: .85; }
  .head h1 { font-size: 18px; margin: 3px 0 2px; }
  .head .pat { font-size: 13px; font-weight: 600; }
  .meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .meta span { font-size: 10.5px; font-weight: 800; border: 1.2px solid rgba(255,255,255,.45);
    border-radius: 99px; padding: 2px 10px; }
  .intro { font-size: 11px; color: #0d9488; font-weight: 600; border: 1.2px solid #99e6dd;
    background: #f0fbf9; border-radius: 9px; padding: 8px 12px; margin-bottom: 14px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ex { border: 1.3px solid #cbd5e1; border-radius: 11px; padding: 11px 14px;
    margin-bottom: 11px; page-break-inside: avoid; }
  .ex-head { display: flex; align-items: center; gap: 8px; }
  .num { width: 20px; height: 20px; border-radius: 6px; color: #fff; font-size: 11px;
    font-weight: 800; display: inline-flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #0d9488, #2563eb);
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ex-nome { font-size: 13.5px; font-weight: 800; flex: 1; }
  .cat { font-size: 9.5px; font-weight: 800; color: #0d9488; border: 1.2px solid #99e6dd;
    border-radius: 99px; padding: 1px 9px; }
  .dose { font-size: 11px; color: #475569; margin: 4px 0 0 28px; }
  .desc { margin: 6px 0 0 28px; font-size: 11.5px; color: #334155; }
  .warn { margin: 5px 0 0 28px; font-size: 10.5px; color: #b91c1c; font-weight: 600; }
  table { width: calc(100% - 28px); margin: 8px 0 2px 28px; border-collapse: collapse;
    font-size: 10.5px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .04em;
    color: #64748b; border-bottom: 1.3px solid #cbd5e1; padding: 3px 7px; }
  td { padding: 4px 7px; border-bottom: 1px solid #e8edf3; }
  td.w, th.w { width: 36px; font-weight: 800; color: #0d9488; }
  td.c, th.c { width: 45%; }
  tbody tr:nth-child(even) td { background: #f8fafc;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .foot { margin-top: 18px; text-align: center; font-size: 10.5px; color: #64748b; }
  .foot .firma { font-weight: 800; color: #0f172a; font-size: 12px; }
  .link { font-size: 10px; color: #2563eb; word-break: break-all; margin-top: 4px; }
</style>
</head>
<body>
  <div class="head">
    ${header ? `<div class="studio">${esc(header)}</div>` : ""}
    <h1>Programma Esercizi Domiciliari</h1>
    <div class="pat">${esc(o.patientName)}</div>
    <div class="meta">
      ${FASE_LABEL[o.fase] ? `<span>${esc(FASE_LABEL[o.fase])}</span>` : ""}
      <span>${o.durata} settimane</span>
      <span>Inizio: ${esc(startFmt)}</span>
    </div>
  </div>

  <div class="intro">
    Esegui gli esercizi seguendo la tabella di progressione: ogni settimana ha i suoi valori
    di serie, ripetizioni e carico. In caso di dolore acuto interrompi e contatta lo studio.
    ${o.publicUrl ? `<div class="link">Scheda online con video dimostrativi: ${esc(o.publicUrl)}</div>` : ""}
  </div>

  ${blocks}

  <div class="foot">
    ${header ? `<div class="firma">${esc(header)}</div>` : ""}
    <div>Documento generato il ${new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}</div>
  </div>

  <script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});</script>
</body>
</html>`;
}
