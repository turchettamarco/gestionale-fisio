// ════════════════════════════════════════════════════════════════════════
// app/(protected)/ospiti/[id]/utils/exportGuestAgenda.ts
// ════════════════════════════════════════════════════════════════════════
//
// Utility per export dell'agenda di un professionista ospite (mig. 029,
// Step 5f). Espone 3 funzioni che il client component chiama dai bottoni:
//
//   • previewAgendaInBrowser   → apre l'HTML in una nuova finestra (Anteprima)
//   • printAgenda              → apre l'HTML e lancia window.print() (Stampa)
//   • downloadAgendaPDF        → genera direttamente un file .pdf scaricabile
//
// L'HTML usa lo stesso pattern di src/lib/pdfHeader.ts per consistenza
// con le altre stampe del gestionale (intestazione studio con gradient
// teal→blu, dati clinici, firma).
//
// IL PDF generato con jsPDF+autotable è autonomo (non chiede stampa), ha
// header studio renderizzato come testo, e la tabella formattata.
// ════════════════════════════════════════════════════════════════════════

import { studioPdfHeader, studioHeaderCss, type StudioHeaderData } from "@/src/lib/pdfHeader";

// ── Tipi pubblici ────────────────────────────────────────────────────────
export type GuestAgendaData = {
  guest: {
    first_name: string;
    last_name: string;
    specialty: string;
    display_color: string | null;
  };
  /** Etichetta del periodo da mostrare nel titolo, es. "Maggio 2026" o "dal 10/05 al 25/05" */
  periodLabel: string;
  /** Gruppi giorno (già ordinati cronologicamente). Solo i giorni da includere
   *  vanno passati: il chiamante filtra in base a selectedDays. */
  groups: Array<{
    date: Date;
    events: Array<{
      start_at: string;
      end_at: string;
      calendar_note: string | null;
      patient: {
        first_name: string;
        last_name: string;
        phone: string | null;
        diagnosis: string | null;
      } | null;
    }>;
  }>;
  /** Colonne da mostrare (oltre a Data/Ora/Paziente che sono sempre presenti) */
  fields: {
    telefono: boolean;
    durata: boolean;
    diagnosi: boolean;
    note: boolean;
  };
  /** Dati studio per l'header */
  studio: StudioHeaderData;
};

// ── Helpers formato ──────────────────────────────────────────────────────
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function durationMin(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}
function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .replace(/^./, c => c.toUpperCase());
}
function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ════════════════════════════════════════════════════════════════════════
// 1) HTML rendering per Anteprima e Stampa
// ════════════════════════════════════════════════════════════════════════

export function generateAgendaHTML(data: GuestAgendaData): string {
  const { guest, periodLabel, groups, fields, studio } = data;
  const guestColor = guest.display_color || "#DB2777";
  const totalAppts = groups.reduce((acc, g) => acc + g.events.length, 0);

  // Calcola colonne tabella
  const cols: Array<{ key: string; label: string; width?: string }> = [
    { key: "ora",      label: "Ora",      width: "8%" },
    { key: "paziente", label: "Paziente", width: "20%" },
  ];
  if (fields.telefono) cols.push({ key: "telefono", label: "Telefono", width: "13%" });
  if (fields.durata)   cols.push({ key: "durata",   label: "Durata",   width: "8%" });
  if (fields.diagnosi) cols.push({ key: "diagnosi", label: "Diagnosi", width: "25%" });
  if (fields.note)     cols.push({ key: "note",     label: "Note",     width: "auto" });

  // Render righe per ogni giorno
  const groupsHTML = groups.map(g => {
    const rows = g.events.map(ev => {
      const patient = ev.patient ? `${ev.patient.last_name} ${ev.patient.first_name}` : "—";
      const tds = cols.map(c => {
        switch (c.key) {
          case "ora":      return `<td class="ag-ora">${fmtTime(ev.start_at)}</td>`;
          case "paziente": return `<td class="ag-paz">${esc(patient)}</td>`;
          case "telefono": return `<td>${esc(ev.patient?.phone) || "—"}</td>`;
          case "durata":   return `<td class="ag-dur">${durationMin(ev.start_at, ev.end_at)} min</td>`;
          case "diagnosi": return `<td>${esc(ev.patient?.diagnosis) || "—"}</td>`;
          case "note":     return `<td>${esc(ev.calendar_note) || "—"}</td>`;
          default:         return "<td></td>";
        }
      }).join("");
      return `<tr>${tds}</tr>`;
    }).join("");

    return `
      <div class="ag-day">
        <div class="ag-day-head">
          <div class="ag-day-block">
            <div class="ag-day-short">${esc(g.date.toLocaleDateString("it-IT", { weekday: "short" }).replace(/^./, c => c.toUpperCase()).replace(/\.$/, ""))}</div>
            <div class="ag-day-num">${g.date.getDate()}</div>
          </div>
          <div class="ag-day-title">
            <div class="ag-day-fulldate">${esc(fmtDateLong(g.date))}</div>
            <div class="ag-day-count">${g.events.length} appuntament${g.events.length === 1 ? "o" : "i"}</div>
          </div>
        </div>
        <table class="ag-table">
          <thead>
            <tr>
              ${cols.map(c => `<th${c.width ? ` style="width:${c.width}"` : ""}>${c.label}</th>`).join("")}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join("");

  const fullName = `${guest.first_name} ${guest.last_name}`;
  const docTitle = `Agenda professionale — ${esc(fullName)}`;
  const docSubtitle = `${esc(guest.specialty)} · ${esc(periodLabel)}`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Agenda ${esc(fullName)} — ${esc(periodLabel)}</title>
  <style>
    ${studioHeaderCss}

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0; padding: 24px;
      color: #0f172a; background: #ffffff;
    }
    .ag-summary {
      display: flex; gap: 24px; margin: 16px 0 24px;
      padding: 14px 18px;
      background: #f8fafc; border: 1px solid #e2e8f0;
      border-left: 4px solid ${guestColor};
      border-radius: 8px;
    }
    .ag-kpi { display: flex; flex-direction: column; gap: 2px; }
    .ag-kpi-lbl {
      font-size: 10px; font-weight: 700;
      color: #64748b; text-transform: uppercase; letter-spacing: 0.6px;
    }
    .ag-kpi-val { font-size: 18px; font-weight: 800; color: #0f172a; }
    .ag-kpi-val.col { color: ${guestColor}; }

    .ag-day {
      margin-bottom: 18px;
      border: 1px solid #cbd5e1;
      border-left: 4px solid ${guestColor};
      border-radius: 8px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .ag-day-head {
      display: flex; align-items: center; gap: 14px;
      padding: 12px 16px;
      background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    }
    .ag-day-block {
      background: #fff; border: 1px solid #cbd5e1;
      border-radius: 6px; padding: 4px 10px;
      text-align: center; min-width: 50px;
    }
    .ag-day-short {
      font-size: 9px; color: ${guestColor}; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.5px; line-height: 1;
    }
    .ag-day-num {
      font-size: 16px; font-weight: 800; color: #0f172a;
      line-height: 1.1; margin-top: 2px;
    }
    .ag-day-fulldate { font-size: 13px; font-weight: 800; color: #0f172a; }
    .ag-day-count {
      font-size: 10px; color: #64748b; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px;
    }

    .ag-table {
      width: 100%; border-collapse: collapse;
      font-size: 11px;
    }
    .ag-table thead tr {
      background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    }
    .ag-table th {
      text-align: left; padding: 8px 12px;
      font-size: 9px; font-weight: 800;
      color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .ag-table tbody tr {
      border-bottom: 1px solid #f1f5f9;
    }
    .ag-table tbody tr:last-child { border-bottom: none; }
    .ag-table td {
      padding: 10px 12px; vertical-align: top;
      color: #475569; font-weight: 500;
    }
    .ag-table td.ag-ora {
      color: ${guestColor}; font-weight: 800; white-space: nowrap; font-size: 12px;
    }
    .ag-table td.ag-paz {
      color: #0f172a; font-weight: 700;
    }
    .ag-table td.ag-dur { white-space: nowrap; }

    .ag-empty {
      padding: 40px 20px; text-align: center;
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
      color: #64748b;
    }

    .ag-footer {
      margin-top: 32px; padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 10px; color: #94a3b8; text-align: center;
    }

    @media print {
      body { padding: 12mm; }
      .ag-day { box-shadow: none; }
      @page { size: A4; margin: 0; }
    }
  </style>
</head>
<body>
  ${studioPdfHeader(studio, { docTitle, docSubtitle })}

  <div class="ag-summary">
    <div class="ag-kpi">
      <div class="ag-kpi-lbl">Periodo</div>
      <div class="ag-kpi-val">${esc(periodLabel)}</div>
    </div>
    <div class="ag-kpi">
      <div class="ag-kpi-lbl">Appuntamenti</div>
      <div class="ag-kpi-val col">${totalAppts}</div>
    </div>
    <div class="ag-kpi">
      <div class="ag-kpi-lbl">Giorni</div>
      <div class="ag-kpi-val col">${groups.length}</div>
    </div>
  </div>

  ${groups.length === 0
    ? `<div class="ag-empty">Nessun appuntamento per il periodo selezionato.</div>`
    : groupsHTML}

  <div class="ag-footer">
    Stampato da FisioHub · ${esc(new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }))}
  </div>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════════════
// 2) Apre HTML in nuova finestra per anteprima
// ════════════════════════════════════════════════════════════════════════

export function previewAgendaInBrowser(data: GuestAgendaData): void {
  const html = generateAgendaHTML(data);
  const w = window.open("", "_blank");
  if (!w) {
    alert("Il browser ha bloccato l'apertura della finestra. Disabilita il blocco popup per questo sito.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

// ════════════════════════════════════════════════════════════════════════
// 3) Stampa direttamente (apre + window.print)
// ════════════════════════════════════════════════════════════════════════

export function printAgenda(data: GuestAgendaData): void {
  const html = generateAgendaHTML(data);
  const w = window.open("", "_blank");
  if (!w) {
    alert("Il browser ha bloccato l'apertura della finestra. Disabilita il blocco popup per questo sito.");
    return;
  }
  w.document.write(html);
  w.document.close();
  // Aspetta che il rendering sia completo prima di stampare
  w.onload = () => {
    setTimeout(() => {
      w.focus();
      w.print();
    }, 250);
  };
}

// ════════════════════════════════════════════════════════════════════════
// 4) Download diretto PDF (jsPDF + autotable)
// ════════════════════════════════════════════════════════════════════════

export async function downloadAgendaPDF(data: GuestAgendaData): Promise<void> {
  // Import dinamico per evitare di gonfiare il bundle iniziale.
  // jspdf-autotable v5+ esporta `autoTable` come named export.
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const { guest, periodLabel, groups, fields, studio } = data;
  const guestColor = guest.display_color || "#DB2777";

  // Converti colore hex in [r, g, b]
  const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const colorRGB = hexToRgb(guestColor);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let cursorY = 16;

  // ── HEADER STUDIO ──────────────────────────────────────────────────────
  // Banda gradient teal→blu (in jsPDF: rettangolo pieno teal con sfumatura
  // di tonalità non è banale, usiamo un singolo colore teal-blu medio).
  doc.setFillColor(13, 148, 136); // teal
  doc.rect(0, 0, pageWidth, 8, "F");
  doc.setFillColor(37, 99, 235); // blu
  doc.rect(pageWidth / 2, 0, pageWidth / 2, 8, "F");

  // Nome studio (se disponibile)
  const studioName = studio?.name || "Studio";
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(studioName, marginX, cursorY);

  // Indirizzo, tel, email (in piccolo)
  cursorY += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  const studioInfo: string[] = [];
  if (studio?.address) studioInfo.push(studio.address);
  if (studio?.phone) studioInfo.push(`Tel: ${studio.phone}`);
  if (studio?.email) studioInfo.push(studio.email);
  if (studioInfo.length > 0) {
    doc.text(studioInfo.join("  ·  "), marginX, cursorY);
    cursorY += 5;
  }

  // Separatore
  cursorY += 2;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  cursorY += 7;

  // ── TITOLO DOCUMENTO ────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`Agenda — ${guest.first_name} ${guest.last_name}`, marginX, cursorY);

  cursorY += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(colorRGB[0], colorRGB[1], colorRGB[2]);
  doc.text(`${guest.specialty}  ·  ${periodLabel}`, marginX, cursorY);

  // ── SOMMARIO ──────────────────────────────────────────────────────────
  cursorY += 9;
  const totalAppts = groups.reduce((acc, g) => acc + g.events.length, 0);

  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, cursorY - 5, pageWidth - 2 * marginX, 14, "F");
  doc.setDrawColor(colorRGB[0], colorRGB[1], colorRGB[2]);
  doc.setLineWidth(1);
  doc.line(marginX, cursorY - 5, marginX, cursorY + 9);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 116, 139);
  doc.text("PERIODO", marginX + 5, cursorY - 1);
  doc.text("APPUNTAMENTI", marginX + 55, cursorY - 1);
  doc.text("GIORNI", marginX + 110, cursorY - 1);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(periodLabel, marginX + 5, cursorY + 5);
  doc.setTextColor(colorRGB[0], colorRGB[1], colorRGB[2]);
  doc.text(String(totalAppts), marginX + 55, cursorY + 5);
  doc.text(String(groups.length), marginX + 110, cursorY + 5);

  cursorY += 16;

  // ── EMPTY STATE ────────────────────────────────────────────────────────
  if (groups.length === 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Nessun appuntamento per il periodo selezionato.", pageWidth / 2, cursorY + 10, { align: "center" });
  }

  // ── TABELLE PER OGNI GIORNO ─────────────────────────────────────────────
  // Calcola colonne
  const headers: string[] = ["Ora", "Paziente"];
  if (fields.telefono) headers.push("Telefono");
  if (fields.durata) headers.push("Durata");
  if (fields.diagnosi) headers.push("Diagnosi");
  if (fields.note) headers.push("Note");

  for (const g of groups) {
    // Header data
    if (cursorY > 260) {
      doc.addPage();
      cursorY = 16;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(fmtDateLong(g.date), marginX, cursorY);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`${g.events.length} appuntament${g.events.length === 1 ? "o" : "i"}`, pageWidth - marginX, cursorY, { align: "right" });
    cursorY += 3;

    // Costruisci righe
    const rows = g.events.map(ev => {
      const r: string[] = [
        fmtTime(ev.start_at),
        ev.patient ? `${ev.patient.last_name} ${ev.patient.first_name}` : "—",
      ];
      if (fields.telefono) r.push(ev.patient?.phone || "—");
      if (fields.durata)   r.push(`${durationMin(ev.start_at, ev.end_at)} min`);
      if (fields.diagnosi) r.push(ev.patient?.diagnosis || "—");
      if (fields.note)     r.push(ev.calendar_note || "—");
      return r;
    });

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        lineColor: [241, 245, 249],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [100, 116, 139],
        fontStyle: "bold",
        fontSize: 8,
      },
      columnStyles: {
        0: { fontStyle: "bold", textColor: colorRGB, halign: "left", cellWidth: 16 },
        1: { fontStyle: "bold", textColor: [15, 23, 42] },
      },
      didDrawPage: () => {
        // Footer paginazione
        const pageStr = `Pag. ${doc.getCurrentPageInfo().pageNumber}`;
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(pageStr, pageWidth - marginX, 290, { align: "right" });
      },
    });

    // @ts-expect-error - autotable estende doc con lastAutoTable
    cursorY = doc.lastAutoTable.finalY + 10;
  }

  // ── FOOTER FINALE ──────────────────────────────────────────────────────
  // (la paginazione è già stata aggiunta in didDrawPage)
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generato da FisioHub · ${new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    marginX,
    290
  );

  // Download
  const filename = `agenda_${guest.last_name.toLowerCase()}_${periodLabel.toLowerCase().replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}
