"use client";

// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/domicili/components/ReportSettimanale.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Report settimanale della sezione Domicili Cooperative — "Entrambi":
//   • vista A SCHERMO: griglia paziente × giorni (✓ fatto, ◻ pianificato,
//     ✕ saltato) con totale settimana e progressivo accessi n/tot;
//   • SCARICA PDF: jsPDF + autotable (già dipendenze del progetto),
//     intestazione con logo della cooperativa, A4 verticale.
//
// Il PDF usa dati REALI anche in Privacy Mode (serve alla cooperativa
// per la rendicontazione — stessa regola di ricevute e report studio);
// la vista a schermo invece rispetta la Privacy Mode.
// ═══════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import {
  Cooperative, CoopPatient, CoopAccess, PatientCounters,
  DOW_LABELS, addDays, localISO, fmtWeekRange, normTime,
} from "@/src/lib/domicili/types";

const T = {
  teal: "#0d9488", tealDark: "#0f766e", blue: "#2563eb", text: "#0f172a",
  muted: "#475569", border: "#e2e8f0", soft: "#f8fafc", red: "#dc2626", green: "#16a34a",
};

type Props = {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
  weekStart: Date;                       // lunedì
  coop: Cooperative | null;              // null = tutte le cooperative
  cooperatives: Cooperative[];
  patients: CoopPatient[];               // tutti i pazienti dello studio
  weekAccesses: CoopAccess[];            // accessi della settimana (tutti)
  countersByPatient: Map<string, PatientCounters>;
  /** Maschera nomi per la vista a schermo (Privacy Mode). Il PDF resta reale. */
  displayName: (fullName: string) => string;
};

type Row = {
  patient: CoopPatient;
  cells: (CoopAccess | null)[];          // 6 celle LUN..SAB
  fattiSett: number;
};

export default function ReportSettimanale({
  open, onClose, isMobile, weekStart, coop, cooperatives,
  patients, weekAccesses, countersByPatient, displayName,
}: Props) {
  const [pdfBusy, setPdfBusy] = useState(false);

  const weekISO = useMemo(
    () => Array.from({ length: 6 }, (_, i) => localISO(addDays(weekStart, i))),
    [weekStart]
  );

  // Righe: pazienti (nel perimetro) con almeno un accesso nella settimana
  const groups = useMemo(() => {
    const scopeCoops = coop ? [coop] : cooperatives.filter(c => c.attiva);
    const accByPatient = new Map<string, CoopAccess[]>();
    for (const a of weekAccesses) {
      const arr = accByPatient.get(a.coop_patient_id) || [];
      arr.push(a);
      accByPatient.set(a.coop_patient_id, arr);
    }

    return scopeCoops.map(c => {
      const rows: Row[] = patients
        .filter(p => p.cooperative_id === c.id && accByPatient.has(p.id))
        .sort((a, b) => (a.cognome + a.nome).localeCompare(b.cognome + b.nome))
        .map(p => {
          const acc = accByPatient.get(p.id) || [];
          const byData = new Map(acc.map(a => [a.data, a]));
          const cells = weekISO.map(iso => byData.get(iso) || null);
          const fattiSett = acc.filter(a => a.stato === "fatto").length;
          return { patient: p, cells, fattiSett };
        });
      return { coop: c, rows };
    }).filter(g => g.rows.length > 0);
  }, [coop, cooperatives, patients, weekAccesses, weekISO]);

  const totals = useMemo(() => {
    let fatti = 0, pianificati = 0, saltati = 0;
    for (const g of groups) for (const r of g.rows) for (const c of r.cells) {
      if (!c) continue;
      if (c.stato === "fatto") fatti++;
      else if (c.stato === "pianificato") pianificati++;
      else saltati++;
    }
    return { fatti, pianificati, saltati };
  }, [groups]);

  // ─── PDF ────────────────────────────────────────────────────────────

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      let y = 16;

      const title = coop ? coop.nome : "Tutte le cooperative";

      // Logo (se caricabile) — best effort, il report vale anche senza
      if (coop?.logo_url) {
        try {
          const dataUrl = await imgToDataURL(coop.logo_url);
          doc.addImage(dataUrl, "PNG", 14, y - 4, 16, 16);
        } catch { /* senza logo */ }
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text("Report settimanale accessi domiciliari", coop?.logo_url ? 34 : 14, y + 2);
      doc.setFontSize(11);
      doc.setTextColor(13, 148, 136);
      doc.text(title, coop?.logo_url ? 34 : 14, y + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Settimana ${fmtWeekRange(weekStart)}`, pageW - 14, y + 2, { align: "right" });
      doc.text(`Generato il ${new Date().toLocaleDateString("it-IT")}`, pageW - 14, y + 7, { align: "right" });
      y += 16;

      for (const g of groups) {
        if (!coop) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(15, 23, 42);
          doc.text(g.coop.nome, 14, y + 4);
          y += 6;
        }

        const body = g.rows.map(r => {
          const counters = countersByPatient.get(r.patient.id);
          const tot = r.patient.tot_accessi;
          const progr = counters
            ? tot ? `${counters.fatti}/${tot}` : String(counters.fatti)
            : "";
          return [
            `${r.patient.cognome} ${r.patient.nome}`,
            ...r.cells.map(c => !c ? "" : c.stato === "fatto" ? "X" : c.stato === "pianificato" ? "\u00B7" : "S"),
            String(r.fattiSett),
            progr,
          ];
        });

        autoTable(doc, {
          startY: y,
          head: [["Paziente", "LUN", "MAR", "MER", "GIO", "VEN", "SAB", "Sett.", "Progressivo"]],
          body,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 2.2, textColor: [15, 23, 42], halign: "center" },
          headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
          columnStyles: {
            0: { halign: "left", cellWidth: 52, fontStyle: "bold" },
            7: { fontStyle: "bold" },
            8: { fontStyle: "bold" },
          },
          margin: { left: 14, right: 14 },
        });
        y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Totale settimana: ${totals.fatti} accessi fatti` +
        (totals.pianificati ? `  ·  ${totals.pianificati} pianificati` : "") +
        (totals.saltati ? `  ·  ${totals.saltati} saltati` : ""),
        14, y + 2
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Legenda: X = fatto   \u00B7 = pianificato   S = saltato", 14, y + 8);
      doc.text(
        "Generato con FisioHub — sezione Domicili Cooperative (dati separati dal gestionale studio)",
        14, doc.internal.pageSize.getHeight() - 10
      );

      const slug = (coop?.nome || "tutte").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      doc.save(`report-domicili-${slug}-${localISO(weekStart)}.pdf`);
    } catch (e: any) {
      alert("Errore generazione PDF: " + (e?.message || e));
    } finally {
      setPdfBusy(false);
    }
  };

  if (!open) return null;

  // ─── UI a schermo ───────────────────────────────────────────────────

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000,
    display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
    padding: isMobile ? 0 : 20,
  };
  const sheet: React.CSSProperties = isMobile
    ? { background: "#fff", color: T.text, width: "100%", maxHeight: "92vh", borderRadius: "18px 18px 0 0", display: "flex", flexDirection: "column", overflow: "hidden" }
    : { background: "#fff", color: T.text, width: 760, maxWidth: "96vw", maxHeight: "90vh", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(15,23,42,.25)" };

  const th: React.CSSProperties = {
    fontSize: 9.5, letterSpacing: .5, textTransform: "uppercase", color: "#64748b",
    fontWeight: 800, borderBottom: `1px solid ${T.border}`, padding: "8px 4px", textAlign: "center",
  };
  const td: React.CSSProperties = {
    borderBottom: "1px solid #eef2f6", padding: "9px 4px", textAlign: "center",
    fontSize: 13, fontWeight: 700, color: T.text,
  };

  const cellSym = (a: CoopAccess | null) => {
    if (!a) return <span style={{ color: "#e2e8f0" }}>·</span>;
    if (a.stato === "fatto") return <span style={{ color: T.green }} title={normTime(a.orario) || ""}>✓</span>;
    if (a.stato === "pianificato") return <span style={{ color: "#64748b" }} title={normTime(a.orario) || ""}>◻</span>;
    return <span style={{ color: T.red }}>✕</span>;
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          {coop?.logo_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={coop.logo_url} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>Report settimanale</div>
            <div style={{ fontSize: 12, color: T.muted }}>
              {coop ? coop.nome : "Tutte le cooperative"} · {fmtWeekRange(weekStart)}
            </div>
          </div>
          <button onClick={onClose} style={{ border: `1px solid ${T.border}`, background: "#fff", color: T.text, borderRadius: 10, padding: "6px 12px", fontWeight: 700, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: isMobile ? "4px 6px" : "6px 12px" }}>
          {groups.length === 0 && (
            <div style={{ padding: "34px 20px", textAlign: "center", color: T.muted, fontSize: 13.5 }}>
              Nessun accesso in questa settimana{coop ? ` per ${coop.nome}` : ""}.
            </div>
          )}
          {groups.map(g => (
            <div key={g.coop.id} style={{ marginBottom: 6 }}>
              {!coop && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 8px 4px" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: g.coop.colore }} />
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{g.coop.nome}</span>
                </div>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left", paddingLeft: 8 }}>Paziente</th>
                    {[1, 2, 3, 4, 5, 6].map(d => <th key={d} style={th}>{isMobile ? DOW_LABELS[d][0] : DOW_LABELS[d]}</th>)}
                    <th style={th}>Sett.</th>
                    <th style={th}>Progr.</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map(r => {
                    const counters = countersByPatient.get(r.patient.id);
                    const tot = r.patient.tot_accessi;
                    return (
                      <tr key={r.patient.id}>
                        <td style={{ ...td, textAlign: "left", paddingLeft: 8, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: isMobile ? 110 : 220 }}>
                          {displayName(`${r.patient.cognome} ${r.patient.nome}`)}
                        </td>
                        {r.cells.map((c, i) => <td key={i} style={td}>{cellSym(c)}</td>)}
                        <td style={{ ...td, color: T.text }}>{r.fattiSett}</td>
                        <td style={{ ...td, color: T.tealDark, whiteSpace: "nowrap" }}>
                          {counters ? (tot ? `${counters.fatti}/${tot}` : counters.fatti) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 18px", fontSize: 12.5, fontWeight: 700 }}>
          Totale settimana: <span style={{ color: T.tealDark }}>{totals.fatti} accessi fatti</span>
          {totals.pianificati > 0 && <span style={{ color: T.muted }}> · {totals.pianificati} pianificati</span>}
          {totals.saltati > 0 && <span style={{ color: T.red }}> · {totals.saltati} saltati</span>}
        </div>

        <div style={{ display: "flex", gap: 10, padding: "10px 18px 14px" }}>
          <button
            onClick={downloadPdf} disabled={pdfBusy || groups.length === 0}
            style={{
              flex: 1, border: "none", background: T.blue, color: "#fff", borderRadius: 10,
              padding: "11px 0", fontSize: 13.5, fontWeight: 800, cursor: "pointer",
              opacity: pdfBusy || groups.length === 0 ? .6 : 1,
            }}>
            {pdfBusy ? "Genero PDF…" : "Scarica PDF"}
          </button>
          <button onClick={onClose} style={{ flex: isMobile ? 1 : .5, border: `1px solid ${T.border}`, background: "#fff", color: T.text, borderRadius: 10, padding: "11px 0", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────

/** Carica un'immagine (path pubblico) e la converte in dataURL PNG per jsPDF. */
async function imgToDataURL(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("logo non raggiungibile");
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("lettura logo fallita"));
    reader.readAsDataURL(blob);
  });
}
