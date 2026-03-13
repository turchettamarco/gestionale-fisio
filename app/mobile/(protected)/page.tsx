"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";
type LocationType = "studio" | "domicile";

type Appointment = {
  id: string;
  patient_id: string | null;
  start_at: string;
  status: Status;
  amount: number | null;
  is_paid: boolean;
  treatment_type: string | null;
  location: LocationType | null;
  clinic_site: string | null;
  domicile_address: string | null;
  whatsapp_sent_at: string | null;
  patients: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
};

// ─── Theme ────────────────────────────────────────────────────────────────────

const THEME = {
  appBg:      "#f1f5f9",
  panelBg:    "#ffffff",
  panelSoft:  "#f7f9fd",
  text:       "#0f172a",
  textSoft:   "#1e293b",
  muted:      "#334155",
  border:     "#cbd5e1",
  borderSoft: "#94a3b8",
  blue:       "#2563eb",
  green:      "#16a34a",
  red:        "#dc2626",
  amber:      "#f97316",
  gray:       "#94a3b8",
  gradient:   "linear-gradient(135deg, #0d9488, #2563eb)",
};

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusColor(s: Status): string {
  switch (s) {
    case "done":      return THEME.green;
    case "confirmed": return THEME.blue;
    case "not_paid":  return THEME.amber;
    case "cancelled": return THEME.gray;
    default:          return THEME.red;
  }
}

function statusBg(s: Status): string {
  switch (s) {
    case "done":      return "rgba(22,163,74,0.10)";
    case "confirmed": return "rgba(37,99,235,0.08)";
    case "not_paid":  return "rgba(249,115,22,0.10)";
    case "cancelled": return "rgba(148,163,184,0.08)";
    default:          return "rgba(220,38,38,0.08)";
  }
}

function statusLabel(s: Status): string {
  switch (s) {
    case "confirmed": return "Confermato";
    case "done":      return "Eseguito";
    case "not_paid":  return "Non pagata";
    case "cancelled": return "Annullato";
    default:          return "Prenotato";
  }
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

const CLINIC_ADDRESSES: Record<string, string> = {
  "Studio Pontecorvo": "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe",
};

function formatPhoneForWhatsAppWeb(phone: string): string {
  if (!phone) return phone;
  let clean = phone.replace(/[\s\(\)\-\.]/g, "");
  if (clean.startsWith("0")) clean = "39" + clean.substring(1);
  if (!clean.startsWith("+")) clean = "+" + clean;
  return clean;
}

function formatDateRelative(date: Date): string {
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  const domani = new Date(oggi); domani.setDate(oggi.getDate() + 1);
  const t = new Date(date); t.setHours(0, 0, 0, 0);
  if (t.getTime() === oggi.getTime())   return "Oggi";
  if (t.getTime() === domani.getTime()) return "Domani";
  const gg = ["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"];
  const mm = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
              "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  return `${gg[t.getDay()]} ${t.getDate()} ${mm[t.getMonth()]}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toYMD(d: Date)  { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function fullName(p?: Appointment["patients"]) {
  return `${(p?.last_name ?? "").trim()} ${(p?.first_name ?? "").trim()}`.trim() || "Paziente";
}
function sumPaid(appts: Appointment[]) {
  return appts.reduce((acc, a) => acc + (a.is_paid && typeof a.amount === "number" ? a.amount : 0), 0);
}
function sumDaIncassare(appts: Appointment[]) {
  return appts
    .filter(a => !a.is_paid && a.status !== "cancelled")
    .reduce((acc, a) => acc + (typeof a.amount === "number" ? a.amount : 0), 0);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MobileHomePage() {
  const router = useRouter();

  const nowRef   = useRef<Date>(new Date());
  const todayYMD = useMemo(() => toYMD(new Date()), []);
  const [dateYMD, setDateYMD] = useState(todayYMD);

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [pulling,  setPulling]  = useState(false); // pull-to-refresh visual

  const [todayAppts,   setTodayAppts]   = useState<Appointment[]>([]);
  const [nextAppts,    setNextAppts]    = useState<Appointment[]>([]);
  const [patientCount, setPatientCount] = useState<number | null>(null);

  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Pull-to-refresh state
  const touchStartY  = useRef<number>(0);
  const pullY        = useRef<number>(0);
  const [pullDist,   setPullDist]   = useState(0);
  const PULL_THRESHOLD = 64;

  // Live clock
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      nowRef.current = new Date();
      setTick(x => (x + 1) % 1_000_000);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        setUserEmail(data?.user?.email ?? null);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [userMenuOpen]);

  useEffect(() => { void loadAll(); }, [dateYMD]); // eslint-disable-line

  // ─── Pull-to-refresh handlers ─────────────────────────────────────────────

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    pullY.current = 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    const scrollTop = (e.currentTarget as HTMLElement).scrollTop ?? 0;
    if (scrollTop > 0) return; // solo se già in cima
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy < 0) return;
    pullY.current = dy;
    setPullDist(Math.min(dy, PULL_THRESHOLD * 1.4));
  }

  async function onTouchEnd() {
    if (pullY.current >= PULL_THRESHOLD) {
      setPulling(true);
      await loadAll();
      setPulling(false);
    }
    pullY.current = 0;
    setPullDist(0);
  }

  // ─── Data ─────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true); setError("");
    try {
      const SEL = `id, patient_id, start_at, status, amount, is_paid,
                   treatment_type, location, clinic_site, domicile_address,
                   whatsapp_sent_at,
                   patients:patient_id ( first_name, last_name, phone )`;

      const [dayRes, weekRes] = await Promise.all([
        supabase.from("appointments").select(SEL)
          .gte("start_at", `${dateYMD}T00:00:00`)
          .lt("start_at",  `${dateYMD}T23:59:59`)
          .order("start_at", { ascending: true }),
        supabase.from("appointments").select(SEL)
          .gte("start_at", new Date().toISOString())
          .lt("start_at",  addDays(new Date(), 7).toISOString())
          .order("start_at", { ascending: true }),
      ]);

      if (dayRes.error)  throw dayRes.error;
      if (weekRes.error) throw weekRes.error;

      const map = (a: any): Appointment => {
        const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
        return {
          id: a.id, patient_id: a.patient_id ?? null,
          start_at: a.start_at, status: a.status as Status,
          amount: a.amount ?? null, is_paid: a.is_paid ?? false,
          treatment_type: a.treatment_type ?? null,
          location: (a.location as LocationType) ?? null,
          clinic_site: a.clinic_site ?? null,
          domicile_address: a.domicile_address ?? null,
          whatsapp_sent_at: a.whatsapp_sent_at ?? null,
          patients: p ?? null,
        };
      };

      setTodayAppts((dayRes.data  ?? []).map(map));
      setNextAppts( (weekRes.data ?? []).map(map));

      const pcRes = await supabase.from("patients").select("*", { count: "exact", head: true });
      if (!pcRes.error) setPatientCount(pcRes.count ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Errore imprevisto");
      setTodayAppts([]); setNextAppts([]);
    } finally { setLoading(false); }
  }

  // ─── WhatsApp ─────────────────────────────────────────────────────────────

  const sendReminder = useCallback(async (appt: Appointment) => {
    const phone = appt.patients?.phone;
    if (!phone) { alert("Nessun numero registrato per questo paziente."); return; }

    const { data: tplData } = await supabase
      .from("message_templates").select("template")
      .eq("name", "Promemoria").maybeSingle();

    let tpl = `Buongiorno {nome},\n\nLe ricordiamo il suo appuntamento di {data_relativa} alle ore ⏰ {ora}.\n\n📍 {luogo}\n\nCordiali saluti,\nDr. Marco Turchetta\nFisioterapia e Osteopatia`;
    if (tplData?.template) tpl = tplData.template;

    const cleanPhone   = formatPhoneForWhatsAppWeb(phone);
    const dataRelativa = formatDateRelative(new Date(appt.start_at));
    const ora          = fmtTime(appt.start_at);
    const luogo        = appt.location === "studio"
      ? (CLINIC_ADDRESSES[appt.clinic_site ?? ""] || appt.clinic_site || "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe")
      : `Presso il suo domicilio (${appt.domicile_address ?? ""})`;
    const nome = (appt.patients?.first_name ?? "").trim() || "Cliente";

    const message = tpl
      .replace(/{nome}/g,          nome)
      .replace(/{data_relativa}/g, dataRelativa)
      .replace(/{ora}/g,           ora)
      .replace(/{luogo}/g,         luogo);

    const waUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
    const ok = window.confirm(`📱 PROMEMORIA WHATSAPP\n\nDestinatario: ${phone}\n\nMessaggio:\n${message}\n\nClicca OK per aprire WhatsApp.`);
    if (!ok) return;

    const win = window.open(waUrl, "_blank");
    const nowIso = new Date().toISOString();
    await supabase.from("appointments")
      .update({ whatsapp_sent_at: nowIso, whatsapp_sent: true }).eq("id", appt.id);
    setTodayAppts(prev => prev.map(a => a.id === appt.id ? { ...a, whatsapp_sent_at: nowIso } : a));

    if (!win || win.closed || typeof win.closed === "undefined") {
      const fb = window.confirm("Il browser ha bloccato WhatsApp.\nOK per redirect, Annulla per copiare il link.");
      if (fb) window.location.href = waUrl;
      else alert(`Copia il link:\n\n${waUrl}`);
    }
  }, []);

  // ─── Logout ───────────────────────────────────────────────────────────────

  async function handleLogout() {
    try { await supabase.auth.signOut(); } finally {
      setUserMenuOpen(false);
      window.location.href = "/login";
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const now    = nowRef.current;
  const nowISO = now.toISOString();

  const isToday = dateYMD === todayYMD;
  const isPast  = dateYMD < todayYMD;

  const totalActive = useMemo(
    () => todayAppts.filter(a => a.status !== "cancelled").length,
    [todayAppts]
  );

  const completate = useMemo(() => {
    if (isToday) return todayAppts.filter(a => a.start_at < nowISO && a.status !== "cancelled").length;
    if (isPast)  return todayAppts.filter(a => a.status !== "cancelled").length;
    return 0;
  }, [todayAppts, nowISO, isToday, isPast, tick]); // eslint-disable-line

  const incasso      = useMemo(() => sumPaid(todayAppts),        [todayAppts]);
  const daIncassare  = useMemo(() => sumDaIncassare(todayAppts), [todayAppts]);

  const nextFive = useMemo(() =>
    nextAppts.filter(a => a.start_at >= nowISO && a.status !== "cancelled").slice(0, 5),
  [nextAppts, nowISO, tick]); // eslint-disable-line

  const kpiNext = nextFive[0] ?? null;

  const headerDateLabel = useMemo(() => {
    const d = new Date(`${dateYMD}T00:00:00`);
    const s = d.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [dateYMD]);

  const userInitials = useMemo(() => {
    if (!userEmail) return "U";
    const left  = userEmail.split("@")[0] || "U";
    const parts = left.replace(/[^a-zA-Z0-9]/g, " ").split(" ").filter(Boolean);
    return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase().slice(0, 2);
  }, [userEmail]);

  function shiftDay(delta: number) {
    const d = new Date(`${dateYMD}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setDateYMD(toYMD(d));
  }

  // ─── Style atoms ──────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: THEME.panelBg,
    border: `1.5px solid ${THEME.border}`,
    borderRadius: 14,
    boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
  };

  function btnGradient(extra?: React.CSSProperties): React.CSSProperties {
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "9px 16px", borderRadius: 10, border: "none",
      background: THEME.gradient, color: "#fff",
      fontWeight: 700, fontSize: 13, cursor: "pointer",
      boxShadow: "0 2px 8px rgba(13,148,136,0.25)",
      ...extra,
    };
  }

  function btnOutline(extra?: React.CSSProperties): React.CSSProperties {
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "8px 14px", borderRadius: 10,
      border: `1.5px solid ${THEME.border}`,
      background: THEME.panelBg, color: THEME.text,
      fontWeight: 600, fontSize: 13, cursor: "pointer",
      ...extra,
    };
  }

  function btnSoft(extra?: React.CSSProperties): React.CSSProperties {
    return {
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "8px 14px", borderRadius: 10, border: "none",
      background: "rgba(37,99,235,0.09)", color: THEME.blue,
      fontWeight: 700, fontSize: 13, cursor: "pointer",
      ...extra,
    };
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, fontFamily: "Inter, -apple-system, sans-serif" }}>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        background: THEME.gradient,
        padding: "0 14px", height: 54,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(13,148,136,0.18)",
        gap: 10,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "rgba(255,255,255,0.2)",
            border: "1.5px solid rgba(255,255,255,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 800, fontSize: 13,
          }}>F</div>
          <span style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: 0.3, textTransform: "uppercase" }}>
            Fisio<span style={{ fontWeight: 700 }}>Hub</span>
          </span>
        </div>

        {/* KPI chips */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {!loading && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#fff",
              background: "rgba(255,255,255,0.2)", padding: "4px 9px",
              borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap",
            }}>✓ {completate}/{totalActive}</span>
          )}
          {!loading && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#fff",
              background: "rgba(255,255,255,0.2)", padding: "4px 9px",
              borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", whiteSpace: "nowrap",
            }}>€ {incasso.toFixed(0)}</span>
          )}
        </div>

        {/* Refresh + Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <button onClick={loadAll} aria-label="Aggiorna" style={{
            width: 30, height: 30, borderRadius: 7,
            border: "1.5px solid rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.15)",
            color: "#fff", cursor: "pointer", fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>↺</button>

          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button onClick={() => setUserMenuOpen(v => !v)} style={{
              width: 30, height: 30, borderRadius: 7,
              border: "1.5px solid rgba(255,255,255,0.35)",
              background: "rgba(255,255,255,0.2)",
              color: "#fff", fontWeight: 800, fontSize: 11,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>{userInitials}</button>
            {userMenuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)", width: 190,
                background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
                borderRadius: 12, boxShadow: "0 12px 32px rgba(30,64,175,0.15)",
                overflow: "hidden", zIndex: 60,
              }}>
                <Link href="/settings" onClick={() => setUserMenuOpen(false)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                  color: THEME.text, textDecoration: "none", fontSize: 13, fontWeight: 600,
                  borderBottom: `1.5px solid ${THEME.border}`,
                }}>⚙️ Impostazioni</Link>
                <button onClick={handleLogout} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 16px", background: "transparent", border: "none",
                  cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13,
                }}>⏻ Logout</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ━━━ TAB BAR BOTTOM ━━━ */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
        background: THEME.panelBg, borderTop: `1.5px solid ${THEME.border}`,
        display: "flex", boxShadow: "0 -4px 16px rgba(15,23,42,0.08)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {[
          { href: "/mobile",          label: "Home",      icon: "⌂",  active: true },
          { href: "/mobile/calendar", label: "Calendario",icon: "▦" },
          { href: "/mobile/patients", label: "Pazienti",  icon: "◉" },
          { href: "/mobile/reports",  label: "Report",    icon: "◈" },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "10px 4px 9px", textDecoration: "none", gap: 3,
            position: "relative",
          }}>
            <span style={{
              fontSize: 18, lineHeight: 1,
              ...(item.active ? {
                background: THEME.gradient,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              } : { color: THEME.muted }),
            }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: item.active ? 700 : 600,
                           color: item.active ? THEME.blue : THEME.muted }}>
              {item.label}
            </span>
            {item.active && (
              <div style={{
                position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                width: 28, height: 2.5, borderRadius: 999, background: THEME.gradient,
              }} />
            )}
          </Link>
        ))}
      </nav>

      {/* ━━━ FAB: Nuovo appuntamento ━━━ */}
      <button
        onClick={() => router.push(`/mobile/calendar?date=${dateYMD}&action=new`)}
        aria-label="Nuovo appuntamento"
        style={{
          position: "fixed", bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)", right: 18,
          zIndex: 40,
          width: 52, height: 52, borderRadius: "50%",
          background: THEME.gradient, color: "#fff",
          border: "none", cursor: "pointer",
          fontSize: 26, fontWeight: 300,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(13,148,136,0.40)",
        }}
      >+</button>

      {/* ━━━ CONTENUTO (pull-to-refresh wrapper) ━━━ */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ padding: 14, paddingBottom: 100, overflowY: "auto" }}
      >
        {/* ── Indicatore pull-to-refresh ── */}
        {pullDist > 10 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: Math.min(pullDist, PULL_THRESHOLD * 1.4),
            color: THEME.blue, fontWeight: 700, fontSize: 12,
            transition: "height 0.1s",
          }}>
            {pulling || pullDist >= PULL_THRESHOLD ? "↺ Rilascia per aggiornare" : "↓ Trascina per aggiornare"}
          </div>
        )}

        {/* ── Navigazione data ‹ Oggi › ── */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <button onClick={() => shiftDay(-1)} aria-label="Giorno precedente"
            style={btnOutline({ padding: "9px 16px", fontSize: 18, flexShrink: 0 })}>‹</button>

          <button onClick={() => setDateYMD(todayYMD)} style={{
            flex: 1, padding: "9px 12px", borderRadius: 10, fontSize: 14,
            fontWeight: 700, cursor: "pointer", textAlign: "center", letterSpacing: -0.2,
            border: isToday ? `2px solid ${THEME.blue}` : `1.5px solid ${THEME.border}`,
            background: isToday ? "rgba(37,99,235,0.08)" : THEME.panelBg,
            color: isToday ? THEME.blue : THEME.text,
          }}>
            {isToday ? "Oggi" : headerDateLabel}
          </button>

          <button onClick={() => shiftDay(1)} aria-label="Giorno successivo"
            style={btnOutline({ padding: "9px 16px", fontSize: 18, flexShrink: 0 })}>›</button>

          <button onClick={() => router.push(`/mobile/calendar?date=${dateYMD}`)}
            style={btnGradient({ flexShrink: 0, padding: "9px 14px" })} aria-label="Apri calendario">
            📅
          </button>
        </div>

        {/* ── Errore ── */}
        {error && (
          <div style={{
            marginBottom: 12, padding: 12, borderRadius: 10,
            border: "1.5px solid rgba(220,38,38,0.3)",
            background: "rgba(220,38,38,0.06)",
            color: "#7f1d1d", fontWeight: 600, fontSize: 13,
          }}>⚠️ {error}</div>
        )}

        {/* ── KPI card ── */}
        <div style={{ ...card, padding: 16, marginBottom: 10 }}>
          {/* Riga numeri */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft }}>Riepilogo</div>
              <div style={{ marginTop: 3, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                {loading ? "—" : `${totalActive} sedute`}
                {patientCount !== null ? ` · ${patientCount} pazienti` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: THEME.muted, fontWeight: 600,
                            textTransform: "uppercase", letterSpacing: 0.4 }}>Incassato</div>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1,
                            color: loading ? THEME.muted : THEME.green }}>
                {loading ? "—" : `€${incasso.toFixed(0)}`}
              </div>
              {/* ① Da incassare accanto all'incasso */}
              {!loading && daIncassare > 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: THEME.amber, marginTop: 2 }}>
                  € {daIncassare.toFixed(0)} da incassare
                </div>
              )}
            </div>
          </div>

          {/* ② Progress bar sedute */}
          {!loading && totalActive > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: THEME.muted, fontWeight: 600 }}>Sedute completate</span>
                <span style={{ fontSize: 12, fontWeight: 800,
                               color: completate === totalActive ? THEME.green : THEME.blue }}>
                  {completate}/{totalActive}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: THEME.border, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 999,
                  width: `${Math.round((completate / totalActive) * 100)}%`,
                  background: completate === totalActive ? THEME.green : THEME.gradient,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
          )}

          {/* Prossima seduta */}
          {!loading && kpiNext && (
            <div style={{
              marginTop: 14, padding: 12, borderRadius: 10,
              border: `1.5px solid rgba(37,99,235,0.2)`,
              background: "rgba(37,99,235,0.04)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: THEME.blue, marginBottom: 3,
                                textTransform: "uppercase", letterSpacing: 0.4 }}>Prossima seduta</div>
                  <div style={{ fontWeight: 700, color: THEME.text, fontSize: 14,
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fmtTime(kpiNext.start_at)} · {fullName(kpiNext.patients)}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: THEME.muted, fontWeight: 600 }}>
                    {kpiNext.treatment_type ?? "Seduta"}
                    {typeof kpiNext.amount === "number" && kpiNext.amount > 0 ? ` · €${kpiNext.amount}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => kpiNext.patient_id && router.push(`/mobile/patients/${kpiNext.patient_id}`)}
                  style={btnGradient({ flexShrink: 0, fontSize: 12, padding: "8px 14px" })}
                >Apri →</button>
              </div>
            </div>
          )}

          {!loading && !kpiNext && isToday && (
            <div style={{ marginTop: 14, padding: 10, borderRadius: 10,
                          border: `1.5px dashed ${THEME.border}`, color: THEME.muted,
                          fontSize: 12, fontWeight: 600 }}>
              Nessun prossimo appuntamento nei prossimi 7 giorni.
            </div>
          )}
        </div>

        {/* ── Agenda del giorno ── */}
        <div style={{ ...card, padding: 16, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft }}>Agenda del giorno</div>
              <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600, marginTop: 2 }}>
                {headerDateLabel} · {todayAppts.length} appuntamenti
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "14px 0", color: THEME.muted, fontWeight: 600, fontSize: 13 }}>
              Caricamento…
            </div>
          ) : todayAppts.length === 0 ? (
            /* ⑤ Empty state con CTA */
            <div style={{ padding: 20, borderRadius: 10, border: `1.5px dashed ${THEME.border}`,
                          textAlign: "center" }}>
              <div style={{ color: THEME.muted, fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
                Nessun appuntamento in questa data.
              </div>
              <button
                onClick={() => router.push(`/mobile/calendar?date=${dateYMD}&action=new`)}
                style={btnGradient({ fontSize: 12, padding: "8px 16px" })}
              >+ Nuovo appuntamento</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {todayAppts.map(a => {
                const phone   = a.patients?.phone;
                const waSent  = !!a.whatsapp_sent_at;
                // ③ Appuntamenti passati oggi → opacity ridotta
                const isPastAppt = isToday && a.start_at < nowISO;

                return (
                  <div key={a.id} style={{
                    borderRadius: 10,
                    border: `1.5px solid ${isPastAppt ? "transparent" : THEME.border}`,
                    background: isPastAppt ? THEME.panelSoft : statusBg(a.status),
                    padding: "11px 13px",
                    opacity: isPastAppt ? 0.65 : 1,
                    transition: "opacity 0.3s",
                  }}>
                    {/* Riga principale */}
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  alignItems: "flex-start", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700,
                                      color: isPastAppt ? THEME.muted : THEME.text,
                                      fontSize: 14, whiteSpace: "nowrap",
                                      overflow: "hidden", textOverflow: "ellipsis",
                                      display: "flex", alignItems: "center", gap: 6 }}>
                          {fmtTime(a.start_at)} · {fullName(a.patients)}
                          {/* ② Icona pagato */}
                          {a.is_paid && (
                            <span title="Pagato" style={{ fontSize: 13, flexShrink: 0 }}>💰</span>
                          )}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 12, color: THEME.muted,
                                      fontWeight: 600, whiteSpace: "nowrap",
                                      overflow: "hidden", textOverflow: "ellipsis" }}>
                          {a.treatment_type ?? "Seduta"}
                          {typeof a.amount === "number" && a.amount > 0 ? ` · €${a.amount}` : ""}
                          {isPastAppt && (
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700,
                                           color: THEME.gray, textTransform: "uppercase",
                                           letterSpacing: 0.3 }}>· passato</span>
                          )}
                        </div>
                      </div>
                      {/* Chip status */}
                      <span style={{
                        padding: "4px 9px", borderRadius: 999,
                        fontWeight: 700, fontSize: 11,
                        color: statusColor(a.status),
                        background: THEME.panelBg,
                        border: `1.5px solid ${statusColor(a.status)}`,
                        flexShrink: 0, whiteSpace: "nowrap",
                        opacity: isPastAppt ? 0.6 : 1,
                      }}>
                        {statusLabel(a.status)}
                      </span>
                    </div>

                    {/* Azioni */}
                    <div style={{ marginTop: 9, display: "flex", gap: 7, flexWrap: "wrap" }}>
                      <button
                        onClick={() => a.patient_id && router.push(`/mobile/patients/${a.patient_id}`)}
                        style={btnSoft({ fontSize: 12, padding: "7px 12px" })}
                      >📄 Scheda</button>

                      {phone ? (
                        <>
                          <a href={`tel:${formatPhoneForWhatsAppWeb(phone)}`}
                             style={btnOutline({ fontSize: 12, padding: "7px 12px" })}>
                            📞 Chiama
                          </a>
                          <button
                            onClick={() => sendReminder(a)}
                            title={waSent
                              ? `Inviato il ${new Date(a.whatsapp_sent_at!).toLocaleDateString("it-IT")}`
                              : "Invia promemoria WhatsApp"}
                            style={btnOutline({
                              fontSize: 12, padding: "7px 12px",
                              color:       waSent ? THEME.green : THEME.text,
                              borderColor: waSent ? THEME.green : THEME.border,
                            })}
                          >{waSent ? "✓ WA inviato" : "💬 WA"}</button>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: THEME.muted,
                                       fontWeight: 600, padding: "7px 0" }}>
                          Nessun telefono
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Prossimi 7 giorni ── */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between",
                        alignItems: "baseline", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft }}>Prossimi appuntamenti</div>
              <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 600, marginTop: 2 }}>
                Prossimi 7 giorni · {nextFive.length} appuntamenti
              </div>
            </div>
            <button onClick={() => router.push(`/mobile/calendar?date=${dateYMD}`)}
              style={btnSoft({ fontSize: 12, padding: "7px 12px" })}>
              Vedi tutto →
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6,
                        maxHeight: 240, overflowY: "auto" }}>
            {nextFive.length === 0 ? (
              <div style={{ padding: 14, borderRadius: 10,
                            border: `1.5px dashed ${THEME.border}`,
                            color: THEME.muted, fontWeight: 600, fontSize: 13 }}>
                Nessun appuntamento imminente.
              </div>
            ) : nextFive.map(a => (
              <button
                key={a.id}
                onClick={() => a.patient_id
                  ? router.push(`/mobile/patients/${a.patient_id}`)
                  : router.push(`/mobile/calendar?date=${dateYMD}`)}
                style={{
                  width: "100%", textAlign: "left", cursor: "pointer",
                  borderRadius: 10,
                  border: `1.5px solid ${THEME.border}`,
                  background: statusBg(a.status),
                  padding: "10px 13px",
                }}
              >
                <div style={{ fontWeight: 700, color: THEME.text, fontSize: 13,
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                              display: "flex", alignItems: "center", gap: 5 }}>
                  {formatDateRelative(new Date(a.start_at))} · {fmtTime(a.start_at)} · {fullName(a.patients)}
                  {/* ② Icona pagato anche nei prossimi */}
                  {a.is_paid && <span style={{ fontSize: 12, flexShrink: 0 }}>💰</span>}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: THEME.muted, fontWeight: 600,
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.treatment_type ?? "Seduta"}
                  {typeof a.amount === "number" && a.amount > 0 ? ` · €${a.amount}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>{/* fine contenuto */}
    </div>
  );
}
