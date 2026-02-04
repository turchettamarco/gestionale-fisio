"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

/**
 * app/mobile/page.tsx
 * Home mobile: Oggi + azioni rapide + alert + bottom nav
 */

type ApptStatus = "booked" | "confirmed" | "done" | "cancelled" | "not_paid" | string;

type Appointment = {
  id: string;
  start_at: string;
  status: ApptStatus | null;
  amount?: number | null;
  treatment_type?: string | null;
  patient_id?: string | null;
  patients?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
};

const UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  primary: "#1e3a8a",
  secondary: "#2563eb",
  accent: "#0d9488",
  danger: "#dc2626",
  warning: "#f97316",
  success: "#16a34a",
};

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function itTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function itDate(d: Date) {
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
}
function fullName(p?: Appointment["patients"]) {
  const ln = p?.last_name ?? "";
  const fn = p?.first_name ?? "";
  return `${ln} ${fn}`.trim() || "Paziente";
}

function statusPill(status?: string | null) {
  if (status === "done")
    return { label: "Eseguito", bg: "rgba(22,163,74,0.12)", fg: UI.success, bd: "rgba(22,163,74,0.35)" };
  if (status === "confirmed")
    return { label: "Confermato", bg: "rgba(37,99,235,0.10)", fg: UI.secondary, bd: "rgba(37,99,235,0.30)" };
  if (status === "not_paid")
    return { label: "Non pagato", bg: "rgba(220,38,38,0.10)", fg: UI.danger, bd: "rgba(220,38,38,0.30)" };
  if (status === "cancelled")
    return { label: "Annullato", bg: "rgba(100,116,139,0.10)", fg: UI.muted, bd: "rgba(100,116,139,0.30)" };
  return { label: "Prenotato", bg: "rgba(249,115,22,0.10)", fg: UI.warning, bd: "rgba(249,115,22,0.30)" };
}

export default function MobileHomePage() {
  const router = useRouter();

useEffect(() => {
  let alive = true;

  supabase.auth.getSession().then(({ data }) => {
    if (!alive) return;
    if (!data.session) router.replace("/login");
  });

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) router.replace("/login");
  });

  return () => {
    alive = false;
    sub.subscription.unsubscribe();
  };
}, [router]);


  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      console.log("SESSIONE (mobile home):", data.session, error);
    });

    supabase.auth.getUser().then(({ data, error }) => {
      console.log("USER LOGGATO (mobile home):", data.user, error);
    });
  }, []);

  // “oggi” stabile
  const [today] = useState(() => new Date());
  const [todayYMD] = useState(() => toYMD(new Date()));
  const startISO = useMemo(() => `${todayYMD}T00:00:00`, [todayYMD]);
  const endISO = useMemo(() => `${todayYMD}T23:59:59`, [todayYMD]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patientsToCompleteCount, setPatientsToCompleteCount] = useState(0);
  const [unpaidCount, setUnpaidCount] = useState(0);

  const goAgendaToday = useCallback(() => {
    router.push(`/calendar?view=day&date=${todayYMD}`);
  }, [router, todayYMD]);

  const goNewAppointment = useCallback(() => {
    // Questo DEVE essere supportato da /calendar (vedi fix sotto)
    router.push(`/calendar?view=day&date=${todayYMD}&new=1`);
  }, [router, todayYMD]);

  const loadMobileHome = useCallback(async () => {
    setLoading(true);
    setError("");

    // 1) Appuntamenti di oggi
    const apptRes = await supabase
      .from("appointments")
      .select("id, start_at, status, amount, treatment_type, patient_id, patients(first_name, last_name, phone)")
      .gte("start_at", startISO)
      .lt("start_at", endISO)
      .order("start_at", { ascending: true });

    if (apptRes.error) {
      setError(`Errore caricamento appuntamenti: ${apptRes.error.message}`);
      setAppointments([]);
    } else {
      setAppointments((apptRes.data ?? []) as Appointment[]);
    }

    // 2) pazienti incompleti (conteggio)
    const patRes = await supabase.from("patients").select("id, phone, birth_date, tax_code");
    if (patRes.error) {
      setError((prev) => prev || `Errore caricamento pazienti: ${patRes.error!.message}`);
      setPatientsToCompleteCount(0);
    } else {
      const pats = (patRes.data ?? []) as any[];
      const incomplete = pats.filter((p) => !p.phone || !p.birth_date || !p.tax_code).length;
      setPatientsToCompleteCount(incomplete);
    }

    // 3) non pagati (count)
    const unpaidRes = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "not_paid");

    if (unpaidRes.error) {
      setError((prev) => prev || `Errore conteggio non pagati: ${unpaidRes.error!.message}`);
      setUnpaidCount(0);
    } else {
      setUnpaidCount(unpaidRes.count ?? 0);
    }

    setLoading(false);
  }, [startISO, endISO]);

  useEffect(() => {
    void loadMobileHome();
  }, [loadMobileHome]);

  const nextAppt = useMemo(() => {
    const now = new Date();
    const n = appointments.find((a) => new Date(a.start_at).getTime() >= now.getTime());
    return n ?? appointments[0] ?? null;
  }, [appointments]);

  return (
    <div style={{ minHeight: "100vh", background: UI.bg, paddingBottom: 84 }}>
      {/* HEADER */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: UI.bg,
          padding: "14px 14px 10px",
          borderBottom: `1px solid ${UI.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 1000, color: UI.text, fontSize: 14 }}>📅 {itDate(today)}</div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 1000,
              color: "white",
              background: UI.accent,
              padding: "6px 10px",
              borderRadius: 999,
            }}
          >
            {appointments.length} oggi
          </div>
        </div>

        {/* PROSSIMO */}
        <div
          style={{
            marginTop: 10,
            background: UI.card,
            border: `1px solid ${UI.border}`,
            borderRadius: 16,
            padding: 12,
            boxShadow: "0 6px 18px rgba(2,6,23,0.05)",
          }}
        >
          <div style={{ fontSize: 12, color: UI.muted, fontWeight: 900 }}>PROSSIMO</div>

          {nextAppt ? (
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 1000, color: UI.text, lineHeight: 1.1 }}>
                  {itTime(nextAppt.start_at)} · {fullName(nextAppt.patients)}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: UI.muted, fontWeight: 800 }}>
                  {nextAppt.treatment_type ?? "Seduta"}
                </div>
              </div>

              <button
                onClick={goNewAppointment}
                style={{
                  border: "none",
                  background: UI.primary,
                  color: "white",
                  fontWeight: 1000,
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ➕
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 6, color: UI.muted, fontWeight: 800, fontSize: 13 }}>Nessun appuntamento oggi.</div>
          )}

          <button
            onClick={goNewAppointment}
            style={{
              marginTop: 10,
              width: "100%",
              border: "none",
              background: `linear-gradient(135deg, ${UI.primary} 0%, ${UI.secondary} 100%)`,
              color: "white",
              fontWeight: 1000,
              padding: "12px 14px",
              borderRadius: 14,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ➕ Nuovo Appuntamento
          </button>

          {error && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 12,
                border: "1px solid rgba(220,38,38,0.25)",
                background: "rgba(220,38,38,0.08)",
                color: UI.text,
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>

      {/* CONTENUTO */}
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <div style={{ fontSize: 14, fontWeight: 1000, color: UI.text }}>📋 Oggi</div>
          <button
            onClick={goAgendaToday}
            style={{ border: "none", background: "transparent", color: UI.primary, fontWeight: 1000, cursor: "pointer", fontSize: 13 }}
          >
            Vai in agenda →
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          {loading ? (
            <div style={{ color: UI.muted, fontWeight: 800, padding: 16 }}>Caricamento…</div>
          ) : appointments.length === 0 ? (
            <div style={{ background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 16, padding: 14, color: UI.muted, fontWeight: 800 }}>
              Nessun appuntamento oggi.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {appointments.map((a) => {
                const pill = statusPill(a.status);
                return (
                  <button
                    key={a.id}
                    onClick={goAgendaToday}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${UI.border}`,
                      background: UI.card,
                      borderRadius: 16,
                      padding: 12,
                      cursor: "pointer",
                      boxShadow: "0 6px 18px rgba(2,6,23,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 1000, color: UI.text, fontSize: 15 }}>
                          {itTime(a.start_at)} · {fullName(a.patients)}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: UI.muted, fontWeight: 800 }}>
                          {a.treatment_type ?? "Seduta"}
                          {typeof a.amount === "number" && a.amount > 0 ? ` · €${a.amount}` : ""}
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 1000,
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: pill.bg,
                          color: pill.fg,
                          border: `1px solid ${pill.bd}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {pill.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* AZIONI RAPIDE */}
        <div style={{ marginTop: 16, fontSize: 14, fontWeight: 1000, color: UI.text }}>⚡ Azioni rapide</div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <button onClick={goNewAppointment} style={quickBtnStyle(UI.primary)}>➕ Appunt.</button>
          <button onClick={() => router.push(`/reports?period=day&date=${todayYMD}`)} style={quickBtnStyle(UI.accent)}>💶 Incasso</button>
          <button onClick={() => router.push("/patients")} style={quickBtnStyle(UI.secondary)}>👤 Pazienti</button>
        </div>

        {/* ALERT */}
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {patientsToCompleteCount > 0 && (
            <button onClick={() => router.push("/patients")} style={alertStyle("warning")}>
              ⚠️ {patientsToCompleteCount} pazienti da completare
              <span style={{ color: UI.primary, fontWeight: 1000 }}>Apri →</span>
            </button>
          )}

          {unpaidCount > 0 && (
            <button onClick={() => router.push("/reports")} style={alertStyle("danger")}>
              🔴 {unpaidCount} terapie non pagate
              <span style={{ color: UI.primary, fontWeight: 1000 }}>Apri →</span>
            </button>
          )}
        </div>
      </div>

      {/* BOTTOM NAV */}
      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: UI.card,
          borderTop: `1px solid ${UI.border}`,
          height: 72,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
          alignItems: "center",
          padding: "0 8px",
          zIndex: 60,
        }}
      >
        <NavItem href="/mobile" label="Oggi" icon="🏠" active />
        <NavItem href={`/calendar?view=day&date=${todayYMD}`} label="Agenda" icon="📅" />
        <button
          onClick={goNewAppointment}
          style={{
            border: "none",
            background: UI.primary,
            color: "white",
            width: 54,
            height: 54,
            borderRadius: 18,
            margin: "0 auto",
            fontWeight: 1000,
            cursor: "pointer",
            boxShadow: "0 10px 22px rgba(30,58,138,0.25)",
            fontSize: 18,
          }}
          aria-label="Nuovo appuntamento"
          title="Nuovo appuntamento"
        >
          +
        </button>
        <NavItem href="/patients" label="Pazienti" icon="👤" />
        <NavItem href="/reports" label="Altro" icon="⋯" />
      </nav>
    </div>
  );
}

function NavItem({ href, label, icon, active }: { href: string; label: string; icon: string; active?: boolean }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: "none",
        color: active ? UI.primary : UI.muted,
        fontWeight: 1000,
        fontSize: 11,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        paddingTop: 10,
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function quickBtnStyle(bg: string) {
  return {
    border: "none",
    background: bg,
    color: "white",
    borderRadius: 14,
    padding: "12px 10px",
    fontWeight: 1000,
    cursor: "pointer",
    fontSize: 12,
  } as const;
}

function alertStyle(kind: "warning" | "danger") {
  const bg = kind === "danger" ? "rgba(220,38,38,0.08)" : "rgba(249,115,22,0.10)";
  const bd = kind === "danger" ? "rgba(220,38,38,0.25)" : "rgba(249,115,22,0.25)";
  return {
    border: `1px solid ${bd}`,
    background: bg,
    borderRadius: 16,
    padding: 14,
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    color: UI.text,
    fontWeight: 900,
  } as const;
}
