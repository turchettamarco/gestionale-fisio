// app/(protected)/components/dashboard/daySheet.ts
// ═══════════════════════════════════════════════════════════════════════
// 🖨 Foglio di giornata — PDF stampabile: orari, pazienti, trattamenti,
// domicili con indirizzo e righe per gli appunti a penna.
// ═══════════════════════════════════════════════════════════════════════

import type { AppointmentRow } from "./shared/types";

function nameOf(a: AppointmentRow): string {
  const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
  return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Paziente";
}

export async function generateDaySheet(appts: AppointmentRow[], studioName?: string | null) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 16;
  let y = 20;

  const rows = appts
    .filter(a => a.status !== "cancelled")
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  const dateLabel = new Date()
    .toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    .replace(/^\w/, c => c.toUpperCase());

  // Testata
  doc.setFillColor(13, 148, 136);
  doc.rect(0, 0, W, 3, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(15, 23, 42);
  doc.text("Foglio di giornata", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100, 116, 139);
  doc.text(`${dateLabel}${studioName ? ` — ${studioName}` : ""} · ${rows.length} sedute`, M, y + 6);
  y += 16;

  // Intestazione tabella
  doc.setFontSize(9); doc.setTextColor(100, 116, 139);
  doc.text("ORA", M, y);
  doc.text("PAZIENTE", M + 22, y);
  doc.text("TRATTAMENTO", M + 92, y);
  doc.text("NOTE", M + 142, y);
  y += 2;
  doc.setDrawColor(203, 213, 225); doc.line(M, y, W - M, y);
  y += 6;

  doc.setTextColor(15, 23, 42);
  for (const a of rows) {
    if (y > 272) { doc.addPage(); y = 20; }
    const time = new Date(a.start_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(time, M, y);
    doc.text(nameOf(a).slice(0, 34), M + 22, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(71, 85, 105);
    doc.text((a.treatment_type || "—").slice(0, 26), M + 92, y);
    doc.setDrawColor(226, 232, 240);
    doc.line(M + 142, y, W - M, y); // riga per appunti a penna
    if (a.location === "domicile") {
      y += 4.5;
      doc.setFontSize(8); doc.setTextColor(13, 148, 136);
      doc.text(`DOMICILIO${a.domicile_address ? ` — ${a.domicile_address.slice(0, 60)}` : ""}`, M + 22, y);
    }
    doc.setTextColor(15, 23, 42);
    y += 4;
    doc.setDrawColor(241, 245, 249); doc.line(M, y, W - M, y);
    y += 6;
  }

  if (rows.length === 0) {
    doc.setFontSize(11); doc.setTextColor(100, 116, 139);
    doc.text("Nessuna seduta in programma oggi.", M, y);
    y += 10;
  }

  // Blocco note finali
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(100, 116, 139);
  doc.text("APPUNTI", M, y);
  y += 6;
  doc.setDrawColor(226, 232, 240);
  for (let i = 0; i < 4 && y < 285; i++) { doc.line(M, y, W - M, y); y += 8; }

  doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
  doc.text("Generato con FisioHub — myfisiohub.com", M, 292);

  const iso = new Date().toISOString().slice(0, 10);
  doc.save(`giornata-${iso}.pdf`);
}
