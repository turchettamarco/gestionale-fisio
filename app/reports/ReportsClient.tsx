"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import Link from "next/link";

const COLORS = {
  primary: "#1e3a8a",
  secondary: "#2563eb",
  accent: "#0d9488",
  success: "#16a34a",
  warning: "#f97316",
  danger: "#dc2626",
  muted: "#64748b",
  background: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  
  // Aggiunti per il menu laterale
  appBg: "#f1f5f9",
  panelBg: "#ffffff",
  panelSoft: "#f7f9fd",
  blueDark: "#1e40af",
  patientsAccent: "#0d9488",
  orange: "#f97316", // Aggiunto per il riquadro DETTAGLIO FONTI
};

type Period = "day" | "week" | "month";

// --- Helper Date ---
function toISODate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Lunedì = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  const x = new Date(s);
  x.setDate(s.getDate() + 6);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

const currency = new Intl.NumberFormat("it-IT", { 
  style: "currency", 
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function makeLabels(period: Period, base: Date) {
  if (period === "day") {
    return Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  }
  if (period === "week") {
    return ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
  }
  const days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return Array.from({ length: days }, (_, i) => String(i + 1));
}

function getRange(period: Period, base: Date) {
  if (period === "day") return { from: startOfDay(base), to: endOfDay(base) };
  if (period === "week") return { from: startOfWeek(base), to: endOfWeek(base) };
  return { from: startOfMonth(base), to: endOfMonth(base) };
}

type FinancialItem = { 
  amount: number; 
  date: string; 
  source: 'invoice' | 'appointment';
  description?: string;
  patient_name?: string;
  patient_id?: string;
  status?: string;
};

type UnpaidTherapy = {
  id: string;
  patient_id: string;
  patient_name: string;
  amount: number;
  date: string;
  treatment_type: string;
  days_since: number;
  status: string;
};

type Statistic = {
  total: number;
  invoiceCount: number;
  appointmentCount: number;
  averageAmount: number;
  maxAmount: number;
  minAmount: number;
  unpaidTotal: number;
  unpaidCount: number;
  unpaidAppointmentCount: number;
  unpaidInvoiceCount: number;
};

export default function ReportsPage() {
  const params = useSearchParams();
  const initialPeriod = (params.get("period") as Period) || "month";
  const initialDate = params.get("date") || toISODate(new Date());

  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [dateStr, setDateStr] = useState<string>(initialDate);
  const [loading, setLoading] = useState<boolean>(true);
  const [statistics, setStatistics] = useState<Statistic>({
    total: 0,
    invoiceCount: 0,
    appointmentCount: 0,
    averageAmount: 0,
    maxAmount: 0,
    minAmount: 0,
    unpaidTotal: 0,
    unpaidCount: 0,
    unpaidAppointmentCount: 0,
    unpaidInvoiceCount: 0
  });
  const [series, setSeries] = useState<number[]>([]);
  const [unpaidSeries, setUnpaidSeries] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<FinancialItem[]>([]);
  const [unpaidTherapies, setUnpaidTherapies] = useState<UnpaidTherapy[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [dayDetails, setDayDetails] = useState<FinancialItem[]>([]);
  const [showUnpaidDropdown, setShowUnpaidDropdown] = useState<boolean>(false);

  const baseDate = useMemo(() => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [dateStr]);

  const labels = useMemo(() => makeLabels(period, baseDate), [period, baseDate]);

  async function loadData() {
    setLoading(true);
    setError(null);
    setSelectedDay(null);
    setDayDetails([]);
    
    try {
      const { from, to } = getRange(period, baseDate);
      const fromStr = from.toISOString();
      const toStr = to.toISOString();

      // 1. Fetch FATTURE (Invoices) PAGATE
      let invoicesData: any[] = [];
      let unpaidInvoicesData: any[] = [];
      let appointmentsData: any[] = [];
      let unpaidAppointmentsData: any[] = [];

      // Fatture pagate
      const { data: paidInvoices, error: paidInvoicesError } = await supabase
        .from("invoices")
        .select("id, amount, paid_at, status, patient_id")
        .eq("status", "paid")
        .gte("paid_at", fromStr)
        .lte("paid_at", toStr)
        .order("paid_at", { ascending: true });

      if (paidInvoicesError) {
        console.error("Errore nel caricamento fatture pagate:", paidInvoicesError);
      } else {
        invoicesData = paidInvoices || [];
      }

      // Carica i dati dei pazienti per le fatture pagate
      const paidInvoiceIds = invoicesData.map(i => i.patient_id).filter(Boolean);
      let paidInvoicePatients: any[] = [];
      
      if (paidInvoiceIds.length > 0) {
        const { data: patientsData } = await supabase
          .from("patients")
          .select("id, first_name, last_name")
          .in("id", paidInvoiceIds);
        
        paidInvoicePatients = patientsData || [];
      }

      // Collega i dati dei pazienti
      invoicesData = invoicesData.map(invoice => ({
        ...invoice,
        patients: paidInvoicePatients.find(p => p.id === invoice.patient_id) || null
      }));

      // 2. Fetch FATTURE NON PAGATE (TUTTE, senza filtro temporale)
      const { data: unpaidInvoices, error: unpaidInvoicesError } = await supabase
        .from("invoices")
        .select("id, amount, paid_at, created_at, status, patient_id")
        .eq("status", "not_paid")
        .order("created_at", { ascending: true });

      if (unpaidInvoicesError) {
        console.error("Errore nel caricamento fatture non pagate:", unpaidInvoicesError);
      } else {
        unpaidInvoicesData = unpaidInvoices || [];
      }

      // Carica i dati dei pazienti per le fatture non pagate
      const unpaidInvoiceIds = unpaidInvoicesData.map(i => i.patient_id).filter(Boolean);
      let unpaidInvoicePatients: any[] = [];
      
      if (unpaidInvoiceIds.length > 0) {
        const { data: patientsData } = await supabase
          .from("patients")
          .select("id, first_name, last_name")
          .in("id", unpaidInvoiceIds);
        
        unpaidInvoicePatients = patientsData || [];
      }

      // Collega i dati dei pazienti
      unpaidInvoicesData = unpaidInvoicesData.map(invoice => ({
        ...invoice,
        patients: unpaidInvoicePatients.find(p => p.id === invoice.patient_id) || null
      }));

      // 3. Fetch APPUNTAMENTI (Appointments) PAGATI
      const { data: paidAppointments, error: paidAppointmentsError } = await supabase
        .from("appointments")
        .select("id, amount, start_at, status, treatment_type, price_type, patient_id")
        .eq("status", "done")
        .gte("amount", 0.01)
        .gte("start_at", fromStr)
        .lte("start_at", toStr)
        .order("start_at", { ascending: true });

      if (paidAppointmentsError) {
        console.error("Errore nel caricamento appuntamenti pagati:", paidAppointmentsError);
      } else {
        appointmentsData = paidAppointments || [];
      }

      // Carica i dati dei pazienti per gli appuntamenti pagati
      const paidAppointmentIds = appointmentsData.map(a => a.patient_id).filter(Boolean);
      let paidAppointmentPatients: any[] = [];
      
      if (paidAppointmentIds.length > 0) {
        const { data: patientsData } = await supabase
          .from("patients")
          .select("id, first_name, last_name")
          .in("id", paidAppointmentIds);
        
        paidAppointmentPatients = patientsData || [];
      }

      // Collega i dati dei pazienti
      appointmentsData = appointmentsData.map(appointment => ({
        ...appointment,
        patients: paidAppointmentPatients.find(p => p.id === appointment.patient_id) || null
      }));

      // 4. Fetch APPUNTAMENTI NON PAGATI (TUTTI, senza filtro temporale)
      const { data: unpaidAppointments, error: unpaidAppointmentsError } = await supabase
        .from("appointments")
        .select("id, amount, start_at, status, treatment_type, price_type, patient_id")
        .eq("status", "not_paid")
        .order("start_at", { ascending: true });

      if (unpaidAppointmentsError) {
        console.error("Errore nel caricamento appuntamenti non pagati:", unpaidAppointmentsError);
      } else {
        unpaidAppointmentsData = unpaidAppointments || [];
      }

      // Carica i dati dei pazienti per gli appuntamenti non pagati
      const unpaidAppointmentIds = unpaidAppointmentsData.map(a => a.patient_id).filter(Boolean);
      let unpaidAppointmentPatients: any[] = [];
      
      if (unpaidAppointmentIds.length > 0) {
        const { data: patientsData } = await supabase
          .from("patients")
          .select("id, first_name, last_name")
          .in("id", unpaidAppointmentIds);
        
        unpaidAppointmentPatients = patientsData || [];
      }

      // Collega i dati dei pazienti
      unpaidAppointmentsData = unpaidAppointmentsData.map(appointment => ({
        ...appointment,
        patients: unpaidAppointmentPatients.find(p => p.id === appointment.patient_id) || null
      }));

      // Processa FATTURE PAGATE
      const invoices: FinancialItem[] = invoicesData.map((i: any) => {
        const amount = parseFloat(String(i.amount)) || 0;
        
        const patientName = i.patients 
          ? `${i.patients.last_name || ''} ${i.patients.first_name || ''}`.trim()
          : undefined;

        return {
          amount,
          date: i.paid_at,
          source: 'invoice' as const,
          description: `Fattura #${i.id}`,
          patient_name: patientName,
          patient_id: i.patient_id,
          status: 'paid'
        };
      }).filter(item => item.amount > 0);

      // Processa APPUNTAMENTI PAGATI
      const appointments: FinancialItem[] = appointmentsData.map((a: any) => {
        const amount = parseFloat(String(a.amount)) || 0;
        const patientName = a.patients 
          ? `${a.patients.last_name || ''} ${a.patients.first_name || ''}`.trim()
          : undefined;
        return {
          amount,
          date: a.start_at,
          source: 'appointment' as const,
          description: `Appuntamento - ${a.treatment_type || 'Seduta'}`,
          patient_name: patientName,
          patient_id: a.patient_id,
          status: 'paid'
        };
      }).filter(item => item.amount > 0);

      // Uniamo tutto PAGATO
      const allData: FinancialItem[] = [...invoices, ...appointments];
      setRawData(allData);

      // Processa e crea lista terapie NON PAGATE
      const today = new Date();
      const unpaidTherapiesList: UnpaidTherapy[] = [];

      // Aggiungi fatture non pagate
      unpaidInvoicesData.forEach((inv: any) => {
        const amount = parseFloat(String(inv.amount)) || 0;
        if (amount > 0) {
          const patientName = inv.patients 
            ? `${inv.patients.last_name || ''} ${inv.patients.first_name || ''}`.trim()
            : 'Sconosciuto';
          
          const invoiceDate = new Date(inv.paid_at || inv.created_at);
          const daysSince = Math.floor((today.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
          
          unpaidTherapiesList.push({
            id: inv.id,
            patient_id: inv.patient_id,
            patient_name: patientName,
            amount,
            date: inv.paid_at || inv.created_at,
            treatment_type: 'Fattura',
            days_since: daysSince,
            status: 'not_paid'
          });
        }
      });

      // Aggiungi appuntamenti non pagati
      unpaidAppointmentsData.forEach((app: any) => {
        const amount = parseFloat(String(app.amount)) || 0;
        
        if (amount > 0) {
          const patientName = app.patients 
            ? `${app.patients.last_name || ''} ${app.patients.first_name || ''}`.trim()
            : 'Sconosciuto';
          
          const appDate = new Date(app.start_at);
          const daysSince = Math.floor((today.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24));
          
          unpaidTherapiesList.push({
            id: app.id,
            patient_id: app.patient_id,
            patient_name: patientName,
            amount,
            date: app.start_at,
            treatment_type: app.treatment_type || 'Seduta',
            days_since: daysSince,
            status: app.status
          });
        }
      });

      // Ordina per data (più vecchie prima)
      unpaidTherapiesList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setUnpaidTherapies(unpaidTherapiesList);

      // Calcolo statistiche PAGATE
      const amounts = allData.map(item => item.amount).filter(amount => amount > 0);
      const total = amounts.reduce((sum, amount) => sum + amount, 0);
      const invoiceCount = invoices.length;
      const appointmentCount = appointments.length;
      const averageAmount = amounts.length > 0 ? total / amounts.length : 0;
      const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
      const minAmount = amounts.length > 0 ? Math.min(...amounts) : 0;

      // Calcolo statistiche NON PAGATE
      const unpaidTotal = unpaidTherapiesList.reduce((sum, item) => sum + item.amount, 0);
      const unpaidCount = unpaidTherapiesList.length;
      const unpaidInvoiceCount = unpaidInvoicesData.length;
      const unpaidAppointmentCount = unpaidAppointmentsData.length;

      setStatistics({
        total,
        invoiceCount,
        appointmentCount,
        averageAmount,
        maxAmount,
        minAmount,
        unpaidTotal,
        unpaidCount,
        unpaidAppointmentCount,
        unpaidInvoiceCount
      });

      // Calcolo Grafico PAGATI
      const paidBuckets = new Array(labels.length).fill(0);
      const unpaidBuckets = new Array(labels.length).fill(0);

      // Calcola buckets PAGATI
      for (const item of allData) {
        if (!item.date) continue;
        
        const dt = new Date(item.date);
        const bucketIndex = getBucketIndex(dt, period);
        
        if (bucketIndex >= 0 && bucketIndex < labels.length) {
          paidBuckets[bucketIndex] += item.amount;
        }
      }

      // Calcola buckets NON PAGATI
      for (const item of unpaidTherapiesList) {
        const dt = new Date(item.date);
        const bucketIndex = getBucketIndex(dt, period);
        
        if (bucketIndex >= 0 && bucketIndex < labels.length) {
          unpaidBuckets[bucketIndex] += item.amount;
        }
      }

      setSeries(paidBuckets);
      setUnpaidSeries(unpaidBuckets);

    } catch (e: any) {
      console.error("Errore nel caricamento dati:", e);
      setError(e.message || "Errore nel caricamento dei dati.");
    } finally {
      setLoading(false);
    }
  }

  // Funzione helper per ottenere l'indice del bucket
  function getBucketIndex(dt: Date, period: Period): number {
    if (period === "day") {
      return dt.getHours();
    } else if (period === "week") {
      const idx = dt.getDay();
      const adjustedIdx = (idx + 6) % 7;
      return adjustedIdx;
    } else {
      return dt.getDate() - 1;
    }
  }

  // Funzione per ottenere i dettagli di un giorno specifico
  function getDayDetails(dayIndex: number) {
    const dayItems: FinancialItem[] = [];
    
    // Aggiungi elementi pagati per questo giorno
    rawData.forEach(item => {
      if (!item.date) return;
      
      const dt = new Date(item.date);
      const bucketIndex = getBucketIndex(dt, period);
      
      if (bucketIndex === dayIndex) {
        dayItems.push({ ...item, status: 'paid' });
      }
    });
    
    // Aggiungi elementi non pagati per questo giorno
    unpaidTherapies.forEach(item => {
      const dt = new Date(item.date);
      const bucketIndex = getBucketIndex(dt, period);
      
      if (bucketIndex === dayIndex) {
        dayItems.push({
          amount: item.amount,
          date: item.date,
          source: 'appointment',
          description: `${item.treatment_type} (Non pagato)`,
          patient_name: item.patient_name,
          patient_id: item.patient_id,
          status: 'not_paid'
        });
      }
    });
    
    return dayItems;
  }

  // Funzione per gestire il click su una barra del grafico
  function handleBarClick(dayIndex: number) {
    setSelectedDay(dayIndex);
    const details = getDayDetails(dayIndex);
    setDayDetails(details);
  }

  // Funzione per stampare report COMPLETO delle terapie non pagate
  function printUnpaidReport() {
    printReport(unpaidTherapies, "Report Terapie Non Pagate");
  }

  // Funzione per stampare report di UN SOLO PAZIENTE
  function printPatientReport(patientName: string) {
    const patientTherapies = unpaidTherapies.filter(t => t.patient_name === patientName);
    printReport(patientTherapies, `Report Terapie Non Pagate - ${patientName}`);
  }

  // Funzione generica per stampare report
  function printReport(therapies: UnpaidTherapy[], title: string) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const today = new Date();
    const formattedDate = today.toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="it">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title} - ${formattedDate}</title>
          <style>
              @media print {
                  @page { margin: 1cm; }
                  body {
                      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                      color: #000;
                      background: #fff;
                      font-size: 12pt;
                      line-height: 1.4;
                  }
                  .header {
                      text-align: center;
                      margin-bottom: 2cm;
                      border-bottom: 2px solid #000;
                      padding-bottom: 0.5cm;
                  }
                  .header h1 {
                      font-size: 18pt;
                      margin: 0;
                      font-weight: bold;
                  }
                  .header .date {
                      font-size: 11pt;
                      margin-top: 0.2cm;
                      color: #555;
                  }
                  table {
                      width: 100%;
                      border-collapse: collapse;
                      margin-top: 1cm;
                      page-break-inside: avoid;
                  }
                  th {
                      background-color: #f0f0f0;
                      border: 1px solid #000;
                      padding: 8pt;
                      text-align: left;
                      font-weight: bold;
                      font-size: 10pt;
                  }
                  td {
                      border: 1px solid #000;
                      padding: 6pt;
                      font-size: 10pt;
                      vertical-align: top;
                  }
                  .total-row {
                      background-color: #f0f0f0;
                      font-weight: bold;
                  }
                  .patient-total {
                      background-color: #e8e8e8;
                      font-weight: bold;
                  }
                  .footer {
                      margin-top: 2cm;
                      padding-top: 0.5cm;
                      border-top: 1px solid #000;
                      font-size: 9pt;
                      color: #555;
                  }
                  .no-print { display: none; }
              }
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  color: #000;
                  background: #fff;
                  padding: 2cm;
              }
              .header {
                  text-align: center;
                  margin-bottom: 2cm;
                  border-bottom: 2px solid #000;
                  padding-bottom: 0.5cm;
              }
              .header h1 {
                  font-size: 18pt;
                  margin: 0;
                  font-weight: bold;
              }
              .header .date {
                  font-size: 11pt;
                  margin-top: 0.2cm;
                  color: #555;
              }
              table {
                  width: 100%;
                  border-collapse: collapse;
                  margin-top: 1cm;
              }
              th {
                  background-color: #f0f0f0;
                  border: 1px solid #000;
                  padding: 8pt;
                  text-align: left;
                  font-weight: bold;
                  font-size: 10pt;
              }
              td {
                  border: 1px solid #000;
                  padding: 6pt;
                  font-size: 10pt;
                  vertical-align: top;
              }
              .total-row {
                  background-color: #f0f0f0;
                  font-weight: bold;
              }
              .patient-total {
                  background-color: #e8e8e8;
                  font-weight: bold;
              }
              .footer {
                  margin-top: 2cm;
                  padding-top: 0.5cm;
                  border-top: 1px solid #000;
                  font-size: 9pt;
                  color: #555;
              }
              button {
                  padding: 10px 20px;
                  background: #2563eb;
                  color: white;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  font-weight: bold;
                  margin-bottom: 1cm;
              }
              button:hover { background: #1d4ed8; }
          </style>
      </head>
      <body>
          <button onclick="window.print()" class="no-print">🖨️ Stampa Report</button>
          
          <div class="header">
              <h1>${title}</h1>
              <div class="date">${formattedDate}</div>
          </div>
          
          <table>
              <thead>
                  <tr>
                      <th>Paziente</th>
                      <th>Tipo Terapia</th>
                      <th>Data</th>
                      <th>Giorni dalla Terapia</th>
                      <th>Importo (€)</th>
                  </tr>
              </thead>
              <tbody>
                  ${(() => {
                      const patients: { [key: string]: { items: UnpaidTherapy[], total: number } } = {};
                      
                      therapies.forEach(therapy => {
                          if (!patients[therapy.patient_name]) {
                              patients[therapy.patient_name] = { items: [], total: 0 };
                          }
                          patients[therapy.patient_name].items.push(therapy);
                          patients[therapy.patient_name].total += therapy.amount;
                      });
                      
                      let html = '';
                      let grandTotal = 0;
                      
                      Object.keys(patients).forEach(patientName => {
                          const patientData = patients[patientName];
                          grandTotal += patientData.total;
                          
                          html += `
                              <tr class="patient-total">
                                  <td colspan="4"><strong>${patientName}</strong></td>
                                  <td><strong>${currency.format(patientData.total)}</strong></td>
                              </tr>`;
                          
                          patientData.items.forEach((item, index) => {
                              html += `
                                  <tr>
                                      <td>${index === 0 ? '' : ''}</td>
                                      <td>${item.treatment_type}</td>
                                      <td>${new Date(item.date).toLocaleDateString('it-IT')}</td>
                                      <td>${item.days_since} giorni</td>
                                      <td>${currency.format(item.amount)}</td>
                                  </tr>`;
                          });
                      });
                      
                      html += `
                          <tr class="total-row">
                              <td colspan="4"><strong>TOTALE GENERALE</strong></td>
                              <td><strong>${currency.format(grandTotal)}</strong></td>
                          </tr>`;
                      
                      return html;
                  })()}
              </tbody>
          </table>
          
          <div class="footer">
              <p>Report generato automaticamente da FisioHub</p>
              <p>Numero totale terapie non pagate: ${therapies.length}</p>
              <p>Numero pazienti con terapie non pagate: ${(() => {
                  const uniquePatients = new Set(therapies.map(t => t.patient_name));
                  return uniquePatients.size;
              })()}</p>
          </div>
          
          <script>
              window.onload = function() {
                  setTimeout(() => {
                      window.print();
                  }, 500);
              };
          </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }

  useEffect(() => {
    setSeries([]);
    setUnpaidSeries([]);
    setSelectedDay(null);
    setDayDetails([]);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, dateStr]);

  // Funzione per formattare la data in italiano
  function formatDateLabel(date: Date): string {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('it-IT', options);
  }

  // Ottieni pazienti unici per il dropdown
  const uniquePatients = useMemo(() => {
    const patients = new Set(unpaidTherapies.map(t => t.patient_name));
    return Array.from(patients).sort();
  }, [unpaidTherapies]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: COLORS.appBg }}>
      {/* Menu Laterale */}
      <aside
        className="no-print"
        style={{
          width: 250,
          background: COLORS.panelBg,
          borderRight: `1px solid ${COLORS.border}`,
          padding: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.blueDark, letterSpacing: -0.2 }}>
          FisioHub
        </div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <Link 
            href="/" 
            style={{ 
              color: COLORS.blueDark, 
              fontWeight: 800, 
              textDecoration: "none", 
              display: "flex", 
              alignItems: "center", 
              gap: 8,
            }}
          >
            🏠 Home
          </Link>
          <Link 
            href="/calendar" 
            style={{ 
              color: COLORS.blueDark, 
              fontWeight: 800, 
              textDecoration: "none",
              display: "flex", 
              alignItems: "center", 
              gap: 8,
            }}
          >
            📅 Calendario
          </Link>
          <Link 
            href="/reports" 
            style={{ 
              color: COLORS.primary,
              fontWeight: 800, 
              textDecoration: "none",
              display: "flex", 
              alignItems: "center", 
              gap: 8,
            }}
          >
            📊 Report
          </Link>
          <Link 
            href="/patients" 
            style={{ 
              color: COLORS.blueDark, 
              fontWeight: 800, 
              textDecoration: "none",
              display: "flex", 
              alignItems: "center", 
              gap: 8,
            }}
          >
            👤 Pazienti
          </Link>
        </div>

        <div style={{ marginTop: 26, fontSize: 12, color: COLORS.muted }}>
          Analisi dati e statistiche incassi
        </div>

        {/* Sezione Informazioni */}
        <div style={{ marginTop: 32, padding: 12, background: COLORS.panelSoft, borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: COLORS.blueDark, marginBottom: 6 }}>
            ℹ️ Informazioni
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, lineHeight: 1.4 }}>
            I report mostrano gli incassi provenienti da fatture pagate e appuntamenti completati.
            <br/><br/>
            <strong>Terapie non pagate:</strong> visualizza le terapie in attesa di pagamento.
          </div>
        </div>

        {/* Sezione Filtri Rapidi */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: COLORS.blueDark, marginBottom: 8 }}>
            ⚡ Filtri Rapidi
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={() => {
                setPeriod("day");
                setDateStr(toISODate(new Date()));
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelSoft,
                color: COLORS.text,
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              📅 Oggi
            </button>
            <button
              onClick={() => {
                setPeriod("week");
                setDateStr(toISODate(new Date()));
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelSoft,
                color: COLORS.text,
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              📆 Settimana Corrente
            </button>
            <button
              onClick={() => {
                setPeriod("month");
                setDateStr(toISODate(new Date()));
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: `1px solid ${COLORS.border}`,
                background: COLORS.panelSoft,
                color: COLORS.text,
                cursor: "pointer",
                fontWeight: 800,
                fontSize: 12,
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              📊 Mese Corrente
            </button>
          </div>
        </div>

        {/* Statistiche Veloci */}
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: COLORS.blueDark, marginBottom: 8 }}>
            📈 Dati Recenti
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted }}>
            {rawData.length > 0 || unpaidTherapies.length > 0 ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Totale incassato:</span>
                  <span style={{ fontWeight: 900, color: COLORS.success }}>
                    {currency.format(statistics.total)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Transazioni:</span>
                  <span style={{ fontWeight: 900, color: COLORS.primary }}>
                    {rawData.length}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span>Terapie non pagate:</span>
                  <span style={{ fontWeight: 900, color: COLORS.danger }}>
                    {unpaidTherapies.length}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Residuo:</span>
                  <span style={{ fontWeight: 900, color: COLORS.warning }}>
                    {currency.format(statistics.unpaidTotal)}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ padding: 8, textAlign: "center", fontStyle: "italic" }}>
                Nessun dato disponibile
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Contenuto Principale */}
      <main style={{ 
        flex: 1, 
        display: "flex", 
        flexDirection: "column", 
        padding: 24, 
        minWidth: 0,
        width: "100%",
        overflowX: "hidden"
      }}>
        {/* Header con titolo e pulsanti */}
        <div style={{ width: "100%" }}>
          <div className="no-print" style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between", 
            gap: 20, 
            flexWrap: "wrap", 
            marginBottom: 24,
            padding: "0 4px"
          }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <h1 style={{ margin: 0, color: COLORS.blueDark, fontWeight: 900, fontSize: 32, letterSpacing: -0.2 }}>
                Report Incassi
              </h1>
              <div style={{ marginTop: 6, fontSize: 12, color: COLORS.muted, fontWeight: 800 }}>
                Analisi dettagliata dei ricavi e terapie non pagate
              </div>
            </div>

            <div style={{ 
              display: "flex", 
              gap: 16, 
              flexWrap: "wrap", 
              alignItems: "center",
              justifyContent: "flex-end",
              flex: 1,
              minWidth: "min(100%, 400px)",
              marginTop: 8,
              maxWidth: "100%"
            }}>
              {/* Pulsante Report Totali */}
              <button
                onClick={() => {
                  const printWindow = window.open('', '_blank');
                  if (!printWindow) return;

                  const today = new Date();
                  const formattedDate = today.toLocaleDateString('it-IT', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  });

                  const totalPaid = statistics.total;
                  const totalUnpaid = statistics.unpaidTotal;
                  const grandTotal = totalPaid + totalUnpaid;

                  const htmlContent = `
                    <!DOCTYPE html>
                    <html lang="it">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Report Totali - ${formattedDate}</title>
                        <style>
                            @media print {
                                @page { margin: 1cm; }
                                body {
                                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                    color: #000;
                                    background: #fff;
                                    font-size: 12pt;
                                    line-height: 1.4;
                                }
                                .header {
                                    text-align: center;
                                    margin-bottom: 2cm;
                                    border-bottom: 2px solid #000;
                                    padding-bottom: 0.5cm;
                                }
                                .header h1 {
                                    font-size: 18pt;
                                    margin: 0;
                                    font-weight: bold;
                                }
                                .header .date {
                                    font-size: 11pt;
                                    margin-top: 0.2cm;
                                    color: #555;
                                }
                                .summary {
                                    display: grid;
                                    grid-template-columns: repeat(2, 1fr);
                                    gap: 20px;
                                    margin: 2cm 0;
                                }
                                .summary-card {
                                    padding: 20px;
                                    border: 1px solid #000;
                                    border-radius: 8px;
                                    text-align: center;
                                }
                                .summary-card.paid {
                                    background-color: #f0f9ff;
                                }
                                .summary-card.unpaid {
                                    background-color: #fef2f2;
                                }
                                .summary-card.total {
                                    background-color: #f0f0f0;
                                    grid-column: span 2;
                                }
                                .summary-title {
                                    font-size: 14pt;
                                    font-weight: bold;
                                    margin-bottom: 10px;
                                }
                                .summary-amount {
                                    font-size: 20pt;
                                    font-weight: bold;
                                }
                                .paid .summary-amount { color: #16a34a; }
                                .unpaid .summary-amount { color: #dc2626; }
                                .total .summary-amount { color: #1e40af; }
                                .details {
                                    margin-top: 2cm;
                                }
                                .details h2 {
                                    font-size: 16pt;
                                    margin-bottom: 10px;
                                }
                                .no-print { display: none; }
                            }
                            body {
                                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                color: #000;
                                background: #fff;
                                padding: 2cm;
                            }
                            .header {
                                text-align: center;
                                margin-bottom: 2cm;
                                border-bottom: 2px solid #000;
                                padding-bottom: 0.5cm;
                            }
                            .header h1 {
                                font-size: 18pt;
                                margin: 0;
                                font-weight: bold;
                            }
                            .header .date {
                                font-size: 11pt;
                                margin-top: 0.2cm;
                                color: #555;
                            }
                            .summary {
                                display: grid;
                                grid-template-columns: repeat(2, 1fr);
                                gap: 20px;
                                margin: 2cm 0;
                            }
                            .summary-card {
                                padding: 20px;
                                border: 1px solid #000;
                                border-radius: 8px;
                                text-align: center;
                            }
                            .summary-card.paid {
                                background-color: #f0f9ff;
                            }
                            .summary-card.unpaid {
                                background-color: #fef2f2;
                            }
                            .summary-card.total {
                                background-color: #f0f0f0;
                                grid-column: span 2;
                            }
                            .summary-title {
                                font-size: 14pt;
                                font-weight: bold;
                                margin-bottom: 10px;
                            }
                            .summary-amount {
                                font-size: 20pt;
                                font-weight: bold;
                            }
                            .paid .summary-amount { color: #16a34a; }
                            .unpaid .summary-amount { color: #dc2626; }
                            .total .summary-amount { color: #1e40af; }
                            .details {
                                margin-top: 2cm;
                            }
                            .details h2 {
                                font-size: 16pt;
                                margin-bottom: 10px;
                            }
                            button {
                                padding: 10px 20px;
                                background: #2563eb;
                                color: white;
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                font-weight: bold;
                                margin-bottom: 1cm;
                            }
                        </style>
                    </head>
                    <body>
                        <button onclick="window.print()" class="no-print">🖨️ Stampa Report</button>
                        
                        <div class="header">
                            <h1>REPORT TOTALI - FISIOHUB</h1>
                            <div class="date">${formattedDate}</div>
                        </div>
                        
                        <div class="summary">
                            <div class="summary-card paid">
                                <div class="summary-title">TOTALE INCASSATO</div>
                                <div class="summary-amount">${currency.format(totalPaid)}</div>
                                <div style="font-size: 10pt; margin-top: 10px; color: #555;">
                                    ${statistics.invoiceCount} fatture • ${statistics.appointmentCount} appuntamenti
                                </div>
                            </div>
                            
                            <div class="summary-card unpaid">
                                <div class="summary-title">TOTALE NON PAGATO</div>
                                <div class="summary-amount">${currency.format(totalUnpaid)}</div>
                                <div style="font-size: 10pt; margin-top: 10px; color: #555;">
                                    ${statistics.unpaidCount} terapie in sospeso
                                </div>
                            </div>
                            
                            <div class="summary-card total">
                                <div class="summary-title">TOTALE GENERALE (Incassato + Non Pagato)</div>
                                <div class="summary-amount">${currency.format(grandTotal)}</div>
                                <div style="font-size: 10pt; margin-top: 10px; color: #555;">
                                    ${statistics.invoiceCount + statistics.unpaidInvoiceCount} fatture totali • 
                                    ${statistics.appointmentCount + statistics.unpaidAppointmentCount} appuntamenti totali
                                </div>
                            </div>
                        </div>
                        
                        <div class="details">
                            <h2>📊 Statistiche Dettagliate</h2>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; font-size: 11pt;">
                                <div><strong>Media per transazione:</strong> ${currency.format(statistics.averageAmount)}</div>
                                <div><strong>Importo massimo:</strong> ${currency.format(statistics.maxAmount)}</div>
                                <div><strong>Importo minimo:</strong> ${currency.format(statistics.minAmount)}</div>
                                <div><strong>Fatture non pagate:</strong> ${statistics.unpaidInvoiceCount}</div>
                                <div><strong>Appuntamenti non pagati:</strong> ${statistics.unpaidAppointmentCount}</div>
                                <div><strong>Totale transazioni:</strong> ${rawData.length}</div>
                            </div>
                        </div>
                        
                        <div style="margin-top: 3cm; padding-top: 1cm; border-top: 1px solid #ccc; font-size: 9pt; color: #555;">
                            <p>Report generato automaticamente da FisioHub</p>
                            <p>Data di generazione: ${new Date().toLocaleString('it-IT')}</p>
                        </div>
                        
                        <script>
                            window.onload = function() {
                                setTimeout(() => {
                                    window.print();
                                }, 500);
                            };
                        </script>
                    </body>
                    </html>
                  `;

                  printWindow.document.write(htmlContent);
                  printWindow.document.close();
                }}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.primary}`,
                  background: COLORS.primary,
                  color: "white",
                  textDecoration: "none",
                  fontWeight: 900,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 46,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                📄 Report Totali
              </button>

              {/* Pulsante Report Non Pagati con Dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowUnpaidDropdown(!showUnpaidDropdown)}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 8,
                    border: `1px solid ${COLORS.danger}`,
                    background: COLORS.danger,
                    color: "white",
                    textDecoration: "none",
                    fontWeight: 900,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    height: 46,
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  ⚠️ Report Non Pagati
                  <span style={{ fontSize: 12 }}>{showUnpaidDropdown ? '▲' : '▼'}</span>
                </button>

                {showUnpaidDropdown && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: 8,
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    zIndex: 100,
                    minWidth: 200,
                  }}>
                    <div style={{
                      padding: "8px 12px",
                      fontSize: 11,
                      color: COLORS.muted,
                      borderBottom: `1px solid ${COLORS.border}`,
                      fontWeight: 800,
                    }}>
                      Seleziona opzione di stampa:
                    </div>
                    
                    <button
                      onClick={() => {
                        printUnpaidReport();
                        setShowUnpaidDropdown(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 16px",
                        background: "none",
                        border: "none",
                        textAlign: "left",
                        fontSize: 12,
                        color: COLORS.text,
                        cursor: "pointer",
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      📋 Tutti i non pagati
                    </button>
                    
                    <div style={{
                      padding: "4px 12px",
                      fontSize: 10,
                      color: COLORS.muted,
                      borderTop: `1px solid ${COLORS.border}`,
                      borderBottom: `1px solid ${COLORS.border}`,
                      background: COLORS.panelSoft,
                    }}>
                      Per paziente:
                    </div>
                    
                    {uniquePatients.map(patient => (
                      <button
                        key={patient}
                        onClick={() => {
                          printPatientReport(patient);
                          setShowUnpaidDropdown(false);
                        }}
                        style={{
                          width: "100%",
                          padding: "8px 16px",
                          background: "none",
                          border: "none",
                          textAlign: "left",
                          fontSize: 12,
                          color: COLORS.text,
                          cursor: "pointer",
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          borderBottom: `1px solid ${COLORS.border}`,
                        }}
                      >
                        👤 {patient}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <Link
                href="/calendar"
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.accent}`,
                  background: COLORS.accent,
                  color: "white",
                  textDecoration: "none",
                  fontWeight: 900,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 46,
                  whiteSpace: "nowrap",
                }}
              >
                <span>📅</span>
                Vai al Calendario
              </Link>
              
              <Link
                href="/"
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.panelSoft,
                  color: COLORS.text,
                  textDecoration: "none",
                  fontWeight: 900,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 46,
                  whiteSpace: "nowrap",
                }}
              >
                ← Torna alla Home
              </Link>
            </div>
          </div>

          {/* Filtri */}
          <div
            style={{
              background: COLORS.card,
              borderRadius: 16,
              padding: 16,
              border: `1px solid ${COLORS.border}`,
              marginBottom: 16,
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div
                style={{
                  display: "inline-flex",
                  background: "#eef2ff",
                  padding: 4,
                  borderRadius: 12,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                {[
                  { k: "day", label: "Giorno", icon: "📅" },
                  { k: "week", label: "Settimana", icon: "📆" },
                  { k: "month", label: "Mese", icon: "📊" },
                ].map((p) => (
                  <button
                    key={p.k}
                    onClick={() => setPeriod(p.k as Period)}
                    style={{
                      cursor: "pointer",
                      padding: "8px 16px",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: 900,
                      fontSize: 13,
                      color: period === p.k ? "white" : COLORS.primary,
                      background: period === p.k ? COLORS.primary : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      transition: "all 0.2s",
                    }}
                  >
                    <span>{p.icon}</span>
                    {p.label}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  style={{
                    border: `1px solid ${COLORS.border}`,
                    background: "white",
                    padding: "10px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    minWidth: 160,
                  }}
                />
                
                <button 
                  onClick={() => setDateStr(toISODate(new Date()))}
                  style={{
                    cursor: "pointer",
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    background: "white",
                    fontWeight: 800,
                    fontSize: 13,
                    color: COLORS.primary,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>🎯</span>
                  Oggi
                </button>

                <button 
                  onClick={loadData}
                  disabled={loading}
                  style={{
                    cursor: loading ? "wait" : "pointer",
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: `1px solid ${COLORS.accent}`,
                    background: loading ? COLORS.muted : COLORS.accent,
                    fontWeight: 800,
                    fontSize: 13,
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>🔄</span>
                  {loading ? "Caricamento..." : "Ricarica"}
                </button>
              </div>

              <div style={{ marginLeft: "auto", fontSize: 13, color: COLORS.muted, fontWeight: 700 }}>
                {formatDateLabel(baseDate)}
              </div>
            </div>
          </div>

         {/* DETTAGLIO FONTI - Stile compatto */}
<div
  style={{
    background: COLORS.card,
    borderRadius: 16,
    padding: 20,
    border: `1px solid ${COLORS.border}`,
    boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
    marginBottom: 24,
  }}
>
  <div style={{ 
    display: "flex", 
    justifyContent: "space-between", 
    alignItems: "center", 
    marginBottom: 20,
    borderBottom: `1px solid ${COLORS.border}`,
    paddingBottom: 16 
  }}>
    <div>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: COLORS.text }}>
        🧾 DETTAGLIO FONTI
      </h2>
      <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 4, fontWeight: 700 }}>
        Incassi per tipologia e stato di pagamento
      </div>
    </div>
    
    <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.accent }}>
      Totale: {currency.format(statistics.total + statistics.unpaidTotal)}
    </div>
  </div>

  <div style={{ 
    display: "grid", 
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", 
    gap: 16,
    width: "100%"
  }}>
    {/* Fatture Pagate */}
    <div style={{
      background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
      borderRadius: 12,
      padding: 20,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: COLORS.success,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 18,
        }}>
          📄
        </div>
        <div>
          <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
            Fatture Pagate
          </div>
          <div style={{ fontSize: 24, fontWeight: 1000, color: COLORS.success, marginTop: 4 }}>
            {currency.format(statistics.invoiceCount > 0 ? 
              rawData.filter(d => d.source === 'invoice').reduce((sum, d) => sum + d.amount, 0) : 0)}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
            {statistics.invoiceCount} fatture • Media: {currency.format(
              statistics.invoiceCount > 0 ? 
              rawData.filter(d => d.source === 'invoice').reduce((sum, d) => sum + d.amount, 0) / statistics.invoiceCount : 0
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Appuntamenti Pagati */}
    <div style={{
      background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
      borderRadius: 12,
      padding: 20,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: COLORS.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 18,
        }}>
          📅
        </div>
        <div>
          <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
            Appuntamenti Pagati
          </div>
          <div style={{ fontSize: 24, fontWeight: 1000, color: COLORS.accent, marginTop: 4 }}>
            {currency.format(statistics.appointmentCount > 0 ? 
              rawData.filter(d => d.source === 'appointment').reduce((sum, d) => sum + d.amount, 0) : 0)}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
            {statistics.appointmentCount} appuntamenti • Media: {currency.format(
              statistics.appointmentCount > 0 ? 
              rawData.filter(d => d.source === 'appointment').reduce((sum, d) => sum + d.amount, 0) / statistics.appointmentCount : 0
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Fatture Non Pagate */}
    <div style={{
      background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
      borderRadius: 12,
      padding: 20,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: COLORS.danger,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 18,
        }}>
          ⚠️
        </div>
        <div>
          <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
            Fatture Non Pagate
          </div>
          <div style={{ fontSize: 24, fontWeight: 1000, color: COLORS.danger, marginTop: 4 }}>
            {currency.format(
              unpaidTherapies
                .filter(t => t.treatment_type === 'Fattura')
                .reduce((sum, t) => sum + t.amount, 0)
            )}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
            {statistics.unpaidInvoiceCount} fatture • Residuo
          </div>
        </div>
      </div>
    </div>

    {/* Appuntamenti Non Pagati */}
    <div style={{
      background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
      borderRadius: 12,
      padding: 20,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: COLORS.warning,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: 18,
        }}>
          ⏰
        </div>
        <div>
          <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
            Appuntamenti Non Pagati
          </div>
          <div style={{ fontSize: 24, fontWeight: 1000, color: COLORS.warning, marginTop: 4 }}>
            {currency.format(
              unpaidTherapies
                .filter(t => t.treatment_type !== 'Fattura')
                .reduce((sum, t) => sum + t.amount, 0)
            )}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
            {statistics.unpaidAppointmentCount} appuntamenti • In attesa
          </div>
        </div>
      </div>
    </div>
  </div>

  {/* Riepilogo totale - stile compatto */}
  <div style={{
    marginTop: 20,
    padding: "16px",
    background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  }}>
    <div style={{ fontSize: 13, fontWeight: 900, color: COLORS.text }}>
      🧮 RIEPILOGO TOTALE
    </div>
    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>PAGATO</div>
        <div style={{ fontSize: 18, fontWeight: 1000, color: COLORS.success }}>
          {currency.format(statistics.total)}
        </div>
      </div>
      <div style={{ fontSize: 20, color: COLORS.muted, fontWeight: 900 }}>+</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>NON PAGATO</div>
        <div style={{ fontSize: 18, fontWeight: 1000, color: COLORS.danger }}>
          {currency.format(statistics.unpaidTotal)}
        </div>
      </div>
      <div style={{ fontSize: 20, color: COLORS.muted, fontWeight: 900 }}>=</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>TOTALE GENERALE</div>
        <div style={{ fontSize: 24, fontWeight: 1000, color: COLORS.accent }}>
          {currency.format(statistics.total + statistics.unpaidTotal)}
        </div>
      </div>
    </div>
  </div>
</div>

          {/* Grafico Distribuzione Incassi */}
          <div
            style={{
              background: COLORS.card,
              borderRadius: 16,
              padding: 20,
              border: `1px solid ${COLORS.border}`,
              boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
              marginBottom: 24,
              width: "100%",
              overflow: "hidden",
            }}
          >
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              marginBottom: 20,
              borderBottom: `1px solid ${COLORS.border}`,
              paddingBottom: 12 
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: COLORS.text }}>
                  📊 Distribuzione Incassi
                </h3>
                <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                  {period === "day" ? "Per ore del giorno" : 
                   period === "week" ? "Per giorni della settimana" : 
                   "Per giorni del mese"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>
                Totale periodo: {currency.format(series.reduce((a, b) => a + b, 0) + unpaidSeries.reduce((a, b) => a + b, 0))}
              </div>
            </div>

            {series.length > 0 ? (
              <EnhancedBarChart 
                labels={labels} 
                values={series}
                unpaidValues={unpaidSeries}
                period={period} 
                onBarClick={handleBarClick}
                selectedDay={selectedDay}
              />
            ) : (
              <div style={{ 
                height: 250, // Altezza ridotta per evitare sforamenti
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center", 
                justifyContent: "center",
                color: COLORS.muted,
                fontSize: 14,
                fontWeight: 700
              }}>
                📊 Nessun dato disponibile per il periodo selezionato
                <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>
                  Prova a cambiare data o periodo
                </div>
              </div>
            )}
          </div>

          {/* Layout inferiore con transazioni e dettagli */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: selectedDay !== null ? "1fr 1fr 300px" : "1fr 1fr", 
            gap: 24,
            width: "100%",
            maxWidth: "100%",
            overflow: "hidden",
            transition: "all 0.3s ease"
          }}>
            {/* Lista Transazioni Pagate */}
            <div
              style={{
                background: COLORS.card,
                borderRadius: 16,
                padding: 20,
                border: `1px solid ${COLORS.border}`,
                boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                maxHeight: 600,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                marginBottom: 16,
                borderBottom: `1px solid ${COLORS.border}`,
                paddingBottom: 12 
              }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: COLORS.text }}>
                  💰 Transazioni Pagate
                </h3>
                <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>
                  {rawData.length} elementi
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
                {loading ? (
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    height: 200,
                    color: COLORS.muted,
                    fontSize: 14
                  }}>
                    Caricamento...
                  </div>
                ) : rawData.length === 0 ? (
                  <div style={{ 
                    textAlign: "center", 
                    padding: 40, 
                    color: COLORS.muted,
                    fontSize: 13
                  }}>
                    Nessuna transazione pagata trovata
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {rawData.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          padding: 12,
                          background: item.source === 'invoice' 
                            ? "rgba(37, 99, 235, 0.05)" 
                            : "rgba(13, 148, 136, 0.05)",
                          borderRadius: 8,
                          borderLeft: `4px solid ${
                            item.source === 'invoice' ? COLORS.secondary : COLORS.accent
                          }`,
                        }}
                      >
                        <div style={{ 
                          display: "flex", 
                          justifyContent: "space-between", 
                          alignItems: "flex-start",
                          marginBottom: 4 
                        }}>
                          <div>
                            <div style={{ 
                              fontSize: 13, 
                              fontWeight: 900,
                              color: COLORS.text
                            }}>
                              {currency.format(item.amount)}
                            </div>
                            <div style={{ 
                              fontSize: 11, 
                              color: COLORS.muted,
                              marginTop: 2 
                            }}>
                              {new Date(item.date).toLocaleDateString('it-IT', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                          <div style={{
                            fontSize: 10,
                            fontWeight: 900,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: item.source === 'invoice' 
                              ? "rgba(37, 99, 235, 0.1)" 
                              : "rgba(13, 148, 136, 0.1)",
                            color: item.source === 'invoice' ? COLORS.secondary : COLORS.accent,
                          }}>
                            {item.source === 'invoice' ? 'FATTURA' : 'APPUNTAMENTO'}
                          </div>
                        </div>
                        
                        {item.patient_name && (
                          <div style={{ 
                            fontSize: 11, 
                            color: COLORS.text,
                            marginTop: 4,
                            fontWeight: 700
                          }}>
                            👤 {item.patient_name}
                          </div>
                        )}
                        
                        {item.description && (
                          <div style={{ 
                            fontSize: 10, 
                            color: COLORS.muted,
                            marginTop: 2
                          }}>
                            {item.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Lista Terapie Non Pagate */}
            <div
              style={{
                background: COLORS.card,
                borderRadius: 16,
                padding: 20,
                border: `1px solid ${COLORS.border}`,
                boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                maxHeight: 600,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                marginBottom: 16,
                borderBottom: `1px solid ${COLORS.border}`,
                paddingBottom: 12 
              }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: COLORS.text }}>
                  ⚠️ Terapie Non Pagate
                </h3>
                <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>
                  {unpaidTherapies.length} elementi
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
                {loading ? (
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    height: 200,
                    color: COLORS.muted,
                    fontSize: 14
                  }}>
                    Caricamento...
                  </div>
                ) : unpaidTherapies.length === 0 ? (
                  <div style={{ 
                    textAlign: "center", 
                    padding: 40, 
                    color: COLORS.muted,
                    fontSize: 13
                  }}>
                    🎉 Nessuna terapia non pagata trovata
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {unpaidTherapies.map((therapy, index) => (
                      <div
                        key={therapy.id}
                        style={{
                          padding: 12,
                          background: index % 2 === 0 ? "rgba(254, 242, 242, 0.3)" : "rgba(254, 226, 226, 0.3)",
                          borderRadius: 8,
                          borderLeft: `4px solid ${COLORS.danger}`,
                        }}
                      >
                        <div style={{ 
                          display: "flex", 
                          justifyContent: "space-between", 
                          alignItems: "flex-start",
                          marginBottom: 4 
                        }}>
                          <div>
                            <div style={{ 
                              fontSize: 13, 
                              fontWeight: 900,
                              color: COLORS.text
                            }}>
                              {currency.format(therapy.amount)}
                            </div>
                            <div style={{ 
                              fontSize: 11, 
                              color: COLORS.muted,
                              marginTop: 2 
                            }}>
                              {new Date(therapy.date).toLocaleDateString('it-IT')} • {therapy.treatment_type}
                            </div>
                          </div>
                          <div style={{
                            fontSize: 10,
                            fontWeight: 900,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(220, 38, 38, 0.1)",
                            color: COLORS.danger,
                          }}>
                            NON PAGATO
                          </div>
                        </div>
                        
                        <div style={{ 
                          fontSize: 11, 
                          color: COLORS.text,
                          marginTop: 4,
                          fontWeight: 700
                        }}>
                          👤 {therapy.patient_name}
                        </div>
                        
                        <div style={{ 
                          fontSize: 10, 
                          color: COLORS.warning,
                          marginTop: 2,
                          fontWeight: 700
                        }}>
                          ⏰ {therapy.days_since} giorni fa
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Dettagli Giorno Selezionato */}
            {selectedDay !== null && (
              <div
                style={{
                  background: COLORS.card,
                  borderRadius: 16,
                  padding: 20,
                  border: `1px solid ${COLORS.border}`,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                  maxHeight: 600,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  animation: "slideIn 0.3s ease"
                }}
              >
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center", 
                  marginBottom: 16,
                  borderBottom: `1px solid ${COLORS.border}`,
                  paddingBottom: 12 
                }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: COLORS.text }}>
                      📅 {labels[selectedDay]}
                    </h3>
                    <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 2 }}>
                      Dettagli del giorno selezionato
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedDay(null);
                      setDayDetails([]);
                    }}
                    style={{
                      cursor: "pointer",
                      background: "none",
                      border: "none",
                      fontSize: 18,
                      color: COLORS.muted,
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
                  {dayDetails.length === 0 ? (
                    <div style={{ 
                      textAlign: "center", 
                      padding: 40, 
                      color: COLORS.muted,
                      fontSize: 13
                    }}>
                      Nessun dato per questo giorno
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {dayDetails.map((item, index) => {
                        const isUnpaid = item.status === 'not_paid';
                        
                        return (
                          <div
                            key={index}
                            style={{
                              padding: 12,
                              background: isUnpaid 
                                ? "rgba(220, 38, 38, 0.05)" 
                                : item.source === 'invoice' 
                                  ? "rgba(37, 99, 235, 0.05)" 
                                  : "rgba(13, 148, 136, 0.05)",
                              borderRadius: 8,
                              borderLeft: `4px solid ${
                                isUnpaid 
                                  ? COLORS.danger 
                                  : item.source === 'invoice' 
                                    ? COLORS.secondary 
                                    : COLORS.accent
                              }`,
                            }}
                          >
                            <div style={{ 
                              display: "flex", 
                              justifyContent: "space-between", 
                              alignItems: "flex-start",
                              marginBottom: 4 
                            }}>
                              <div>
                                <div style={{ 
                                  fontSize: 13, 
                                  fontWeight: 900,
                                  color: isUnpaid ? COLORS.danger : COLORS.text
                                }}>
                                  {currency.format(item.amount)}
                                </div>
                                <div style={{ 
                                  fontSize: 10, 
                                  color: COLORS.muted,
                                  marginTop: 2 
                                }}>
                                  {new Date(item.date).toLocaleTimeString('it-IT', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              </div>
                              <div style={{
                                fontSize: 9,
                                fontWeight: 900,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: isUnpaid 
                                  ? "rgba(220, 38, 38, 0.1)" 
                                  : item.source === 'invoice' 
                                    ? "rgba(37, 99, 235, 0.1)" 
                                    : "rgba(13, 148, 136, 0.1)",
                                color: isUnpaid 
                                  ? COLORS.danger 
                                  : item.source === 'invoice' 
                                    ? COLORS.secondary 
                                    : COLORS.accent,
                              }}>
                                {isUnpaid ? 'NON PAGATO' : item.source === 'invoice' ? 'FATTURA' : 'APPUNTAMENTO'}
                              </div>
                            </div>
                            
                            {item.patient_name && (
                              <div style={{ 
                                fontSize: 11, 
                                color: COLORS.text,
                                marginTop: 4,
                                fontWeight: 700
                              }}>
                                👤 {item.patient_name}
                              </div>
                            )}
                            
                            {item.description && (
                              <div style={{ 
                                fontSize: 10, 
                                color: COLORS.muted,
                                marginTop: 2
                              }}>
                                {item.description}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                
                {dayDetails.length > 0 && (
                  <div style={{
                    marginTop: 16,
                    padding: "12px 16px",
                    background: "rgba(37, 99, 235, 0.05)",
                    borderRadius: 8,
                    border: `1px solid rgba(37, 99, 235, 0.1)`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: COLORS.text }}>
                      📊 Riepilogo giorno:
                    </div>
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      fontSize: 11, 
                      marginTop: 4 
                    }}>
                      <span style={{ color: COLORS.success }}>Pagati: {currency.format(
                        dayDetails.filter(d => d.status === 'paid').reduce((sum, d) => sum + d.amount, 0)
                      )}</span>
                      <span style={{ color: COLORS.danger }}>Non pagati: {currency.format(
                        dayDetails.filter(d => d.status === 'not_paid').reduce((sum, d) => sum + d.amount, 0)
                      )}</span>
                    </div>
                    <div style={{ 
                      fontSize: 11, 
                      color: COLORS.muted, 
                      marginTop: 4,
                      fontWeight: 700
                    }}>
                      Totale: {currency.format(dayDetails.reduce((sum, d) => sum + d.amount, 0))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

function EnhancedBarChart({ 
  labels, 
  values, 
  unpaidValues,
  period, 
  onBarClick,
  selectedDay 
}: { 
  labels: string[]; 
  values: number[]; 
  unpaidValues: number[];
  period: Period;
  onBarClick: (dayIndex: number) => void;
  selectedDay: number | null;
}) {
  const max = Math.max(1, ...values, ...unpaidValues);
  const totalPaid = values.reduce((a, b) => a + b, 0);
  const totalUnpaid = unpaidValues.reduce((a, b) => a + b, 0);
  const total = totalPaid + totalUnpaid;
  const hasData = values.some(v => v > 0) || unpaidValues.some(v => v > 0);
  const chartHeight = 220; // Altezza ridotta per evitare sforamenti
  
  // Calcola la larghezza dinamica delle barre
  const barWidth = period === 'day' 
    ? 'calc((100% - 192px) / 24)'
    : period === 'week' 
      ? 'calc((100% - 56px) / 7)'
      : 'calc((100% - 120px) / 31)';

  if (!hasData) {
    return (
      <div style={{ 
        height: chartHeight, 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center", 
        justifyContent: "center",
        color: COLORS.muted,
        fontSize: 14,
        fontWeight: 700
      }}>
        📊 Nessun dato disponibile per il periodo selezionato
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>
          Prova a cambiare data o periodo
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      width: "100%", 
      overflowX: "auto", 
      paddingBottom: 8,
      maxWidth: "100%"
    }}>
      <div
        style={{
          minWidth: period === 'month' ? 800 : 600,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          gap: 4,
          height: chartHeight,
          borderBottom: `1px solid ${COLORS.border}`,
          paddingBottom: 24,
          position: "relative",
        }}
      >
        {/* Griglia di sfondo */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 24,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          zIndex: 0,
        }}>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <div
              key={i}
              style={{
                height: 1,
                background: i === 0 ? COLORS.border : "rgba(226, 232, 240, 0.5)",
                width: "100%",
              }}
            />
          ))}
        </div>

        {values.map((v, i) => {
          const label = labels[i];
          if (!label) return null;

          const unpaid = unpaidValues[i] || 0;
          const totalValue = v + unpaid;
          
          const paidHeight = (v / max) * (chartHeight - 35); // Ridotto ulteriormente
          const unpaidHeight = (unpaid / max) * (chartHeight - 35);
          const totalHeight = paidHeight + unpaidHeight;
          
          const isActive = totalValue > 0;
          const isSelected = selectedDay === i;
          
          return (
            <div 
              key={i} 
              style={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center",
                width: barWidth,
                minWidth: period === 'month' ? 20 : 24,
                position: "relative",
                zIndex: 1,
              }}
              onClick={() => {
                if (totalValue > 0) {
                  onBarClick(i);
                }
              }}
            >
              {/* Tooltip */}
              <div style={{
                position: "absolute",
                top: -65,
                left: "50%",
                transform: "translateX(-50%)",
                background: COLORS.text,
                color: "white",
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 900,
                whiteSpace: "nowrap",
                opacity: 0,
                transition: "opacity 0.2s",
                pointerEvents: "none",
                zIndex: 100,
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                minWidth: 160,
              }}>
                <div style={{ marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 10, opacity: 0.9 }}>
                  <div style={{ color: COLORS.success }}>
                    Pagati: {currency.format(v)} {total > 0 && `(${((v / total) * 100).toFixed(1)}%)`}
                  </div>
                  <div style={{ color: COLORS.danger, marginTop: 2 }}>
                    Non pagati: {currency.format(unpaid)} {total > 0 && `(${((unpaid / total) * 100).toFixed(1)}%)`}
                  </div>
                  <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 4 }}>
                    Totale: {currency.format(totalValue)}
                  </div>
                </div>
              </div>

              {/* Barra Non Pagata (parte inferiore) */}
              {unpaid > 0 && (
                <div
                  onMouseEnter={(e) => {
                    const tooltip = e.currentTarget.parentElement?.firstChild as HTMLElement;
                    if (tooltip) tooltip.style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    const tooltip = e.currentTarget.parentElement?.firstChild as HTMLElement;
                    if (tooltip) tooltip.style.opacity = "0";
                  }}
                  style={{
                    width: "85%",
                    height: unpaidHeight,
                    background: `linear-gradient(to top, rgba(220, 38, 38, 0.8), rgba(220, 38, 38, 0.6))`,
                    borderRadius: "4px 4px 0 0",
                    transition: "all 0.3s ease",
                    cursor: totalValue > 0 ? "pointer" : "default",
                    position: "relative",
                    borderWidth: "1px 1px 0 1px",
                    borderStyle: "solid",
                    borderColor: isActive ? `rgba(220, 38, 38, 0.8)` : COLORS.border,
                    minHeight: unpaid > 0 ? 4 : 0,
                  }}
                >
                  {/* Valore sulla barra non pagata */}
                  {unpaid > 0 && unpaidHeight > 20 && (
                    <div style={{
                      position: "absolute",
                      top: 2,
                      left: "50%",
                      transform: "translateX(-50%)",
                      color: "white",
                      fontSize: 9,
                      fontWeight: 900,
                      textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                      whiteSpace: "nowrap",
                    }}>
                      {unpaid > 1000 ? `${(unpaid/1000).toFixed(1)}k` : currency.format(unpaid).replace('€', '').trim()}
                    </div>
                  )}
                </div>
              )}

              {/* Barra Pagata (parte superiore) */}
              <div
                onMouseEnter={(e) => {
                  const tooltip = e.currentTarget.parentElement?.firstChild as HTMLElement;
                  if (tooltip) tooltip.style.opacity = "1";
                  if (totalValue > 0) {
                    e.currentTarget.style.transform = "scale(1.05)";
                    e.currentTarget.style.boxShadow = isSelected 
                      ? "0 4px 12px rgba(37, 99, 235, 0.6)" 
                      : "0 4px 12px rgba(37, 99, 235, 0.3)";
                  }
                }}
                onMouseLeave={(e) => {
                  const tooltip = e.currentTarget.parentElement?.firstChild as HTMLElement;
                  if (tooltip) tooltip.style.opacity = "0";
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                style={{
                  width: "85%",
                  height: paidHeight,
                  background: isActive 
                    ? `linear-gradient(to top, ${COLORS.secondary}, ${COLORS.primary})`
                    : "rgba(226, 232, 240, 0.3)",
                  borderRadius: unpaid > 0 ? "0 0 4px 4px" : "4px 4px 0 0",
                  transition: "all 0.3s ease",
                  cursor: totalValue > 0 ? "pointer" : "default",
                  position: "relative",
                  borderWidth: unpaid > 0 ? "0 1px 1px 1px" : "1px 1px 1px 1px",
                  borderStyle: "solid",
                  borderColor: isActive 
                    ? isSelected 
                      ? COLORS.secondary
                      : `${COLORS.secondary}80`
                    : COLORS.border,
                  minHeight: v > 0 ? 4 : 0,
                  transform: isSelected ? "scale(1.05)" : "scale(1)",
                  boxShadow: isSelected ? "0 4px 12px rgba(37, 99, 235, 0.6)" : "none",
                }}
              >
                {/* Valore sulla barra pagata */}
                {v > 0 && paidHeight > 30 && (
                  <div style={{
                    position: "absolute",
                    top: 4,
                    left: "50%",
                    transform: "translateX(-50%)",
                    color: "white",
                    fontSize: 10,
                    fontWeight: 900,
                    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                    whiteSpace: "nowrap",
                  }}>
                    {v > 1000 ? `${(v/1000).toFixed(1)}k` : currency.format(v).replace('€', '').trim()}
                  </div>
                )}
              </div>
              
              {/* Etichetta */}
              <div style={{ 
                marginTop: 8, 
                fontSize: period === 'month' ? 10 : 11, 
                color: isSelected ? COLORS.primary : (isActive ? COLORS.text : COLORS.muted), 
                fontWeight: isSelected ? 1000 : (isActive ? 900 : 700),
                textAlign: "center",
                height: period === 'month' ? 40 : 30,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                padding: "0 2px",
              }}>
                {period === 'month' && label.length > 2 
                  ? label 
                  : label.substring(0, 3)}
              </div>
            </div>
          );
        })}

        {/* Linea zero */}
        <div style={{
          position: "absolute",
          bottom: 24,
          left: 0,
          right: 0,
          height: 1,
          background: COLORS.border,
          zIndex: 0,
        }} />

        {/* Legenda scala */}
        <div style={{
          position: "absolute",
          right: 0,
          top: 0,
          fontSize: 10,
          color: COLORS.muted,
          fontWeight: 700,
          textAlign: "right",
        }}>
          <div>Max: {currency.format(max)}</div>
          <div style={{ marginTop: (chartHeight - 10) * 0.5 }}>50%</div>
          <div style={{ marginTop: (chartHeight - 10) * 0.25 }}>25%</div>
        </div>

        {/* Legenda colori */}
        <div style={{
          position: "absolute",
          left: 0,
          top: -35,
          display: "flex",
          gap: 12,
          fontSize: 10,
          color: COLORS.muted,
          fontWeight: 700,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 12, height: 12, background: COLORS.primary, borderRadius: 2 }}></div>
            <span>Pagati</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 12, height: 12, background: COLORS.danger, borderRadius: 2 }}></div>
            <span>Non pagati</span>
          </div>
          <div style={{ fontSize: 9, color: COLORS.muted, fontStyle: "italic" }}>
            Clicca su una barra per i dettagli
          </div>
        </div>
      </div>

      {/* Totale sotto il grafico */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 16,
        padding: "12px 16px",
        background: "rgba(37, 99, 235, 0.05)",
        borderRadius: 8,
        border: `1px solid rgba(37, 99, 235, 0.1)`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: COLORS.text }}>
          📊 Riepilogo periodo: 
          <span style={{ color: COLORS.success, marginLeft: 8 }}>Pagati: {currency.format(totalPaid)}</span>
          <span style={{ color: COLORS.danger, marginLeft: 12 }}>Non pagati: {currency.format(totalUnpaid)}</span>
          <span style={{ color: COLORS.primary, marginLeft: 12 }}>Totale: {currency.format(total)}</span>
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>
          {values.filter(v => v > 0).length} giorni con incassi
        </div>
      </div>
    </div>
  );
}