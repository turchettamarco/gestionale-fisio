// Genera un HTML stampabile del planning settimanale e apre una nuova finestra
// per stampa/salvataggio PDF del calendario della settimana corrente.

import type { CalendarEvent } from "./types";
import { startOfISOWeekMonday } from "./dateHelpers";
import { studioPdfHeader, studioHeaderCss, type StudioHeaderData } from "@/src/lib/pdfHeader";

export function exportWeekToPDF(events: CalendarEvent[], currentDate: Date, studio?: StudioHeaderData): void {
  const weekStart = startOfISOWeekMonday(currentDate);
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });
  const GG = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

  const statusColors: Record<string, string> = {
    done: "#16a34a", confirmed: "#2563eb", not_paid: "#f97316",
    cancelled: "#94a3b8", booked: "#dc2626",
  };
  const statusLabels: Record<string, string> = {
    done: "Eseguito", confirmed: "Confermato", not_paid: "Non pagata",
    cancelled: "Annullato", booked: "Prenotato",
  };

  const totalSedute = events.filter(e => e.status !== "cancelled" &&
    days.some(d => e.start.toDateString() === d.toDateString())).length;
  const totalIncasso = events.filter(e => e.is_paid &&
    days.some(d => e.start.toDateString() === d.toDateString()))
    .reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalDaIncassare = events.filter(e => !e.is_paid && e.status !== "cancelled" &&
    days.some(d => e.start.toDateString() === d.toDateString()))
    .reduce((s, e) => s + (e.amount ?? 0), 0);

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Planning Settimanale — FisioHub</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; }
  @page { size: A4 landscape; margin: 12mm 10mm; }
  @media print { body { background: white; } .no-print { display: none; } }
  .header { background: linear-gradient(135deg, #0d9488, #2563eb); color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-radius: 12px; margin-bottom: 12px; }
  .header-logo { display: flex; align-items: center; gap: 10px; }
  .logo-box { width: 36px; height: 36px; background: rgba(255,255,255,0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; border: 1.5px solid rgba(255,255,255,0.3); }
  .logo-text { font-size: 20px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
  .header-title { text-align: center; }
  .header-title h1 { font-size: 16px; font-weight: 700; opacity: 0.9; }
  .header-title p { font-size: 13px; opacity: 0.75; margin-top: 2px; }
  .header-kpi { display: flex; gap: 16px; }
  .kpi { text-align: right; }
  .kpi-label { font-size: 10px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px; }
  .kpi-value { font-size: 18px; font-weight: 800; }
  .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
  .day-col { background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; }
  .day-header { padding: 8px 10px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; }
  .day-name { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
  .day-date { font-size: 18px; font-weight: 800; color: #0f172a; line-height: 1.1; }
  .day-date.today { color: #2563eb; }
  .day-count { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  .day-body { padding: 6px; display: flex; flex-direction: column; gap: 4px; min-height: 80px; }
  .appt { border-radius: 6px; padding: 6px 8px; border: 0.5px solid; page-break-inside: avoid; }
  .appt-time { font-size: 10px; font-weight: 600; margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center; }
  .appt-name { font-size: 11px; font-weight: 700; color: #0f172a; line-height: 1.25; word-break: break-word; }
  .appt-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
  .appt-type { font-size: 9px; color: #64748b; }
  .appt-badge { font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 99px; }
  .appt-icons { display: flex; gap: 3px; align-items: center; font-size: 11px; }
  .empty-day { color: #cbd5e1; font-size: 11px; text-align: center; padding: 12px 0; }
  .footer { margin-top: 10px; display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: white; border-radius: 8px; border: 1px solid #e2e8f0; }
  .footer-left { font-size: 10px; color: #64748b; }
  .legend { display: flex; gap: 12px; align-items: center; }
  .legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #475569; }
  .legend-dot { width: 8px; height: 8px; border-radius: 99px; }
  .print-btn { display: block; margin: 12px auto; padding: 10px 28px; background: linear-gradient(135deg,#0d9488,#2563eb); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
</style>
</head>
<body>
<div class="no-print" style="text-align:center; padding: 12px;">
  <button class="print-btn" onclick="window.print()">🖨 Stampa / Salva PDF</button>
</div>
<div class="header">
  <div class="header-logo">
    ${studio?.logo_base64
      ? `<img src="${studio.logo_base64}" alt="Logo" style="width:44px;height:44px;object-fit:contain;background:rgba(255,255,255,0.95);border-radius:8px;padding:4px;border:1.5px solid rgba(255,255,255,0.3);" />`
      : `<div class="logo-box">${(studio?.name || "S").charAt(0).toUpperCase()}</div>`}
    <div class="logo-text">${studio?.name || "Studio"}</div>
  </div>
  <div class="header-title">
    <h1>Planning Settimanale</h1>
    <p>${GG[0]} ${days[0].getDate()} — ${GG[5]} ${days[5].getDate()} ${MESI[days[0].getMonth()]} ${days[0].getFullYear()}</p>
  </div>
  <div class="header-kpi">
    <div class="kpi">
      <div class="kpi-label">Sedute</div>
      <div class="kpi-value">${totalSedute}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Incassato</div>
      <div class="kpi-value">€${totalIncasso}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Da incassare</div>
      <div class="kpi-value" style="color:#fbbf24">€${totalDaIncassare}</div>
    </div>
  </div>
</div>

<div class="grid">
${days.map((day, di) => {
  const isToday = day.toDateString() === new Date().toDateString();
  const dayEvs = events
    .filter(e => e.start.toDateString() === day.toDateString() && e.status !== "cancelled")
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return `
  <div class="day-col">
    <div class="day-header">
      <div class="day-name">${GG[di]}</div>
      <div class="day-date ${isToday ? "today" : ""}">${day.getDate()}</div>
      <div class="day-count">${dayEvs.length > 0 ? `${dayEvs.length} appuntament${dayEvs.length === 1 ? "o" : "i"}` : "Giorno libero"}</div>
    </div>
    <div class="day-body">
      ${dayEvs.length === 0 ? `<div class="empty-day">—</div>` : dayEvs.map(ev => {
        const col = statusColors[ev.status] ?? "#94a3b8";
        const bg = col + "14";
        const bc = col + "40";
        const label = statusLabels[ev.status] ?? "—";
        const fmtT = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        return `
        <div class="appt" style="background:${bg}; border-color:${bc}">
          <div class="appt-time" style="color:${col}">
            <span>${fmtT(ev.start)}–${fmtT(ev.end)}</span>
            <span class="appt-icons">${ev.location === "domicile" ? "🏠" : ""}${ev.is_paid ? "🪙" : ""}</span>
          </div>
          <div class="appt-name">${ev.patient_name}${ev.status === "cancelled" ? " (annullato)" : ""}</div>
          <div class="appt-footer">
            <span class="appt-type">${ev.treatment_type === "macchinario" ? "Macchinario" : "Seduta"}${ev.amount ? ` · €${ev.amount}` : ""}</span>
            <span class="appt-badge" style="color:${col}; background:${col}18">${label}</span>
          </div>
          ${ev.calendar_note ? `<div style="font-size:9px; color:#64748b; margin-top:3px; font-style:italic">📝 ${ev.calendar_note}</div>` : ""}
        </div>`;
      }).join("")}
    </div>
  </div>`;
}).join("")}
</div>

<div class="footer">
  <div class="footer-left">
    Generato da FisioHub · ${new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} alle ${new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
  </div>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#2563eb"></div>Confermato</div>
    <div class="legend-item"><div class="legend-dot" style="background:#16a34a"></div>Eseguito</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f97316"></div>Non pagata</div>
    <div class="legend-item"><div class="legend-dot" style="background:#dc2626"></div>Prenotato</div>
    <div class="legend-item">🪙 Pagato</div>
    <div class="legend-item">🏠 Domicilio</div>
  </div>
</div>

</body>
</html>`;

  const win = window.open("", "_blank", "width=1200,height=800");
  if (win) { win.document.write(html); win.document.close(); }
}
