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

function getRange(period: Period, base: Date) {
  if (period === "day") {
    const from = new Date(base);
    from.setHours(0, 0, 0, 0);
    const to = new Date(base);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  
  if (period === "week") {
    const from = new Date(base);
    const day = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  
  const from = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

const currency = new Intl.NumberFormat("it-IT", { 
  style: "currency", 
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

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
  const [rawData, setRawData] = useState<FinancialItem[]>([]);
  const [unpaidTherapies, setUnpaidTherapies] = useState<UnpaidTherapy[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Mobile specific states
  const [activeTab, setActiveTab] = useState<"summary" | "paid" | "unpaid" | "details">("summary");
  const [showMenu, setShowMenu] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const baseDate = useMemo(() => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [dateStr]);

  async function loadData() {
    setLoading(true);
    setError(null);
    
    try {
      const { from, to } = getRange(period, baseDate);
      const fromStr = from.toISOString();
      const toStr = to.toISOString();

      // 1. Fetch FATTURE PAGATE
      const { data: paidInvoices } = await supabase
        .from("invoices")
        .select("id, amount, paid_at, status, patient_id")
        .eq("status", "paid")
        .gte("paid_at", fromStr)
        .lte("paid_at", toStr);

      // 2. Fetch APPUNTAMENTI PAGATI
      const { data: paidAppointments } = await supabase
        .from("appointments")
        .select("id, amount, start_at, status, treatment_type, price_type, patient_id")
        .eq("status", "done")
        .gte("amount", 0.01)
        .gte("start_at", fromStr)
        .lte("start_at", toStr);

      // 3. Fetch FATTURE NON PAGATE
      const { data: unpaidInvoices } = await supabase
        .from("invoices")
        .select("id, amount, paid_at, created_at, status, patient_id")
        .eq("status", "not_paid");

      // 4. Fetch APPUNTAMENTI NON PAGATI
      const { data: unpaidAppointments } = await supabase
        .from("appointments")
        .select("id, amount, start_at, status, treatment_type, price_type, patient_id")
        .eq("status", "not_paid");

      // Processa i dati (simplificato per mobile)
      const invoices: FinancialItem[] = (paidInvoices || []).map((i: any) => ({
        amount: parseFloat(String(i.amount)) || 0,
        date: i.paid_at,
        source: 'invoice' as const,
        description: `Fattura #${i.id}`,
        status: 'paid'
      })).filter(item => item.amount > 0);

      const appointments: FinancialItem[] = (paidAppointments || []).map((a: any) => ({
        amount: parseFloat(String(a.amount)) || 0,
        date: a.start_at,
        source: 'appointment' as const,
        description: `Appuntamento - ${a.treatment_type || 'Seduta'}`,
        status: 'paid'
      })).filter(item => item.amount > 0);

      const allData: FinancialItem[] = [...invoices, ...appointments];
      setRawData(allData);

      // Processa terapie non pagate
      const today = new Date();
      const unpaidTherapiesList: UnpaidTherapy[] = [];

      // Fatture non pagate
      (unpaidInvoices || []).forEach((inv: any) => {
        const amount = parseFloat(String(inv.amount)) || 0;
        if (amount > 0) {
          const invoiceDate = new Date(inv.paid_at || inv.created_at);
          const daysSince = Math.floor((today.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
          
          unpaidTherapiesList.push({
            id: inv.id,
            patient_id: inv.patient_id,
            patient_name: 'Paziente',
            amount,
            date: inv.paid_at || inv.created_at,
            treatment_type: 'Fattura',
            days_since: daysSince,
            status: 'not_paid'
          });
        }
      });

      // Appuntamenti non pagati
      (unpaidAppointments || []).forEach((app: any) => {
        const amount = parseFloat(String(app.amount)) || 0;
        if (amount > 0) {
          const appDate = new Date(app.start_at);
          const daysSince = Math.floor((today.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24));
          
          unpaidTherapiesList.push({
            id: app.id,
            patient_id: app.patient_id,
            patient_name: 'Paziente',
            amount,
            date: app.start_at,
            treatment_type: app.treatment_type || 'Seduta',
            days_since: daysSince,
            status: app.status
          });
        }
      });

      setUnpaidTherapies(unpaidTherapiesList);

      // Calcolo statistiche
      const amounts = allData.map(item => item.amount).filter(amount => amount > 0);
      const total = amounts.reduce((sum, amount) => sum + amount, 0);
      const invoiceCount = invoices.length;
      const appointmentCount = appointments.length;
      const averageAmount = amounts.length > 0 ? total / amounts.length : 0;
      const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
      const minAmount = amounts.length > 0 ? Math.min(...amounts) : 0;

      const unpaidTotal = unpaidTherapiesList.reduce((sum, item) => sum + item.amount, 0);
      const unpaidCount = unpaidTherapiesList.length;
      const unpaidInvoiceCount = (unpaidInvoices || []).length;
      const unpaidAppointmentCount = (unpaidAppointments || []).length;

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

    } catch (e: any) {
      console.error("Errore nel caricamento dati:", e);
      setError(e.message || "Errore nel caricamento dei dati.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [period, dateStr]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('it-IT', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Funzioni per stampa (semplificate per mobile)
  const printSummary = () => {
    const totalPaid = statistics.total;
    const totalUnpaid = statistics.unpaidTotal;
    const grandTotal = totalPaid + totalUnpaid;
    
    alert(`REPORT RIEPILOGO\n\n` +
          `Incassato: ${currency.format(totalPaid)}\n` +
          `Non Pagato: ${currency.format(totalUnpaid)}\n` +
          `Totale: ${currency.format(grandTotal)}\n\n` +
          `Fatture: ${statistics.invoiceCount}\n` +
          `Appuntamenti: ${statistics.appointmentCount}`);
  };

  const printUnpaidReport = () => {
    const uniquePatients = new Set(unpaidTherapies.map(t => t.patient_name));
    alert(`REPORT NON PAGATI\n\n` +
          `Totale terapie: ${unpaidTherapies.length}\n` +
          `Importo totale: ${currency.format(statistics.unpaidTotal)}\n` +
          `Pazienti: ${uniquePatients.size}`);
  };

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: COLORS.background,
      paddingBottom: 80 // Spazio per il tab bar
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
                {formatDate(baseDate)}
              </div>
            </div>
          </div>
          
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
                <button onClick={() => setShowMenu(false)}>
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
            }} onClick={e => e.stopPropagation()}>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20 
              }}>
                <h3 style={{ margin: 0 }}>Filtri</h3>
                <button onClick={() => setShowFilters(false)}>
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
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: 16,
                  }}
                />
              </div>
              
              <button
                onClick={() => {
                  setDateStr(toISODate(new Date()));
                  setShowFilters(false);
                }}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.card,
                  color: COLORS.primary,
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                Imposta oggi
              </button>
              
              <button
                onClick={loadData}
                style={{
                  width: "100%",
                  padding: 14,
                  borderRadius: 8,
                  border: "none",
                  background: COLORS.primary,
                  color: "white",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                {loading ? "Caricamento..." : "Applica filtri"}
              </button>
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
                    background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Incassato</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.success }}>
                      {currency.format(statistics.total)}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                      {statistics.invoiceCount + statistics.appointmentCount} transazioni
                    </div>
                  </div>
                  
                  <div style={{
                    background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Non Pagato</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.danger }}>
                      {currency.format(statistics.unpaidTotal)}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                      {statistics.unpaidCount} terapie
                    </div>
                  </div>
                  
                  <div style={{
                    background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Fatture</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.primary }}>
                      {statistics.invoiceCount}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                      {currency.format(statistics.invoiceCount > 0 ? 
                        rawData.filter(d => d.source === 'invoice').reduce((sum, d) => sum + d.amount, 0) : 0)}
                    </div>
                  </div>
                  
                  <div style={{
                    background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
                    borderRadius: 12,
                    padding: 16,
                    border: `1px solid ${COLORS.border}`,
                  }}>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Appuntamenti</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: COLORS.accent }}>
                      {statistics.appointmentCount}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>
                      {currency.format(statistics.appointmentCount > 0 ? 
                        rawData.filter(d => d.source === 'appointment').reduce((sum, d) => sum + d.amount, 0) : 0)}
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

                {/* Pulsanti azioni rapide */}
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={printSummary}
                    style={{
                      flex: 1,
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
                  
                  <button
                    onClick={printUnpaidReport}
                    style={{
                      flex: 1,
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
                    Non Pagati
                  </button>
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
                      {rawData.slice(0, expandedCard === "paid" ? undefined : 5).map((item, index) => (
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
                              {item.source === 'invoice' ? 'FATTURA' : 'APPUNTAMENTO'}
                            </div>
                          </div>
                          
                          <div style={{ 
                            fontSize: 12, 
                            color: COLORS.muted,
                            marginBottom: 4 
                          }}>
                            {new Date(item.date).toLocaleDateString('it-IT', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                          
                          {item.description && (
                            <div style={{ fontSize: 11, color: COLORS.text }}>
                              {item.description}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {rawData.length > 5 && (
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
                    ⚠️ Terapie Non Pagate ({unpaidTherapies.length})
                  </div>
                  
                  {unpaidTherapies.length === 0 ? (
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
                      {unpaidTherapies.slice(0, expandedCard === "unpaid" ? undefined : 5).map((therapy, index) => (
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
                          
                          <div style={{ 
                            fontSize: 12, 
                            color: COLORS.text,
                            marginBottom: 2 
                          }}>
                            {therapy.patient_name}
                          </div>
                          
                          <div style={{ 
                            fontSize: 11, 
                            color: COLORS.muted,
                            marginBottom: 4 
                          }}>
                            {new Date(therapy.date).toLocaleDateString('it-IT')} • {therapy.treatment_type}
                          </div>
                          
                          <div style={{ 
                            fontSize: 10, 
                            color: COLORS.warning,
                            fontWeight: 700 
                          }}>
                            ⏰ {therapy.days_since} giorni fa
                          </div>
                        </div>
                      ))}
                      
                      {unpaidTherapies.length > 5 && (
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
                              Mostra tutte ({unpaidTherapies.length})
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
                      <span style={{ fontSize: 14, color: COLORS.text }}>Fatture Non Pagate</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.danger }}>
                        {statistics.unpaidInvoiceCount}
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, color: COLORS.text }}>Appuntamenti Non Pagati</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.danger }}>
                        {statistics.unpaidAppointmentCount}
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
                        {formatDate(getRange(period, baseDate).from)}
                      </span>
                    </div>
                    
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between",
                      fontSize: 12,
                    }}>
                      <span style={{ color: COLORS.muted }}>Fine:</span>
                      <span style={{ color: COLORS.text }}>
                        {formatDate(getRange(period, baseDate).to)}
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

      {/* Tab Bar Mobile (solo se necessario) */}
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