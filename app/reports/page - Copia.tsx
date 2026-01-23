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
  const x = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return x;
}
function endOfMonth(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return x;
}

const currency = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function makeLabels(period: Period, base: Date) {
  if (period === "day") {
    return Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
  }
  if (period === "week") {
    return ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  }
  const days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return Array.from({ length: days }, (_, i) => String(i + 1));
}

function getRange(period: Period, base: Date) {
  if (period === "day") return { from: startOfDay(base), to: endOfDay(base) };
  if (period === "week") return { from: startOfWeek(base), to: endOfWeek(base) };
  return { from: startOfMonth(base), to: endOfMonth(base) };
}

type FinancialItem = { amount: number; date: string; source: 'invoice' | 'appointment' };

export default function ReportsPage() {
  const params = useSearchParams();
  const initialPeriod = (params.get("period") as Period) || "month";
  const initialDate = params.get("date") || toISODate(new Date());

  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [dateStr, setDateStr] = useState<string>(initialDate);
  const [loading, setLoading] = useState<boolean>(true);
  const [total, setTotal] = useState<number>(0);
  const [series, setSeries] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

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

      // 1. Fetch FATTURE (Invoices)
      const invoicesQuery = supabase
        .from("invoices")
        .select("amount, paid_at, status")
        .eq("status", "paid")
        .gte("paid_at", fromStr)
        .lte("paid_at", toStr);

      // 2. Fetch APPUNTAMENTI (Calendario)
      // Corretto con i nomi colonne che mi hai dato: start_at, amount, is_paid
      const appointmentsQuery = supabase
        .from("appointments")
        .select("amount, start_at, is_paid") // <-- COLONNE GIUSTE
        .eq("is_paid", true)                 // <-- FILTRO SOLO PAGATI (boolean)
        .gte("start_at", fromStr)
        .lte("start_at", toStr);

      const [invRes, appRes] = await Promise.all([invoicesQuery, appointmentsQuery]);

      if (invRes.error) throw invRes.error;
      // Logghiamo errore appuntamenti ma non blocchiamo tutto
      if (appRes.error) console.warn("Errore Appuntamenti:", appRes.error.message);

      // Processiamo FATTURE
      const invoices = (invRes.data || []).map(i => ({
        amount: Number(i.amount) || 0,
        date: i.paid_at,
        source: 'invoice' as const
      }));

      // Processiamo APPUNTAMENTI
      const appointments = (appRes.data || []).map(a => ({
        amount: Number(a.amount) || 0, // <-- Prende 'amount'
        date: a.start_at,              // <-- Prende 'start_at'
        source: 'appointment' as const
      }));

      // Uniamo tutto
      const allData: FinancialItem[] = [...invoices, ...appointments];

      // Calcolo Totale
      const tot = allData.reduce((s, item) => s + item.amount, 0);
      setTotal(tot);

      // Calcolo Grafico
      const buckets = new Array(labels.length).fill(0);

      for (const item of allData) {
        if(!item.date) continue;
        const dt = new Date(item.date);

        if (period === "day") {
          const h = dt.getHours(); 
          if(h >= 0 && h < 24) buckets[h] += item.amount;
        } else if (period === "week") {
          const idx = (dt.getDay() + 6) % 7;
          if(idx >= 0 && idx < 7) buckets[idx] += item.amount;
        } else {
          // month
          const idx = dt.getDate() - 1;
          if (idx >= 0 && idx < buckets.length) {
            buckets[idx] += item.amount;
          }
        }
      }

      setSeries(buckets);
    } catch (e: any) {
      setError(e.message || "Errore caricamento dati");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, dateStr]);

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
            ← Home
          </Link>
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
                { k: "day", label: "Giorno" },
                { k: "week", label: "Settimana" },
                { k: "month", label: "Mese" },
              ].map((p) => (
                <button
                  key={p.k}
                  onClick={() => setPeriod(p.k as Period)}
                  style={{
                    cursor: "pointer",
                    padding: "8px 12px",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 900,
                    fontSize: 13,
                    color: period === p.k ? "white" : COLORS.primary,
                    background: period === p.k ? COLORS.primary : "transparent",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              style={{
                border: `1px solid ${COLORS.border}`,
                background: "white",
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 13,
              }}
            />
            
            <button onClick={() => setDateStr(toISODate(new Date()))} style={btnSecondary()}>Oggi</button>
          </div>
        </div>

        {/* KPI + Grafico */}
        <div
          style={{
            background: COLORS.card,
            borderRadius: 16,
            padding: 20,
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: 6 }}>
                Totale Incassato
              </div>
              <div style={{ fontSize: 32, fontWeight: 1000, color: COLORS.accent }}>
                {loading ? "..." : currency.format(total)}
              </div>
            </div>
            {error && <div style={{ color: COLORS.danger, fontWeight: "bold" }}>⚠️ {error}</div>}
          </div>

          <SimpleBarChart labels={labels} values={series} color={COLORS.secondary} />
        </div>
      </main>
    </div>
  );
}

function btnSecondary() {
  return {
    cursor: "pointer",
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    background: "white",
    fontWeight: 800,
    fontSize: 12,
    color: COLORS.primary,
  } as React.CSSProperties;
}

function SimpleBarChart({ labels, values, color }: { labels: string[]; values: number[]; color?: string }) {
  const max = Math.max(1, ...values);
  const height = 220;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <div
        style={{
          minWidth: 480,
          display: "grid",
          gridTemplateColumns: `repeat(${labels.length}, minmax(12px, 1fr))`,
          gap: 8,
          alignItems: "end",
          height,
          borderBottom: `1px solid ${COLORS.border}`,
          paddingBottom: 24,
        }}
      >
        {values.map((v, i) => {
          const h = (v / max) * (height - 40);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                title={`${labels[i]}: ${currency.format(v)}`}
                style={{
                  width: "100%",
                  height: h,
                  background: color || COLORS.primary,
                  borderRadius: 6,
                  transition: "height 0.2s",
                }}
              />
              <div style={{ marginTop: 8, fontSize: 10, color: COLORS.muted, whiteSpace: "nowrap" }}>
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}