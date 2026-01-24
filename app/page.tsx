"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../src/lib/supabaseClient";

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

type Appointment = {
  id: string;
  start_at: string;
  status?: string | null;
  patients?: { first_name?: string | null; last_name?: string | null } | null;
};

type Patient = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  birth_date?: string | null;
};

type DashboardStats = {
  totalPatients: number;
  todayAppointmentsCount: number;
  incompletePatients: number;
  dailyRevenue: number;
  monthlyRevenue: number;
  dailyStats: {
    total: number;
    invoiceCount: number;
    appointmentCount: number;
    averageAmount: number;
    transactionCount: number;
  };
  monthlyStats: {
    total: number;
    invoiceCount: number;
    appointmentCount: number;
    averageAmount: number;
    transactionCount: number;
  };
};

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
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

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function euro(n: number) {
  try {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
  } catch {
    return `€${(n || 0).toFixed(2)}`;
  }
}

async function fetchRevenueStats(supabase: any, fromDate: Date, toDate: Date) {
  const fromStr = fromDate.toISOString();
  const toStr = toDate.toISOString();

  // 1. Fatture del periodo
  const { data: invoicesData } = await supabase
    .from("invoices")
    .select("id, amount, paid_at, status, patients (first_name, last_name)")
    .eq("status", "paid")
    .gte("paid_at", fromStr)
    .lte("paid_at", toStr)
    .order("paid_at", { ascending: true });

  // 2. Appuntamenti del periodo
  const { data: appointmentsData } = await supabase
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

  // Processa fatture
  const invoices = (invoicesData || []).map((i: any) => {
    const amount = parseFloat(String(i.amount)) || 0;
    return { amount, date: i.paid_at, source: 'invoice' as const };
  }).filter(item => item.amount > 0);

  // Processa appuntamenti
  const appointments = (appointmentsData || []).map((a: any) => {
    const amount = parseFloat(String(a.amount)) || 0;
    return { amount, date: a.start_at, source: 'appointment' as const };
  }).filter(item => item.amount > 0);

  // Combina i dati
  const allData = [...invoices, ...appointments];
  const amounts = allData.map(item => item.amount);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const invoiceCount = invoices.length;
  const appointmentCount = appointments.length;
  const averageAmount = amounts.length > 0 ? total / amounts.length : 0;

  return {
    total,
    invoiceCount,
    appointmentCount,
    averageAmount,
    transactionCount: allData.length,
  };
}

export default function HomePage() {
  const router = useRouter();

  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    todayAppointmentsCount: 0,
    incompletePatients: 0,
    dailyRevenue: 0,
    monthlyRevenue: 0,
    dailyStats: {
      total: 0,
      invoiceCount: 0,
      appointmentCount: 0,
      averageAmount: 0,
      transactionCount: 0,
    },
    monthlyStats: {
      total: 0,
      invoiceCount: 0,
      appointmentCount: 0,
      averageAmount: 0,
      transactionCount: 0,
    },
  });
  const [loading, setLoading] = useState(true);

  const todayYMD = useMemo(() => toYMD(new Date()), []);
  const today = new Date();
  const greetings = ["Buongiorno", "Buon pomeriggio", "Buonasera"];
  const currentHour = today.getHours();
  const greeting = currentHour < 12 ? greetings[0] : currentHour < 18 ? greetings[1] : greetings[2];

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDashboardData() {
    setLoading(true);

    const startISO = `${todayYMD}T00:00:00`;
    const endISO = `${todayYMD}T23:59:59`;

    // 1) Appuntamenti di oggi
    const { data: appointments } = await supabase
      .from("appointments")
      .select("*, patients(first_name, last_name)")
      .gte("start_at", startISO)
      .lt("start_at", endISO)
      .order("start_at", { ascending: true })
      .limit(5);

    // 2) Ultimi pazienti
    const { data: patients } = await supabase
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    // 3) Totale pazienti
    const { count: totalPatients } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true });

    const incomplete = (patients || []).filter((p: any) => !p.phone || !p.birth_date).length;

    // 4) Statistiche giornaliere (oggi)
    const dailyStats = await fetchRevenueStats(
      supabase,
      startOfDay(today),
      endOfDay(today)
    );

    // 5) Statistiche mensili (questo mese)
    const monthlyStats = await fetchRevenueStats(
      supabase,
      startOfMonth(today),
      endOfMonth(today)
    );

    setTodayAppointments((appointments as any[]) || []);
    setRecentPatients((patients as any[]) || []);
    setStats({
      totalPatients: totalPatients || 0,
      todayAppointmentsCount: (appointments as any[])?.length || 0,
      incompletePatients: incomplete || 0,
      dailyRevenue: dailyStats.total,
      monthlyRevenue: monthlyStats.total,
      dailyStats,
      monthlyStats,
    });

    setLoading(false);
  }

  const quickLinks = [
    { icon: "📅", title: "Calendario", desc: "Gestisci appuntamenti", href: "/calendar", color: COLORS.primary },
    { icon: "👥", title: "Pazienti", desc: "Anagrafica completa", href: "/patients", color: COLORS.accent },
    { icon: "💰", title: "Fatture", desc: "Gestione pagamenti", href: "/invoices", color: COLORS.success },
    { icon: "📊", title: "Report", desc: "Statistiche e grafici", href: "/reports", color: COLORS.warning },
    { icon: "📋", title: "Documenti", desc: "GDPR e consensi", href: "/documents", color: COLORS.secondary },
    { icon: "⚙️", title: "Impostazioni", desc: "Configura sistema", href: "/settings", color: COLORS.muted },
  ];

  const goToTodayDayView = () => {
    router.push(`/calendar?view=day&date=${todayYMD}`);
  };

  const goToReportsDay = () => {
    router.push(`/reports?period=day&date=${todayYMD}`);
  };

  const goToReportsMonth = () => {
    router.push(`/reports?period=month&date=${todayYMD}`);
  };

  const goToReports = () => {
    router.push("/reports");
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: COLORS.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: 18, color: COLORS.muted, fontWeight: 700 }}>Caricamento dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.background }}>
      {/* HEADER */}
      <header
        style={{
          background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
          color: "white",
          padding: "20px 24px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>🏥 FisioHub</h1>
            <div style={{ marginTop: 6, fontSize: 14, opacity: 0.9 }}>Dott. Marco Turchetta • Versione 1.2</div>
          </div>
          <div
            style={{
              fontSize: 14,
              background: "rgba(255,255,255,0.15)",
              padding: "8px 16px",
              borderRadius: 12,
            }}
          >
            {new Date().toLocaleDateString("it-IT", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>
      </header>

      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
        {/* WELCOME MESSAGE */}
        <div
          style={{
            background: COLORS.card,
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 22, color: COLORS.primary }}>{greeting}, Dottore! 👋</h2>
          <div style={{ marginTop: 8, fontSize: 14, color: COLORS.muted }}>
            Hai {stats.todayAppointmentsCount} appuntamenti oggi •{" "}
            {stats.incompletePatients > 0 && `${stats.incompletePatients} pazienti da completare`}
            {stats.dailyStats.total > 0 && ` • ${euro(stats.dailyStats.total)} incassati oggi`}
          </div>
        </div>

        {/* QUICK ACCESS CARDS */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 16px 0", color: COLORS.primary, fontSize: 18 }}>Accesso Rapido</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
            {quickLinks.map((link) => (
              <Link
                key={link.title}
                href={link.href}
                style={{
                  background: COLORS.card,
                  borderRadius: 14,
                  padding: 20,
                  border: `1px solid ${COLORS.border}`,
                  textDecoration: "none",
                  color: COLORS.primary,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  transition: "all 0.2s",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)";
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 12 }}>{link.icon}</div>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>{link.title}</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>{link.desc}</div>
              </Link>
            ))}
          </div>
        </div>

        {/* TWO COLUMNS LAYOUT */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* COLONNA SINISTRA: Appuntamenti di Oggi */}
          <div
            style={{
              background: COLORS.card,
              borderRadius: 16,
              padding: 20,
              border: `1px solid ${COLORS.border}`,
              boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <button
                type="button"
                onClick={goToTodayDayView}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
                title="Apri il calendario in vista giorno (oggi)"
              >
                <h3 style={{ margin: 0, color: COLORS.primary, fontSize: 18 }}>📅 Appuntamenti di Oggi</h3>
                <span style={{ fontSize: 12, color: COLORS.muted, fontWeight: 800 }}>→ vista giorno</span>
              </button>

              <span
                style={{
                  background: COLORS.accent,
                  color: "white",
                  fontSize: 12,
                  fontWeight: 900,
                  padding: "4px 10px",
                  borderRadius: 20,
                }}
              >
                {stats.todayAppointmentsCount}
              </span>
            </div>

            {todayAppointments.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>Nessun appuntamento oggi</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {todayAppointments.map((appt, idx) => (
                  <div
                    key={appt.id}
                    style={{
                      padding: 16,
                      background: idx % 2 === 0 ? "rgba(241,245,249,0.5)" : "white",
                      borderRadius: 12,
                      border: `1px solid ${COLORS.border}`,
                      cursor: "pointer",
                    }}
                    onClick={goToTodayDayView}
                    title="Apri vista giorno del calendario"
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div
                          style={{
                            display: "inline-block",
                            fontSize: 14,
                            fontWeight: 0,
                            color: COLORS.primary,
                            background: "rgba(37,99,235,0.08)",
                            padding: "2px 8px",
                            borderRadius: 8,
                            marginBottom: 4,
                          }}
                        >
                          {new Date(appt.start_at).toLocaleTimeString("it-IT", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>

                        <div
                          style={{
                            fontSize: 14,
                            marginTop: 4,
                            color: COLORS.primary,
                            fontWeight: 700,
                          }}
                        >
                          {appt.patients?.first_name} {appt.patients?.last_name}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          padding: "4px 10px",
                          borderRadius: 20,
                          background:
                            appt.status === "done"
                              ? "rgba(22,163,74,0.12)"
                              : appt.status === "confirmed"
                                ? "rgba(37,99,235,0.12)"
                                : "rgba(249,115,22,0.12)",
                          color:
                            appt.status === "done"
                              ? COLORS.success
                              : appt.status === "confirmed"
                                ? COLORS.secondary
                                : COLORS.warning,
                        }}
                      >
                        {appt.status === "done" ? "Eseguita" : appt.status === "confirmed" ? "Confermata" : "Non Pagata"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <Link
                href={`/calendar?view=day&date=${todayYMD}`}
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  background: COLORS.primary,
                  color: "white",
                  textDecoration: "none",
                  borderRadius: 12,
                  fontWeight: 900,
                  fontSize: 14,
                }}
              >
                Vai al Calendario (Oggi) →
              </Link>
            </div>
          </div>

          {/* COLONNA DESTRA: Pazienti Recenti */}
          <div
            style={{
              background: COLORS.card,
              borderRadius: 16,
              padding: 20,
              border: `1px solid ${COLORS.border}`,
              boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: COLORS.primary, fontSize: 18 }}>👥 Pazienti Recenti</h3>
              <span
                style={{
                  background: COLORS.accent,
                  color: "white",
                  fontSize: 12,
                  fontWeight: 900,
                  padding: "4px 10px",
                  borderRadius: 20,
                }}
              >
                {recentPatients.length}
              </span>
            </div>

            {recentPatients.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>Nessun paziente inserito</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {recentPatients.map((patient, idx) => (
                  <Link
                    key={patient.id}
                    href={`/patients/${patient.id}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        padding: 16,
                        background: idx % 2 === 0 ? "rgba(241,245,249,0.5)" : "white",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.border}`,
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(13,148,136,0.08)";
                        e.currentTarget.style.transform = "translateX(4px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = idx % 2 === 0 ? "rgba(241,245,249,0.5)" : "white";
                        e.currentTarget.style.transform = "translateX(0)";
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 900, color: COLORS.primary }}>
                            {patient.last_name} {patient.first_name}
                          </div>
                          {patient.phone && (
                            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>📞 {patient.phone}</div>
                          )}
                        </div>
                        {(!patient.phone || !patient.birth_date) && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: "3px 8px",
                              borderRadius: 20,
                              background: "rgba(249,115,22,0.12)",
                              color: COLORS.warning,
                            }}
                          >
                            ⚠️ Incompleto
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <Link
                href="/patients"
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  background: COLORS.accent,
                  color: "white",
                  textDecoration: "none",
                  borderRadius: 12,
                  fontWeight: 900,
                  fontSize: 14,
                }}
              >
                Vai a Lista Pazienti Completa →
              </Link>
            </div>
          </div>
        </div>

        {/* STATISTICHE VELOCI CON DATI REPORT */}
        <div
          style={{
            marginTop: 24,
            background: COLORS.card,
            borderRadius: 16,
            padding: 20,
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0, color: COLORS.primary, fontSize: 18 }}>📊 Statistiche Rapide</h3>
            <button
              type="button"
              onClick={goToReports}
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                color: COLORS.primary,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 8,
                background: "rgba(37, 99, 235, 0.1)",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(37, 99, 235, 0.2)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(37, 99, 235, 0.1)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <span>📈</span>
              Vai ai Report Completi →
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {/* Pazienti Totali */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 1000, color: COLORS.primary }}>{stats.totalPatients}</div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>Pazienti Totali</div>
            </div>

            {/* Appuntamenti Oggi */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 1000, color: COLORS.success }}>{stats.todayAppointmentsCount}</div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>Appuntamenti Oggi</div>
            </div>

            {/* INCASSATO OGGI */}
            <button
              type="button"
              onClick={goToReportsDay}
              style={{
                all: "unset",
                cursor: "pointer",
                textAlign: "center",
                borderRadius: 12,
                padding: 8,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(22,163,74,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
              title="Apri Report (incassato oggi)"
            >
              <div style={{ fontSize: 28, fontWeight: 1000, color: COLORS.success }}>{euro(stats.dailyStats.total)}</div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>Incassato Oggi</div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                {stats.dailyStats.transactionCount} transazioni • Media: {euro(stats.dailyStats.averageAmount)}
              </div>
            </button>

            {/* INCASSATO MESE */}
            <button
              type="button"
              onClick={goToReportsMonth}
              style={{
                all: "unset",
                cursor: "pointer",
                textAlign: "center",
                borderRadius: 12,
                padding: 8,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(13,148,136,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
              title="Apri Report (incassato mese)"
            >
              <div style={{ fontSize: 28, fontWeight: 1000, color: COLORS.accent }}>{euro(stats.monthlyStats.total)}</div>
              <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>Incassato Mese</div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                {stats.monthlyStats.transactionCount} transazioni • Media: {euro(stats.monthlyStats.averageAmount)}
              </div>
            </button>
          </div>

          {/* DETTAGLIO FONTI */}
          <div style={{ marginTop: 20, padding: 16, background: "rgba(241,245,249,0.5)", borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: COLORS.primary, marginBottom: 12 }}>
              📋 Dettaglio Fonti Incassi
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Oggi */}
              <div>
                <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700, marginBottom: 8 }}>Oggi</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: COLORS.success }}>📄 Fatture: <strong>{stats.dailyStats.invoiceCount}</strong></span>
                  <span>{euro(stats.dailyStats.total * (stats.dailyStats.invoiceCount / Math.max(stats.dailyStats.transactionCount, 1)))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                  <span style={{ color: COLORS.accent }}>📅 Appuntamenti: <strong>{stats.dailyStats.appointmentCount}</strong></span>
                  <span>{euro(stats.dailyStats.total * (stats.dailyStats.appointmentCount / Math.max(stats.dailyStats.transactionCount, 1)))}</span>
                </div>
              </div>

              {/* Questo Mese */}
              <div>
                <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700, marginBottom: 8 }}>Questo Mese</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: COLORS.success }}>📄 Fatture: <strong>{stats.monthlyStats.invoiceCount}</strong></span>
                  <span>{euro(stats.monthlyStats.total * (stats.monthlyStats.invoiceCount / Math.max(stats.monthlyStats.transactionCount, 1)))}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                  <span style={{ color: COLORS.accent }}>📅 Appuntamenti: <strong>{stats.monthlyStats.appointmentCount}</strong></span>
                  <span>{euro(stats.monthlyStats.total * (stats.monthlyStats.appointmentCount / Math.max(stats.monthlyStats.transactionCount, 1)))}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer
        style={{
          marginTop: 40,
          padding: "20px 24px",
          background: COLORS.card,
          borderTop: `1px solid ${COLORS.border}`,
          color: COLORS.muted,
          fontSize: 13,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            maxWidth: 1200,
            margin: "0 auto",
          }}
        >
          <div>
            <strong>© 2024 Studio Medico</strong> • Tutti i diritti riservati
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <span>🟢 Sistema Online</span>
            <span>🔄 Ultimo backup: oggi 03:00</span>
            <span>📞 Supporto: +39 3209631792</span>
          </div>
        </div>
      </footer>
    </div>
  );
}