"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import Link from "next/link";
import { Menu, X, ChevronDown, ChevronUp, Filter, Download, Calendar, Home, Users, BarChart3 } from "lucide-react";

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
  const day = (x.getDay() + 6) % 7;
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

type AppointmentTherapy = {
  id: string;
  patient_id: string;
  patient_name: string;
  amount: number;
  date: string;
  treatment_type: string;
  status: "done" | "not_paid";
  price_type?: string | null;
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

function logSupabaseError(label: string, err: any) {
  if (!err) return;
  console.error(label, {
    message: err?.message,
    details: err?.details,
    hint: err?.hint,
    code: err?.code,
    status: err?.status,
    name: err?.name,
  });
}

export default function ReportsMobile() {
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
  const [unpaidTherapiesAll, setUnpaidTherapiesAll] = useState<UnpaidTherapy[]>([]);
  const [arrearsMonths, setArrearsMonths] = useState<{ month: string; count: number; total: number }[]>([]);
  const [reportTherapies, setReportTherapies] = useState<AppointmentTherapy[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [dayDetails, setDayDetails] = useState<FinancialItem[]>([]);
  const [showUnpaidDropdown, setShowUnpaidDropdown] = useState<boolean>(false);
  
  // Mobile specific states
  const [activeTab, setActiveTab] = useState<"summary" | "paid" | "unpaid" | "details" | "graph">("summary");
  const [showMenu, setShowMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showPrintOptions, setShowPrintOptions] = useState(false);

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

      // 1. Fetch FATTURE PAGATE
      let invoicesData: any[] = [];
      let unpaidInvoicesData: any[] = [];
      let appointmentsData: any[] = [];
      let unpaidAppointmentsData: any[] = [];

      // Fatture pagate
      const { data: paidInvoices } = await supabase
        .from("invoices")
        .select("id, amount, paid_at, status, patient_id")
        .eq("status", "paid")
        .gte("paid_at", fromStr)
        .lte("paid_at", toStr)
        .order("paid_at", { ascending: true });

      if (paidInvoices) invoicesData = paidInvoices;

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

      // 2. Fetch FATTURE NON PAGATE
      const { data: unpaidInvoices } = await supabase
        .from("invoices")
        .select("id, amount, paid_at, created_at, status, patient_id")
        .eq("status", "not_paid")
        .gte("created_at", fromStr)
        .lte("created_at", toStr)
        .order("created_at", { ascending: true });

      if (unpaidInvoices) unpaidInvoicesData = unpaidInvoices;

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

      // 3. Fetch APPUNTAMENTI PAGATI
      const { data: paidAppointments } = await supabase
        .from("appointments")
        .select("id, amount, start_at, status, treatment_type, price_type, patient_id")
        .eq("status", "done")
        .gte("amount", 0.01)
        .gte("start_at", fromStr)
        .lte("start_at", toStr)
        .order("start_at", { ascending: true });

      if (paidAppointments) appointmentsData = paidAppointments;

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

      // 4. Fetch APPUNTAMENTI NON PAGATI
      const { data: unpaidAppointments } = await supabase
        .from("appointments")
        .select("id, amount, start_at, status, treatment_type, price_type, patient_id")
        .eq("status", "not_paid")
        .gte("start_at", fromStr)
        .lte("start_at", toStr)
        .order("start_at", { ascending: true });

      if (unpaidAppointments) unpaidAppointmentsData = unpaidAppointments;

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

      // Arretrati: appuntamenti non pagati PRIMA del periodo selezionato
      const { data: arrearsAppointments } = await supabase
        .from("appointments")
        .select("id, amount, start_at, status")
        .eq("status", "not_paid")
        .lt("start_at", fromStr)
        .order("start_at", { ascending: false })
        .limit(1000);

      if (arrearsAppointments) {
        const monthMap = new Map<string, { count: number; total: number }>();
        arrearsAppointments.forEach((a: any) => {
          const amount = parseFloat(String(a.amount)) || 0;
          if (amount <= 0) return;
          const dt = new Date(a.start_at);
          const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
          const prev = monthMap.get(key) || { count: 0, total: 0 };
          monthMap.set(key, { count: prev.count + 1, total: prev.total + amount });
        });

        const sorted = Array.from(monthMap.entries())
          .map(([month, v]) => ({ month, count: v.count, total: v.total }))
          .sort((a, b) => (a.month < b.month ? 1 : -1));

        setArrearsMonths(sorted);
      }

      // Carica LISTA COMPLETA non pagati (tutti i mesi)
      const { data: unpaidInvoicesAllRaw } = await supabase
        .from("invoices")
        .select("id, amount, paid_at, created_at, status, patient_id")
        .eq("status", "not_paid")
        .order("created_at", { ascending: true })
        .limit(1000);

      const { data: unpaidAppointmentsAllRaw } = await supabase
        .from("appointments")
        .select("id, amount, start_at, status, treatment_type, price_type, patient_id")
        .eq("status", "not_paid")
        .order("start_at", { ascending: true })
        .limit(1000);

      const unpaidAllPatientIds = Array.from(
        new Set([
          ...((unpaidInvoicesAllRaw || []).map((i: any) => i.patient_id).filter(Boolean)),
          ...((unpaidAppointmentsAllRaw || []).map((a: any) => a.patient_id).filter(Boolean)),
        ])
      );

      let unpaidAllPatients: any[] = [];
      if (unpaidAllPatientIds.length > 0) {
        const { data: patientsData } = await supabase
          .from("patients")
          .select("id, first_name, last_name")
          .in("id", unpaidAllPatientIds);

        unpaidAllPatients = patientsData || [];
      }

      const todayAll = new Date();
      const unpaidAllList: UnpaidTherapy[] = [];

      (unpaidInvoicesAllRaw || []).forEach((inv: any) => {
        const amount = parseFloat(String(inv.amount)) || 0;
        if (amount <= 0) return;

        const p = unpaidAllPatients.find((x) => x.id === inv.patient_id) || null;
        const patientName = p ? `${p.last_name || ""} ${p.first_name || ""}`.trim() : "Sconosciuto";

        const invoiceDate = new Date(inv.paid_at || inv.created_at);
        const daysSince = Math.floor((todayAll.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));

        unpaidAllList.push({
          id: inv.id,
          patient_id: inv.patient_id,
          patient_name: patientName,
          amount,
          date: inv.paid_at || inv.created_at,
          treatment_type: "Fattura",
          days_since: daysSince,
          status: "not_paid",
        });
      });

      (unpaidAppointmentsAllRaw || []).forEach((app: any) => {
        const amount = parseFloat(String(app.amount)) || 0;
        if (amount <= 0) return;

        const p = unpaidAllPatients.find((x) => x.id === app.patient_id) || null;
        const patientName = p ? `${p.last_name || ""} ${p.first_name || ""}`.trim() : "Sconosciuto";

        const appDate = new Date(app.start_at);
        const daysSince = Math.floor((todayAll.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24));

        unpaidAllList.push({
          id: app.id,
          patient_id: app.patient_id,
          patient_name: patientName,
          amount,
          date: app.start_at,
          treatment_type: app.treatment_type || "Seduta",
          days_since: daysSince,
          status: app.status,
        });
      });

      unpaidAllList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setUnpaidTherapiesAll(unpaidAllList);

      // Terapie per stampa report generale
      const therapiesForPrint: AppointmentTherapy[] = [
        ...(appointmentsData || []).map((a: any) => {
          const patientName = a.patients
            ? `${a.patients.last_name || ""} ${a.patients.first_name || ""}`.trim()
            : "Senza nome";
          return {
            id: String(a.id),
            patient_id: String(a.patient_id || ""),
            patient_name: patientName,
            amount: parseFloat(String(a.amount)) || 0,
            date: a.start_at,
            treatment_type: a.treatment_type || "Terapia",
            status: "done" as const,
            price_type: a.price_type ?? null,
          };
        }),
        ...(unpaidAppointmentsData || []).map((a: any) => {
          const patientName = a.patients
            ? `${a.patients.last_name || ""} ${a.patients.first_name || ""}`.trim()
            : "Senza nome";
          return {
            id: String(a.id),
            patient_id: String(a.patient_id || ""),
            patient_name: patientName,
            amount: parseFloat(String(a.amount)) || 0,
            date: a.start_at,
            treatment_type: a.treatment_type || "Terapia",
            status: "not_paid" as const,
            price_type: a.price_type ?? null,
          };
        }),
      ]
        .filter((t) => !!t.date)
        .sort((x, y) => {
          const pn = x.patient_name.localeCompare(y.patient_name, "it");
          if (pn !== 0) return pn;
          return new Date(x.date).getTime() - new Date(y.date).getTime();
        });

      setReportTherapies(therapiesForPrint);

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

      // Calcolo Grafico
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

  function getDayDetails(dayIndex: number) {
    const dayItems: FinancialItem[] = [];
    
    rawData.forEach(item => {
      if (!item.date) return;
      
      const dt = new Date(item.date);
      const bucketIndex = getBucketIndex(dt, period);
      
      if (bucketIndex === dayIndex) {
        dayItems.push({ ...item, status: 'paid' });
      }
    });
    
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

  function handleBarClick(dayIndex: number) {
    setSelectedDay(dayIndex);
    const details = getDayDetails(dayIndex);
    setDayDetails(details);
  }

  function printUnpaidReport() {
    printReport(unpaidTherapiesAll, "Report Terapie Non Pagate");
  }

  function printPatientReport(patientName: string) {
    const patientTherapies = unpaidTherapiesAll.filter(t => t.patient_name === patientName);
    printReport(patientTherapies, `Report Terapie Non Pagate - ${patientName}`);
  }

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

  function printTotalReport() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const today = new Date();
    const formattedDate = today.toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const { from, to } = getRange(period, baseDate);
    const labelsRangeLabel =
      period === "day"
        ? from.toLocaleDateString("it-IT")
        : period === "week"
          ? `${from.toLocaleDateString("it-IT")} → ${to.toLocaleDateString("it-IT")}`
          : from.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

    const escapeHtml = (s: any) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    // Terapie svolte nel periodo selezionato
    const byPatient = reportTherapies.reduce<Record<string, AppointmentTherapy[]>>((acc, t) => {
      const key = (t.patient_name || "Senza nome").trim();
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {});

    const patientNames = Object.keys(byPatient).sort((a, b) => a.localeCompare(b, "it"));

    const therapiesByPatientHtml =
      patientNames.length === 0
        ? `<div style="margin-top: 2cm; font-size: 11pt; color: #555;">Nessuna terapia (appuntamento) trovata nel periodo selezionato.</div>`
        : `
          <div class="details">
            <h2>🧑‍⚕️ Terapie effettuate (per paziente)</h2>
            <div style="font-size: 10pt; color: #555; margin-bottom: 10px;">
              Periodo: <strong>${escapeHtml(labelsRangeLabel)}</strong>
            </div>
            ${patientNames
              .map((name) => {
                const list = (byPatient[name] || []).slice().sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
                const tot = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
                const paid = list.filter((x) => x.status === "done").reduce((s, x) => s + (Number(x.amount) || 0), 0);
                const unpaid = list.filter((x) => x.status === "not_paid").reduce((s, x) => s + (Number(x.amount) || 0), 0);

                return `
                  <div style="margin-top: 18px; padding-top: 12px; border-top: 1px solid #ddd;">
                    <div style="display:flex; justify-content: space-between; align-items: baseline;">
                      <div style="font-size: 13pt; font-weight: 800;">${escapeHtml(name)}</div>
                      <div style="font-size: 10pt; color: #555;">
                        Tot: <strong>${escapeHtml(currency.format(tot))}</strong> —
                        Incassato: <strong style="color:#16a34a;">${escapeHtml(currency.format(paid))}</strong> —
                        Non pagato: <strong style="color:#dc2626;">${escapeHtml(currency.format(unpaid))}</strong>
                      </div>
                    </div>

                    <table style="width:100%; border-collapse: collapse; margin-top: 10px; font-size: 10pt;">
                      <thead>
                        <tr>
                          <th style="text-align:left; border-bottom:1px solid #ccc; padding:6px;">Data</th>
                          <th style="text-align:left; border-bottom:1px solid #ccc; padding:6px;">Trattamento</th>
                          <th style="text-align:left; border-bottom:1px solid #ccc; padding:6px;">Stato</th>
                          <th style="text-align:right; border-bottom:1px solid #ccc; padding:6px;">Importo</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${list
                          .map((t) => {
                            const d = new Date(t.date);
                            const dateLabel = isNaN(d.getTime()) ? "" : d.toLocaleDateString("it-IT");
                            const stato = t.status === "done" ? "PAGATO" : "NON PAGATO";
                            const statoColor = t.status === "done" ? "#16a34a" : "#dc2626";
                            return `
                              <tr>
                                <td style="padding:6px; border-bottom:1px solid #eee;">${escapeHtml(dateLabel)}</td>
                                <td style="padding:6px; border-bottom:1px solid #eee;">${escapeHtml(t.treatment_type)}</td>
                                <td style="padding:6px; border-bottom:1px solid #eee; font-weight:700; color:${statoColor};">${escapeHtml(stato)}</td>
                                <td style="padding:6px; border-bottom:1px solid #eee; text-align:right;">${escapeHtml(currency.format(Number(t.amount) || 0))}</td>
                              </tr>
                            `;
                          })
                          .join("")}
                      </tbody>
                    </table>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;

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
          
          ${therapiesByPatientHtml}

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
  }

  useEffect(() => {
    loadData();
  }, [period, dateStr]);

  const formatDateLabel = (date: Date): string => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('it-IT', options);
  };

  const formatMonthKey = (monthKey: string): string => {
    const [y, m] = monthKey.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, 1);
    return dt.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
  };

  const uniquePatients = useMemo(() => {
    const patients = new Set(unpaidTherapiesAll.map(t => t.patient_name));
    return Array.from(patients).sort();
  }, [unpaidTherapiesAll]);

  const totalPaid = series.reduce((a, b) => a + b, 0);
  const totalUnpaid = unpaidSeries.reduce((a, b) => a + b, 0);
  const total = totalPaid + totalUnpaid;

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: COLORS.background,
      paddingBottom: 80
    }}>
      {/* Header Mobile */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: COLORS.card,
        borderBottom: `1px solid ${COLORS.border}`,
        padding: "12px 16px",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              style={{
                background: "none",
                border: "none",
                padding: 8,
                cursor: "pointer",
                color: COLORS.primary,
              }}
            >
              <Menu size={24} />
            </button>
            <div>
              <h1 style={{ 
                margin: 0, 
                fontSize: 18, 
                fontWeight: 900, 
                color: COLORS.primary 
              }}>
                Report Incassi
              </h1>
              <div style={{ 
                fontSize: 12, 
                color: COLORS.muted,
                marginTop: 2 
              }}>
                {formatDateLabel(baseDate)}
              </div>
            </div>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {showPrintOptions ? (
              <>
                <button
                  onClick={() => setShowPrintOptions(false)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 8,
                    cursor: "pointer",
                    color: COLORS.primary,
                  }}
                >
                  <X size={20} />
                </button>
                <button
                  onClick={printTotalReport}
                  style={{
                    background: COLORS.primary,
                    color: "white",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Totale
                </button>
                <button
                  onClick={printUnpaidReport}
                  style={{
                    background: COLORS.danger,
                    color: "white",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  Non Pagati
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowPrintOptions(true)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 8,
                  cursor: "pointer",
                  color: COLORS.primary,
                }}
              >
                <Download size={20} />
              </button>
            )}
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                background: "none",
                border: "none",
                padding: 8,
                cursor: "pointer",
                color: COLORS.primary,
              }}
            >
              <Filter size={24} />
            </button>
          </div>
        </div>

        {/* Menu laterale mobile */}
        {showMenu && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
          }} onClick={() => setShowMenu(false)}>
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: "80%",
              maxWidth: 300,
              background: COLORS.card,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }} onClick={e => e.stopPropagation()}>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20 
              }}>
                <h2 style={{ margin: 0, color: COLORS.primary }}>FisioHub</h2>
                <button 
                  onClick={() => setShowMenu(false)}
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  <X size={24} />
                </button>
              </div>
              
              <Link 
                href="/" 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 12,
                  color: COLORS.text,
                  textDecoration: "none",
                  padding: "12px 0",
                }}
                onClick={() => setShowMenu(false)}
              >
                <Home size={20} />
                Home
              </Link>
              
              <Link 
                href="/calendar" 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 12,
                  color: COLORS.text,
                  textDecoration: "none",
                  padding: "12px 0",
                }}
                onClick={() => setShowMenu(false)}
              >
                <Calendar size={20} />
                Calendario
              </Link>
              
              <Link 
                href="/reports" 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 12,
                  color: COLORS.primary,
                  textDecoration: "none",
                  padding: "12px 0",
                  fontWeight: "bold",
                }}
                onClick={() => setShowMenu(false)}
              >
                <BarChart3 size={20} />
                Report
              </Link>
              
              <Link 
                href="/patients" 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 12,
                  color: COLORS.text,
                  textDecoration: "none",
                  padding: "12px 0",
                }}
                onClick={() => setShowMenu(false)}
              >
                <Users size={20} />
                Pazienti
              </Link>
              
              {/* Statistiche veloci nel menu */}
              <div style={{ 
                marginTop: 20, 
                padding: 16, 
                background: COLORS.background,
                borderRadius: 8 
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  Statistiche Rapide
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: COLORS.muted }}>Incassato:</span>
                  <span style={{ color: COLORS.success, fontWeight: 700 }}>
                    {currency.format(statistics.total)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
                  <span style={{ color: COLORS.muted }}>Non pagato:</span>
                  <span style={{ color: COLORS.danger, fontWeight: 700 }}>
                    {currency.format(statistics.unpaidTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filtri mobile */}
        {showFilters && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
          }} onClick={() => setShowFilters(false)}>
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              background: COLORS.card,
              padding: 20,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: "80vh",
              overflowY: "auto",
            }} onClick={e => e.stopPropagation()}>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20 
              }}>
                <h3 style={{ margin: 0 }}>Filtri</h3>
                <button 
                  onClick={() => setShowFilters(false)}
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  <X size={24} />
                </button>
              </div>
              
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Periodo</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["day", "week", "month"].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p as Period)}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${period === p ? COLORS.primary : COLORS.border}`,
                        background: period === p ? COLORS.primary : COLORS.card,
                        color: period === p ? "white" : COLORS.text,
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {p === "day" ? "Giorno" : p === "week" ? "Settimana" : "Mese"}
                    </button>
                  ))}
                </div>
              </div>
              
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Data</div>
                <input
                  type={period === "month" ? "month" : "date"}
                  value={period === "month" ? dateStr.slice(0, 7) : dateStr}
                  onChange={(e) => {
                    if (period === "month") {
                      const v = e.target.value;
                      if (!v) return;
                      setDateStr(`${v}-01`);
                    } else {
                      setDateStr(e.target.value);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: 16,
                  }}
                />
              </div>
              
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={() => {
                    setDateStr(toISODate(new Date()));
                    setShowFilters(false);
                  }}
                  style={{
                    flex: 1,
                    padding: 14,
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.card,
                    color: COLORS.primary,
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  Oggi
                </button>
                
                <button
                  onClick={loadData}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: 14,
                    borderRadius: 8,
                    border: "none",
                    background: loading ? COLORS.muted : COLORS.primary,
                    color: "white",
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  {loading ? "Caricamento..." : "Applica"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation Mobile */}
      <div style={{
        position: "sticky",
        top: 65,
        zIndex: 90,
        background: COLORS.card,
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex",
        overflowX: "auto",
        padding: "8px 16px",
        gap: 4,
      }}>
        {[
          { key: "summary", label: "Riepilogo", icon: "📊" },
          { key: "graph", label: "Grafico", icon: "📈" },
          { key: "paid", label: "Pagati", icon: "💰" },
          { key: "unpaid", label: "Non Pagati", icon: "⚠️" },
          { key: "details", label: "Dettagli", icon: "📋" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: activeTab === tab.key ? COLORS.primary : "transparent",
              color: activeTab === tab.key ? "white" : COLORS.text,
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenuto principale */}
      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "50vh",
            color: COLORS.muted,
          }}>
            Caricamento dati...
          </div>
        ) : error ? (
          <div style={{
            background: "#fee2e2",
            border: `1px solid ${COLORS.danger}`,
            borderRadius: 12,
            padding: 16,
            color: COLORS.danger,
            margin: 16,
          }}>
            {error}
          </div>
        ) : (
          <>
            {/* Riepilogo */}
            {activeTab === "summary" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Statistiche veloci */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}>
                  <div style={{
                    background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Fatture Pagate</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.success }}>
                      {currency.format(
                        rawData.filter(d => d.source === 'invoice').reduce((sum, d) => sum + d.amount, 0)
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                      {statistics.invoiceCount} fatture
                    </div>
                  </div>
                  
                  <div style={{
                    background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Appuntamenti Pagati</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.accent }}>
                      {currency.format(
                        rawData.filter(d => d.source === 'appointment').reduce((sum, d) => sum + d.amount, 0)
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                      {statistics.appointmentCount} appuntamenti
                    </div>
                  </div>
                  
                  <div style={{
                    background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Fatture Non Pagate</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.danger }}>
                      {currency.format(
                        unpaidTherapies
                          .filter(t => t.treatment_type === 'Fattura')
                          .reduce((sum, t) => sum + t.amount, 0)
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                      {statistics.unpaidInvoiceCount} fatture
                    </div>
                  </div>
                  
                  <div style={{
                    background: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>App. Non Pagati</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.warning }}>
                      {currency.format(
                        unpaidTherapies
                          .filter(t => t.treatment_type !== 'Fattura')
                          .reduce((sum, t) => sum + t.amount, 0)
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                      {statistics.unpaidAppointmentCount} appuntamenti
                    </div>
                  </div>
                </div>

                {/* Totale generale */}
                <div style={{
                  background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                  borderRadius: 12,
                  padding: 20,
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.text, marginBottom: 12 }}>
                    🧮 Totale Generale
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 1000, color: COLORS.primary }}>
                    {currency.format(statistics.total + statistics.unpaidTotal)}
                  </div>
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between",
                    fontSize: 12,
                    color: COLORS.muted,
                    marginTop: 8,
                  }}>
                    <span>Pagati: {currency.format(statistics.total)}</span>
                    <span>Non pagati: {currency.format(statistics.unpaidTotal)}</span>
                  </div>
                </div>

                {/* Arretrati */}
                {arrearsMonths.length > 0 && (
                  <div style={{
                    background: COLORS.card,
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.text, marginBottom: 8 }}>
                      ⏰ Arretrati (mesi precedenti)
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
                      {arrearsMonths.slice(0, 3).map((m, idx) => (
                        <div key={m.month} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>{formatMonthKey(m.month)}:</span>
                          <span>{m.count} terapie ({currency.format(m.total)})</span>
                        </div>
                      ))}
                      {arrearsMonths.length > 3 && (
                        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                          +{arrearsMonths.length - 3} altri mesi...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Pulsanti opzioni di stampa */}
                <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
                  <button
                    onClick={printTotalReport}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: `1px solid ${COLORS.primary}`,
                      background: COLORS.primary,
                      color: "white",
                      fontSize: 14,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <Download size={18} />
                    Report Totale
                  </button>
                  
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowUnpaidDropdown(!showUnpaidDropdown)}
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.danger}`,
                        background: COLORS.danger,
                        color: "white",
                        fontSize: 14,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <Download size={18} />
                      Report Non Pagati
                      <span style={{ fontSize: 12, marginLeft: 4 }}>
                        {showUnpaidDropdown ? '▲' : '▼'}
                      </span>
                    </button>

                    {showUnpaidDropdown && (
                      <div style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        marginTop: 8,
                        background: COLORS.card,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 12,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        zIndex: 100,
                      }}>
                        <div style={{
                          padding: "12px 16px",
                          fontSize: 13,
                          color: COLORS.muted,
                          borderBottom: `1px solid ${COLORS.border}`,
                          fontWeight: 700,
                        }}>
                          Seleziona opzione:
                        </div>
                        
                        <button
                          onClick={() => {
                            printUnpaidReport();
                            setShowUnpaidDropdown(false);
                          }}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            background: "none",
                            border: "none",
                            textAlign: "left",
                            fontSize: 14,
                            color: COLORS.text,
                            cursor: "pointer",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            borderBottom: `1px solid ${COLORS.border}`,
                          }}
                        >
                          📋 Tutti i non pagati
                        </button>
                        
                        <div style={{
                          padding: "8px 16px",
                          fontSize: 12,
                          color: COLORS.muted,
                          borderBottom: `1px solid ${COLORS.border}`,
                          background: COLORS.background,
                        }}>
                          Per paziente:
                        </div>
                        
                        {uniquePatients.slice(0, 5).map(patient => (
                          <button
                            key={patient}
                            onClick={() => {
                              printPatientReport(patient);
                              setShowUnpaidDropdown(false);
                            }}
                            style={{
                              width: "100%",
                              padding: "10px 16px",
                              background: "none",
                              border: "none",
                              textAlign: "left",
                              fontSize: 13,
                              color: COLORS.text,
                              cursor: "pointer",
                              fontWeight: 500,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              borderBottom: `1px solid ${COLORS.border}`,
                            }}
                          >
                            👤 {patient}
                          </button>
                        ))}
                        
                        {uniquePatients.length > 5 && (
                          <div style={{
                            padding: "10px 16px",
                            fontSize: 12,
                            color: COLORS.muted,
                            textAlign: "center",
                          }}>
                            ...e altri {uniquePatients.length - 5} pazienti
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Grafico */}
            {activeTab === "graph" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{
                  background: COLORS.card,
                  borderRadius: 12,
                  padding: 16,
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.text, marginBottom: 12 }}>
                    📊 Distribuzione Incassi
                  </div>
                  
                  {series.length > 0 || unpaidSeries.length > 0 ? (
                    <MobileBarChart 
                      labels={labels} 
                      values={series}
                      unpaidValues={unpaidSeries}
                      period={period} 
                      onBarClick={handleBarClick}
                      selectedDay={selectedDay}
                    />
                  ) : (
                    <div style={{ 
                      textAlign: "center", 
                      padding: 40, 
                      color: COLORS.muted,
                      fontSize: 14 
                    }}>
                      Nessun dato disponibile per il grafico
                    </div>
                  )}
                  
                  {selectedDay !== null && (
                    <div style={{
                      marginTop: 16,
                      padding: 16,
                      background: "#f8fafc",
                      borderRadius: 8,
                      border: `1px solid ${COLORS.border}`,
                    }}>
                      <div style={{ 
                        display: "flex", 
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 12 
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.text }}>
                          📅 {labels[selectedDay]}
                        </div>
                        <button
                          onClick={() => {
                            setSelectedDay(null);
                            setDayDetails([]);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            fontSize: 18,
                            color: COLORS.muted,
                            cursor: "pointer",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      
                      {dayDetails.length === 0 ? (
                        <div style={{ textAlign: "center", color: COLORS.muted, fontSize: 13 }}>
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
                                  borderRadius: 6,
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
                                  alignItems: "center",
                                  marginBottom: 4 
                                }}>
                                  <div style={{ fontSize: 15, fontWeight: 900, color: COLORS.text }}>
                                    {currency.format(item.amount)}
                                  </div>
                                  <div style={{
                                    fontSize: 10,
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
                                    {isUnpaid ? 'NON PAGATO' : item.source === 'invoice' ? 'FATTURA' : 'APPUNT.'}
                                  </div>
                                </div>
                                
                                {item.patient_name && (
                                  <div style={{ fontSize: 12, color: COLORS.text, marginTop: 4 }}>
                                    👤 {item.patient_name}
                                  </div>
                                )}
                                
                                <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                                  {new Date(item.date).toLocaleTimeString('it-IT', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Transazioni Pagate */}
            {activeTab === "paid" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{
                  background: COLORS.card,
                  borderRadius: 12,
                  padding: 16,
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.text, marginBottom: 12 }}>
                    💰 Transazioni Pagate ({rawData.length})
                  </div>
                  
                  {rawData.length === 0 ? (
                    <div style={{ 
                      textAlign: "center", 
                      padding: 40, 
                      color: COLORS.muted,
                      fontSize: 14 
                    }}>
                      Nessuna transazione pagata
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rawData.slice(0, expandedCard === "paid" ? undefined : 10).map((item, index) => (
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
                            alignItems: "center",
                            marginBottom: 4 
                          }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: COLORS.text }}>
                              {currency.format(item.amount)}
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
                              {item.source === 'invoice' ? 'FATTURA' : 'APPUNT.'}
                            </div>
                          </div>
                          
                          {item.patient_name && (
                            <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 2 }}>
                              👤 {item.patient_name}
                            </div>
                          )}
                          
                          <div style={{ fontSize: 11, color: COLORS.muted }}>
                            {new Date(item.date).toLocaleDateString('it-IT', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                          
                          {item.description && (
                            <div style={{ fontSize: 11, color: COLORS.text, marginTop: 2 }}>
                              {item.description}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {rawData.length > 10 && (
                        <button
                          onClick={() => setExpandedCard(expandedCard === "paid" ? null : "paid")}
                          style={{
                            padding: 12,
                            background: "none",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 8,
                            color: COLORS.primary,
                            fontSize: 14,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                          }}
                        >
                          {expandedCard === "paid" ? (
                            <>
                              <ChevronUp size={16} />
                              Mostra meno
                            </>
                          ) : (
                            <>
                              <ChevronDown size={16} />
                              Mostra tutte ({rawData.length})
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Terapie Non Pagate */}
            {activeTab === "unpaid" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{
                  background: COLORS.card,
                  borderRadius: 12,
                  padding: 16,
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.text, marginBottom: 12 }}>
                    ⚠️ Terapie Non Pagate ({unpaidTherapiesAll.length})
                  </div>
                  
                  {unpaidTherapiesAll.length === 0 ? (
                    <div style={{ 
                      textAlign: "center", 
                      padding: 40, 
                      color: COLORS.success,
                      fontSize: 14 
                    }}>
                      🎉 Tutti i pagamenti sono stati saldati!
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {unpaidTherapiesAll.slice(0, expandedCard === "unpaid" ? undefined : 10).map((therapy, index) => (
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
                            alignItems: "center",
                            marginBottom: 4 
                          }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: COLORS.text }}>
                              {currency.format(therapy.amount)}
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
                          
                          <div style={{ fontSize: 12, color: COLORS.text, marginBottom: 2 }}>
                            👤 {therapy.patient_name}
                          </div>
                          
                          <div style={{ fontSize: 11, color: COLORS.muted }}>
                            {new Date(therapy.date).toLocaleDateString('it-IT')} • {therapy.treatment_type}
                          </div>
                          
                          <div style={{ fontSize: 10, color: COLORS.warning, fontWeight: 700, marginTop: 2 }}>
                            ⏰ {therapy.days_since} giorni fa
                          </div>
                        </div>
                      ))}
                      
                      {unpaidTherapiesAll.length > 10 && (
                        <button
                          onClick={() => setExpandedCard(expandedCard === "unpaid" ? null : "unpaid")}
                          style={{
                            padding: 12,
                            background: "none",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 8,
                            color: COLORS.primary,
                            fontSize: 14,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                          }}
                        >
                          {expandedCard === "unpaid" ? (
                            <>
                              <ChevronUp size={16} />
                              Mostra meno
                            </>
                          ) : (
                            <>
                              <ChevronDown size={16} />
                              Mostra tutte ({unpaidTherapiesAll.length})
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dettagli statistiche */}
            {activeTab === "details" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{
                  background: COLORS.card,
                  borderRadius: 12,
                  padding: 16,
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.text, marginBottom: 12 }}>
                    📊 Statistiche Dettagliate
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, color: COLORS.text }}>Importo Medio</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.primary }}>
                        {currency.format(statistics.averageAmount)}
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, color: COLORS.text }}>Importo Massimo</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.success }}>
                        {currency.format(statistics.maxAmount)}
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, color: COLORS.text }}>Importo Minimo</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.warning }}>
                        {currency.format(statistics.minAmount)}
                      </span>
                    </div>
                    
                    <div style={{ 
                      height: 1, 
                      background: COLORS.border,
                      margin: "8px 0" 
                    }} />
                    
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, color: COLORS.text }}>Totale Transazioni</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent }}>
                        {rawData.length}
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, color: COLORS.text }}>Fatture Totali</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.primary }}>
                        {statistics.invoiceCount + statistics.unpaidInvoiceCount}
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, color: COLORS.text }}>Appuntamenti Totali</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.accent }}>
                        {statistics.appointmentCount + statistics.unpaidAppointmentCount}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div style={{
                  background: COLORS.card,
                  borderRadius: 12,
                  padding: 16,
                  border: `1px solid ${COLORS.border}`,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.text, marginBottom: 12 }}>
                    📅 Periodo Selezionato
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between",
                      fontSize: 12,
                    }}>
                      <span style={{ color: COLORS.muted }}>Inizio:</span>
                      <span style={{ color: COLORS.text }}>
                        {formatDateLabel(getRange(period, baseDate).from)}
                      </span>
                    </div>
                    
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between",
                      fontSize: 12,
                    }}>
                      <span style={{ color: COLORS.muted }}>Fine:</span>
                      <span style={{ color: COLORS.text }}>
                        {formatDateLabel(getRange(period, baseDate).to)}
                      </span>
                    </div>
                    
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between",
                      fontSize: 12,
                    }}>
                      <span style={{ color: COLORS.muted }}>Giorni:</span>
                      <span style={{ color: COLORS.text }}>
                        {Math.ceil((getRange(period, baseDate).to.getTime() - 
                          getRange(period, baseDate).from.getTime()) / (1000 * 60 * 60 * 24)) + 1}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Tab Bar Mobile */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: COLORS.card,
        borderTop: `1px solid ${COLORS.border}`,
        display: "flex",
        justifyContent: "space-around",
        padding: "12px 0",
        zIndex: 50,
      }}>
        <Link href="/" style={{ textDecoration: "none", color: COLORS.muted, textAlign: "center" }}>
          <div style={{ fontSize: 24 }}>🏠</div>
          <div style={{ fontSize: 10 }}>Home</div>
        </Link>
        
        <Link href="/calendar" style={{ textDecoration: "none", color: COLORS.muted, textAlign: "center" }}>
          <div style={{ fontSize: 24 }}>📅</div>
          <div style={{ fontSize: 10 }}>Calendario</div>
        </Link>
        
        <div style={{ textDecoration: "none", color: COLORS.primary, textAlign: "center" }}>
          <div style={{ fontSize: 24 }}>📊</div>
          <div style={{ fontSize: 10, fontWeight: "bold" }}>Report</div>
        </div>
        
        <Link href="/patients" style={{ textDecoration: "none", color: COLORS.muted, textAlign: "center" }}>
          <div style={{ fontSize: 24 }}>👥</div>
          <div style={{ fontSize: 10 }}>Pazienti</div>
        </Link>
      </div>
    </div>
  );
}

function MobileBarChart({ 
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
  const chartHeight = 200;
  const barWidth = period === 'day' ? 20 : period === 'week' ? 30 : 10;
  const containerWidth = period === 'day' ? labels.length * (barWidth + 4) : 
                        period === 'week' ? labels.length * (barWidth + 8) : 
                        labels.length * (barWidth + 2);

  const hasData = values.some(v => v > 0) || unpaidValues.some(v => v > 0);

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
        📊 Nessun dato disponibile
      </div>
    );
  }

  return (
    <div style={{ 
      width: "100%", 
      overflowX: "auto",
      WebkitOverflowScrolling: "touch",
    }}>
      <div
        style={{
          minWidth: containerWidth,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          gap: period === 'month' ? 2 : period === 'week' ? 8 : 4,
          height: chartHeight,
          borderBottom: `1px solid ${COLORS.border}`,
          paddingBottom: 30,
          position: "relative",
        }}
      >
        {values.map((v, i) => {
          const label = labels[i];
          if (!label) return null;

          const unpaid = unpaidValues[i] || 0;
          const totalValue = v + unpaid;
          
          const paidHeight = (v / max) * (chartHeight - 40);
          const unpaidHeight = (unpaid / max) * (chartHeight - 40);
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
                minWidth: barWidth,
                position: "relative",
              }}
              onClick={() => {
                if (totalValue > 0) {
                  onBarClick(i);
                }
              }}
            >
              {/* Barra Non Pagata */}
              {unpaid > 0 && (
                <div
                  style={{
                    width: "70%",
                    height: unpaidHeight,
                    background: `linear-gradient(to top, rgba(220, 38, 38, 0.8), rgba(220, 38, 38, 0.6))`,
                    borderRadius: "3px 3px 0 0",
                    transition: "all 0.2s",
                    cursor: totalValue > 0 ? "pointer" : "default",
                    borderWidth: "1px 1px 0 1px",
                    borderStyle: "solid",
                    borderColor: isActive ? `rgba(220, 38, 38, 0.8)` : COLORS.border,
                    minHeight: unpaid > 0 ? 2 : 0,
                  }}
                />
              )}

              {/* Barra Pagata */}
              <div
                style={{
                  width: "70%",
                  height: paidHeight,
                  background: isActive 
                    ? `linear-gradient(to top, ${COLORS.secondary}, ${COLORS.primary})`
                    : "rgba(226, 232, 240, 0.3)",
                  borderRadius: unpaid > 0 ? "0 0 3px 3px" : "3px 3px 0 0",
                  transition: "all 0.2s",
                  cursor: totalValue > 0 ? "pointer" : "default",
                  borderWidth: unpaid > 0 ? "0 1px 1px 1px" : "1px",
                  borderStyle: "solid",
                  borderColor: isActive 
                    ? isSelected 
                      ? COLORS.secondary
                      : `${COLORS.secondary}80`
                    : COLORS.border,
                  minHeight: v > 0 ? 2 : 0,
                  transform: isSelected ? "scale(1.05)" : "scale(1)",
                }}
              />
              
              {/* Etichetta */}
              <div style={{ 
                marginTop: 8, 
                fontSize: period === 'month' ? 9 : 10, 
                color: isSelected ? COLORS.primary : (isActive ? COLORS.text : COLORS.muted), 
                fontWeight: isSelected ? 900 : (isActive ? 700 : 500),
                textAlign: "center",
                height: 30,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                padding: "0 1px",
                writingMode: period === 'month' ? "vertical-rl" : "horizontal-tb",
                transform: period === 'month' ? "rotate(180deg)" : "none",
                whiteSpace: period === 'month' ? "nowrap" : "normal",
              }}>
                {period === 'month' && label.length > 2 
                  ? label 
                  : period === 'day' 
                    ? label.substring(0, 2)
                    : label.substring(0, 3)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: 16,
        marginTop: 16,
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
      </div>
    </div>
  );
}