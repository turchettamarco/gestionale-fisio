"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

type PatientLite = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
};

type Appointment = {
  id: string;
  start_at: string;
  status?: string | null;
  amount?: number | null;
  treatment_type?: string | null;
  patient_id?: string | null;
  patients?: PatientLite | null;
};

const UI = {
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  primary: "#1e3a8a",
  primary2: "#2563eb",
  good: "#16a34a",
  warn: "#f59e0b",
  bad: "#dc2626",
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function itTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function itShortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function relativeDayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((b - a) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Domani";
  if (diff === -1) return "Ieri";
  return itShortDate(iso);
}

function fullName(p?: PatientLite | null) {
  const ln = (p?.last_name ?? "").trim();
  const fn = (p?.first_name ?? "").trim();
  return `${ln} ${fn}`.trim() || "Paziente";
}

function cleanPhone(phone?: string | null) {
  if (!phone) return "";
  // keep + and digits
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^\d]/g, "");
  return plus + digits;
}

function waLink(phone: string, text: string) {
  // wa.me expects international format without +
  const p = phone.replace(/^\+/, "");
  return `https://wa.me/${encodeURIComponent(p)}?text=${encodeURIComponent(text)}`;
}

function sumAmounts(appts: Appointment[]) {
  // Avoid floating drift: cents
  const cents = appts.reduce((acc, a) => acc + (typeof a.amount === "number" ? Math.round(a.amount * 100) : 0), 0);
  return cents / 100;
}

function statusChip(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("paid") || s.includes("pag")) return { label: "Pagato", color: UI.good };
  if (s.includes("no_show") || s.includes("assente")) return { label: "No‑show", color: UI.bad };
  if (s.includes("cancel") || s.includes("annull")) return { label: "Annullato", color: UI.bad };
  if (s.includes("confirm") || s.includes("conf")) return { label: "Confermato", color: UI.primary2 };
  if (s.includes("not") || s.includes("da")) return { label: "Da fare", color: UI.warn };
  return { label: status ? status : "—", color: UI.muted };
}

export default function MobileHomePage() {
  const router = useRouter();

  const nowRef = useRef<Date>(new Date());
  const today = useMemo(() => new Date(), []);
  const [dateYMD, setDateYMD] = useState<string>(toYMD(today));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [todayAppts, setTodayAppts] = useState<Appointment[]>([]);
  const [nextAppts, setNextAppts] = useState<Appointment[]>([]); // rolling window next 7 days
  const [counts, setCounts] = useState<{ patients?: number; upcoming7?: number }>({});

  // live clock (used to auto-hide past appts without reloading the whole page)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      nowRef.current = new Date();
      setTick((x) => (x + 1) % 1000000);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateYMD]);

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const selectedStart = `${dateYMD}T00:00:00`;
      const selectedEnd = `${dateYMD}T23:59:59`;

      const weekStart = new Date();
      const weekEnd = addDays(weekStart, 7);

      const weekStartISO = weekStart.toISOString();
      const weekEndISO = weekEnd.toISOString();

      const [dayRes, weekRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, start_at, status, amount, treatment_type, patient_id, patients(first_name,last_name,phone)")
          .gte("start_at", selectedStart)
          .lt("start_at", selectedEnd)
          .order("start_at", { ascending: true }),
        supabase
          .from("appointments")
          .select("id, start_at, status, amount, treatment_type, patient_id, patients(first_name,last_name,phone)")
          .gte("start_at", weekStartISO)
          .lt("start_at", weekEndISO)
          .order("start_at", { ascending: true }),
      ]);

      if (dayRes.error) throw dayRes.error;
      if (weekRes.error) throw weekRes.error;

      setTodayAppts((dayRes.data ?? []) as any);
      setNextAppts((weekRes.data ?? []) as any);

      // optional counters (patients table might exist; if not, ignore silently)
      const patientCountRes = await supabase.from("patients").select("*", { count: "exact", head: true });
      if (!patientCountRes.error) {
        setCounts({ patients: patientCountRes.count ?? undefined, upcoming7: (weekRes.data ?? []).length });
      } else {
        setCounts({ upcoming7: (weekRes.data ?? []).length });
      }

      setLoading(false);
    } catch (e: any) {
      setError(e?.message ?? "Errore imprevisto");
      setTodayAppts([]);
      setNextAppts([]);
      setLoading(false);
    }
  }

  const now = nowRef.current; // updated via interval
  const nowISO = now.toISOString();

  const todayUpcoming = useMemo(() => {
    // filter past in the selected day
    const start = new Date(`${dateYMD}T00:00:00`);
    const end = new Date(`${dateYMD}T23:59:59`);
    const isToday = toYMD(now) === dateYMD;

    const list = todayAppts.slice();

    if (isToday) {
      return list.filter((a) => a.start_at >= nowISO);
    }
    // if past date, show all (historical); if future date, show all
    // still enforce day boundary
    return list.filter((a) => {
      const t = new Date(a.start_at);
      return t >= start && t <= end;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayAppts, dateYMD, tick]);

  const nextFive = useMemo(() => {
    const list = nextAppts.filter((a) => a.start_at >= nowISO);
    return list.slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextAppts, tick]);

  const kpi = useMemo(() => {
    const total = todayAppts.length;
    const upcoming = todayUpcoming.length;
    const incasso = sumAmounts(todayAppts);
    const next = nextFive[0];
    return { total, upcoming, incasso, next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayAppts, todayUpcoming, nextFive]);

  const headerDateLabel = useMemo(() => {
    const d = new Date(`${dateYMD}T00:00:00`);
    const pretty = d.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });
    const cap = pretty.charAt(0).toUpperCase() + pretty.slice(1);
    return cap;
  }, [dateYMD]);

  function goMobileCalendar() {
    router.push(`/mobile/calendar?date=${dateYMD}`);
  }
  function goDesktopCalendar() {
    router.push(`/calendar?view=day&date=${dateYMD}`);
  }
  function goPatients() {
    router.push(`/mobile/patients`);
  }
  function goReports() {
    router.push(`/mobile/reports`);
  }

  const wrapStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: UI.bg,
    padding: 14,
    paddingBottom: 22,
  };

  const cardStyle: React.CSSProperties = {
    background: UI.card,
    border: `1px solid ${UI.border}`,
    borderRadius: 18,
    boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
  };

  const btnStyle = (variant: "primary" | "ghost" | "soft") =>
    ({
      border: variant === "ghost" ? `1px solid ${UI.border}` : "none",
      background: variant === "primary" ? UI.primary : variant === "soft" ? "rgba(37,99,235,0.10)" : UI.card,
      color: variant === "primary" ? "white" : variant === "soft" ? UI.primary2 : UI.text,
      fontWeight: 1000,
      padding: "10px 12px",
      borderRadius: 14,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      textDecoration: "none",
      userSelect: "none",
    }) as React.CSSProperties;

  return (
    <div style={wrapStyle}>
      {/* Top bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          paddingTop: 4,
          paddingBottom: 10,
          background: UI.bg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 1100, color: UI.text, letterSpacing: -0.2 }}>Fisio Hub</div>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 900 }}>
              {headerDateLabel} · {new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>

          <Link href="/mobile/settings" style={btnStyle("ghost")} aria-label="Impostazioni">
            ⚙️
          </Link>
        </div>

        {/* Date + view shortcuts */}
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="date"
            value={dateYMD}
            onChange={(e) => setDateYMD(e.target.value)}
            style={{
              flex: 1,
              border: `1px solid ${UI.border}`,
              borderRadius: 14,
              padding: "10px 12px",
              fontWeight: 1000,
              background: "white",
              color: UI.text,
            }}
          />
          <button onClick={goMobileCalendar} style={btnStyle("primary")} aria-label="Apri calendario mobile">
            📅
          </button>
          <button onClick={goDesktopCalendar} style={btnStyle("soft")} aria-label="Apri calendario desktop">
            🖥️
          </button>
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 14,
            border: "1px solid rgba(220,38,38,0.25)",
            background: "rgba(220,38,38,0.06)",
            color: "#7f1d1d",
            fontWeight: 900,
          }}
        >
          Errore: {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ marginTop: 10, ...cardStyle, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 1100, color: UI.text, fontSize: 14, letterSpacing: -0.2 }}>Riepilogo</div>
            <div style={{ marginTop: 2, fontSize: 12, color: UI.muted, fontWeight: 900 }}>
              Oggi: {kpi.total} · Da fare: {kpi.upcoming}
              {typeof counts.patients === "number" ? ` · Pazienti: ${counts.patients}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: UI.muted, fontWeight: 1000 }}>Incasso (giorno)</div>
            <div style={{ fontSize: 18, fontWeight: 1200, color: UI.text }}>€{kpi.incasso.toFixed(0)}</div>
          </div>
        </div>

        {kpi.next ? (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 16,
              border: `1px solid rgba(37,99,235,0.18)`,
              background: "rgba(37,99,235,0.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 1100, color: UI.text, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Prossimo: {itTime(kpi.next.start_at)} · {fullName(kpi.next.patients)}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: UI.muted, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {kpi.next.treatment_type ?? "Seduta"}
                  {typeof kpi.next.amount === "number" && kpi.next.amount > 0 ? ` · €${kpi.next.amount}` : ""}
                </div>
              </div>
              <button
                onClick={() => (kpi.next?.patient_id ? router.push(`/mobile/patients/${kpi.next.patient_id}`) : undefined)}
                style={btnStyle("primary")}
              >
                Apri →
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 16, border: `1px dashed ${UI.border}`, color: UI.muted, fontWeight: 900 }}>
            Nessun prossimo appuntamento nei prossimi 7 giorni.
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ marginTop: 12, ...cardStyle, padding: 12 }}>
        <div style={{ fontWeight: 1100, color: UI.text, fontSize: 14 }}>Azioni rapide</div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={goMobileCalendar} style={btnStyle("ghost")}>
            📅 Calendario
          </button>
          <button onClick={goPatients} style={btnStyle("ghost")}>
            🧑‍⚕️ Pazienti
          </button>
          <button onClick={goReports} style={btnStyle("ghost")}>
            📈 Report
          </button>
          <button onClick={() => router.push(`/mobile/reports?tab=unpaid`)} style={btnStyle("ghost")}>
            💶 Non pagate
          </button>
        </div>
      </div>

      {/* Selected day agenda */}
      <div style={{ marginTop: 12, ...cardStyle, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 1100, color: UI.text, fontSize: 14 }}>Agenda del giorno</div>
            <div style={{ marginTop: 2, fontSize: 12, color: UI.muted, fontWeight: 900 }}>
              {headerDateLabel} · Totale: {todayAppts.length}
            </div>
          </div>
          <button onClick={loadAll} style={btnStyle("soft")} aria-label="Aggiorna">
            🔄
          </button>
        </div>

        {loading ? (
          <div style={{ color: UI.muted, fontWeight: 900, padding: 12 }}>Caricamento…</div>
        ) : todayAppts.length === 0 ? (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 16, border: `1px dashed ${UI.border}`, color: UI.muted, fontWeight: 900 }}>
            Nessun appuntamento in questa data.
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {todayAppts.map((a) => {
              const chip = statusChip(a.status);
              const phone = cleanPhone(a.patients?.phone);
              const msg = `Ciao ${fullName(a.patients)}, ti ricordo l'appuntamento ${relativeDayLabel(a.start_at)} alle ${itTime(a.start_at)}.`;
              return (
                <div key={a.id} style={{ border: `1px solid ${UI.border}`, borderRadius: 16, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 1100, color: UI.text, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {itTime(a.start_at)} · {fullName(a.patients)}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 12, color: UI.muted, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {a.treatment_type ?? "Seduta"}
                        {typeof a.amount === "number" && a.amount > 0 ? ` · €${a.amount}` : ""}
                      </div>
                    </div>

                    <span
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontWeight: 1100,
                        fontSize: 11,
                        color: "white",
                        background: chip.color,
                        flexShrink: 0,
                      }}
                    >
                      {chip.label}
                    </span>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => (a.patient_id ? router.push(`/mobile/patients/${a.patient_id}`) : undefined)}
                      style={btnStyle("soft")}
                    >
                      📄 Scheda
                    </button>

                    {phone ? (
                      <>
                        <a href={`tel:${phone}`} style={btnStyle("ghost")}>
                          📞 Chiama
                        </a>
                        <a href={waLink(phone, msg)} target="_blank" rel="noreferrer" style={btnStyle("ghost")}>
                          💬 WhatsApp
                        </a>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: UI.muted, fontWeight: 900, padding: "8px 0" }}>Telefono non disponibile</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Next appointments (scrollable) */}
      <div style={{ marginTop: 12, ...cardStyle, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontWeight: 1100, color: UI.text, fontSize: 14 }}>Prossimi appuntamenti</div>
            <div style={{ marginTop: 2, fontSize: 12, color: UI.muted, fontWeight: 900 }}>
              Finestra 7 giorni · Mostro 5 · Totale: {counts.upcoming7 ?? nextAppts.length}
            </div>
          </div>
          <button onClick={goMobileCalendar} style={btnStyle("soft")}>
            Vedi →
          </button>
        </div>

        <div
          style={{
            marginTop: 10,
            maxHeight: 220,
            overflowY: "auto",
            paddingRight: 4,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {nextFive.length === 0 ? (
            <div style={{ padding: 12, borderRadius: 16, border: `1px dashed ${UI.border}`, color: UI.muted, fontWeight: 900 }}>
              Nessun appuntamento imminente.
            </div>
          ) : (
            nextFive.map((a) => (
              <button
                key={a.id}
                onClick={() => (a.patient_id ? router.push(`/mobile/patients/${a.patient_id}`) : goMobileCalendar())}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: `1px solid ${UI.border}`,
                  background: "white",
                  borderRadius: 16,
                  padding: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 1100, color: UI.text, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {relativeDayLabel(a.start_at)} · {itTime(a.start_at)} · {fullName(a.patients)}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: UI.muted, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.treatment_type ?? "Seduta"}
                  {typeof a.amount === "number" && a.amount > 0 ? ` · €${a.amount}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, textAlign: "center", color: UI.muted, fontWeight: 900, fontSize: 12 }}>
        Tip: la lista “Prossimi appuntamenti” diventa scorrevole quando supera lo spazio. Niente scrollbar fissa a vista: compare solo quando serve.
      </div>
    </div>
  );
}
