"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../src/lib/supabaseClient";
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
};

type Statistic = {
  total: number;
  invoiceCount: number;
  appointmentCount: number;
  averageAmount: number;
  maxAmount: number;
  minAmount: number;
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
    minAmount: 0
  });
  const [series, setSeries] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<FinancialItem[]>([]);

  const baseDate = useMemo(() => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [dateStr]);

  const labels = useMemo(() => makeLabels(period, baseDate), [period, baseDate]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getRange(period, baseDate);
      const fromStr = from.toISOString();
      const toStr = to.toISOString();

      console.log(`Caricamento dati da ${fromStr} a ${toStr}`);

      // 1. Fetch FATTURE (Invoices) - CORRETTO: Join con tabella patients
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        // Qui richiediamo i dati dalla tabella collegata 'patients'
        .select("id, amount, paid_at, status, patients (first_name, last_name)")
        .eq("status", "paid")
        .gte("paid_at", fromStr)
        .lte("paid_at", toStr)
        .order("paid_at", { ascending: true });

      if (invoicesError) {
        console.error("Errore nel caricamento fatture:", invoicesError);
        throw invoicesError;
      }

      // 2. Fetch APPUNTAMENTI (Appointments)
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from("appointments")
        .select(`
          id,
          amount,
          start_at,
          status,
          treatment_type,
          price_type,
          patients (first_name, last_name)
        `)
        .eq("status", "done")
        .gt("amount", 0)
        .gte("start_at", fromStr)
        .lte("start_at", toStr)
        .order("start_at", { ascending: true });

      if (appointmentsError) {
        console.error("Errore nel caricamento appuntamenti:", appointmentsError);
        // Non blocchiamo se ci sono errori solo sugli appuntamenti
      }

      console.log("Fatture trovate:", invoicesData?.length || 0);
      console.log("Appuntamenti trovati:", appointmentsData?.length || 0);

      // Processiamo FATTURE - CORRETTO: Estrazione nome paziente
      const invoices: FinancialItem[] = (invoicesData || []).map((i: any) => {
        const amount = parseFloat(String(i.amount)) || 0;
        
        // Costruzione nome paziente dai dati collegati
        const patientName = i.patients 
          ? `${i.patients.last_name || ''} ${i.patients.first_name || ''}`.trim()
          : undefined;

        return {
          amount,
          date: i.paid_at,
          source: 'invoice' as const,
          description: `Fattura #${i.id}`,
          patient_name: patientName
        };
      }).filter(item => item.amount > 0);

      // Processiamo APPUNTAMENTI
      const appointments: FinancialItem[] = (appointmentsData || []).map((a: any) => {
        const amount = parseFloat(String(a.amount)) || 0;
        const patientName = a.patients 
          ? `${a.patients.last_name || ''} ${a.patients.first_name || ''}`.trim()
          : undefined;
        return {
          amount,
          date: a.start_at,
          source: 'appointment' as const,
          description: `Appuntamento - ${a.treatment_type || 'Seduta'}`,
          patient_name: patientName
        };
      }).filter(item => item.amount > 0);

      // Uniamo tutto
      const allData: FinancialItem[] = [...invoices, ...appointments];
      setRawData(allData);

      console.log("Dati totali:", allData.length, allData);

      // Calcolo statistiche
      const amounts = allData.map(item => item.amount).filter(amount => amount > 0);
      const total = amounts.reduce((sum, amount) => sum + amount, 0);
      const invoiceCount = invoices.length;
      const appointmentCount = appointments.length;
      const averageAmount = amounts.length > 0 ? total / amounts.length : 0;
      const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
      const minAmount = amounts.length > 0 ? Math.min(...amounts) : 0;

      setStatistics({
        total,
        invoiceCount,
        appointmentCount,
        averageAmount,
        maxAmount,
        minAmount
      });

      // Calcolo Grafico
      const buckets = new Array(labels.length).fill(0);

      for (const item of allData) {
        if (!item.date) continue;
        
        const dt = new Date(item.date);
        
        if (period === "day") {
          const h = dt.getHours();
          if (h >= 0 && h < 24) {
            buckets[h] += item.amount;
          }
        } else if (period === "week") {
          const idx = dt.getDay(); // Domenica = 0, Lunedì = 1, etc.
          if (idx >= 0 && idx < 7) {
            buckets[idx] += item.amount;
          }
        } else {
          // month
          const idx = dt.getDate() - 1; // 1 → 0, 31 → 30
          if (idx >= 0 && idx < buckets.length) {
            buckets[idx] += item.amount;
          }
        }
      }

      console.log("Buckets calcolati:", buckets);
      setSeries(buckets);

    } catch (e: any) {
      console.error("Errore nel caricamento dati:", e);
      setError(e.message || "Errore nel caricamento dei dati. Controlla la console per maggiori dettagli.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
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

  return (
    <div style={{ minHeight: "100vh", background: COLORS.background }}>
      <header
        style={{
          background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
          color: "white",
          padding: "20px 24px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>📈 Report Incassi</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link
              href="/calendar"
              style={{
                background: "rgba(255,255,255,0.2)",
                color: "white",
                padding: "8px 14px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid rgba(255,255,255,0.3)",
              }}
            >
              <span>📅</span>
              Calendario
            </Link>
            <Link
              href="/"
              style={{
                background: "rgba(255,255,255,0.15)",
                color: "white",
                padding: "8px 14px",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              ← Torna alla Home
            </Link>
          </div>
        </div>
      </header>

      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
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

        {/* Statistiche */}
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
                Statistiche Incassi
              </h2>
              <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 4 }}>
                {period === "day" ? "Giornaliero" : period === "week" ? "Settimanale" : "Mensile"}
              </div>
            </div>
            
            {error && (
              <div style={{ 
                padding: "8px 12px", 
                background: "rgba(220,38,38,0.1)", 
                borderRadius: 8,
                border: `1px solid rgba(220,38,38,0.3)`,
                color: COLORS.danger, 
                fontWeight: "bold",
                fontSize: 13 
              }}>
                ⚠️ {error}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {/* Totale Incassi */}
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
                  €
                </div>
                <div>
                  <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                    Totale Incassato
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 1000, color: COLORS.accent, marginTop: 4 }}>
                    {loading ? "..." : currency.format(statistics.total)}
                  </div>
                </div>
              </div>
            </div>

            {/* Numero Transazioni */}
            <div style={{
              background: "linear-gradient(135deg, #fef7ff 0%, #f5f3ff 100%)",
              borderRadius: 12,
              padding: 20,
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: COLORS.primary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 18,
                }}>
                  📊
                </div>
                <div>
                  <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                    Transazioni
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 1000, color: COLORS.primary, marginTop: 4 }}>
                    {loading ? "..." : rawData.length}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                    {statistics.invoiceCount} fatture • {statistics.appointmentCount} appuntamenti
                  </div>
                </div>
              </div>
            </div>

            {/* Media per Transazione */}
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
                  📈
                </div>
                <div>
                  <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                    Media per Transazione
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 1000, color: COLORS.success, marginTop: 4 }}>
                    {loading ? "..." : currency.format(statistics.averageAmount)}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                    Min: {currency.format(statistics.minAmount)} • Max: {currency.format(statistics.maxAmount)}
                  </div>
                </div>
              </div>
            </div>

            {/* Dettaglio Fonti */}
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
                  🔍
                </div>
                <div>
                  <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
                    Dettaglio Fonti
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.warning, marginTop: 4 }}>
                    {statistics.invoiceCount > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 12 }}>📄</span>
                        Fatture: {currency.format(
                          rawData
                            .filter(item => item.source === 'invoice')
                            .reduce((sum, item) => sum + item.amount, 0)
                        )}
                      </div>
                    )}
                    {statistics.appointmentCount > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12 }}>📅</span>
                        Appuntamenti: {currency.format(
                          rawData
                            .filter(item => item.source === 'appointment')
                            .reduce((sum, item) => sum + item.amount, 0)
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Grafico e Dettagli */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24 }}>
          {/* Grafico */}
          <div
            style={{
              background: COLORS.card,
              borderRadius: 16,
              padding: 20,
              border: `1px solid ${COLORS.border}`,
              boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
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
                  Distribuzione Incassi
                </h3>
                <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
                  {period === "day" ? "Per ore del giorno" : 
                   period === "week" ? "Per giorni della settimana" : 
                   "Per giorni del mese"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>
                Totale: {currency.format(series.reduce((a, b) => a + b, 0))}
              </div>
            </div>

            {series.length > 0 ? (
              <EnhancedBarChart labels={labels} values={series} period={period} />
            ) : (
              <div style={{ 
                height: 300, 
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

          {/* Lista Transazioni */}
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
                📋 Transazioni
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
                  Nessuna transazione trovata
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
                        border: `1px solid ${
                          item.source === 'invoice' 
                            ? "rgba(37, 99, 235, 0.2)" 
                            : "rgba(13, 148, 136, 0.2)"
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
        </div>

        {/* Debug Info (solo in sviluppo) */}
        {process.env.NODE_ENV === 'development' && (
          <div style={{ 
            marginTop: 24, 
            padding: 16, 
            background: "#f8f9fa", 
            borderRadius: 8,
            border: "1px dashed #dee2e6",
            fontSize: 12,
            color: COLORS.muted
          }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>🔧 Debug Info:</div>
            <pre style={{ 
              margin: 0, 
              fontSize: 11, 
              overflow: "auto", 
              maxHeight: 200,
              padding: 8,
              background: "white",
              borderRadius: 4
            }}>
              {JSON.stringify({
                period,
                dateStr,
                baseDate: baseDate.toISOString(),
                statistics,
                seriesLength: series.length,
                rawDataLength: rawData.length,
                loading,
                error
              }, null, 2)}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}

function EnhancedBarChart({ labels, values, period }: { 
  labels: string[]; 
  values: number[]; 
  period: Period 
}) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const hasData = values.some(v => v > 0);
  const chartHeight = 280;
  const barSpacing = 4;
  
  // Calcola la larghezza dinamica delle barre in base al periodo
  const barWidth = period === 'day' 
    ? 'calc((100% - 192px) / 24)'  // 24 barre per giorno
    : period === 'week' 
      ? 'calc((100% - 56px) / 7)'  // 7 barre per settimana
      : 'calc((100% - 120px) / 31)'; // fino a 31 barre per mese

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
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>
          Prova a cambiare data o periodo
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", overflowX: "auto", paddingBottom: 8 }}>
      <div
        style={{
          minWidth: period === 'month' ? 800 : 600,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-start",
          gap: barSpacing,
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
          const barHeight = (v / max) * (chartHeight - 80); // 80px per etichette
          const percentage = max > 0 ? (v / max) * 100 : 0;
          const isActive = v > 0;
          
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
            >
              {/* Tooltip */}
              <div style={{
                position: "absolute",
                top: -45,
                left: "50%",
                transform: "translateX(-50%)",
                background: COLORS.text,
                color: "white",
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 900,
                whiteSpace: "nowrap",
                opacity: 0,
                transition: "opacity 0.2s",
                pointerEvents: "none",
                zIndex: 100,
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}>
                <div>{labels[i]}</div>
                <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>
                  {currency.format(v)}
                  {total > 0 && ` (${((v / total) * 100).toFixed(1)}%)`}
                </div>
              </div>

              {/* Barra */}
              <div
                onMouseEnter={(e) => {
                  const tooltip = e.currentTarget.previousSibling as HTMLElement;
                  if (tooltip) tooltip.style.opacity = "1";
                  e.currentTarget.style.transform = "scale(1.05)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(37, 99, 235, 0.3)";
                }}
                onMouseLeave={(e) => {
                  const tooltip = e.currentTarget.previousSibling as HTMLElement;
                  if (tooltip) tooltip.style.opacity = "0";
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                style={{
                  width: "85%",
                  height: barHeight,
                  background: isActive 
                    ? `linear-gradient(to top, ${COLORS.secondary}, ${COLORS.primary})`
                    : "rgba(226, 232, 240, 0.3)",
                  borderRadius: "6px 6px 0 0",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  position: "relative",
                  border: isActive ? `1px solid ${COLORS.secondary}80` : `1px solid ${COLORS.border}`,
                  borderBottom: "none",
                  minHeight: isActive ? 4 : 0,
                }}
              >
                {/* Valore sulla barra per valori significativi */}
                {v > 0 && barHeight > 30 && (
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
                color: isActive ? COLORS.text : COLORS.muted, 
                fontWeight: isActive ? 900 : 700,
                textAlign: "center",
                height: period === 'month' ? 40 : 30,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                padding: "0 2px",
              }}>
                {period === 'month' && labels[i].length > 2 
                  ? labels[i] 
                  : labels[i].substring(0, 3)}
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
          <div style={{ marginTop: (chartHeight - 80) * 0.5 }}>50%</div>
          <div style={{ marginTop: (chartHeight - 80) * 0.25 }}>25%</div>
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
          📊 Totale periodo: <span style={{ color: COLORS.primary }}>{currency.format(total)}</span>
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700 }}>
          {values.filter(v => v > 0).length} elementi con dati
        </div>
      </div>
    </div>
  );
}