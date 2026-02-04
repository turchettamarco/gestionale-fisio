'use client';

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { Menu, X, Home, Calendar, BarChart3, Users } from "lucide-react";

type Status = "booked" | "confirmed" | "done" | "cancelled" | "not_paid";
type LocationType = "studio" | "domicile";

type PatientLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone?: string | null;
};

type CalendarEvent = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string | null;

  start: Date;
  end: Date;

  status: Status;
  calendar_note: string | null;

  location: LocationType | null;
  clinic_site: string | null;
  domicile_address: string | null;

  amount: number | null;
  treatment_type: string | null;
  price_type: string | null;
};

type MessageTemplate = {
  id: string;
  name: string;
  template: string;
  is_default: boolean;
  created_at: string;
};

const THEME = {
  appBg: "#f1f5f9",
  panelBg: "#ffffff",
  panelSoft: "#f7f9fd",

  text: "#0f172a",
  muted: "#334155",

  border: "#cbd5e1",
  borderSoft: "#94a3b8",

  blue: "#2563eb",
  blueDark: "#1e40af",
  green: "#16a34a",
  red: "#dc2626",
  amber: "#f97316",
  gray: "#64748b",
};

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

const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 22;
const DEFAULT_CLINIC_SITE = "Studio Pontecorvo";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function formatDMY(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function formatFullDate(d: Date) {
  const days = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
  const dayName = days[d.getDay()];
  return `${dayName} ${formatDMY(d)}`;
}

function formatRelativeDateLabel(d: Date, now: Date = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const base = formatDMY(d);
  if (diffDays === 0) return `Oggi ${base}`;
  if (diffDays === 1) return `Domani ${base}`;
  return base;
}

function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function toISODateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function parseTimeHHMM(t: string) {
  const [hh, mm] = t.split(":").map((x) => Number(x));
  return { hh: Number.isFinite(hh) ? hh : 0, mm: Number.isFinite(mm) ? mm : 0 };
}
function buildDateTime(dateISO: string, timeHHMM: string) {
  const base = new Date(`${dateISO}T00:00:00`);
  const { hh, mm } = parseTimeHHMM(timeHHMM);
  base.setHours(hh, mm, 0, 0);
  return base;
}
function normalizePhone(raw?: string | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits;
}
function isValidISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidHHMM(s: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function statusLabel(status: Status) {
  switch (status) {
    case "confirmed":
      return "Confermato";
    case "done":
      return "Eseguito";
    case "not_paid":
      return "Non pagata";
    case "cancelled":
      return "Annullato";
    default:
      return "Prenotato";
  }
}
function statusColor(status: Status) {
  switch (status) {
    case "done":
      return THEME.green;
    case "confirmed":
      return THEME.blue;
    case "not_paid":
      return THEME.amber;
    case "cancelled":
      return THEME.gray;
    case "booked":
    default:
      return THEME.red;
  }
}
function statusBg(status: Status) {
  switch (status) {
    case "done":
      return "#ecfdf5";
    case "confirmed":
      return "#eff6ff";
    case "not_paid":
      return "#fff7ed";
    case "cancelled":
      return "#f1f5f9";
    case "booked":
    default:
      return "#fff1f2";
  }
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Caricamento calendario…</div>}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showMenu, setShowMenu] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const timelineRef = useRef<HTMLDivElement | null>(null);

  // pointer dragging state (works with mouse and touch via Pointer Events)
  const pointerState = useRef<{
    draggingId: string | null;
    pointerId: number | null;
    startY: number;
    originalStart: number; // ms timestamp
  } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadAppointments = useCallback(async (date: Date) => {
    setLoading(true);
    setError("");

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from("appointments")
      .select(
        `
        id, patient_id, start_at, end_at, status, calendar_note,
        location, clinic_site, domicile_address,
        amount, treatment_type, price_type,
        patients:patient_id ( first_name, last_name, phone )
      `
      )
      .gte("start_at", startOfDay.toISOString())
      .lt("start_at", endOfDay.toISOString())
      .order("start_at", { ascending: true });

    if (error) {
      setError(`Errore caricamento: ${error.message}`);
      setLoading(false);
      return;
    }

    const mapped: CalendarEvent[] = (data ?? []).map((a: any) => {
      const p = Array.isArray(a.patients) ? a.patients[0] : a.patients;
      const name = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "Paziente";
      return {
        id: a.id,
        patient_id: a.patient_id ?? null,
        patient_name: name || "Paziente",
        patient_phone: p?.phone ?? null,
        start: new Date(a.start_at),
        end: new Date(a.end_at),
        status: (a.status ?? "booked") as Status,
        calendar_note: a.calendar_note ?? null,
        location: (a.location ?? null) as LocationType | null,
        clinic_site: a.clinic_site ?? null,
        domicile_address: a.domicile_address ?? null,
        amount: a.amount ?? null,
        treatment_type: a.treatment_type ?? null,
        price_type: a.price_type ?? null,
      };
    });

    setEvents(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAppointments(currentDate);
  }, [currentDate, loadAppointments]);

  const dayEvents = useMemo(() => events.filter((e) => isSameDay(e.start, currentDate)), [events, currentDate]);

  const dayStats = useMemo(() => {
    const total = dayEvents.length;
    const done = dayEvents.filter((e) => e.status === "done").length;
    const revenue = dayEvents.reduce((sum, e) => (e.status === "done" ? sum + (e.amount ?? 0) : sum), 0);
    return { total, done, revenue };
  }, [dayEvents]);

  const { dayStartHour, dayEndHour } = useMemo(() => {
    if (dayEvents.length === 0) return { dayStartHour: DEFAULT_START_HOUR, dayEndHour: DEFAULT_END_HOUR };

    const starts = dayEvents.map((e) => e.start.getHours());
    const ends = dayEvents.map((e) => e.end.getHours() + (e.end.getMinutes() > 0 ? 1 : 0));

    let start = Math.min(DEFAULT_START_HOUR, ...starts);
    let end = Math.max(DEFAULT_END_HOUR, ...ends);

    start = Math.max(0, Math.min(23, start));
    end = Math.max(start + 1, Math.min(24, end));

    return { dayStartHour: start, dayEndHour: end };
  }, [dayEvents]);

  const timeSlots = useMemo(() => {
    const slots: { label: string; hour: number; half: 0 | 30 }[] = [];
    for (let h = dayStartHour; h < dayEndHour; h++) {
      slots.push({ label: `${pad2(h)}:00`, hour: h, half: 0 });
    }
    return slots;
  }, [dayStartHour, dayEndHour]);

  const getEventPosition = useCallback(
    (start: Date, end: Date) => {
      const top = (start.getHours() - dayStartHour) * 60 + start.getMinutes();
      const height = (end.getHours() - start.getHours()) * 60 + (end.getMinutes() - start.getMinutes());
      return { top: Math.max(0, top), height: Math.max(44, height) };
    },
    [dayStartHour]
  );

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const roundTo = (n: number, step: number) => Math.round(n / step) * step;

  const moveAppointment = useCallback(
    async (appointmentId: string, newStart: Date) => {
      const ev = events.find((x) => x.id === appointmentId);
      if (!ev) return;

      const durMin = Math.max(15, Math.round((ev.end.getTime() - ev.start.getTime()) / 60000));
      const newEnd = new Date(newStart);
      newEnd.setMinutes(newEnd.getMinutes() + durMin);

      setBusy(true);
      setError("");

      // optimistic update
      setEvents((prev) => prev.map((x) => (x.id === appointmentId ? { ...x, start: newStart, end: newEnd } : x)));

      const { error } = await supabase.from("appointments").update({ start_at: newStart.toISOString(), end_at: newEnd.toISOString() }).eq("id", appointmentId);

    if (error) {
        setError(`Errore spostamento: ${error.message}`);
        await loadAppointments(currentDate);
        setBusy(false);
        return;
      }

      await loadAppointments(currentDate);
      setBusy(false);
    },
    [events, currentDate, loadAppointments]
  );

  // Pointer handlers: start, move, end
  const handlePointerStart = useCallback((e: PointerEvent, evId: string) => {
    const el = timelineRef.current;
    if (!el) return;

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const rect = el.getBoundingClientRect();
    const startY = e.clientY - rect.top;

    const ev = events.find((x) => x.id === evId);
    if (!ev) return;

    pointerState.current = {
      draggingId: evId,
      pointerId: e.pointerId,
      startY,
      originalStart: ev.start.getTime(),
    };
  }, [events]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const state = pointerState.current;
    const el = timelineRef.current;
    if (!state || !el) return;

    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const delta = y - state.startY;
    const deltaMin = Math.round(delta);
    const newStartTs = state.originalStart + deltaMin * 60000;

    const baseDay = new Date(currentDate);
    baseDay.setHours(dayStartHour, 0, 0, 0);
    const earliest = baseDay.getTime();
    const latest = baseDay.getTime() + (dayEndHour - dayStartHour) * 60 * 60000 - 5 * 60000;

    const clampedTs = clamp(newStartTs, earliest, latest);
    const newStart = new Date(clampedTs);

    setEvents((prev) => prev.map((ev) => (ev.id === state.draggingId ? { ...ev, start: newStart, end: new Date(newStart.getTime() + (ev.end.getTime() - ev.start.getTime())) } : ev)));
  }, [currentDate, dayStartHour, dayEndHour]);

  const handlePointerEnd = useCallback(async (e: PointerEvent) => {
    const state = pointerState.current;
    const el = timelineRef.current;
    if (!state || !el) {
      pointerState.current = null;
      return;
    }
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
    const ev = events.find((x) => x.id === state.draggingId);
    pointerState.current = null;
    if (!ev) return;

    const minutesFromStartOfDay = (ev.start.getHours() - dayStartHour) * 60 + ev.start.getMinutes();
    const roundedMinutes = roundTo(minutesFromStartOfDay, 5);
    const base = new Date(currentDate);
    base.setHours(dayStartHour, 0, 0, 0);
    const newStart = new Date(base.getTime() + roundedMinutes * 60000);

    await moveAppointment(ev.id, newStart);
  }, [events, dayStartHour, currentDate, moveAppointment]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => handlePointerMove(e);
    const onPointerUp = (e: PointerEvent) => handlePointerEnd(e);

    window.addEventListener("pointermove", onPointerMove as any);
    window.addEventListener("pointerup", onPointerUp as any);
    window.addEventListener("pointercancel", onPointerUp as any);

    return () => {
      window.removeEventListener("pointermove", onPointerMove as any);
      window.removeEventListener("pointerup", onPointerUp as any);
      window.removeEventListener("pointercancel", onPointerUp as any);
    };
  }, [handlePointerMove, handlePointerEnd]);

  const buildWhatsAppMessage = useCallback(
    (ev: CalendarEvent) => {
      const day = formatRelativeDateLabel(ev.start);
      const when = `${fmtTime(ev.start)}`;
      const where = ev.location === "domicile" ? "a domicilio" : "in studio";
      return `Ciao ${ev.patient_name}, promemoria appuntamento ${where} ${day} alle ${when}. Confermi?`;
    },
    []
  );

  const openEvent = useCallback((ev: CalendarEvent) => {
    alert(`Apri evento: ${ev.patient_name} ${fmtTime(ev.start)} - ${fmtTime(ev.end)}`);
  }, []);

  const renderEventCard = (ev: CalendarEvent) => {
    const { top, height } = getEventPosition(ev.start, ev.end);
    const bg = statusBg(ev.status);
    const col = statusColor(ev.status);
    const phoneOk = !!normalizePhone(ev.patient_phone);

    return (
      <div
        key={ev.id}
        onPointerDown={(e) => handlePointerStart(e, ev.id)}
        style={{
          position: "absolute",
          left: 60,
          right: 8,
          top,
          height,
          background: bg,
          border: `1px solid ${THEME.border}`,
          borderLeft: `6px solid ${col}`,
          borderRadius: 10,
          padding: "6px 8px",
          boxSizing: "border-box",
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          touchAction: "none",
          userSelect: "none",
          cursor: "grab",
          zIndex: 3,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 13, color: THEME.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.patient_name}</div>
          <div style={{ fontSize: 11, fontWeight: 900, color: THEME.muted, flexShrink: 0 }}>{fmtTime(ev.start)}-{fmtTime(ev.end)}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: col }} />
            <div style={{ fontSize: 11, fontWeight: 900, color: col, whiteSpace: "nowrap" }}>{statusLabel(ev.status)}</div>
            {ev.location === "domicile" && <div style={{ fontSize: 12, fontWeight: 900, color: THEME.amber, whiteSpace: "nowrap" }}>🏠</div>}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!phoneOk) return;
              const msg = buildWhatsAppMessage(ev);
              const phone = normalizePhone(ev.patient_phone);
              window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
            }}
            disabled={!phoneOk}
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border: `1px solid ${THEME.green}`,
              background: "#f0fdf4",
              color: THEME.green,
              fontSize: 11,
              fontWeight: 900,
              cursor: phoneOk ? "pointer" : "not-allowed",
              opacity: phoneOk ? 1 : 0.5,
              whiteSpace: "nowrap",
            }}
          >
            💬
          </button>
        </div>
      </div>
    );
  };

  const goPrev = useCallback(() => setCurrentDate((p) => addDays(p, -1)), []);
  const goNext = useCallback(() => setCurrentDate((p) => addDays(p, 1)), []);
  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  return (
    <div style={{ minHeight: "100vh", background: THEME.appBg, padding: 16, fontSize: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: THEME.text }}>{formatFullDate(currentDate)}</div>
        <Link href="/" style={{ color: THEME.blueDark, fontWeight: 900, textDecoration: "none", fontSize: 14 }}>
          ← Agenda
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: THEME.panelBg, padding: 12, borderRadius: 12, border: `1px solid ${THEME.border}` }}>
          <button onClick={goPrev} style={navBtnStyle()}>◀</button>
          <button onClick={goToday} style={todayBtnStyle()}>Oggi</button>
          <button onClick={goNext} style={navBtnStyle()}>▶</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <StatCard label="Totali" value={String(dayStats.total)} color={THEME.blueDark} />
          <StatCard label="Eseguiti" value={String(dayStats.done)} color={THEME.green} />
          <StatCard label="Incasso" value={`€${dayStats.revenue}`} color={THEME.blue} />
        </div>
      </div>

      <div style={{ position: "relative", background: THEME.panelBg, border: `1px solid ${THEME.border}`, borderRadius: 12, overflow: "hidden", minHeight: 520 }}>
        <div ref={timelineRef} style={{ position: "relative", height: `${(dayEndHour - dayStartHour) * 60}px` }}>
          {timeSlots.map((t, idx) => {
            const hour = t.hour;
            return (
              <div key={idx} style={{ height: 60, borderBottom: `1px solid ${THEME.border}`, position: "relative" }}>
                <div style={{ position: "absolute", left: 8, top: 0, padding: "4px 8px", fontSize: 12, fontWeight: 900, color: THEME.muted, background: THEME.panelBg, zIndex: 2 }}>{t.label}</div>
                <div onClick={() => alert("Crea ora")} style={{ position: "absolute", top: 0, left: 60, right: 8, height: 30, borderBottom: `1px solid ${THEME.borderSoft}`, cursor: "pointer" }} />
                <div onClick={() => alert("Crea ora")} style={{ position: "absolute", top: 30, left: 60, right: 8, height: 30, cursor: "pointer" }} />
              </div>
            );
          })}

          {dayEvents.map(renderEventCard)}

          {(() => {
            const now = currentTime;
            if (!isSameDay(now, currentDate)) return null;
            const top = (now.getHours() - dayStartHour) * 60 + now.getMinutes();
            const max = (dayEndHour - dayStartHour) * 60;
            if (top < 0 || top > max) return null;
            return <div style={{ position: "absolute", left: 0, right: 0, top, height: 2, background: THEME.red, zIndex: 4, pointerEvents: "none" }} />;
          })()}
        </div>
      </div>
    </div>
  );
}

function navBtnStyle() {
  return { padding: "10px 12px", borderRadius: 12, border: `1px solid ${THEME.border}`, background: THEME.panelSoft, fontWeight: 900, cursor: "pointer" } as const;
}
function todayBtnStyle() {
  return { padding: "10px 12px", borderRadius: 12, border: `1px solid ${THEME.blueDark}`, background: THEME.blue, color: "#fff", fontWeight: 900, cursor: "pointer" } as const;
}
function inputStyle() {
  return { width: "100%", padding: "10px 12px", borderRadius: 12, border: `1px solid ${THEME.border}`, outline: "none", background: "#fff", color: THEME.text, fontWeight: 800, fontSize: 14, boxSizing: "border-box" } as const;
}
function labelStyle() {
  return { fontSize: 12, color: THEME.muted, fontWeight: 900, marginBottom: 6 } as const;
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: THEME.panelBg, border: `1px solid ${THEME.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 12, color: THEME.muted, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}
