"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabaseClient";


// -----------------------------------------------------------------------------
// TIPI
// -----------------------------------------------------------------------------
type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";
type LocationType = "studio" | "domicile";

type AppointmentRow = {
  id: string;
  patient_id: string;
  start_at: string;
  end_at: string;
  status: Status;
  location: LocationType;
  clinic_site: string | null;
  domicile_address: string | null;
  amount: number | string | null;
  price_type?: string | null;
  treatment_type?: string | null;
  patients?: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    status?: string | null;
  }[] | null;
};

type InactivePatientRow = {
  patient_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  last_done_at: string; // ISO
  days_since_last: number;
};

// -----------------------------------------------------------------------------
// UTILITIES (invariate)
// -----------------------------------------------------------------------------
const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};
const maxDate = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const mondayStart = (d: Date) => {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  return addDays(x, diff);
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
const fmtWeekday = (date: Date) =>
  date.toLocaleDateString("it-IT", { weekday: "long" });
const formatDateRelative = (date: Date): string => {
  const oggi = startOfDay(new Date());
  const domani = addDays(oggi, 1);
  const d = startOfDay(date);
  if (isSameDay(d, oggi)) return "oggi";
  if (isSameDay(d, domani)) return "domani";
  return d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
};

const money = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("it-IT", {
    maximumFractionDigits: 0,
  }) + "€";

const formatPhoneForWhatsAppWeb = (phone: string) => {
  if (!phone) return "";
  let clean = phone.trim().replace(/[^\d+]/g, "");
  if (!clean) return "";
  if (clean.startsWith("00")) clean = "+" + clean.slice(2);
  if (!clean.startsWith("+")) {
    if (clean.length >= 9 && clean.length <= 11) clean = "+39" + clean;
  }
  return clean.replace(/\+/g, "").replace(/\s/g, "");
};

const pickPatient = (p: AppointmentRow["patients"]) => {
  if (Array.isArray(p)) return p[0] ?? null;
  // In caso qualche query legacy torni ancora oggetto singolo
  return (p as any) ?? null;
};

const patientDisplayName = (p: AppointmentRow["patients"]) => {
  const pp = pickPatient(p);
  const last = (pp?.last_name || "").trim();
  const first = (pp?.first_name || "").trim();
  const full = `${last} ${first}`.trim();
  return full || "Paziente";
};

const buildWhatsAppMessage = (appt: AppointmentRow) => {
  const firstName = (pickPatient(appt.patients)?.first_name || "").trim() || "Cliente";
  const start = new Date(appt.start_at);
  const dataRel = formatDateRelative(start);
  const ora = fmtTime(appt.start_at);
  const luogo =
    appt.location === "studio"
      ? appt.clinic_site || "Studio"
      : `Domicilio (${appt.domicile_address || "indirizzo da confermare"})`;

  return `Buongiorno ${firstName},\n\nLe ricordiamo il suo appuntamento di ${dataRel} alle ore ${ora}.\n\n📍 ${luogo}\n\nA presto,\nFisioHub - Studi Galileo`;
};

const openWhatsApp = (phone: string, message: string) => {
  const cleanPhone = formatPhoneForWhatsAppWeb(phone);
  if (!cleanPhone) {
    alert("Numero di telefono non valido o mancante.");
    return;
  }
  const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(
    message
  )}`;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

// -----------------------------------------------------------------------------
// HOOK TRACKER WHATSAPP (locale)
// -----------------------------------------------------------------------------
const useWASentTracker = () => {
  const key = "fisiohub_wa_sent_v1";
  const [sentMap, setSentMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setSentMap(JSON.parse(raw));
    } catch {}
  }, []);

  const setSent = useCallback((id: string, v: boolean) => {
    setSentMap((prev) => {
      const next = { ...prev, [id]: v };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { sentMap, setSent };
};

// -----------------------------------------------------------------------------
// DESIGN SYSTEM (variabili CSS globali)
// -----------------------------------------------------------------------------
const theme = {
  primary: "#2563eb",
  primaryLight: "#dbeafe",
  secondary: "#0d9488",
  secondaryLight: "#ccfbf1",
  accent: "#f97316",
  accentLight: "#ffedd5",
  success: "#16a34a",
  successLight: "#dcfce7",
  danger: "#dc2626",
  dangerLight: "#fee2e2",
  warning: "#f59e0b",
  warningLight: "#fef3c7",
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },
  background: "#f8fafc",
  cardBg: "rgba(255,255,255,0.9)",
  glassBorder: "rgba(255,255,255,0.5)",
  shadow: "0 8px 32px rgba(0,0,0,0.04)",
  shadowHover: "0 20px 40px rgba(0,0,0,0.08)",
};

// -----------------------------------------------------------------------------
// COMPONENTI PRESENTAZIONALI RIUTILIZZABILI
// -----------------------------------------------------------------------------

const StatusPill = ({ status }: { status: Status }) => {
  const meta = useMemo(() => {
    switch (status) {
      case "done":
        return { label: "Fatto", bg: theme.successLight, fg: theme.success, border: "#bbf7d0" };
      case "confirmed":
        return { label: "Conferm.", bg: theme.secondaryLight, fg: theme.secondary, border: "#99f6e4" };
      case "booked":
        return { label: "Prenot.", bg: theme.primaryLight, fg: theme.primary, border: "#bfdbfe" };
      case "cancelled":
        return { label: "Annull.", bg: theme.dangerLight, fg: theme.danger, border: "#fecaca" };
      case "not_paid":
        return { label: "Non pag.", bg: theme.warningLight, fg: theme.warning, border: "#fed7aa" };
      default:
        return { label: status, bg: theme.gray[100], fg: theme.gray[600], border: theme.gray[300] };
    }
  }, [status]);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: "9999px",
        fontSize: "0.65rem",
        fontWeight: 700,
        letterSpacing: "0.2px",
        backgroundColor: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.border}`,
        whiteSpace: "nowrap",
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      }}
    >
      {meta.label}
    </span>
  );
};

const Avatar = ({ name, patientId }: { name: string; patientId?: string }) => {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const content = (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: "0.75rem",
        boxShadow: "0 4px 8px rgba(37,99,235,0.2)",
        flexShrink: 0,
      }}
    >
      {initials || "👤"}
    </div>
  );
  if (patientId) {
    return <Link href={`/patients/${patientId}`}>{content}</Link>;
  }
  return content;
};

const Skeleton = ({ height, width, style }: { height?: number; width?: number | string; style?: React.CSSProperties }) => (
  <div
    style={{
      height: height ?? 20,
      width: width ?? "100%",
      background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
      borderRadius: "12px",
      ...style,
    }}
  />
);

const MiniCalendar = ({ appointments }: { appointments: AppointmentRow[] }) => {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const appointmentDays = useMemo(() => {
    const days = new Set();
    appointments.forEach((a) => {
      const d = new Date(a.start_at);
      if (d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()) {
        days.add(d.getDate());
      }
    });
    return days;
  }, [appointments, currentMonth]);

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const weekDays = ["L", "M", "M", "G", "V", "S", "D"];

  return (
    <div style={{ background: "white", borderRadius: 20, padding: 16, border: "1px solid rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
          {currentMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
        </span>
        <div>
          <button onClick={prevMonth} style={calendarNavButton}>&lt;</button>
          <button onClick={nextMonth} style={calendarNavButton}>&gt;</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center" }}>
        {weekDays.map((d, idx) => (
          <div
            key={`day-${d}-${idx}`}
            style={{ fontSize: "0.7rem", color: theme.gray[500], fontWeight: 600, padding: 4 }}
          >
            {d}
          </div>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = today.getDate() === day && today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear();
          const hasAppointment = appointmentDays.has(day);
          return (
            <div
              key={day}
              style={{
                padding: "6px 0",
                fontSize: "0.8rem",
                fontWeight: isToday ? 800 : 500,
                background: isToday ? theme.primaryLight : "transparent",
                color: isToday ? theme.primary : theme.gray[700],
                borderRadius: 30,
                position: "relative",
              }}
            >
              {day}
              {hasAppointment && (
                <span style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: theme.success }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
const calendarNavButton = {
  border: "none",
  background: theme.gray[100],
  borderRadius: 20,
  width: 28,
  height: 28,
  marginLeft: 4,
  cursor: "pointer",
  fontWeight: 700,
  color: theme.gray[700],
};

const WeeklyChart = ({ thisWeek, lastWeek }: { thisWeek: number[]; lastWeek: number[] }) => {
  const max = Math.max(...thisWeek, ...lastWeek, 1);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: theme.primary }} />
          <span style={{ fontSize: "0.7rem", color: theme.gray[600] }}>Questa sett.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: theme.gray[300] }} />
          <span style={{ fontSize: "0.7rem", color: theme.gray[600] }}>Sett. scorsa</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        {thisWeek.map((count, idx) => {
          const dayName = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"][idx];
          const thisPercent = (count / max) * 100;
          const lastPercent = (lastWeek[idx] / max) * 100;
          return (
            <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <span style={{ fontSize: "0.65rem", color: theme.gray[500], marginBottom: 4 }}>{dayName}</span>
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                <div
                  style={{ height: 8, width: `${lastPercent}%`, background: theme.gray[300], borderRadius: 4, transition: "width 0.2s" }}
                  title={`Sett. scorsa: ${lastWeek[idx]}`}
                />
                <div
                  style={{ height: 8, width: `${thisPercent}%`, background: theme.primary, borderRadius: 4, transition: "width 0.2s" }}
                  title={`Questa sett.: ${count}`}
                />
              </div>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, marginTop: 6, color: theme.gray[800] }}>{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// COMPONENTI NUOVI PER LA SIDEBAR PRIORITARIA
// -----------------------------------------------------------------------------

// Countdown in tempo reale
const useCountdown = (targetISO: string | null) => {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!targetISO) {
      setTimeLeft("");
      return;
    }
    const target = new Date(targetISO).getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft("Ora");
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m`);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [targetISO]);

  return timeLeft;
};

// Card del prossimo appuntamento – in grande evidenza
const NextAppointmentEnhanced = ({
  appointment,
  onMarkDone,
  onCancel,
}: {
  appointment: AppointmentRow | null;
  onMarkDone?: (id: string) => void;
  onCancel?: (id: string) => void;
}) => {
  const router = useRouter();
  const timeLeft = useCountdown(appointment?.start_at ?? null);

  if (!appointment) {
    return (
      <div style={{ ...cardStyle, padding: "24px", textAlign: "center", color: theme.gray[500] }}>
        <span style={{ fontSize: "3rem" }}>🌿</span>
        <p style={{ marginTop: 12 }}>Nessun appuntamento in arrivo.</p>
      </div>
    );
  }

  const name = patientDisplayName(appointment.patients);
  const phone = pickPatient(appointment.patients)?.phone || "";
  const start = new Date(appointment.start_at);
  const formattedDate = start.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });
  const formattedTime = fmtTime(appointment.start_at);
  const location = appointment.location === "studio"
    ? appointment.clinic_site || "Studio"
    : `Domicilio (${appointment.domicile_address || "indirizzo da confermare"})`;

  return (
    <div
      style={{
        ...cardStyle,
        background: "linear-gradient(145deg, #ffffff, #f8fafc)",
        border: `1px solid ${theme.primary}30`,
        boxShadow: `0 20px 30px -8px ${theme.primary}30`,
        padding: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
          padding: "20px 24px",
          color: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span style={{ fontSize: "0.75rem", opacity: 0.9, textTransform: "uppercase", letterSpacing: "1px" }}>
            Prossimo appuntamento
          </span>
          <h3 style={{ fontSize: "1.6rem", fontWeight: 800, margin: "8px 0 0", lineHeight: 1.2 }}>
            {formattedTime}
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "0.9rem", opacity: 0.95 }}>
            {formattedDate}
          </p>
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.2)",
            backdropFilter: "blur(8px)",
            borderRadius: 40,
            padding: "12px 18px",
            fontSize: "1.4rem",
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          {timeLeft || "—"}
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
          <Avatar name={name} patientId={appointment.patient_id} />
          <div>
            <Link
              href={`/patients/${appointment.patient_id}`}
              style={{ fontWeight: 800, fontSize: "1.1rem", color: theme.gray[900], textDecoration: "none" }}
            >
              {name}
            </Link>
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <span style={chipStyle}>{location}</span>
              <StatusPill status={appointment.status} />
              {appointment.amount && (
                <span style={chipStyle}>🧾 {typeof appointment.amount === "string" ? appointment.amount : appointment.amount}€</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            style={buttonPrimaryStyle}
            onClick={() => router.push(`/appointments/${appointment.id}/checkin`)}
          >
            
            ✅ Fatto
          </button>
          <button
            style={buttonWAStyle}
            onClick={() => {
              const msg = buildWhatsAppMessage(appointment);
              openWhatsApp(phone, msg);
            }}
          >
            💬 WhatsApp
          </button>
                  <button
            style={buttonDangerGhostStyle}
            onClick={() => {
              if (confirm("Annullare l'appuntamento?")) onCancel?.(appointment.id);
            }}
          >
            ✕ Annulla
          </button>
        </div>
      </div>
    </div>
  );
};

// Versione compatta per gli altri appuntamenti di oggi (dopo il prossimo)
const CompactAppointmentRow = ({ a }: { a: AppointmentRow }) => {
  const name = patientDisplayName(a.patients);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        background: "white",
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.02)",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <Avatar name={name} patientId={a.patient_id} />
        <div>
          <Link
            href={`/patients/${a.patient_id}`}
            style={{ fontWeight: 700, fontSize: "0.85rem", color: theme.gray[900], textDecoration: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}
          >
            {name}
          </Link>
          <div style={{ fontSize: "0.65rem", color: theme.gray[500] }}>
            {fmtTime(a.start_at)} • {a.location === "studio" ? a.clinic_site || "Studio" : "Domicilio"}
          </div>
        </div>
      </div>
      <StatusPill status={a.status} />
    </div>
  );
};

// -----------------------------------------------------------------------------
// COMPONENTE PRINCIPALE
// -----------------------------------------------------------------------------
export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [tab, setTab] = useState<"today" | "next7" | "thisWeek">("today");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { sentMap, setSent } = useWASentTracker();

  // --- USER MENU (Logout) ---
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userInitials = useMemo(() => {
    const base = (userEmail || "").trim();
    if (!base) return "U";
    // Se è un'email, prendo le prime 2 lettere prima della @
    const left = base.split("@")[0] || base;
    const letters = left.replace(/[^a-zA-Z]/g, "").toUpperCase();
    return (letters.slice(0, 2) || "U").padEnd(2, "U");
  }, [userEmail]);

  const handleLogout = useCallback(async () => {
    try {
      setUserMenuOpen(false);
      await supabase.auth.signOut();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        setUserEmail(data.user?.email ?? null);
      } catch {
        if (!alive) return;
        setUserEmail(null);
      }
    })();

    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Chiudo se clicco fuori dal menu (uso data-user-menu)
      const inside = target.closest?.('[data-user-menu="wrap"]');
      if (!inside) setUserMenuOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    return () => {
      alive = false;
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  const [inactiveThreshold, setInactiveThreshold] = useState<30 | 45 | 60>(45);
  const [inactivePatients, setInactivePatients] = useState<InactivePatientRow[]>([]);
  const [inactiveLoading, setInactiveLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const yesterday = useMemo(() => addDays(today, -1), [today]);
  const thisWeekStart = useMemo(() => mondayStart(new Date()), []);
  const thisWeekEnd = useMemo(() => addDays(thisWeekStart, 7), [thisWeekStart]);
  const lastWeekStart = useMemo(() => addDays(thisWeekStart, -7), [thisWeekStart]);
  const lastWeekEnd = useMemo(() => thisWeekStart, [thisWeekStart]);

  // Funzione per ricaricare i dati dopo operazioni CRUD
  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const start = lastWeekStart;
      const endNext7 = addDays(startOfDay(new Date()), 8);
      const end = maxDate(thisWeekEnd, endNext7);
      const { data, error } = await supabase
        .from("appointments")
        .select(
          `
          id, patient_id, start_at, end_at, status, location, clinic_site, domicile_address, amount, price_type, treatment_type,
          patients:patient_id ( first_name, last_name, phone, status )
        `
        )
        .gte("start_at", start.toISOString())
        .lt("start_at", end.toISOString())
        .order("start_at", { ascending: true });
      if (error) throw new Error(error.message);
      setAppointments((data || []) as AppointmentRow[]);
    } catch (e: any) {
      setErr(e?.message || "Errore nel caricamento dati.");
    } finally {
      setLoading(false);
    }
  }, [lastWeekStart, thisWeekEnd]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);


  const fetchInactivePatients = useCallback(async () => {
    try {
      setInactiveLoading(true);
      const { data, error } = await supabase
        .from("appointments")
        .select(
          `
          patient_id,
          start_at,
          status,
          patients:patient_id!inner ( first_name, last_name, phone, status, owner_id )
        `
        )
        .eq("status", "done")
        .order("start_at", { ascending: false })
        .limit(2000);

      if (error) throw new Error(error.message);

      const rows = (data || []) as any[];
      const byPatient = new Map<string, any>();

      for (const r of rows) {
        const pid = r.patient_id as string;
        if (!pid) continue;
        if (!byPatient.has(pid)) byPatient.set(pid, r);
      }

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const nowMs = now.getTime();

      const list: InactivePatientRow[] = [];
      for (const [pid, r] of byPatient.entries()) {
        const p = pickPatient(r.patients);
        const lastDoneAt = r.start_at as string;
        const lastMs = new Date(lastDoneAt).getTime();
        const days = Math.floor((nowMs - lastMs) / 86400000);

        // se il paziente è marcato inactive, non lo considero (evita falsi positivi)
        const patientStatus = (p?.status || "").toString().toLowerCase();
        if (patientStatus === "inactive") continue;

        if (days > inactiveThreshold) {
          list.push({
            patient_id: pid,
            first_name: (p?.first_name || "").toString(),
            last_name: (p?.last_name || "").toString(),
            phone: p?.phone ?? null,
            last_done_at: lastDoneAt,
            days_since_last: days,
          });
        }
      }

      list.sort((a, b) => b.days_since_last - a.days_since_last);
      setInactivePatients(list.slice(0, 12)); // top 12 in home
    } catch (e: any) {
      // non blocco la home: se fallisce questa parte, la dashboard resta utilizzabile
      console.error("fetchInactivePatients error:", e?.message || e);
    } finally {
      setInactiveLoading(false);
    }
  }, [inactiveThreshold]);

  useEffect(() => {
    fetchInactivePatients();
  }, [fetchInactivePatients]);


  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return appointments;
    return appointments.filter((a) => patientDisplayName(a.patients).toLowerCase().includes(q));
  }, [appointments, debouncedQuery]);

  const todayAppointments = useMemo(
    () => filtered.filter((a) => isSameDay(new Date(a.start_at), today)),
    [filtered, today]
  );

  const domicilesToday = useMemo(
    () => todayAppointments.filter((a) => a.location === "domicile"),
    [todayAppointments]
  );
  const next7Appointments = useMemo(() => {
    const start = startOfDay(new Date());
    const end = addDays(start, 8);
    return filtered.filter((a) => {
      const d = new Date(a.start_at);
      return d >= start && d < end && !isSameDay(d, today);
    });
  }, [filtered, today]);
  const thisWeekAppointments = useMemo(
    () =>
      filtered.filter((a) => {
        const d = new Date(a.start_at);
        return d >= thisWeekStart && d < thisWeekEnd;
      }),
    [filtered, thisWeekStart, thisWeekEnd]
  );

  const focusNext = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== "cancelled" && new Date(a.start_at).getTime() >= Date.now())
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0] || null,
    [appointments]
  );

  const tomorrowAppointments = useMemo(
    () => appointments.filter((a) => isSameDay(new Date(a.start_at), tomorrow) && a.status !== "cancelled"),
    [appointments, tomorrow]
  );
  const remindersToSend = useMemo(
    () => tomorrowAppointments.filter((a) => !sentMap[a.id]).slice(0, 5),
    [tomorrowAppointments, sentMap]
  );

  const todayKPIs = useMemo(() => {
    const total = todayAppointments.length;
    const confirmed = todayAppointments.filter((a) => a.status === "confirmed").length;
    const expected = sumAmount(todayAppointments.filter((a) => a.status !== "cancelled"));
    const yesterdayAppointments = appointments.filter((a) => isSameDay(new Date(a.start_at), yesterday));
    const yesterdayTotal = yesterdayAppointments.length;
    const yesterdayConfirmed = yesterdayAppointments.filter((a) => a.status === "confirmed").length;
    const yesterdayExpected = sumAmount(yesterdayAppointments.filter((a) => a.status !== "cancelled"));
    return {
      total,
      confirmed,
      expected,
      deltaTotal: pctDelta(total, yesterdayTotal),
      deltaConfirmed: pctDelta(confirmed, yesterdayConfirmed),
      deltaExpected: pctDelta(expected, yesterdayExpected),
    };
  }, [todayAppointments, appointments, yesterday]);

  const recentPatients = useMemo(() => {
    const unique = new Map<string, AppointmentRow>();
    appointments.forEach((a) => {
      if (!unique.has(a.patient_id) || new Date(a.start_at) > new Date(unique.get(a.patient_id)!.start_at)) {
        unique.set(a.patient_id, a);
      }
    });
    return Array.from(unique.values())
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
      .slice(0, 3);
  }, [appointments]);

  // Appuntamenti di oggi dopo il prossimo (per la sidebar)
  const remainingTodayAppointments = useMemo(() => {
    if (!focusNext) return todayAppointments;
    return todayAppointments
      .filter((a) => a.id !== focusNext.id && new Date(a.start_at).getTime() > new Date(focusNext.start_at).getTime())
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .slice(0, 5); // limitiamo a 5 per non appesantire
  }, [todayAppointments, focusNext]);

  const weekStats = useMemo(() => {
    const thisW = appointments.filter((a) => {
      const d = new Date(a.start_at);
      return d >= thisWeekStart && d < thisWeekEnd;
    });
    const lastW = appointments.filter((a) => {
      const d = new Date(a.start_at);
      return d >= lastWeekStart && d < lastWeekEnd;
    });
    return {
      this: {
        done: thisW.filter((a) => a.status === "done").length,
        notPaid: thisW.filter((a) => a.status === "not_paid").length,
        expected: sumAmount(thisW.filter((a) => a.status !== "cancelled")),
      },
      last: {
        done: lastW.filter((a) => a.status === "done").length,
        notPaid: lastW.filter((a) => a.status === "not_paid").length,
        expected: sumAmount(lastW.filter((a) => a.status !== "cancelled")),
      },
    };
  }, [appointments, thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd]);

  const weeklyChartData = useMemo(() => {
    const thisWeekCounts = new Array(7).fill(0);
    const lastWeekCounts = new Array(7).fill(0);
    appointments.forEach((a) => {
      const d = new Date(a.start_at);
      const dayIndex = (d.getDay() + 6) % 7;
      if (d >= thisWeekStart && d < thisWeekEnd) {
        thisWeekCounts[dayIndex] += 1;
      } else if (d >= lastWeekStart && d < lastWeekEnd) {
        lastWeekCounts[dayIndex] += 1;
      }
    });
    return { thisWeekCounts, lastWeekCounts };
  }, [appointments, thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd]);

  const groupByDay = (appts: AppointmentRow[]) => {
    const map = new Map<string, { dayKey: string; date: Date; items: AppointmentRow[] }>();
    for (const a of appts) {
      const d = startOfDay(new Date(a.start_at));
      const key = d.toISOString().slice(0, 10);
      const existing = map.get(key);
      if (existing) existing.items.push(a);
      else map.set(key, { dayKey: key, date: d, items: [a] });
    }
    return Array.from(map.values()).sort((x, y) => x.date.getTime() - y.date.getTime());
  };
  const thisBuckets = useMemo(() => groupByDay(thisWeekAppointments), [thisWeekAppointments]);
  const todayBuckets = useMemo(() => groupByDay(todayAppointments), [todayAppointments]);
  const next7Buckets = useMemo(() => groupByDay(next7Appointments), [next7Appointments]);

  const headerDate = useMemo(
    () =>
      new Date().toLocaleDateString("it-IT", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    []
  );

  const activeBuckets = tab === "today" ? todayBuckets : tab === "next7" ? next7Buckets : thisBuckets;

  // Handlers per azioni sul prossimo appuntamento
  const handleMarkDone = async (id: string) => {
    const { error } = await supabase
      .from("appointments")
      .update({ status: "done" })
      .eq("id", id);
    if (error) {
      alert("Errore nell'aggiornamento: " + error.message);
    } else {
      fetchAppointments();
    }
  };

  const handleCancel = async (id: string) => {
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      alert("Errore nell'annullamento: " + error.message);
    } else {
      fetchAppointments();
    }
  };

  return (
    <>
      <style jsx global>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          background: ${theme.background};
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.5;
          color: ${theme.gray[900]};
        }
        .page {
          min-height: 100vh;
          padding: 24px;
          background: radial-gradient(circle at 10% 30%, rgba(37,99,235,0.02) 0%, transparent 30%),
                      radial-gradient(circle at 90% 70%, rgba(13,148,136,0.02) 0%, transparent 30%),
                      ${theme.background};
        }
        @media (max-width: 640px) {
          .page { padding: 16px; }
        }
        .gridMain {
          display: grid;
          grid-template-columns: 1.15fr 1.7fr 1.15fr;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 1200px) {
          .gridMain { grid-template-columns: 1fr; }
        }

        a {
          text-decoration: none;
        }
      `}</style>

      <div className="page">
        {/* Header con brand e azioni (invariato) */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            padding: "16px 24px",
            background: "rgba(255,255,255,0.75)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.8)",
            borderRadius: "40px",
            boxShadow: theme.shadow,
            marginBottom: "24px",
            flexWrap: "wrap",
          }}
        >
          {/* ... contenuto header invariato ... */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "16px",
                background: "linear-gradient(135deg, #2563eb, #0d9488)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "1.4rem",
                fontWeight: 700,
                boxShadow: "0 8px 16px rgba(37,99,235,0.2)",
              }}
            >
              FH
            </div>
            <div>
              <h1 style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
                FisioHub
              </h1>
              <p style={{ fontSize: "0.75rem", color: theme.gray[500], margin: 0 }}>
                {headerDate} • Buon lavoro!
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                background: "white",
                borderRadius: "40px",
                border: "1px solid rgba(0,0,0,0.04)",
                boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
              }}
            >
              <span style={{ color: theme.gray[400] }}>🔎</span>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cerca paziente..."
                style={{
                  border: "none",
                  background: "transparent",
                  outline: "none",
                  fontSize: "0.9rem",
                  minWidth: "180px",
                }}
              />
            </div>

            

            <Link
              href="/patients/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: theme.secondary,
                color: "white",
                padding: "10px 20px",
                borderRadius: "40px",
                fontWeight: 600,
                fontSize: "0.9rem",
                textDecoration: "none",
                border: "none",
                boxShadow: `0 8px 16px ${theme.secondary}40`,
                transition: "all 0.2s",
              }}
            >
              ➕ Nuovo paz.
            </Link>

            <Link href="/calendar" style={headerIconButton}>📅</Link>
            <Link href="/patients" style={headerIconButton}>👥</Link>
            <button onClick={() => router.refresh()} style={headerIconButton} title="Aggiorna">↻</button>

            {/* User menu (Account / Logout) */}
            <div data-user-menu="wrap" style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                title="Account"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  background: "white",
                  borderRadius: "999px",
                  border: "1px solid rgba(0,0,0,0.06)",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    fontSize: 12,
                    letterSpacing: "0.06em",
                    color: "white",
                    background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                  }}
                >
                  {userInitials}
                </span>
                <span style={{ fontSize: "0.9rem", fontWeight: 700, color: theme.gray[800] }}>
                  {userEmail ? (userEmail.split("@")[0] || "Account") : "Account"}
                </span>
                <span style={{ color: theme.gray[400], fontSize: 12, marginLeft: 2 }}>▾</span>
              </button>

              {userMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 10px)",
                    minWidth: 220,
                    background: "white",
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 16,
                    boxShadow: "0 16px 40px rgba(0,0,0,0.10)",
                    overflow: "hidden",
                    zIndex: 50,
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      color: theme.gray[500],
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      background: theme.gray[50],
                    }}
                  >
                    {userEmail || "Sessione attiva"}
                  </div>

                  <Link
                    href="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 12px",
                      textDecoration: "none",
                      color: theme.gray[800],
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    ⚙️ Impostazioni
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 12px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: theme.danger,
                      fontWeight: 800,
                      fontSize: 14,
                      textAlign: "left",
                    }}
                  >
                    ⏻ Logout
                  </button>
                </div>
              )}
            </div>

          </div>
        </header>

        {/* KPI Oggi con delta (invariato) */}
        {!loading && !err && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "20px",
              marginBottom: "24px",
            }}
          >
            <KPICard
              icon="📅"
              label="Appuntamenti oggi"
              value={todayKPIs.total}
              delta={todayKPIs.deltaTotal}
              unit=""
            />
            <KPICard
              icon="✅"
              label="Confermati"
              value={todayKPIs.confirmed}
              delta={todayKPIs.deltaConfirmed}
              unit=""
            />
            <KPICard
              icon="💰"
              label="Incasso atteso"
              value={todayKPIs.expected}
              delta={todayKPIs.deltaExpected}
              unit="€"
              isCurrency
            />
          </div>
        )}

                {/* Layout principale (3 colonne) */}
        <div className="gridMain">
          {/* Sinistra: Command Center */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <NextAppointmentEnhanced appointment={focusNext} onMarkDone={handleMarkDone} onCancel={handleCancel} />

            {/* Oggi – prossimi */}
            {remainingTodayAppointments.length > 0 && (
              <div style={cardStyle}>
                <div style={cardHeadStyle}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>⏳ Oggi – prossimi</span>
                  <span style={chipStyle}>{remainingTodayAppointments.length}</span>
                </div>
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {remainingTodayAppointments.slice(0, 6).map((a) => (
                    <CompactAppointmentRow key={a.id} a={a} />
                  ))}
                  {remainingTodayAppointments.length > 6 && (
                    <Link href="/calendar" style={{ ...buttonGhostCompact, justifyContent: "center", marginTop: 6 }}>
                      Vedi tutti in calendario →
                    </Link>
                  )}
                </div>
              </div>
            )}


            {/* Domiciliari di oggi */}
            <div style={cardStyle}>
              <div style={cardHeadStyle}>
                <div>
                  <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>🏠 Domiciliari oggi</h2>
                  <p style={{ fontSize: "0.75rem", color: theme.gray[500], margin: "4px 0 0" }}>
                    {domicilesToday.length === 0 ? "Nessun domicilio oggi" : `${domicilesToday.length} programmati`}
                  </p>
                </div>
                <Link href="/calendar" style={buttonGhostCompact}>
                  📅 Calendario
                </Link>
              </div>
              <div style={{ padding: "16px" }}>
                {loading ? (
                  <Skeleton height={90} />
                ) : domicilesToday.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 18, color: theme.gray[500] }}>
                    <span style={{ fontSize: "2.2rem" }}>✅</span>
                    <p style={{ marginTop: 8, marginBottom: 0 }}>Zero spostamenti: oggi vinci tu.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {domicilesToday.slice(0, 4).map((a) => (
                      <div
                        key={a.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "10px 12px",
                          background: theme.gray[50],
                          border: `1px solid ${theme.gray[200]}`,
                          borderRadius: 18,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <Link
                            href={`/patients/${a.patient_id}`}
                            style={{
                              fontWeight: 800,
                              fontSize: "0.85rem",
                              color: theme.gray[900],
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "block",
                            }}
                          >
                            {patientDisplayName(a.patients)}
                          </Link>
                          <div style={{ fontSize: "0.68rem", color: theme.gray[500] }}>
                            {fmtTime(a.start_at)} • {a.domicile_address || "Domicilio"}
                          </div>
                        </div>
                        <Link href={`/patients/${a.patient_id}`} style={{ fontSize: "0.7rem", color: theme.primary, fontWeight: 700, whiteSpace: "nowrap" }}>
                          Scheda →
                        </Link>
                      </div>
                    ))}
                    {domicilesToday.length > 4 && (
                      <Link href="/calendar" style={{ ...buttonGhostCompact, justifyContent: "center", marginTop: 6 }}>
                        Vedi tutti i domiciliari →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Domani – Promemoria WhatsApp */}
            <div style={cardStyle}>
              <div style={cardHeadStyle}>
                <div>
                  <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>⏰ Domani</h2>
                  <p style={{ fontSize: "0.75rem", color: theme.gray[500], margin: "4px 0 0" }}>
                    {remindersToSend.length} da inviare • {tomorrowAppointments.length - remindersToSend.length} inviati
                  </p>
                </div>
                <Link href="/settings" style={buttonGhostCompact} title="Template e impostazioni WhatsApp">
                  ⚙️ Template
                </Link>
              </div>
              <div style={{ padding: "20px" }}>
                {loading ? (
                  <Skeleton height={120} />
                ) : remindersToSend.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 20, color: theme.gray[500] }}>
                    <span style={{ fontSize: "2.5rem" }}>✅</span>
                    <p style={{ marginTop: 8 }}>Tutti i promemoria sono stati inviati.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {remindersToSend.map((a) => (
                      <div
                        key={a.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: theme.warningLight,
                          borderRadius: 18,
                          border: "1px solid #fed7aa",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <Link
                            href={`/patients/${a.patient_id}`}
                            style={{
                              fontWeight: 800,
                              fontSize: "0.85rem",
                              color: theme.gray[900],
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "block",
                            }}
                          >
                            {patientDisplayName(a.patients)}
                          </Link>
                          <div style={{ fontSize: "0.65rem", color: theme.warning }}>
                            {fmtTime(a.start_at)} • {a.location === "studio" ? a.clinic_site || "Studio" : "Domicilio"}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={sentMap[a.id] || false}
                            onChange={(e) => setSent(a.id, e.target.checked)}
                            style={{ width: 16, height: 16, cursor: "pointer", accentColor: theme.secondary }}
                            title="Segna come inviato"
                          />
                          <button
                            style={buttonWACompact}
                            onClick={() => {
                              const msg = buildWhatsAppMessage(a);
                              openWhatsApp(pickPatient(a.patients)?.phone || "", msg);
                              setSent(a.id, true);
                            }}
                            title="Invia WhatsApp"
                          >
                            💬
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Shortcut rapidi */}
            <div style={cardStyle}>
              <div style={cardHeadStyle}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>⚡ Shortcut</h2>
              </div>
              <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Link href="/calendar" style={{ ...buttonGhostStyle, justifyContent: "center" }}>
                  📅 Calendario
                </Link>
                <Link href="/patients" style={{ ...buttonGhostStyle, justifyContent: "center" }}>
                  👥 Pazienti
                </Link>
                <Link href="/reports" style={{ ...buttonGhostStyle, justifyContent: "center" }}>
                  📈 Report
                </Link>
                <Link href="/settings" style={{ ...buttonGhostStyle, justifyContent: "center" }}>
                  ⚙️ Impostazioni
                </Link>
              </div>
            </div>
          </div>

          {/* Centro: Agenda (focus operativo) */}
          <div>
            <div style={cardStyle}>
              <div style={cardHeadStyle}>
                <div>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>📆 Agenda</h2>
                  <p style={{ fontSize: "0.75rem", color: theme.gray[500], margin: "4px 0 0" }}>
                    {tab === "today" ? "Oggi" : tab === "next7" ? "Prossimi 7 giorni" : "Questa settimana"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "6px", background: theme.gray[100], padding: "4px", borderRadius: "40px" }}>
                  {[
                    { key: "today", label: "Oggi" },
                    { key: "next7", label: "7gg" },
                    { key: "thisWeek", label: "Sett." },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key as any)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "40px",
                        border: "none",
                        background: tab === t.key ? "white" : "transparent",
                        color: tab === t.key ? theme.gray[900] : theme.gray[500],
                        fontWeight: 700,
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        boxShadow: tab === t.key ? "0 4px 8px rgba(0,0,0,0.02)" : "none",
                        transition: "all 0.2s",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: "16px" }}>
                {loading ? (
                  <AgendaSkeleton />
                ) : err ? (
                  <div style={{ color: theme.danger, padding: 20, textAlign: "center" }}>❌ {err}</div>
                ) : activeBuckets.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: theme.gray[500] }}>
                    <span style={{ fontSize: "3rem" }}>📭</span>
                    <p style={{ marginTop: 12, fontWeight: 600 }}>Nessun appuntamento da mostrare.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {activeBuckets.map((b) => (
                      <Bucket key={b.dayKey} bucket={b} sentMap={sentMap} onToggleSent={setSent} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Destra: Insight & contesto */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div style={cardStyle}>
              <div style={cardHeadStyle}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>📊 Settimana</h2>
              </div>
              <div style={{ padding: "20px" }}>
                {loading ? (
                  <Skeleton height={160} />
                ) : (
                  <>
                    <WeeklyChart thisWeek={weeklyChartData.thisWeekCounts} lastWeek={weeklyChartData.lastWeekCounts} />
                    <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                      <StatRow label="Sedute fatte" curr={weekStats.this.done} prev={weekStats.last.done} hint={`${weekStats.this.done} vs ${weekStats.last.done}`} />
                      <StatRow label="Non pagati" curr={weekStats.this.notPaid} prev={weekStats.last.notPaid} hint={`${weekStats.this.notPaid} vs ${weekStats.last.notPaid}`} warn />
                      <StatRow label="Totale atteso" curr={weekStats.this.expected} prev={weekStats.last.expected} hint={`${money(weekStats.this.expected)} vs ${money(weekStats.last.expected)}`} money />
                    </div>
                  </>
                )}
              </div>
            </div>


            {/* Pazienti da ricontattare */}
            <div style={cardStyle}>
              <div style={cardHeadStyle}>
                <div>
                  <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>📣 Pazienti da ricontattare</h2>
                  <p style={{ fontSize: "0.75rem", color: theme.gray[500], margin: "4px 0 0" }}>
                    Assenti da più di {inactiveThreshold} giorni • Top {Math.min(inactivePatients.length, 12)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, background: theme.gray[100], padding: 4, borderRadius: 999 }}>
                  {[30, 45, 60].map((d) => (
                    <button
                      key={d}
                      onClick={() => setInactiveThreshold(d as 30 | 45 | 60)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 999,
                        border: "none",
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: "0.75rem",
                        background: inactiveThreshold === d ? "white" : "transparent",
                        color: inactiveThreshold === d ? theme.gray[900] : theme.gray[500],
                        boxShadow: inactiveThreshold === d ? "0 4px 8px rgba(0,0,0,0.02)" : "none",
                      }}
                      title={`Mostra pazienti assenti da più di ${d} giorni`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: "16px" }}>
                {inactiveLoading ? (
                  <Skeleton height={140} />
                ) : inactivePatients.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 22, color: theme.gray[500] }}>
                    <span style={{ fontSize: "2.4rem" }}>🧘</span>
                    <p style={{ marginTop: 10, marginBottom: 0 }}>Nessun paziente da rincorrere (per questa soglia).</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {inactivePatients.map((p) => (
                      <div
                        key={p.patient_id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "10px 12px",
                          background: theme.warningLight,
                          borderRadius: 18,
                          border: "1px solid #fed7aa",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <Link
                            href={`/patients/${p.patient_id}`}
                            style={{
                              fontWeight: 900,
                              fontSize: "0.85rem",
                              color: theme.gray[900],
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "block",
                            }}
                          >
                            {(p.last_name + " " + p.first_name).trim() || "Paziente"}
                          </Link>
                          <div style={{ fontSize: "0.68rem", color: theme.warning }}>
                            Ultima seduta: {fmtDate(p.last_done_at)} • {p.days_since_last} giorni fa
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            onClick={() =>
                              openWhatsApp(
                                p.phone || "",
                                `Ciao ${p.first_name || ""}, come stai? Ti scrivo per sapere come va e se vuoi prenotare una seduta di controllo.`
                              )
                            }
                            style={{
                              border: "none",
                              borderRadius: 14,
                              padding: "8px 10px",
                              background: "#16a34a",
                              color: "white",
                              fontWeight: 900,
                              cursor: "pointer",
                              fontSize: "0.75rem",
                              whiteSpace: "nowrap",
                            }}
                            title="Invia WhatsApp"
                          >
                            WhatsApp
                          </button>
                          <Link href={`/patients/${p.patient_id}`} style={{ fontSize: "0.75rem", color: theme.primary, fontWeight: 900, whiteSpace: "nowrap" }}>
                            Scheda →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={cardHeadStyle}>
                <h2 style={{ fontSize: "1.05rem", fontWeight: 800, margin: 0 }}>🕘 Pazienti recenti</h2>
              </div>
              <div style={{ padding: "20px" }}>
                {loading ? (
                  <Skeleton height={120} />
                ) : recentPatients.length === 0 ? (
                  <div style={{ color: theme.gray[500], textAlign: "center", padding: 20 }}>Nessun paziente</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {recentPatients.map((a) => (
                      <div key={a.patient_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar name={patientDisplayName(a.patients)} patientId={a.patient_id} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Link
                            href={`/patients/${a.patient_id}`}
                            style={{
                              fontWeight: 800,
                              fontSize: "0.85rem",
                              color: theme.gray[900],
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "block",
                            }}
                          >
                            {patientDisplayName(a.patients)}
                          </Link>
                          <div style={{ fontSize: "0.65rem", color: theme.gray[500] }}>Ultima visita: {fmtDate(a.start_at)}</div>
                        </div>
                        <Link href={`/patients/${a.patient_id}`} style={{ fontSize: "0.7rem", color: theme.primary, fontWeight: 700 }}>
                          Scheda →
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <MiniCalendar appointments={appointments} />
          </div>
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// COMPONENTI DI SUPPORTO (invariati o leggermente adattati)
// -----------------------------------------------------------------------------

const KPICard = ({
  icon,
  label,
  value,
  delta,
  unit,
  isCurrency,
}: {
  icon: string;
  label: string;
  value: number;
  delta: number;
  unit: string;
  isCurrency?: boolean;
}) => {
  const displayValue = isCurrency ? money(value) : `${value}${unit}`;
  const deltaAbs = Math.abs(Math.round(delta));
  const deltaSign = delta > 0 ? "↑" : delta < 0 ? "↓" : "•";
  const deltaColor = delta > 0 ? theme.success : delta < 0 ? theme.danger : theme.gray[500];
  return (
    <div
      style={{
        background: "white",
        borderRadius: 28,
        padding: "18px 20px",
        boxShadow: theme.shadow,
        border: "1px solid rgba(0,0,0,0.02)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: "1.8rem", background: theme.primaryLight, padding: 10, borderRadius: 18, lineHeight: 1 }}>{icon}</span>
        <div>
          <p style={{ fontSize: "0.7rem", color: theme.gray[500], margin: 0, fontWeight: 600 }}>{label}</p>
          <p style={{ fontSize: "1.6rem", fontWeight: 800, margin: 0, lineHeight: 1.2, color: theme.gray[800] }}>{displayValue}</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, background: theme.gray[100], padding: "6px 10px", borderRadius: 40 }}>
        <span style={{ color: deltaColor, fontWeight: 700 }}>{deltaSign}</span>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: deltaColor }}>{deltaAbs}%</span>
        <span style={{ fontSize: "0.6rem", color: theme.gray[500] }}>vs ieri</span>
      </div>
    </div>
  );
};

const Bucket = ({
  bucket,
  sentMap,
  onToggleSent,
}: {
  bucket: { dayKey: string; date: Date; items: AppointmentRow[] };
  sentMap: Record<string, boolean>;
  onToggleSent: (id: string, v: boolean) => void;
}) => {
  const rel = formatDateRelative(bucket.date);
  const dayLabel = `${fmtWeekday(bucket.date)} • ${bucket.date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
  })}`;
  return (
    <div style={{ border: "1px solid rgba(0,0,0,0.04)", borderRadius: 20, overflow: "hidden", background: "white" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: theme.gray[50],
          borderBottom: "1px solid rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: "0.75rem", color: theme.primary }}>{rel}</span>
          <span style={{ color: theme.gray[500], fontSize: "0.65rem" }}>{dayLabel}</span>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "white",
            border: "1px solid rgba(0,0,0,0.04)",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: theme.gray[700],
          }}
        >
          {bucket.items.length}
        </span>
      </div>
      <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {bucket.items.map((a) => (
          <AppointmentRowItem
            key={a.id}
            a={a}
            waSent={!!sentMap[a.id]}
            onToggleSent={(v) => onToggleSent(a.id, v)}
          />
        ))}
      </div>
    </div>
  );
};

const AppointmentRowItem = ({
  a,
  waSent,
  onToggleSent,
}: {
  a: AppointmentRow;
  waSent: boolean;
  onToggleSent: (v: boolean) => void;
}) => {
  const name = patientDisplayName(a.patients);
  const phone = pickPatient(a.patients)?.phone || "";
  const when = `${fmtTime(a.start_at)} • ${fmtDate(a.start_at)}`;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: 10,
        borderRadius: 16,
        background: "white",
        border: "1px solid rgba(0,0,0,0.02)",
        transition: "all 0.2s",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0, flex: 1 }}>
        <Avatar name={name} patientId={a.patient_id} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Link
              href={`/patients/${a.patient_id}`}
              style={{ fontWeight: 700, fontSize: "0.85rem", color: theme.gray[900], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {name}
            </Link>
            <StatusPill status={a.status} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={chipStyle}>⏱️ {when}</span>
            <span style={chipStyle}>📍 {a.location === "studio" ? a.clinic_site || "Studio" : "Domicilio"}</span>
            <span style={chipStyle}>🧾 {typeof a.amount === "string" ? a.amount : a.amount ?? 0}€</span>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.65rem", cursor: "pointer", color: waSent ? theme.success : theme.gray[500] }}>
              <input
                type="checkbox"
                checked={waSent}
                onChange={(e) => onToggleSent(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: theme.secondary }}
              />
              <span style={{ fontWeight: 600 }}>WA</span>
            </label>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Link href={`/patients/${a.patient_id}`} style={buttonGhostCompact}>Scheda</Link>
        <button
          style={buttonWACompact}
          onClick={() => {
            const msg = buildWhatsAppMessage(a);
            openWhatsApp(phone, msg);
            onToggleSent(true);
          }}
          title="Invia WhatsApp"
        >
          💬
        </button>
      </div>
    </div>
  );
};

const StatRow = ({
  label,
  curr,
  prev,
  hint,
  money: moneyMode,
  warn,
}: {
  label: string;
  curr: number;
  prev: number;
  hint: string;
  money?: boolean;
  warn?: boolean;
}) => {
  const d = prev === 0 ? (curr === 0 ? 0 : 100) : ((curr - prev) / prev) * 100;
  const dir = curr === prev ? "flat" : curr > prev ? "up" : "down";
  const shown = Number.isFinite(d) ? Math.round(d) : 0;
  const value = moneyMode ? money(curr) : String(curr);
  const deltaText = dir === "flat" ? "0%" : `${shown > 0 ? "+" : ""}${shown}%`;

  let deltaBg = theme.gray[100];
  let deltaFg = theme.gray[600];
  if (dir === "up") {
    deltaBg = warn ? theme.warningLight : theme.successLight;
    deltaFg = warn ? theme.warning : theme.success;
  } else if (dir === "down") {
    deltaBg = warn ? theme.successLight : theme.dangerLight;
    deltaFg = warn ? theme.success : theme.danger;
  }

  return (
    <div style={statRowStyle}>
      <div>
        <div style={{ fontWeight: 650, fontSize: "0.8rem" }}>{label}</div>
        <div style={{ fontSize: "0.6rem", color: theme.gray[500] }}>{hint}</div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{value}</span>
        <span
          style={{
            fontSize: "0.65rem",
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 30,
            background: deltaBg,
            color: deltaFg,
          }}
        >
          {deltaText}
        </span>
      </div>
    </div>
  );
};

const AgendaSkeleton = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {[1, 2, 3].map((i) => (
      <div key={i}>
        <Skeleton height={20} width="30%" style={{ marginBottom: 10 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={70} />
          <Skeleton height={70} />
        </div>
      </div>
    ))}
  </div>
);

// -----------------------------------------------------------------------------
// STILI CONDIVISI
// -----------------------------------------------------------------------------
const cardStyle = {
  background: "rgba(255,255,255,0.9)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.8)",
  boxShadow: theme.shadow,
  overflow: "hidden",
};

const cardHeadStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 20px 12px",
  borderBottom: "1px solid rgba(0,0,0,0.02)",
};

const chipStyle = {
  padding: "2px 8px",
  borderRadius: 20,
  background: theme.gray[50],
  border: "1px solid rgba(0,0,0,0.02)",
  fontSize: "0.6rem",
  fontWeight: 600,
  color: theme.gray[700],
  whiteSpace: "nowrap" as const,
};

const buttonGhostStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 14px",
  borderRadius: 30,
  background: "white",
  border: "1px solid rgba(0,0,0,0.04)",
  fontSize: "0.7rem",
  fontWeight: 600,
  color: theme.gray[700],
  textDecoration: "none",
  cursor: "pointer",
  transition: "background 0.2s",
};

const buttonWAStyle = {
  ...buttonGhostStyle,
  background: theme.secondaryLight,
  borderColor: "#99f6e4",
  color: theme.secondary,
};

const buttonGhostCompact = {
  ...buttonGhostStyle,
  padding: "4px 12px",
  fontSize: "0.65rem",
};

const buttonWACompact = {
  ...buttonWAStyle,
  padding: "4px 10px",
  fontSize: "0.7rem",
};

const buttonPrimaryStyle = {
  ...buttonGhostStyle,
  background: theme.primary,
  borderColor: theme.primary,
  color: "white",
  fontWeight: 600,
};

const buttonSuccessStyle = {
  ...buttonGhostStyle,
  background: theme.success,
  borderColor: theme.success,
  color: "white",
};

const buttonDangerGhostStyle = {
  ...buttonGhostStyle,
  borderColor: theme.danger,
  color: theme.danger,
};

const headerIconButton = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: "50%",
  background: "white",
  border: "1px solid rgba(0,0,0,0.02)",
  fontSize: "1.2rem",
  textDecoration: "none",
  color: theme.gray[700],
  boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
  transition: "all 0.2s",
};

const statRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  background: theme.gray[50],
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.02)",
};

const sumAmount = (rows: AppointmentRow[]) =>
  rows.reduce((sum, r) => {
    const n = typeof r.amount === "string" ? Number(r.amount) : r.amount;
    return sum + (Number.isFinite(n as number) ? (n as number) : 0);
  }, 0);

const pctDelta = (curr: number, prev: number) => {
  if (prev === 0 && curr === 0) return 0;
  if (prev === 0) return 100;
  return ((curr - prev) / prev) * 100;
};